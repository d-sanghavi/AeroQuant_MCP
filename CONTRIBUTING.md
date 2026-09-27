# Contributing

## Setup

```bash
cd client && npm install && npm run dev
```

Before opening a pull request:

```bash
cd client && npm run typecheck && npm run lint && npm test
```

## The three rules that are not negotiable

### 1. Every displayed number is computed at runtime

There are no hardcoded chart arrays in this repository and there must not be. The claim the project makes is that the methods diverge on the same data, and a reviewer will change the date range to check. If a figure cannot be computed, show nothing and say why — an empty state that explains itself is a result, a plausible-looking placeholder is a defect.

### 2. UI copy must match what the code does

This is the rule most often broken, and the one that does the most damage. Three examples caught during the initial build:

- The Anomaly Console described a cross-sectional comparison while the detector standardised within-route over time.
- The Source Registry claimed the confidence interval widens when sources are withdrawn. It narrows slightly, because the bootstrap is clustered on route.
- The Travel Budget claimed legs were drawn together. They were drawn independently.

In each case the prose was the tidier story and the code was right. Fix the prose, or fix the code — but never ship the pair disagreeing.

### 3. Units are load-bearing

A change between two **levels** is a percent. A difference between two **rates** is a percentage point. `fmtPct` and `fmtPP` are named apart for this reason, and conflating them is the single most common error in press coverage of price indices.

## Changing the data-generating process

`client/src/data/generate/` is calibrated, and the acceptance tests assert against it. If you change it:

- Run `npm test` and **read the figures it prints**, not just the green tick. The suite logs the six methods' growth rates, the drift diagnostics, the hedonic fit and the PCA decomposition precisely so they can be reviewed.
- Justify the change as realistic, not as tuning. "This makes the Anomaly Console show three flags instead of zero" is not a reason. "Real disruptions occasionally remove half a route's capacity for a fortnight, and linear pass-through understates what that does to the remaining inventory" is.
- Carrier shares are calibrated against published DGCA domestic market shares. `servingAirlines()` in `routes.ts` has thresholds chosen so the five major carriers land within about a point of theirs. Changing route assignment moves those shares.

## Changing the quant layer

`client/src/lib/quant/` and `client/src/lib/linalg/` are the crown jewels and are reviewed hardest.

- Numerics are hand-rolled on purpose. Do not introduce a statistics dependency.
- A method that fails an index-number axiom should fail it visibly. `axiomCheck.ts` evaluates the axioms at runtime and the Methodology screen renders the failures — Carli's time-reversal failure and Dutot's unit dependence are features of the demonstration, not bugs to paper over.
- Anything that estimates should report its uncertainty, and anything that tests should return the full `TestResult`: the null, the alpha, the decision, and the assumptions that were actually checked. A test whose assumptions failed is still shown, with the failures visible.

## Responsiveness

Every screen must work from 320px to 2560px. Below `sm`, tables become cards — horizontal scrolling a ten-column table at 375px is not a responsive design. Touch targets clear 44px on coarse pointers via the `tap` utility. `prefers-reduced-motion` is respected everywhere.

Verify in a real narrow viewport before opening a PR. Several defects found during the build were width-dependent and invisible at desktop.

## Style

- Prettier and ESLint configs are in `client/`. Formatting is Prettier's job; lint enforces correctness rules only.
- Match the surrounding code's comment density. The codebase explains *why*, not *what* — a comment that restates the line below it is noise, and a non-obvious trade-off with no comment is a trap for the next reader.
- No `any` at the worker boundary. The DTO types are the contract.
