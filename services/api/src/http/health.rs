use axum::{Extension, Json};
use serde::Serialize;

use super::{request_context::RequestContext, response::SuccessResponse};

#[derive(Debug, Serialize)]
pub struct HealthData {
    status: &'static str,
    service: &'static str,
    version: &'static str,
}

pub async fn health(
    Extension(context): Extension<RequestContext>,
) -> Json<SuccessResponse<HealthData>> {
    Json(SuccessResponse {
        data: HealthData {
            status: "ok",
            service: "meetnexus-api",
            version: env!("CARGO_PKG_VERSION"),
        },
        request_id: context.request_id(),
    })
}
