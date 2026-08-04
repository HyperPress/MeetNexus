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
    auth::SessionTokenService,
    request_context::{self, RequestContext},
};

#[derive(Clone)]
pub struct MediaApiState {
    pub live777: Live777Client,
    pub rooms: PgRoomRepository,
    pub session_tokens: SessionTokenService,
    pub event_hub: super::events::RoomEventHub,
}

#[derive(Clone, Copy)]
enum StreamKind {
    Camera,
    Screen,
}

struct SessionCloseInput {
    context: RequestContext,
    headers: HeaderMap,
    member_id: String,
    room_id: String,
    session_id: String,
    state: MediaApiState,
    stream_member_id: String,
}

pub fn router(state: MediaApiState) -> Router {
    Router::new()
        .route("/media/whip/{room_id}/{member_id}", post(publish))
        .route("/media/whep/{room_id}/{member_id}", post(subscribe))
        .route(
            "/media/whip/{room_id}/{member_id}/screen",
            post(publish_screen),
        )
        .route(
            "/media/whep/{room_id}/{member_id}/screen",
            post(subscribe_screen),
        )
        .route(
            "/media/sessions/{room_id}/{stream_member_id}/{member_id}/{session_id}",
            delete(close_session),
        )
        .route(
            "/media/screen-sessions/{room_id}/{stream_member_id}/{member_id}/{session_id}",
            delete(close_screen_session),
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
    publish_with_kind(
        state,
        context,
        member_id,
        room_id,
        headers,
        offer,
        StreamKind::Camera,
    )
    .await
}

async fn publish_screen(
    State(state): State<MediaApiState>,
    Extension(context): Extension<RequestContext>,
    Path((room_id, member_id)): Path<(String, String)>,
    headers: HeaderMap,
    offer: Bytes,
) -> Result<Response, ApiError> {
    publish_with_kind(
        state,
        context,
        member_id,
        room_id,
        headers,
        offer,
        StreamKind::Screen,
    )
    .await
}

async fn publish_with_kind(
    state: MediaApiState,
    context: RequestContext,
    member_id: String,
    room_id: String,
    headers: HeaderMap,
    offer: Bytes,
    kind: StreamKind,
) -> Result<Response, ApiError> {
    let room_id = parse_uuid(&room_id, context.request_id())?;
    let member_id = parse_uuid(&member_id, context.request_id())?;
    let current_member = state
        .session_tokens
        .authenticate(&headers, context.request_id())?;
    let current_member_id = current_member.member_id();
    validate_offer(&headers, &offer, context.request_id())?;

    if !current_member.authorizes(room_id, member_id) {
        return Err(ApiError::MediaAccessDenied {
            request_id: context.request_id(),
        });
    }
    authorize_member(&state, room_id, current_member_id, context.request_id()).await?;

    let stream_id = stream_id(room_id, member_id, kind);
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
    let answer = media_answer(
        response,
        context.request_id(),
        room_id,
        member_id,
        current_member_id,
        kind,
        "media_whip_published",
    )?;
    let event = match kind {
        StreamKind::Camera => super::events::RoomEvent::MediaStarted { member_id },
        StreamKind::Screen => super::events::RoomEvent::ScreenShareStarted { member_id },
    };
    state.event_hub.publish(room_id, event);
    Ok(answer)
}

async fn subscribe(
    State(state): State<MediaApiState>,
    Extension(context): Extension<RequestContext>,
    Path((room_id, member_id)): Path<(String, String)>,
    headers: HeaderMap,
    offer: Bytes,
) -> Result<Response, ApiError> {
    subscribe_with_kind(
        state,
        context,
        member_id,
        room_id,
        headers,
        offer,
        StreamKind::Camera,
    )
    .await
}

async fn subscribe_screen(
    State(state): State<MediaApiState>,
    Extension(context): Extension<RequestContext>,
    Path((room_id, member_id)): Path<(String, String)>,
    headers: HeaderMap,
    offer: Bytes,
) -> Result<Response, ApiError> {
    subscribe_with_kind(
        state,
        context,
        member_id,
        room_id,
        headers,
        offer,
        StreamKind::Screen,
    )
    .await
}

async fn subscribe_with_kind(
    state: MediaApiState,
    context: RequestContext,
    member_id: String,
    room_id: String,
    headers: HeaderMap,
    offer: Bytes,
    kind: StreamKind,
) -> Result<Response, ApiError> {
    let room_id = parse_uuid(&room_id, context.request_id())?;
    let stream_member_id = parse_uuid(&member_id, context.request_id())?;
    let current_member = state
        .session_tokens
        .authenticate(&headers, context.request_id())?;
    let current_member_id = current_member.member_id();
    validate_offer(&headers, &offer, context.request_id())?;
    if !current_member.belongs_to_room(room_id) {
        return Err(ApiError::MediaAccessDenied {
            request_id: context.request_id(),
        });
    }
    authorize_member(&state, room_id, current_member_id, context.request_id()).await?;
    authorize_member(&state, room_id, stream_member_id, context.request_id()).await?;

    let stream_id = stream_id(room_id, stream_member_id, kind);
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
        kind,
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
    close_session_with_kind(
        SessionCloseInput {
            context,
            headers,
            member_id,
            room_id,
            session_id,
            state,
            stream_member_id,
        },
        StreamKind::Camera,
    )
    .await
}

async fn close_screen_session(
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
    close_session_with_kind(
        SessionCloseInput {
            context,
            headers,
            member_id,
            room_id,
            session_id,
            state,
            stream_member_id,
        },
        StreamKind::Screen,
    )
    .await
}

async fn close_session_with_kind(
    input: SessionCloseInput,
    kind: StreamKind,
) -> Result<StatusCode, ApiError> {
    let SessionCloseInput {
        context,
        headers,
        member_id,
        room_id,
        session_id,
        state,
        stream_member_id,
    } = input;
    let room_id = parse_uuid(&room_id, context.request_id())?;
    let stream_member_id = parse_uuid(&stream_member_id, context.request_id())?;
    let member_id = parse_uuid(&member_id, context.request_id())?;
    let current_member = state
        .session_tokens
        .authenticate(&headers, context.request_id())?;
    let current_member_id = current_member.member_id();
    if !current_member.authorizes(room_id, member_id) || !valid_session_id(&session_id) {
        return Err(ApiError::MediaAccessDenied {
            request_id: context.request_id(),
        });
    }
    let stream_id = stream_id(room_id, stream_member_id, kind);
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
    if should_broadcast_publisher_media_stopped(member_id, stream_member_id) {
        let event = match kind {
            StreamKind::Camera => super::events::RoomEvent::MediaStopped {
                member_id: stream_member_id,
            },
            StreamKind::Screen => super::events::RoomEvent::ScreenShareStopped {
                member_id: stream_member_id,
            },
        };
        state.event_hub.publish(room_id, event);
    }
    Ok(StatusCode::NO_CONTENT)
}

fn should_broadcast_publisher_media_stopped(member_id: Uuid, stream_member_id: Uuid) -> bool {
    // 只有发布者关闭自身的 WHIP 会话时，才代表该媒体流已结束。
    // 订阅者关闭 WHEP 会话只是离开观看，不能影响其他成员的媒体状态。
    member_id == stream_member_id
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
    kind: StreamKind,
    event: &'static str,
) -> Result<Response, ApiError> {
    let stream_id = stream_id(room_id, stream_member_id, kind);
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
    let location = match kind {
        StreamKind::Camera => {
            format!("/media/sessions/{room_id}/{stream_member_id}/{current_member_id}/{session_id}")
        }
        StreamKind::Screen => format!(
            "/media/screen-sessions/{room_id}/{stream_member_id}/{current_member_id}/{session_id}"
        ),
    };
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

fn stream_id(room_id: Uuid, member_id: Uuid, kind: StreamKind) -> String {
    match kind {
        StreamKind::Camera => format!("room-{room_id}-member-{member_id}"),
        StreamKind::Screen => format!("room-{room_id}-member-{member_id}-screen"),
    }
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

#[cfg(test)]
mod tests {
    use uuid::Uuid;

    use super::should_broadcast_publisher_media_stopped;

    #[test]
    fn only_publisher_closing_its_session_stops_a_media_stream() {
        let publisher = Uuid::new_v4();
        let subscriber = Uuid::new_v4();

        assert!(should_broadcast_publisher_media_stopped(
            publisher, publisher
        ));
        assert!(!should_broadcast_publisher_media_stopped(
            subscriber, publisher
        ));
    }
}
