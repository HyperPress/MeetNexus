# MeetNexus

基于 Live777 的多人视频会议软件。

## 技术架构

```text
React + TypeScript 前端
  ├─ REST / WebSocket ──> Rust + Axum API ──> PostgreSQL / Redis
  └─ 同源 WHIP / WHEP ──> Axum 媒体代理 ──> 本机 Live777 SFU
```

Live777 是独立媒体服务，负责接收和转发 WebRTC 音视频流；MeetNexus 负责用户、房间、权限、会议体验、录制任务与回放。

## 目录

```text
apps/web/       React + TypeScript 前端
services/api/   Rust + Axum 业务后端
docs/           架构、进度、本机运行说明与 API 契约
```

## 协作

开始工作前必须阅读 [AGENTS.md](AGENTS.md)、[项目进度](docs/STATUS.md)、[架构文档](docs/ARCHITECTURE.md) 和 [本机运行说明](docs/LOCAL_SETUP.md)。
