use std::process;

use api::{app, config::AppConfig, telemetry};

#[tokio::main]
async fn main() {
    let config = AppConfig::from_env().unwrap_or_else(|error| {
        eprintln!("API 配置加载失败：{error}");
        process::exit(1);
    });
    telemetry::init(&config.rust_log).unwrap_or_else(|error| {
        eprintln!("API 日志初始化失败：{error}");
        process::exit(1);
    });

    let listener = tokio::net::TcpListener::bind(config.server_addr)
        .await
        .unwrap_or_else(|error| {
            eprintln!("API 监听地址绑定失败：{error}");
            process::exit(1);
        });

    tracing::info!(
        request_id = "-",
        room_id = "-",
        user_id = "-",
        stream_id = "-",
        event = "api_started",
        error_code = "-",
        address = %config.server_addr,
    );

    if let Err(error) = axum::serve(listener, app()).await {
        tracing::error!(
            request_id = "-",
            room_id = "-",
            user_id = "-",
            stream_id = "-",
            event = "api_stopped",
            error_code = "API_SERVE_ERROR",
            error = %error,
        );
    }
}
