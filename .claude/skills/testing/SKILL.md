---
name: testing
description: AeroQuant's test strategy — hypothesis property tests on index axioms, IndexNumR reference validation, testcontainers, schemathesis contracts, Great Expectations, RAGAS, mcp-inspector, Vitest/RTL, Playwright + axe-core, k6, mutmut. Use when writing or reviewing tests.
---

# Testing

Test **AeroQuant MCP** (SIH26056) — a multi-service statistical platform where a wrong
number is more dangerous than a crash. Read `PROJECT_CONTEXT.md` first.

## The pyramid, with statistical additions

```
                 manual exploratory + jury dry-run
              E2E            Playwright: 15 critical journeys
        Integration          ~120: service ↔ DB ↔ queue, API contracts
       Component             ~300: each service isolated, testcontainers
      Unit                   ~1200: pure functions, index math, parsers
 ─────────────────────────────────────────────────────────────────
 CROSS-CUTTING: property-based │ statistical │ data quality │ ML │ security │ load
```

## The tests that win the room: index axioms

Index numbers satisfy known axioms. Encode them with `hypothesis`:

```python
@given(p0=prices, k=st.floats(min_value=0.1, max_value=10))
def test_proportionality(p0, k):
    """If every price scales by k, the index is exactly k."""
    p1 = [p * k for p in p0]
    assert jevons(p0, p1) == pytest.approx(k, rel=1e-9)

def test_identity(p0):          assert jevons(p0, p0) == pytest.approx(1.0, rel=1e-12)
def test_time_reversal(p0, p1): assert jevons(p0,p1) * jevons(p1,p0) == pytest.approx(1.0)
def test_geks_transitivity():   """P(0,2) == P(0,1) * P(1,2) by construction."""
def test_units_invariance():    """Invariant to paise vs rupees."""
def test_chain_drift_bounded(): """Forward-then-backward chaining returns to 1 in tolerance."""
```

Then **validate against reference implementations**: the ILO CPI Manual (2020) worked
examples and R's **IndexNumR**. *"Our GEKS matches IndexNumR to 1e-10 on the reference
dataset"* removes all doubt about correctness — get there.

## Tools by layer

| Layer | Tool | Focus |
|---|---|---|
| Unit (Python) | pytest, pytest-cov, freezegun | index formulae, parsers, normalisers, calendar logic |
| Property-based | **hypothesis** | index axioms |
| Component | pytest + **testcontainers** (Postgres, Redis, Redpanda, Qdrant) | real dependencies, **no mocks for infra** |
| Contract | **schemathesis** against OpenAPI; Pact inter-service | spec ↔ implementation agreement |
| Integration | pytest + docker compose | full ingest → normalise → index path |
| Data quality | Great Expectations, dbt tests | every pipeline run is a test |
| ML | metric thresholds, deepchecks | no silent model regression |
| RAG | RAGAS golden set, promptfoo | faithfulness ≥ 0.90 |
| **MCP** | **mcp-inspector** + scripted client | every tool callable, schemas valid, p95 <400 ms |
| Frontend | Vitest + RTL | components, hooks |
| Visual | Playwright screenshots | charts break silently |
| E2E | Playwright | login → explore index → drill to provenance → export |
| Accessibility | axe-core in Playwright | WCAG 2.1 AA |
| Load | k6 | 500 rps read, 50 rps compute, 2 h soak |
| Chaos | Toxiproxy | kill a source, partition the broker, throttle the DB |
| Security | OWASP ZAP, Semgrep, Trivy | every build |

## Gates

Backend **80% line / 70% branch** · **`aq_indexnum` 95% + mutmut mutation score ≥70%** ·
frontend 70% · 15 named E2E journeys · no decrease from base. Enforced in CI, not
aspirational — and never disabled to land a merge.

## Test data

`factory_boy` factories for every entity. Deterministic seeds. `freezegun` for anything
date-dependent. And the **frozen golden dataset**: 90 days × 20 routes × 9 horizons of
synthetic-but-realistic fares generated from a known DGP with known ground-truth index
values, committed as Parquet — every index change is validated against it.

## Cover the ugly paths

A source goes dark mid-sweep · a route has too few observations to publish (expect the
RFC 9457 problem, not a silent zero) · a backfill reruns and must be identical · a vintage
is revised · the panel has a gap · a parser version changes · a tenant tries to read
another's data.

## Don't

Mock infrastructure (mock only third-party network calls, from recorded fixtures). Assert
on a float index value with `==`. Write a test that depends on today's date without
`freezegun`. Disable a failing data-quality expectation to go green. Test only the happy
path.
