# Writing eval — old pipeline vs new engine
_Run: 2026-06-10 00:39 UTC | Questions: 20 | Elapsed: 217.8s | Approx API calls: 120_
_Models: old arm = claude-haiku-4-5 | new arm = claude-sonnet-4-5 | judge = claude-haiku-4-5 | A/B assignment is random per run (no fixed seed)_

## LLM pre-judge summary
| | Count |
|---|---|
| New engine wins | 20 |
| Old pipeline wins | 0 |
| Ties | 0 |
| Judge failures (excluded from totals) | 0 |

## Faithfulness (invented specifics)
| Arm | Total invented specifics across all questions |
|---|---|
| New engine | 45 |
| Old pipeline | 62 |

**THE USER IS THE FINAL JUDGE** — read each pair against `rubric.md`, record verdict in docs/MANUAL-TASKS.md Gate B.
_Note: The LLM pre-judge is a pre-filter only; judge failures are excluded from totals and do not count for or against either arm._

---

## q01 — Why do you want to work at Goldman Sachs?
**Employer:** Goldman Sachs | **Char limit:** 500

**Answer A**

Goldman Sachs operates at a scale where the advisory work is genuinely consequential. My week at Rothschild showed me what that looks like on a smaller stage; I want to work where the transactions are larger and the analytical bar is higher. My dissertation uses panel regression to model housing supply constraints, and Goldman's research culture is where that kind of rigour gets tested properly.

**Answer B**

I am drawn to Goldman Sachs because of the calibre of analysis and breadth of sectors you undertake. My experience shadowing debt advisory at Rothschild & Co showed me I thrive in fast-paced deal environments, whilst my econometrics work and CFA Research Challenge participation—where my team placed second regionally—have built strong quantitative foundations.

_Pre-judge: A voice 4/5 detail 3/5 tells 0 | B voice 2/5 detail 3/5 tells 2 | better: **a**_

_Faithfulness — A invented: Goldman Sachs operates at a scale where the advisory work is genuinely consequential; Goldman's research culture; transactions are larger and the analytical bar is higher at Goldman Sachs_
_Faithfulness — B invented: Goldman Sachs_

---

## q02 — Why are you applying to J.P. Morgan and what attracts you to investment banking?
**Employer:** J.P. Morgan | **Char limit:** 600

**Answer A**

J.P. Morgan attracts me because of its pre-eminence in investment banking advisory and its breadth across infrastructure, M&A, and capital markets—sectors I want to deepen my understanding of beyond my Rothschild insight week. I'm drawn to investment banking because I enjoy the analytical rigour and client interaction I experienced shadowing debt advisory work, combined with the commercial problem-solving required to structure complex transactions.

**Answer B**

J.P. Morgan's debt capital markets volume speaks for itself. At Rothschild I sat in on a live infrastructure refinancing and saw how much rigour goes into client-facing work at that level. I want to be in that room properly.

Investment banking draws me because the analytical and advisory functions are inseparable. My dissertation uses panel regression across UK local authorities, and the CFA Regional Challenge pushed that quantitative thinking into a markets context. J.P. Morgan is where I want to develop both.

_Pre-judge: A voice 2/5 detail 2/5 tells 5 | B voice 4/5 detail 4/5 tells 1 | better: **b**_

_Faithfulness — A invented: J.P. Morgan; pre-eminence in investment banking advisory; infrastructure, M&A, and capital markets sectors_
_Faithfulness — B invented: J.P. Morgan's debt capital markets volume; CFA Regional Challenge_

---

## q03 — What motivates you to pursue a career in asset management at BlackRock?
**Employer:** BlackRock | **Char limit:** 500

**Answer A**

I'm drawn to asset management because it combines the quantitative rigour and data analysis I've developed through my Economics degree—particularly econometrics and financial modelling—with real-world investment decision-making. My dissertation on housing supply elasticity and research work cleaning ONS datasets have shown me how to extract insight from complex data.

**Answer B**

Markets are where economics becomes real decisions. My dissertation modelling housing supply across UK local authorities showed me how structural data work shapes investment thinking. BlackRock's scale, particularly in multi-asset research, is where that kind of rigour matters most. I want to build on my CFA Research Challenge experience in an environment where the analysis genuinely moves capital.

_Pre-judge: A voice 3/5 detail 3/5 tells 1 | B voice 4/5 detail 4/5 tells 0 | better: **b**_

_Faithfulness — A invented: financial modelling_
_Faithfulness — B invented: BlackRock's scale in multi-asset research; dissertation modelling housing supply across UK local authorities; CFA Research Challenge experience leading to wanting to work where analysis moves capital_

---

## q04 — Why do you want to work at Barclays and why markets specifically?
**Employer:** Barclays | **Char limit:** 600

**Answer A**

I am drawn to Barclays' Markets division because of the breadth of opportunity to apply quantitative analysis to real client problems. My dissertation on housing supply elasticity and research work cleaning and analysing ONS datasets have shown me that rigorous econometric modelling—combined with practical data handling—drives genuine insights in financial markets.

Your Markets team's reputation for combining sophisticated analytics with client advisory appeals to me directly.

**Answer B**

Barclays runs one of the larger FICC franchises in Europe, and that scale means the work is real from day one. My Bloomberg certification is introductory, but sitting with Rothschild's debt advisory team on a live infrastructure refinancing showed me how quickly market conditions reprice a deal. That's what draws me to markets over advisory: the feedback loop is immediate. My econometrics work and panel regressions in R have built a quantitative foundation I want to apply to pricing and risk, not just describe in a dissertation.

_Pre-judge: A voice 3/5 detail 2/5 tells 2 | B voice 4/5 detail 4/5 tells 0 | better: **b**_

_Faithfulness — A invented: Barclays' Markets division; Schroders_
_Faithfulness — B invented: Barclays runs one of the larger FICC franchises in Europe; work is real from day one; sitting with Rothschild's debt advisory team on a live infrastructure refinancing showed me how quickly market conditions reprice a deal; draws me to markets over advisory; pricing and risk_

---

## q05 — What draws you to advisory work and why Evercore over the bulge brackets?
**Employer:** Evercore | **Char limit:** 600

**Answer A**

I'm drawn to advisory work because it combines rigorous analysis with direct client impact—something I've experienced firsthand during my Rothschild insight week, where I prepared transaction comparables that directly informed senior stakeholders' decision-making.

Evercore appeals to me specifically because of its reputation for deep sector expertise and selective engagement model. Unlike bulge brackets, where I'd be one of hundreds rotating through standardised processes, Evercore's focused approach means I'd develop genuine specialisation early.

**Answer B**

Advisory work suits how I think. At Rothschild I sat in on a client update call during an infrastructure refinancing and watched the analyst room read the client as carefully as the numbers. That balance appeals to me more than execution volume.

Evercore's independent model sharpens that further. No lending relationships, no product quotas, just the advice. The CFA regional round taught me how quickly a narrative collapses under a conflicted interest. I'd rather build in a place where that conflict doesn't exist from the start.

_Pre-judge: A voice 3/5 detail 2/5 tells 3 | B voice 5/5 detail 3/5 tells 0 | better: **b**_

_Faithfulness — A invented: Evercore appeals to me specifically because of its reputation for deep sector expertise and selective engagement model; Unlike bulge brackets, where I'd be one of hundreds rotating through standardised processes; Evercore's focused approach means I'd develop genuine specialisation early_
_Faithfulness — B invented: Evercore's independent model; No lending relationships, no product quotas; CFA regional round taught me how quickly a narrative collapses under a conflicted interest_

---

## q06 — Tell us about a time you led a team through a difficult challenge.
**Employer:** Goldman Sachs | **Char limit:** 800

**Answer A**

I took over as LSE Rowing Club treasurer with an 800-pound deficit and a committee already discussing cancelling the summer tour.

First I audited every line of the accounts. The previous treasurer had double-booked a minibus contract and undercollected membership fees, so I renegotiated the contract for a 15% saving, ran a second subs sweep, and sourced a small business sponsorship. The committee needed a clear timeline, not reassurance, so I gave them weekly updates tied to specific targets.

Six weeks later the deficit was cleared. The tour went ahead with 24 members, the largest attendance in four years.

**Answer B**

During my tenure as Treasurer of LSE Rowing Club in 2024–2025, I managed a significant financial challenge: we faced an £800 deficit with limited options to reduce costs without compromising member experience. Rather than simply cutting expenses, I took a three-part approach. First, I renegotiated supplier contracts with our boat maintenance and equipment providers, securing a 12% reduction in annual costs. Second, I secured new sponsorship from a local fitness brand, generating £600 in additional revenue. Third, I coordinated with the committee to streamline administrative spending. These actions closed the deficit whilst enabling us to organise a record summer tour that attracted 24 members—our highest participation to date.

_Pre-judge: A voice 5/5 detail 4/5 tells 0 | B voice 2/5 detail 4/5 tells 3 | better: **a**_

_Faithfulness — A invented: the committee needed a clear timeline, not reassurance, so I gave them weekly updates tied to specific targets_
_Faithfulness — B invented: renegotiated supplier contracts with boat maintenance and equipment providers; 12% reduction in annual costs; local fitness brand sponsorship; £600 in additional revenue; streamline administrative spending_

---

## q07 — Describe a situation where you had to organise and lead a group project to a tight deadline.
**Employer:** J.P. Morgan | **Char limit:** 900

**Answer A**

During my role as Treasurer of LSE Rowing Club, I led the resolution of an £800 deficit within a tight financial year. I identified the root causes by auditing spending across boat maintenance, coaching fees and facilities, then organised the team to execute three concurrent initiatives: I personally renegotiated supplier contracts with our boat service provider and equipment vendors, reducing annual costs by roughly 15%. Simultaneously, I secured sponsorship from two local businesses, bringing in £600 in additional revenue. I coordinated with the club committee to implement modest membership fee adjustments, which required careful communication to avoid losing members. Throughout, I maintained weekly progress updates and held the group accountable to deadlines. We resolved the deficit by year-end and funded a record summer tour attended by 24 members.

**Answer B**

The LSE Economics Society panel had a confirmed speaker drop out four days before the event.

I was co-organiser and the other lead was unavailable that evening, so I took ownership immediately. I worked through the society's existing speaker contacts, wrote a short briefing note, and had three alternatives approached within 24 hours. A replacement confirmed on day three. We didn't change the programme, reschedule the room, or tell the 120 attendees anything had gone wrong.

The deadline was fixed and public, which meant there was no option to slip. I had to prioritise quickly, communicate clearly with the society committee, and keep moving without waiting for consensus on every step.

120 attendees turned out to be a society record. None of that would have happened if we'd panicked and postponed.

_Pre-judge: A voice 3/5 detail 4/5 tells 1 | B voice 5/5 detail 4/5 tells 0 | better: **b**_

_Faithfulness — A invented: auditing spending across boat maintenance, coaching fees and facilities; boat service provider and equipment vendors; sponsorship from two local businesses; bringing in £600 in additional revenue; modest membership fee adjustments; weekly progress updates; resolved the deficit by year-end_
_Faithfulness — B invented: speaker drop out four days before the event; other lead was unavailable that evening; wrote a short briefing note; three alternatives approached within 24 hours; We didn't change the programme, reschedule the room, or tell the 120 attendees anything had gone wrong_

---

## q08 — Give an example of a time you were in charge of a project that did not go to plan. How did you lead through it?
**Employer:** Barclays | **Char limit:** 1500

**Answer A**

During my tenure as Treasurer of LSE Rowing Club in 2024–2025, I inherited a club facing an £800 deficit with the summer tour—our flagship event—scheduled for that season. This was a significant challenge given my responsibility to the 24 members planning to attend.

Rather than cancel or scale back, I took a structured approach. First, I conducted a detailed financial audit to understand exactly where costs were concentrated. I then systematically renegotiated contracts with our existing suppliers, leveraging the multi-year relationship to secure better terms. Simultaneously, I identified sponsorship opportunities aligned with the club's profile and approached local businesses directly, ultimately securing commitments that covered the shortfall.

The tour proceeded as planned with record attendance. This experience taught me that when a project veers off track, the priority is to diagnose the problem clearly, break it into manageable components, and communicate transparently with stakeholders about the path forward. I'm confident those principles—combined with the analytical skills I've developed through econometric projects and financial modelling—will serve me well in a fast-paced banking environment where adapting to unforeseen circumstances is routine.

**Answer B**

I took over as LSE Rowing Club treasurer with an 800-pound deficit and a committee already talking about cancelling the summer tour.

The previous treasurer had double-booked a minibus contract and undercollected membership fees. Two problems feeding one another, and no one had audited the numbers properly. I started there. Line by line, I identified where the money had gone and where it could come back.

I renegotiated the minibus contract and brought the cost down 15%. I ran a second membership fee sweep for subs that hadn't been collected first time round. Then I approached a local business about sponsorship and secured a contribution that closed the remaining gap. Six weeks after taking over, the deficit was cleared.

The tour went ahead. Twenty-four members attended, the largest in four years.

What I learned leading through it was straightforward: panic is not a plan, but a clear problem statement usually is. The committee wanted to cut the tour before we knew exactly what had caused the shortfall. I pushed back, not because I was certain it was salvageable, but because the diagnosis wasn't finished. Once it was, the fixes were more obvious than the situation had looked.

_Pre-judge: A voice 3/5 detail 3/5 tells 3 | B voice 5/5 detail 4/5 tells 0 | better: **b**_

_Faithfulness — A invented: renegotiated contracts with existing suppliers for better terms (sources specify renegotiation of minibus contract specifically, not general supplier renegotiation); approached local businesses directly (sources do not specify direct approach method); leveraging the multi-year relationship (sources do not mention multi-year relationship history); commitments that covered the shortfall (sources say deficit was cleared but do not specify sponsorship alone covered it)_
_Faithfulness — B invented: none_

---

## q09 — Describe a time you worked effectively as part of a team to achieve a shared goal.
**Employer:** Morgan Stanley | **Char limit:** 800

**Answer A**

During my time as Treasurer of LSE Rowing Club, I led a recovery from an £800 deficit whilst organising a record summer tour for 24 members. This required coordinating across multiple stakeholders—the committee, suppliers, and prospective sponsors. I renegotiated contracts with existing suppliers to reduce costs and simultaneously secured new sponsorship funding. The success depended on clear communication: I presented the financial position to the committee, itemised cost-saving opportunities, and articulated the sponsorship value proposition to external partners.

**Answer B**

Co-organising the LSE Economics Society's annual panel, a speaker dropped out five days before the event. My co-organiser handled logistics while I focused on finding a replacement. Within three days I'd confirmed a postgraduate who'd interned at Schroders and turned out more candid about buy-side life than the original.

My specific contribution was the Q&A format: pre-submitted questions mixed with live ones, so the session stayed substantive rather than two people monopolising the floor. On the night, 120 people attended, a society record. Clear role allocation under pressure, and a shared goal delivered.

_Pre-judge: A voice 3/5 detail 4/5 tells 1 | B voice 5/5 detail 5/5 tells 0 | better: **b**_

_Faithfulness — A invented: £800 deficit (source states 800 pounds, not £800); record summer tour (source states record attendance but does not call it a 'record summer tour'); 15% saving (source mentions 15% saving in narrative but draft does not include this specific figure)_
_Faithfulness — B invented: none_

---

## q10 — Tell us about a time you collaborated with others to solve a problem. What was your specific contribution?
**Employer:** HSBC | **Char limit:** 900

**Answer A**

During my research assistant role at LSE in early 2026, I worked with a faculty member on a regional productivity project. The core challenge was that we had three ONS datasets with inconsistent boundary definitions from the 2011 revision, which made them impossible to merge cleanly.

My specific contribution was to systematically map the boundary changes in Stata, document which local authorities had been reorganised, and create a crosswalk to align all three datasets to a consistent geography. I flagged the inconsistencies in writing so the researcher understood exactly where the data quality issues lay.

Once cleaned, I ran descriptive regressions to test whether the merged dataset behaved as expected economically. This allowed the project to move forward with confidence.

**Answer B**

My dissertation supervisor caught a structural flaw in my panel regression three weeks before submission. The core result had shifted because one local authority, distorted by a 2011 boundary revision, was inflating the supply elasticity coefficient. That's a solo problem, but fixing it wasn't.

My specific contribution was identifying the cause. I'd been checking R-squared rather than plotting residuals. Once I ran the diagnostics, I flagged the boundary issue to my supervisor, explained why removing that authority changed the finding from "supply is elastic" to "elasticity is highly heterogeneous," and proposed the revised argument. My supervisor confirmed the reasoning was sound and suggested how to frame it for the conclusion.

The collaboration mattered because I needed someone to stress-test the logic, not just validate that the code ran. The final grade was 73.

_Pre-judge: A voice 4/5 detail 5/5 tells 0 | B voice 5/5 detail 5/5 tells 0 | better: **b**_

_Faithfulness — A invented: systematically map the boundary changes in Stata; create a crosswalk to align all three datasets; ran descriptive regressions to test whether the merged dataset behaved as expected economically_
_Faithfulness — B invented: My dissertation supervisor caught a structural flaw; My specific contribution was identifying the cause; I flagged the boundary issue to my supervisor; My supervisor confirmed the reasoning was sound and suggested how to frame it for the conclusion; I needed someone to stress-test the logic, not just validate that the code ran_

---

## q11 — Tell us about a time you failed at something. What did you learn and what would you do differently?
**Employer:** Citi | **Char limit:** 900

**Answer A**

Three weeks before my dissertation deadline, I found a data error that changed my main result.

One local authority was inflating my supply elasticity coefficient from 0.29 to 0.43. I'd been checking R-squared and hadn't plotted residuals. Once I traced it to a 2011 boundary revision distorting the planning data, I removed the observation, re-ran the model, and rewrote the argument entirely. The finding shifted from "supply is elastic" to "elasticity is highly heterogeneous." My supervisor said it was more interesting. I got 73.

The failure wasn't the error itself. It was the order of operations: I was interpreting coefficients before doing basic diagnostic checks. I'd treated a tidy R-squared as a green light.

I'd change that sequence. Residual plots first, every time, before I touch an interpretation.

**Answer B**

During my role as Treasurer of LSE Rowing Club in 2024–2025, I inherited an £800 deficit with limited visibility into spending patterns. Rather than making reactive cuts, I initially assumed the problem was simply overspending on events. I proposed across-the-board budget reductions without first analysing where money was actually going.

This approach proved ineffective. Within weeks, I realised I needed to understand the root causes. I conducted a detailed audit of supplier contracts and discovered we were significantly overpaying for boat maintenance and catering. I renegotiated those contracts directly with suppliers, emphasising our membership size and loyalty. Simultaneously, I secured new sponsorship rather than cutting member-facing activities.

The key lesson was that data precedes solutions. In finance, making assumptions without rigorous analysis leads to poor decisions.

_Pre-judge: A voice 5/5 detail 5/5 tells 0 | B voice 3/5 detail 4/5 tells 2 | better: **a**_

_Faithfulness — A invented: none_
_Faithfulness — B invented: initially assumed the problem was simply overspending on events; proposed across-the-board budget reductions without first analysing; overpaying for boat maintenance and catering; renegotiated those contracts directly with suppliers, emphasising our membership size and loyalty_

---

## q12 — Describe a setback you experienced. How did you analyse what went wrong and move forward?
**Employer:** Deutsche Bank | **Char limit:** 2000

**Answer A**

Three weeks before my dissertation deadline, I found that one local authority was driving my main result entirely.

I'd been tracking R-squared and treating a coefficient of 0.43 as a clean finding on housing supply elasticity. When I finally plotted the residuals, the outlier was obvious. Tracing it back, the cause was a 2011 boundary revision that had distorted the planning data for that authority. Once I understood that, the fix was straightforward: remove the outlier, re-run the panel regression in R, and reassess what the model was actually saying.

The coefficient dropped to 0.29, and the headline conclusion flipped. Instead of "supply is elastic," the honest finding was that elasticity is highly heterogeneous across local authorities, with boundary effects as a key confounder. That's a less tidy result, but it's the right one. My supervisor said it was more interesting. The dissertation came back at 73.

The harder lesson wasn't technical. I'd been checking the wrong diagnostic at the wrong stage, and that nearly sent a flawed argument into the final submission. The fix I made permanent was simple: residual plots before interpreting coefficients, not after. Sequence matters as much as method.

In a research or modelling context, a result that looks clean should probably prompt more scrutiny, not less. I carry that into every model I build now.

**Answer B**

During my first year at LSE, I received a 71 average—below the 75+ I'd targeted. I'd underestimated the jump from A-level to university-level problem-solving, particularly in the mathematical rigour required for proofs and derivations in core modules.

Rather than accept this as fixed, I analysed where I'd gone wrong. I reviewed my exam scripts and attended office hours with tutors, identifying that I was rushing through multi-step problems without checking intermediate steps and not building intuition around concepts before attempting applications. I also realised I'd relied too heavily on past papers without working through foundational textbooks first.

I restructured my approach for year two. I worked through core concepts systematically using supplementary texts, attempted problems before checking solutions, and built a formula sheet that forced me to understand *why* relationships held rather than memorising them. I also began attending smaller study groups, which exposed gaps I'd otherwise missed.

This paid off. My year-two average improved to 73+, and more importantly, I now approach unfamiliar technical material methodically—breaking problems into components, validating assumptions, and checking my work. This discipline has been directly useful in my research assistant role at LSE, where I caught inconsistencies in boundary revision data that would have corrupted the analysis. It's a habit I intend to apply to analytical work in finance, where accuracy compounds in importance.

_Pre-judge: A voice 5/5 detail 5/5 tells 0 | B voice 2/5 detail 3/5 tells 4 | better: **a**_

_Faithfulness — A invented: Tracing it back, the cause was a 2011 boundary revision that had distorted the planning data for that authority_
_Faithfulness — B invented: year-two average improved to 73+; A-level to university-level problem-solving; 75+ I'd targeted; 75+ threshold mentioned as personal target; office hours with tutors; smaller study groups; supplementary texts; foundational textbooks; formula sheet; exam scripts review_

---

## q13 — Discuss a current market trend or economic development that interests you and its implications for financial services.
**Employer:** Goldman Sachs | **Char limit:** 700

**Answer A**

Private credit has grown from a niche asset class to roughly $2 trillion globally, filling the gap left by tighter bank capital requirements after Basel III. For financial services, that shift matters in two ways. Banks are increasingly originating loans they once held, then distributing them to private funds rather than carrying the risk on balance sheet. That changes how advisory and structuring desks generate revenue. It also raises questions about systemic opacity, since much of this exposure sits outside traditional regulatory perimeters. At Rothschild I saw debt advisory work up close; understanding where capital actually comes from now feels central to that work.

**Answer B**

The UK's regional productivity divergence has captured my attention, particularly given my research work at LSE on this topic. ONS data reveal persistent gaps between London and peripheral regions, with implications for financial services that extend beyond traditional lending patterns.

Banks face a challenge in funding regional growth without simply concentrating capital in already-developed areas. This creates opportunity for structured products and regional development finance—areas where Goldman Sachs has significant expertise.

_Pre-judge: A voice 4/5 detail 3/5 tells 1 | B voice 2/5 detail 2/5 tells 3 | better: **a**_

_Faithfulness — A invented: Private credit has grown to roughly $2 trillion globally; tighter bank capital requirements after Basel III; Banks are increasingly originating loans they once held, then distributing them to private funds; debt advisory work on private credit and capital distribution_
_Faithfulness — B invented: Goldman Sachs has significant expertise in structured products and regional development finance; ONS data reveal persistent gaps between London and peripheral regions; implications for financial services that extend beyond traditional lending patterns; Banks face a challenge in funding regional growth without simply concentrating capital in already-developed areas_

---

## q14 — What recent news story or deal in the financial markets caught your attention and why?
**Employer:** Lazard | **Char limit:** 600

**Answer A**

The recent £15bn takeover of Wm Morrison by private equity consortium Apollo and Softbank in late 2024 caught my attention. What struck me was the structural tension between the consortium's operational improvements and inflation's erosion of supermarket margins—a dynamic I've studied in Industrial Organisation at LSE. The deal highlighted how financial engineering alone cannot offset secular pressures in low-margin sectors, and how debt financing strategies must account for macroeconomic headwinds.

**Answer B**

Nippon Steel's bid for US Steel caught my attention. A $14.9bn cross-border deal blocked by presidential order on national security grounds raised a question I kept returning to: where does industrial policy end and protectionism begin? For an adviser, that boundary matters. A transaction that clears every antitrust hurdle can still collapse on political risk that no comparable transaction analysis captures. That gap between valuation work and deal outcome is something I want to understand properly.

_Pre-judge: A voice 4/5 detail 4/5 tells 1 | B voice 5/5 detail 4/5 tells 0 | better: **b**_

_Faithfulness — A invented: £15bn takeover of Wm Morrison by Apollo and Softbank in late 2024; Morrison takeover involved private equity consortium Apollo and Softbank; Morrison takeover occurred in late 2024_
_Faithfulness — B invented: Nippon Steel's bid for US Steel; $14.9bn cross-border deal; blocked by presidential order on national security grounds; transaction analysis; comparable transaction analysis_

---

## q15 — Describe a time you handled significant pressure or multiple competing deadlines. How did you manage?
**Employer:** Jane Street | **Char limit:** 800

**Answer A**

Two deadlines landed in the same week. The rowing club accounts needed to be finalised, and I was running the Economics Society panel with a speaker who'd just dropped out three days before the event.

I split the week by task type: mornings for sponsor calls and speaker outreach, afternoons for the accounts. The club was 800 pounds down, so vague optimism wasn't an option. I audited every line, renegotiated the minibus contract, and ran a second subs sweep. The panel got a replacement speaker inside 72 hours.

Both came off. The deficit cleared, the tour ran with 24 members, and the panel drew 120 attendees. Keeping the two problems structurally separate, rather than letting them bleed into each other, was what made it work.

**Answer B**

During my time as Treasurer of LSE Rowing Club in 2024–2025, I managed competing priorities under real time pressure. The club faced an £800 deficit whilst I was simultaneously organising the summer tour for 24 members and overseeing day-to-day finances.

I tackled this systematically. First, I identified the root causes by reviewing supplier contracts line-by-line, then renegotiated terms with three key vendors to reduce costs. Concurrently, I secured additional sponsorship to bridge the remaining gap. Rather than juggling everything ad hoc, I created a simple spreadsheet tracking cash flow weekly and prioritised actions by impact—the sponsorship approach yielded results fastest.

The tour ran successfully within budget, and we eliminated the deficit by year-end.

_Pre-judge: A voice 4/5 detail 4/5 tells 1 | B voice 2/5 detail 3/5 tells 4 | better: **a**_

_Faithfulness — A invented: none_
_Faithfulness — B invented: renegotiated terms with three key vendors; created a simple spreadsheet tracking cash flow weekly; eliminated the deficit by year-end_

---

## q16 — Give an example of a challenging situation you faced. How did you stay focused and perform under pressure?
**Employer:** Citadel | **Char limit:** 900

**Answer A**

During my role as Treasurer of LSE Rowing Club in 2024–2025, I faced a significant financial challenge: the club had accumulated an £800 deficit with limited runway to resolve it. The situation required immediate action, as the summer tour—a core event for 24 members—was at risk.

I approached this systematically. First, I audited all supplier contracts and identified renegotiation opportunities, securing cost reductions with our main vendors. Simultaneously, I sourced new sponsorship by pitching to local businesses and alumni networks, emphasizing the club's track record and membership engagement. Within weeks, I had recovered the deficit and actually increased our budget for the summer tour.

What kept me focused was breaking the problem into discrete, measurable tasks rather than viewing it as one overwhelming challenge.

**Answer B**

Treasurer of LSE Rowing Club, I inherited an 800-pound deficit the week after exams ended. The previous treasurer had double-booked a minibus contract and undercollected membership fees. The committee's instinct was to cancel the summer tour entirely.

I didn't do that. I audited every line item, renegotiated the minibus contract for a 15% saving, ran a second membership sweep, and secured a small business sponsorship. Six weeks later the deficit was cleared. Twenty-four members went on tour, a four-year attendance record.

The pressure was real: a hard deadline, a sceptical committee, and no guarantee the sponsorship would come through. What kept me focused was breaking the problem into parts with clear owners and timelines rather than treating it as one overwhelming thing. Each lever was small; together they were enough.

_Pre-judge: A voice 3/5 detail 3/5 tells 2 | B voice 5/5 detail 4/5 tells 0 | better: **b**_

_Faithfulness — A invented: increased our budget for the summer tour_
_Faithfulness — B invented: none_

---

## q17 — What are your key strengths and how will they contribute to the role?
**Employer:** Schroders | **Char limit:** 300

**Answer A**

Quantitative analysis and working under pressure. A 73-average dissertation built on panel regression in R, plus Stata work at LSE's economics department, means I can handle real data from day one. I deliver when stakes are high.

**Answer B**

I possess strong quantitative foundations—I have worked with R, Python, Stata and SQL on real datasets during my LSE dissertation and research assistant role, giving me practical experience in econometric analysis and data manipulation.

_Pre-judge: A voice 4/5 detail 3/5 tells 0 | B voice 2/5 detail 2/5 tells 1 | better: **a**_

_Faithfulness — A invented: none_
_Faithfulness — B invented: none_

---

## q18 — Is there anything else you would like us to know about you that is not covered elsewhere in the application?
**Employer:** Rothschild & Co | **Char limit:** 300

**Answer A**

My dissertation uses panel regression in R to model housing supply elasticity across UK local authorities. That work sits closest to the advisory problems I saw during my week at Rothschild in June 2026. French at B2 rounds it out.

**Answer B**

I completed Rothschild & Co's Investment Banking Insight Programme in June 2026, where I shadowed the debt advisory team on a live infrastructure refinancing and contributed to transaction analysis. That experience reinforced my interest in the firm and this sector.

_Pre-judge: A voice 4/5 detail 4/5 tells 0 | B voice 2/5 detail 2/5 tells 2 | better: **a**_

_Faithfulness — A invented: none_
_Faithfulness — B invented: contributed to transaction analysis_

---

## q19 — Tell us about a commercial development in a sector that interests you and how it might affect the deal landscape.
**Employer:** Evercore | **Char limit:** 700

**Answer A**

Private credit's expansion into infrastructure is reshaping how assets get financed. With traditional bank lending constrained by capital rules, private credit funds have moved aggressively into the space, and deal structures that once went to syndicated loan markets are now being arranged bilaterally. That shift concentrates advisory mandates with banks that have strong debt structuring capability. At Rothschild I sat in on a live infrastructure refinancing and saw directly how the choice of financing route shapes the advisory work. For M&A, it means buyers with flexible private credit backing can move faster, which compresses timelines and puts a premium on rigorous, rapid valuation work.

**Answer B**

I'm particularly interested in the UK housing supply constraint and its implications for real estate finance. My dissertation examined housing supply elasticity across English local authorities using panel regression analysis, and the findings highlight a critical market dynamic: planning restrictions mean supply remains highly inelastic in high-demand areas, particularly the South East.

This creates structural opportunities in the deal landscape. Developers face persistent cost inflation and extended project timelines, which favours larger, well-capitalised operators who can absorb these pressures.

_Pre-judge: A voice 4/5 detail 3/5 tells 0 | B voice 3/5 detail 4/5 tells 1 | better: **a**_

_Faithfulness — A invented: Private credit's expansion into infrastructure; deal structures that once went to syndicated loan markets are now being arranged bilaterally; concentration of advisory mandates with banks that have strong debt structuring capability; buyers with flexible private credit backing can move faster; M&A timelines being compressed; premium on rigorous, rapid valuation work_
_Faithfulness — B invented: housing supply elasticity across English local authorities; planning restrictions mean supply remains highly inelastic in high-demand areas, particularly the South East; Developers face persistent cost inflation and extended project timelines; favours larger, well-capitalised operators_

---

## q20 — What experience, skill or interest outside of your degree makes you a distinctive candidate?
**Employer:** BlackRock | **Char limit:** 500

**Answer A**

Beyond my degree, I bring demonstrated technical depth and practical initiative. I've applied R and Stata to real research—cleaning ONS datasets as an LSE research assistant and running panel regressions for my dissertation on housing supply elasticity. I've extended this into Python and SQL. Outside academics, I've led operational improvements: as Treasurer of LSE Rowing Club, I resolved an £800 deficit through contract renegotiation and sponsorship, growing our summer tour to a record 24

**Answer B**

Treasurer of LSE Rowing Club from my first year. We had an 800-pound deficit and I renegotiated supplier contracts and secured sponsorship to clear it. The summer tour that followed was the largest in the club's history at 24 members. Running a real budget under pressure, where the numbers actually matter, taught me more about financial decision-making than any case study.

_Pre-judge: A voice 4/5 detail 4/5 tells 1 | B voice 5/5 detail 4/5 tells 0 | better: **b**_

_Faithfulness — A invented: none_
_Faithfulness — B invented: summer tour was the largest in the club's history; Treasurer from my first year_


---

## Blind key

q01: A=new, B=old
q02: A=old, B=new
q03: A=old, B=new
q04: A=old, B=new
q05: A=old, B=new
q06: A=new, B=old
q07: A=old, B=new
q08: A=old, B=new
q09: A=old, B=new
q10: A=old, B=new
q11: A=new, B=old
q12: A=new, B=old
q13: A=new, B=old
q14: A=old, B=new
q15: A=new, B=old
q16: A=old, B=new
q17: A=new, B=old
q18: A=new, B=old
q19: A=new, B=old
q20: A=old, B=new
