# 将 Caddy 的本地根证书导入当前 Windows 用户的“受信任的根证书颁发机构”。
# 不需要管理员权限；局域网内的其他 Windows 设备需各自运行等效操作。

$ErrorActionPreference = 'Stop'
$rootCertificate = Join-Path $env:APPDATA 'Caddy\pki\authorities\local\root.crt'

if (-not (Test-Path -LiteralPath $rootCertificate)) {
    throw '未找到 Caddy 本地根证书。请先启动一次 .\scripts\start-caddy.ps1。'
}

$certificate = New-Object System.Security.Cryptography.X509Certificates.X509Certificate2($rootCertificate)
$existing = Get-ChildItem Cert:\CurrentUser\Root | Where-Object { $_.Thumbprint -eq $certificate.Thumbprint }

if ($null -eq $existing) {
    Import-Certificate -FilePath $rootCertificate -CertStoreLocation 'Cert:\CurrentUser\Root' | Out-Null
    Write-Output '已将 Caddy 本地根证书导入当前用户的受信任根证书库。'
} else {
    Write-Output 'Caddy 本地根证书已受信任，无需重复导入。'
}
