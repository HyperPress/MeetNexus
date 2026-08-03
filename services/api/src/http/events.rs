use std::{
    collections::HashMap,
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
    channels: Arc<Mutex<HashMap<Uuid, broadcast::Sender<RoomEvent>>>>,
}

#[derive(Clone, Serialize)]
#[serde(tag = "event", rename_all = "snake_case")]
pub enum RoomEvent {
    MemberJoined { member: RoomMember },
    MemberLeft { member_id: Uuid },
    ResyncRequired,
}

impl RoomEventHub {
    pub fn publish(&self, room_id: Uuid, event: RoomEvent) {
        let sender = self.channel(room_id);
        let _ = sender.send(event);
    }

    pub fn subscribe(&self, room_id: Uuid) -> broadcast::Receiver<RoomEvent> {
        self.channel(room_id).subscribe()
    }

    fn channel(&self, room_id: Uuid) -> broadcast::Sender<RoomEvent> {
        let mut channels = self.channels.lock().expect("房间事件锁不应被毒化");
        channels
            .entry(room_id)
            .or_insert_with(|| broadcast::channel(EVENT_CHANNEL_CAPACITY).0)
            .clone()
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

    let receiver = state.event_hub.subscribe(room_id);
    Ok(websocket.protocols([protocol]).on_upgrade(move |socket| {
        handle_socket(socket, receiver, context.request_id(), room_id, member_id)
    }))
}

async fn handle_socket(
    mut socket: WebSocket,
    mut receiver: broadcast::Receiver<RoomEvent>,
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

    loop {
        tokio::select! {
            event = receiver.recv() => {
                let event = match event {
                    Ok(event) => event,
                    Err(broadcast::error::RecvError::Lagged(_)) => RoomEvent::ResyncRequired,
                    Err(broadcast::error::RecvError::Closed) => break,
                };
                let payload = match serde_json::to_string(&event) {
                    Ok(payload) => payload,
                    Err(_) => break,
                };
                if socket.send(Message::Text(payload.into())).await.is_err() {
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

#[cfg(test)]
mod tests {
    use uuid::Uuid;

    use super::{RoomEvent, RoomEventHub};

    #[tokio::test]
    async fn publishes_events_to_room_specific_subscribers() {
        let hub = RoomEventHub::default();
        let room_id = Uuid::new_v4();
        let mut receiver = hub.subscribe(room_id);
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
}
