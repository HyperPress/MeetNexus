use std::env;

use api::{
    application::{PresenceRepository, RoomRepository},
    domain::{MemberRole, Recording, RecordingState, Room, RoomMember},
    infrastructure::{
        postgres::PgRoomRepository,
        postgres_recordings::{CreateRecordingError, PgRecordingRepository},
        redis_presence::RedisPresenceRepository,
    },
};
use chrono::Utc;
use uuid::Uuid;

#[tokio::test]
#[ignore = "需要已执行房间迁移的 PostgreSQL 和正在运行的 Redis/Memurai"]
async fn postgresql_and_redis_store_room_members_and_presence() {
    let database_url = env::var("DATABASE_URL").expect("集成测试需要 DATABASE_URL");
    let redis_url = env::var("REDIS_URL").expect("集成测试需要 REDIS_URL");
    let pool = sqlx::postgres::PgPoolOptions::new()
        .max_connections(1)
        .connect(&database_url)
        .await
        .expect("应当能够连接 PostgreSQL");
    let rooms = PgRoomRepository::new(pool.clone());
    let presence = RedisPresenceRepository::new(
        redis::Client::open(redis_url).expect("应当能够创建 Redis 客户端"),
    );
    let room = Room {
        id: Uuid::new_v4(),
        meeting_code: "901-234-567".to_owned(),
        title: "存储集成测试".to_owned(),
        created_at: Utc::now(),
    };
    let member = RoomMember {
        id: Uuid::new_v4(),
        display_name: "测试成员".to_owned(),
        role: MemberRole::Host,
        joined_at: Utc::now(),
        online: true,
    };

    rooms
        .create_room_with_host(&room, &member)
        .await
        .expect("应当能够保存会议及主持人");
    presence
        .mark_online(room.id, member.id)
        .await
        .expect("应当能够记录在线成员");

    assert_eq!(
        rooms
            .find_room(room.id)
            .await
            .expect("应当能够查询会议")
            .expect("会议应当存在")
            .title,
        room.title
    );
    assert_eq!(
        rooms
            .list_members(room.id)
            .await
            .expect("应当能够查询成员")
            .len(),
        1
    );
    assert!(
        presence
            .online_member_ids(room.id)
            .await
            .expect("应当能够查询在线成员")
            .contains(&member.id)
    );

    presence
        .mark_offline(room.id, member.id)
        .await
        .expect("应当能够移除在线状态");
    let outcome = rooms
        .leave_member_and_close_empty_room(room.id, member.id, Utc::now())
        .await
        .expect("应当能够退出成员并关闭空会议");
    assert!(outcome.member_left);
    assert!(outcome.room_closed);
    assert!(
        rooms
            .find_room(room.id)
            .await
            .expect("应当能够查询已关闭会议")
            .is_none()
    );
    assert!(
        rooms
            .list_members(room.id)
            .await
            .expect("应当能够查询已离会成员")
            .is_empty()
    );
    sqlx::query("DELETE FROM rooms WHERE id = $1")
        .bind(room.id)
        .execute(&pool)
        .await
        .expect("应当能够清理集成测试会议");
}

#[tokio::test]
#[ignore = "需要已执行录制迁移的 PostgreSQL"]
async fn postgresql_rejects_duplicate_active_recordings_for_the_same_member() {
    let database_url = env::var("DATABASE_URL").expect("集成测试需要 DATABASE_URL");
    let pool = sqlx::postgres::PgPoolOptions::new()
        .max_connections(1)
        .connect(&database_url)
        .await
        .expect("应当能够连接 PostgreSQL");
    let rooms = PgRoomRepository::new(pool.clone());
    let recordings = PgRecordingRepository::new(pool.clone());
    let room = Room {
        id: Uuid::new_v4(),
        meeting_code: "891-234-567".to_owned(),
        title: "录制并发保护测试".to_owned(),
        created_at: Utc::now(),
    };
    let host = RoomMember {
        id: Uuid::new_v4(),
        display_name: "测试主持人".to_owned(),
        role: MemberRole::Host,
        joined_at: Utc::now(),
        online: true,
    };
    rooms
        .create_room_with_host(&room, &host)
        .await
        .expect("应当能够保存测试会议");
    let recording = Recording {
        id: Uuid::new_v4(),
        room_id: room.id,
        member_id: host.id,
        started_by: host.id,
        live777_record_id: None,
        mpd_path: None,
        state: RecordingState::Recording,
        started_at: Utc::now(),
        stopped_at: None,
    };
    recordings
        .create_recording_exclusive(&recording)
        .await
        .expect("第一条活动录制应当能够写入");
    let duplicate = Recording {
        id: Uuid::new_v4(),
        ..recording
    };
    assert!(matches!(
        recordings.create_recording_exclusive(&duplicate).await,
        Err(CreateRecordingError::AlreadyActive)
    ));
    sqlx::query("DELETE FROM rooms WHERE id = $1")
        .bind(room.id)
        .execute(&pool)
        .await
        .expect("应当能够清理测试会议");
}
