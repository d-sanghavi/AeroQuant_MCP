---
name: index-methodology
description: Index-number methodology for AeroQuant's aq_indexnum — multilateral methods (Jevons, Dutot, Carli, GEKS-Törnqvist, TPD, RYGEKS-FEWS), the axioms to property-test, hedonic quality adjustment, booking-horizon panels, weighting, vintages and revisions. Use for any work touching index computation, METHODOLOGY.md, or a number that reaches CPI.
---

# Index Methodology

The statistical core of **AeroQuant MCP** (SIH26056). This is where the marks are.
Read `PROJECT_CONTEXT.md` for project-wide context.

## The one thing that must never be forgotten

**An average of scraped prices is not a price index.** It conflates price change with
composition change: when the observation mix shifts toward last-minute bookings the mean
rises even though no fare moved. Every price statistician in the room knows this. Solving
it is the moat.

Three defences, used together:

1. **Fixed booking-horizon panel** — T-1, T-2, T-3, T-7, T-15, T-30, T-45, T-60, T-90.
   A fare quoted 3 days out and one quoted 30 days out are *different products*.
2. **Hedonic quality adjustment** — horizon, cabin, refundability, stops, carrier.
3. **Multilateral index methods** — handle product churn without chain drift.

## Methods to implement in `aq_indexnum`

| Method | Use / caution |
|---|---|
| **Carli** | Arithmetic mean of price relatives. Implement for comparison; upward-biased, fails time reversal. Never the headline. |
| **Dutot** | Ratio of mean prices. Only defensible for homogeneous items — airfares are not. |
| **Jevons** | Geometric mean of price relatives. Satisfies identity, proportionality, time reversal. The sane bilateral baseline. |
| **GEKS-Törnqvist** | Transitive multilateral over a window. Handles churn. |
| **TPD (Time Product Dummy)** | Regression-based; naturally extends to hedonic (TDH) when characteristics are added. |
| **RYGEKS + FEWS** | Rolling-year GEKS with Fixed Effects Window Splice — the headline method; extends the window without reintroducing drift. |

Report the method, weight scheme and methodology version with every published value. The
**method-comparison chart** (naive mean vs median vs fixed-panel Jevons vs RYGEKS-FEWS on
the same fares) is the single most persuasive artefact the project has — those lines sit
percentage points apart, and that gap is what would otherwise enter CPI.

## The axioms — encode these as `hypothesis` properties

```python
# proportionality: scale every price by k → index is exactly k
# identity:        P(p, p) == 1
# time reversal:   P(0,1) * P(1,0) == 1
# transitivity:    GEKS: P(0,2) == P(0,1) * P(1,2)
# units invariance: paise vs rupees gives the same index
# chain drift:     forward-then-backward chaining over a year returns to 1 within tolerance
```

Then **validate against reference implementations**: reproduce the worked examples in the
ILO CPI Manual (2020) and cross-check against R's **IndexNumR**. Being able to say
*"our GEKS matches IndexNumR to 1e-10 on the reference dataset"* removes all doubt.

Gate every change on the frozen **golden dataset** — 90 days × 20 routes × 9 horizons of
synthetic-but-realistic fares generated from a known DGP, with known ground-truth index
values, committed as Parquet.

## Library discipline

`aq_indexnum` is **pure**: numpy/pandas in, series out. No I/O, no ORM, no Django import,
no global state, no logging side effects.

```
index(observations, method, weights, version) -> series
```

It ships standalone on PyPI (Apache-2.0) with its own tests and docs. Coverage **95% line,
mutmut mutation score ≥70%**. It is the most credible artefact we can hand a MoSPI
evaluator — treat its quality bar as higher than the rest of the repo.

## Weighting and aggregation

- Route weights from **official DGCA passenger traffic** (12-month trailing), not from our
  own observation counts — otherwise collection intensity becomes an economic signal.
- Hierarchical aggregation: route → city-pair → state → region → national.
- Align the elementary aggregate to **MoSPI's CPI item → sub-group → group** structure;
  keep the crosswalk in a versioned mapping table, not in code.
- Below a minimum observation count a cell is **suppressed, not published** — return an
  RFC 9457 problem with the minimum and the observed count, and suggest a higher aggregate.

## Vintages and revisions

- Every published value is a **vintage**. First estimates are `provisional`; they become
  `final` under a stated revision policy.
- Store vintages; never overwrite. Revision magnitude (first vs final) is a tracked metric
  (<0.8pp MVP, <0.3pp production).
- `get_lineage(index_code, period)` must return the contributing observations and their raw
  blob hashes. If that chain breaks, the index is not auditable and the project's central
  claim fails.

## Reporting discipline

Never publish a bare number. Every value carries: index value, MoM/YoY change, 95% CI,
standard error, `n_observations`, `n_routes`, imputation rate, quality flag, vintage
timestamp, method, weight scheme, methodology version.

Attribution components are **estimated statistical associations, not causal effects** —
state it in the payload, every time.

## `METHODOLOGY.md`

The single most important non-code deliverable. Formulae, choices, **justifications**,
limitations, and the revision policy. Write it to international standard (ILO CPI Manual
2020, UNECE Practical Guide). If the document and the code disagree, that is a defect —
fix both.

## Don't

Smooth, clip or winsorise a published series to make it look better. Let a derived value
overwrite an observation. Back-fit a method to a desired outcome. Assert on a float index
value with `==`. Publish a number you cannot re-derive from archived evidence.
