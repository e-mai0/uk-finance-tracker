---
title: Dissertation data error and recovery
themes: [failure, analysis]
employers_used: []
strength_signal: high
failure_signal: high
timeline: 2025-10..2025-12
confidence: high
last_confirmed: 2026-06-09
---
## Raw notes
For my dissertation on UK housing supply elasticity I built a panel regression in R. About three weeks before the deadline I ran a robustness check and found the main result was being driven by one outlier local authority — Kensington and Chelsea — which had anomalous planning data because of a boundary change in 2011. I hadn't spotted it earlier because I'd been looking at the R-squared rather than the residuals. When I removed the outlier and re-ran the model the coefficient dropped from 0.43 to 0.29 and lost significance at the 5% level. I had to reframe the whole argument — the finding changed from "UK housing supply is elastic" to "supply elasticity is highly heterogeneous across local authorities, with outlier behaviour driven by administrative boundary effects." Supervisor said it was more interesting. Got 73. The lesson was about always plotting residuals first, but also about not panicking when the finding changes — the analysis was still good, it just answered a different question.

## Final versions
Three weeks before my dissertation deadline I found a serious data error — one outlier local authority was driving my main result, inflating the supply elasticity coefficient from 0.29 to 0.43. I'd been checking R-squared rather than plotting residuals. Once I identified the cause (a 2011 boundary change that distorted the planning data), I removed the outlier, re-ran the model, and rewrote the argument: the finding shifted from "supply is elastic" to "elasticity is highly heterogeneous, with boundary effects a key confounder." The supervisor said it was more interesting. I got 73. The real lesson was procedural — residual plots before interpreting coefficients, not after.
