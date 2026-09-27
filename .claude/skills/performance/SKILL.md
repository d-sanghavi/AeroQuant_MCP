---
name: performance
description: Meeting AeroQuant's latency and throughput targets — API p95 <200ms, MCP p95 <400ms, index compute <8min, 500 quotes/sec, terminal LCP <2.0s / JS <250KB. Measure first, optimise the measured bottleneck, respect the cut-list.
---

# Performance

Optimise **AeroQuant MCP** (SIH26056) against the non-functional targets in
`PROJECT_CONTEXT.md`. **Measure before optimising.** State the baseline, the change, and
the measured delta — an optimisation without a number is a guess.

## Targets

| Path | Target |
|---|---|
| API, cached index read | p95 <200 ms |
| API, ad-hoc OLAP aggregation | p95 <2 s |
| **MCP tool call** | **p95 <400 ms** (tightest budget, and demo-visible) |
| Index compute, 350 routes × 90 days | <8 min |
| Ingestion | 500 quotes/sec sustained, linear to 50 workers |
| Fact table | 500M+ rows without query degradation |
| Terminal | LCP <2.0 s · INP <200 ms · CLS <0.1 · initial JS <250 KB gz |

## Levers, roughly in the order they bite

1. **Cache-aside on every read path**, TTL by volatility (60 s–24 h). Most API latency is
   avoidable work. ETag + `If-None-Match` saves the payload too.
2. **Query shape before hardware.** Correct indexes, Timescale hypertable partitioning,
   **continuous aggregates** for the common rollups, compression on old chunks, `EXPLAIN`
   on every analytical query. Catch N+1s with nplusone (dev) and django-silk (staging).
3. **Vectorise, then parallelise.** numpy/polars over row loops in `aq_indexnum`;
   parallelise by route/window. Profile on the golden dataset. Rust is a last resort.
4. **Ingestion is I/O-bound** — async httpx, connection pooling, queue-depth autoscaling.
   Not more CPU.
5. **Frontend** — route-level code splitting, per-chart-type ECharts imports, virtualised
   tables, canvas above ~5k points, Web Worker for aggregation and CSV export, `staleTime`
   tuned per endpoint, self-hosted subset fonts.
6. **Streaming exports.** Never buffer a large CSV/Parquet in memory; presign to S3.

## Measuring

k6 for load (500 rps read, 50 rps compute; **2 h soak** before believing a result) ·
read **p99, not the mean** · OTel traces to find the slow span rather than guessing at the
boundary · Lighthouse/web-vitals for the terminal, on a throttled profile.

## Bottlenecks in the order they will arrive

Collector quota and rate limits → normalisation throughput → analytical query latency on
the fact table → index compute wall time → RAG retrieval latency → frontend bundle.

## Don't

Reach for ClickHouse, Kubernetes or a Rust rewrite before the cheap levers are exhausted —
all three are on the cut-list. Trade reproducibility or auditability for latency; a fast
wrong number is worse than a slow right one. Cache a `provisional` value past its revision.
Add a dependency to "optimise" — prefer removing weight.
