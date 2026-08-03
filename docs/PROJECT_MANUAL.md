# MeetNexus 项目手册

## 1. 项目简介

MeetNexus 是一个基于 Live777 的多人视频会议软件。目标是实现房间管理、实时音视频、成员互动、主持人控制、录制与回放。

## 2. 目标技术架构

以下链路是项目目标，不代表所有组件均已实现。实际完成范围以 `docs/STATUS.md` 为准。

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
MeetNexus/
├─ AGENTS.md                         全仓库 AI 与团队协作规则
├─ README.md                         项目入口说明
├─ apps/
│  └─ web/                           React + TypeScript 前端
│     ├─ AGENTS.md                   前端专属 AI 约束
│     ├─ src/
│     │  ├─ app/                     路由、Provider、布局和应用装配
│     │  ├─ components/              跨业务通用 UI 组件
│     │  ├─ features/
│     │  │  ├─ auth/                 身份与访问控制
│     │  │  ├─ rooms/                房间业务
│     │  │  └─ meeting/              会议界面与互动业务
│     │  ├─ lib/
│     │  │  ├─ api/                  HTTP/WebSocket 客户端
│     │  │  └─ media/                设备、WebRTC、WHIP/WHEP 适配
│     │  ├─ schemas/                 Zod 运行时数据校验
│     │  └─ types/                   跨功能共享类型
│     └─ tests/e2e/                  Playwright 端到端测试
├─ services/
│  └─ api/                           Rust + Axum 后端
│     ├─ AGENTS.md                   后端专属 AI 约束
│     ├─ src/
│     │  ├─ config/                  配置加载与校验
│     │  ├─ domain/                  领域模型和核心业务规则
│     │  ├─ application/             应用用例与端口 trait
│     │  ├─ infrastructure/          PostgreSQL、Redis、Live777 适配
│     │  ├─ http/                    Axum 路由、中间件和 DTO
│     │  └─ telemetry/               tracing 与结构化日志
│     ├─ migrations/                 SQLx 数据库迁移
│     └─ tests/                      后端集成测试
├─ docs/
│  ├─ adr/                           架构决策记录
│  ├─ runbooks/                      运维与排障手册
│  ├─ openapi.yaml                   唯一 API 契约
│  ├─ ARCHITECTURE.md                系统架构
│  ├─ LOCAL_SETUP.md                 本机部署说明
│  ├─ PROJECT_MANUAL.md              项目手册
│  └─ STATUS.md                      当前进度与交接状态
├─ scripts/                          初始化和本机服务脚本
└─ tools/                            Memurai、Live777 本机二进制（不提交 Git）
```

各业务目录中的 `README.md` 是当前阶段的职责说明和 Git 占位文件，不代表相关功能已经完成。新增代码必须放入对应边界；如果现有目录无法合理容纳，应先更新架构说明并取得团队确认。

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

当前已完成工程基础、房间 PostgreSQL/Redis 模块、中文房间入口、会前设备预览、房间成员 JWT 鉴权、WebSocket 实时事件、同源 WHIP/WHEP 媒体代理、基础多人音视频闭环及 Live777 逐成员录制任务。会议页已接入主持人录制控制与录制状态；已实现仅会议成员可访问的受保护回放文件接口；浏览器播放器尚未实现。

下一步按以下顺序实施：

1. 接入浏览器 DASH 播放器并复用受保护的回放文件接口。
2. 在具备实体摄像头、麦克风和扬声器的两台浏览器上完成手动音视频验收。
3. 根据实际部署需要补充录制存储与回放播放器方案。
