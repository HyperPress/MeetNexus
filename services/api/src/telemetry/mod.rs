use thiserror::Error;
use tracing_subscriber::{EnvFilter, fmt, util::SubscriberInitExt};

#[derive(Debug, Error)]
pub enum TelemetryError {
    #[error("RUST_LOG 配置无效")]
    InvalidFilter,
    #[error("初始化结构化日志失败")]
    Initialization,
}

pub fn init(log_filter: &str) -> Result<(), TelemetryError> {
    let filter = EnvFilter::try_new(log_filter).map_err(|_| TelemetryError::InvalidFilter)?;

    fmt()
        .with_env_filter(filter)
        .json()
        .with_target(false)
        .finish()
        .try_init()
        .map_err(|_| TelemetryError::Initialization)
}
