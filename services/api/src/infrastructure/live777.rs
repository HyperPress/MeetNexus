use std::str;

use axum::http::{StatusCode, Uri};
use thiserror::Error;
use tokio::{
    io::{AsyncReadExt, AsyncWriteExt},
    net::TcpStream,
};

const MAX_RESPONSE_BYTES: usize = 1_048_576;

#[derive(Clone)]
pub struct Live777Client {
    base_uri: Uri,
    token: Option<String>,
}

pub struct Live777Response {
    pub body: Vec<u8>,
    pub content_type: Option<String>,
    pub session_id: Option<String>,
    pub status: StatusCode,
}

#[derive(Debug, Error)]
pub enum Live777Error {
    #[error("Live777 仅支持本机 HTTP 地址")]
    UnsupportedScheme,
    #[error("Live777 地址无效")]
    InvalidBaseUrl,
    #[error("Live777 连接失败")]
    Connection,
    #[error("Live777 响应无效")]
    InvalidResponse,
    #[error("Live777 响应超过大小限制")]
    ResponseTooLarge,
}

impl Live777Client {
    pub fn new(base_url: &str, token: Option<String>) -> Result<Self, Live777Error> {
        let base_uri = base_url
            .parse::<Uri>()
            .map_err(|_| Live777Error::InvalidBaseUrl)?;
        if base_uri.scheme_str() != Some("http") || base_uri.authority().is_none() {
            return Err(Live777Error::UnsupportedScheme);
        }

        Ok(Self { base_uri, token })
    }

    pub async fn whip(
        &self,
        stream_id: &str,
        offer: &[u8],
    ) -> Result<Live777Response, Live777Error> {
        self.request("POST", &format!("/whip/{stream_id}"), offer)
            .await
    }

    pub async fn whep(
        &self,
        stream_id: &str,
        offer: &[u8],
    ) -> Result<Live777Response, Live777Error> {
        self.request("POST", &format!("/whep/{stream_id}"), offer)
            .await
    }

    pub async fn close_session(
        &self,
        stream_id: &str,
        session_id: &str,
    ) -> Result<Live777Response, Live777Error> {
        self.request("DELETE", &format!("/session/{stream_id}/{session_id}"), &[])
            .await
    }

    async fn request(
        &self,
        method: &str,
        endpoint: &str,
        body: &[u8],
    ) -> Result<Live777Response, Live777Error> {
        let authority = self
            .base_uri
            .authority()
            .ok_or(Live777Error::InvalidBaseUrl)?;
        let host = authority.as_str();
        let mut stream = TcpStream::connect(host)
            .await
            .map_err(|_| Live777Error::Connection)?;
        let base_path = self.base_uri.path().trim_end_matches('/');
        let path = format!("{base_path}{endpoint}");
        let authorization = self
            .token
            .as_deref()
            .map(|token| format!("Authorization: Bearer {token}\r\n"))
            .unwrap_or_default();
        let content_type = if body.is_empty() {
            ""
        } else {
            "Content-Type: application/sdp\r\n"
        };
        let request = format!(
            "{method} {path} HTTP/1.1\r\nHost: {host}\r\n{authorization}{content_type}Content-Length: {}\r\nConnection: close\r\n\r\n",
            body.len(),
        );
        stream
            .write_all(request.as_bytes())
            .await
            .map_err(|_| Live777Error::Connection)?;
        stream
            .write_all(body)
            .await
            .map_err(|_| Live777Error::Connection)?;
        stream.flush().await.map_err(|_| Live777Error::Connection)?;

        let response = read_response(&mut stream).await?;
        parse_response(&response)
    }
}

async fn read_response(stream: &mut TcpStream) -> Result<Vec<u8>, Live777Error> {
    let mut response = Vec::with_capacity(4096);
    let mut buffer = [0_u8; 4096];

    loop {
        let read = stream
            .read(&mut buffer)
            .await
            .map_err(|_| Live777Error::Connection)?;
        if read == 0 {
            return Ok(response);
        }
        response.extend_from_slice(&buffer[..read]);
        if response.len() > MAX_RESPONSE_BYTES {
            return Err(Live777Error::ResponseTooLarge);
        }
    }
}

fn parse_response(response: &[u8]) -> Result<Live777Response, Live777Error> {
    let separator = response
        .windows(4)
        .position(|window| window == b"\r\n\r\n")
        .ok_or(Live777Error::InvalidResponse)?;
    let header_text =
        str::from_utf8(&response[..separator]).map_err(|_| Live777Error::InvalidResponse)?;
    let mut lines = header_text.split("\r\n");
    let status = lines
        .next()
        .and_then(|line| line.split_whitespace().nth(1))
        .and_then(|value| value.parse::<u16>().ok())
        .and_then(|value| StatusCode::from_u16(value).ok())
        .ok_or(Live777Error::InvalidResponse)?;
    let headers = lines
        .filter_map(|line| line.split_once(':'))
        .map(|(name, value)| (name.trim().to_ascii_lowercase(), value.trim()))
        .collect::<Vec<_>>();
    let content_type = headers
        .iter()
        .find(|(name, _)| name == "content-type")
        .map(|(_, value)| (*value).to_owned());
    let session_id = headers
        .iter()
        .find(|(name, _)| name == "location")
        .and_then(|(_, location)| location.rsplit('/').next())
        .filter(|value| !value.is_empty() && !value.contains(['?', '#']))
        .map(ToOwned::to_owned);

    Ok(Live777Response {
        body: response[(separator + 4)..].to_vec(),
        content_type,
        session_id,
        status,
    })
}

#[cfg(test)]
mod tests {
    use super::parse_response;

    #[test]
    fn parses_sdp_answer_and_session_id() {
        let response = parse_response(
            b"HTTP/1.1 201 Created\r\nContent-Type: application/sdp\r\nLocation: /session/stream-1/session-1\r\nContent-Length: 6\r\n\r\nanswer",
        )
        .expect("应当解析 Live777 SDP 响应");

        assert_eq!(response.status.as_u16(), 201);
        assert_eq!(response.content_type.as_deref(), Some("application/sdp"));
        assert_eq!(response.session_id.as_deref(), Some("session-1"));
        assert_eq!(response.body, b"answer");
    }
}
