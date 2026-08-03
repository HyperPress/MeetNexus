[CmdletBinding()]
param(
    [string]$NgrokPath
)

$ErrorActionPreference = 'Stop'

if ([string]::IsNullOrWhiteSpace($NgrokPath)) {
    $command = Get-Command ngrok.exe -ErrorAction SilentlyContinue
    if ($null -ne $command) {
        $NgrokPath = $command.Source
    } else {
        $NgrokPath = Join-Path $env:USERPROFILE 'Downloads\ngrok-v3-stable-windows-386\ngrok.exe'
    }
}

if (-not (Test-Path -LiteralPath $NgrokPath)) {
    throw '未找到 ngrok.exe。请通过 -NgrokPath 指定其绝对路径。'
}

if (-not (Test-NetConnection -ComputerName 127.0.0.1 -Port 443 -InformationLevel Quiet)) {
    throw '本机 Caddy 未在 TCP 443 端口运行。请先执行 .\scripts\start-caddy.ps1。'
}

# 免费 ngrok 账户不能通过 HTTP(S) 出站代理建立 agent 会话；只清除当前 ngrok
# 子进程继承到的代理变量，不修改系统设置、用户设置或 ngrok 的 authtoken。
@('HTTP_PROXY', 'HTTPS_PROXY', 'http_proxy', 'https_proxy', 'ALL_PROXY', 'all_proxy', 'NO_PROXY', 'no_proxy') |
    ForEach-Object { Remove-Item "Env:$_" -ErrorAction SilentlyContinue }

Write-Output '正在建立 ngrok HTTPS 隧道；公网地址会显示在下方。按 Ctrl+C 可停止隧道。'
& $NgrokPath http https://localhost:443
