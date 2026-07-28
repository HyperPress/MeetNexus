use serde::Serialize;
use uuid::Uuid;

#[derive(Debug, Serialize)]
pub struct SuccessResponse<T> {
    pub data: T,
    pub request_id: Uuid,
}

#[derive(Debug, Serialize)]
pub(crate) struct ErrorResponse {
    pub error: ErrorDetail,
    pub request_id: Uuid,
}

#[derive(Debug, Serialize)]
pub(crate) struct ErrorDetail {
    pub code: &'static str,
    pub message: &'static str,
}
