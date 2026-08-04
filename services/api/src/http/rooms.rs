use axum::{
    Extension, Json, Router,
    extract::{Path, State, rejection::JsonRejection},
    http::StatusCode,
    routing::{get, post},
};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::{
    application::{RoomService, RoomServiceError},
    domain::RoomDetails,
    infrastructure::{postgres::PgRoomRepository, redis_presence::RedisPresenceRepository},
};

use super::{
    ApiError,
    auth::SessionTokenService,
    events::{RoomEvent, RoomEventHub},
    request_context::RequestContext,
    response::SuccessResponse,
};

#[derive(Clone)]
pub struct RoomApiState {
    pub rooms: PgRoomRepository,
    pub presence: RedisPresenceRepository,
    pub session_tokens: SessionTokenService,
    pub event_hub: RoomEventHub,
}

#[derive(Serialize)]
struct CreateRoomResponse {
    data: RoomDetails,
    request_id: Uuid,
    session_token: String,
}

#[derive(Serialize)]
struct JoinRoomResponse {
    data: crate::domain::RoomMember,
    room_id: Uuid,
    request_id: Uuid,
    session_token: String,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct CreateRoomRequest {
    title: String,
    display_name: String,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct JoinRoomRequest {
    display_name: String,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct JoinRoomByCodeRequest {
    meeting_code: String,
    display_name: String,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct UpdateMemberMediaStateRequest {
    camera_enabled: bool,
    microphone_enabled: bool,
}

pub fn router(state: RoomApiState) -> Router {
    Router::new()
        .route("/rooms", post(create_room))
        .route("/rooms/join", post(join_room_by_meeting_code))
        .route("/rooms/{room_id}", get(get_room))
        .route("/rooms/{room_id}/members", post(join_room))
        .route(
            "/rooms/{room_id}/members/{member_id}",
            axum::routing::delete(leave_room),
        )
        .route(
            "/rooms/{room_id}/members/{member_id}/heartbeat",
            post(refresh_presence),
        )
        .route(
            "/rooms/{room_id}/members/{member_id}/media-state",
            post(update_member_media_state),
        )
        .route("/rooms/{room_id}/events", get(super::events::subscribe))
        .with_state(state)
}

async fn create_room(
    State(state): State<RoomApiState>,
    Extension(context): Extension<RequestContext>,
    body: Result<Json<CreateRoomRequest>, JsonRejection>,
) -> Result<(StatusCode, Json<CreateRoomResponse>), ApiError> {
    let Json(body) = parse_json(body, context.request_id())?;
    let details = service(&state)
        .create_room(&body.title, &body.display_name)
        .await
        .map_err(|error| map_error(error, context.request_id(), None, None))?;
    let host = details.members.first().ok_or(ApiError::Internal {
        request_id: context.request_id(),
    })?;
    let session_token =
        state
            .session_tokens
            .issue(details.room.id, host.id, host.role, context.request_id())?;
    state.event_hub.publish(
        details.room.id,
        RoomEvent::MemberJoined {
            member: host.clone(),
        },
    );
    log_room_event(
        context.request_id(),
        details.room.id,
        details.members.first().map(|member| member.id),
        "room_created",
    );
    Ok((
        StatusCode::CREATED,
        Json(CreateRoomResponse {
            data: details,
            request_id: context.request_id(),
            session_token,
        }),
    ))
}

async fn get_room(
    State(state): State<RoomApiState>,
    Extension(context): Extension<RequestContext>,
    Path(room_id): Path<String>,
) -> Result<Json<SuccessResponse<RoomDetails>>, ApiError> {
    let room_id = parse_id(&room_id, context.request_id())?;
    let details = service(&state)
        .get_room(room_id)
        .await
        .map_err(|error| map_error(error, context.request_id(), Some(room_id), None))?;
    log_room_event(context.request_id(), room_id, None, "room_queried");
    Ok(Json(SuccessResponse {
        data: details,
        request_id: context.request_id(),
    }))
}

async fn join_room(
    State(state): State<RoomApiState>,
    Extension(context): Extension<RequestContext>,
    Path(room_id): Path<String>,
    body: Result<Json<JoinRoomRequest>, JsonRejection>,
) -> Result<(StatusCode, Json<JoinRoomResponse>), ApiError> {
    let room_id = parse_id(&room_id, context.request_id())?;
    let Json(body) = parse_json(body, context.request_id())?;
    let member = service(&state)
        .join_room(room_id, &body.display_name)
        .await
        .map_err(|error| map_error(error, context.request_id(), Some(room_id), None))?;
    let session_token =
        state
            .session_tokens
            .issue(room_id, member.id, member.role, context.request_id())?;
    state.event_hub.publish(
        room_id,
        RoomEvent::MemberJoined {
            member: member.clone(),
        },
    );
    log_room_event(
        context.request_id(),
        room_id,
        Some(member.id),
        "room_member_joined",
    );
    Ok((
        StatusCode::CREATED,
        Json(JoinRoomResponse {
            data: member,
            room_id,
            request_id: context.request_id(),
            session_token,
        }),
    ))
}

async fn join_room_by_meeting_code(
    State(state): State<RoomApiState>,
    Extension(context): Extension<RequestContext>,
    body: Result<Json<JoinRoomByCodeRequest>, JsonRejection>,
) -> Result<(StatusCode, Json<JoinRoomResponse>), ApiError> {
    let Json(body) = parse_json(body, context.request_id())?;
    let (room_id, member) = service(&state)
        .join_room_by_meeting_code(&body.meeting_code, &body.display_name)
        .await
        .map_err(|error| map_error(error, context.request_id(), None, None))?;
    let session_token =
        state
            .session_tokens
            .issue(room_id, member.id, member.role, context.request_id())?;
    state.event_hub.publish(
        room_id,
        RoomEvent::MemberJoined {
            member: member.clone(),
        },
    );
    log_room_event(
        context.request_id(),
        room_id,
        Some(member.id),
        "room_member_joined",
    );
    Ok((
        StatusCode::CREATED,
        Json(JoinRoomResponse {
            data: member,
            room_id,
            request_id: context.request_id(),
            session_token,
        }),
    ))
}

async fn leave_room(
    State(state): State<RoomApiState>,
    Extension(context): Extension<RequestContext>,
    Path((room_id, member_id)): Path<(String, String)>,
    headers: axum::http::HeaderMap,
) -> Result<StatusCode, ApiError> {
    let room_id = parse_id(&room_id, context.request_id())?;
    let member_id = parse_id(&member_id, context.request_id())?;
    authorize_session(&state, &headers, room_id, member_id, context.request_id())?;
    let outcome = service(&state)
        .leave_room(room_id, member_id)
        .await
        .map_err(|error| map_error(error, context.request_id(), Some(room_id), Some(member_id)))?;
    if outcome.member_left {
        state
            .event_hub
            .publish(room_id, RoomEvent::MemberLeft { member_id });
    }
    log_room_event(
        context.request_id(),
        room_id,
        Some(member_id),
        "room_member_left",
    );
    Ok(StatusCode::NO_CONTENT)
}

async fn refresh_presence(
    State(state): State<RoomApiState>,
    Extension(context): Extension<RequestContext>,
    Path((room_id, member_id)): Path<(String, String)>,
    headers: axum::http::HeaderMap,
) -> Result<StatusCode, ApiError> {
    let room_id = parse_id(&room_id, context.request_id())?;
    let member_id = parse_id(&member_id, context.request_id())?;
    authorize_session(&state, &headers, room_id, member_id, context.request_id())?;
    service(&state)
        .refresh_presence(room_id, member_id)
        .await
        .map_err(|error| map_error(error, context.request_id(), Some(room_id), Some(member_id)))?;
    log_room_event(
        context.request_id(),
        room_id,
        Some(member_id),
        "room_member_heartbeat",
    );
    Ok(StatusCode::NO_CONTENT)
}

async fn update_member_media_state(
    State(state): State<RoomApiState>,
    Extension(context): Extension<RequestContext>,
    Path((room_id, member_id)): Path<(String, String)>,
    headers: axum::http::HeaderMap,
    body: Result<Json<UpdateMemberMediaStateRequest>, JsonRejection>,
) -> Result<StatusCode, ApiError> {
    let room_id = parse_id(&room_id, context.request_id())?;
    let member_id = parse_id(&member_id, context.request_id())?;
    let Json(body) = parse_json(body, context.request_id())?;
    authorize_session(&state, &headers, room_id, member_id, context.request_id())?;
    state.event_hub.publish(
        room_id,
        RoomEvent::MediaStateChanged {
            member_id,
            camera_enabled: body.camera_enabled,
            microphone_enabled: body.microphone_enabled,
        },
    );
    log_room_event(
        context.request_id(),
        room_id,
        Some(member_id),
        "room_member_media_state_changed",
    );
    Ok(StatusCode::NO_CONTENT)
}

fn service(state: &RoomApiState) -> RoomService<PgRoomRepository, RedisPresenceRepository> {
    RoomService::new(state.rooms.clone(), state.presence.clone())
}

fn authorize_session(
    state: &RoomApiState,
    headers: &axum::http::HeaderMap,
    room_id: Uuid,
    member_id: Uuid,
    request_id: Uuid,
) -> Result<(), ApiError> {
    if state
        .session_tokens
        .authenticate(headers, request_id)?
        .authorizes(room_id, member_id)
    {
        Ok(())
    } else {
        Err(ApiError::RoomMemberAccessDenied { request_id })
    }
}

fn parse_id(value: &str, request_id: Uuid) -> Result<Uuid, ApiError> {
    Uuid::parse_str(value).map_err(|_| ApiError::BadRequest {
        request_id,
        message: "会议号或成员编号格式无效",
    })
}

fn parse_json<T>(
    body: Result<Json<T>, JsonRejection>,
    request_id: Uuid,
) -> Result<Json<T>, ApiError> {
    body.map_err(|_| ApiError::BadRequest {
        request_id,
        message: "请求体格式无效",
    })
}

fn log_room_event(request_id: Uuid, room_id: Uuid, member_id: Option<Uuid>, event: &'static str) {
    let member_id = member_id.map_or_else(|| "-".to_owned(), |value| value.to_string());
    tracing::info!(
        request_id = %request_id,
        room_id = %room_id,
        user_id = "-",
        member_id = %member_id,
        stream_id = "-",
        event,
        error_code = "-",
    );
}

fn map_error(
    error: RoomServiceError,
    request_id: Uuid,
    room_id: Option<Uuid>,
    member_id: Option<Uuid>,
) -> ApiError {
    match error {
        RoomServiceError::Validation(_) => ApiError::BadRequest {
            request_id,
            message: "请求字段不符合要求",
        },
        RoomServiceError::RoomNotFound => ApiError::RoomNotFound { request_id },
        RoomServiceError::MemberNotFound => ApiError::MemberNotFound { request_id },
        RoomServiceError::Storage(error) => {
            let room_id = room_id.map_or_else(|| "-".to_owned(), |value| value.to_string());
            let member_id = member_id.map_or_else(|| "-".to_owned(), |value| value.to_string());
            tracing::error!(
                request_id = %request_id,
                room_id = %room_id,
                user_id = "-",
                member_id = %member_id,
                stream_id = "-",
                event = "room_storage_error",
                error_code = "ROOM_STORAGE_ERROR",
                error = %error,
            );
            ApiError::Internal { request_id }
        }
    }
}
