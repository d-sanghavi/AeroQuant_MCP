---
name: research
description: Evidence-driven research for AeroQuant — ILO/UNECE index-number practice, MoSPI CPI 2024, DGCA/AERA/MoCA regulation with version awareness, source ToS and licence terms, aviation master data. Separate fact from assumption; cite primary sources.
---

# Research

Research for **AeroQuant MCP** (SIH26056). Read `PROJECT_CONTEXT.md` first.

## Always separate

- **verified fact** (with source, date, and the specific passage)
- **assumption** (with what would falsify it)
- **inference** (with the reasoning step)
- **recommendation** (with the trade-off)

Record source, date, relevance and remaining uncertainty for each. An evaluator will check,
and a fabricated citation is fatal to the project's credibility.

## Primary sources for this project

**Methodology** — ILO et al., *Consumer Price Index Manual: Concepts and Methods* (2020),
especially elementary aggregates, multilateral methods and quality adjustment ·
UNECE/Eurostat, *Guide to Multilateral Methods for Scanner Data* (FEWS, RYGEKS, TPD) ·
Eurostat, *Handbook on Prices and Volume Measures* · Diewert on axiomatic index-number
theory · **IndexNumR** (R) as a reference implementation.

**Indian official statistics** — MoSPI CPI 2024 base-revision documentation (basket
expanded 299 → 358 items, online/e-commerce sources formally adopted for service items
including air fare) · e-Sankhyiki portal.

**Aviation** — DGCA Air Transport Circulars and Tariff Monitoring Unit publications ·
AERA tariff orders for the airports in the route set · MoCA, AAI, OurAirports, OpenFlights.

**Standards** — Model Context Protocol specification · SDMX 3.0 · RFC 9457 · OpenAPI 3.1.

## Version awareness

**Regulation is time-versioned.** An AERA order or DGCA circular may be superseded. Always
establish which version was **in force for the period under discussion**, and say so. This
is not pedantry — it is the exact failure the RAG layer's temporal filtering exists to
prevent, and it is a demo beat.

## Source legality research

Hand findings to `compliance-officer` in the shape `source_registry` expects: legal basis,
**the clause relied on**, **the date read**, rate limit, contact. **Never state a ToS
position you have not read.** Ambiguous means disabled.

## Turning research into work

A literature summary is not a deliverable. Produce a **decision with trade-offs** the quant
or engineer can act on, and convert it into either an engineering requirement or a
`METHODOLOGY.md` section.

When claiming novelty, distinguish *"this exists somewhere in world statistical practice or
in commercial finance"* from *"this does not exist in this institution, for this price
statistic, at this scale, in this country."* The second is the defensible claim the project
rests on; the first is not.

## Don't

Fabricate a citation, page number, figure or regulation. Present an unverified claim as
fact — mark it unverified. Let an illustrative number escape without being labelled as
such. Cite a blog where a primary source exists.
