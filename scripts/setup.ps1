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
        throw "winget was not found. Install App Installer or follow docs/LOCAL_SETUP.md."
    }

    Write-Host "Installing $Id with winget ..."
    & winget install --id $Id --exact --accept-package-agreements --accept-source-agreements
    if ($LASTEXITCODE -ne 0) {
        throw "winget could not install $Id. Follow docs/LOCAL_SETUP.md."
    }
}

if (-not (Test-CommandAvailable "node")) {
    if ($InstallPrerequisites) {
        Install-WithWinget "OpenJS.NodeJS.LTS"
        throw "Node.js was installed. Restart PowerShell and run this script again."
    }
    throw "Node.js was not found. Run .\scripts\setup.ps1 -InstallPrerequisites."
}

if (-not (Test-CommandAvailable "cargo")) {
    if ($InstallPrerequisites) {
        Install-WithWinget "Rustlang.Rustup"
        throw "Rust was installed. Restart PowerShell and run this script again."
    }
    throw "Rust/Cargo was not found. Run .\scripts\setup.ps1 -InstallPrerequisites."
}

Write-Host "Installing locked frontend dependencies ..."
npm ci --prefix apps/web
if ($LASTEXITCODE -ne 0) { throw "Frontend dependency installation failed." }

Write-Host "Fetching and building Rust dependencies ..."
cargo fetch --manifest-path services/api/Cargo.toml
if ($LASTEXITCODE -ne 0) { throw "Rust dependency fetch failed." }
cargo build --manifest-path services/api/Cargo.toml
if ($LASTEXITCODE -ne 0) { throw "Rust project build failed." }

$postgres = Get-Service -Name "postgresql-x64-*" -ErrorAction SilentlyContinue
if (-not $postgres) {
    Write-Warning "PostgreSQL Windows service not found. Install PostgreSQL 15+ and create the project database; see docs/LOCAL_SETUP.md."
}

if (-not (Test-Path "tools/live777")) {
    Write-Warning "Live777 binary not found. Download it to tools/live777; see docs/LOCAL_SETUP.md."
}
if (-not (Test-Path "tools/memurai")) {
    Write-Warning "Memurai binary not found. Download it to tools/memurai; see docs/LOCAL_SETUP.md."
}

Write-Host "`nSetup complete: code dependencies are ready. Configure PostgreSQL, Memurai, and Live777 before starting services."
