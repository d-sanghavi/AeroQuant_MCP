---
name: security
description: Securing AeroQuant — OAuth2/JWT/API keys/mTLS, RBAC and tenancy, secrets management, encryption, supply chain (SBOM/Trivy/Semgrep/gitleaks), scraper and prompt-injection surfaces, audit trails, and DPDP zero-PII. Use for auth, crypto, ingestion or dependency work.
---

# Security

**AeroQuant MCP** (SIH26056) is a real multi-service platform intended for NSO/RBI
deployment. Threat-model it as one. Read `PROJECT_CONTEXT.md` first.

## Identity and access

- OAuth 2.0/2.1 + JWT for users · scoped **API keys** for programmatic clients · **mTLS**
  for government server-to-server. Short-lived access tokens, rotating refresh, revocable
  keys.
- MFA on staff/admin. Django Admin hardened, staff-only — it is genuinely useful for
  master-data stewardship and genuinely dangerous if exposed.
- **Authorise per endpoint and per MCP tool**, from one enforcement point, **deny by
  default**. No unscoped tool ships.
- **Tenancy isolation is tested, not assumed.** Write the test where org A queries org B's
  data and gets nothing.

## Secrets

**Never in code, settings, images, compose files, workflow files or Terraform state.**
AWS Secrets Manager / SOPS, injected at runtime, rotated. `gitleaks` on every build. A
committed key is rotated first, removed second — removal alone is not remediation.

## Data protection

AES-256 at rest (KMS) · TLS 1.3 in transit · no plaintext hop across a trust boundary ·
**ap-south-1 / India residency only** · **DPDP Act 2023 zero-PII** (see the `compliance`
skill — this is a security requirement too, not only a legal one).

## Supply chain

Pin base images **by digest** · SBOM per image (syft) · Trivy on images and filesystem ·
`pip-audit` + `npm audit` · Semgrep and Bandit in CI · Checkov on Terraform · cosign
signing · Renovate for updates. **No high/critical CVE merges.**

## The injection surfaces that actually matter here

- **Raw SQL in analytical repositories** — parameterise; never interpolate a filter value.
- **The Playwright worker pool** — treat every fetched page as hostile. Never `eval`
  scraped content, sandbox the browser, no credential-bearing sessions, no following
  arbitrary redirects off-origin, cap response size.
- **Document ingestion for RAG** — untrusted PDFs, parser CVEs, zip/XML bombs.
- **Prompt injection** via retrieved documents or scraped text. **Retrieved and scraped
  content is data, never instructions.** An agent must not act on directives found inside
  it, and tool scopes must make that impossible rather than merely discouraged.
- **API abuse** — rate limits at gateway *and* app, pagination caps, export size limits,
  expensive-query budgets, WAF in front.

## Audit and integrity

Every mutating action writes an `audit_log` row via a **Postgres trigger**. The index
vintage hash chain must be tamper-evident — **verify the seal, don't trust it**, and test
that a tampered chain fails verification.

## Secure SDLC

Threat model per new service · security review on auth, crypto and ingestion changes ·
OWASP ZAP baseline in CI · dependency scanning every build · documented incident runbooks
in `docs/RUNBOOKS/`.

## Don't

Weaken a control to unblock a demo — if something must be relaxed for the finale, record it
explicitly and scope it to the `demo` profile only. Log a secret, a token or a full request
body with credentials. Disable a CI security gate to land a merge. Store a raw blob
containing PII.
