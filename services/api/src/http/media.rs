use axum::{
    Extension, Router,
    body::Bytes,
    extract::{Path, State},
    http::{HeaderMap, StatusCode, header},
    response::{IntoResponse, Response},
    routing::{delete, post},
};
use uuid::Uuid;

use crate::{
    application::{RoomRepository, StorageError},
    infrastructure::{
        live777::{Live777Client, Live777Error, Live777Response},
        postgres::PgRoomRepository,
    },
};

use super::{
    ApiError,
    request_context::{self, RequestContext},
};

const MEMBER_ID_HEADER: &str = "x-member-id";

#[derive(Clone)]
pub struct MediaApiState {
    pub live777: Live777Client,
    pub rooms: PgRoomRepository,
}

pub fn router(state: MediaApiState) -> Router {
    Router::new()
        .route("/media/whip/{room_id}/{member_id}", post(publish))
        .route("/media/whep/{room_id}/{member_id}", post(subscribe))
        .route(
            "/media/sessions/{room_id}/{stream_member_id}/{member_id}/{session_id}",
            delete(close_session),
        )
        .with_state(state)
        .layer(axum::middleware::from_fn(request_context::attach))
}

async fn publish(
    State(state): State<MediaApiState>,
    Extension(context): Extension<RequestContext>,
    Path((room_id, member_id)): Path<(String, String)>,
    headers: HeaderMap,
    offer: Bytes,
) -> Result<Response, ApiError> {
    let room_id = parse_uuid(&room_id, context.request_id())?;
    let member_id = parse_uuid(&member_id, context.request_id())?;
    let current_member_id = current_member_id(&headers, context.request_id())?;
    validate_offer(&headers, &offer, context.request_id())?;

    if current_member_id != member_id {
        return Err(ApiError::MediaAccessDenied {
            request_id: context.request_id(),
        });
    }
    authorize_member(&state, room_id, current_member_id, context.request_id()).await?;

    let stream_id = stream_id(room_id, member_id);
    let response = state
        .live777
        .whip(&stream_id, &offer)
        .await
        .map_err(|error| {
            map_live777_error(
                error,
                context.request_id(),
                room_id,
                current_member_id,
                &stream_id,
            )
        })?;
    media_answer(
        response,
        context.request_id(),
        room_id,
        member_id,
        current_member_id,
        "media_whip_published",
    )
}

async fn subscribe(
    State(state): State<MediaApiState>,
    Extension(context): Extension<RequestContext>,
    Path((room_id, member_id)): Path<(String, String)>,
    headers: HeaderMap,
    offer: Bytes,
) -> Result<Response, ApiError> {
    let room_id = parse_uuid(&room_id, context.request_id())?;
    let stream_member_id = parse_uuid(&member_id, context.request_id())?;
    let current_member_id = current_member_id(&headers, context.request_id())?;
    validate_offer(&headers, &offer, context.request_id())?;
    authorize_member(&state, room_id, current_member_id, context.request_id()).await?;
    authorize_member(&state, room_id, stream_member_id, context.request_id()).await?;

    let stream_id = stream_id(room_id, stream_member_id);
    let response = state
        .live777
        .whep(&stream_id, &offer)
        .await
        .map_err(|error| {
            map_live777_error(
                error,
                context.request_id(),
                room_id,
                current_member_id,
                &stream_id,
            )
        })?;
    media_answer(
        response,
        context.request_id(),
        room_id,
        stream_member_id,
        current_member_id,
        "media_whep_subscribed",
    )
}

async fn close_session(
    State(state): State<MediaApiState>,
    Extension(context): Extension<RequestContext>,
    Path((room_id, stream_member_id, member_id, session_id)): Path<(
        String,
        String,
        String,
        String,
    )>,
    headers: HeaderMap,
) -> Result<StatusCode, ApiError> {
    let room_id = parse_uuid(&room_id, context.request_id())?;
    let stream_member_id = parse_uuid(&stream_member_id, context.request_id())?;
    let member_id = parse_uuid(&member_id, context.request_id())?;
    let current_member_id = current_member_id(&headers, context.request_id())?;
    if current_member_id != member_id || !valid_session_id(&session_id) {
        return Err(ApiError::MediaAccessDenied {
            request_id: context.request_id(),
        });
    }
    authorize_member(&state, room_id, current_member_id, context.request_id()).await?;

    let stream_id = stream_id(room_id, stream_member_id);
    let response = state
        .live777
        .close_session(&stream_id, &session_id)
        .await
        .map_err(|error| {
            map_live777_error(
                error,
                context.request_id(),
                room_id,
                current_member_id,
                &stream_id,
            )
        })?;
    if !response.status.is_success() {
        log_media_error(
            context.request_id(),
            room_id,
            current_member_id,
            &stream_id,
            "media_session_close_rejected",
        );
        return Err(ApiError::MediaServiceUnavailable {
            request_id: context.request_id(),
        });
    }

    tracing::info!(
        request_id = %context.request_id(),
        room_id = %room_id,
        user_id = %current_member_id,
        stream_id = %stream_id,
        event = "media_session_closed",
        error_code = "-",
    );
    Ok(StatusCode::NO_CONTENT)
}

async fn authorize_member(
    state: &MediaApiState,
    room_id: Uuid,
    member_id: Uuid,
    request_id: Uuid,
) -> Result<(), ApiError> {
    let exists = state
        .rooms
        .member_exists(room_id, member_id)
        .await
        .map_err(|error| map_storage_error(error, request_id, room_id, member_id))?;
    if exists {
        Ok(())
    } else {
        Err(ApiError::MediaAccessDenied { request_id })
    }
}

fn media_answer(
    response: Live777Response,
    request_id: Uuid,
    room_id: Uuid,
    stream_member_id: Uuid,
    current_member_id: Uuid,
    event: &'static str,
) -> Result<Response, ApiError> {
    let stream_id = stream_id(room_id, stream_member_id);
    if response.status != StatusCode::CREATED || response.body.is_empty() {
        log_media_error(
            request_id,
            room_id,
            current_member_id,
            &stream_id,
            "media_negotiation_rejected",
        );
        return Err(ApiError::MediaServiceUnavailable { request_id });
    }
    let session_id = response.session_id.ok_or_else(|| {
        log_media_error(
            request_id,
            room_id,
            current_member_id,
            &stream_id,
            "media_session_location_missing",
        );
        ApiError::MediaServiceUnavailable { request_id }
    })?;
    let location =
        format!("/media/sessions/{room_id}/{stream_member_id}/{current_member_id}/{session_id}");
    let content_type = response
        .content_type
        .unwrap_or_else(|| "application/sdp".to_owned());
    let mut answer = (StatusCode::CREATED, response.body).into_response();
    answer.headers_mut().insert(
        header::CONTENT_TYPE,
        content_type
            .parse()
            .map_err(|_| ApiError::MediaServiceUnavailable { request_id })?,
    );
    answer.headers_mut().insert(
        header::LOCATION,
        location
            .parse()
            .map_err(|_| ApiError::MediaServiceUnavailable { request_id })?,
    );
    tracing::info!(
        request_id = %request_id,
        room_id = %room_id,
        user_id = %current_member_id,
        stream_id = %stream_id,
        event,
        error_code = "-",
    );
    Ok(answer)
}

fn current_member_id(headers: &HeaderMap, request_id: Uuid) -> Result<Uuid, ApiError> {
    headers
        .get(MEMBER_ID_HEADER)
        .and_then(|value| value.to_str().ok())
        .and_then(|value| Uuid::parse_str(value).ok())
        .ok_or(ApiError::BadRequest {
            request_id,
            message: "当前成员编号格式无效",
        })
}

fn parse_uuid(value: &str, request_id: Uuid) -> Result<Uuid, ApiError> {
    Uuid::parse_str(value).map_err(|_| ApiError::BadRequest {
        request_id,
        message: "会议号或成员编号格式无效",
    })
}

fn validate_offer(headers: &HeaderMap, offer: &Bytes, request_id: Uuid) -> Result<(), ApiError> {
    let is_sdp = headers
        .get(header::CONTENT_TYPE)
        .and_then(|value| value.to_str().ok())
        .is_some_and(|value| value.eq_ignore_ascii_case("application/sdp"));
    if !is_sdp || offer.is_empty() || offer.len() > 65_536 {
        return Err(ApiError::BadRequest {
            request_id,
            message: "媒体协商请求格式无效",
        });
    }
    Ok(())
}

fn valid_session_id(value: &str) -> bool {
    !value.is_empty()
        && value.len() <= 200
        && value.chars().all(|character| {
            character.is_ascii_alphanumeric() || character == '-' || character == '_'
        })
}

fn stream_id(room_id: Uuid, member_id: Uuid) -> String {
    format!("room-{room_id}-member-{member_id}")
}

fn map_storage_error(
    error: StorageError,
    request_id: Uuid,
    room_id: Uuid,
    member_id: Uuid,
) -> ApiError {
    tracing::error!(
        request_id = %request_id,
        room_id = %room_id,
        user_id = %member_id,
        stream_id = "-",
        event = "media_authorization_storage_error",
        error_code = "MEDIA_AUTH_STORAGE_ERROR",
        error = %error,
    );
    ApiError::MediaServiceUnavailable { request_id }
}

fn map_live777_error(
    error: Live777Error,
    request_id: Uuid,
    room_id: Uuid,
    member_id: Uuid,
    stream_id: &str,
) -> ApiError {
    tracing::error!(
        request_id = %request_id,
        room_id = %room_id,
        user_id = %member_id,
        stream_id,
        event = "live777_proxy_error",
        error_code = "LIVE777_PROXY_ERROR",
        error = %error,
    );
    ApiError::MediaServiceUnavailable { request_id }
}

fn log_media_error(
    request_id: Uuid,
    room_id: Uuid,
    member_id: Uuid,
    stream_id: &str,
    event: &'static str,
) {
    tracing::error!(
        request_id = %request_id,
        room_id = %room_id,
        user_id = %member_id,
        stream_id,
        event,
        error_code = "LIVE777_MEDIA_ERROR",
    );
}
