---
name: Bug report
about: Something renders, computes or behaves incorrectly
title: ''
labels: bug
assignees: ''
---

**What happened**

**What should have happened**

**Where**
Screen, and the URL path (e.g. Method Lab, `/methods`).

**Viewport**
Width in pixels, or the device. Several defects here are width-dependent.

**If a number looks wrong**
Which number, what it showed, and what you expected. Click it — the Lineage drawer
resolves it to the observations it was computed from, which usually locates the fault.

**Console**
Any errors. Note that one ECharts error appears in development only, from React
StrictMode's double-mount; it does not occur in a production build.

**Date range**
The window selected in the range bar, since every figure depends on it.
