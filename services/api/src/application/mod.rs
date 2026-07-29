use std::{collections::HashSet, sync::Arc};

use chrono::Utc;
use thiserror::Error;
use uuid::Uuid;

use crate::domain::{self, MemberId, MemberRole, Room, RoomDetails, RoomId, RoomMember};

#[derive(Debug, Error, Clone)]
#[error("存储操作失败：{message}")]
pub struct StorageError {
    pub message: String,
}

#[allow(async_fn_in_trait)]
pub trait RoomRepository: Send + Sync {
    async fn create_room_with_host(
        &self,
        room: &Room,
        host: &RoomMember,
    ) -> Result<(), StorageError>;
    async fn find_room(&self, room_id: RoomId) -> Result<Option<Room>, StorageError>;
    async fn list_members(&self, room_id: RoomId) -> Result<Vec<RoomMember>, StorageError>;
    async fn add_member(&self, room_id: RoomId, member: &RoomMember) -> Result<(), StorageError>;
    async fn member_exists(
        &self,
        room_id: RoomId,
        member_id: MemberId,
    ) -> Result<bool, StorageError>;
    async fn remove_member(
        &self,
        room_id: RoomId,
        member_id: MemberId,
    ) -> Result<bool, StorageError>;
}

#[allow(async_fn_in_trait)]
pub trait PresenceRepository: Send + Sync {
    async fn mark_online(&self, room_id: RoomId, member_id: MemberId) -> Result<(), StorageError>;
    async fn mark_offline(&self, room_id: RoomId, member_id: MemberId) -> Result<(), StorageError>;
    async fn online_member_ids(&self, room_id: RoomId) -> Result<HashSet<MemberId>, StorageError>;
}

impl<T: RoomRepository + ?Sized> RoomRepository for &T {
    async fn create_room_with_host(
        &self,
        room: &Room,
        host: &RoomMember,
    ) -> Result<(), StorageError> {
        (*self).create_room_with_host(room, host).await
    }
    async fn find_room(&self, room_id: RoomId) -> Result<Option<Room>, StorageError> {
        (*self).find_room(room_id).await
    }
    async fn list_members(&self, room_id: RoomId) -> Result<Vec<RoomMember>, StorageError> {
        (*self).list_members(room_id).await
    }
    async fn add_member(&self, room_id: RoomId, member: &RoomMember) -> Result<(), StorageError> {
        (*self).add_member(room_id, member).await
    }
    async fn member_exists(
        &self,
        room_id: RoomId,
        member_id: MemberId,
    ) -> Result<bool, StorageError> {
        (*self).member_exists(room_id, member_id).await
    }
    async fn remove_member(
        &self,
        room_id: RoomId,
        member_id: MemberId,
    ) -> Result<bool, StorageError> {
        (*self).remove_member(room_id, member_id).await
    }
}

impl<T: PresenceRepository + ?Sized> PresenceRepository for &T {
    async fn mark_online(&self, room_id: RoomId, member_id: MemberId) -> Result<(), StorageError> {
        (*self).mark_online(room_id, member_id).await
    }
    async fn mark_offline(&self, room_id: RoomId, member_id: MemberId) -> Result<(), StorageError> {
        (*self).mark_offline(room_id, member_id).await
    }
    async fn online_member_ids(&self, room_id: RoomId) -> Result<HashSet<MemberId>, StorageError> {
        (*self).online_member_ids(room_id).await
    }
}

impl<T: RoomRepository + ?Sized> RoomRepository for Arc<T> {
    async fn create_room_with_host(
        &self,
        room: &Room,
        host: &RoomMember,
    ) -> Result<(), StorageError> {
        self.as_ref().create_room_with_host(room, host).await
    }
    async fn find_room(&self, room_id: RoomId) -> Result<Option<Room>, StorageError> {
        self.as_ref().find_room(room_id).await
    }
    async fn list_members(&self, room_id: RoomId) -> Result<Vec<RoomMember>, StorageError> {
        self.as_ref().list_members(room_id).await
    }
    async fn add_member(&self, room_id: RoomId, member: &RoomMember) -> Result<(), StorageError> {
        self.as_ref().add_member(room_id, member).await
    }
    async fn member_exists(
        &self,
        room_id: RoomId,
        member_id: MemberId,
    ) -> Result<bool, StorageError> {
        self.as_ref().member_exists(room_id, member_id).await
    }
    async fn remove_member(
        &self,
        room_id: RoomId,
        member_id: MemberId,
    ) -> Result<bool, StorageError> {
        self.as_ref().remove_member(room_id, member_id).await
    }
}

impl<T: PresenceRepository + ?Sized> PresenceRepository for Arc<T> {
    async fn mark_online(&self, room_id: RoomId, member_id: MemberId) -> Result<(), StorageError> {
        self.as_ref().mark_online(room_id, member_id).await
    }
    async fn mark_offline(&self, room_id: RoomId, member_id: MemberId) -> Result<(), StorageError> {
        self.as_ref().mark_offline(room_id, member_id).await
    }
    async fn online_member_ids(&self, room_id: RoomId) -> Result<HashSet<MemberId>, StorageError> {
        self.as_ref().online_member_ids(room_id).await
    }
}

#[derive(Debug, Error)]
pub enum RoomServiceError {
    #[error(transparent)]
    Validation(#[from] domain::DomainError),
    #[error("会议不存在")]
    RoomNotFound,
    #[error("成员不存在")]
    MemberNotFound,
    #[error(transparent)]
    Storage(#[from] StorageError),
}

pub struct RoomService<R, P> {
    rooms: R,
    presence: P,
}

impl<R, P> RoomService<R, P>
where
    R: RoomRepository,
    P: PresenceRepository,
{
    pub fn new(rooms: R, presence: P) -> Self {
        Self { rooms, presence }
    }

    pub async fn create_room(
        &self,
        title: &str,
        display_name: &str,
    ) -> Result<RoomDetails, RoomServiceError> {
        let room = Room {
            id: Uuid::new_v4(),
            title: domain::validate_room_title(title)?,
            created_at: Utc::now(),
        };
        let host = RoomMember {
            id: Uuid::new_v4(),
            display_name: domain::validate_display_name(display_name)?,
            role: MemberRole::Host,
            joined_at: Utc::now(),
            online: true,
        };
        self.rooms.create_room_with_host(&room, &host).await?;
        self.presence.mark_online(room.id, host.id).await?;
        Ok(RoomDetails {
            room,
            members: vec![host],
        })
    }

    pub async fn get_room(&self, room_id: RoomId) -> Result<RoomDetails, RoomServiceError> {
        let room = self
            .rooms
            .find_room(room_id)
            .await?
            .ok_or(RoomServiceError::RoomNotFound)?;
        let online_ids = self.presence.online_member_ids(room_id).await?;
        let members = self
            .rooms
            .list_members(room_id)
            .await?
            .into_iter()
            .map(|mut member| {
                member.online = online_ids.contains(&member.id);
                member
            })
            .collect();
        Ok(RoomDetails { room, members })
    }

    pub async fn join_room(
        &self,
        room_id: RoomId,
        display_name: &str,
    ) -> Result<RoomMember, RoomServiceError> {
        if self.rooms.find_room(room_id).await?.is_none() {
            return Err(RoomServiceError::RoomNotFound);
        }
        let member = RoomMember {
            id: Uuid::new_v4(),
            display_name: domain::validate_display_name(display_name)?,
            role: MemberRole::Participant,
            joined_at: Utc::now(),
            online: true,
        };
        self.rooms.add_member(room_id, &member).await?;
        self.presence.mark_online(room_id, member.id).await?;
        Ok(member)
    }

    pub async fn leave_room(
        &self,
        room_id: RoomId,
        member_id: MemberId,
    ) -> Result<(), RoomServiceError> {
        if !self.rooms.remove_member(room_id, member_id).await? {
            return Err(RoomServiceError::MemberNotFound);
        }
        self.presence.mark_offline(room_id, member_id).await?;
        Ok(())
    }

    pub async fn refresh_presence(
        &self,
        room_id: RoomId,
        member_id: MemberId,
    ) -> Result<(), RoomServiceError> {
        if !self.rooms.member_exists(room_id, member_id).await? {
            return Err(RoomServiceError::MemberNotFound);
        }
        self.presence.mark_online(room_id, member_id).await?;
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::{
        collections::{HashMap, HashSet},
        sync::Mutex,
    };

    #[derive(Default)]
    struct TestRooms {
        rooms: Mutex<HashMap<RoomId, Room>>,
        members: Mutex<HashMap<RoomId, Vec<RoomMember>>>,
    }
    impl RoomRepository for TestRooms {
        async fn create_room_with_host(
            &self,
            room: &Room,
            host: &RoomMember,
        ) -> Result<(), StorageError> {
            self.rooms
                .lock()
                .expect("测试锁不应中毒")
                .insert(room.id, room.clone());
            self.members
                .lock()
                .expect("测试锁不应中毒")
                .insert(room.id, vec![host.clone()]);
            Ok(())
        }
        async fn find_room(&self, id: RoomId) -> Result<Option<Room>, StorageError> {
            Ok(self.rooms.lock().expect("测试锁不应中毒").get(&id).cloned())
        }
        async fn list_members(&self, id: RoomId) -> Result<Vec<RoomMember>, StorageError> {
            Ok(self
                .members
                .lock()
                .expect("测试锁不应中毒")
                .get(&id)
                .cloned()
                .unwrap_or_default())
        }
        async fn add_member(&self, id: RoomId, member: &RoomMember) -> Result<(), StorageError> {
            self.members
                .lock()
                .expect("测试锁不应中毒")
                .entry(id)
                .or_default()
                .push(member.clone());
            Ok(())
        }
        async fn member_exists(
            &self,
            id: RoomId,
            member_id: MemberId,
        ) -> Result<bool, StorageError> {
            Ok(self
                .members
                .lock()
                .expect("测试锁不应中毒")
                .get(&id)
                .is_some_and(|items| items.iter().any(|member| member.id == member_id)))
        }
        async fn remove_member(
            &self,
            id: RoomId,
            member_id: MemberId,
        ) -> Result<bool, StorageError> {
            let mut members = self.members.lock().expect("测试锁不应中毒");
            let Some(items) = members.get_mut(&id) else {
                return Ok(false);
            };
            let length = items.len();
            items.retain(|member| member.id != member_id);
            Ok(length != items.len())
        }
    }
    #[derive(Default)]
    struct TestPresence {
        members: Mutex<HashMap<RoomId, HashSet<MemberId>>>,
    }
    impl PresenceRepository for TestPresence {
        async fn mark_online(
            &self,
            room_id: RoomId,
            member_id: MemberId,
        ) -> Result<(), StorageError> {
            self.members
                .lock()
                .expect("测试锁不应中毒")
                .entry(room_id)
                .or_default()
                .insert(member_id);
            Ok(())
        }
        async fn mark_offline(
            &self,
            room_id: RoomId,
            member_id: MemberId,
        ) -> Result<(), StorageError> {
            self.members
                .lock()
                .expect("测试锁不应中毒")
                .entry(room_id)
                .or_default()
                .remove(&member_id);
            Ok(())
        }
        async fn online_member_ids(
            &self,
            room_id: RoomId,
        ) -> Result<HashSet<MemberId>, StorageError> {
            Ok(self
                .members
                .lock()
                .expect("测试锁不应中毒")
                .get(&room_id)
                .cloned()
                .unwrap_or_default())
        }
    }
    #[tokio::test]
    async fn creates_joins_queries_and_leaves_a_room() {
        let rooms = TestRooms::default();
        let presence = TestPresence::default();
        let service = RoomService::new(&rooms, &presence);
        let created = service
            .create_room(" 项目例会 ", " 小明 ")
            .await
            .expect("创建会议应成功");
        assert_eq!(created.room.title, "项目例会");
        assert_eq!(created.members[0].role, MemberRole::Host);
        let joined = service
            .join_room(created.room.id, "小红")
            .await
            .expect("加入会议应成功");
        let queried = service
            .get_room(created.room.id)
            .await
            .expect("查询会议应成功");
        assert_eq!(queried.members.len(), 2);
        assert!(queried.members.iter().all(|member| member.online));
        service
            .leave_room(created.room.id, joined.id)
            .await
            .expect("离开会议应成功");
        assert_eq!(
            service
                .get_room(created.room.id)
                .await
                .expect("查询会议应成功")
                .members
                .len(),
            1
        );
        assert!(matches!(
            service.refresh_presence(created.room.id, joined.id).await,
            Err(RoomServiceError::MemberNotFound)
        ));
    }
    #[tokio::test]
    async fn rejects_joining_a_missing_room() {
        let rooms = TestRooms::default();
        let presence = TestPresence::default();
        let service = RoomService::new(&rooms, &presence);
        assert!(matches!(
            service.join_room(Uuid::new_v4(), "小明").await,
            Err(RoomServiceError::RoomNotFound)
        ));
    }
}
