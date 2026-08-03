use axum::{
    Json,
    http::StatusCode,
    response::{IntoResponse, Response},
};
use uuid::Uuid;

use super::response::{ErrorDetail, ErrorResponse};

#[derive(Clone, Copy, Debug)]
pub(crate) struct ErrorCode(pub &'static str);

#[derive(Debug)]
pub enum ApiError {
    BadRequest {
        request_id: Uuid,
        message: &'static str,
    },
    RoomNotFound {
        request_id: Uuid,
    },
    MemberNotFound {
        request_id: Uuid,
    },
    RecordingNotFound {
        request_id: Uuid,
    },
    RecordingNotReady {
        request_id: Uuid,
    },
    RecordingAlreadyActive {
        request_id: Uuid,
    },
    RecordingFileUnavailable {
        request_id: Uuid,
    },
    SessionAuthenticationRequired {
        request_id: Uuid,
    },
    RoomMemberAccessDenied {
        request_id: Uuid,
    },
    MediaAccessDenied {
        request_id: Uuid,
    },
    MediaServiceUnavailable {
        request_id: Uuid,
    },
    DependencyUnavailable {
        request_id: Uuid,
    },
    RouteNotFound {
        request_id: Uuid,
    },
    MethodNotAllowed {
        request_id: Uuid,
    },
    Internal {
        request_id: Uuid,
    },
}

impl ApiError {
    fn parts(&self) -> (StatusCode, &'static str, &'static str, Uuid) {
        match self {
            Self::BadRequest {
                request_id,
                message,
            } => (
                StatusCode::BAD_REQUEST,
                "INVALID_REQUEST",
                message,
                *request_id,
            ),
            Self::RoomNotFound { request_id } => (
                StatusCode::NOT_FOUND,
                "ROOM_NOT_FOUND",
                "会议不存在",
                *request_id,
            ),
            Self::MemberNotFound { request_id } => (
                StatusCode::NOT_FOUND,
                "MEMBER_NOT_FOUND",
                "成员不存在",
                *request_id,
            ),
            Self::RecordingNotFound { request_id } => (
                StatusCode::NOT_FOUND,
                "RECORDING_NOT_FOUND",
                "录制不存在或不属于当前会议",
                *request_id,
            ),
            Self::RecordingNotReady { request_id } => (
                StatusCode::CONFLICT,
                "RECORDING_NOT_READY",
                "录制尚未停止或回放文件尚未就绪",
                *request_id,
            ),
            Self::RecordingAlreadyActive { request_id } => (
                StatusCode::CONFLICT,
                "RECORDING_ALREADY_ACTIVE",
                "该成员已有正在进行的录制",
                *request_id,
            ),
            Self::RecordingFileUnavailable { request_id } => (
                StatusCode::SERVICE_UNAVAILABLE,
                "RECORDING_FILE_UNAVAILABLE",
                "录制文件暂时不可读取，请稍后重试",
                *request_id,
            ),
            Self::SessionAuthenticationRequired { request_id } => (
                StatusCode::UNAUTHORIZED,
                "SESSION_AUTHENTICATION_REQUIRED",
                "请重新加入会议以继续操作",
                *request_id,
            ),
            Self::RoomMemberAccessDenied { request_id } => (
                StatusCode::FORBIDDEN,
                "ROOM_MEMBER_ACCESS_DENIED",
                "当前成员无权操作该会议资源",
                *request_id,
            ),
            Self::MediaAccessDenied { request_id } => (
                StatusCode::FORBIDDEN,
                "MEDIA_ACCESS_DENIED",
                "当前成员无权操作该媒体会话",
                *request_id,
            ),
            Self::MediaServiceUnavailable { request_id } => (
                StatusCode::BAD_GATEWAY,
                "MEDIA_SERVICE_UNAVAILABLE",
                "媒体服务暂时不可用，请稍后重试",
                *request_id,
            ),
            Self::DependencyUnavailable { request_id } => (
                StatusCode::SERVICE_UNAVAILABLE,
                "DEPENDENCY_UNAVAILABLE",
                "服务依赖暂未就绪，请稍后重试",
                *request_id,
            ),
            Self::RouteNotFound { request_id } => (
                StatusCode::NOT_FOUND,
                "ROUTE_NOT_FOUND",
                "请求的接口不存在",
                *request_id,
            ),
            Self::MethodNotAllowed { request_id } => (
                StatusCode::METHOD_NOT_ALLOWED,
                "METHOD_NOT_ALLOWED",
                "请求方法不受支持",
                *request_id,
            ),
            Self::Internal { request_id } => (
                StatusCode::INTERNAL_SERVER_ERROR,
                "INTERNAL_ERROR",
                "服务内部错误",
                *request_id,
            ),
        }
    }
}

impl IntoResponse for ApiError {
    fn into_response(self) -> Response {
        let (status, code, message, request_id) = self.parts();
        let body = ErrorResponse {
            error: ErrorDetail { code, message },
            request_id,
        };
        let mut response = (status, Json(body)).into_response();
        response.extensions_mut().insert(ErrorCode(code));
        response
    }
}

#[cfg(test)]
mod tests {
    use axum::{body::to_bytes, response::IntoResponse};
    use serde_json::Value;
    use uuid::Uuid;

    use super::ApiError;

    #[tokio::test]
    async fn internal_error_response_does_not_expose_internal_details() {
        let request_id = Uuid::new_v4();
        let response = ApiError::Internal { request_id }.into_response();
        let status = response.status();
        let bytes = to_bytes(response.into_body(), 1024)
            .await
            .expect("应当能够读取错误响应体");
        let body: Value = serde_json::from_slice(&bytes).expect("错误响应应当是 JSON");

        assert_eq!(status.as_u16(), 500);
        assert_eq!(body["error"]["code"], "INTERNAL_ERROR");
        assert_eq!(body["error"]["message"], "服务内部错误");
        assert_eq!(body["request_id"], request_id.to_string());
        assert!(!String::from_utf8_lossy(&bytes).contains("debug"));
    }
}
