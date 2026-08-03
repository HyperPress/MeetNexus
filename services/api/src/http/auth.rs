use axum::http::{HeaderMap, header};
use chrono::{Duration, Utc};
use jsonwebtoken::{Algorithm, DecodingKey, EncodingKey, Header, Validation, decode, encode};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::domain::MemberRole;

use super::ApiError;

const TOKEN_ISSUER: &str = "meetnexus-api";
const TOKEN_LIFETIME_HOURS: i64 = 8;

#[derive(Clone)]
pub struct SessionTokenService {
    decoding_key: DecodingKey,
    encoding_key: EncodingKey,
}

#[derive(Clone, Copy, Debug)]
pub struct AuthenticatedMember {
    room_id: Uuid,
    member_id: Uuid,
}

#[derive(Debug, Deserialize, Serialize)]
struct SessionClaims {
    exp: i64,
    iat: i64,
    iss: String,
    member_id: Uuid,
    room_id: Uuid,
    role: MemberRole,
}

impl SessionTokenService {
    pub fn new(secret: &str) -> Self {
        Self {
            decoding_key: DecodingKey::from_secret(secret.as_bytes()),
            encoding_key: EncodingKey::from_secret(secret.as_bytes()),
        }
    }

    pub fn issue(
        &self,
        room_id: Uuid,
        member_id: Uuid,
        role: MemberRole,
        request_id: Uuid,
    ) -> Result<String, ApiError> {
        let issued_at = Utc::now();
        let claims = SessionClaims {
            exp: (issued_at + Duration::hours(TOKEN_LIFETIME_HOURS)).timestamp(),
            iat: issued_at.timestamp(),
            iss: TOKEN_ISSUER.to_owned(),
            member_id,
            room_id,
            role,
        };
        encode(&Header::new(Algorithm::HS256), &claims, &self.encoding_key)
            .map_err(|_| ApiError::Internal { request_id })
    }

    pub fn authenticate(
        &self,
        headers: &HeaderMap,
        request_id: Uuid,
    ) -> Result<AuthenticatedMember, ApiError> {
        let token = headers
            .get(header::AUTHORIZATION)
            .and_then(|value| value.to_str().ok())
            .and_then(|value| value.strip_prefix("Bearer "))
            .filter(|value| !value.is_empty())
            .ok_or(ApiError::SessionAuthenticationRequired { request_id })?;
        let mut validation = Validation::new(Algorithm::HS256);
        validation.set_issuer(&[TOKEN_ISSUER]);
        let claims = decode::<SessionClaims>(token, &self.decoding_key, &validation)
            .map_err(|_| ApiError::SessionAuthenticationRequired { request_id })?
            .claims;
        Ok(AuthenticatedMember {
            room_id: claims.room_id,
            member_id: claims.member_id,
        })
    }
}

impl AuthenticatedMember {
    pub fn member_id(self) -> Uuid {
        self.member_id
    }

    pub fn authorizes(self, room_id: Uuid, member_id: Uuid) -> bool {
        self.room_id == room_id && self.member_id == member_id
    }

    pub fn belongs_to_room(self, room_id: Uuid) -> bool {
        self.room_id == room_id
    }
}

#[cfg(test)]
mod tests {
    use axum::http::{HeaderMap, HeaderValue, header};
    use uuid::Uuid;

    use crate::domain::MemberRole;

    use super::SessionTokenService;

    #[test]
    fn issues_and_authenticates_a_room_member_token() {
        let tokens = SessionTokenService::new("test-secret-that-is-long-enough-for-jwt-signing");
        let room_id = Uuid::new_v4();
        let member_id = Uuid::new_v4();
        let token = tokens
            .issue(room_id, member_id, MemberRole::Host, Uuid::new_v4())
            .expect("token should be issued");
        let mut headers = HeaderMap::new();
        headers.insert(
            header::AUTHORIZATION,
            HeaderValue::from_str(&format!("Bearer {token}")).expect("header should be valid"),
        );

        let member = tokens
            .authenticate(&headers, Uuid::new_v4())
            .expect("token should authenticate");

        assert!(member.authorizes(room_id, member_id));
        assert!(!member.authorizes(Uuid::new_v4(), member_id));
    }
}
