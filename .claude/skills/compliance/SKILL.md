---
name: compliance
description: AeroQuant's legal and privacy spine — the source_registry with robots.txt/ToS verdicts and dates, licensed-API terms, DPDP Act 2023 zero-PII posture, data residency, feature-flagged sources, and COMPLIANCE.md. Use before adding or changing any data source.
---

# Compliance

**A government cannot deploy an infringing collector.** This constraint is load-bearing for
AeroQuant MCP (SIH26056) — it is business requirement BR-3, and an evaluator will test it.
Read `PROJECT_CONTEXT.md` first.

## `source_registry` — a first-class entity, and a public page

Every source, before a single request is made, records:

| Field | Meaning |
|---|---|
| `legal_basis` | `licensed_api` · `permitted` · `prohibited` · `pending_review` |
| `robots_verdict` | What robots.txt allows, for our user-agent, on the paths we touch |
| `tos_verdict` | The position, **the clause relied on**, and **the date it was read** |
| `rate_limit` | Requests/period we commit to, below any stated ceiling |
| `enabled` | Runtime kill switch, read by the ingestion compliance gate |
| `health` | Live status, last success, error rate |

The gate reads this **at runtime**, per fetch. A disabled or `pending_review` source is not
fetched, and there is no override path — not for a backfill, not for a demo.

Publish the registry as a **public page in the terminal**. Toggling a source off live and
watching the pipeline adapt is a demo beat; it is also the honest thing to do.

## Rules

- **Never guess a ToS position.** Read the document, record the verdict, cite the clause,
  date it. "Probably fine" is not a legal basis. Ambiguous means disabled.
- **Licensed APIs are primary** (Amadeus, Duffel, Kiwi). Their terms bind **redistribution**
  too — check whether derived index publication, cache duration and SDMX export are
  permitted before shipping an endpoint that exposes them.
- **Permitted scraping is secondary**, always behind a `django-waffle` flag so a source can
  be killed in seconds without a deploy.
- Politeness controls — rate limits, jittered backoff, circuit breakers, an honest
  user-agent with contact details — are never weakened for throughput.
- Re-verify verdicts periodically. A ToS read in September is not evidence in December.

## DPDP Act 2023 — zero PII

Fares are not personal data. **Keep it that way.**

- No passenger names, emails, phone numbers or identity-carrying cookies.
- No linkage of search sessions to a person.
- Audit every new field before it reaches silver: could this identify someone, alone or
  joined to something else?
- If a source returns PII incidentally, drop it at the parser, before bronze.

## Residency and sovereignty

- **ap-south-1 / India only.** Flag any service, managed model endpoint, vendor or CDN that
  would move data out of India.
- The index engine core stays **open source (Apache-2.0)** with no proprietary lock-in —
  sovereign infrastructure principle, BR-6.
- The platform must be deployable on **MeghRaj / NIC cloud**, not only AWS — government
  procurement reality, BR-8. Avoid hard AWS-only dependencies in the core.

## `COMPLIANCE.md`

Source-by-source legal posture, robots/ToS evidence with dates, the DPDP statement, and
the retention/archive policy. Evaluators read this document. Keep it current with the
registry — a divergence between them is a finding.

## Don't

Add a collector without a recorded legal basis. Weaken a rate limit for a deadline. Fetch
from a prohibited source "just this once" for a demo. Store a raw blob that contains PII.
Let the registry go stale — rotate a compliance owner each week.
