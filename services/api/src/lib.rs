pub mod application;
pub mod config;
pub mod domain;
pub mod http;
pub mod infrastructure;
pub mod telemetry;

use axum::Router;

pub fn app() -> Router {
    http::router()
}

pub fn app_with_rooms(state: http::rooms::RoomApiState) -> Router {
    http::router_with_rooms(state)
}

pub fn app_with_rooms_and_media(
    rooms_state: http::rooms::RoomApiState,
    media_state: http::media::MediaApiState,
) -> Router {
    http::router_with_rooms_and_media(rooms_state, media_state)
}

pub fn app_with_rooms_media_and_readiness(
    rooms_state: http::rooms::RoomApiState,
    media_state: http::media::MediaApiState,
    readiness_state: http::health::ReadinessApiState,
) -> Router {
    http::router_with_rooms_media_and_readiness(rooms_state, media_state, readiness_state)
}

pub fn app_with_rooms_media_recordings_and_readiness(
    rooms_state: http::rooms::RoomApiState,
    media_state: http::media::MediaApiState,
    recordings_state: http::recordings::RecordingApiState,
    readiness_state: http::health::ReadinessApiState,
) -> Router {
    http::router_with_rooms_media_recordings_and_readiness(
        rooms_state,
        media_state,
        recordings_state,
        readiness_state,
    )
}
