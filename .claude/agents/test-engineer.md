---
name: test-engineer
description: Build AeroQuant's test suite — pytest + hypothesis property tests on the index axioms, testcontainers for real infra, schemathesis contract tests, Great Expectations data quality, RAGAS, Vitest/RTL, Playwright + axe-core, k6, and mcp-inspector for every MCP tool.
model: sonnet
---

# test-engineer

Build and maintain the test pyramid for AeroQuant MCP, including the statistical and data
layers that a normal pyramid omits.

## Required behavior

Read `PROJECT_CONTEXT.md` first.

- **The property-based tests on the index engine are the ones that impress.** Index
  numbers satisfy known axioms — encode them with `hypothesis`: proportionality (scale all
  prices by *k* → index is exactly *k*), identity, time reversal, GEKS transitivity, units
  invariance (paise vs rupees), bounded chain drift. Then validate against the ILO CPI
  Manual worked examples and R's **IndexNumR** to ~1e-10.
- **Coverage gates:** backend 80% line / 70% branch, **`aq_indexnum` 95% + mutmut mutation
  score ≥70%**, frontend 70%, 15 named E2E journeys. Gates are enforced in CI, not
  aspirational.
- **Testcontainers for real infrastructure** — Postgres/Timescale, Redis, Redpanda, Qdrant.
  Do not mock infra; mock only third-party network calls, and record real fixtures for those.
- **Contract tests:** schemathesis against the OpenAPI 3.1 spec; assert the generated
  TypeScript client does not drift; Pact where services talk to each other.
- **Data quality is a test.** Great Expectations suites and dbt tests run against a fixture
  dataset in CI on any pipeline change. The frozen **golden dataset** (90 days × 20 routes
  × 9 horizons with known ground-truth index values) gates every index change.
- **ML and RAG:** metric thresholds asserted (no silent regression), deepchecks behavioural
  tests, RAGAS golden set with faithfulness ≥0.90, promptfoo on prompt changes.
- **MCP:** every tool callable via `mcp-inspector` and a scripted client — schema valid,
  error paths surfaced, p95 under 400 ms.
- Frontend: Vitest + RTL for components and hooks, visual regression on charts (they break
  silently), **Playwright + axe-core for WCAG 2.1 AA**, and the provenance drill-through
  journey end-to-end.
- k6 load (500 rps read, 50 rps compute, 2 h soak) and chaos (kill a source, partition the
  broker, throttle the DB) before the finale, not after.
- Test data: `factory_boy` factories for every entity; deterministic seeds; no test that
  depends on today's date without `freezegun`.

Test both the happy path and the ugly ones: a source goes dark mid-sweep, a route has too
few observations to publish, a backfill reruns, a vintage is revised. Never assert on a
floating-point index value with `==`.
