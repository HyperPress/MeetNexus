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

## 进行中

- 暂无。

## 下一步

- 配置本机 PostgreSQL、Redis 与 Live777，并验证 API 能连接这些服务。
- 定义房间、参会者和媒体授权的 OpenAPI 契约。
- 实现第一个最小功能：API 健康检查、统一错误模型和配置加载。

## 阻塞项

- 需要现有 PostgreSQL `postgres` 管理员密码，以创建 `meetnexus` 项目数据库与用户。

## 最近变更

- 2026-07-21：放弃 WOOM MVP 路线，恢复 Rust/Axum AI Native 技术基线；保留本机直接运行方式。
- 2026-07-21：使用 Windows 原生 PostgreSQL、项目本地 Memurai 与 Live777 替代 Docker/WSL 方案。
- 2026-07-21：创建 `docs/PROJECT_MANUAL.md`。
- 2026-07-21：补充协作者一键初始化脚本与分支合并流程。
- 2026-07-21：补齐项目文件结构，并将目录职责同步到架构文档和项目手册。
- 2026-07-21：补充中文语言规范，翻译前端模板、目录说明和本机脚本提示。
