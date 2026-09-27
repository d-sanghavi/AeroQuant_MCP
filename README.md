# AeroQuant MCP — Airfare Price Index Terminal

**Smart India Hackathon 2026 · Problem statement SIH26056 · Ministry of Statistics and Programme Implementation**

> *Development of a system for collection and compilation of airfare price data from airline and travel websites for the Consumer Price Index.*

A client-side research terminal that compiles a constant-quality airfare price index (APIx) for Indian domestic aviation, and shows its own working.

---

## The claim this repository has to survive

**An average of scraped prices is not a price index.**

When the mix of quotes shifts toward last-minute bookings, premium cabins or full-service carriers, a simple average rises even though no airline changed a fare. The index is then reporting a change in *what was observed* as a change in *what things cost*.

This prototype demonstrates the gap rather than asserting it. Against a data-generating process whose true underlying trend is **6.18% a year**:

| Measure | Average year-on-year |
| --- | ---: |
| True generator trend | **6.18%** |
| Constant-quality index (RYGEKS–FEWS) | **4.82%** |
| Naive mean of collected fares | **15.30%** |
| **Error introduced by the naive measure** | **10.47pp** |

Those four numbers are computed at runtime, asserted in [`pipeline.test.ts`](client/src/lib/quant/pipeline.test.ts), and change when you change the date range in the app.

## Every number is computed, none are stored

There are no hardcoded chart arrays anywhere in this repository. The dataset is generated from a seeded process at load time in a Web Worker, and every statistic on screen — index numbers, hedonic coefficients, principal components, bootstrap intervals, value at risk, p-values — is computed from it in TypeScript, in your browser.

The numerics are hand-rolled rather than imported, because the point of the exercise is the method:

- **Index numbers** — Jevons, Dutot, Carli, harmonic, Törnqvist; GEKS–Törnqvist; Time Product Dummy solved by alternating projections; RYGEKS with a Fixed Effects Window Splice
- **Linear algebra** — Householder QR with column pivoting, cyclic Jacobi eigendecomposition, Cholesky with a relative ridge, streaming normal equations
- **Distributions** — `lgamma` (Lanczos), `erf`, normal quantile (Acklam + Halley), incomplete beta and gamma, Student *t*, *F*, *χ²*, Kolmogorov
- **Tests** — ADF with MacKinnon response-surface criticals, KPSS, Granger *F*, Mann–Whitney *U*, two-sample KS, Benjamini–Hochberg FDR, Ljung–Box, Welch's *t*
- **Risk** — Ledoit–Wolf shrinkage, Cornish–Fisher VaR with a monotonicity domain check, projected-gradient efficient frontier
- **Time series** — STL with LOESS, GARCH(1,1) QMLE, Nelson–Siegel with τ profiled over a log grid

No backend. No API keys. No network request at runtime — enforced by a build gate.

## Quick start

```bash
git clone https://github.com/d-sanghavi/AeroQuant_MCP.git
```

```bash
cd AeroQuant_MCP/client && npm install && npm run dev
```

Open <http://localhost:5173>. The dataset generates in about a second; the landing screen is held for five.

### Verifying the claim yourself

```bash
cd client && npm test
```

The suite prints the figures it asserts — the six methods' growth rates, the chain-drift diagnostics, the hedonic fit, the PCA variance decomposition, and the effect of withdrawing the scraped sources. If the constant-quality index stops recovering the generator's trend, the tests fail.

## The fourteen screens

| Screen | What it is for |
| --- | --- |
| **Index Terminal** | The published series, its 95% band, prior vintages, and what moved it |
| **Method Lab** | Six formulae on identical data, with the composition drift overlaid — the money screen |
| **Term Structure** | Fare against days to departure; PCA into level, slope and curvature; Nelson–Siegel |
| **Route Explorer** | Per-route index, fare violin by horizon, capacity, rail substitute, conformal forecast |
| **Carrier Breakdown** | IndiGo, Air India, Air India Express, Akasa Air, SpiceJet and Alliance Air |
| **OLAP Workbench** | Cross-tabulate the panel on any two of ten dimensions, every cell traceable |
| **Attribution Studio** | Fuel, capacity, demand, seasonality, horizon, events, trend, residual — with the identification assumption stated |
| **Anomaly Console** | Route-months flagged, with Benjamini–Hochberg taking 104 raw flags down to 2 |
| **Portfolio Analytics** | Routes as correlated assets: clustered correlation, factor betas, frontier, tail risk |
| **Travel Budget** | Monte Carlo on a real itinerary with correlated legs; p50 / p80 / p95 and expected shortfall |
| **Source Registry** | Twelve sources with robots and ToS verdicts, and a kill switch that really recomputes |
| **Methodology** | How every number is produced, with the index-number axioms evaluated live in your browser |
| **Research Assistant** | TF-IDF retrieval over a regulatory corpus with `as_of` dating — no language model |
| **MCP Playground** | The sixteen tools an agent would call, answered by the same functions the charts call |

### Three things worth opening first

1. **Method Lab → "Show composition drift".** The naive line tracks the share of short-horizon quotes, not prices.
2. **Source Registry → "Disable all scraped sources".** The panel drops from 5.1 lakh observations to 4.0 lakh and the index is still published. The confidence band barely moves — because the bootstrap is clustered on *route*, so its width depends on how many routes there are, not how many quotes sit inside them. What degrades is coverage. The screen says so rather than claiming the tidier story.
3. **Any number, anywhere.** Click it. The Lineage drawer resolves it to the raw payloads it was computed from, with a **Verify** button that recomputes the SHA-256 over the displayed bytes using the Web Crypto API.

## Architecture

```
Browser main thread                    Web Worker
┌──────────────────────────┐          ┌───────────────────────────────┐
│  React 18 + React Router │          │  Seeded data generator        │
│  Zustand (filter, theme) │  DTOs    │  ~500k observations           │
│  ECharts · visx          │ ───────► │  Columnar typed-array panel   │
│  Framer Motion           │ ◄─────── │  lib/quant + lib/linalg       │
│  Never sees the dataset  │          │  SHA-256 via Web Crypto       │
└──────────────────────────┘          └───────────────────────────────┘
```

The dataset lives in the worker and never crosses to the main thread — half a million observations plus the product cube is around 30MB of typed arrays, and structured-cloning that on every filter change would stall the UI for longer than the computation it was meant to avoid. Everything crossing the boundary is a plain DTO, sized for the screen that asked for it.

There is exactly **one** `computeIndices()` pipeline. The chart and the MCP tool call the same function, so an agent quoting a figure and a screen plotting it cannot disagree.

## Responsive contract

Responsiveness is an acceptance criterion here, not a polish item — a judge will open this on a phone.

| Band | Width | Behaviour |
| --- | --- | --- |
| Phone | < 640px | Sheet navigation, 5-item bottom bar, 2-up tiles, **cards instead of tables**, tap-to-assign instead of drag |
| Tablet | 640–1023px | Two-column panels, tables appear |
| Laptop | 1024–1439px | Permanent sidebar |
| Display | ≥ 1440px | Content capped at 1680px |

Touch targets clear 44px on coarse pointers. `prefers-reduced-motion` is respected throughout — the landing aircraft is placed at its destination rather than flown.

## Deployment

The repository deploys to Vercel with no dashboard configuration: [`vercel.json`](vercel.json) at the root builds `client/` and serves `client/dist`, with an SPA rewrite for client-side routing and a content security policy that permits no outbound connection.

```bash
npx vercel --prod
```

Or import the repository at [vercel.com/new](https://vercel.com/new) and accept the detected settings.

## Project layout

```
.
├── client/                     # the entire application
│   ├── src/
│   │   ├── app/                # shell, router, landing screen, command palette
│   │   ├── components/         # primitives, charts, numbers
│   │   ├── data/
│   │   │   ├── master/         # airports, airlines, routes, calendar, sources
│   │   │   ├── generate/       # the data-generating process
│   │   │   └── worker/         # worker, protocol DTOs, analytics, provenance
│   │   ├── features/           # one directory per screen
│   │   └── lib/
│   │       ├── linalg/         # QR, Cholesky, eigen, matrix
│   │       ├── quant/          # index numbers, hedonic, tests, risk, time series
│   │       └── rag/            # TF-IDF retrieval
│   └── vite.config.ts
├── .claude/                    # shared engineering context: agents, skills, hooks
│   ├── PROJECT_CONTEXT.md      # single source of truth for the project
│   └── PROTOTYPE_SPEC.md       # the prototype brief and acceptance criteria
└── vercel.json
```

## Known limitations

Stated here and on the Methodology screen, because a prototype that hides them is worse than one that has them:

- **The data is synthetic.** Every figure comes from a seeded generator. The methods are real and the numbers are genuinely computed, but they describe a simulation. **Nothing here is an official statistic.**
- **The panel is trunk routes.** Sixty origin-destination pairs. Regional operators flying thin sectors are under-represented — Alliance Air is under one percent of quotes against a larger national share.
- **Quote share is not seat share.** A carrier selling three cabins contributes three rows per departure where a single-cabin carrier contributes one.
- **Attribution is association.** The decomposition is an accounting identity; the Granger tests describe forecast improvement. Neither establishes causation, and the identification assumption a causal reading would need is stated on the screen rather than assumed.
- **Hedonic standard errors are indicative.** Streaming normal equations with a ridge trade condition number for memory. Point estimates are sound; do not use the coefficient standard errors for inference at the margin.

## Development

```bash
cd client && npm run typecheck && npm run lint && npm test
```

| Command | Does |
| --- | --- |
| `npm run dev` | Vite dev server on :5173, exposed on the LAN for real-device testing |
| `npm run build` | Production build to `client/dist` |
| `npm run preview` | Serve the production build on :4173 |
| `npm test` | Vitest — 43 tests, including the acceptance criteria |
| `npm run test:quant` | Just the quant layer |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | ESLint, zero warnings tolerated |

One console error appears **in development only**: React StrictMode double-mounts every component, so the first ECharts instance is disposed with its initial paint frame still queued and zrender throws from inside a `requestAnimationFrame`. It does not occur in a production build. See the note at the top of [`EChart.tsx`](client/src/components/charts/EChart.tsx).

## Licence

[MIT](LICENSE).

The synthetic corpus in `client/src/data/generate/documents.ts` contains **fictional** instruments written in the register of real ones (AERA orders, DGCA circulars, MoSPI and ILO manuals) so that the retrieval has something of the right shape to work on. They are not real regulatory documents and must not be cited as such.
