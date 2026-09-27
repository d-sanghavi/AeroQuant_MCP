---
name: backend-engineering
description: AeroQuant's Django 5 + Django Ninja backend and API standards — thin views over fat services, RFC 9457 errors, cursor pagination, ETag/idempotency, SDMX-JSON, Celery queues, audit triggers, expand-contract migrations. Use for any api-svc or FastAPI microservice work.
---

# Backend Engineering

`apps/api/` is the **one business-logic layer** in AeroQuant MCP (SIH26056). The React
terminal and the MCP server are both its clients. Read `PROJECT_CONTEXT.md` first.

## Structure

```
apps/api/
├── config/settings/{base,dev,staging,prod}.py  urls.py  asgi.py  celery.py
├── core/         # abstract models, mixins, exceptions, pagination, RFC9457 handler
├── accounts/     # User, Organisation, APIKey, roles, permissions
├── masterdata/   # airport, airline, route, calendar, source_registry
├── observations/ # fare_observation read APIs, provenance
├── indices/      # index_definition, index_value, vintages, lineage, CPI mapping
├── analytics/    # forecast, attribution, tests, elasticity
├── portfolio/    ragapi/    agentsapi/    sdmx/    exports/    ops/
```

## Patterns to enforce

- **Thin views, fat services.** Logic lives in `services/` modules; views parse, authorise,
  call, serialise. This is precisely what lets `mcp_server` reuse the same functions — if
  logic is in a view, the MCP server has to duplicate it, and then two answers can diverge.
- **Repository layer for analytical queries.** DuckDB/ClickHouse SQL never appears in a view.
- **Audit by trigger, not discipline.** Every mutating endpoint writes an `audit_log` row,
  enforced with `django-pgtrigger`.
- Async Django Ninja views for I/O-bound fan-out (e.g. calling index-svc and analytics-svc
  concurrently). `select_related`/`prefetch_related` audited via nplusone (dev) and
  django-silk (staging). Read replicas via a DB router for analytical reads.
- Feature flags (`django-waffle`) on every scraped source.
- Settings via `django-environ`, split by environment. **Secrets never in code** —
  Secrets Manager / SOPS, injected at runtime.

## API standards (non-negotiable)

| Concern | Rule |
|---|---|
| Spec | OpenAPI 3.1, auto-generated. A breaking change needs `/v2` + 12-month `Sunset`. |
| Naming | snake_case JSON fields, plural collection nouns, kebab-case paths |
| Pagination | Cursor (`?cursor=&limit=`), limit max 1000 |
| Filtering | RQL-lite: `?route=DEL-BOM&period_gte=2026-01-01&horizon=15` |
| Sparse fields | `?fields=period,index_value` |
| Errors | **RFC 9457** `application/problem+json`, stable `type` URI, `request_id`, actionable extension members |
| Idempotency | `Idempotency-Key` header on all POST |
| Rate limits | IETF `RateLimit-Limit/Remaining/Reset` |
| Caching | ETag + `If-None-Match`, `Cache-Control` |
| Time | **RFC 3339 UTC** timestamps, ISO 8601 periods. IST only in presentation. |
| Statistical exchange | **SDMX-JSON 2.0** at `/api/v1/sdmx/…` |
| Negotiation | JSON · CSV · Parquet · `application/vnd.sdmx.data+json` |
| Correlation | `X-Request-ID` echoed, propagated as the OTel trace ID |

A good error is actionable:

```json
{
  "type": "https://aeroquant.in/errors/insufficient-observations",
  "title": "Insufficient observations for index computation",
  "status": 422,
  "detail": "Route DEL-IXL has 3 observations in period 2026-08 (minimum 12 required).",
  "minimum_observations": 12, "observed": 3,
  "suggestion": "Use APIX_REGION_NORTH or request quality_flag=suppressed series."
}
```

## Celery

Queues: `ingest` (autoscaled) · `compute` (CPU-bound, low concurrency) · `ml` ·
`notify` · `export`. Always `acks_late=True`, `task_reject_on_worker_lost=True`,
idempotent task bodies, per-task time limits. **Heavy schedules live in Airflow**, not
celery-beat.

## Migrations

**Expand-contract only.** Deploy tolerant code → migrate → deploy code using the new
schema → drop old columns in a later release. Migrations must be reversible and reviewed.
**Never a migration that locks `fare_observation`.**

## Don't

Compute an index in the API — call `aq_indexnum`. Return a bare index value without its
methodology version, CI, observation count and vintage. Buffer a large export in memory —
stream it. Hand-write an OpenAPI schema. Let the generated TypeScript client drift.
