use std::time::Instant;

use axum::{
    body::Body,
    http::{HeaderValue, Request, Response, header::HeaderName},
    middleware::Next,
};
use tracing::Instrument;
use uuid::Uuid;

use super::error::ErrorCode;

pub const REQUEST_ID_HEADER: HeaderName = HeaderName::from_static("x-request-id");

#[derive(Clone, Copy, Debug)]
pub struct RequestContext {
    request_id: Uuid,
}

impl RequestContext {
    pub fn request_id(self) -> Uuid {
        self.request_id
    }
}

pub async fn attach(mut request: Request<Body>, next: Next) -> Response<Body> {
    let request_id = request
        .headers()
        .get(&REQUEST_ID_HEADER)
        .and_then(|value| value.to_str().ok())
        .and_then(|value| Uuid::parse_str(value).ok())
        .unwrap_or_else(Uuid::new_v4);
    let method = request.method().clone();
    let path = request.uri().path().to_owned();
    let started_at = Instant::now();

    request
        .extensions_mut()
        .insert(RequestContext { request_id });

    let span = tracing::info_span!(
        "http_request",
        request_id = %request_id,
        room_id = "-",
        user_id = "-",
        stream_id = "-",
        event = "http_request",
        error_code = "-",
        method = %method,
        path = %path,
    );
    let mut response = next.run(request).instrument(span).await;
    let status = response.status();
    let error_code = response
        .extensions()
        .get::<ErrorCode>()
        .map_or("-", |code| code.0);

    response.headers_mut().insert(
        REQUEST_ID_HEADER.clone(),
        HeaderValue::from_str(&request_id.to_string()).expect("UUID 必须是有效的 HTTP 头值"),
    );

    tracing::info!(
        request_id = %request_id,
        room_id = "-",
        user_id = "-",
        stream_id = "-",
        event = "http_request_completed",
        error_code,
        method = %method,
        path,
        status = status.as_u16(),
        latency_ms = started_at.elapsed().as_millis(),
    );

    response
}
