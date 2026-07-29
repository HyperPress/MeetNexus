use crate::{
    application::{PresenceRepository, StorageError},
    domain::{MemberId, RoomId},
};
use chrono::Utc;
use std::collections::HashSet;
use uuid::Uuid;

const PRESENCE_TTL_SECONDS: i64 = 90;
#[derive(Clone)]
pub struct RedisPresenceRepository {
    client: redis::Client,
}
impl RedisPresenceRepository {
    pub fn new(client: redis::Client) -> Self {
        Self { client }
    }
    fn key(room_id: RoomId) -> String {
        format!("meetnexus:room:{room_id}:online-members")
    }
}
fn storage_error(error: impl std::fmt::Display) -> StorageError {
    StorageError {
        message: error.to_string(),
    }
}
impl PresenceRepository for RedisPresenceRepository {
    async fn mark_online(&self, room_id: RoomId, member_id: MemberId) -> Result<(), StorageError> {
        let mut con = self
            .client
            .get_multiplexed_async_connection()
            .await
            .map_err(storage_error)?;
        let key = Self::key(room_id);
        let expiry = Utc::now().timestamp() + PRESENCE_TTL_SECONDS;
        redis::cmd("ZADD")
            .arg(&key)
            .arg(expiry)
            .arg(member_id.to_string())
            .query_async::<()>(&mut con)
            .await
            .map_err(storage_error)?;
        redis::cmd("EXPIRE")
            .arg(&key)
            .arg(PRESENCE_TTL_SECONDS)
            .query_async::<()>(&mut con)
            .await
            .map_err(storage_error)
    }
    async fn mark_offline(&self, room_id: RoomId, member_id: MemberId) -> Result<(), StorageError> {
        let mut con = self
            .client
            .get_multiplexed_async_connection()
            .await
            .map_err(storage_error)?;
        redis::cmd("ZREM")
            .arg(Self::key(room_id))
            .arg(member_id.to_string())
            .query_async::<()>(&mut con)
            .await
            .map_err(storage_error)
    }
    async fn online_member_ids(&self, room_id: RoomId) -> Result<HashSet<MemberId>, StorageError> {
        let mut con = self
            .client
            .get_multiplexed_async_connection()
            .await
            .map_err(storage_error)?;
        let key = Self::key(room_id);
        let now = Utc::now().timestamp();
        redis::cmd("ZREMRANGEBYSCORE")
            .arg(&key)
            .arg("-inf")
            .arg(now)
            .query_async::<()>(&mut con)
            .await
            .map_err(storage_error)?;
        let values: Vec<String> = redis::cmd("ZRANGE")
            .arg(&key)
            .arg(0)
            .arg(-1)
            .query_async(&mut con)
            .await
            .map_err(storage_error)?;
        Ok(values
            .into_iter()
            .filter_map(|value| Uuid::parse_str(&value).ok())
            .collect())
    }
}
