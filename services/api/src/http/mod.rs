mod error;
mod health;
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
