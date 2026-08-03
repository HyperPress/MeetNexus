# 项目进度

## 已完成

- 初始化 MeetNexus Git 仓库、AI 协作规则、OpenAPI 骨架与本机工程模板。
- 创建 React/TypeScript 严格模式前端和 Rust/Axum 后端基础工程。
- 安装 Tailwind CSS、daisyUI、Zod、Playwright 以及 Rust 基础依赖。
- 确定最终技术路线：Rust/Axum + React/TypeScript + Live777，本机直接运行，不使用 Docker。
- 完成 PostgreSQL 15、Memurai Developer 4.1.8 和 Live777 0.9.0 的本机运行说明与启动脚本；服务是否正在运行以开发机实际状态为准。
- 新增团队项目手册，记录架构、本机运行、协作与质量检查方式。
- 新增 `scripts/setup.ps1`：可恢复 Node/Rust 项目依赖，并检查本机服务前置条件。
- 明确分支协作规则：成员在个人分支开发，组长通过 Pull Request 统一合并至 `main`。
- 完成前端、后端、测试、迁移、ADR 与运行手册的项目目录骨架，并为各目录标明职责边界。
- 确立简体中文规范：项目说明、开发提示和 Web 用户界面默认使用中文，并完成现有英文模板说明的本地化。
- 完成后端基础与接口规范：定义 `/health` OpenAPI 契约，实现集中配置加载、统一成功/错误响应、请求 ID 传播与 JSON 结构化日志；修改 `docs/openapi.yaml`、`services/api/src/config/`、`services/api/src/telemetry/`、`services/api/src/http/`、程序入口及 HTTP 集成测试。
- 完成中文首页、创建会议页面和加入会议页面，并通过各页面的 Playwright 端到端测试，增加基础 Hash 页面导航与中文表单本地校验。
- 完成会前设备检测与本地预览：支持浏览器摄像头和麦克风权限请求、本地视频预览、设备选择、音视频开关、摄像头镜像切换、屏幕分享测试与捕获信息展示、页面离开时释放媒体资源和中文错误提示。
- 完成后端房间模块代码：定义创建、查询、加入、离开与心跳的 OpenAPI 契约；实现领域校验、房间用例、HTTP 路由、PostgreSQL 房间仓储、Redis 在线状态仓储，以及首个 SQLx 迁移文件。
- 完成前端真实房间 HTTP 流程：增加与 OpenAPI 对应的 Zod 请求/响应模型、统一 HTTP 客户端、房间 API 适配层和标签页级成员会话；创建与加入页面已接入真实接口，并新增房间查询、成员列表、30 秒心跳、主动离开和中文错误状态。
- 完成会议房间界面与本地媒体控制：房间成员可以在会议页面启动、关闭和释放本机摄像头与麦克风，切换摄像头镜像，并进行本地屏幕分享预览；没有房间成员身份的访客只能查看房间信息，不能操作媒体设备。所有本地媒体轨道均在页面卸载时释放，当前不向服务器或其他成员发送音视频。
- 完成源码公开展示准备：补充 MIT License，完善当前阶段、技术栈、本机运行和文档入口说明。
- 公开准备修改文件：`LICENSE`、`README.md` 与 `docs/STATUS.md`。
- 公开准备验证通过：Rust 格式检查、Clippy、Rust 测试、前端 Oxlint、TypeScript 静态检查和 Vite 生产构建。
- 新增根目录 `.env.example`，保存 PostgreSQL、Redis、Live777 与 API 的非敏感本机连接模板，并明确真实密码和 Token 不得提交。
- 完成 Live777 音视频闭环：新增同源 WHIP/WHEP SDP 代理、房间成员校验、Live777 Bearer Token 转发和媒体会话回收；会议页支持摄像头/麦克风发布、远端订阅、连接状态和断线重连，屏幕共享仍保持本地预览。
- 完成房间成员会话鉴权：创建或加入会议时签发绑定房间与成员的短期 JWT；心跳、离开、WHIP/WHEP 协商及媒体会话关闭均使用 Bearer 令牌，不再信任客户端传入的 `X-Member-Id`。
- 完成房间 WebSocket 实时事件：成员以受保护的子协议订阅会议事件，成员加入或离开时前端即时刷新成员列表；事件积压时请求重新同步，成员列表不再按 5 秒轮询。
- 完成屏幕共享独立发布与远端订阅：屏幕共享通过专用 WHIP/WHEP 路由、独立 Live777 流 ID 和独立媒体会话关闭地址发布；房间事件驱动其他成员自动订阅、展示并在停止共享时清理远端屏幕画面。
- 完成服务就绪探测：`/health` 保持 API 进程存活语义，新增 `/ready` 并并发验证 PostgreSQL、Redis 与 Live777；依赖不可用时返回统一的 503 错误。同步修正屏幕共享订阅者关闭 WHEP 会话时误广播停止事件的问题。
- 完成主媒体发布状态同步：主媒体开始/停止由房间 WebSocket 广播并维护连接快照，前端只订阅正在发布的远端成员，避免在空流上提前协商导致后续轨道无法到达。
- 完成录制任务与元数据：主持人可通过受保护接口为指定成员主媒体流调用 Live777 recorder 启动或停止逐成员录制；录制编号、MPD 路径、状态和时间保存至 PostgreSQL。

## 进行中

- 受保护的回放文件访问和浏览器 DASH 播放器尚未实现。

## 下一步

- 将 GitHub 仓库设为公开，并供岭创之夏展示页引用。
- 在可控 PostgreSQL/Redis 测试环境中补充房间 HTTP 成功路径和异常恢复自动化测试。
- 在已启动 PostgreSQL、Redis 与 Live777 的开发机上，使用两台浏览器完成真实摄像头、麦克风与音频输出的双人手动验收。

## 阻塞项

- 真实 PostgreSQL/Redis 测试依赖开发机提供连接信息并预先执行 SQLx 迁移，默认 `cargo test` 会跳过该用例。

## 验证结果

- 2026-07-28：`cargo fmt --check`、`cargo clippy --all-targets -- -D warnings`、`cargo test` 全部通过，共 8 个单元测试和 5 个 HTTP 集成测试。
- 2026-07-28：使用本机占位配置启动 API，`GET /health` 返回 200；响应头与响应体请求 ID 一致，JSON 日志包含规定的关联字段、状态码和耗时。
- 2026-07-28：`npm run lint --prefix apps/web`、TypeScript 静态检查和 `npm run build --prefix apps/web` 全部通过。
- 2026-07-29：前端 lint、生产构建和 Playwright 端到端测试全部通过，共 8 个测试通过；设备预览使用明确隔离的 Chromium 测试设备，屏幕分享测试使用测试目录内隔离的媒体流，真实摄像头、麦克风和系统屏幕选择器仍需手动验证。
- 2026-07-30：审计修复后 `cargo fmt --check`、`cargo clippy --all-targets -- -D warnings` 与默认 `cargo test` 通过，共 11 个单元测试和 8 个 HTTP 测试；1 个真实 PostgreSQL/Redis 测试按设计跳过，本次未把它记为通过。
- 2026-07-30：审计修复后前端 lint、生产构建和 8 个 Playwright 测试通过；媒体测试继续使用明确隔离的测试设备与测试流。
- 2026-07-30：前端真实房间 HTTP 流程修改后 Oxlint、TypeScript/Vite 生产构建与 12 项 Playwright 测试全部通过；端到端测试覆盖原有设备预览、镜像、屏幕分享，以及房间创建、加入、查询、心跳、离开、会话清理和异常响应契约校验。
- 2026-07-28：本机配置模板通过 `git diff --check`，确认 `.env.example` 可跟踪且真实 `.env` 继续被 Git 忽略。
- 2026-08-03：Live777 媒体代理修改通过 `cargo fmt --check`、`cargo clippy --all-targets -- -D warnings` 和 `cargo test`（12 个单元测试、8 个 HTTP 测试通过，1 个外部存储测试按设计跳过）；前端 Oxlint、TypeScript/Vite 构建和 15 项 Playwright 测试通过。新增的媒体回归测试使用显式隔离的 PeerConnection 与媒体代理响应，不依赖开发机设备或本机 Live777；真实双人音视频仍需在本机服务就绪时手动验收。
- 2026-08-03：房间成员会话鉴权修改通过 `cargo fmt --check`、`cargo clippy --all-targets -- -D warnings` 和 `cargo test`（13 个单元测试、9 个 HTTP 测试通过，1 个外部存储测试按设计跳过）；前端 Oxlint、TypeScript/Vite 生产构建和 15 项 Playwright 测试通过。实际启动 API 后 `/health` 返回 200；新增 HTTP 回归覆盖缺少令牌的 401 与令牌成员不匹配的 403。
- 2026-08-03：房间实时事件修改通过后端事件单元测试、前端 Oxlint、TypeScript/Vite 生产构建和 11 项房间 Playwright 测试；端到端测试覆盖受保护的 WebSocket 子协议、令牌不出现在 URL，以及成员事件触发成员列表重新加载。
- 2026-08-03：在本机 PostgreSQL、Memurai、Live777 与 API 进程均已运行时完成真实 WebSocket 验收：创建者订阅房间事件后，另一成员加入会议，客户端收到 `member_joined` 且事件成员编号与加入响应一致。
- 2026-08-03：屏幕共享独立流修改通过 Rust 格式检查、Clippy、后端 14 个单元测试和 9 个 HTTP 测试，以及前端 Oxlint、TypeScript/Vite 生产构建和 16 项 Playwright 测试；1 个真实 PostgreSQL/Redis 测试按设计跳过。
- 2026-08-03：远端屏幕订阅修改通过 Rust 格式检查、Clippy、后端 14 个单元测试和 9 个 HTTP 测试，以及前端 Oxlint、TypeScript/Vite 生产构建和 16 项 Playwright 测试；1 个真实 PostgreSQL/Redis 测试按设计跳过。
- 2026-08-03：服务就绪探测与屏幕共享事件边界修正通过 Rust 格式检查、Clippy、14 个后端单元测试、10 个 HTTP 测试，以及真实 PostgreSQL/Redis 存储测试；本机 `/health` 与 `/ready` 均返回 200，`/ready` 确认三项依赖均已就绪。隔离 HTTP 测试覆盖依赖不可连接时的统一 503 响应，且依赖探测超时限制为 2 秒。
- 2026-08-03：主媒体状态事件修改通过 Rust 格式检查、Clippy、16 个后端单元测试、10 个 HTTP 测试，以及前端 Oxlint、TypeScript/Vite 生产构建和 16 项 Playwright 测试。使用两个独立 Chromium 虚拟摄像头/麦克风浏览器连接当前本机 API 与 Live777，双向 WHIP/WHEP 均返回 201，双方页面均出现带 2 条音视频轨道的远端流。
- 2026-08-03：录制任务迁移已应用至本机 PostgreSQL，后端格式检查、测试和 Clippy 通过。使用 Chromium 虚拟摄像头/麦克风发布真实主媒体流后，录制启动、列表查询和停止均通过当前 API 与 Live777 成功验证，录制状态由 `recording` 变为 `stopped`。
- 2026-07-31：会议房间界面与本地媒体控制修改通过前端 Oxlint、TypeScript/Vite 生产构建和 14 项 Playwright 端到端测试；自动化媒体测试使用隔离的 Chromium 测试设备，真实摄像头、麦克风与系统屏幕选择器仍需手动验证。当前媒体能力仅限本机预览，尚未接入 WHIP/WHEP。

## 最近变更

- 2026-07-28：完成后端健康检查、配置校验、统一错误模型、请求关联与结构化日志基础能力。
- 2026-07-21：放弃 WOOM MVP 路线，恢复 Rust/Axum AI Native 技术基线；保留本机直接运行方式。
- 2026-07-21：使用 Windows 原生 PostgreSQL、项目本地 Memurai 与 Live777 替代 Docker/WSL 方案。
- 2026-07-21：创建 `docs/PROJECT_MANUAL.md`。
- 2026-07-21：补充协作者一键初始化脚本与分支合并流程。
- 2026-07-21：补齐项目文件结构，并将目录职责同步到架构文档和项目手册。
- 2026-07-21：补充中文语言规范，翻译前端模板、目录说明和本机脚本提示。
- 2026-07-28：完成中文首页、创建与加入页面，并通过各页面的 Playwright 端到端测试。
- 验证结果：前端 lint、生产构建和 Playwright 端到端测试通过，共 4 个测试通过。
- 2026-07-29：新增会前设备检测页面、本地媒体适配层、摄像头镜像切换和屏幕分享测试；读取共享来源、分辨率、帧率与轨道名称，不依赖房间 API，不向服务器发送音视频。
- 2026-07-29：新增房间和成员数据库迁移、领域模型、房间应用用例、PostgreSQL/Redis 仓储与房间 HTTP 路由；OpenAPI 增加创建、查询、加入、离开和心跳接口。
- 2026-07-30：纠正首页、README、项目手册、架构和状态文档中的完成边界；补充 SQLx 迁移运行说明、严格 JSON 请求校验、房间日志上下文和 3 个离线房间 HTTP 契约测试。
- 2026-07-30：前端增加 Zod 房间契约、统一 HTTP 客户端和真实房间业务流程；创建者与参会者身份保存在 `sessionStorage`，房间页面定期发送在线心跳，并支持查询成员和主动离开。
- 2026-08-03：新增 `services/api/src/infrastructure/live777.rs`、`services/api/src/http/media.rs`、`apps/web/src/lib/media/whipWhep.ts` 与媒体端到端测试；更新 OpenAPI 的 WHIP/WHEP/会话关闭契约，会议页通过同源代理接入 Live777。
- 2026-08-03：新增 `services/api/src/http/auth.rs`，为房间成员签发和校验短期 JWT；更新房间和媒体 API 的 OpenAPI 安全契约、前端会话存储与 Bearer 请求头，并在 `.env.example` 中增加 `AUTH_JWT_SECRET`。
- 2026-08-03：新增 `services/api/src/http/events.rs` 与前端房间事件连接，更新 WebSocket OpenAPI 契约、Vite WebSocket 代理和房间事件端到端测试。
- 2026-08-03：新增 `/ready` OpenAPI 契约与 API 依赖就绪探测，更新本机运行说明；修正屏幕共享订阅者回收 WHEP 会话时误广播停止事件。
- 2026-08-03：新增主媒体开始/停止 WebSocket 事件及连接快照，前端据此延后 WHEP 订阅到远端媒体已发布之后。
- 2026-08-03：新增录制 OpenAPI 契约、录制 PostgreSQL 迁移、Live777 recorder 适配器及主持人受保护的启动/停止/查询接口。
- 2026-08-03：新增屏幕共享独立 WHIP/WHEP 与会话关闭契约，前端屏幕分享开始后通过单独媒体流发布，停止或页面卸载时回收该会话。
- 2026-08-03：屏幕共享开始/停止事件接入房间 WebSocket，前端根据事件自动建立或清理独立 WHEP 订阅，并显示远端屏幕画面。
- 修改文件：`apps/web/src/schemas/room.ts`、`apps/web/src/lib/api/httpClient.ts`、`apps/web/src/features/rooms/api/roomApi.ts`、`apps/web/src/features/rooms/session/roomSession.ts`、`apps/web/src/features/rooms/pages/CreateRoomPage.tsx`、`apps/web/src/features/rooms/pages/JoinRoomPage.tsx`、`apps/web/src/features/rooms/pages/RoomPage.tsx`、`apps/web/src/app/AppRouter.tsx`、`apps/web/tests/e2e/room-pages.spec.ts`、`apps/web/vite.config.ts`、`docs/ARCHITECTURE.md`、`docs/LOCAL_SETUP.md` 与 `docs/STATUS.md`。
- 修改文件：`README.md`、`apps/web/src/features/rooms/pages/HomePage.tsx`、`apps/web/tests/e2e/room-pages.spec.ts`、`docs/ARCHITECTURE.md`、`docs/LOCAL_SETUP.md`、`docs/PROJECT_MANUAL.md`、`docs/STATUS.md`、`services/api/migrations/README.md`、`services/api/src/http/rooms.rs`、`services/api/tests/http.rs`。
- 2026-07-31：会议房间页面接入浏览器本地摄像头、麦克风和屏幕分享控制，复用现有本地媒体适配层与预览组件；新增房间成员媒体操作权限限制和页面卸载资源清理。
- 2026-07-28：补充 MIT License 和公开 README，完成岭创之夏阶段成果展示前的源码仓库准备与质量验证。
- 2026-07-28：新增非敏感本机配置模板并补充使用说明；修改 `.env.example`、`docs/LOCAL_SETUP.md` 与 `docs/STATUS.md`。
