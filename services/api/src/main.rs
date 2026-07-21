use std::env;

use axum::{Router, routing::get};

#[tokio::main]
async fn main() {
    tracing_subscriber::fmt().json().with_target(false).init();

    let address = env::var("SERVER_ADDR").unwrap_or_else(|_| "127.0.0.1:8080".to_owned());
    let listener = tokio::net::TcpListener::bind(&address)
        .await
        .expect("SERVER_ADDR must be a valid bind address");

    tracing::info!(event = "api_started", %address);

    let app = Router::new().route("/health", get(|| async { "ok" }));
    axum::serve(listener, app).await.expect("API server failed");
}
