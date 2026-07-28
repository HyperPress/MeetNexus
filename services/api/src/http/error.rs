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
    RouteNotFound { request_id: Uuid },
    MethodNotAllowed { request_id: Uuid },
    Internal { request_id: Uuid },
}

impl ApiError {
    fn parts(&self) -> (StatusCode, &'static str, &'static str, Uuid) {
        match self {
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
