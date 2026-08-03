use axum::{
    Extension, Json, Router,
    extract::{Path, State},
    http::{HeaderMap, StatusCode, header},
    response::{IntoResponse, Response},
    routing::{get, post},
};
use chrono::Utc;
use uuid::Uuid;

use crate::{
    application::{RecordingRepository, RoomRepository},
    domain::{Recording, RecordingState},
    infrastructure::{
        live777::Live777Client,
        postgres::PgRoomRepository,
        postgres_recordings::PgRecordingRepository,
        recording_storage::{RecordingFileError, RecordingFileStorage},
    },
};

use super::{
    ApiError,
    auth::SessionTokenService,
    request_context::{self, RequestContext},
    response::SuccessResponse,
};

#[derive(Clone)]
pub struct RecordingApiState {
    pub live777: Live777Client,
    pub recordings: PgRecordingRepository,
    pub recording_files: RecordingFileStorage,
    pub rooms: PgRoomRepository,
    pub session_tokens: SessionTokenService,
}

pub fn router(state: RecordingApiState) -> Router {
    Router::new()
        .route("/rooms/{room_id}/recordings", get(list_recordings))
        .route(
            "/rooms/{room_id}/recordings/{member_id}",
            post(start_recording),
        )
        .route(
            "/rooms/{room_id}/recordings/{recording_id}/stop",
            post(stop_recording),
        )
        .route(
            "/rooms/{room_id}/recordings/{recording_id}/playback/{file_name}",
            get(read_playback_file),
        )
        .with_state(state)
        .layer(axum::middleware::from_fn(request_context::attach))
}

async fn list_recordings(
    State(state): State<RecordingApiState>,
    Extension(context): Extension<RequestContext>,
    Path(room_id): Path<String>,
    headers: HeaderMap,
) -> Result<Json<SuccessResponse<Vec<Recording>>>, ApiError> {
    let room_id = parse_id(&room_id, context.request_id())?;
    authorize_room_member(&state, room_id, &headers, context.request_id(), false).await?;
    let recordings = state
        .recordings
        .list_recordings(room_id)
        .await
        .map_err(|_| ApiError::Internal {
            request_id: context.request_id(),
        })?;
    Ok(Json(SuccessResponse {
        data: recordings,
        request_id: context.request_id(),
    }))
}

async fn start_recording(
    State(state): State<RecordingApiState>,
    Extension(context): Extension<RequestContext>,
    Path((room_id, member_id)): Path<(String, String)>,
    headers: HeaderMap,
) -> Result<(StatusCode, Json<SuccessResponse<Recording>>), ApiError> {
    let room_id = parse_id(&room_id, context.request_id())?;
    let member_id = parse_id(&member_id, context.request_id())?;
    let host_id =
        authorize_room_member(&state, room_id, &headers, context.request_id(), true).await?;
    if !state
        .rooms
        .member_exists(room_id, member_id)
        .await
        .map_err(|_| ApiError::Internal {
            request_id: context.request_id(),
        })?
    {
        return Err(ApiError::MemberNotFound {
            request_id: context.request_id(),
        });
    }
    let stream_id = stream_id(room_id, member_id);
    let upstream = state
        .live777
        .start_recording(&stream_id)
        .await
        .map_err(|_| ApiError::MediaServiceUnavailable {
            request_id: context.request_id(),
        })?;
    let recording = Recording {
        id: Uuid::new_v4(),
        room_id,
        member_id,
        started_by: host_id,
        live777_record_id: (!upstream.record_id.is_empty()).then_some(upstream.record_id),
        mpd_path: Some(upstream.mpd_path),
        state: RecordingState::Recording,
        started_at: Utc::now(),
        stopped_at: None,
    };
    if state.recordings.create_recording(&recording).await.is_err() {
        let _ = state.live777.stop_recording(&stream_id).await;
        return Err(ApiError::Internal {
            request_id: context.request_id(),
        });
    }
    log_recording(
        context.request_id(),
        room_id,
        host_id,
        &stream_id,
        "recording_started",
    );
    Ok((
        StatusCode::CREATED,
        Json(SuccessResponse {
            data: recording,
            request_id: context.request_id(),
        }),
    ))
}

async fn stop_recording(
    State(state): State<RecordingApiState>,
    Extension(context): Extension<RequestContext>,
    Path((room_id, recording_id)): Path<(String, String)>,
    headers: HeaderMap,
) -> Result<Json<SuccessResponse<Recording>>, ApiError> {
    let room_id = parse_id(&room_id, context.request_id())?;
    let recording_id = parse_id(&recording_id, context.request_id())?;
    let host_id =
        authorize_room_member(&state, room_id, &headers, context.request_id(), true).await?;
    let recording = state
        .recordings
        .find_recording(room_id, recording_id)
        .await
        .map_err(|_| ApiError::Internal {
            request_id: context.request_id(),
        })?
        .ok_or(ApiError::RecordingNotFound {
            request_id: context.request_id(),
        })?;
    if recording.state != RecordingState::Recording {
        return Err(ApiError::RecordingNotFound {
            request_id: context.request_id(),
        });
    }
    let stream_id = stream_id(room_id, recording.member_id);
    state
        .live777
        .stop_recording(&stream_id)
        .await
        .map_err(|_| ApiError::MediaServiceUnavailable {
            request_id: context.request_id(),
        })?;
    let stopped = state
        .recordings
        .mark_recording_stopped(room_id, recording_id, Utc::now())
        .await
        .map_err(|_| ApiError::Internal {
            request_id: context.request_id(),
        })?
        .ok_or(ApiError::RecordingNotFound {
            request_id: context.request_id(),
        })?;
    log_recording(
        context.request_id(),
        room_id,
        host_id,
        &stream_id,
        "recording_stopped",
    );
    Ok(Json(SuccessResponse {
        data: stopped,
        request_id: context.request_id(),
    }))
}

async fn read_playback_file(
    State(state): State<RecordingApiState>,
    Extension(context): Extension<RequestContext>,
    Path((room_id, recording_id, file_name)): Path<(String, String, String)>,
    headers: HeaderMap,
) -> Result<Response, ApiError> {
    let room_id = parse_id(&room_id, context.request_id())?;
    let recording_id = parse_id(&recording_id, context.request_id())?;
    let reader_id =
        authorize_room_member(&state, room_id, &headers, context.request_id(), false).await?;
    let recording = state
        .recordings
        .find_recording(room_id, recording_id)
        .await
        .map_err(|_| ApiError::Internal {
            request_id: context.request_id(),
        })?
        .ok_or(ApiError::RecordingNotFound {
            request_id: context.request_id(),
        })?;
    if recording.state != RecordingState::Stopped {
        return Err(ApiError::RecordingNotReady {
            request_id: context.request_id(),
        });
    }
    let mpd_path = recording
        .mpd_path
        .as_deref()
        .ok_or(ApiError::RecordingNotReady {
            request_id: context.request_id(),
        })?;
    let file = state
        .recording_files
        .read(mpd_path, &file_name)
        .await
        .map_err(|error| match error {
            RecordingFileError::InvalidPath | RecordingFileError::NotFound => {
                ApiError::RecordingNotFound {
                    request_id: context.request_id(),
                }
            }
            RecordingFileError::Unavailable => ApiError::RecordingFileUnavailable {
                request_id: context.request_id(),
            },
        })?;
    log_recording(
        context.request_id(),
        room_id,
        reader_id,
        &stream_id(room_id, recording.member_id),
        "recording_playback_read",
    );
    Ok((
        StatusCode::OK,
        [
            (header::CONTENT_TYPE, file.content_type),
            (header::CACHE_CONTROL, "private, no-store"),
            (header::CONTENT_DISPOSITION, "inline"),
        ],
        file.bytes,
    )
        .into_response())
}

async fn authorize_room_member(
    state: &RecordingApiState,
    room_id: Uuid,
    headers: &HeaderMap,
    request_id: Uuid,
    require_host: bool,
) -> Result<Uuid, ApiError> {
    let member = state.session_tokens.authenticate(headers, request_id)?;
    if !member.belongs_to_room(room_id) || (require_host && !member.is_host()) {
        return Err(ApiError::RoomMemberAccessDenied { request_id });
    }
    let member_id = member.member_id();
    if !state
        .rooms
        .member_exists(room_id, member_id)
        .await
        .map_err(|_| ApiError::Internal { request_id })?
    {
        return Err(ApiError::RoomMemberAccessDenied { request_id });
    }
    Ok(member_id)
}

fn parse_id(value: &str, request_id: Uuid) -> Result<Uuid, ApiError> {
    Uuid::parse_str(value).map_err(|_| ApiError::BadRequest {
        request_id,
        message: "会议号、成员编号或录制编号格式无效",
    })
}
fn stream_id(room_id: Uuid, member_id: Uuid) -> String {
    format!("room-{room_id}-member-{member_id}")
}
fn log_recording(
    request_id: Uuid,
    room_id: Uuid,
    user_id: Uuid,
    stream_id: &str,
    event: &'static str,
) {
    tracing::info!(request_id = %request_id, room_id = %room_id, user_id = %user_id, stream_id, event, error_code = "-");
}
