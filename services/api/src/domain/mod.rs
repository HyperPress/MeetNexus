use chrono::{DateTime, Utc};
use serde::Serialize;
use thiserror::Error;
use uuid::Uuid;

pub type RoomId = Uuid;
pub type MemberId = Uuid;

#[derive(Clone, Debug, Serialize)]
pub struct Room {
    pub id: RoomId,
    pub title: String,
    pub created_at: DateTime<Utc>,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum MemberRole {
    Host,
    Participant,
}

impl MemberRole {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Host => "host",
            Self::Participant => "participant",
        }
    }

    pub fn parse(value: &str) -> Result<Self, DomainError> {
        match value {
            "host" => Ok(Self::Host),
            "participant" => Ok(Self::Participant),
            _ => Err(DomainError::InvalidMemberRole),
        }
    }
}

#[derive(Clone, Debug, Serialize)]
pub struct RoomMember {
    pub id: MemberId,
    pub display_name: String,
    pub role: MemberRole,
    pub joined_at: DateTime<Utc>,
    pub online: bool,
}

#[derive(Clone, Debug, Serialize)]
pub struct RoomDetails {
    pub room: Room,
    pub members: Vec<RoomMember>,
}

#[derive(Debug, Error, PartialEq, Eq)]
pub enum DomainError {
    #[error("会议主题不能为空且不能超过 80 个字符")]
    InvalidRoomTitle,
    #[error("显示名称不能为空且不能超过 40 个字符")]
    InvalidDisplayName,
    #[error("成员角色无效")]
    InvalidMemberRole,
}

pub fn validate_room_title(value: &str) -> Result<String, DomainError> {
    let value = value.trim();
    if value.is_empty() || value.chars().count() > 80 {
        return Err(DomainError::InvalidRoomTitle);
    }
    Ok(value.to_owned())
}

pub fn validate_display_name(value: &str) -> Result<String, DomainError> {
    let value = value.trim();
    if value.is_empty() || value.chars().count() > 40 {
        return Err(DomainError::InvalidDisplayName);
    }
    Ok(value.to_owned())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn trims_and_validates_user_input() {
        assert_eq!(validate_room_title("  周会 ").unwrap(), "周会");
        assert_eq!(validate_display_name(" 小明 ").unwrap(), "小明");
        assert!(validate_room_title("").is_err());
        assert!(validate_display_name(&"a".repeat(41)).is_err());
    }
}
