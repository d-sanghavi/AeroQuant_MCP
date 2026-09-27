---
name: debugging
description: Systematic debugging across the AeroQuant stack — acquisition, normalisation, data quality, index discrepancies, orchestration, API/MCP contracts and the terminal. Use the provenance chain and OTel traces; never adjust a published value to make a discrepancy go away.
---

# Debugging

Debug **AeroQuant MCP** (SIH26056) — a multi-service, multi-store pipeline where **a wrong
number is more dangerous than a crash**. Read `PROJECT_CONTEXT.md` first.

## Method

1. reproduce (deterministically — seed, freeze the clock, pin the vintage)
2. isolate the layer
3. form a hypothesis that predicts something else you can check
4. test it
5. fix the **root cause**
6. add regression coverage
7. verify adjacent failure modes

## Classify before chasing

- **Acquisition** — source down, compliance gate blocking (correctly!), quota exhausted,
  rate-limited, circuit breaker open, Playwright selector drift, partial sweep leaving
  panel gaps.
- **Normalisation** — parser version mismatch, entity resolution merging or splitting the
  wrong route/airline, fare-family misclassification, dedupe collision on a weak natural key.
- **Data quality** — Great Expectations failure, quarantine growth, imputation-rate spike,
  silent schema drift into silver.
- **Index** — *a value moved for the wrong reason.* **Check composition first**: did the
  observation mix shift? Is the panel complete for that period? Then weights, hedonic
  inputs, method, vintage selection. **Reproduce with `aq_indexnum` directly on the
  archived observations before suspecting the engine.**
- **Orchestration** — DAG failure, non-idempotent rerun, backfill diverging from the
  forward run, dependency ordering, timezone (everything is UTC until presentation).
- **API / MCP** — contract drift, serialisation, auth scope, cache serving stale or
  cross-tenant data, an RFC 9457 problem swallowed into a generic 500.
- **Frontend** — render/state, TanStack Query cache key, chart series mapping, responsive
  break.

## Use the system's own instruments

- **The provenance chain is a debugging tool**: served number → contributing observations →
  raw blob hash. If you cannot walk it, that is the first bug to fix.
- **`X-Request-ID` / OTel traces** across services, rather than guessing at boundaries.
- **Langfuse traces** for agent and RAG failures.
- **Vintages** let you diff what was published then against what is computed now — the
  fastest way to localise an index discrepancy.
- Compare a suspect series against a simpler method (Jevons on the fixed panel) before
  suspecting the multilateral implementation.

## Don't

Hide errors with a broad `except`. "Fix" a discrepancy by adjusting a published value.
Disable a failing data-quality expectation to make a pipeline green — quarantine and
investigate. Mutate bronze to make a parser pass. Patch a symptom in the API when the
defect is in normalisation. Leave a debug `print` or a widened CORS/auth rule behind.
