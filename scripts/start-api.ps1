[CmdletBinding()]
param()

$ErrorActionPreference = "Stop"
$projectRoot = Split-Path -Parent $PSScriptRoot
$envFile = Join-Path $projectRoot ".env"

if (-not (Test-Path $envFile)) {
    throw ([string]::Concat([char]0x672C, [char]0x673A, " .env ", [char]0x4E0D, [char]0x5B58, [char]0x5728, [char]0x3002))
}

$allowedNames = @(
    "SERVER_ADDR",
    "DATABASE_URL",
    "REDIS_URL",
    "LIVE777_URL",
    "LIVE777_TOKEN",
    "AUTH_JWT_SECRET",
    "RECORDING_STORAGE_ROOT",
    "RUST_LOG"
)

Get-Content $envFile | ForEach-Object {
    if ($_ -match "^([^#=]+)=(.*)$" -and $allowedNames -contains $matches[1]) {
        Set-Item -Path ("Env:" + $matches[1]) -Value $matches[2]
    }
}

$recordingStorageRoot = $env:RECORDING_STORAGE_ROOT
if ([string]::IsNullOrWhiteSpace($recordingStorageRoot)) {
    $recordingStorageRoot = "tools/live777/bin/live777-v0.9.0-x86_64-pc-windows-msvc/storage"
}
if (-not [System.IO.Path]::IsPathRooted($recordingStorageRoot)) {
    $recordingStorageRoot = Join-Path $projectRoot $recordingStorageRoot
}
$env:RECORDING_STORAGE_ROOT = [System.IO.Path]::GetFullPath($recordingStorageRoot)

Push-Location (Join-Path $projectRoot "services/api")
try {
    cargo run
} finally {
    Pop-Location
}
