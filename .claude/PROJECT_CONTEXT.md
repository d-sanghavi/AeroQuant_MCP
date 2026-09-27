# PROJECT_CONTEXT — AeroQuant MCP (SIH 2026)

> Single source of truth for every agent, skill and hook in this repo. Read this before
> changing anything. It is derived from `AeroQuant_MCP_SIH26056_Technical_Blueprint.docx`
> (Master Engineering & Product Specification v1.0, 26 Sep 2026).

## Event & problem statement

- **Event:** Smart India Hackathon 2026 — Grand Finale (36 hours) December 2026
- **Problem statement:** **SIH26056** — *Development of a system for collection and
  compilation of airfare price data from airline and travel websites for Consumer Price
  Index*
- **Organisation:** Ministry of Statistics & Programme Implementation (MoSPI) —
  Data Informatics & Innovation Division
- **Theme:** Software · Smart Automation, Data Analytics & Official Statistics
- **Team / product:** **AeroQuant** — *AeroQuant MCP*, sovereign airfare price
  intelligence and statistical infrastructure for the Indian Statistical System.

## The governing sentence

> **We are not building a scraper. We are building statistical infrastructure that
> happens to ingest fares.**

Every architectural decision flows from that. If a feature cannot be defended as *"this
improves the accuracy, reproducibility, timeliness, or auditability of an official price
statistic,"* it goes to the parking lot.

The second governing fact: **an average of scraped prices is not a price index.** It
conflates price change with composition change — when the observation mix shifts toward
last-minute bookings the average rises even if no fare changed. Constructing a valid
constant-quality index (blueprint sub-problem P3) is where the marks are, and it is
the moat.

## Build scope - READ THIS

**Current scope: PROTOTYPE ONLY.** The user supplied prototype-building guidelines on
2026-09-27; they are recorded verbatim-in-substance in
[`PROTOTYPE_SPEC.md`](./PROTOTYPE_SPEC.md) and they **supersede the blueprint wherever the
two disagree**. The blueprint below remains the reference for *what the product means* -
terminology, methodology, priorities, the demo narrative - but it is no longer the build
target.

What that means in practice:

- **Build target:** `client/` - a single-page, **fully client-side** React application.
  No Django, no Celery, no Postgres, no Airflow, no FastMCP process, no network calls,
  no API keys. `apps/`, `packages/`, `infra/` and `dbt/` are **not** being built.
- **Data:** a seeded synthetic data-generating process running in a Web Worker at load
  time. Dummy data, real structure.
- **Statistics are NOT dummy.** Every displayed number is computed at runtime in
  TypeScript from the generated dataset. Hardcoded chart arrays are a defect, not a
  shortcut - the whole claim of the project is that the methods diverge on the same data,
  and a judge will change the date range to check.
- **Responsive on every device** is a hard acceptance criterion, not a polish item.
  Phone, tablet, laptop, large display. See PROTOTYPE_SPEC.md sec. 6.
- The MCP layer is **simulated in-browser** (a playground screen that maps the 16 tool
  names onto the same TypeScript quant functions the charts use). The backend index
  engine `aq_indexnum` is realised as `client/src/lib/quant/` instead.
- **Audience:** primarily NSO and RBI users; secondarily airlines, researchers, public.
  Design for an analyst who will be asked to defend the number, not for a consumer.

### Status as of 2026-09-27 (end of build)

All fourteen screens are implemented and browser-verified; 43 tests pass; `vite build`
is clean and `src/` contains no network call. Two additions beyond the original twelve
screens, both at the user's request:

- **Carrier Breakdown** (`/carriers`) - the operator cut SIH26056 asks for. Its
  load-bearing statistic is the **matched-cell premium**: carriers are compared only
  inside cells where they sold the same route, cabin, fare family and booking horizon in
  the same month, because a raw comparison of mean fares mostly measures route networks.
- **Landing dwell + takeoff animation** - the boot screen is held 5s so its provenance
  statement is read rather than flashed.

Three corrections made to the *data* and one to the *analytics* during this build, all
because a screen would otherwise have shown something indefensible:

1. `servingAirlines()` in `routes.ts` was recalibrated. Renormalising each carrier's
   national share over the carriers serving a route had pushed IndiGo to **73% of
   observed quotes** against a real ~63% domestic share - a figure any aviation reader would
   have known was wrong. The thresholds now land the five major carriers within ~1pp of
   their published shares.
2. `events.ts` gained rare **major disruptions** (~1 in 6 events) with a convex scarcity
   term in the fare pass-through. Without them no route-month survived Benjamini-Hochberg
   across 1,380 tests and the Anomaly Console was permanently empty - which misrepresents
   the problem it exists to solve. Ordinary events are unchanged, so the national
   calibration is untouched.
3. `monteCarloBudget()` was rewritten. It had drawn an independent return for **every
   trip**, crushing the variance by root-72, and had not correlated the legs at all -
   while the screen claimed it did. It now resamples whole months in blocks, shared
   across legs, compounded along a twelve-month path, and reports VaR/CVaR as overruns
   against the median rather than as cost levels.
4. `readTokens()` in `charts/theme.ts` now emits comma-separated `rgb()`. Canvas accepts
   the space-separated CSS Color Level 4 form, but zrender's own parser - used wherever
   ECharts has to *interpolate* between colours - does not, which silently rendered the
   correlation heatmap entirely black with no console error.

Agents whose remit is backend-only (`backend-engineer`, `data-engineer`, `devops-engineer`,
`mcp-engineer`, `ml-engineer`) advise on *meaning and correctness* during the prototype
phase; they do not scaffold services. `quant-statistician` owns `client/src/lib/quant/`
and remains the highest-authority reviewer on methodology.

Stack deviations from the blueprint that the prototype guidelines deliberately introduce
(do not "correct" these back): **Framer Motion** for motion, **visx** alongside ECharts,
**TanStack Table** without TanStack Query (there is no server), **Zustand** as the only
store, hand-rolled numerics in `lib/quant/` and `lib/linalg/` rather than any stats
dependency.

## Monorepo layout (blueprint §10.2)

```
aeroquant/
├── apps/
│   ├── api/              # Django 5 project (config/, core/, accounts/, masterdata/,
│   │                     #   observations/, indices/, analytics/, portfolio/, ragapi/,
│   │                     #   agentsapi/, sdmx/, exports/, ops/)
│   ├── ingestion/        # FastAPI + Celery + Playwright collectors, compliance gate
│   ├── normalisation/    # streaming consumer: parse → resolve → classify → dedupe
│   ├── index_engine/     # index-svc
│   ├── analytics/        # forecast, attribution, PCA/Nelson-Siegel, portfolio, CFO
│   ├── rag/              # corpus ingest, hybrid retrieval, rerank, generate
│   ├── agents/           # LangGraph pipelines + Langfuse
│   └── mcp_server/       # FastMCP tools / resources / prompts
├── packages/
│   ├── aq_core/          # domain models, shared types
│   ├── aq_indexnum/      # PURE index-number library — the crown jewel, open-sourced
│   ├── aq_schemas/       # Pydantic + Avro contracts
│   └── aq_clients/       # generated API clients
├── infra/
│   ├── terraform/  docker/  k8s|ecs/  airflow/dags/
├── client/               # React 18 + Vite research terminal  <-- THE PROTOTYPE
├── notebooks/            # EDA
└── docs/
```

Structure as a **modular monorepo**. The twelve-service decomposition (§10) is the
*deployment topology*, not a mandate to run twelve processes on a laptop — but module
boundaries must stay clean enough to extract a service without a rewrite.

**`aq_indexnum` ships standalone on PyPI (Apache-2.0).** India has no open multilateral
index-number library; it is the single most credible artefact we can hand a MoSPI
evaluator, and it carries the highest quality bar in the repo.

## Architectural principles (write these on the wall — §9.2)

- **Medallion, always.** Bronze (immutable raw) → Silver (normalised, typed) → Gold
  (aggregated, served). Never mutate bronze. Never serve silver.
- **Event-driven between stages, batch within stages.** Kafka/Redpanda topics between
  services; Airflow for heavy periodic computation.
- **Idempotency everywhere.** Natural key + upsert on every step. Re-running yesterday's
  DAG must produce identical output.
- **The index is a pure function.** `index(observations, method, weights, version) → series`.
  No hidden state. This is what makes reproducibility achievable.
- **Separate observation from inference.** Facts (a fare was ₹6,420 at 14:03 IST) live in
  one table forever. Derived values (index, forecast, attribution) are versioned and
  recomputable.
- **The MCP server is a client of the API, not a second backend.** One business-logic
  layer, two protocols — so the chat answer and the dashboard number can never disagree.

## Canonical stack (§38 — abridged to what we actually build on)

| Layer | Choice |
|---|---|
| Languages | Python 3.12, TypeScript 5 (strict), SQL |
| Backend | Django 5, Django Ninja (async, Pydantic, auto-OpenAPI), DRF where the ecosystem helps, Pydantic v2, Celery + Redis, Gunicorn + Uvicorn |
| Microservices | FastAPI, FastStream/Faust, **FastMCP** |
| Frontend | React 18, Vite, TanStack Query v5 + Router, Zustand, Tailwind + shadcn/ui, **Apache ECharts** (primary), visx (bespoke), AG Grid / TanStack Table, deck.gl + MapLibre, React Hook Form + Zod, openapi-typescript, i18next, Storybook |
| Data stores | PostgreSQL 16 + **TimescaleDB** + pgvector, DuckDB (MVP OLAP) → ClickHouse (scale), Redis, Qdrant, S3/MinIO + Iceberg |
| Streaming | Redpanda (dev) / Kafka (prod) |
| Orchestration | Airflow 2.10, dbt-core |
| Data quality | Great Expectations, Soda Core, dbt tests, Evidently |
| Acquisition | Amadeus / Duffel / Kiwi SDKs, httpx, Playwright, Scrapy, docling |
| Stats | numpy, pandas, polars, scipy, statsmodels, linearmodels, arch, pmdarima, pingouin |
| ML | scikit-learn, LightGBM, PyTorch, pytorch-forecasting, MAPIE (conformal), EconML, SHAP, sentence-transformers |
| LLM / agents | LangGraph, Langfuse, RAGAS, promptfoo, BGE-M3 + bge-reranker-v2-m3 |
| Infra | Docker + Compose, ECS Fargate, Terraform, GitHub Actions, cosign/syft/Trivy |
| Observability | OpenTelemetry, Prometheus, Grafana, Loki, Tempo, Sentry, Langfuse |
| Testing | pytest, **hypothesis**, testcontainers, schemathesis, Vitest, RTL, Playwright, k6, axe-core, mutmut |
| Docs | MkDocs Material, OpenAPI 3.1 + Redoc, dbt docs, Storybook, ADRs (MADR) |

**MVP simplification (§11.1):** run Postgres + Timescale + pgvector + DuckDB only. Add
ClickHouse and Qdrant when volume justifies. Do not spend finale hours tuning ClickHouse.

## API standards we commit to (§12.1)

OpenAPI 3.1 auto-generated · URL-path versioning `/api/v1/…` with a `Sunset` header ·
snake_case JSON fields, plural collection nouns, kebab-case paths · cursor pagination
(`?cursor=&limit=`, max 1000) · sparse fields `?fields=` · **RFC 9457 Problem Details**
(`application/problem+json`) on every error · `Idempotency-Key` on all POST · IETF
`RateLimit-*` headers · ETag + `If-None-Match` · **RFC 3339 UTC** timestamps and ISO 8601
periods (IST only in presentation) · **SDMX-JSON 2.0** at `/api/v1/sdmx/…` · content
negotiation for JSON/CSV/Parquet/SDMX · `X-Request-ID` echoed and propagated as the OTel
trace ID.

## MCP design rules (§13)

- FastMCP (Python), packaged as `aeroquant-mcp`; **stdio** and **Streamable HTTP**
  transports.
- OAuth 2.1 + PKCE for interactive clients; mTLS + scoped API key server-to-server.
- **Every tool is a thin wrapper over `api-svc`. No business logic in the MCP server.**
- 16 tools (`get_airfare_index`, `list_indices`, `get_fare_term_structure`,
  `compare_index_methods`, `explain_index_movement`, `get_cpi_airfare_contribution`,
  `run_hypothesis_test`, `get_lineage`, `export_sdmx`, …), 6 `aeroquant://` resources,
  5 prompts.
- Tool responses carry **interpretation guidance** and a **citation** — an economist must
  be able to act on the answer without reading OpenAPI docs.
- AeroQuant is also an **MCP client**: the agent layer consumes external MCP servers.

## Non-functional targets (§8)

API p95 <200 ms cached / <2 s ad-hoc OLAP · **MCP tool p95 <400 ms** · index compute for
350 routes × 90 days <8 min · 500 quotes/sec ingest · 99.5% MVP uptime · RPO 15 min /
RTO 1 h · AES-256 at rest, TLS 1.3 in transit · **secrets never in code** · DPDP Act 2023:
**zero PII collected** · data residency ap-south-1 only · robots.txt/ToS enforced
programmatically · coverage ≥80% backend / ≥70% frontend · 100% containerised, 100% IaC ·
WCAG 2.1 AA on the terminal · MVP cloud spend <₹25,000/month · **any published index
re-derivable from archive, 100%**.

## Testing gates (§32)

pytest + **hypothesis property tests on the index axioms** (proportionality, identity,
time reversal, transitivity, units invariance, bounded chain drift) · validate against the
ILO CPI Manual worked examples and R's **IndexNumR** to ~1e-10 · testcontainers for real
infra (no mocks for Postgres/Redis/Redpanda/Qdrant) · schemathesis against the OpenAPI
spec · Great Expectations on every pipeline run · RAGAS faithfulness ≥ 0.90 · Playwright
for 15 named journeys + axe-core · k6 load · `mcp-inspector` for every MCP tool.

Coverage: backend 80% line / 70% branch, **`aq_indexnum` 95% + mutmut ≥70% mutation
score**, frontend 70%. A frozen **golden dataset** (90 days × 20 routes × 9 horizons with
known ground-truth index values, generated from a known DGP) is committed as Parquet and
gates every index change.

## Priorities — the eight that must be excellent (§36.1)

1. Compliant ingestion on a fixed booking-horizon panel (T-1, T-2, T-3, T-7, T-15, T-30,
   T-45, T-60, T-90)
2. Canonical master data + entity resolution
3. `aq_indexnum` — multiple methods, property-tested, reference-validated
4. Hedonic quality adjustment
5. DGCA-weighted hierarchical aggregation + CPI mapping
6. Provenance and lineage (click any number → raw evidence)
7. The MCP server
8. The React terminal with the method-comparison chart

**Demo but do not perfect:** attribution, forecasting, RAG assistant, portfolio/CFO.

**Cut-list, in order, if behind:** process mining → DCC-GARCH → survival analysis →
ClickHouse (use DuckDB) → Kubernetes (use ECS or even one EC2 box) → multi-agent critic
loop (single agent + human review) → Hindi i18n → the 3D surface chart.

**Effort budget:** ≥40% of remaining effort on statistical methodology and the methodology
write-up. The terminal matters for consumability and audit, not for marks on rigour.

## Phase plan (§34.1)

| Phase | Dates | Exit criteria |
|---|---|---|
| P0 Foundations | 26 Sep – 6 Oct | Compose stack up; master data seeded; real fares landing in Postgres |
| P1 Core pipeline | 7 – 20 Oct | 10 routes × 9 horizons collected daily for 14 straight days, unattended |
| P2 Index engine | 21 Oct – 3 Nov | 6 methods implemented, property tests green, matches IndexNumR |
| P3 Intelligence | 4 – 17 Nov | Forecast MAPE <12%; attribution R² >0.5; RAG faithfulness >0.88 |
| P4 Surfaces | 18 Nov – 1 Dec | Terminal demoable end-to-end; MCP works in a real client |
| P5 Hardening | 2 – 10 Dec | Deployed; 80% coverage; runbooks; methodology published |
| P6 Finale prep | 11 Dec – Finale | Three dry runs; offline demo verified |

## Compliance & privacy (non-negotiable)

- `source_registry` is a **first-class database entity** and a **public page**. Every
  source records its legal basis, robots.txt/ToS verdict (with the date it was read), rate
  limit and live status. The compliance gate reads it at runtime; a disabled source is not
  fetched.
- Every scraped source sits behind a **feature flag** (django-waffle). Licensed aggregator
  APIs are primary; permitted scraping is secondary.
- **Zero PII.** Fares are not personal data — keep it that way. No passenger names, no
  emails, no identity-carrying cookies, no search-session linkage.
- **Never guess a ToS position.** Read it, record the verdict and the date.

## Documentation deliverables (§39)

`METHODOLOGY.md` (**the single most important non-code deliverable** — formulae, choices,
justifications, limitations, revision policy) · `README.md` · `ARCHITECTURE.md` + ADRs
(MADR) · `DATA_DICTIONARY.md` · API reference (from OpenAPI) · `MCP_GUIDE.md` ·
`COMPLIANCE.md` · `RUNBOOKS/` · `MODEL_CARDS/` · `CONTRIBUTING.md` · the 8-minute demo
script.

## Vocabulary (§41 — use these terms precisely)

**APIx** AeroQuant Airfare Price Index · **booking horizon (T-x)** days between
observation and departure · **chain drift** bias accumulated when chaining bilateral
indices over high-frequency data · **constant-quality index** measures pure price change
with characteristics held fixed · **elementary aggregate** lowest CPI level with no
expenditure weights · **FEWS** Fixed Effects Window Splice · **GEKS**
Gini-Éltető-Köves-Szulc, a transitive multilateral method · **hedonic regression**
regressing price on characteristics · **Jevons** geometric mean of price relatives ·
**TPD / TDH** Time Product Dummy / Time Dummy Hedonic · **term structure** price as a
function of time-to-departure (mathematically a yield curve) · **vintage** a specific
published version of an index value before later revision · **SDMX** ISO standard for
statistical data exchange.

## How to talk about this project

Lead with the statistics; let the finance be the technique, not the pitch. The fare term
structure genuinely *is* a yield curve — PCA yields interpretable level/slope/curvature
factors exactly as it does for interest rates — and that is interesting to a statistical
agency as a new way to summarise airline pricing behaviour in three numbers. It is not a
trading terminal, and MoSPI does not want one.

A MoSPI evaluator's mental checklist: (1) do they understand that an average of scraped
prices is not a price index? (2) can they defend the methodology in writing? (3) is the
acquisition legal and sustainable? (4) can the output be consumed by existing systems?
(5) would this survive an audit? Answer all five, in that order of weight.
