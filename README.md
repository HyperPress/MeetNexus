# MeetNexus

MeetNexus 是一款基于 Live777 的多人视频会议软件，采用 React + TypeScript
构建 Web 界面，使用 Rust + Axum 提供业务 API，并由独立运行的 Live777
负责 WebRTC SFU 音视频转发。

> 当前项目处于功能原型阶段：已完成房间 API、中文房间入口、会前设备预览、同源 WHIP/WHEP 媒体代理和基础多人音视频闭环；房间成员操作由短期 Bearer 会话令牌保护。当前暂无公开在线演示。

## 目标技术架构

```text
React + TypeScript 前端
  ├─ REST / WebSocket ──> Rust + Axum API ──> PostgreSQL / Redis
  └─ 同源 WHIP / WHEP ──> Axum 媒体代理 ──> 本机 Live777 SFU
```

Live777 是独立媒体服务，负责接收和转发 WebRTC 音视频流；MeetNexus 负责用户、房间、权限、会议体验、录制任务与回放。

## 技术栈

| 范围 | 技术 |
| --- | --- |
| Web | React、TypeScript、Vite、Tailwind CSS、daisyUI、Zod |
| API | Rust、Axum、Tokio、SQLx、tracing |
| 数据 | PostgreSQL、Redis（Windows 本机使用 Memurai） |
| 媒体 | Live777、WebRTC、WHIP/WHEP |
| 契约与测试 | OpenAPI、Rust 单元/集成测试、Playwright |

## 当前进度

### 已完成

- React/TypeScript 严格模式前端与 Rust/Axum 后端工程骨架。
- 中文房间入口、本地表单校验和会前摄像头、麦克风、屏幕分享预览。
- 后端房间领域用例、HTTP 路由、PostgreSQL 仓储、Redis 在线状态与 SQL 迁移。
- `/health`、请求 ID、统一业务错误响应和 JSON 结构化日志。
- PostgreSQL、Redis 与 Live777 的目标服务边界和本机运行说明。
- WHIP/WHEP 媒体请求经 Axum 鉴权代理的目标架构方案。
- OpenAPI 契约优先、静态检查和端到端测试规范。
- 中文项目文档、团队协作规则和本机初始化脚本。

### 开发中

- 前端 Zod 模型、HTTP 客户端与真实房间创建、查询、加入、离开流程。
- PostgreSQL、Redis 与 Live777 依赖就绪检查。
- WHIP/WHEP 媒体鉴权代理和多人音视频闭环。
- 用户身份、房间权限和 WebSocket 实时事件。
- 录制任务、回放和会议体验完善。

详细进度见 [项目状态](docs/STATUS.md)。

## 项目目录

```text
apps/web/       React + TypeScript 前端
services/api/   Rust + Axum 业务后端
docs/           架构、进度、本机运行说明与 API 契约
```

## 本机运行

MeetNexus 不使用 Docker，PostgreSQL、Memurai 和 Live777 均直接运行在开发机上。

```powershell
# 安装锁定依赖并检查本机服务
.\scripts\setup.ps1

# 启动 API
.\scripts\start-api.ps1

# 在另一个终端启动 Web
npm run dev --prefix apps/web
```

完整的软件要求、环境变量和启动顺序见
[本机运行说明](docs/LOCAL_SETUP.md)。

## 项目文档

- [架构设计](docs/ARCHITECTURE.md)
- [项目进度](docs/STATUS.md)
- [OpenAPI 契约](docs/openapi.yaml)
- [项目手册](docs/PROJECT_MANUAL.md)

## 协作

开始工作前必须阅读 [AGENTS.md](AGENTS.md)、[项目进度](docs/STATUS.md)、[架构文档](docs/ARCHITECTURE.md) 和 [本机运行说明](docs/LOCAL_SETUP.md)。

## 许可证

本项目采用 [MIT License](LICENSE)。
