$ErrorActionPreference = "Stop"
# AeroQuant Terminal - the crown-jewel gate.
#
# PROTOTYPE SCOPE: the index-number library lives at client/src/lib/quant (TypeScript),
# not packages/aq_indexnum (Python). It is still the most credible artefact in the repo.
# The axioms are non-negotiable: identity, proportionality, time reversal, units
# invariance, GEKS transitivity, bounded chain drift.
# Run this on any change under client/src/lib/quant/ or client/src/lib/linalg/.

if (-not (Test-Path "client\src\lib\quant")) {
    Write-Host "index-gate: client/src/lib/quant not present yet - skipping."
    exit 0
}

if (-not (Test-Path "client\node_modules")) {
    Write-Host "index-gate: client dependencies not installed - run 'npm --prefix client install'."
    exit 0
}

Write-Host "=== quant: axiom property tests + golden fixtures (vitest) ==="
npm --prefix client run test:quant
if ($LASTEXITCODE -ne 0) {
    Write-Error "index-gate FAILED: an index axiom or golden fixture did not hold. Fix the math, never the test."
    exit 1
}

Write-Host "index-gate passed: axioms hold, golden fixtures reproduced."
