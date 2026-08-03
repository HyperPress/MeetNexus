# 需要以“管理员身份运行”的 PowerShell 执行本脚本。
# 仅在专用网络放行 Caddy 的 HTTP/HTTPS 入站连接，供局域网设备访问。

$ErrorActionPreference = 'Stop'

$httpRule = 'MeetNexus Caddy HTTP（专用网络）'
$httpsRule = 'MeetNexus Caddy HTTPS（专用网络）'

Get-NetFirewallRule -DisplayName $httpRule -ErrorAction SilentlyContinue | Remove-NetFirewallRule
Get-NetFirewallRule -DisplayName $httpsRule -ErrorAction SilentlyContinue | Remove-NetFirewallRule

New-NetFirewallRule -DisplayName $httpRule -Direction Inbound -Action Allow -Protocol TCP -LocalPort 80 -Profile Private | Out-Null
New-NetFirewallRule -DisplayName $httpsRule -Direction Inbound -Action Allow -Protocol TCP -LocalPort 443 -Profile Private | Out-Null

Write-Output '已在“专用网络”放行 TCP 80 和 443。'
