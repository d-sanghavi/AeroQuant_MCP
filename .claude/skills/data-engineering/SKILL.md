---
name: data-engineering
description: AeroQuant's acquisition and pipeline layer — compliance-gated collectors on the fixed booking-horizon panel, bronze/silver/gold medallion flow, entity resolution, idempotency, Airflow DAGs, dbt, and Great Expectations. Use for ingestion, normalisation, orchestration or data-quality work.
---

# Data Engineering

The pipeline layer of **AeroQuant MCP** (SIH26056): source website → bronze blob → silver
row → gold aggregate. Read `PROJECT_CONTEXT.md` first.

## Medallion, always

| Layer | Rule |
|---|---|
| **Bronze** | Immutable raw snapshot in S3/MinIO, SHA-256 keyed, Parquet/JSON, parser version recorded. **Never mutate. Never serve.** |
| **Silver** | Normalised, typed, entity-resolved, deduped. Queryable, not published. |
| **Gold** | Aggregated and served. Derived, versioned, recomputable. |

The provenance endpoint must return the exact bronze blob behind any index contribution.
If that chain cannot be walked, fix it before anything else.

## Acquisition

- **Compliance gate before every fetch.** The collector reads `source_registry` at runtime:
  legal basis, robots.txt/ToS verdict, rate limit, enabled flag. A disabled source is not
  fetched — there is no override.
- **Licensed aggregator APIs are primary** (Amadeus Self-Service, Duffel, Kiwi). Permitted
  scraping is secondary, behind a django-waffle flag, with polite rate limits, jittered
  backoff and circuit breakers.
- **The fixed booking-horizon panel is the product**: T-1, T-2, T-3, T-7, T-15, T-30,
  T-45, T-60, T-90. Panel completeness (≥90% MVP, ≥98% prod) is a tracked metric — gaps
  bias the index silently.
- **Call-budget arithmetic before writing a collector**:
  `routes × departure_dates × horizons × frequency` against the real measured quota. If it
  does not fit, the answer is **stratified sampling with design weights** — and the quant
  must be told, because it changes the estimator. Do not discover this in November.
- Sweep cadence by horizon: hourly for T≤7, 4-hourly for T≤30, daily beyond.

## Normalisation

`parse → resolve entities → classify fare family → decompose → dedupe`

- **Identity resolution is the sub-problem nobody does.** `DEL→BOM`, `Delhi-Mumbai` and
  `New Delhi → BOM` are **one entity**. Canonical master data (airports, airlines, routes,
  fare families, calendar with Indian festivals) plus embedding-based resolution — not
  string matching.
- Master data is **SCD2**: an airport renaming must not rewrite history.
- Fare-family taxonomy is explicit and versioned; an unclassifiable fare goes to
  quarantine, not to a default bucket.
- Dedupe on a **strong natural key**. A weak key silently merges distinct products.

## Idempotency

Every step has a natural key and an upsert. **Re-running yesterday's DAG must produce
identical output.** Backfills use the same code path as forward runs — a separate backfill
script is a bug waiting to happen. No step may depend on wall-clock luck or on "now".

## Orchestration (Airflow 2.10)

DAG inventory: horizon sweeps · data quality · index compute (02:00) · forecast + drift
(03:00) · vintage snapshot and audit hash-chain seal (04:00) · bulletin generation (05:00)
· economic indicator pulls (PPAC, Brent, USDINR, Trends, OpenSky, weather).

Tasks are small, retryable, observable, and individually re-runnable. DAG import tests run
in CI before any sync.

## Data quality is a test, not a dashboard

- **Great Expectations suites run on every pipeline run.** Failing rows go to a
  **quarantine table** with a reason — never silently into silver, never silently dropped.
- dbt models carry tests; dbt docs are a documentation deliverable.
- Track and alert on: panel completeness, imputation rate, source health, duplicate rate,
  schema drift, quarantine growth.
- **Never disable a failing expectation to make a pipeline green.** Quarantine and
  investigate.

## Don't

Fetch a source whose ToS has not been read and recorded. Mutate bronze. Serve silver.
Write a derived value into an observation table. Let a schema change reach silver without a
migration and a dbt test. Use `SELECT *` into a downstream contract.
