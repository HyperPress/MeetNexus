use std::{
    collections::{HashMap, HashSet},
    sync::{Arc, Mutex},
};

use axum::{
    Extension,
    extract::{
        Path, State,
        ws::{Message, WebSocket, WebSocketUpgrade},
    },
    http::HeaderMap,
    response::Response,
};
use serde::Serialize;
use tokio::sync::broadcast;
use uuid::Uuid;

use crate::{application::RoomRepository, domain::RoomMember};

use super::{ApiError, request_context::RequestContext, rooms::RoomApiState};

const EVENT_CHANNEL_CAPACITY: usize = 32;

#[derive(Clone, Default)]
pub struct RoomEventHub {
    rooms: Arc<Mutex<HashMap<Uuid, RoomEventState>>>,
}

struct RoomEventState {
    active_media_member_ids: HashSet<Uuid>,
    active_screen_member_ids: HashSet<Uuid>,
    sender: broadcast::Sender<RoomEvent>,
}

#[derive(Default)]
pub struct RoomMediaSnapshot {
    active_media_member_ids: Vec<Uuid>,
    active_screen_member_ids: Vec<Uuid>,
}

#[derive(Clone, Serialize)]
#[serde(tag = "event", rename_all = "snake_case")]
pub enum RoomEvent {
    MemberJoined { member: RoomMember },
    MemberLeft { member_id: Uuid },
    MediaStarted { member_id: Uuid },
    MediaStopped { member_id: Uuid },
    ScreenShareStarted { member_id: Uuid },
    ScreenShareStopped { member_id: Uuid },
    ResyncRequired,
}

impl RoomEventHub {
    pub fn publish(&self, room_id: Uuid, event: RoomEvent) {
        let sender = {
            let mut rooms = self.rooms.lock().expect("房间事件锁不应被毒化");
            let closes_existing_state = matches!(
                &event,
                RoomEvent::MemberLeft { .. }
                    | RoomEvent::MediaStopped { .. }
                    | RoomEvent::ScreenShareStopped { .. }
                    | RoomEvent::ResyncRequired
            );
            if closes_existing_state && !rooms.contains_key(&room_id) {
                return;
            }
            let room = rooms.entry(room_id).or_insert_with(new_room_event_state);
            match &event {
                RoomEvent::MediaStarted { member_id } => {
                    room.active_media_member_ids.insert(*member_id);
                }
                RoomEvent::MediaStopped { member_id } => {
                    room.active_media_member_ids.remove(member_id);
                }
                RoomEvent::ScreenShareStarted { member_id } => {
                    room.active_screen_member_ids.insert(*member_id);
                }
                RoomEvent::ScreenShareStopped { member_id } => {
                    room.active_screen_member_ids.remove(member_id);
                }
                RoomEvent::MemberLeft { member_id } => {
                    room.active_media_member_ids.remove(member_id);
                    room.active_screen_member_ids.remove(member_id);
                }
                RoomEvent::MemberJoined { .. } | RoomEvent::ResyncRequired => {}
            }
            room.sender.clone()
        };
        let _ = sender.send(event);
    }

    pub fn subscribe(&self, room_id: Uuid) -> (broadcast::Receiver<RoomEvent>, RoomMediaSnapshot) {
        let mut rooms = self.rooms.lock().expect("房间事件锁不应被毒化");
        let room = rooms.entry(room_id).or_insert_with(new_room_event_state);
        (
            room.sender.subscribe(),
            RoomMediaSnapshot {
                active_media_member_ids: room.active_media_member_ids.iter().copied().collect(),
                active_screen_member_ids: room.active_screen_member_ids.iter().copied().collect(),
            },
        )
    }

    pub fn close_room(&self, room_id: Uuid) {
        self.rooms
            .lock()
            .expect("房间事件锁不应被毒化")
            .remove(&room_id);
    }
}

fn new_room_event_state() -> RoomEventState {
    RoomEventState {
        active_media_member_ids: HashSet::new(),
        active_screen_member_ids: HashSet::new(),
        sender: broadcast::channel(EVENT_CHANNEL_CAPACITY).0,
    }
}

pub async fn subscribe(
    State(state): State<RoomApiState>,
    Extension(context): Extension<RequestContext>,
    Path(room_id): Path<String>,
    headers: HeaderMap,
    websocket: WebSocketUpgrade,
) -> Result<Response, ApiError> {
    let room_id = Uuid::parse_str(&room_id).map_err(|_| ApiError::BadRequest {
        request_id: context.request_id(),
        message: "会议号格式无效",
    })?;
    let (member, protocol) = state
        .session_tokens
        .authenticate_websocket_protocol(&headers, context.request_id())?;
    if !member.belongs_to_room(room_id) {
        return Err(ApiError::RoomMemberAccessDenied {
            request_id: context.request_id(),
        });
    }
    let member_id = member.member_id();
    let member_exists = state
        .rooms
        .member_exists(room_id, member_id)
        .await
        .map_err(|error| {
            tracing::error!(
                request_id = %context.request_id(),
                room_id = %room_id,
                user_id = %member_id,
                stream_id = "-",
                event = "room_event_authorization_storage_error",
                error_code = "ROOM_EVENT_AUTH_STORAGE_ERROR",
                error = %error,
            );
            ApiError::Internal {
                request_id: context.request_id(),
            }
        })?;
    if !member_exists {
        return Err(ApiError::RoomMemberAccessDenied {
            request_id: context.request_id(),
        });
    }

    let (receiver, snapshot) = state.event_hub.subscribe(room_id);
    Ok(websocket.protocols([protocol]).on_upgrade(move |socket| {
        handle_socket(
            socket,
            receiver,
            snapshot,
            context.request_id(),
            room_id,
            member_id,
        )
    }))
}

async fn handle_socket(
    mut socket: WebSocket,
    mut receiver: broadcast::Receiver<RoomEvent>,
    snapshot: RoomMediaSnapshot,
    request_id: Uuid,
    room_id: Uuid,
    member_id: Uuid,
) {
    tracing::info!(
        request_id = %request_id,
        room_id = %room_id,
        user_id = %member_id,
        stream_id = "-",
        event = "room_event_connected",
        error_code = "-",
    );

    for member_id in snapshot.active_media_member_ids {
        if send_event(&mut socket, RoomEvent::MediaStarted { member_id })
            .await
            .is_err()
        {
            return;
        }
    }
    for member_id in snapshot.active_screen_member_ids {
        if send_event(&mut socket, RoomEvent::ScreenShareStarted { member_id })
            .await
            .is_err()
        {
            return;
        }
    }

    loop {
        tokio::select! {
            event = receiver.recv() => {
                let event = match event {
                    Ok(event) => event,
                    Err(broadcast::error::RecvError::Lagged(_)) => RoomEvent::ResyncRequired,
                    Err(broadcast::error::RecvError::Closed) => break,
                };
                if send_event(&mut socket, event).await.is_err() {
                    break;
                }
            }
            message = socket.recv() => {
                match message {
                    Some(Ok(Message::Ping(payload))) => {
                        if socket.send(Message::Pong(payload)).await.is_err() {
                            break;
                        }
                    }
                    Some(Ok(Message::Close(_))) | None | Some(Err(_)) => break,
                    Some(Ok(_)) => {}
                }
            }
        }
    }

    tracing::info!(
        request_id = %request_id,
        room_id = %room_id,
        user_id = %member_id,
        stream_id = "-",
        event = "room_event_disconnected",
        error_code = "-",
    );
}

async fn send_event(socket: &mut WebSocket, event: RoomEvent) -> Result<(), ()> {
    let payload = serde_json::to_string(&event).map_err(|_| ())?;
    socket
        .send(Message::Text(payload.into()))
        .await
        .map_err(|_| ())
}

#[cfg(test)]
mod tests {
    use uuid::Uuid;

    use super::{RoomEvent, RoomEventHub};

    #[tokio::test]
    async fn publishes_events_to_room_specific_subscribers() {
        let hub = RoomEventHub::default();
        let room_id = Uuid::new_v4();
        let (mut receiver, snapshot) = hub.subscribe(room_id);
        assert!(snapshot.active_media_member_ids.is_empty());
        hub.publish(
            room_id,
            RoomEvent::MemberLeft {
                member_id: Uuid::new_v4(),
            },
        );

        assert!(matches!(
            receiver.recv().await,
            Ok(RoomEvent::MemberLeft { .. })
        ));
    }

    #[test]
    fn retains_active_media_and_screen_share_for_new_subscribers() {
        let hub = RoomEventHub::default();
        let room_id = Uuid::new_v4();
        let media_member_id = Uuid::new_v4();
        let screen_member_id = Uuid::new_v4();

        hub.publish(
            room_id,
            RoomEvent::MediaStarted {
                member_id: media_member_id,
            },
        );
        hub.publish(
            room_id,
            RoomEvent::ScreenShareStarted {
                member_id: screen_member_id,
            },
        );
        let (_, snapshot) = hub.subscribe(room_id);

        assert_eq!(snapshot.active_media_member_ids, vec![media_member_id]);
        assert_eq!(snapshot.active_screen_member_ids, vec![screen_member_id]);

        hub.publish(
            room_id,
            RoomEvent::MediaStopped {
                member_id: media_member_id,
            },
        );
        let (_, snapshot) = hub.subscribe(room_id);
        assert!(snapshot.active_media_member_ids.is_empty());
    }

    #[test]
    fn removes_departed_member_state_and_does_not_reopen_closed_room() {
        let hub = RoomEventHub::default();
        let room_id = Uuid::new_v4();
        let member_id = Uuid::new_v4();

        hub.publish(room_id, RoomEvent::MediaStarted { member_id });
        hub.publish(room_id, RoomEvent::ScreenShareStarted { member_id });
        hub.publish(room_id, RoomEvent::MemberLeft { member_id });

        let (_, snapshot) = hub.subscribe(room_id);
        assert!(snapshot.active_media_member_ids.is_empty());
        assert!(snapshot.active_screen_member_ids.is_empty());

        hub.close_room(room_id);
        hub.publish(room_id, RoomEvent::MediaStopped { member_id });
        assert!(
            !hub.rooms
                .lock()
                .expect("房间事件锁不应被毒化")
                .contains_key(&room_id)
        );
    }
}
