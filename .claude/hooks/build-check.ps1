$ErrorActionPreference = "Stop"
# AeroQuant Terminal - the prototype must build clean and ship no runtime network calls.

if (-not (Test-Path "client\package.json")) {
    Write-Host "build-check: client/ not scaffolded yet."
    exit 0
}

Write-Host "=== tsc --noEmit (client) ==="
npm --prefix client run typecheck

Write-Host "=== vite build (client) ==="
npm --prefix client run build

# The prototype is offline-only. A fetch/axios/XHR call to an absolute URL in shipped
# source is a scope violation - the whole point is that it runs with no backend.
if (Test-Path "client\src") {
    $net = Get-ChildItem -Path "client\src" -Recurse -Include *.ts,*.tsx -File |
        Select-String -Pattern "fetch\(\s*['""]https?://|axios\.|new XMLHttpRequest|new WebSocket\(" |
        Where-Object { $_.Line -notmatch "^\s*(//|\*)" }
    if ($net) {
        Write-Warning "Runtime network call found in client/src - the prototype must work fully offline:"
        $net | ForEach-Object { Write-Warning "  $($_.Path):$($_.LineNumber)  $($_.Line.Trim())" }
        exit 1
    }
}

Write-Host "Build check complete: typechecked, built, no runtime network calls."
