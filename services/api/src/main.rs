use std::process;

use api::{
    app_with_rooms,
    config::AppConfig,
    http::rooms::RoomApiState,
    infrastructure::{postgres::PgRoomRepository, redis_presence::RedisPresenceRepository},
    telemetry,
};

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

    let database = sqlx::postgres::PgPoolOptions::new()
        .max_connections(5)
        .connect(&config.database_url)
        .await
        .unwrap_or_else(|error| {
            eprintln!("PostgreSQL 连接失败：{error}");
            process::exit(1);
        });
    let redis = redis::Client::open(config.redis_url.as_str()).unwrap_or_else(|error| {
        eprintln!("Redis 客户端创建失败：{error}");
        process::exit(1);
    });
    if let Err(error) = redis.get_multiplexed_async_connection().await {
        eprintln!("Redis 连接失败：{error}");
        process::exit(1);
    }
    let state = RoomApiState {
        rooms: PgRoomRepository::new(database),
        presence: RedisPresenceRepository::new(redis),
    };

    if let Err(error) = axum::serve(listener, app_with_rooms(state)).await {
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
