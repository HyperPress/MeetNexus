# 项目进度

## 已完成

- 初始化 MeetNexus Git 仓库、AI 协作规则、OpenAPI 骨架与本机工程模板。
- 创建 React/TypeScript 严格模式前端和 Rust/Axum 后端基础工程。
- 安装 Tailwind CSS、daisyUI、Zod、Playwright 以及 Rust 基础依赖。
- 确定最终技术路线：Rust/Axum + React/TypeScript + Live777，本机直接运行，不使用 Docker。
- 在 Windows 本机准备并启动 PostgreSQL 15、Memurai Developer 4.1.8 和 Live777 0.9.0。
- 新增团队项目手册，记录架构、本机运行、协作与质量检查方式。
- 新增 `scripts/setup.ps1`：可恢复 Node/Rust 项目依赖，并检查本机服务前置条件。
- 明确分支协作规则：成员在个人分支开发，组长通过 Pull Request 统一合并至 `main`。
- 完成前端、后端、测试、迁移、ADR 与运行手册的项目目录骨架，并为各目录标明职责边界。
- 确立简体中文规范：项目说明、开发提示和 Web 用户界面默认使用中文，并完成现有英文模板说明的本地化。
- 完成后端基础与接口规范：定义 `/health` OpenAPI 契约，实现集中配置加载、统一成功/错误响应、请求 ID 传播与 JSON 结构化日志；修改 `docs/openapi.yaml`、`services/api/src/config/`、`services/api/src/telemetry/`、`services/api/src/http/`、程序入口及 HTTP 集成测试。
- 完成中文首页、创建会议页面和加入会议页面，并通过各页面的 Playwright 端到端测试，增加基础 Hash 页面导航与中文表单本地校验。
- 完成会前设备检测与本地预览：支持浏览器摄像头和麦克风权限请求、本地视频预览、设备选择、音视频开关、摄像头镜像切换、屏幕分享测试与捕获信息展示、页面离开时释放媒体资源和中文错误提示。
- 完成源码公开展示准备：补充 MIT License，完善当前阶段、技术栈、本机运行和文档入口说明。
- 公开准备修改文件：`LICENSE`、`README.md` 与 `docs/STATUS.md`。
- 公开准备验证通过：Rust 格式检查、Clippy、Rust 测试、前端 Oxlint、TypeScript 静态检查和 Vite 生产构建。
- 新增根目录 `.env.example`，保存 PostgreSQL、Redis、Live777 与 API 的非敏感本机连接模板，并明确真实密码和 Token 不得提交。

## 进行中

- 暂无。

## 下一步

- 将 GitHub 仓库设为公开，并供岭创之夏展示页引用。
- 在现有配置加载基础上建立 PostgreSQL、Redis 与 Live777 客户端，并验证 API 能连接这些本机服务。
- 定义房间、参会者和媒体授权的 OpenAPI 契约。
- 等待房间 OpenAPI 契约确定后，增加 Zod 响应模型和 HTTP 客户端，并接入真实的创建与加入房间接口。

## 阻塞项

- 需要现有 PostgreSQL `postgres` 管理员密码，以创建 `meetnexus` 项目数据库与用户。
- 本次健康检查仅验证 API 进程存活，尚未实现 PostgreSQL、Redis 与 Live777 的就绪探测。
- `docs/openapi.yaml` 尚未定义房间接口，创建和加入表单暂时只进行本地校验，不发送网络请求。

## 验证结果

- 2026-07-28：`cargo fmt --check`、`cargo clippy --all-targets -- -D warnings`、`cargo test` 全部通过，共 8 个单元测试和 5 个 HTTP 集成测试。
- 2026-07-28：使用本机占位配置启动 API，`GET /health` 返回 200；响应头与响应体请求 ID 一致，JSON 日志包含规定的关联字段、状态码和耗时。
- 2026-07-28：`npm run lint --prefix apps/web`、TypeScript 静态检查和 `npm run build --prefix apps/web` 全部通过。
- 2026-07-29：前端 lint、生产构建和 Playwright 端到端测试全部通过，共 8 个测试通过；设备预览使用明确隔离的 Chromium 测试设备，屏幕分享测试使用测试目录内隔离的媒体流，真实摄像头、麦克风和系统屏幕选择器仍需手动验证。
- 2026-07-28：本机配置模板通过 `git diff --check`，确认 `.env.example` 可跟踪且真实 `.env` 继续被 Git 忽略。

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
- 2026-07-28：补充 MIT License 和公开 README，完成岭创之夏阶段成果展示前的源码仓库准备与质量验证。
- 2026-07-28：新增非敏感本机配置模板并补充使用说明；修改 `.env.example`、`docs/LOCAL_SETUP.md` 与 `docs/STATUS.md`。
