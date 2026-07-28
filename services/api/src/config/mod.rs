use std::{collections::HashMap, env, net::SocketAddr, str::FromStr};

use axum::http::Uri;
use sqlx::postgres::PgConnectOptions;
use thiserror::Error;

const DEFAULT_SERVER_ADDR: &str = "127.0.0.1:8080";
const DEFAULT_RUST_LOG: &str = "api=info,tower_http=info";

#[derive(Clone)]
pub struct AppConfig {
    pub server_addr: SocketAddr,
    pub database_url: String,
    pub redis_url: String,
    pub live777_url: String,
    pub live777_token: Option<String>,
    pub rust_log: String,
}

#[derive(Debug, Error, PartialEq, Eq)]
pub enum ConfigError {
    #[error("缺少必填环境变量 {name}")]
    Missing { name: &'static str },
    #[error("环境变量 {name} 格式无效：{reason}")]
    Invalid {
        name: &'static str,
        reason: &'static str,
    },
}

impl AppConfig {
    pub fn from_env() -> Result<Self, ConfigError> {
        Self::from_lookup(|name| env::var(name).ok())
    }

    pub fn from_values<I, K, V>(values: I) -> Result<Self, ConfigError>
    where
        I: IntoIterator<Item = (K, V)>,
        K: AsRef<str>,
        V: AsRef<str>,
    {
        let values = values
            .into_iter()
            .map(|(key, value)| (key.as_ref().to_owned(), value.as_ref().to_owned()))
            .collect::<HashMap<_, _>>();

        Self::from_lookup(|name| values.get(name).cloned())
    }

    fn from_lookup<F>(lookup: F) -> Result<Self, ConfigError>
    where
        F: Fn(&str) -> Option<String>,
    {
        let server_addr = lookup("SERVER_ADDR")
            .unwrap_or_else(|| DEFAULT_SERVER_ADDR.to_owned())
            .parse::<SocketAddr>()
            .map_err(|_| ConfigError::Invalid {
                name: "SERVER_ADDR",
                reason: "必须是有效的 IP 地址和端口",
            })?;

        let database_url = required(&lookup, "DATABASE_URL")?;
        if !database_url.starts_with("postgres://") && !database_url.starts_with("postgresql://") {
            return Err(ConfigError::Invalid {
                name: "DATABASE_URL",
                reason: "必须是有效的 PostgreSQL 连接地址",
            });
        }
        PgConnectOptions::from_str(&database_url).map_err(|_| ConfigError::Invalid {
            name: "DATABASE_URL",
            reason: "必须是有效的 PostgreSQL 连接地址",
        })?;

        let redis_url = required(&lookup, "REDIS_URL")?;
        redis::Client::open(redis_url.as_str()).map_err(|_| ConfigError::Invalid {
            name: "REDIS_URL",
            reason: "必须是有效的 Redis 连接地址",
        })?;

        let live777_url = required(&lookup, "LIVE777_URL")?;
        validate_live777_url(&live777_url)?;

        let live777_token = lookup("LIVE777_TOKEN").filter(|value| !value.trim().is_empty());
        let rust_log = lookup("RUST_LOG")
            .filter(|value| !value.trim().is_empty())
            .unwrap_or_else(|| DEFAULT_RUST_LOG.to_owned());

        Ok(Self {
            server_addr,
            database_url,
            redis_url,
            live777_url,
            live777_token,
            rust_log,
        })
    }
}

fn required<F>(lookup: &F, name: &'static str) -> Result<String, ConfigError>
where
    F: Fn(&str) -> Option<String>,
{
    lookup(name)
        .filter(|value| !value.trim().is_empty())
        .ok_or(ConfigError::Missing { name })
}

fn validate_live777_url(value: &str) -> Result<(), ConfigError> {
    let uri = value.parse::<Uri>().map_err(|_| ConfigError::Invalid {
        name: "LIVE777_URL",
        reason: "必须是有效的 HTTP 地址",
    })?;

    if !matches!(uri.scheme_str(), Some("http" | "https")) || uri.authority().is_none() {
        return Err(ConfigError::Invalid {
            name: "LIVE777_URL",
            reason: "必须是包含主机名的 http 或 https 地址",
        });
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::{AppConfig, ConfigError};

    const VALID_VALUES: [(&str, &str); 3] = [
        (
            "DATABASE_URL",
            "postgres://meetnexus:password@localhost:5432/meetnexus",
        ),
        ("REDIS_URL", "redis://localhost:6379/0"),
        ("LIVE777_URL", "http://localhost:7777"),
    ];

    #[test]
    fn loads_complete_configuration() {
        let values = VALID_VALUES.into_iter().chain([
            ("SERVER_ADDR", "127.0.0.1:9090"),
            ("LIVE777_TOKEN", "local-token"),
            ("RUST_LOG", "api=debug"),
        ]);

        let config = AppConfig::from_values(values).expect("完整配置应当加载成功");

        assert_eq!(config.server_addr.to_string(), "127.0.0.1:9090");
        assert_eq!(config.live777_token.as_deref(), Some("local-token"));
        assert_eq!(config.rust_log, "api=debug");
    }

    #[test]
    fn uses_defaults_and_allows_missing_optional_token() {
        let config = AppConfig::from_values(VALID_VALUES).expect("必填配置应当加载成功");

        assert_eq!(config.server_addr.to_string(), "127.0.0.1:8080");
        assert!(config.live777_token.is_none());
        assert_eq!(config.rust_log, "api=info,tower_http=info");
    }

    #[test]
    fn rejects_each_missing_required_value() {
        for missing_name in ["DATABASE_URL", "REDIS_URL", "LIVE777_URL"] {
            let values = VALID_VALUES
                .into_iter()
                .filter(|(name, _)| *name != missing_name);

            assert_eq!(
                AppConfig::from_values(values).err(),
                Some(ConfigError::Missing { name: missing_name })
            );
        }
    }

    #[test]
    fn rejects_invalid_server_address() {
        let values = VALID_VALUES
            .into_iter()
            .chain([("SERVER_ADDR", "localhost:not-a-port")]);

        assert!(matches!(
            AppConfig::from_values(values),
            Err(ConfigError::Invalid {
                name: "SERVER_ADDR",
                ..
            })
        ));
    }

    #[test]
    fn rejects_invalid_database_url_without_exposing_secret() {
        let secret = "super-secret";
        let values = [
            (
                "DATABASE_URL",
                "mysql://meetnexus:super-secret@localhost/db",
            ),
            ("REDIS_URL", "redis://localhost:6379/0"),
            ("LIVE777_URL", "http://localhost:7777"),
        ];

        let error = AppConfig::from_values(values)
            .err()
            .expect("非 PostgreSQL 地址应当被拒绝");

        assert!(matches!(
            error,
            ConfigError::Invalid {
                name: "DATABASE_URL",
                ..
            }
        ));
        assert!(!error.to_string().contains(secret));
    }

    #[test]
    fn rejects_invalid_redis_url() {
        let values = [
            (
                "DATABASE_URL",
                "postgres://meetnexus:password@localhost:5432/meetnexus",
            ),
            ("REDIS_URL", "http://localhost:6379"),
            ("LIVE777_URL", "http://localhost:7777"),
        ];

        assert!(matches!(
            AppConfig::from_values(values),
            Err(ConfigError::Invalid {
                name: "REDIS_URL",
                ..
            })
        ));
    }

    #[test]
    fn rejects_invalid_live777_url() {
        let values = [
            (
                "DATABASE_URL",
                "postgres://meetnexus:password@localhost:5432/meetnexus",
            ),
            ("REDIS_URL", "redis://localhost:6379/0"),
            ("LIVE777_URL", "ftp://localhost:7777"),
        ];

        assert!(matches!(
            AppConfig::from_values(values),
            Err(ConfigError::Invalid {
                name: "LIVE777_URL",
                ..
            })
        ));
    }
}
