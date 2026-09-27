$ErrorActionPreference = "Stop"
# AeroQuant MCP - pytest (backend + index engine) and vitest (terminal).
# Coverage gates: backend 80%, aq_indexnum 95%, frontend 70%.

$ran = $false

if ((Test-Path "pyproject.toml") -and (Get-Command pytest -ErrorAction SilentlyContinue)) {
    Write-Host "pytest..."
    pytest -q
    $ran = $true
}

if (Test-Path "client\package.json") {
    Write-Host "vitest (client)..."
    npm --prefix client test
    $ran = $true
}

if (-not $ran) { Write-Host "test: no test suite present yet." }
