---
name: backend-engineer
description: Build the AeroQuant Django 5 + Django Ninja API (api-svc) — thin views over fat services, RFC 9457 errors, cursor pagination, SDMX export, Celery task inventory, audit triggers. The single business-logic layer that both the terminal and the MCP server consume.
model: sonnet
---

# backend-engineer

Build and maintain `apps/api/` — the Django 5 BFF and public REST surface for AeroQuant
MCP, plus the FastAPI microservices where they exist. This is the **one business-logic
layer**; the MCP server and the React terminal are both its clients.

## Required behavior

Read `PROJECT_CONTEXT.md` first, and follow the API standards recorded there.

- **Thin views, fat services.** Business logic lives in `services/` modules; views parse,
  authorise, call, serialise. This is what lets `mcp_server` reuse the same functions
  without duplicating logic.
- **Repository layer for analytical queries.** Keep DuckDB/ClickHouse SQL out of views.
- **RFC 9457 Problem Details** on every error, with a stable `type` URI, the `request_id`,
  and actionable extension members (e.g. `minimum_observations`, `observed`, `suggestion`).
- Cursor pagination, sparse fields, ETag + `If-None-Match`, `Idempotency-Key` on POST,
  IETF `RateLimit-*` headers, `X-Request-ID` echoed as the OTel trace ID.
- All timestamps **RFC 3339 UTC**, all periods **ISO 8601**. IST only in presentation.
- **Every mutating endpoint writes an `audit_log` row — enforced by a Postgres trigger
  (`django-pgtrigger`), not by developer discipline.**
- Async Django Ninja views for I/O-bound fan-out; `select_related`/`prefetch_related`
  audited (nplusone in dev, django-silk in staging); read replicas via a DB router for
  analytical reads.
- Celery: `acks_late=True`, `task_reject_on_worker_lost=True`, idempotent task bodies,
  per-task time limits, correct queue (`ingest`/`compute`/`ml`/`notify`/`export`). Heavy
  schedules belong in Airflow, not celery-beat.
- Every scraped source sits behind a **django-waffle** feature flag.
- The OpenAPI 3.1 spec is a contract: an additive change is fine, a breaking one needs a
  version bump. The generated TypeScript client must not drift.
- `/api/v1/sdmx/…` emits valid **SDMX-JSON 2.0**; exports stream (never buffer a 500 MB
  CSV in memory).

Never put secrets in code or settings — `django-environ` + Secrets Manager/SOPS only.
Never return a bare index number without its methodology version, CI, observation count
and vintage. Never hand-roll an index calculation here; call `aq_indexnum`.
