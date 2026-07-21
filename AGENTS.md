# MeetNexus AI 协作规则

## 项目目标

MeetNexus 是基于 Live777 的多人视频会议软件。后端使用 Rust + Axum；前端使用 React + TypeScript；Live777 以本机独立服务方式提供 WebRTC SFU 能力。

WOOM 仅用于理解功能和 WHIP/WHEP 调用流程。禁止复制 WOOM 的业务代码作为实现。

## 开始工作前（必须）

开始任何编码、修改、排查或评审任务前，依次阅读：

1. `AGENTS.md`
2. `docs/STATUS.md`
3. `docs/ARCHITECTURE.md`
4. `docs/openapi.yaml`（涉及 API 时）

确认任务未被其他成员认领后，才能修改文件。

## 技术基线（未经明确确认不得更改）

- 后端必须使用 Rust + Axum，禁止为新业务增加 Go、Node.js 或其他后端实现。
- 前端必须使用 React + TypeScript（TSX），启用 strict、`noUncheckedIndexedAccess` 与 `noImplicitOverride`。
- UI 必须使用 Tailwind CSS + daisyUI；禁止新增大段自定义 CSS 或未受约束的内联样式。
- Live777 是独立本机服务，负责 WHIP/WHEP 媒体转发；禁止将其源码嵌入或编译进 API。
- PostgreSQL 保存持久业务数据；Redis 保存在线成员、心跳和房间临时状态。
- OpenAPI 是唯一 API 契约；接口变更必须先更新 `docs/openapi.yaml`。
- 前端 API 响应必须使用 Zod 等运行时校验。
- 必须维护 Rust 单元/集成测试、前端静态检查和 Playwright 端到端测试。
- 后端日志必须使用 `tracing` 输出 JSON，至少包含 `request_id`、`room_id`、`user_id`、`stream_id`、`event`、`error_code`。
- 本项目不使用 Docker 或 Compose；所有服务直接在开发机上运行。

## 修改边界

- 仅实现当前明确分配的任务。
- 未经明确授权，不改变已完成模块的行为、公开接口或数据结构。
- 不自行新增产品功能、第三方依赖或外部服务。
- 不用伪造数据替代真实接口或媒体流程；开发期 Mock 必须显式标注、隔离且可移除。
- 不删除、重命名或大范围重构其他成员负责的模块。
- 偏离技术基线时，必须先说明原因、替代方案、迁移影响与验证方式；未获明确确认不得实施。

## 完成任务后（必须）

1. 运行相关测试、构建或启动验证。
2. 更新 `docs/STATUS.md`：完成内容、修改文件、验证结果、遗留问题和下一步。
3. 接口变更同步更新 `docs/openapi.yaml`。
4. 架构或本机运行方式变更同步更新 `docs/ARCHITECTURE.md`。
5. 保持一次提交只聚焦一个任务，不混入无关改动。
