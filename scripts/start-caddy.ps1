[CmdletBinding()]
param(
    [string]$LanIp
)

$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$caddyExe = Join-Path $env:USERPROFILE '.local\caddy\caddy.exe'
$caddyfile = Join-Path $projectRoot 'deployment\caddy\Caddyfile'
$webRoot = Join-Path $projectRoot 'apps\web\dist'

if (-not (Test-Path -LiteralPath $caddyExe)) {
    throw '未找到 Caddy。请先将官方 Caddy Windows 发布包安装到 %USERPROFILE%\.local\caddy\caddy.exe。'
}

if (-not (Test-Path -LiteralPath $webRoot)) {
    throw '未找到前端生产构建产物。请先执行 npm run build --prefix apps/web。'
}

if ([string]::IsNullOrWhiteSpace($LanIp)) {
    $defaultRoute = Get-NetRoute -DestinationPrefix '0.0.0.0/0' -ErrorAction Stop |
        Sort-Object -Property RouteMetric, InterfaceMetric |
        Select-Object -First 1
    $LanIp = Get-NetIPAddress -InterfaceIndex $defaultRoute.InterfaceIndex -AddressFamily IPv4 |
        Where-Object { $_.IPAddress -notmatch '^(127\.|169\.254\.)' } |
        Select-Object -ExpandProperty IPAddress -First 1
}

if ([string]::IsNullOrWhiteSpace($LanIp)) {
    throw '未能识别本机局域网 IPv4 地址。请使用 -LanIp 显式指定，例如 .\scripts\start-caddy.ps1 -LanIp 192.168.1.20。'
}

$env:MEETNEXUS_LAN_IP = $LanIp
$env:MEETNEXUS_WEB_ROOT = [System.IO.Path]::GetFullPath($webRoot)

& $caddyExe validate --config $caddyfile --adapter caddyfile
if ($LASTEXITCODE -ne 0) {
    throw 'Caddy 配置校验失败，未启动服务。'
}

Write-Output "Caddy 将提供以下入口："
Write-Output "  https://localhost"
Write-Output "  https://$LanIp"
Write-Output '按 Ctrl+C 可停止 Caddy。'

& $caddyExe run --config $caddyfile --adapter caddyfile
