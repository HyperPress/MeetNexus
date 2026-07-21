# MeetNexus 架构

## 服务职责

| 服务 | 技术 | 职责 |
| --- | --- | --- |
| Web | React、TypeScript、Tailwind、daisyUI | 会议界面、设备控制、多画面与互动功能 |
| API | Rust、Axum | 用户、房间、权限、WebSocket、媒体代理和录制任务 |
| PostgreSQL | 本机数据库服务 | 用户、会议、录制元数据等持久数据 |
| Redis | 本机数据库服务 | 在线成员、心跳、临时房间状态 |
| Live777 | 本机 SFU 服务 | WHIP/WHEP WebRTC 音视频发布和订阅 |

## 请求链路

```text
浏览器 ── REST / WebSocket ──> Axum API ──> PostgreSQL / Redis

浏览器 ── /media/whip/{stream_id} ──> Axum 鉴权与代理 ──> Live777
浏览器 ── /media/whep/{stream_id} ──> Axum 鉴权与代理 ──> Live777
```

## 运行边界

- Web、API、PostgreSQL、Redis 和 Live777 都直接运行在开发机上，不使用 Docker 或 Compose。
- 浏览器仅访问 MeetNexus 的同源 API 与媒体地址；不直接依赖 Live777 内网地址或 Token。
- API 在代理媒体请求前检查用户、房间和流之间的权限关系。
- Live777 地址和 Token 只能从本机环境变量读取，禁止进入前端代码或 Git。

## 代码分层

- Web 使用 `app → features → lib` 的依赖方向：应用装配使用业务功能，业务功能通过公共基础设施访问 API 和媒体能力。
- API 使用 `http → application → domain` 的依赖方向；`infrastructure` 实现 application 定义的外部端口。
- `domain` 不依赖 Axum、SQLx、Redis 或 Live777，HTTP handler 不承载业务规则。
- 每层目录的具体职责见对应 `README.md` 与局部 `AGENTS.md`。

## 质量门禁

```text
Rust：cargo fmt --check → cargo clippy -- -D warnings → cargo test
前端：npm run lint → tsc --noEmit → npm run build
端到端：Playwright 多人会议回归流程
```
