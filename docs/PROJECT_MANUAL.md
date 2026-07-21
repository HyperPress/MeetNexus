# MeetNexus 项目手册

## 1. 项目简介

MeetNexus 是一个基于 Live777 的多人视频会议软件。目标是实现房间管理、实时音视频、成员互动、主持人控制、录制与回放。

## 2. 技术架构

```text
React + TypeScript 前端
  ├─ REST / WebSocket ──> Rust + Axum API ──> PostgreSQL / Redis
  └─ /media/whip、/media/whep ──> Axum 鉴权代理 ──> Live777
```

| 层级 | 技术 | 职责 |
| --- | --- | --- |
| 前端 | React、TypeScript、Vite、Tailwind、daisyUI | 会议界面、设备控制、多画面和互动 |
| 后端 | Rust、Axum、Tokio | 用户、房间、权限、WebSocket 和媒体代理 |
| 数据 | PostgreSQL、Memurai（Redis 兼容） | 持久业务数据、在线状态和心跳 |
| 媒体 | Live777、WebRTC、WHIP/WHEP | 发布、订阅与转发音视频流 |
| 质量 | OpenAPI、Zod、Playwright、tracing | 契约、运行时校验、回归测试和结构化日志 |

## 3. 目录说明

```text
apps/web/                 前端工程
services/api/             Rust/Axum 后端工程
docs/                     架构、进度、API、运行与本手册
scripts/                  本机服务启动脚本
tools/                    本机 Memurai 与 Live777 二进制（不提交 Git）
```

## 4. 协作者部署与本机环境

需要安装或运行：

- Node.js 24+ 与 npm
- Rust stable 与 Cargo
- PostgreSQL 15+（Windows 服务，端口 `5432`）
- Memurai Developer（端口 `6379`）
- Live777 0.9.0（端口 `7777`）

### 新成员从零开始

```powershell
git clone https://github.com/HyperPress/MeetNexus.git
cd MeetNexus
git switch -c feat/<你的任务名>
.\scripts\setup.ps1 -InstallPrerequisites
```

`setup.ps1` 自动执行 `npm ci`、`cargo fetch` 和 `cargo build`，并可用 winget 安装缺失的 Node.js 与 Rust。若新安装了运行时，请重开 PowerShell 后再次运行脚本。

PostgreSQL、Memurai、Live777 是本机服务：PostgreSQL 的管理员密码必须由安装者自行设置，禁止写入代码库；Memurai 与 Live777 二进制也不提交 Git。脚本会检查这三项并给出缺失提示。详细配置见 [LOCAL_SETUP.md](LOCAL_SETUP.md)。

Memurai 与 Live777 的启动命令：

```powershell
.\scripts\start-local-media-services.ps1
```

API 和前端的启动命令：

```powershell
cargo run --manifest-path services/api/Cargo.toml
npm run dev --prefix apps/web
```

详细环境变量和 PostgreSQL 初始化方式见 [LOCAL_SETUP.md](LOCAL_SETUP.md)。真实密码和 Token 只能保存在本机环境变量中，禁止提交 Git。

## 5. 分支协作与组长合并

1. 开始任务前阅读 `AGENTS.md`、`docs/STATUS.md`、`docs/ARCHITECTURE.md`，并先同步远端 `main`。
2. 每位成员必须创建自己的分支，例如 `feat/room-api`、`fix/login-error`、`docs/setup-guide`；禁止直接在 `main` 开发或推送。
3. 一条分支只处理一个任务；涉及 API 时，先更新 `docs/openapi.yaml`。
4. 完成后运行检查、更新 `docs/STATUS.md`，再推送自己的分支并创建 Pull Request。
5. 只有组长审核 Pull Request、处理冲突并合并到 `main`。成员不得自行合并自己的变更。
6. 合并完成后删除远端功能分支，并用最新 `main` 开始下一项任务。

## 6. 质量检查

```powershell
npm run lint --prefix apps/web
npm run build --prefix apps/web
cargo fmt --manifest-path services/api/Cargo.toml --check
cargo clippy --manifest-path services/api/Cargo.toml -- -D warnings
cargo test --manifest-path services/api/Cargo.toml
```

后续增加 Playwright 用例后，执行：

```powershell
npx --prefix apps/web playwright test
```

## 7. 当前状态与下一步

当前已完成项目工程、依赖、本机媒体服务和开发规范。尚未实现房间、用户、WebRTC 前端、媒体代理和录制等业务功能。

下一步按以下顺序实施：

1. 创建 `meetnexus` PostgreSQL 用户与数据库。
2. 为 Rust API 加入配置加载、数据库/Redis 连接和统一错误模型。
3. 定义房间、参会者、媒体授权的 OpenAPI 接口。
4. 实现创建和加入房间。
5. 接入 WHIP/WHEP，实现最小双人音视频闭环。
