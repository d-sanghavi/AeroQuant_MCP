---
name: hackathon-delivery
description: Delivery strategy for AeroQuant at SIH 2026 — the eight things that must be excellent, the cut-list, the 8-minute demo script, the offline demo mode, and what a MoSPI evaluator is actually checking. Use when prioritising work or preparing the finale.
---

# Hackathon Delivery — AeroQuant MCP (SIH 2026)

Deliver **AeroQuant MCP** for **SIH26056** (MoSPI). Read `PROJECT_CONTEXT.md` first.

## The failure mode to avoid

The brief lists ~forty deliverables. A six-person team in ten weeks cannot ship forty
things well. It can ship **eight things excellently and demo four more**. What kills good
teams is not technical difficulty — it is finishing twenty modules at 60% each, so nothing
survives a hard question.

## The eight that must be excellent

1. Compliant ingestion on a fixed booking-horizon panel
2. Canonical master data + entity resolution
3. `aq_indexnum` — multiple methods, property-tested, reference-validated
4. Hedonic quality adjustment
5. DGCA-weighted hierarchical aggregation + CPI mapping
6. Provenance and lineage (click any number → raw evidence)
7. The MCP server
8. The React terminal with the method-comparison chart

**Demo but do not perfect:** attribution, forecasting, RAG assistant, portfolio/CFO.

**The cut-list, agreed in advance, in order:** process mining → DCC-GARCH → survival
analysis → ClickHouse (use DuckDB) → Kubernetes (use ECS or one EC2 box) → multi-agent
critic loop (single agent + human review) → Hindi i18n → the 3D surface chart.

Agree the cut-list **before** falling behind. Agreeing it afterwards is always contentious.

## What actually wins this problem statement

A MoSPI evaluator's mental checklist:

1. **Do they understand that an average of scraped prices is not a price index?**
   (Most teams fail here.)
2. Can they defend the methodology in writing?
3. Is the data acquisition legal and sustainable?
4. Can the output be consumed by existing systems and processes?
5. Would this survive an audit?

The terminal answers 4 and 5 only. The index engine and `METHODOLOGY.md` answer 1, 2 and 5.
**Budget ≥40% of effort on the statistics and the methodology write-up.**

## The riskiest assumption — test it first

*"We can legally and technically obtain enough fare observations to fill a booking-horizon
panel."* Everything else is downstream. If it fails, you have an architecture diagram and
no data.

Measure real API quotas. Do the call-budget arithmetic
(`routes × dates × horizons × frequency`). If it does not fit, the answer is **stratified
sampling with design weights** — and that changes the estimator, so the quant must know
early. Read and record the ToS for your sources. Do this before writing more application
code.

**Start collecting on day one and never stop**, even while the rest is half-built. The
durable asset is the longitudinal fare panel — data not collected in October 2026 cannot be
recovered in 2028.

## The 8-minute demo

| Time | Beat |
|---|---|
| 0:00–0:45 | **The problem, made visceral.** Four lines on one chart: naive mean, median, fixed-panel Jevons, RYGEKS-FEWS. *"Same fares. 3.4 percentage points apart. That gap is what goes into CPI."* |
| 0:45–1:30 | Compliance spine — live source registry; toggle a source off; the pipeline adapts |
| 1:30–3:00 | Index Terminal — national APIx, CI ribbon, MoM/YoY, attribution waterfall, method toggle |
| 3:00–4:00 | **Provenance drill-through** — August index → route → flight → raw JSON + SHA-256. *"Every number is auditable."* |
| 4:00–5:00 | Term Structure Lab — animated fare curve, PCA level/slope/curvature, Nelson-Siegel |
| 5:00–6:00 | **MCP live** — a real MCP client asks *"What drove airfare inflation in August, and is Delhi–Mumbai's rise significant?"*; tools fire; cited answer |
| 6:00–6:45 | Research assistant — a superseded AERA order; temporal filtering picks the right version |
| 6:45–7:30 | Ops reality — Grafana, Airflow DAG history, coverage, the published PyPI package |
| 7:30–8:00 | Close — airfare today; hotels, rail, e-commerce tomorrow; same engine |

**Rules:** no slides after minute one · nothing typed live except the MCP question ·
everything else is clicks on a pre-warmed, offline-capable environment · rehearse until the
timing is muscle memory · have a strict cut-list if time runs short.

## Demo reliability

- `make demo` (seeded DB, pre-warmed caches) and **`make demo-offline`** (MinIO + fixture
  dataset, **zero internet dependency**). Venue Wi-Fi fails; teams that plan for it win.
- Backups: recorded video, local-only fallback, printed architecture poster.
- Three full dry runs. Every member able to present any module and answer on it.
- Deterministic seeded data — the demo shows the same numbers every time.

## How to pitch it

**Lead with the statistics; let the finance be the technique, not the pitch.** The booking
curve behaves like a term structure and PCA gives three interpretable factors — that is a
genuinely new way to summarise airline pricing behaviour in a few numbers, which is exactly
what a statistical agency wants. Nobody at MoSPI wants a trading terminal.

## Don't

Add technologies for the count. Demo a module that is 60% done when an excellent one is
available. Claim a number is official when it is provisional. Fake a live call. Leave the
methodology document to the last week — writing it exposes the questions not yet answered.
