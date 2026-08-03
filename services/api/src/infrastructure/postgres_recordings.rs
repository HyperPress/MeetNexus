use chrono::{DateTime, Utc};
use sqlx::{PgPool, Row};
use uuid::Uuid;

use crate::{
    application::{RecordingRepository, StorageError},
    domain::{Recording, RecordingState, RoomId},
};

#[derive(Clone)]
pub struct PgRecordingRepository {
    pool: PgPool,
}

impl PgRecordingRepository {
    pub fn new(pool: PgPool) -> Self {
        Self { pool }
    }
}

fn storage_error(error: impl std::fmt::Display) -> StorageError {
    StorageError {
        message: error.to_string(),
    }
}

fn recording_from_row(row: sqlx::postgres::PgRow) -> Result<Recording, StorageError> {
    let state: String = row.try_get("state").map_err(storage_error)?;
    Ok(Recording {
        id: row.try_get("id").map_err(storage_error)?,
        room_id: row.try_get("room_id").map_err(storage_error)?,
        member_id: row.try_get("member_id").map_err(storage_error)?,
        started_by: row.try_get("started_by").map_err(storage_error)?,
        live777_record_id: row.try_get("live777_record_id").map_err(storage_error)?,
        mpd_path: row.try_get("mpd_path").map_err(storage_error)?,
        state: RecordingState::parse(&state).map_err(|error| StorageError {
            message: error.to_string(),
        })?,
        started_at: row.try_get("started_at").map_err(storage_error)?,
        stopped_at: row.try_get("stopped_at").map_err(storage_error)?,
    })
}

impl RecordingRepository for PgRecordingRepository {
    async fn create_recording(&self, recording: &Recording) -> Result<(), StorageError> {
        sqlx::query("INSERT INTO recordings (id, room_id, member_id, started_by, live777_record_id, mpd_path, state, started_at, stopped_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)")
            .bind(recording.id).bind(recording.room_id).bind(recording.member_id).bind(recording.started_by).bind(&recording.live777_record_id).bind(&recording.mpd_path).bind(recording.state.as_str()).bind(recording.started_at).bind(recording.stopped_at).execute(&self.pool).await.map_err(storage_error)?;
        Ok(())
    }

    async fn find_recording(
        &self,
        room_id: RoomId,
        recording_id: Uuid,
    ) -> Result<Option<Recording>, StorageError> {
        sqlx::query("SELECT id, room_id, member_id, started_by, live777_record_id, mpd_path, state, started_at, stopped_at FROM recordings WHERE room_id = $1 AND id = $2")
            .bind(room_id).bind(recording_id).fetch_optional(&self.pool).await.map_err(storage_error)?.map(recording_from_row).transpose()
    }

    async fn list_recordings(&self, room_id: RoomId) -> Result<Vec<Recording>, StorageError> {
        sqlx::query("SELECT id, room_id, member_id, started_by, live777_record_id, mpd_path, state, started_at, stopped_at FROM recordings WHERE room_id = $1 ORDER BY started_at DESC")
            .bind(room_id).fetch_all(&self.pool).await.map_err(storage_error)?.into_iter().map(recording_from_row).collect()
    }

    async fn mark_recording_stopped(
        &self,
        room_id: RoomId,
        recording_id: Uuid,
        stopped_at: DateTime<Utc>,
    ) -> Result<Option<Recording>, StorageError> {
        sqlx::query("UPDATE recordings SET state = 'stopped', stopped_at = $3 WHERE room_id = $1 AND id = $2 AND state = 'recording' RETURNING id, room_id, member_id, started_by, live777_record_id, mpd_path, state, started_at, stopped_at")
            .bind(room_id).bind(recording_id).bind(stopped_at).fetch_optional(&self.pool).await.map_err(storage_error)?.map(recording_from_row).transpose()
    }
}
