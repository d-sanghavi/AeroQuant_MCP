---
name: system-design
description: Designing AeroQuant MCP at a principal level — medallion flow, service boundaries vs the modular monorepo, storage per workload, contracts, idempotency and reproducibility, ADRs in MADR format. Use when shaping architecture rather than writing feature code.
---

# System Design

Act as a principal engineer for **AeroQuant MCP** (SIH26056) — statistical infrastructure
for MoSPI, not a data app. Read `PROJECT_CONTEXT.md` for the canonical stack.

## The principles, in priority order

1. **Medallion, always.** Bronze immutable → Silver normalised → Gold served. Never mutate
   bronze. Never serve silver.
2. **Idempotency everywhere.** Natural key + upsert. A rerun produces identical output.
3. **The index is a pure function** of `(observations, method, weights, version)`. No
   hidden state — this is what makes reproducibility achievable at all.
4. **Separate observation from inference.** Facts live in one table forever; derived values
   are versioned and recomputable.
5. **Event-driven between stages, batch within stages.** Topics between services, Airflow
   for heavy periodic compute.
6. **The MCP server is a client of the API**, never a second backend.

## Monorepo vs microservices

The twelve-service decomposition is the **pilot deployment topology**, not a mandate. For a
36-hour finale you run a **modular monolith** locally, and that is correct. The obligation
is that module boundaries stay clean enough to extract a service without a rewrite:
`apps/*` own their data and expose contracts; `packages/aq_*` stay dependency-light;
`aq_indexnum` imports nothing from the application.

A six-person team cannot operate twenty services. Adding one is a cost to justify, not a
sophistication to display.

## Storage per workload

| Need | Store |
|---|---|
| OLTP, master data, registry, vintages | PostgreSQL 16 |
| Time-partitioned observations and index values | TimescaleDB hypertables + continuous aggregates |
| Sub-second aggregation for the terminal | DuckDB (MVP) → ClickHouse (only when volume justifies) |
| Vectors co-located with metadata | pgvector |
| RAG corpus at scale | Qdrant |
| Cache, rate limits, broker | Redis |
| Immutable archive, lake | S3/MinIO + Iceberg (Parquet) |

**MVP: Postgres + Timescale + pgvector + DuckDB only.** ClickHouse and Kubernetes are both
on the cut-list; reach for them with evidence, not anticipation.

## Every design must state

1. Module boundaries and ownership
2. Data flow, and where each piece of state lives
3. The **natural key** and the idempotency story
4. Failure, retry, backfill and replay behaviour
5. The **provenance path**: served number → contributing observations → raw blob hash
6. Migration plan (**expand-contract only**; never lock `fare_observation`)
7. Observability: what is traced, what is measured, what alerts, and its runbook
8. The trade-offs considered and rejected

## Record decisions

ADRs in **MADR** format under `docs/adr/`. An architectural decision without a written
trade-off is not finished — and `ARCHITECTURE.md` + ADRs are a graded deliverable.

## Design reviews ask

- Does this preserve re-derivability of every published index value? (BR-1)
- Does it keep observation and inference separate?
- Does it survive a rerun, a backfill and a source going dark?
- Does it add a second path to the same number? (The most dangerous defect in this system.)
- Is it defensible as *"this improves accuracy, reproducibility, timeliness or auditability
  of an official price statistic"*? If not, parking lot.
- Does it fit the ≤₹25,000/month MVP budget and deploy outside AWS if MeghRaj is required?

## Don't

Add infrastructure to sound sophisticated. Let derived values into observation tables.
Design a second business-logic layer. Optimise ahead of measurement. Build past the eight
priorities while any of them is incomplete.
