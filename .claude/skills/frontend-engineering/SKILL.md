---
name: frontend-engineering
description: Building the AeroQuant React research terminal — React 18 + TS strict + Vite + Tailwind/shadcn + TanStack + ECharts, feature-sliced, typed from the OpenAPI spec, dark-first and dense, WCAG 2.1 AA, with provenance drill-through as the signature interaction.
---

# Frontend Engineering

`web/` — the **AeroQuant research terminal**. Dense, dark-first, fast, auditable. Read
`PROJECT_CONTEXT.md` for the full stack.

## Structure (feature-sliced, NOT type-sliced)

```
web/src/
├── app/         router.tsx  providers.tsx (Query, Theme, Auth, Cube, i18n)  layout/
├── features/
│   ├── index-explorer/     # APIx series, method comparison, revisions
│   ├── term-structure/     # the fare curve, Nelson-Siegel, PCA factors
│   ├── route-intelligence/ olap-cube/  attribution/  anomalies/  forecasts/
│   ├── portfolio/  cfo/    research-assistant/  data-quality/
│   ├── compliance/         # the public source registry
│   └── admin/
├── shared/
│   ├── api/     # generated client + query hooks
│   ├── ui/      # shadcn primitives
│   ├── charts/  # ECharts/visx wrappers on one shared theme
│   └── hooks/ lib/ types/
└── styles/
```

## Types come from the backend

`openapi-typescript` generates the client from our OpenAPI 3.1 spec. **A backend contract
change must break the build, not production.** Never hand-write a response interface, and
never widen a generated type with `any` to get past a compile error — fix the contract.

## Key screens

Index Terminal (landing) · Term Structure Lab · Route Deep Dive · OLAP Workbench ·
Attribution Studio · Anomaly Console · Research Assistant · Portfolio & CFO ·
Compliance & Provenance · **MCP Playground** (a live console showing tool calls and
responses — it lets a judge see the NSO/RBI integration actually working).

## The signature interaction

**Every number in the UI is clickable and leads to its provenance.** Index value →
contributing routes → observation → raw JSON blob + SHA-256. Build it early; it is one of
the eight things that must be excellent, and it is the demo beat that proves *"every number
is auditable."*

## Honesty in the UI

A research terminal that misrepresents its own data is worse than no terminal.

- Show the **quality flag** (`provisional` / `final` / `suppressed`), the **CI ribbon**,
  the **imputation rate**, the **observation count** and the **vintage** next to the number
   — not buried in a tooltip.
- Never render a provisional value styled as final, or a quality-adjusted series labelled
  as raw.
- Render RFC 9457 problems honestly: show `detail` and `suggestion`, never a generic
  "something went wrong."
- Attribution charts carry the caption that components are estimated associations, not
  causal effects.

## State and data

TanStack Query for server state, `staleTime` per endpoint (index series 5 min, live fares
15 s, master data 24 h) · Zustand only for genuinely client-side state · TanStack Router
with search-param state so a view is shareable by URL · React Hook Form + Zod.

## Charts

**Apache ECharts primary**, visx for the bespoke term-structure viz, Plotly only if a 3D
surface survives the cut-list. Import per chart type, never the full bundle. Canvas above
~5k points. One shared theme — prefer **small multiples** over one giant chart. Visual
regression tests, because charts break silently.

## Performance budget

**LCP <2.0 s · INP <200 ms · CLS <0.1 · initial JS <250 KB gzipped.** Route-level code
splitting, virtualised tables (AG Grid / TanStack Table) for 100k+ rows, Web Worker for
client-side aggregation and CSV export, **skeletons never a full-page spinner**.

## Accessibility — WCAG 2.1 AA, audited

Keyboard-operable, visible focus, contrast ≥4.5:1, **never meaning by colour alone** (a
movement is a sign + a label, not just red/green), respects `prefers-reduced-motion`.
Verified with axe-core in Playwright, not by eye.

## Design direction

Dark-first research terminal. **JetBrains Mono** for figures with tabular numerals,
**Inter** for prose. Restrained accent palette, generous small multiples, high information
density. Resist the dashboard-template look.

## Don't

Compute an index client-side. Invent or round a number for looks. Mock an endpoint that
exists. Pull a second charting library. Ship a chart without an accessible table or summary
alternative.
