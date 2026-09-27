$ErrorActionPreference = "Stop"
# AeroQuant MCP - mypy over Python, tsc over the React terminal.

$ran = $false

if ((Test-Path "pyproject.toml") -and (Get-Command mypy -ErrorAction SilentlyContinue)) {
    Write-Host "mypy..."
    mypy apps packages
    $ran = $true
}

if (Test-Path "client\tsconfig.json") {
    Write-Host "tsc --noEmit (client)..."
    npm --prefix client run typecheck
    $ran = $true
}

if (-not $ran) { Write-Host "typecheck: nothing to check yet." }
