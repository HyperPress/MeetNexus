[CmdletBinding()]
param(
    [switch]$InstallPrerequisites
)

$ErrorActionPreference = "Stop"

function Test-CommandAvailable {
    param([Parameter(Mandatory = $true)][string]$Name)
    return $null -ne (Get-Command $Name -ErrorAction SilentlyContinue)
}

function Install-WithWinget {
    param([Parameter(Mandatory = $true)][string]$Id)

    if (-not (Test-CommandAvailable "winget")) {
        throw "未找到 winget。请安装应用安装程序，或按照 docs/LOCAL_SETUP.md 手动安装依赖。"
    }

    Write-Host "正在使用 winget 安装 $Id……"
    & winget install --id $Id --exact --accept-package-agreements --accept-source-agreements
    if ($LASTEXITCODE -ne 0) {
        throw "winget 无法安装 $Id，请按照 docs/LOCAL_SETUP.md 手动安装。"
    }
}

if (-not (Test-CommandAvailable "node")) {
    if ($InstallPrerequisites) {
        Install-WithWinget "OpenJS.NodeJS.LTS"
        throw "Node.js 已安装。请重新打开 PowerShell，然后再次运行此脚本。"
    }
    throw "未找到 Node.js。请运行 .\scripts\setup.ps1 -InstallPrerequisites。"
}

if (-not (Test-CommandAvailable "cargo")) {
    if ($InstallPrerequisites) {
        Install-WithWinget "Rustlang.Rustup"
        throw "Rust 已安装。请重新打开 PowerShell，然后再次运行此脚本。"
    }
    throw "未找到 Rust/Cargo。请运行 .\scripts\setup.ps1 -InstallPrerequisites。"
}

Write-Host "正在安装锁定的前端依赖……"
npm ci --prefix apps/web
if ($LASTEXITCODE -ne 0) { throw "前端依赖安装失败。" }

Write-Host "正在获取并构建 Rust 依赖……"
cargo fetch --manifest-path services/api/Cargo.toml
if ($LASTEXITCODE -ne 0) { throw "Rust 依赖获取失败。" }
cargo build --manifest-path services/api/Cargo.toml
if ($LASTEXITCODE -ne 0) { throw "Rust 项目构建失败。" }

$postgres = Get-Service -Name "postgresql-x64-*" -ErrorAction SilentlyContinue
if (-not $postgres) {
    Write-Warning "未找到 PostgreSQL Windows 服务。请安装 PostgreSQL 15+ 并创建项目数据库，详见 docs/LOCAL_SETUP.md。"
}

if (-not (Test-Path "tools/live777")) {
    Write-Warning "未找到 Live777 本机程序。请下载到 tools/live777，详见 docs/LOCAL_SETUP.md。"
}
if (-not (Test-Path "tools/memurai")) {
    Write-Warning "未找到 Memurai 本机程序。请下载到 tools/memurai，详见 docs/LOCAL_SETUP.md。"
}

Write-Host "`n初始化完成：代码依赖已就绪。请先配置 PostgreSQL、Memurai 和 Live777，再启动服务。"
