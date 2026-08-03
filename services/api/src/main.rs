use std::process;

use api::{
    config::AppConfig,
    http::{
        auth::SessionTokenService, events::RoomEventHub, health::ReadinessApiState,
        rooms::RoomApiState,
    },
    infrastructure::{
        live777::Live777Client, postgres::PgRoomRepository,
        postgres_recordings::PgRecordingRepository, redis_presence::RedisPresenceRepository,
    },
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
        rooms: PgRoomRepository::new(database.clone()),
        presence: RedisPresenceRepository::new(redis.clone()),
        session_tokens: SessionTokenService::new(&config.auth_jwt_secret),
        event_hub: RoomEventHub::default(),
    };
    let live777 = Live777Client::new(&config.live777_url, config.live777_token.clone())
        .unwrap_or_else(|error| {
            eprintln!("Live777 配置无效：{error}");
            process::exit(1);
        });
    let media_state = api::http::media::MediaApiState {
        live777: live777.clone(),
        rooms: state.rooms.clone(),
        session_tokens: state.session_tokens.clone(),
        event_hub: state.event_hub.clone(),
    };
    let recordings_state = api::http::recordings::RecordingApiState {
        live777: live777.clone(),
        recordings: PgRecordingRepository::new(database.clone()),
        rooms: state.rooms.clone(),
        session_tokens: state.session_tokens.clone(),
    };

    let readiness_state = ReadinessApiState::new(database, redis, live777);

    if let Err(error) = axum::serve(
        listener,
        api::app_with_rooms_media_recordings_and_readiness(
            state,
            media_state,
            recordings_state,
            readiness_state,
        ),
    )
    .await
    {
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
