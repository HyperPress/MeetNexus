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
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use tokio::sync::broadcast;
use uuid::Uuid;

use crate::{application::RoomRepository, domain::RoomMember};

use super::{ApiError, request_context::RequestContext, rooms::RoomApiState};

const EVENT_CHANNEL_CAPACITY: usize = 32;
const CHAT_HISTORY_CAPACITY: usize = 100;
const CHAT_MESSAGE_MAX_CHARS: usize = 500;
const CLIENT_COMMAND_MAX_BYTES: usize = 4_096;

#[derive(Clone, Default)]
pub struct RoomEventHub {
    rooms: Arc<Mutex<HashMap<Uuid, RoomEventState>>>,
}

struct RoomEventState {
    active_media_member_ids: HashSet<Uuid>,
    active_screen_member_ids: HashSet<Uuid>,
    chat_history: Vec<RoomChatMessage>,
    raised_hands: HashMap<Uuid, String>,
    member_media_states: HashMap<Uuid, MemberMediaState>,
    sender: broadcast::Sender<RoomEvent>,
}

#[derive(Default)]
pub struct RoomEventSnapshot {
    active_media_member_ids: Vec<Uuid>,
    active_screen_member_ids: Vec<Uuid>,
    chat_history: Vec<RoomChatMessage>,
    raised_hands: Vec<RaisedHand>,
    member_media_states: Vec<MemberMediaState>,
}

#[derive(Clone, Serialize)]
pub struct RoomChatMessage {
    pub id: Uuid,
    pub member_id: Uuid,
    pub display_name: String,
    pub content: String,
    pub sent_at: DateTime<Utc>,
}

#[derive(Clone)]
struct RaisedHand {
    member_id: Uuid,
    display_name: String,
}

#[derive(Clone, Serialize)]
pub struct MemberMediaState {
    pub member_id: Uuid,
    pub camera_enabled: bool,
    pub microphone_enabled: bool,
}

#[derive(Clone, Serialize)]
#[serde(tag = "event", rename_all = "snake_case")]
pub enum RoomEvent {
    MemberJoined {
        member: RoomMember,
    },
    MemberLeft {
        member_id: Uuid,
    },
    MediaStarted {
        member_id: Uuid,
    },
    MediaStopped {
        member_id: Uuid,
    },
    MediaStateChanged {
        member_id: Uuid,
        camera_enabled: bool,
        microphone_enabled: bool,
    },
    ScreenShareStarted {
        member_id: Uuid,
    },
    ScreenShareStopped {
        member_id: Uuid,
    },
    ChatMessageSent {
        message: RoomChatMessage,
    },
    HandRaiseChanged {
        member_id: Uuid,
        display_name: String,
        raised: bool,
    },
    CommandRejected {
        code: String,
        message: String,
    },
    ResyncRequired,
}

#[derive(Deserialize)]
#[serde(tag = "command", rename_all = "snake_case", deny_unknown_fields)]
enum RoomCommand {
    SendChatMessage { content: String },
    SetHandRaised { raised: bool },
}

struct CommandValidationError {
    code: &'static str,
    message: &'static str,
}

impl RoomEventHub {
    pub fn publish(&self, room_id: Uuid, event: RoomEvent) {
        let sender = {
            let mut rooms = self.rooms.lock().expect("房间事件锁不应被毒化");
            let requires_existing_state = matches!(
                &event,
                RoomEvent::MemberLeft { .. }
                    | RoomEvent::MediaStopped { .. }
                    | RoomEvent::ScreenShareStopped { .. }
                    | RoomEvent::ChatMessageSent { .. }
                    | RoomEvent::HandRaiseChanged { .. }
                    | RoomEvent::ResyncRequired
            );
            if requires_existing_state && !rooms.contains_key(&room_id) {
                return;
            }
            let room = rooms.entry(room_id).or_insert_with(new_room_event_state);
            match &event {
                RoomEvent::MediaStarted { member_id } => {
                    room.active_media_member_ids.insert(*member_id);
                }
                RoomEvent::MediaStopped { member_id } => {
                    room.active_media_member_ids.remove(member_id);
                    room.member_media_states.remove(member_id);
                }
                RoomEvent::MediaStateChanged {
                    member_id,
                    camera_enabled,
                    microphone_enabled,
                } => {
                    room.member_media_states.insert(
                        *member_id,
                        MemberMediaState {
                            member_id: *member_id,
                            camera_enabled: *camera_enabled,
                            microphone_enabled: *microphone_enabled,
                        },
                    );
                }
                RoomEvent::ScreenShareStarted { member_id } => {
                    room.active_screen_member_ids.insert(*member_id);
                }
                RoomEvent::ScreenShareStopped { member_id } => {
                    room.active_screen_member_ids.remove(member_id);
                }
                RoomEvent::ChatMessageSent { message } => {
                    room.chat_history.push(message.clone());
                    if room.chat_history.len() > CHAT_HISTORY_CAPACITY {
                        room.chat_history.remove(0);
                    }
                }
                RoomEvent::HandRaiseChanged {
                    member_id,
                    display_name,
                    raised,
                } => {
                    if *raised {
                        room.raised_hands.insert(*member_id, display_name.clone());
                    } else {
                        room.raised_hands.remove(member_id);
                    }
                }
                RoomEvent::MemberLeft { member_id } => {
                    room.active_media_member_ids.remove(member_id);
                    room.active_screen_member_ids.remove(member_id);
                    room.raised_hands.remove(member_id);
                    room.member_media_states.remove(member_id);
                }
                RoomEvent::MemberJoined { .. }
                | RoomEvent::CommandRejected { .. }
                | RoomEvent::ResyncRequired => {}
            }
            room.sender.clone()
        };
        let _ = sender.send(event);
    }

    pub fn subscribe(&self, room_id: Uuid) -> (broadcast::Receiver<RoomEvent>, RoomEventSnapshot) {
        let mut rooms = self.rooms.lock().expect("房间事件锁不应被毒化");
        let room = rooms.entry(room_id).or_insert_with(new_room_event_state);
        (
            room.sender.subscribe(),
            RoomEventSnapshot {
                active_media_member_ids: room.active_media_member_ids.iter().copied().collect(),
                active_screen_member_ids: room.active_screen_member_ids.iter().copied().collect(),
                chat_history: room.chat_history.clone(),
                raised_hands: room
                    .raised_hands
                    .iter()
                    .map(|(member_id, display_name)| RaisedHand {
                        member_id: *member_id,
                        display_name: display_name.clone(),
                    })
                    .collect(),
                member_media_states: room.member_media_states.values().cloned().collect(),
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
        chat_history: Vec::new(),
        raised_hands: HashMap::new(),
        member_media_states: HashMap::new(),
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
    let room_members = state.rooms.list_members(room_id).await.map_err(|error| {
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
    let Some(room_member) = room_members
        .into_iter()
        .find(|room_member| room_member.id == member_id)
    else {
        return Err(ApiError::RoomMemberAccessDenied {
            request_id: context.request_id(),
        });
    };

    let (receiver, snapshot) = state.event_hub.subscribe(room_id);
    Ok(websocket.protocols([protocol]).on_upgrade(move |socket| {
        handle_socket(
            socket,
            receiver,
            snapshot,
            context.request_id(),
            room_id,
            member_id,
            room_member.display_name,
            state.event_hub.clone(),
        )
    }))
}

async fn handle_socket(
    mut socket: WebSocket,
    mut receiver: broadcast::Receiver<RoomEvent>,
    snapshot: RoomEventSnapshot,
    request_id: Uuid,
    room_id: Uuid,
    member_id: Uuid,
    display_name: String,
    event_hub: RoomEventHub,
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
    for message in snapshot.chat_history {
        if send_event(&mut socket, RoomEvent::ChatMessageSent { message })
            .await
            .is_err()
        {
            return;
        }
    }
    for raised_hand in snapshot.raised_hands {
        if send_event(
            &mut socket,
            RoomEvent::HandRaiseChanged {
                member_id: raised_hand.member_id,
                display_name: raised_hand.display_name,
                raised: true,
            },
        )
        .await
        .is_err()
        {
            return;
        }
    }
    for state in snapshot.member_media_states {
        if send_event(
            &mut socket,
            RoomEvent::MediaStateChanged {
                member_id: state.member_id,
                camera_enabled: state.camera_enabled,
                microphone_enabled: state.microphone_enabled,
            },
        )
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
                    Some(Ok(Message::Text(payload))) => {
                        if handle_client_command(
                            &mut socket,
                            &event_hub,
                            payload.as_str(),
                            request_id,
                            room_id,
                            member_id,
                            &display_name,
                        )
                        .await
                        .is_err()
                        {
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

async fn handle_client_command(
    socket: &mut WebSocket,
    event_hub: &RoomEventHub,
    payload: &str,
    request_id: Uuid,
    room_id: Uuid,
    member_id: Uuid,
    display_name: &str,
) -> Result<(), ()> {
    let command = match parse_client_command(payload) {
        Ok(command) => command,
        Err(error) => {
            return send_event(
                socket,
                RoomEvent::CommandRejected {
                    code: error.code.to_owned(),
                    message: error.message.to_owned(),
                },
            )
            .await;
        }
    };

    match command {
        RoomCommand::SendChatMessage { content } => {
            event_hub.publish(
                room_id,
                RoomEvent::ChatMessageSent {
                    message: RoomChatMessage {
                        id: Uuid::new_v4(),
                        member_id,
                        display_name: display_name.to_owned(),
                        content,
                        sent_at: Utc::now(),
                    },
                },
            );
            log_interaction_event(request_id, room_id, member_id, "room_chat_message_sent");
        }
        RoomCommand::SetHandRaised { raised } => {
            event_hub.publish(
                room_id,
                RoomEvent::HandRaiseChanged {
                    member_id,
                    display_name: display_name.to_owned(),
                    raised,
                },
            );
            log_interaction_event(
                request_id,
                room_id,
                member_id,
                if raised {
                    "room_hand_raised"
                } else {
                    "room_hand_lowered"
                },
            );
        }
    }
    Ok(())
}

fn parse_client_command(payload: &str) -> Result<RoomCommand, CommandValidationError> {
    if payload.len() > CLIENT_COMMAND_MAX_BYTES {
        return Err(CommandValidationError {
            code: "INTERACTION_COMMAND_INVALID",
            message: "互动请求过长",
        });
    }
    let command =
        serde_json::from_str::<RoomCommand>(payload).map_err(|_| CommandValidationError {
            code: "INTERACTION_COMMAND_INVALID",
            message: "互动请求格式无效",
        })?;
    match command {
        RoomCommand::SendChatMessage { content } => {
            let content = content.trim().to_owned();
            if content.is_empty() || content.chars().count() > CHAT_MESSAGE_MAX_CHARS {
                return Err(CommandValidationError {
                    code: "CHAT_MESSAGE_INVALID",
                    message: "聊天内容必须为 1 至 500 个字符",
                });
            }
            Ok(RoomCommand::SendChatMessage { content })
        }
        RoomCommand::SetHandRaised { raised } => Ok(RoomCommand::SetHandRaised { raised }),
    }
}

fn log_interaction_event(request_id: Uuid, room_id: Uuid, member_id: Uuid, event: &str) {
    tracing::info!(
        request_id = %request_id,
        room_id = %room_id,
        user_id = %member_id,
        stream_id = "-",
        event,
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
    use chrono::Utc;
    use uuid::Uuid;

    use super::{RoomChatMessage, RoomCommand, RoomEvent, RoomEventHub, parse_client_command};

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
        hub.publish(
            room_id,
            RoomEvent::MediaStateChanged {
                member_id: media_member_id,
                camera_enabled: false,
                microphone_enabled: true,
            },
        );
        let (_, snapshot) = hub.subscribe(room_id);

        assert_eq!(snapshot.active_media_member_ids, vec![media_member_id]);
        assert_eq!(snapshot.active_screen_member_ids, vec![screen_member_id]);
        assert_eq!(snapshot.member_media_states.len(), 1);
        assert!(!snapshot.member_media_states[0].camera_enabled);
        assert!(snapshot.member_media_states[0].microphone_enabled);

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

    #[test]
    fn validates_and_normalizes_interaction_commands() {
        let command =
            parse_client_command(r#"{"command":"send_chat_message","content":"  大家好  "}"#)
                .expect("有效聊天命令应通过校验");
        assert!(matches!(
            command,
            RoomCommand::SendChatMessage { content } if content == "大家好"
        ));
        assert!(
            parse_client_command(r#"{"command":"send_chat_message","content":"   "}"#).is_err()
        );
        assert!(matches!(
            parse_client_command(r#"{"command":"set_hand_raised","raised":true}"#),
            Ok(RoomCommand::SetHandRaised { raised: true })
        ));
    }

    #[test]
    fn retains_chat_history_and_raised_hands_for_new_subscribers() {
        let hub = RoomEventHub::default();
        let room_id = Uuid::new_v4();
        let member_id = Uuid::new_v4();
        let _ = hub.subscribe(room_id);
        hub.publish(
            room_id,
            RoomEvent::ChatMessageSent {
                message: RoomChatMessage {
                    id: Uuid::new_v4(),
                    member_id,
                    display_name: "小明".to_owned(),
                    content: "大家好".to_owned(),
                    sent_at: Utc::now(),
                },
            },
        );
        hub.publish(
            room_id,
            RoomEvent::HandRaiseChanged {
                member_id,
                display_name: "小明".to_owned(),
                raised: true,
            },
        );

        let (_, snapshot) = hub.subscribe(room_id);
        assert_eq!(snapshot.chat_history.len(), 1);
        assert_eq!(snapshot.chat_history[0].content, "大家好");
        assert_eq!(snapshot.raised_hands.len(), 1);
        assert_eq!(snapshot.raised_hands[0].member_id, member_id);

        hub.publish(room_id, RoomEvent::MemberLeft { member_id });
        let (_, snapshot) = hub.subscribe(room_id);
        assert!(snapshot.raised_hands.is_empty());
        assert_eq!(snapshot.chat_history.len(), 1);
    }
}
