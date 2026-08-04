use crate::{
    application::{LeaveRoomOutcome, RoomRepository, StorageError},
    domain::{MemberId, MemberRole, Room, RoomId, RoomMember},
};
use chrono::{DateTime, Utc};
use sqlx::{PgPool, Row};

#[derive(Clone)]
pub struct PgRoomRepository {
    pool: PgPool,
}

impl PgRoomRepository {
    pub fn new(pool: PgPool) -> Self {
        Self { pool }
    }
}

fn storage_error(error: impl std::fmt::Display) -> StorageError {
    StorageError {
        message: error.to_string(),
    }
}

fn member_from_row(row: sqlx::postgres::PgRow) -> Result<RoomMember, StorageError> {
    let role: String = row.try_get("role").map_err(storage_error)?;
    Ok(RoomMember {
        id: row.try_get("member_id").map_err(storage_error)?,
        display_name: row.try_get("display_name").map_err(storage_error)?,
        role: MemberRole::parse(&role).map_err(|error| StorageError {
            message: error.to_string(),
        })?,
        joined_at: row.try_get("joined_at").map_err(storage_error)?,
        online: false,
    })
}

impl RoomRepository for PgRoomRepository {
    async fn create_room_with_host(
        &self,
        room: &Room,
        host: &RoomMember,
    ) -> Result<(), StorageError> {
        let mut transaction = self.pool.begin().await.map_err(storage_error)?;
        sqlx::query("INSERT INTO rooms (id, title, created_at) VALUES ($1, $2, $3)")
            .bind(room.id)
            .bind(&room.title)
            .bind(room.created_at)
            .execute(&mut *transaction)
            .await
            .map_err(storage_error)?;
        sqlx::query("INSERT INTO room_members (room_id, member_id, display_name, role, joined_at) VALUES ($1, $2, $3, $4, $5)").bind(room.id).bind(host.id).bind(&host.display_name).bind(host.role.as_str()).bind(host.joined_at).execute(&mut *transaction).await.map_err(storage_error)?;
        transaction.commit().await.map_err(storage_error)
    }
    async fn find_room(&self, room_id: RoomId) -> Result<Option<Room>, StorageError> {
        let row = sqlx::query(
            "SELECT id, title, created_at FROM rooms WHERE id = $1 AND closed_at IS NULL",
        )
        .bind(room_id)
        .fetch_optional(&self.pool)
        .await
        .map_err(storage_error)?;
        row.map(|row| {
            Ok(Room {
                id: row.try_get("id").map_err(storage_error)?,
                title: row.try_get("title").map_err(storage_error)?,
                created_at: row
                    .try_get::<DateTime<Utc>, _>("created_at")
                    .map_err(storage_error)?,
            })
        })
        .transpose()
    }
    async fn list_members(&self, room_id: RoomId) -> Result<Vec<RoomMember>, StorageError> {
        sqlx::query("SELECT member_id, display_name, role, joined_at FROM room_members WHERE room_id = $1 AND left_at IS NULL ORDER BY joined_at").bind(room_id).fetch_all(&self.pool).await.map_err(storage_error)?.into_iter().map(member_from_row).collect()
    }
    async fn add_member(&self, room_id: RoomId, member: &RoomMember) -> Result<bool, StorageError> {
        let mut transaction = self.pool.begin().await.map_err(storage_error)?;
        let room_is_open =
            sqlx::query("SELECT 1 FROM rooms WHERE id = $1 AND closed_at IS NULL FOR UPDATE")
                .bind(room_id)
                .fetch_optional(&mut *transaction)
                .await
                .map_err(storage_error)?
                .is_some();
        if !room_is_open {
            transaction.commit().await.map_err(storage_error)?;
            return Ok(false);
        }

        sqlx::query("INSERT INTO room_members (room_id, member_id, display_name, role, joined_at) VALUES ($1, $2, $3, $4, $5)").bind(room_id).bind(member.id).bind(&member.display_name).bind(member.role.as_str()).bind(member.joined_at).execute(&mut *transaction).await.map_err(storage_error)?;
        transaction.commit().await.map_err(storage_error)?;
        Ok(true)
    }
    async fn member_exists(
        &self,
        room_id: RoomId,
        member_id: MemberId,
    ) -> Result<bool, StorageError> {
        Ok(sqlx::query(
            "SELECT 1 FROM room_members WHERE room_id = $1 AND member_id = $2 AND left_at IS NULL",
        )
        .bind(room_id)
        .bind(member_id)
        .fetch_optional(&self.pool)
        .await
        .map_err(storage_error)?
        .is_some())
    }
    async fn leave_member_and_close_empty_room(
        &self,
        room_id: RoomId,
        member_id: MemberId,
        left_at: DateTime<Utc>,
    ) -> Result<LeaveRoomOutcome, StorageError> {
        let mut transaction = self.pool.begin().await.map_err(storage_error)?;
        let room_is_open =
            sqlx::query("SELECT 1 FROM rooms WHERE id = $1 AND closed_at IS NULL FOR UPDATE")
                .bind(room_id)
                .fetch_optional(&mut *transaction)
                .await
                .map_err(storage_error)?
                .is_some();
        if !room_is_open {
            transaction.commit().await.map_err(storage_error)?;
            return Ok(LeaveRoomOutcome::default());
        }

        let member_left = sqlx::query(
            "UPDATE room_members SET left_at = $3 WHERE room_id = $1 AND member_id = $2 AND left_at IS NULL",
        )
        .bind(room_id)
        .bind(member_id)
        .bind(left_at)
        .execute(&mut *transaction)
        .await
        .map_err(storage_error)?
        .rows_affected()
            == 1;

        let room_closed = if member_left {
            sqlx::query(
                "UPDATE rooms SET closed_at = $2 WHERE id = $1 AND closed_at IS NULL AND NOT EXISTS (SELECT 1 FROM room_members WHERE room_id = $1 AND left_at IS NULL)",
            )
            .bind(room_id)
            .bind(left_at)
            .execute(&mut *transaction)
            .await
            .map_err(storage_error)?
            .rows_affected()
                == 1
        } else {
            false
        };

        transaction.commit().await.map_err(storage_error)?;
        Ok(LeaveRoomOutcome {
            member_left,
            room_closed,
        })
    }
}
