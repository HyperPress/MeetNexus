use std::{collections::HashMap, net::SocketAddr};

use api::{
    domain::MemberRole,
    http::{auth::SessionTokenService, rooms::RoomApiState},
    infrastructure::{postgres::PgRoomRepository, redis_presence::RedisPresenceRepository},
};
use tokio::{
    io::{AsyncReadExt, AsyncWriteExt},
    net::{TcpListener, TcpStream},
    task::JoinHandle,
};
use uuid::Uuid;

struct TestServer {
    address: SocketAddr,
    task: JoinHandle<()>,
}

impl TestServer {
    async fn start() -> Self {
        Self::start_with_app(api::app()).await
    }

    async fn start_with_rooms() -> Self {
        let database = sqlx::postgres::PgPoolOptions::new()
            .connect_lazy("postgres://meetnexus:test@127.0.0.1:1/meetnexus")
            .expect("测试数据库地址应当有效");
        let redis = redis::Client::open("redis://127.0.0.1:1").expect("测试 Redis 地址应当有效");
        let state = RoomApiState {
            rooms: PgRoomRepository::new(database),
            presence: RedisPresenceRepository::new(redis),
            session_tokens: SessionTokenService::new(
                "test-secret-that-is-long-enough-for-jwt-signing",
            ),
        };

        Self::start_with_app(api::app_with_rooms(state)).await
    }

    async fn start_with_app(app: axum::Router) -> Self {
        let listener = TcpListener::bind("127.0.0.1:0")
            .await
            .expect("应当能够绑定测试端口");
        let address = listener.local_addr().expect("测试端口应当存在");
        let task = tokio::spawn(async move {
            axum::serve(listener, app)
                .await
                .expect("测试服务器应当正常运行");
        });

        Self { address, task }
    }

    async fn request(&self, method: &str, path: &str, request_id: Option<&str>) -> TestResponse {
        self.request_json(method, path, request_id, None).await
    }

    async fn request_json(
        &self,
        method: &str,
        path: &str,
        request_id: Option<&str>,
        body: Option<&str>,
    ) -> TestResponse {
        self.request_json_with_headers(method, path, request_id, body, "")
            .await
    }

    async fn request_json_with_headers(
        &self,
        method: &str,
        path: &str,
        request_id: Option<&str>,
        body: Option<&str>,
        additional_headers: &str,
    ) -> TestResponse {
        let mut stream = TcpStream::connect(self.address)
            .await
            .expect("应当能够连接测试服务器");
        let request_id_header = request_id
            .map(|value| format!("X-Request-Id: {value}\r\n"))
            .unwrap_or_default();
        let body = body.unwrap_or_default();
        let content_type_header = if body.is_empty() {
            String::new()
        } else {
            "Content-Type: application/json\r\n".to_owned()
        };
        let request = format!(
            "{method} {path} HTTP/1.1\r\nHost: {}\r\n{request_id_header}{additional_headers}{content_type_header}Content-Length: {}\r\nConnection: close\r\n\r\n{body}",
            self.address,
            body.len(),
        );

        stream
            .write_all(request.as_bytes())
            .await
            .expect("应当能够发送测试请求");
        let mut bytes = Vec::new();
        stream
            .read_to_end(&mut bytes)
            .await
            .expect("应当能够读取测试响应");

        TestResponse::parse(&bytes)
    }
}

impl Drop for TestServer {
    fn drop(&mut self) {
        self.task.abort();
    }
}

struct TestResponse {
    status: u16,
    headers: HashMap<String, String>,
    body: serde_json::Value,
}

impl TestResponse {
    fn parse(bytes: &[u8]) -> Self {
        let separator = bytes
            .windows(4)
            .position(|window| window == b"\r\n\r\n")
            .expect("HTTP 响应应当包含头部结束标记");
        let header_text =
            std::str::from_utf8(&bytes[..separator]).expect("HTTP 响应头应当是 UTF-8");
        let mut lines = header_text.split("\r\n");
        let status = lines
            .next()
            .and_then(|line| line.split_whitespace().nth(1))
            .and_then(|status| status.parse().ok())
            .expect("HTTP 响应应当包含状态码");
        let headers = lines
            .filter_map(|line| line.split_once(':'))
            .map(|(name, value)| (name.to_ascii_lowercase(), value.trim().to_owned()))
            .collect::<HashMap<_, _>>();
        let raw_body = &bytes[(separator + 4)..];
        let body_bytes = if headers
            .get("transfer-encoding")
            .is_some_and(|value| value.eq_ignore_ascii_case("chunked"))
        {
            decode_chunked(raw_body)
        } else {
            raw_body.to_vec()
        };
        let body = serde_json::from_slice(&body_bytes).expect("HTTP 响应体应当是 JSON");

        Self {
            status,
            headers,
            body,
        }
    }

    fn request_id(&self) -> &str {
        self.headers
            .get("x-request-id")
            .map(String::as_str)
            .expect("响应应当包含 X-Request-Id")
    }
}

fn decode_chunked(mut bytes: &[u8]) -> Vec<u8> {
    let mut decoded = Vec::new();

    loop {
        let line_end = bytes
            .windows(2)
            .position(|window| window == b"\r\n")
            .expect("分块响应应当包含块大小");
        let size_text = std::str::from_utf8(&bytes[..line_end]).expect("块大小应当使用 ASCII 编码");
        let size = usize::from_str_radix(size_text.split(';').next().expect("块大小应当存在"), 16)
            .expect("块大小应当是十六进制");
        bytes = &bytes[(line_end + 2)..];

        if size == 0 {
            break;
        }

        decoded.extend_from_slice(&bytes[..size]);
        bytes = &bytes[(size + 2)..];
    }

    decoded
}

#[tokio::test]
async fn health_returns_contract_response_and_generated_request_id() {
    let server = TestServer::start().await;
    let response = server.request("GET", "/health", None).await;

    assert_eq!(response.status, 200);
    assert_eq!(
        response.headers.get("content-type").map(String::as_str),
        Some("application/json")
    );
    assert!(Uuid::parse_str(response.request_id()).is_ok());
    assert_eq!(response.body["request_id"], response.request_id());
    assert_eq!(response.body["data"]["status"], "ok");
    assert_eq!(response.body["data"]["service"], "meetnexus-api");
    assert_eq!(response.body["data"]["version"], "0.1.0");
}

#[tokio::test]
async fn propagates_valid_request_id() {
    let server = TestServer::start().await;
    let request_id = Uuid::new_v4().to_string();
    let response = server.request("GET", "/health", Some(&request_id)).await;

    assert_eq!(response.request_id(), request_id);
    assert_eq!(response.body["request_id"], request_id);
}

#[tokio::test]
async fn replaces_invalid_request_id() {
    let server = TestServer::start().await;
    let response = server.request("GET", "/health", Some("not-a-uuid")).await;

    assert_ne!(response.request_id(), "not-a-uuid");
    assert!(Uuid::parse_str(response.request_id()).is_ok());
    assert_eq!(response.body["request_id"], response.request_id());
}

#[tokio::test]
async fn unknown_route_returns_unified_error() {
    let server = TestServer::start().await;
    let response = server.request("GET", "/unknown", None).await;

    assert_eq!(response.status, 404);
    assert_eq!(response.body["error"]["code"], "ROUTE_NOT_FOUND");
    assert_eq!(response.body["error"]["message"], "请求的接口不存在");
    assert_eq!(response.body["request_id"], response.request_id());
}

#[tokio::test]
async fn unsupported_method_returns_unified_error() {
    let server = TestServer::start().await;
    let response = server.request("POST", "/health", None).await;

    assert_eq!(response.status, 405);
    assert_eq!(response.body["error"]["code"], "METHOD_NOT_ALLOWED");
    assert_eq!(response.body["error"]["message"], "请求方法不受支持");
    assert_eq!(response.body["request_id"], response.request_id());
}

#[tokio::test]
async fn invalid_room_id_returns_unified_error() {
    let server = TestServer::start_with_rooms().await;
    let response = server.request("GET", "/rooms/not-a-uuid", None).await;

    assert_eq!(response.status, 400);
    assert_eq!(response.body["error"]["code"], "INVALID_REQUEST");
    assert_eq!(
        response.body["error"]["message"],
        "会议号或成员编号格式无效"
    );
    assert_eq!(response.body["request_id"], response.request_id());
}

#[tokio::test]
async fn invalid_room_json_returns_unified_error() {
    let server = TestServer::start_with_rooms().await;
    let response = server
        .request_json("POST", "/rooms", None, Some("{}"))
        .await;

    assert_eq!(response.status, 400);
    assert_eq!(response.body["error"]["code"], "INVALID_REQUEST");
    assert_eq!(response.body["error"]["message"], "请求体格式无效");
    assert_eq!(response.body["request_id"], response.request_id());
}

#[tokio::test]
async fn member_operations_require_a_matching_room_session() {
    let server = TestServer::start_with_rooms().await;
    let room_id = Uuid::new_v4();
    let member_id = Uuid::new_v4();
    let path = format!("/rooms/{room_id}/members/{member_id}/heartbeat");

    let missing_token = server.request("POST", &path, None).await;
    assert_eq!(missing_token.status, 401);
    assert_eq!(
        missing_token.body["error"]["code"],
        "SESSION_AUTHENTICATION_REQUIRED"
    );

    let token = SessionTokenService::new("test-secret-that-is-long-enough-for-jwt-signing")
        .issue(
            room_id,
            Uuid::new_v4(),
            MemberRole::Participant,
            Uuid::new_v4(),
        )
        .expect("测试令牌应当签发成功");
    let wrong_member = server
        .request_json_with_headers(
            "POST",
            &path,
            None,
            None,
            &format!("Authorization: Bearer {token}\r\n"),
        )
        .await;
    assert_eq!(wrong_member.status, 403);
    assert_eq!(
        wrong_member.body["error"]["code"],
        "ROOM_MEMBER_ACCESS_DENIED"
    );
}

#[tokio::test]
async fn unknown_room_fields_are_rejected() {
    let server = TestServer::start_with_rooms().await;
    let response = server
        .request_json(
            "POST",
            "/rooms",
            None,
            Some(r#"{"title":"项目例会","display_name":"小明","unexpected":true}"#),
        )
        .await;

    assert_eq!(response.status, 400);
    assert_eq!(response.body["error"]["code"], "INVALID_REQUEST");
    assert_eq!(response.body["error"]["message"], "请求体格式无效");
    assert_eq!(response.body["request_id"], response.request_id());
}
