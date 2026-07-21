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

在启动 API 的 PowerShell 中设置本机服务地址：

```powershell
$env:SERVER_ADDR = "127.0.0.1:8080"
$env:DATABASE_URL = "postgres://meetnexus:replace-with-local-password@localhost:5432/meetnexus"
$env:REDIS_URL = "redis://localhost:6379/0"
$env:LIVE777_URL = "http://localhost:7777"
$env:RUST_LOG = "info"
```

Live777 开启 Token 鉴权时，再设置 `LIVE777_TOKEN`；禁止提交真实密码或 Token。

## 启动顺序

1. 确认 Windows PostgreSQL 服务 `postgresql-x64-15` 正在运行。
2. 执行 `./scripts/start-local-media-services.ps1` 启动 Memurai 和 Live777。
3. 启动 API：`cargo run --manifest-path services/api/Cargo.toml`。
4. 在另一个终端启动前端：`npm run dev --prefix apps/web`。

当前 API 健康检查地址为 `http://localhost:8080/health`；前端开发地址由 Vite 输出。

## PostgreSQL 数据库初始化

Windows 本机 PostgreSQL 已运行，但创建 `meetnexus` 用户和数据库需要已有 `postgres` 管理员密码。获得密码后执行：

```powershell
& 'C:\Program Files\PostgreSQL\15\bin\psql.exe' -h 127.0.0.1 -U postgres -d postgres
```

在 `psql` 中创建项目用户和数据库；密码不得提交到 Git。
