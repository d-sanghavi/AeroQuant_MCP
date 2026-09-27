---
name: git-engineering
description: Git and PR discipline for the AeroQuant monorepo — small focused commits, signed commits, the CI quality gates a PR must pass, expand-contract migration review, and never committing secrets or large data.
---

# Git Engineering

Keep AeroQuant's history reviewable and its gates honest. Read `PROJECT_CONTEXT.md` first.

## Commits

- Small, logical, focused diffs. One concern per commit.
- Descriptive messages: what changed and **why**, not a restatement of the diff.
- Scope by module in the monorepo (`api:`, `ingestion:`, `indexnum:`, `mcp:`, `web:`,
  `infra:`) so history is greppable per service.
- **Signed commits** — it is a merge gate.
- Never rewrite shared history without agreement.

## Before every commit

diff check · tests · lint (ruff, black, eslint, prettier, sqlfluff) · typecheck (mypy,
tsc) · secret scan. The hooks in `.claude/hooks/` run these.

## A PR cannot merge unless (§29.2)

- All lint and type checks pass
- Backend coverage ≥80%, frontend ≥70%, **no decrease from base**
- No high/critical CVEs introduced
- **No secrets detected**
- **OpenAPI change is additive, or the version is incremented** (and the generated TS
  client is regenerated with no drift)
- **Django migrations are reversible and reviewed** — expand-contract only, never a
  migration that locks `fare_observation`
- ML metric thresholds met (if models touched)
- RAG faithfulness ≥0.90 (if retrieval touched)
- E2E suite green
- One approving review

**Never disable a gate to land a merge.** Fix the cause, or record an explicit decision.

## Never commit

Secrets, API keys, `.env` files, or a credential of any kind — a committed key is
**rotated first**, removed second. Large raw data or model weights (use DVC/S3; the golden
Parquet fixture is the deliberate exception). Notebooks with output cells and embedded
credentials. Generated clients or build artefacts that CI regenerates.

## Branches

`feature/*` → PR (ephemeral preview, seeded DB) → `main` (auto-deploys staging) →
tag `v*` + manual approval (production, blue/green with canary).
