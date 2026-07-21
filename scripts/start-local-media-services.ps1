$projectRoot = Split-Path -Parent $PSScriptRoot
$memuraiDir = Join-Path $projectRoot 'tools\memurai\package\tools'
$live777Dir = Join-Path $projectRoot 'tools\live777\bin\live777-v0.9.0-x86_64-pc-windows-msvc'

$memuraiExe = Join-Path $memuraiDir 'memurai.exe'
$memuraiConfig = Join-Path $memuraiDir 'samples\memurai.conf'
$live777Exe = Join-Path $live777Dir 'live777.exe'
$live777Config = Join-Path $live777Dir 'live777.toml'

if (-not (Test-Path -LiteralPath $memuraiExe) -or -not (Test-Path -LiteralPath $live777Exe)) {
  throw '缺少本机 Memurai 或 Live777 程序，请查看 docs/LOCAL_SETUP.md。'
}

if (-not (Get-NetTCPConnection -LocalPort 6379 -State Listen -ErrorAction SilentlyContinue)) {
  Start-Process -FilePath $memuraiExe -ArgumentList @($memuraiConfig) -WorkingDirectory $memuraiDir -WindowStyle Hidden
}

if (-not (Get-NetTCPConnection -LocalPort 7777 -State Listen -ErrorAction SilentlyContinue)) {
  Start-Process -FilePath $live777Exe -ArgumentList @('-c', $live777Config) -WorkingDirectory $live777Dir -WindowStyle Hidden
}

Write-Output '已执行 Memurai 和 Live777 启动命令。'
