$ErrorActionPreference = "Stop"
# AeroQuant MCP - lint the Python monorepo and the React terminal.

$ran = $false

# --- Python: apps/ and packages/ ---
if (Test-Path "pyproject.toml") {
    if (Get-Command ruff -ErrorAction SilentlyContinue) {
        Write-Host "ruff check..."
        ruff check .
        $ran = $true
    }
    if (Get-Command black -ErrorAction SilentlyContinue) {
        Write-Host "black --check..."
        black --check .
        $ran = $true
    }
}

# --- SQL: dbt models and analytical queries ---
if ((Test-Path "dbt_project.yml") -and (Get-Command sqlfluff -ErrorAction SilentlyContinue)) {
    Write-Host "sqlfluff lint..."
    sqlfluff lint .
    $ran = $true
}

# --- Frontend: client/ ---
if (Test-Path "client\package.json") {
    Write-Host "eslint (client)..."
    npm --prefix client run lint
    $ran = $true
}

if (-not $ran) { Write-Host "lint: nothing to lint yet (no pyproject.toml or client/package.json)." }
