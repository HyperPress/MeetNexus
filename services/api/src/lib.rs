pub mod config;
pub mod http;
pub mod telemetry;

use axum::Router;

pub fn app() -> Router {
    http::router()
}
