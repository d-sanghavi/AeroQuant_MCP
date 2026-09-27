$ErrorActionPreference = "Continue"
# AeroQuant MCP - dependency, code and container scanning.
# CI gate: no high/critical CVEs introduced. See .claude/skills/security/SKILL.md.

$failed = $false

# --- Python dependencies ---
if (Get-Command pip-audit -ErrorAction SilentlyContinue) {
    Write-Host "=== pip-audit ==="
    pip-audit
    if ($LASTEXITCODE -ne 0) { $failed = $true }
}

# --- Python static analysis ---
if ((Test-Path "apps") -and (Get-Command bandit -ErrorAction SilentlyContinue)) {
    Write-Host "=== bandit ==="
    bandit -r apps packages -ll -q
    if ($LASTEXITCODE -ne 0) { $failed = $true }
}

if (Get-Command semgrep -ErrorAction SilentlyContinue) {
    Write-Host "=== semgrep ==="
    semgrep --config=auto --error --quiet
    if ($LASTEXITCODE -ne 0) { $failed = $true }
}

# --- Frontend dependencies ---
if (Test-Path "client\package-lock.json") {
    Write-Host "=== npm audit (client) ==="
    npm --prefix client audit --audit-level=high
    if ($LASTEXITCODE -ne 0) { $failed = $true }
}

# --- Filesystem / image scanning ---
if (Get-Command trivy -ErrorAction SilentlyContinue) {
    Write-Host "=== trivy fs ==="
    trivy fs --severity HIGH,CRITICAL --exit-code 1 --quiet .
    if ($LASTEXITCODE -ne 0) { $failed = $true }
}

# --- Terraform ---
if ((Test-Path "infra\terraform") -and (Get-Command checkov -ErrorAction SilentlyContinue)) {
    Write-Host "=== checkov (terraform) ==="
    checkov -d infra/terraform --compact --quiet
    if ($LASTEXITCODE -ne 0) { $failed = $true }
}

# --- Secrets ---
& "$PSScriptRoot\secrets.ps1"
if ($LASTEXITCODE -ne 0) { $failed = $true }

if ($failed) {
    Write-Error "Security scan reported findings. Fix the cause - do not disable the gate."
    exit 1
}
Write-Host "Security scan passed."
