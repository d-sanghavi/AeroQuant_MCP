$ErrorActionPreference = "Stop"

# AeroQuant MCP - secrets must NEVER appear in code, settings, images, compose files,
# workflows or Terraform state. Credentials live in AWS Secrets Manager / SOPS and are
# injected at runtime. A committed key is ROTATED first, removed second.

$excluded = "\\node_modules\\|\\.git\\|\\dist\\|\\.venv\\|\\__pycache__\\|\\.mypy_cache\\|\\.pytest_cache\\|\\.terraform\\|\\.claude-backup-"

$patterns = @(
    # Fare data providers (the ones this project actually uses)
    "AMADEUS_(CLIENT_)?(ID|SECRET|API_KEY)\s*[:=]\s*['`"]?[A-Za-z0-9]{10,}",
    "DUFFEL_(ACCESS_)?TOKEN\s*[:=]\s*['`"]?duffel_[A-Za-z0-9_\-]{10,}",
    "(KIWI|TEQUILA)_API_KEY\s*[:=]\s*['`"]?[A-Za-z0-9\-]{10,}",
    "SKYSCANNER_API_KEY\s*[:=]",
    # LLM / embedding providers
    "(OPENAI|ANTHROPIC|GOOGLE|GEMINI|HF|HUGGINGFACE|COHERE|MISTRAL)[_A-Z]*(API_)?KEY\s*[:=]",
    "sk-[A-Za-z0-9]{32,}",
    # Cloud
    "AWS_SECRET_ACCESS_KEY\s*[:=]",
    "AKIA[0-9A-Z]{16}",
    # Django / app
    "DJANGO_SECRET_KEY\s*[:=]\s*['`"][^'`"]{16,}",
    "SECRET_KEY\s*=\s*['`"](?!.*(env|getenv|config\(|os\.))[^'`"]{16,}",
    # Datastores and brokers with inline credentials
    "(postgres(ql)?|redis|amqp|clickhouse|mongodb)://[^:\s/]+:[^@\s]+@",
    # Generic
    "(SECRET|PRIVATE)_KEY\s*[:=]",
    "-----BEGIN (RSA |EC |OPENSSH |PGP )?PRIVATE KEY-----",
    "Bearer\s+[A-Za-z0-9\-_\.]{24,}",
    "eyJ[A-Za-z0-9_\-]{10,}\.eyJ[A-Za-z0-9_\-]{10,}\."
)

$found = $false

Get-ChildItem -Recurse -File -ErrorAction SilentlyContinue |
Where-Object {
    $_.FullName -notmatch $excluded -and
    $_.Name -notmatch "^\.env(\.|$)" -and
    $_.Name -ne "secrets.ps1" -and
    $_.Length -lt 2MB
} |
ForEach-Object {
    $text = Get-Content $_.FullName -Raw -ErrorAction SilentlyContinue
    if ($null -eq $text) { return }
    foreach ($pattern in $patterns) {
        if ($text -match $pattern) {
            Write-Warning "Potential secret in $($_.FullName)  [pattern: $pattern]"
            $found = $true
        }
    }
}

# .env files must never be tracked
if (Test-Path ".git") {
    $tracked = git ls-files | Select-String -Pattern "^\.env|/\.env" -ErrorAction SilentlyContinue
    if ($tracked) {
        Write-Warning "Tracked .env file(s) detected: $tracked"
        $found = $true
    }
}

if (Get-Command gitleaks -ErrorAction SilentlyContinue) {
    Write-Host "gitleaks..."
    gitleaks detect --no-banner --redact
}

if ($found) {
    Write-Error "Secret scan FAILED. Rotate the credential first, then remove it from the repo."
    exit 1
}

Write-Host "Secret scan passed."
