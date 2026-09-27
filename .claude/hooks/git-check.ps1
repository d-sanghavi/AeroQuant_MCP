$ErrorActionPreference = "Continue"
# AeroQuant MCP - pre-commit sanity. See .claude/skills/git-engineering/SKILL.md.

if (-not (Test-Path ".git")) {
    Write-Host "git-check: not a git repository yet."
    exit 0
}

Write-Host "=== whitespace / conflict markers ==="
git diff --check

Write-Host "=== status ==="
git status --short

Write-Host "=== diffstat ==="
git diff --stat

# Large files are a recurring monorepo hazard: raw data, model weights, notebook outputs.
# The frozen golden Parquet fixture is the deliberate exception.
Write-Host "=== staged files over 5 MB ==="
git diff --cached --name-only --diff-filter=ACM | ForEach-Object {
    if (Test-Path $_) {
        $size = (Get-Item $_).Length
        if ($size -gt 5MB) {
            Write-Warning ("{0} is {1:N1} MB - use DVC/S3 unless this is the golden dataset fixture." -f $_, ($size / 1MB))
        }
    }
}

# Notebooks with output cells leak data and bloat diffs.
$nb = git diff --cached --name-only --diff-filter=ACM | Where-Object { $_ -like "*.ipynb" }
if ($nb) {
    Write-Warning "Staged notebooks: $nb - strip output cells before committing."
}
