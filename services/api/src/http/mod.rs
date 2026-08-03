pub mod auth;
mod error;
pub mod events;
pub mod health;
pub mod media;
mod request_context;
mod response;
pub mod rooms;

use axum::{
    Extension, Router, middleware,
    response::{IntoResponse, Response},
    routing::get,
};

pub use error::ApiError;
use request_context::RequestContext;

pub fn router() -> Router {
    Router::new()
        .route("/health", get(health::health))
        .fallback(route_not_found)
        .method_not_allowed_fallback(method_not_allowed)
        .layer(middleware::from_fn(request_context::attach))
}

pub fn router_with_rooms(state: rooms::RoomApiState) -> Router {
    rooms::router(state)
        .route("/health", get(health::health))
        .fallback(route_not_found)
        .method_not_allowed_fallback(method_not_allowed)
        .layer(middleware::from_fn(request_context::attach))
}

pub fn router_with_rooms_and_media(
    rooms_state: rooms::RoomApiState,
    media_state: media::MediaApiState,
) -> Router {
    router_with_rooms(rooms_state).merge(media::router(media_state))
}

pub fn router_with_rooms_media_and_readiness(
    rooms_state: rooms::RoomApiState,
    media_state: media::MediaApiState,
    readiness_state: health::ReadinessApiState,
) -> Router {
    router_with_rooms_and_media(rooms_state, media_state)
        .merge(router_with_readiness(readiness_state))
}

pub fn router_with_readiness(readiness_state: health::ReadinessApiState) -> Router {
    Router::new()
        .route("/ready", get(health::ready))
        .with_state(readiness_state)
        .layer(middleware::from_fn(request_context::attach))
}

async fn route_not_found(Extension(context): Extension<RequestContext>) -> Response {
    ApiError::RouteNotFound {
        request_id: context.request_id(),
    }
    .into_response()
}

async fn method_not_allowed(Extension(context): Extension<RequestContext>) -> Response {
    ApiError::MethodNotAllowed {
        request_id: context.request_id(),
    }
    .into_response()
}
