# MeetNexus 架构

> 本文描述目标架构。当前已经实现的范围以 `docs/STATUS.md` 为准，不能把目标链路视为已完成功能。

## 目标服务职责

| 服务 | 技术 | 职责 |
| --- | --- | --- |
| Web | React、TypeScript、Tailwind、daisyUI | 会议界面、设备控制、多画面与互动功能 |
| API | Rust、Axum | 用户、房间、权限、WebSocket、媒体代理和录制任务 |
| PostgreSQL | 本机数据库服务 | 用户、会议、录制元数据等持久数据 |
| Redis | 本机数据库服务 | 在线成员、心跳、临时房间状态 |
| Live777 | 本机 SFU 服务 | WHIP/WHEP WebRTC 音视频发布和订阅 |

## 目标请求链路

```text
浏览器 ── REST / WebSocket ──> Axum API ──> PostgreSQL / Redis

浏览器 ── /media/whip/{stream_id} ──> Axum 鉴权与代理 ──> Live777
浏览器 ── /media/whep/{stream_id} ──> Axum 鉴权与代理 ──> Live777
```

## 当前实现边界

- Web 已实现中文房间入口、会前设备预览和房间 HTTP 客户端；创建、查询、加入、离开与心跳响应均经过 Zod 运行时校验。创建或加入后，服务端签发的房间成员短期令牌仅保存在浏览器标签页级 `sessionStorage`。
- API 已实现 `/health`（进程存活）和 `/ready`（PostgreSQL、Redis、Live777 就绪）以及房间创建、查询、加入、离开、心跳接口，并提供 PostgreSQL/Redis 适配器。
- API 已实现同源 WHIP/WHEP 媒体代理：浏览器提交 SDP 到 `/media/whip` 或 `/media/whep`，并使用房间成员 Bearer 令牌完成房间与成员双重校验，API 派生成员独占的流 ID 后再转发给 Live777。Live777 Token 仅由 API 从环境变量附加到上游请求。
- 浏览器媒体层在 ICE 收集完成后发起协商，发布者在连接中断后会重新协商；关闭 `RTCPeerConnection` 时经同源媒体会话地址请求 API 回收 Live777 会话。
- API 已提供受保护的房间 WebSocket 事件：浏览器用 `meetnexus.<JWT>` 子协议建立连接，成员加入或离开、主媒体开始或停止、屏幕共享开始或停止时立即广播；新连接会收到当前主媒体和屏幕共享发布者快照，事件积压时发送重新同步提示，前端据此重新读取房间信息。
- 屏幕共享已使用独立于摄像头/麦克风的 WHIP/WHEP 流发布与回收，避免覆盖主媒体流；房间事件通知其他成员自动订阅并展示远端屏幕流。仅发布者关闭屏幕 WHIP 会话会广播停止事件，订阅者退出不会影响其他成员观看。
- API 已实现主持人控制的逐成员主媒体录制任务及 PostgreSQL 元数据；Live777 产生 DASH MPD 和分片。会议页已提供主持人逐成员开始/停止录制和全体成员的状态查看；回放文件仅通过成员令牌保护的接口从 `RECORDING_STORAGE_ROOT` 读取已停止录制的清单及同目录 `.m4s` 分片，并拒绝目录穿越和直接文件系统访问；浏览器 DASH 播放器尚未接入。

## 运行边界

- Web、API、PostgreSQL、Redis 和 Live777 都直接运行在开发机上，不使用 Docker 或 Compose。
- 浏览器仅访问 MeetNexus 的同源 API 与媒体地址；不直接依赖 Live777 内网地址或 Token。
- API 在代理媒体请求前检查用户、房间和流之间的权限关系。
- 当前成员身份由服务端签发的 8 小时 JWT 房间会话令牌确认；令牌绑定房间与成员，成员操作和媒体操作均须通过 `Authorization: Bearer` 传递。令牌不写入 URL、日志或持久化存储；没有账号体系时，它不代表跨设备登录态。
- Live777 地址和 Token 只能从本机环境变量读取，禁止进入前端代码或 Git。
- 录制存储根目录通过 `RECORDING_STORAGE_ROOT` 配置；该目录不得以静态文件服务、共享目录或 Live777 地址直接暴露给浏览器。

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
