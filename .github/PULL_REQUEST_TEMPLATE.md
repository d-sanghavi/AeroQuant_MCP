## What this changes

<!-- One paragraph. What is different after this merges, and why. -->

## Which screen or module

<!-- e.g. Method Lab, lib/quant/multilateral.ts, the data-generating process -->

## If this touches a displayed statistic

Every number on this terminal is computed at runtime and has to be defensible.

- [ ] No hardcoded chart data was introduced
- [ ] The method is documented in the file header or on the Methodology screen
- [ ] Any claim made in UI copy matches what the code actually does
- [ ] Units are correct — percent for a change between levels, percentage points for a difference between rates

## If this touches the data-generating process

- [ ] `npm test` passes, and the acceptance figures it prints were read, not just the green tick
- [ ] The change is defensible as realistic, not as tuning to make a screen look better

## Checks

- [ ] `npm run typecheck`
- [ ] `npm run lint`
- [ ] `npm test`
- [ ] Verified in the browser at desktop **and** at 375px
