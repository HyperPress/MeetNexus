use axum::{
    Extension, Json, Router,
    extract::{Path, State},
    http::StatusCode,
    routing::{get, post},
};
use serde::Deserialize;
use uuid::Uuid;

use crate::{
    application::{RoomService, RoomServiceError},
    domain::RoomDetails,
    infrastructure::{postgres::PgRoomRepository, redis_presence::RedisPresenceRepository},
};

use super::{ApiError, request_context::RequestContext, response::SuccessResponse};

#[derive(Clone)]
pub struct RoomApiState {
    pub rooms: PgRoomRepository,
    pub presence: RedisPresenceRepository,
}

#[derive(Deserialize)]
struct CreateRoomRequest {
    title: String,
    display_name: String,
}

#[derive(Deserialize)]
struct JoinRoomRequest {
    display_name: String,
}

pub fn router(state: RoomApiState) -> Router {
    Router::new()
        .route("/rooms", post(create_room))
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
        .with_state(state)
}

async fn create_room(
    State(state): State<RoomApiState>,
    Extension(context): Extension<RequestContext>,
    Json(body): Json<CreateRoomRequest>,
) -> Result<(StatusCode, Json<SuccessResponse<RoomDetails>>), ApiError> {
    let details = service(&state)
        .create_room(&body.title, &body.display_name)
        .await
        .map_err(|error| map_error(error, context.request_id()))?;
    Ok((
        StatusCode::CREATED,
        Json(SuccessResponse {
            data: details,
            request_id: context.request_id(),
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
        .map_err(|error| map_error(error, context.request_id()))?;
    Ok(Json(SuccessResponse {
        data: details,
        request_id: context.request_id(),
    }))
}

async fn join_room(
    State(state): State<RoomApiState>,
    Extension(context): Extension<RequestContext>,
    Path(room_id): Path<String>,
    Json(body): Json<JoinRoomRequest>,
) -> Result<(StatusCode, Json<SuccessResponse<crate::domain::RoomMember>>), ApiError> {
    let room_id = parse_id(&room_id, context.request_id())?;
    let member = service(&state)
        .join_room(room_id, &body.display_name)
        .await
        .map_err(|error| map_error(error, context.request_id()))?;
    Ok((
        StatusCode::CREATED,
        Json(SuccessResponse {
            data: member,
            request_id: context.request_id(),
        }),
    ))
}

async fn leave_room(
    State(state): State<RoomApiState>,
    Extension(context): Extension<RequestContext>,
    Path((room_id, member_id)): Path<(String, String)>,
) -> Result<StatusCode, ApiError> {
    let room_id = parse_id(&room_id, context.request_id())?;
    let member_id = parse_id(&member_id, context.request_id())?;
    service(&state)
        .leave_room(room_id, member_id)
        .await
        .map_err(|error| map_error(error, context.request_id()))?;
    Ok(StatusCode::NO_CONTENT)
}

async fn refresh_presence(
    State(state): State<RoomApiState>,
    Extension(context): Extension<RequestContext>,
    Path((room_id, member_id)): Path<(String, String)>,
) -> Result<StatusCode, ApiError> {
    let room_id = parse_id(&room_id, context.request_id())?;
    let member_id = parse_id(&member_id, context.request_id())?;
    service(&state)
        .refresh_presence(room_id, member_id)
        .await
        .map_err(|error| map_error(error, context.request_id()))?;
    Ok(StatusCode::NO_CONTENT)
}

fn service(state: &RoomApiState) -> RoomService<PgRoomRepository, RedisPresenceRepository> {
    RoomService::new(state.rooms.clone(), state.presence.clone())
}

fn parse_id(value: &str, request_id: Uuid) -> Result<Uuid, ApiError> {
    Uuid::parse_str(value).map_err(|_| ApiError::BadRequest {
        request_id,
        message: "会议号或成员编号格式无效",
    })
}

fn map_error(error: RoomServiceError, request_id: Uuid) -> ApiError {
    match error {
        RoomServiceError::Validation(_) => ApiError::BadRequest {
            request_id,
            message: "请求字段不符合要求",
        },
        RoomServiceError::RoomNotFound => ApiError::RoomNotFound { request_id },
        RoomServiceError::MemberNotFound => ApiError::MemberNotFound { request_id },
        RoomServiceError::Storage(error) => {
            tracing::error!(
                request_id = %request_id,
                room_id = "-",
                user_id = "-",
                stream_id = "-",
                event = "room_storage_error",
                error_code = "ROOM_STORAGE_ERROR",
                error = %error,
            );
            ApiError::Internal { request_id }
        }
    }
}
