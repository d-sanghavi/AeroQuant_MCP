# PROTOTYPE_SPEC — AeroQuant Terminal (client-side prototype)

> Supplied by the user on **2026-09-27**. This document **supersedes the blueprint**
> wherever they disagree. Read [`PROJECT_CONTEXT.md`](./PROJECT_CONTEXT.md) for what the
> product *means*; read this for what we are actually building.

## 0. What we are building

**AeroQuant Terminal** — a fully client-side prototype of a statistical research terminal
for India's airfare price index (APIx), for SIH 2026 / SIH26056 (MoSPI).

**No backend. No network calls. No API keys.** Everything runs in the browser from
synthetic data generated at load time.

**Audience:** primarily **NSO and RBI**; secondarily airlines, researchers, the public.
Every screen should read as an instrument an analyst would defend in front of a committee,
not a consumer dashboard.

### The single most important constraint

The prototype must **genuinely compute** every statistic it displays — index numbers,
hedonic adjustments, PCA factors, Nelson–Siegel fits, VaR, the efficient frontier.
**Do not hardcode outputs. Do not fake charts with static arrays.**

The core claim is that *an average of scraped fares is not a price index*, and the proof is
that different index methods applied to the same data diverge by several percentage points.
If those numbers are hardcoded, a judge who asks *"change the date range and show me again"*
ends the demo.

### Second hard constraint (user-stated)

**The prototype must be responsive across all devices.** Phone, tablet, laptop, large
display. This is an acceptance criterion, not a polish pass. See section 6.

## 1. Stack — exactly this

| Concern | Choice |
|---|---|
| Build | Vite + React 18 + TypeScript (`strict: true`) |
| Styling | Tailwind CSS + shadcn/ui-style primitives |
| Animation | Framer Motion (layout animations, page transitions, number tweening) |
| Charts | Apache ECharts via `echarts-for-react` (primary); `visx` for bespoke term-structure visuals |
| Tables | TanStack Table (virtualised where >200 rows) |
| Routing | React Router v6 |
| Client state | Zustand |
| Derived data | `useMemo` + Web Workers for anything above ~50ms |
| Icons | `lucide-react` |
| Dates | `date-fns` |
| Numerics | Hand-rolled in `lib/quant/` — **no stats library; the math is the deliverable** |

No backend framework. No database. No `localStorage` persistence except theme preference.

## 2. Structure — `client/src/`

```
app/       router.tsx, providers.tsx, layout/ (AppShell, Sidebar, TopBar, CommandPalette)
data/      master/ (airports, airlines, routes, calendar, sources)
           generate/ (dgp, fares, economics, events, documents)
           store.ts  — Zustand: generated dataset, filters, selection
lib/quant/ elementary . multilateral . hedonic . aggregate . diagnostics
           timeseries . tests . pca . nelsonSiegel . risk
lib/linalg/ matrix ops, OLS, QR solve, Jacobi eigen
lib/format/ INR, percent, index values, dates
features/  index-terminal . method-lab . term-structure . route-explorer
           olap-workbench . attribution . anomalies . forecasts . portfolio . cfo
           research-assistant . compliance . lineage . mcp-playground
components/ shared chart wrappers, StatTile, Sparkline, Provenance popover
styles/
```

## 3. Synthetic data generator — build first, get it right

Seeded (`mulberry32`) so runs are reproducible.

**Master data:** 40 Indian airports (real IATA, city, state, lat/lon); 60 routes with
great-circle distance, `is_trunk`, monthly DGCA-style pax count, `has_rail_substitute` +
rail hours; 6 airlines (6E, AI, IX, QP, SG + one regional) with LCC/FSC model and share
weight; 24 months of calendar with DOW, Indian festivals, long weekends, school holidays,
season label; 12 compliance sources (Amadeus/Duffel/Kiwi permitted and licensed; two OTAs
explicitly not permitted and therefore disabled).

**Fare DGP:** 24 months daily x 60 routes x 9 horizons (T-1,2,3,7,15,30,45,60,90) x
serving airlines. Target ~400k–600k observations, generated in a Web Worker with a
progress indicator. Log fare built additively so every component is recoverable:

```
ln(fare) = ln(base_route)            // ~ distance^0.72, realistic INR
         + horizon_effect(h)          // Nelson-Siegel shape: flat far out, convex near departure
         + airline_effect             // LCC ~ -0.12, FSC ~ +0.10
         + cabin_effect               // economy 0, premium +0.45, business +1.1
         + dow_effect                 // Fri/Sun premium
         + seasonal(month)            // annual sinusoid + festival bumps
         + trend(t)                   // ~ +0.4%/month so YoY is visible
         + fuel_passthrough(ATF, lag 1-2m)   // beta ~ 0.28, asymmetric: faster up than down
         + capacity_effect            // -0.6 x log(seats available)
         + demand_shock(t)            // AR(1)
         + event_effect               // disruptions, festival spikes
         + eps                        // heteroskedastic, larger at short horizons
```

**CRITICAL — build in deliberately:** the *composition* of observations must shift over
time (share of short-horizon and FSC quotes rises gradually across 24 months, as it would
if collection were opportunistic). This is what makes the naive mean drift upward relative
to the constant-quality index. **Without it the Method Lab shows nothing and the demo has
no point.**

Also generate: ATF monthly city-wise (2025–26 shaped path), Brent, USD/INR, CPI combined;
Google-Trends-style weekly search interest per destination; OpenSky-style daily flight
counts per route; ~40 disruption events with severity and affected airports; **~5% missing
panel cells, non-random** (thin routes, short horizons) so the imputation story is real.

**Provenance:** every observation gets a synthetic `raw_blob_uri`
(`s3://aq-bronze/fares/source=amadeus/dt=.../....json.gz`), a fake-but-consistent SHA-256
(hash of its own fields), a `parser_version` and an `ingestion_run_id`. The raw JSON
payload must be reconstructible on demand for the Lineage drawer.

## 4. Quant layer — implement properly

- **Elementary:** `jevons` (geomean of relatives), `dutot` (ratio of means), `carli`
  (mean of relatives), plus `naiveMean` and `median` as the deliberately-wrong comparators.
- **Multilateral:** GEKS–Törnqvist over a rolling 13-month window (all pairwise Törnqvist,
  geometric mean of indirect comparisons); Time Product Dummy (WLS of `ln(price)` on time
  + product dummies, exponentiated time coefficients); RYGEKS with FEWS splice.
  **Chain-drift diagnostic:** forward and reverse chained products over 12 months, report
  deviation from 1.0 — the naive chained index must fail this visibly.
- **Hedonic (TDH):** WLS of `ln(fare)` on natural cubic spline basis in booking horizon
  (4 knots), cabin, stops, refundable, baggage, airline dummies, route dummies, time
  dummies. Weight by route passenger share. Return coefficients, adjusted R-squared, and
  exponentiated time dummies as the quality-adjusted index. OLS via QR in `lib/linalg/`.
- **Aggregation:** route -> state -> region -> national with DGCA passenger weights.
  Weights must sum to 1.0; assert it.
- **Uncertainty:** block bootstrap clustered on route, 200 replicates, 95% CIs on every
  index point.
- **Term structure:** PCA on fare-curve matrix (rows = dates, cols = horizon buckets) —
  centre, covariance, Jacobi eigendecomposition, loadings and scores, variance explained,
  labelled level/slope/curvature. Nelson–Siegel: fit b0, b1, b2 by least squares with tau
  profiled over a grid.
- **Risk:** `ledoitWolf` shrinkage covariance, `cornishFisherVaR` (sample skewness and
  excess kurtosis), `cvar`, constrained mean-variance `efficientFrontier` by projected
  gradient over the simplex (20 points).
- **Tests:** `adf`, `kpss`, `grangerF`, `mannWhitneyU`, `ks2Sample`, `benjaminiHochberg`,
  `achievedPower` — each returning a uniform `TestResult` with `nullHypothesis`,
  `decision`, `alpha`, plain-English `interpretation` and `assumptionsChecked`.

## 5. Screens

1. **Index Terminal** (landing) — national APIx line with 95% CI ribbon + ghost lines for
   prior vintages; four StatTiles that count up on mount; attribution waterfall; top
   movers; data-quality badge; method toggle. Brushing the chart updates everything.
2. **Method Lab — the money screen** — six series on identical data (naive mean, median,
   Carli, Dutot, fixed-panel Jevons, RYGEKS–FEWS); prominent end-of-window divergence in
   pp; **"Show composition drift"** toggle revealing the share shift on a secondary axis;
   per-method chain-drift readout with naive chaining flagged red; one-paragraph
   non-specialist explainer. Lines morph on range change, never redraw.
3. **Term Structure Lab** — animated fare curve vs days-to-departure with scrubber;
   horizon x departure-date surface/heatmap; PCA loadings PC1–PC3 with variance bars;
   four Nelson–Siegel parameters as large animated numerals with one-line interpretations.
4. **Route Explorer** — searchable list; `layoutId` expansion into deep dive: index series,
   fare violin by horizon, capacity overlay, rail-substitute comparison, event markers,
   forecast fan.
4b. **Carrier Breakdown** *(added 2026-09-27 at the user's request; SIH26056 asks for the
   compilation to be traceable to the operators)* — IndiGo, Air India, Air India Express,
   Akasa Air, SpiceJet and Alliance Air. Per-carrier constant-quality index against its own
   naive average; share of quotes through time as a stacked band; **matched-cell fare
   premium** (compared only within the same route, cabin, fare family, horizon and month, so
   the number is pricing and not route network) with a paired t-test; HHI; per-carrier
   cabin mix. Table from `sm`, cards below.
5. **OLAP Workbench** — drag dimensions onto rows/cols, pick measures, pivot computed in a
   Web Worker, every cell clickable into Lineage.
6. **Lineage Drawer (global)** — aggregate -> contributing observations -> raw JSON payload,
   SHA-256, parser version, ingestion run, plus a **Verify** button that recomputes the
   hash in-browser and shows a green match. The T1 provenance USP made tangible.
7. **Attribution Studio** — fuel/capacity/demand/seasonal/events/residual waterfall; ADF on
   each series; Granger F both directions; mandatory banner: *"Estimated statistical
   association. Causal interpretation requires the identification assumption stated below."*
8. **Anomaly Console** — flagged movements with severity, auto-generated explanation,
   accept/reject updating a labelled-set counter; **BH-FDR toggle** moving flagged routes
   from ~17 to ~3 with a caption explaining why.
9. **Portfolio and CFO** — route-as-asset correlation heatmap with hierarchical clustering;
   factor exposures table (market beta, fuel beta, capacity beta, R-squared, idio vol);
   efficient frontier with an animated dot driven by a risk-tolerance slider and a
   re-animating allocation bar; budget simulator running Monte Carlo in a worker with
   p50/p80/p95 and VaR/CVaR.
10. **Compliance and Source Registry** — all 12 sources with robots status, ToS verdict,
    reviewer, rate limit, reliability, last success; master **"Disable all scraped sources"**
    toggle that visibly recomputes the index with fewer observations — CIs widen, imputation
    rises, index stays published. USP T8 demonstrated, not asserted.
11. **Research Assistant** — chat over ~20 bundled synthetic chunks (DGCA circulars, AERA
    orders, ILO methodology, our methodology notes). Retrieval is **real TF-IDF + cosine**,
    not an LLM. Templated answers with citation chips. `as_of` date picker + one
    **superseded AERA order** so an earlier date returns a different, correct answer.
12. **MCP Playground** — pick one of 16 tools, fill arguments, "call" it; show JSON-RPC
    request, animated streaming response, rendered result — all mapped to the same quant
    functions the dashboard uses, so chat and chart cannot disagree. Plus a scripted
    three-turn conversation mode.

## 6. Design system and responsiveness

Dark-first research terminal. Dense, precise, unfussy. An instrument, not a template.

```
Background  #0E1013   Surface #15181D   Elevated #1A1E24
Border      #242932   Border strong #333A45
Text        #E6E9EE   Muted #9AA4B2   Faint #6D7684
Accent      #4ECDB4   Warning #E0A45E   Negative #E06A5E   Positive #5ECD8F
Chart       #4ECDB4 #7AA5E8 #E0A45E #C98BD9 #9AA4B2 #E06A5E
```

- **Type:** Inter for prose; **JetBrains Mono for every number, code and table cell**;
  `font-variant-numeric: tabular-nums` everywhere so animated numbers do not jitter.
- **Density:** 8px base grid; generous small multiples; tight line heights in tables.
- **Light mode** via class toggle, designed dark first.
- **Signature interaction:** every number in the UI is clickable and opens Lineage.
  Subtle consistent affordance — 1px accent underline, cursor change.

**Responsive contract (user-mandated, applies to every screen):**

| Band | Width | Behaviour |
|---|---|---|
| Phone | <640 | Sidebar becomes a slide-over sheet; bottom quick-nav for top destinations; StatTiles 2-up; charts min 240px tall, legends below; tables render as stacked cards; OLAP drag-drop degrades to tap-to-assign selects; Lineage is a bottom sheet |
| Tablet | 640–1023 | Collapsed icon rail; StatTiles 2-up; single-column feature panes; charts full-width |
| Laptop | 1024–1439 | Full sidebar; 3–4 column tile rows; side-by-side panes |
| Display | >=1440 | Max content width 1680px; small multiples expand; Lineage as persistent right rail |

No horizontal page scroll at any width >=320px. All hit targets >=44px on touch.
Charts resize via `ResizeObserver`, never fixed pixel widths.

## 7. Motion

Purposeful, never decorative. Nothing bounces.

| Element | Behaviour |
|---|---|
| Route transitions | Fade + 8px upward slide, 240ms ease-out |
| StatTile numbers | Count-up 700ms `easeOutExpo`, comma formatting preserved mid-tween |
| Chart series updates | ECharts `animationDurationUpdate: 500`, `cubicInOut` — morph, never redraw |
| Card -> detail | Framer Motion `layoutId`, 320ms spring (stiffness 260, damping 30) |
| Lineage drawer | Slide 260ms + 120ms backdrop fade |
| Term-structure playback | 24fps scrubber with pause; curve interpolates between dates |
| Frontier slider | Dot + allocation bars on `requestAnimationFrame`, no debounce |
| Worker computation | Skeleton shimmer + determinate progress bar — never a full-page spinner |
| List reordering | `AnimatePresence` + `layout` |
| Reduced motion | `prefers-reduced-motion` disables all of the above; opacity fades only |

Budget: 60fps on a mid-range laptop. >50ms of computation goes to a Worker. Virtualise
lists over 200 rows.

## 8. Build order — demoable at every step

1. Scaffold, Tailwind, primitives, routing, AppShell, tokens, dark/light toggle.
2. Master data + DGP in a Worker with generation progress. **Verify composition drift exists before proceeding.**
3. `lib/linalg` + `elementary` + `multilateral` + `hedonic`. Vitest: identity, proportionality, time reversal, units invariance, GEKS transitivity.
4. Index Terminal.
5. **Method Lab** — do not move on until the divergence is real and visible.
6. Lineage drawer + global click-any-number wiring.
7. Term Structure Lab (PCA + Nelson–Siegel).
8. Route Explorer, OLAP Workbench.
9. Attribution, Anomalies (FDR toggle).
10. Portfolio and CFO.
11. Compliance registry with the source-disable demonstration.
12. Research Assistant, MCP Playground.
13. Polish: motion audit, reduced motion, keyboard nav, empty states, error boundaries.

### 5b. Landing screen (added 2026-09-27)

The boot screen is held for a fixed **5 seconds** (`LANDING_DWELL_MS`) regardless of how
fast generation finishes, so the provenance statement on it is read rather than flashed.
An aircraft climbs from the lower left to the upper right along a cubic Bezier over ~4.6s,
banking on the analytic tangent of its own path and drawing its contrail behind it. The
progress bar continues to report the real generation state underneath; the dwell is never
dressed up as work. Under `prefers-reduced-motion` the aircraft is placed at its
destination without animating.

## 9. Acceptance criteria

- [ ] Every displayed statistic computed at runtime. **Zero hardcoded chart data.**
- [ ] Method Lab shows >=2pp divergence between naive mean and RYGEKS–FEWS over 24 months, and it changes with the date range.
- [ ] Chain-drift visibly non-zero for naive chaining, ~0 for multilateral methods.
- [ ] Hedonic adjusted R-squared > 0.65 on the synthetic data.
- [ ] PCA returns three components explaining >95% of fare-curve variance, correctly labelled.
- [ ] Any number anywhere opens Lineage and resolves to a raw payload whose hash verifies.
- [ ] Disabling scraped sources recomputes with **higher imputation**, without breaking.
      *(Corrected 2026-09-27 from "wider CIs". The bootstrap is clustered on ROUTE, so the
      interval is governed by the number of routes and how differently they move, not by
      the quote count within them. Withdrawing a fifth of the quotes while keeping all 60
      routes barely moves the band - measured 3.283 -> 3.202 index points. What degrades is
      coverage. The Compliance and Methodology screens both say so explicitly rather than
      claiming the tidier story.)*
- [ ] FDR toggle materially changes the anomaly count.
- [ ] `as_of` change in Research Assistant returns the correct superseded-vs-current document.
- [ ] MCP Playground outputs match the corresponding dashboard figures exactly.
- [ ] 60fps during term-structure playback and frontier slider drag.
- [ ] Works fully offline after first load. No runtime network requests.
- [ ] Keyboard navigable; `prefers-reduced-motion` respected.
- [ ] **Responsive and usable at every width from 320px to 2560px.**

## 10. Easy to get wrong

- **Do not** let naive and quality-adjusted indices come out identical. If they do, the composition drift in the DGP is too weak — **fix the generator, not the chart**.
- **Do not** use a normal quantile for VaR. Fares are right-skewed; use Cornish–Fisher, and the difference should be visible.
- **Do not** use sample covariance for the frontier — with 60 routes it is near-singular. Ledoit–Wolf is required and should be mentioned in a tooltip.
- **Do not** label attribution components as causes. The banner is not optional.
- **Do not** animate numbers without tabular figures.
- **Do not** block the main thread. Generation, pivot, bootstrap and Monte Carlo all belong in Workers.
