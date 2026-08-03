# 本机运行说明

MeetNexus 不使用 Docker。以下服务均直接在开发机上运行。

## 前置软件

- Node.js 24+ 与 npm
- Rust stable（包含 Cargo）
- PostgreSQL 15+，默认端口 `5432`
- Memurai Developer 4.1.8（Redis 7 兼容），默认端口 `6379`
- Live777 0.9.0，默认 HTTP 端口 `7777`

## 新协作者快速初始化

在 PowerShell 中克隆项目后进入项目目录，先创建自己的功能分支。不要直接在 `main` 上开发：

```powershell
git clone https://github.com/HyperPress/MeetNexus.git
cd MeetNexus
git switch -c feat/<你的任务名>
```

首次运行可执行以下命令。它会安装锁定的前端依赖、获取并构建 Rust 依赖；若缺少 Node.js 或 Rust，可加 `-InstallPrerequisites` 让脚本通过 winget 安装它们。安装完成后请重新打开 PowerShell 并再次运行脚本。

```powershell
.\scripts\setup.ps1 -InstallPrerequisites
```

PostgreSQL、Memurai 与 Live777 不能完全无人值守安装：PostgreSQL 需要开发者本人设置管理员密码，媒体服务需要保存在本机的二进制文件。脚本会检测并明确提示缺失项，不会写入或提交任何密码、Token。

完成 PostgreSQL 初始化、下载 Memurai 和 Live777 后，执行 `./scripts/start-local-media-services.ps1` 启动本机媒体服务。

Memurai 与 Live777 的本机二进制文件位于未纳入 Git 的 `tools/` 目录。重启电脑后，可在项目根目录执行：

```powershell
.\scripts\start-local-media-services.ps1
```

## 环境变量

根目录 `.env.example` 保存了可以提交到 Git 的本机连接模板，包括 PostgreSQL 数据库名、用户、端口以及 Redis 和 Live777 地址。真实密码和 Token 只能保存在被 Git 忽略的本机 `.env` 或当前终端环境变量中。

当前 API 直接读取进程环境变量，不会自动加载 `.env`。在启动 API 的 PowerShell 中设置：

```powershell
$env:SERVER_ADDR = "127.0.0.1:8080"
$env:DATABASE_URL = "postgres://meetnexus:replace-with-local-password@127.0.0.1:5432/meetnexus"
$env:REDIS_URL = "redis://127.0.0.1:6379/0"
$env:LIVE777_URL = "http://127.0.0.1:7777"
$env:RUST_LOG = "api=info,tower_http=info"
```

Live777 开启 Token 鉴权时，再设置 `LIVE777_TOKEN`。还必须设置至少 32 个字符的随机 `AUTH_JWT_SECRET`，用于签发房间成员会话令牌；禁止提交真实密码、Token 或签名密钥。

录制回放文件根目录由 `RECORDING_STORAGE_ROOT` 指定，默认是仓库内本机 Live777 的 `tools/live777/bin/live777-v0.9.0-x86_64-pc-windows-msvc/storage`。部署时必须将它设为 Live777 recorder 实际写入的目录；不要把该目录公开为静态站点。浏览器只能携带会议成员 Bearer 令牌经 API 读取已停止录制的 MPD 和 `.m4s` 文件。

回放使用浏览器原生 MediaSource，需使用支持 MP4/Opus MSE 的现代 Chromium 浏览器；会议页会在回放轨道不受支持时显示中文提示。

## 启动顺序

1. 确认 Windows PostgreSQL 服务 `postgresql-x64-15` 正在运行。
2. 执行 `./scripts/start-local-media-services.ps1` 启动 Memurai 和 Live777。
3. 启动 API：`./scripts/start-api.ps1`。该脚本只读取 `.env` 中的允许配置项，并将相对 `RECORDING_STORAGE_ROOT` 解析为绝对路径，避免因 API 工作目录不同而无法读取 Live777 录制文件。
4. 在另一个终端启动前端：`npm run dev --prefix apps/web`。

当前 API 存活检查地址为 `http://localhost:8080/health`；依赖就绪检查地址为 `http://localhost:8080/ready`，后者会验证 PostgreSQL、Redis 和 Live777，任一不可用时返回 503。前端开发地址由 Vite 输出。
前端开发服务器会把同源的 `/health` 与 `/rooms` 请求代理到 `http://127.0.0.1:8080`，因此进行房间创建、查询、加入、离开和心跳联调时，API 必须使用当前约定端口启动。

## PostgreSQL 数据库初始化

Windows 本机 PostgreSQL 已运行，但创建 `meetnexus` 用户和数据库需要已有 `postgres` 管理员密码。获得密码后执行：

```powershell
& 'C:\Program Files\PostgreSQL\15\bin\psql.exe' -h 127.0.0.1 -U postgres -d postgres
```

在 `psql` 中创建项目用户和数据库；密码不得提交到 Git。

创建数据库后安装与项目 SQLx 版本一致的命令行工具，并执行迁移：

```powershell
cargo install sqlx-cli --version 0.8.6 --no-default-features --features rustls,postgres
sqlx migrate run --source services/api/migrations --database-url $env:DATABASE_URL
```

API 当前不会自动执行迁移。未完成迁移时，`/health` 仍可能返回成功，但 `/ready` 和房间接口会因 PostgreSQL 查询失败而不能就绪或正常工作。
