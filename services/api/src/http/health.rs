use axum::{Extension, Json, extract::State};
use serde::Serialize;
use sqlx::PgPool;
use std::time::Duration;

use crate::infrastructure::live777::Live777Client;

use super::{ApiError, request_context::RequestContext, response::SuccessResponse};

const DEPENDENCY_PROBE_TIMEOUT: Duration = Duration::from_secs(2);

#[derive(Clone)]
pub struct ReadinessApiState {
    database: PgPool,
    redis: redis::Client,
    live777: Live777Client,
}

impl ReadinessApiState {
    pub fn new(database: PgPool, redis: redis::Client, live777: Live777Client) -> Self {
        Self {
            database,
            redis,
            live777,
        }
    }
}

#[derive(Debug, Serialize)]
pub struct HealthData {
    status: &'static str,
    service: &'static str,
    version: &'static str,
}

#[derive(Debug, Serialize)]
pub struct ReadinessData {
    status: &'static str,
    dependencies: DependencyStatus,
}

#[derive(Debug, Serialize)]
struct DependencyStatus {
    postgresql: bool,
    redis: bool,
    live777: bool,
}

pub async fn health(
    Extension(context): Extension<RequestContext>,
) -> Json<SuccessResponse<HealthData>> {
    Json(SuccessResponse {
        data: HealthData {
            status: "ok",
            service: "meetnexus-api",
            version: env!("CARGO_PKG_VERSION"),
        },
        request_id: context.request_id(),
    })
}

pub async fn ready(
    State(state): State<ReadinessApiState>,
    Extension(context): Extension<RequestContext>,
) -> Result<Json<SuccessResponse<ReadinessData>>, ApiError> {
    let (postgresql, redis, live777) = tokio::join!(
        database_ready(&state.database),
        redis_ready(&state.redis),
        live777_ready(&state.live777),
    );
    let dependencies = DependencyStatus {
        postgresql,
        redis,
        live777,
    };

    if !dependencies.postgresql || !dependencies.redis || !dependencies.live777 {
        tracing::warn!(
            request_id = %context.request_id(),
            room_id = "-",
            user_id = "-",
            stream_id = "-",
            event = "readiness_check_failed",
            error_code = "DEPENDENCY_UNAVAILABLE",
            postgresql = dependencies.postgresql,
            redis = dependencies.redis,
            live777 = dependencies.live777,
        );
        return Err(ApiError::DependencyUnavailable {
            request_id: context.request_id(),
        });
    }

    Ok(Json(SuccessResponse {
        data: ReadinessData {
            status: "ready",
            dependencies,
        },
        request_id: context.request_id(),
    }))
}

async fn database_ready(database: &PgPool) -> bool {
    matches!(
        tokio::time::timeout(
            DEPENDENCY_PROBE_TIMEOUT,
            sqlx::query_scalar::<_, i32>("SELECT 1").fetch_one(database),
        )
        .await,
        Ok(Ok(_))
    )
}

async fn redis_ready(redis: &redis::Client) -> bool {
    let ping = async {
        let mut connection = redis.get_multiplexed_async_connection().await?;
        redis::cmd("PING")
            .query_async::<String>(&mut connection)
            .await?;
        Ok::<(), redis::RedisError>(())
    };
    matches!(
        tokio::time::timeout(DEPENDENCY_PROBE_TIMEOUT, ping).await,
        Ok(Ok(()))
    )
}

async fn live777_ready(live777: &Live777Client) -> bool {
    matches!(
        tokio::time::timeout(DEPENDENCY_PROBE_TIMEOUT, live777.probe()).await,
        Ok(Ok(()))
    )
}
