# UK Finance Summer Internship — Source Research & Activation Plan

**Cycle:** uk-finance-2027 · **As of:** 2026-06-05 · **Employers researched:** 24
**Machine-readable config:** [`src/ingestion/source-plans/uk-finance-2027.json`](../../src/ingestion/source-plans/uk-finance-2027.json)

This is the **planning layer**. It tells the execution system, per employer, *where to look, what kind of source it is, how to extract, how to detect change, how confident we are, and whether it may be auto-published*. It does **not** scrape at scale, log in, submit forms, or apply — every classification below is tied to evidence observed on **public** pages only.

---

## Methodology & guardrails

- **Plan before execute** — no source is recommended for monitoring until it is researched and classified.
- **Official source first** — employer ATS / careers endpoints over LinkedIn, aggregators, or third-party trackers.
- **Deterministic first** — official API → public JSON → hidden XHR → structured/HTML parse → page-level change detection as a last resort.
- **Traceability & no false confidence** — each plan records the concrete markers seen *and* what could not be verified live. Where a page was JS-rendered, bot-gated (HTTP 403 / Imperva / "Quick Check"), or required login, that is stated and the confidence/activation reflect it.
- **Guardrails honoured throughout:** no logins, no account creation, no form submission, no applications, no brittle automation where a deterministic path exists.

Research was performed by six parallel agents (4 employers each), each doing live `WebSearch`/`WebFetch` against the official surfaces.

---

## Portfolio summary

| # | Employer | Source type | Extraction | Relevance | Poll (min) | Conf. | Activation |
|---|----------|-------------|-----------|-----------|-----------:|------:|-----------|
| 1 | Goldman Sachs | custom_html (SPA `higher.gs.com`) | html_parser | high | 60 | 0.55 | manual_review_required |
| 2 | Morgan Stanley | workday (`ms.wd5`) | public_json_endpoint | high | 60 | 0.78 | auto + light checks |
| 3 | J.P. Morgan | oracle_cloud (`jpmc.fa`) | public_json_endpoint | high | 60 | **0.90** | auto + light checks |
| 4 | Bank of America | tal_net (campus) | html_parser | high | 60 | 0.60 | manual_review_required |
| 5 | Citi | custom_json (TalentBrew/Eightfold) | html_parser | high | 60 | 0.82 | auto + light checks |
| 6 | Barclays | workday (`barclays.wd3`) | public_json_endpoint | high | 60 | **0.90** | auto + light checks |
| 7 | UBS | custom_html (Avature) | html_parser | high | 60 | 0.80 | auto + light checks |
| 8 | Deutsche Bank | custom_html (SPA + recsolu) | monitored_change_detection_only | high | 360 | 0.55 | manual_review_required |
| 9 | HSBC | custom_json (Eightfold) | public_json_endpoint | high | 60 | 0.78 | auto + light checks |
| 10 | Nomura | tal_net | html_parser | high | 60 | 0.80 | auto + light checks |
| 11 | Jefferies | tal_net | html_parser | high | 60 | 0.82 | auto + light checks |
| 12 | Macquarie | custom_html (Avature) | html_parser | high | 60 | 0.76 | auto + light checks |
| 13 | Rothschild & Co | tal_net | html_parser | high | 60 | 0.86 | auto + light checks |
| 14 | Evercore | tal_net | html_parser | high | 60 | 0.83 | auto + light checks |
| 15 | Lazard | tal_net | html_parser | high | 60 | 0.85 | auto + light checks |
| 16 | BlackRock | custom_html (TalentBrew) | html_parser | high | 360 | 0.62 | manual_review_required |
| 17 | Schroders | oracle_cloud (`ekbq.fa`) | public_json_endpoint | high | 60 | 0.86 | auto + light checks |
| 18 | Fidelity International | tal_net | html_parser | medium | 360 | 0.74 | manual_review_required |
| 19 | Man Group | greenhouse (`mangroup`) | official_api | high | 60 | **0.90** | auto + light checks |
| 20 | Blackstone | workday (`blackstone.wd1`) | public_json_endpoint | high | 60 | 0.88 | auto + light checks |
| 21 | Citadel | custom_html (self-hosted; sitemap-enumerable) | html_parser | high | 360 | 0.65 | auto + light checks |
| 22 | Citadel Securities | custom_html (self-hosted; sitemap-enumerable) | html_parser | high | 360 | 0.65 | auto + light checks |
| 23 | Jane Street | custom_html (GH excludes interns) | hidden_xhr_or_fetch | high | 60 | 0.62 | auto + light checks |
| 24 | Point72 | greenhouse (`point72`) | official_api | high | 15 | **0.90** | auto + light checks |

**Activation split:** 19 `auto_publish_with_light_checks`, 5 `manual_review_required`, 0 `do_not_activate`.
**Cleanest deterministic feeds (activate first):** J.P. Morgan (Oracle REST, live-verified), Barclays + Blackstone + Morgan Stanley (Workday CXS), Schroders (Oracle Fusion CE), Man Group + Point72 (Greenhouse public API).

---

## Recommended cuts, keeps & additions

**Keep all 24** — every employer is genuinely in scope for UK finance summer internships and has an official, identifiable source surface. Two corrections to seed data and several "keep but watch" flags:

- **Seed URL fix — Citi:** the DB URL `https://www.citigroup.com/global/early-careers` returns **HTTP 404**. The live early-careers surface is **`https://jobs.citi.com/`** (TalentBrew front-end, Eightfold search). The dataset should be updated.
- **Seed URL fix — several:** Goldman (`higher.gs.com`), Bank of America (`careers.bankofamerica.com`), UBS (`jobs.ubs.com`), Macquarie (`recruitment.macquarie.com`), Blackstone (`blackstone.wd1.myworkdayjobs.com`) all have a *listings* surface distinct from the marketing URL currently stored. The JSON config carries the corrected listings pages.
- **Resolved — Citadel & Citadel Securities (was `unknown`):** a follow-up pass found the HTTP 403 was a Cloudflare *user-agent* block, not a missing source. Both run **self-hosted custom careers sites** (on-domain application; Greenhouse tokens 404) and expose a **public `career-sitemap.xml` that loads fine and deterministically enumerates every role** (34 / 73 detail URLs, `lastmod 2026-06-05`, incl. London/Europe interns). Reclassified to `custom_html` / `html_parser`, confidence 0.65, `auto_publish_with_light_checks`. The Workday/Ashby search "hits" remain confirmed **false positives** (unrelated firms; "Citadel AI" is separate). Light check: the execution layer must fetch detail pages with a compliant browser UA (the sitemap enumerates; the detail pages are SEO-rendered and public).
- **Watch — Jane Street:** the Greenhouse board (`janestreet`) is live but contains **only experienced/new-grad roles**; internships are on the custom `janestreet.com` open-roles surface. Do not point an adapter at Greenhouse for interns.

**Candidate additions to research next** (not yet researched — would need their own pass before any source plan): elite boutiques **PJT Partners, Centerview, Moelis, Perella Weinberg, Houlihan Lokey, Greenhill**; buy-side / quant **Wellington, PIMCO, Marshall Wace, Millennium, Balyasny, Brevan Howard, Capula, Squarepoint, G-Research, XTX Markets, Optiver, IMC, DRW, SIG, Jump Trading**; PE **KKR, Apollo, Carlyle, CVC, EQT, Permira, Ares, Brookfield, Bain Capital**; banks **BNP Paribas, SocGen, MUFG, Mizuho, Standard Chartered, RBC Capital Markets, Wells Fargo**. Many quant/market-maker firms run Greenhouse/Lever/Ashby (deterministic, high-value) and would slot in cleanly. Say the word and I'll run the same research pass on a chosen subset.

---

## Per-employer source plans

Each section follows the required output structure. The final JSON is shown compactly here; the canonical, fully-fielded objects (with `evidence`, `uncertainty`, `validation_rules`, `change_detection`, `fallback_method`) live in the [JSON config](../../src/ingestion/source-plans/uk-finance-2027.json).

### 1. Goldman Sachs

**Assessment.** Strong, official source — GS publishes EMEA/London Summer Analyst programmes and per-role pages on its self-hosted `higher.gs.com` platform. It is a client-side SPA with no observed public JSON feed, so extraction is harder than a standard ATS and it is held to manual review.

| Field | Value |
|---|---|
| Employer | Goldman Sachs |
| Official careers homepage | https://www.goldmansachs.com/careers |
| Student / internships page | https://www.goldmansachs.com/careers/students/programs-and-internships/emea/summer-analyst-programme |
| Listings page | https://higher.gs.com/ (roles at `/roles/<id>`) |
| Source type | custom_html |
| Evidence for source type | Self-hosted `higher.gs.com`; deterministic `/roles/<numeric_id>` URLs (139290, 145646, 137473…). No Workday/Greenhouse/Lever/Ashby/Taleo/Oracle host. SPA returned title-only to fetch; no JSON-LD or jobs endpoint observed. |
| Extraction method | html_parser |
| Scope relevance | high |
| Recommended polling frequency | 60 min |
| Confidence score | 0.55 |
| Activation status | manual_review_required |

**Validation rules**
- Role URL must match `higher.gs.com/roles/<digits>`; reject off-host.
- Must be Summer Analyst/Internship AND London/UK/EMEA; drop full-time/lateral and non-UK.
- Confirm penultimate/final-year eligibility before classifying as summer internship.
- Treat 404/expired role pages as removals only after 2 consecutive misses.

**Change detection plan**
- **Unique key:** numeric role id from `/roles/<id>` (apply_url secondary).
- **New:** unseen `/roles/<id>` in the rendered London/Internship result set.
- **Update:** content_hash_diff on title/location/description for a known id.
- **Removal:** id 404s / dropped from results across 2 polls.
- **Notes:** SPA → needs headless render or a discovered XHR to enumerate ids; first/last_seen trackable per id; removal best-effort.

**Final JSON** — `{"employer":"Goldman Sachs","source_type":"custom_html","extraction_method":"html_parser","scope_relevance":"high","poll_frequency_minutes":60,"confidence_score":0.55,"activation_status":"manual_review_required","change_detection":{"strategy":"page_change_trigger_then_reparse","unique_key":"/roles/<id>"},"fallback_method":"monitored_change_detection_only"}` (full object in config)

### 2. Morgan Stanley

**Assessment.** Strong, official, structured — Workday tenant `ms` with London/Glasgow summer-analyst roles. Complication: a **legacy Taleo and Workday run simultaneously** (migration), so the canonical feed must be pinned to Workday and de-duped against Taleo.

| Field | Value |
|---|---|
| Employer | Morgan Stanley |
| Official careers homepage | https://www.morganstanley.com/careers |
| Student / internships page | https://www.morganstanley.com/people-opportunities/students-graduates |
| Listings page | https://ms.wd5.myworkdayjobs.com/External |
| Source type | workday |
| Evidence for source type | Workday host `ms.wd5.myworkdayjobs.com` site `External` (req pattern `JR<digits>`). Also live legacy `ms.taleo.net/careersection/2`. Two ATS hosts = migration. |
| Extraction method | public_json_endpoint |
| Scope relevance | high |
| Recommended polling frequency | 60 min |
| Confidence score | 0.78 |
| Activation status | auto_publish_with_light_checks |

**Validation rules**
- Pin to Workday tenant `ms` site `External` via **POST** `/wday/cxs/ms/External/jobs`.
- Filter to summer/intern titles AND {London, Glasgow, United Kingdom}.
- De-dupe against `ms.taleo.net`; prefer the Workday record.
- Treat Taleo as legacy/secondary — surface only if absent from Workday.

**Change detection plan**
- **Unique key:** Workday `JR<digits>` (Taleo `job=<digits>` secondary).
- **New:** JR id not previously seen for UK + intern facets.
- **Update:** content_hash_diff on title/location/postedOn.
- **Removal:** JR id absent across 2 polls / page 404.
- **Notes:** CXS JSON gives stable ids + postedOn + externalPath; GET returned 400 — endpoint needs a POST body (confirm shape before activation).

**Final JSON** — `{"employer":"Morgan Stanley","source_type":"workday","extraction_method":"public_json_endpoint","scope_relevance":"high","poll_frequency_minutes":60,"confidence_score":0.78,"activation_status":"auto_publish_with_light_checks","change_detection":{"strategy":"job_id_diff","unique_key":"Workday JR<digits>"},"fallback_method":"structured_data_parser"}`

### 3. J.P. Morgan

**Assessment.** **Highest-confidence source in the set.** JPM runs Oracle Cloud HCM and exposes a **public, unauthenticated REST JSON endpoint that returned live data** (7,171 reqs; London facet 517; "summer internship" → 47 reqs). Deterministic and auto-publish-grade.

| Field | Value |
|---|---|
| Employer | J.P. Morgan |
| Official careers homepage | https://careers.jpmorgan.com/global/en/students |
| Student / internships page | https://www.jpmorganchase.com/careers/explore-opportunities/students-and-graduates |
| Listings page | https://jpmc.fa.oraclecloud.com/hcmUI/CandidateExperience/en/sites/CX_1001 |
| Source type | oracle_cloud |
| Evidence for source type | Host `jpmc.fa.oraclecloud.com`, site `CX_1001`. **Verified live** REST `…/recruitingCEJobRequisitions?finder=findReqs;siteNumber=CX_1001` → JSON (total 7171, London 517, summer-internship 47). No login required. |
| Extraction method | public_json_endpoint |
| Scope relevance | high |
| Recommended polling frequency | 60 min |
| Confidence score | 0.90 |
| Activation status | auto_publish_with_light_checks |

**Validation rules**
- Query `recruitingCEJobRequisitions` with `finder=findReqs;siteNumber=CX_1001`, paginate `limit`/`offset`, never authenticate.
- Filter UK by PrimaryLocation/secondaryLocations contains London/United Kingdom + Summer Analyst/Internship.
- Fetch detail by `Id` for full location/eligibility before publishing.
- Reject non-summer (off-cycle/full-time/Spring Insight) and non-UK rows.

**Change detection plan**
- **Unique key:** Oracle requisition `Id` (numeric).
- **New:** Id absent from prior UK+summer set. **Update:** content_hash_diff on Title/PrimaryLocation/PostedDate. **Removal:** Id not returned across 2 polls.
- **Notes:** stable Id + PostedDate → clean first/last_seen; paginated & facetable → clean diffs.

**Final JSON** — `{"employer":"J.P. Morgan","source_type":"oracle_cloud","extraction_method":"public_json_endpoint","scope_relevance":"high","poll_frequency_minutes":60,"confidence_score":0.9,"activation_status":"auto_publish_with_light_checks","change_detection":{"strategy":"job_id_diff","unique_key":"Oracle requisition Id"},"fallback_method":"structured_data_parser"}`

### 4. Bank of America

**Assessment.** Official and relevant (live London Summer Analyst roles), but the **campus apply surface is `tal.net` (login-gated)** and student listings render via a JS front-end whose backing API was not observed — so it is held to manual review. The lateral Workday tenant (`ghr.wd1`) is a separate system and must not be mixed in.

| Field | Value |
|---|---|
| Employer | Bank of America |
| Official careers homepage | https://careers.bankofamerica.com/en-us |
| Student / internships page | https://careers.bankofamerica.com/en-us/students |
| Listings page | https://careers.bankofamerica.com/en-us/students/job-search |
| Source type | tal_net |
| Evidence for source type | Campus apply on `bankcampuscareers.tal.net/candidate`. Lateral uses Workday `ghr.wd1.myworkdayjobs.com` (separate). Student job-detail URLs `…/students/job-detail/13355/…`. Front-end JS-rendered (fetch 404/empty). |
| Extraction method | html_parser |
| Scope relevance | high |
| Recommended polling frequency | 60 min |
| Confidence score | 0.60 |
| Activation status | manual_review_required |

**Validation rules**
- Source from `careers.bankofamerica.com/en-us/students/job-search`; key on job-detail id (e.g. 13355). **Do not log into** `bankcampuscareers.tal.net`.
- Filter Summer Analyst/Intern AND London/UK; reject full-time and lateral roles.
- Never mix lateral Workday `ghr` with campus roles.
- Treat the tal.net candidate portal as apply-only/login-gated — never enumerate behind auth.

**Change detection plan**
- **Unique key:** numeric job-detail id in the careers URL (apply_url secondary).
- **New/Update/Removal:** unseen id appears / content_hash_diff / id 404s across 2 polls.
- **Notes:** JS-rendered front-end → needs headless render or backing search XHR; backing listings API not observed live.

**Final JSON** — `{"employer":"Bank of America","source_type":"tal_net","extraction_method":"html_parser","scope_relevance":"high","poll_frequency_minutes":60,"confidence_score":0.6,"activation_status":"manual_review_required","change_detection":{"strategy":"page_change_trigger_then_reparse","unique_key":"careers job-detail id"},"fallback_method":"monitored_change_detection_only"}`

### 5. Citi

**Assessment.** High-value source with clear London Summer Analyst/Internship roles. **Seed URL is dead (404)** — corrected to `jobs.citi.com` (TalentBrew front-end, Eightfold search). A public Eightfold PCSX JSON pattern exists but raw GET returned 403, so stay on the public HTML/TalentBrew surface.

| Field | Value |
|---|---|
| Employer | Citi |
| Official careers homepage | https://jobs.citi.com/ (seed `citigroup.com/global/early-careers` → 404) |
| Student / internships page | https://jobs.citi.com/early-careers |
| Listings page | https://jobs.citi.com/search-jobs |
| Source type | custom_json |
| Evidence for source type | TalentBrew (`tbcdn.talentbrew.com/company/287`; id 287 in job URLs `/job/london/…/287/<id>`). Eightfold search (`citi.eightfold.ai`, "Match Me, powered by Eightfold"). PCSX pattern exists; GET 403 (token-gated). Facets: Internship 24, Summer Analyst 14. |
| Extraction method | html_parser |
| Scope relevance | high |
| Recommended polling frequency | 60 min |
| Confidence score | 0.82 |
| Activation status | auto_publish_with_light_checks |

**Validation rules**
- Job URL must match `jobs.citi.com/job/<city>/<slug>/287/<id>`; reject other hosts.
- UK city (London/Belfast) + summer-internship title + summer 2026/2027.
- Cross-check TalentBrew count vs Eightfold PCSX count; if diverging >20%, queue manual review.
- Require a same-host apply URL.

**Change detection plan**
- **Unique key:** numeric Citi req id (trailing URL segment, e.g. 86241846896).
- **New/Update/Removal:** id appears / content_hash_diff / absent for 2 polls (debounce 403s).
- **Notes:** first/last_seen per req id; do not authenticate to Eightfold.

**Final JSON** — `{"employer":"Citi","source_type":"custom_json","extraction_method":"html_parser","scope_relevance":"high","poll_frequency_minutes":60,"confidence_score":0.82,"activation_status":"auto_publish_with_light_checks","change_detection":{"strategy":"job_id_diff","unique_key":"Citi req id"},"fallback_method":"monitored_change_detection_only"}`

### 6. Barclays

**Assessment.** Excellent, deterministic source — `search.jobs.barclays` is a TalentBrew front-end **backed by Workday** (`barclays.wd3`), exposing the standard public CXS JSON. The seed assumption of tal.net is wrong.

| Field | Value |
|---|---|
| Employer | Barclays |
| Official careers homepage | https://search.jobs.barclays/ |
| Student / internships page | https://search.jobs.barclays/early-careers |
| Listings page | https://barclays.wd3.myworkdayjobs.com/External_Career_Site_Barclays |
| Source type | workday |
| Evidence for source type | Apply links resolve to `barclays.wd3.myworkdayjobs.com/External_Career_Site_Barclays/login`. TalentBrew front-end; job URL `/job/<city>/<title>/13015/<id>`. CXS GET 400 (needs POST). Legacy `barclays.taleo.net` also surfaced. |
| Extraction method | public_json_endpoint |
| Scope relevance | high |
| Recommended polling frequency | 60 min |
| Confidence score | 0.90 |
| Activation status | auto_publish_with_light_checks |

**Validation rules**
- POST CXS `/wday/cxs/barclays/External_Career_Site_Barclays/jobs`; parse `jobPostings[]`.
- Keep UK `locationsText` + summer/internship/insight titles; exclude full-time grad and non-UK.
- Resolve `externalPath` and require 200.
- Flag if apply routes to legacy `barclays.taleo.net`.

**Change detection plan**
- **Unique key:** Workday `externalPath` slug + numeric req id (`13015/<id>`).
- **New/Update/Removal:** id appears / content_hash_diff / absent for 2 polls.
- **Notes:** `postedOn` aids first_seen; paginate offset/limit fully.

**Final JSON** — `{"employer":"Barclays","source_type":"workday","extraction_method":"public_json_endpoint","scope_relevance":"high","poll_frequency_minutes":60,"confidence_score":0.9,"activation_status":"auto_publish_with_light_checks","change_detection":{"strategy":"job_id_diff","unique_key":"Workday externalPath + req id"},"fallback_method":"html_parser"}`

### 7. UBS

**Assessment.** Good official source with clearly relevant UK summer internships, but the listing/apply system is **Avature** (`jobs.ubs.com`, TGnewUI) with no public JSON feed — extraction is HTML-parsing of the Avature graduate board (siteid 5131).

| Field | Value |
|---|---|
| Employer | UBS |
| Official careers homepage | https://www.ubs.com/global/en/careers.html |
| Student / internships page | https://www.ubs.com/global/en/careers/early-careers/summer-internship-program.html |
| Listings page | https://jobs.ubs.com/TGnewUI/Search/Home/Home?partnerid=25008&siteid=5131 |
| Source type | custom_html |
| Evidence for source type | All apply CTAs resolve to `jobs.ubs.com/TGnewUI/Search/…?partnerid=25008&siteid=5131` — canonical Avature signature (5131=graduates, 5012=experienced, 5050=German). No Workday/Taleo/Oracle host. |
| Extraction method | html_parser |
| Scope relevance | high |
| Recommended polling frequency | 60 min |
| Confidence score | 0.80 |
| Activation status | auto_publish_with_light_checks |

**Validation rules**
- Restrict crawl to `jobs.ubs.com` siteid=5131; ignore 5012/5050.
- UK office + summer internship/analyst/industrial placement titles; exclude off-cycle/full-time grad unless flagged.
- Each role needs a stable Avature JobDetail URL that 200s.
- Re-resolve rotating per-campaign `LinkID`s.

**Change detection plan**
- **Unique key:** Avature requisition id from JobDetail URL (fallback: title + UK location + program year).
- **New/Update/Removal:** id appears in 5131 set / content_hash_diff / absent for 2 polls or marked closed.
- **Notes:** track first/last_seen locally; apply is login-gated (listings public — stop at listing).

**Final JSON** — `{"employer":"UBS","source_type":"custom_html","extraction_method":"html_parser","scope_relevance":"high","poll_frequency_minutes":60,"confidence_score":0.8,"activation_status":"auto_publish_with_light_checks","change_detection":{"strategy":"apply_url_diff","unique_key":"Avature requisition id"},"fallback_method":"monitored_change_detection_only"}`

### 8. Deutsche Bank

**Assessment.** Official and relevant, but the **lowest-confidence of the banks** — the student programme catalog is a bespoke hash-routed SPA on `careers.db.com` with no observable feed, and some apply flows route to a third-party host (`db.recsolu.com`, Yello/Rakuna). Monitor for change and route to manual review until a data endpoint is verified.

| Field | Value |
|---|---|
| Employer | Deutsche Bank |
| Official careers homepage | https://careers.db.com/ |
| Student / internships page | https://careers.db.com/students-graduates/internship-programme/ |
| Listings page | https://careers.db.com/students-graduates/search-programmes/index?language_id=1 |
| Source type | custom_html |
| Evidence for source type | SPA with hash routing (`#/graduate/`); listings render client-side, no JSON/GraphQL/ATS host/JSON-LD across two fetches. Some apply links → `db.recsolu.com/external/requisitions/.../new_candidate`. |
| Extraction method | monitored_change_detection_only |
| Scope relevance | high |
| Recommended polling frequency | 360 min |
| Confidence score | 0.55 |
| Activation status | manual_review_required |

**Validation rules**
- Do not auto-publish until the SPA's backing JSON/XHR is identified; until then detect change → manual review queue.
- UK & Ireland + Internship Programme; exclude Insight programmes (Spring into Banking, GROW, Rise, Advance) unless separately categorized.
- If apply resolves to `db.recsolu.com`, capture the `/external/requisitions/<id>/` id as an anchor; never proceed into `new_candidate`.
- Require region + programme-year before any publish.

**Change detection plan**
- **Unique key:** `careers.db.com` programme path + recsolu requisition id when present (fallback content_hash of rendered card).
- **New/Update/Removal:** new path appears / content_hash_diff of programme page / path 404s for 2 polls.
- **Notes:** run detection on the rendered DOM, not raw HTML; track first/last_seen locally.

**Final JSON** — `{"employer":"Deutsche Bank","source_type":"custom_html","extraction_method":"monitored_change_detection_only","scope_relevance":"high","poll_frequency_minutes":360,"confidence_score":0.55,"activation_status":"manual_review_required","change_detection":{"strategy":"page_change_trigger_then_reparse","unique_key":"programme path + recsolu id"},"fallback_method":"manual_review_required"}`

### 9. HSBC

**Assessment.** Strong official source — student/intern programmes route through an **Eightfold AI** portal (`hsbc.eightfold.ai`) exposing a documented public positions JSON; downstream apply is on SuccessFactors. Off-season returns count 0, which must be treated as a valid empty state, not a failure.

| Field | Value |
|---|---|
| Employer | HSBC |
| Official careers homepage | https://www.hsbc.com/careers/students-and-graduates |
| Student / internships page | https://www.hsbc.com/careers/students-and-graduates/internships |
| Listings page | https://hsbc.eightfold.ai/careers |
| Source type | custom_json |
| Evidence for source type | Eightfold host `hsbc.eightfold.ai`; config `hide_eightfold_branding:true`; PCS endpoints (`/api/apply/v2/…?domain=hsbc.com`); search returns a `positions` array with `count`. Apply via `apply.careers.hsbc.com` + `career2.successfactors.eu`. Legacy `hsbc.taleo.net` is a separate older surface. |
| Extraction method | public_json_endpoint |
| Scope relevance | high |
| Recommended polling frequency | 60 min |
| Confidence score | 0.78 |
| Activation status | auto_publish_with_light_checks |

**Validation rules**
- Query Eightfold positions filtered by UK/London + intern/student; treat empty `positions:[]` as valid "no openings".
- Confirm SUMMER INTERNSHIP (not graduate/apprenticeship/off-cycle/full-time) and UK-located.
- Require finance/banking business area (GBM, Markets, Banking); exclude tech-only/ops unless finance-relevant.
- Verify a live apply URL on `apply.careers.hsbc.com`; reject talent-network-join-only results.

**Change detection plan**
- **Unique key:** Eightfold position id (pid); fallback canonical apply URL.
- **New/Update/Removal:** pid appears / pid changed (apply_url_diff secondary) / pid absent across N polls (debounce pagination).
- **Notes:** pin sort + page size (ranking is nondeterministic); distinguish "season closed" from "feed broken".

**Final JSON** — `{"employer":"HSBC","source_type":"custom_json","extraction_method":"public_json_endpoint","scope_relevance":"high","poll_frequency_minutes":60,"confidence_score":0.78,"activation_status":"auto_publish_with_light_checks","change_detection":{"strategy":"job_id_diff","unique_key":"Eightfold pid"},"fallback_method":"html_parser"}`

### 10. Nomura

**Assessment.** Clean, official structured source — dedicated `nomuracampus.tal.net` campus board with stable per-vacancy opportunity IDs and explicit summer-internship listings. Off-season the snapshot skewed to continental EU/Sydney; UK roles are seasonal.

| Field | Value |
|---|---|
| Employer | Nomura |
| Official careers homepage | https://www.nomura.com/careers/ |
| Student / internships page | https://www.nomura.com/careers/early-careers/internship-programs/ |
| Listings page | https://nomuracampus.tal.net/candidate/jobboard/vacancy/1/adv/ |
| Source type | tal_net |
| Evidence for source type | Host `nomuracampus.tal.net`, board `/candidate/jobboard/vacancy/1/adv/`, vacancy `/candidate/so/pm/1/pl/1/opp/<ID>-<title>/en-GB`. Live board: 6 internship vacancies with opp IDs, titles, locations, deadlines. |
| Extraction method | html_parser |
| Scope relevance | high |
| Recommended polling frequency | 60 min |
| Confidence score | 0.80 |
| Activation status | auto_publish_with_light_checks |

**Validation rules**
- Parse the advanced job board; extract opp ID, title, location, deadline.
- Geo-filter UK/London + summer-internship titles; exclude off-cycle/grad/non-UK (Paris/Frankfurt/Zurich/Sydney seen).
- Require finance scope (IB, Global Markets).
- Validate each `/opp/<ID>/en-GB` detail page; retry on the "Quick Check" interstitial rather than emit zero.

**Change detection plan**
- **Unique key:** tal.net opportunity numeric ID.
- **New/Update/Removal:** opp ID appears / content_hash_diff / drops off board or deadline passes.
- **Notes:** stable numeric IDs → good first/last_seen; mind the bot/verification interstitial.

**Final JSON** — `{"employer":"Nomura","source_type":"tal_net","extraction_method":"html_parser","scope_relevance":"high","poll_frequency_minutes":60,"confidence_score":0.8,"activation_status":"auto_publish_with_light_checks","change_detection":{"strategy":"job_id_diff","unique_key":"tal.net opp id"},"fallback_method":"monitored_change_detection_only"}`

### 11. Jefferies

**Assessment.** Excellent official source with strong UK signal — `jefferies.tal.net` carries live 2026 London IB / Private Credit **summer** internships with stable opp IDs (e.g. 1637, 1640). Main operational caveat is the tal.net "Quick Check" interstitial.

| Field | Value |
|---|---|
| Employer | Jefferies |
| Official careers homepage | https://www.jefferies.com/careers/ |
| Student / internships page | https://www.jefferies.com/careers/students-and-graduates/ |
| Listings page | https://jefferies.tal.net/candidate/jobboard/vacancy/2/adv |
| Source type | tal_net |
| Evidence for source type | Host `jefferies.tal.net`; board `vacancy/2/adv`; vacancy `…/brand-4/candidate/so/pm/1/pl/2/opp/<ID>-<title>/en-GB`. Live London summer opps 1637 (IB) and 1640 (Private Credit), plus off-cycle/analyst. Direct fetch hit "Quick Check". |
| Extraction method | html_parser |
| Scope relevance | high |
| Recommended polling frequency | 60 min |
| Confidence score | 0.82 |
| Activation status | auto_publish_with_light_checks |

**Validation rules**
- Parse the job board; extract opp ID, title, location.
- Keep UK/London + "Summer Internship"; exclude Off Cycle, Analyst/Graduate, full-time.
- Map finance division (IB, Private Credit, S&T, Research); flag non-finance.
- Validate `/opp/<ID>/en-GB`; retry the Quick Check interstitial (never emit false zero).

**Change detection plan**
- **Unique key:** tal.net opportunity numeric ID (e.g. 1637).
- **New/Update/Removal:** new opp ID / content_hash_diff / disappears or deadline passes.
- **Notes:** numeric IDs cleanly separate summer vs off-cycle vs analyst; mind the bot-check.

**Final JSON** — `{"employer":"Jefferies","source_type":"tal_net","extraction_method":"html_parser","scope_relevance":"high","poll_frequency_minutes":60,"confidence_score":0.82,"activation_status":"auto_publish_with_light_checks","change_detection":{"strategy":"job_id_diff","unique_key":"tal.net opp id"},"fallback_method":"monitored_change_detection_only"}`

### 12. Macquarie

**Assessment.** Strong official source on **Avature** (`recruitment.macquarie.com`) with structured SearchJobs and stable JobDetail IDs. **Important:** the ATS is Avature, *not* the `mq.wd3.myworkdayjobs.com` Workday tenant (that is Macquarie University, unrelated). Heavy filtering needed (472 total roles).

| Field | Value |
|---|---|
| Employer | Macquarie |
| Official careers homepage | https://www.macquarie.com/uk/en/careers/graduates-and-interns.html |
| Student / internships page | https://www.macquarie.com/uk/en/careers/graduates-and-interns/our-programmes.html |
| Listings page | https://recruitment.macquarie.com/en_US/careers/SearchJobs |
| Source type | custom_html |
| Evidence for source type | Avature host `recruitment.macquarie.com`; paths `/careers/SearchJobs`, `/careers/JobDetail/<slug>/<id>`, `/careers/ApplicationMethods?jobId=…`, `/careers/AgentRegister`; `jobRecordsPerPage`/`jobOffset` pagination ("1-9 of 472"). No public JSON/RSS. |
| Extraction method | html_parser |
| Scope relevance | high |
| Recommended polling frequency | 60 min |
| Confidence score | 0.76 |
| Activation status | auto_publish_with_light_checks |

**Validation rules**
- Query SearchJobs with internship + UK facet; paginate `jobRecordsPerPage`/`jobOffset`.
- Keep UK/London Summer Internship Programme; exclude grad/junior-associate/off-cycle/non-UK (Sao Paulo seen).
- Require finance scope (Macquarie Capital, Commodities & Global Markets).
- Validate JobDetail `<id>` resolves live (example 18132 404'd — IDs cycle); confirm `ApplicationMethods` apply path.

**Change detection plan**
- **Unique key:** Avature JobDetail numeric jobId (+ record id).
- **New/Update/Removal:** jobId appears / content_hash_diff (apply_url_diff secondary) / SearchJobs drop or JobDetail 404.
- **Notes:** 404 on cycled ids = removal signal; SearchJobs is source of truth.

**Final JSON** — `{"employer":"Macquarie","source_type":"custom_html","extraction_method":"html_parser","scope_relevance":"high","poll_frequency_minutes":60,"confidence_score":0.76,"activation_status":"auto_publish_with_light_checks","change_detection":{"strategy":"job_id_diff","unique_key":"Avature jobId"},"fallback_method":"monitored_change_detection_only"}`

### 13. Rothschild & Co

**Assessment.** Strong, high-value source — multiple verified 2026 UK summer-analyst programmes (Global Advisory, Wealth Management, Debt Advisory & Restructuring, Global Markets Solutions) on `rothschildandco.tal.net` with stable opp IDs.

| Field | Value |
|---|---|
| Employer | Rothschild & Co |
| Official careers homepage | https://www.rothschildandco.com/en/careers/ |
| Student / internships page | https://www.rothschildandco.com/en/careers/students-and-graduates/opportunities/ |
| Listings page | https://rothschildandco.tal.net/candidate/jobboard/vacancy/2/adv/ |
| Source type | tal_net |
| Evidence for source type | `rothschildandco.tal.net`; opp URLs with stable IDs: `opp/833` (2026 UK Global Advisory Summer Analyst), `opp/846` (Debt Advisory & Restructuring), `opp/848` (Global Markets Solutions); also `/candidate/postings/<id>`. |
| Extraction method | html_parser |
| Scope relevance | high |
| Recommended polling frequency | 60 min |
| Confidence score | 0.86 |
| Activation status | auto_publish_with_light_checks |

**Validation rules**
- UK/London + summer-internship/analyst terms; exclude lateral/off-cycle/full-time/non-UK.
- Require a resolvable `opp/<numeric_id>`.
- Confirm year token matches active cycle; flag stale-year for review.
- Verify the role still resolves on tal.net before publishing.

**Change detection plan**
- **Unique key:** tal.net `opp/<id>` (slug-independent).
- **New/Update/Removal:** new opp id / content_hash_diff / disappears or closed.
- **Notes:** Imperva CAPTCHA on direct fetch → headless or search-index fallback; deadlines visible on detail pages.

**Final JSON** — `{"employer":"Rothschild & Co","source_type":"tal_net","extraction_method":"html_parser","scope_relevance":"high","poll_frequency_minutes":60,"confidence_score":0.86,"activation_status":"auto_publish_with_light_checks","change_detection":{"strategy":"job_id_diff","unique_key":"tal.net opp/<id>"},"fallback_method":"monitored_change_detection_only"}`

### 14. Evercore

**Assessment.** Strong, high-value source — official EMEA student board on `evercore.tal.net` with verified London 2026 summer-analyst roles (M&A, Debt Advisory, Restructuring, Real Estate Strategic Advisory) and stable opp IDs. Rolling recruitment ~1.5 yrs ahead — tighten polling to 15 min in peak season.

| Field | Value |
|---|---|
| Employer | Evercore |
| Official careers homepage | https://www.evercore.com/careers/ |
| Student / internships page | https://www.evercore.com/careers/students-graduates/students-graduates-europe-asia/ |
| Listings page | https://evercore.tal.net/candidate/jobboard/vacancy/2/adv/ |
| Source type | tal_net |
| Evidence for source type | `evercore.tal.net`; opp URL `…/so/pm/1/pl/2/opp/2056-2025-Real-Estate-Strategic-Advisory-Summer-Analyst-Program-London/`; board `vacancy/2/adv/`. Marketing microsite `evercorecareersemea.com` funnels to it. |
| Extraction method | html_parser |
| Scope relevance | high |
| Recommended polling frequency | 60 min |
| Confidence score | 0.83 |
| Activation status | auto_publish_with_light_checks |

**Validation rules**
- London/UK + summer-analyst/internship titles; exclude US/off-cycle/full-time/non-finance.
- Require a stable `opp/<numeric_id>`.
- Confirm current open cycle (not a closed prior year).
- De-dupe tal.net vs `evercorecareersemea.com` (tal.net is system of record).

**Change detection plan**
- **Unique key:** tal.net `opp/<id>` (e.g. 2056).
- **New/Update/Removal:** new opp id / content_hash_diff / no longer listed or closed.
- **Notes:** rolling recruitment → fast open/close; CAPTCHA on live fetch.

**Final JSON** — `{"employer":"Evercore","source_type":"tal_net","extraction_method":"html_parser","scope_relevance":"high","poll_frequency_minutes":60,"confidence_score":0.83,"activation_status":"auto_publish_with_light_checks","change_detection":{"strategy":"job_id_diff","unique_key":"tal.net opp/<id>"},"fallback_method":"monitored_change_detection_only"}`

### 15. Lazard

**Assessment.** Strong, high-value source — `lazard-careers.tal.net` with verified 2026 London summer internships (Financial Advisory, Equity Research, Sales & Marketing) and stable opp IDs. Multiple cosmetic URL variants must be canonicalized to the opp id to avoid duplicates.

| Field | Value |
|---|---|
| Employer | Lazard |
| Official careers homepage | https://www.lazard.com/careers/ |
| Student / internships page | https://www.lazard.com/about-lazard/locations/united-kingdom/careers-in-the-united-kingdom/early-career-programmes-in-the-uk/ |
| Listings page | https://lazard-careers.tal.net/candidate/jobboard/vacancy/2/adv/ |
| Source type | tal_net |
| Evidence for source type | `lazard-careers.tal.net`; opp URLs `opp/3629` (Equity Research London), `opp/3726` (Financial Advisory London), `opp/3630` (Sales & Marketing London); `so/pm/1/pl/2/opp/<id>` with `brand-4`/`appcentre-1` params. |
| Extraction method | html_parser |
| Scope relevance | high |
| Recommended polling frequency | 60 min |
| Confidence score | 0.85 |
| Activation status | auto_publish_with_light_checks |

**Validation rules**
- London/UK + summer-internship/analyst; exclude off-cycle (e.g. "6 months"), non-UK (LA), full-time.
- Require a stable `opp/<numeric_id>`.
- Confirm active-cycle year and still-open (rolling) before publish.
- Canonicalize `mobile-0/mobile-1`/`appcentre-1` URL variants to one opp id.

**Change detection plan**
- **Unique key:** tal.net `opp/<id>` (e.g. 3629).
- **New/Update/Removal:** new opp id / content_hash_diff / removed or closed.
- **Notes:** CAPTCHA on live fetch; rolling deadlines.

**Final JSON** — `{"employer":"Lazard","source_type":"tal_net","extraction_method":"html_parser","scope_relevance":"high","poll_frequency_minutes":60,"confidence_score":0.85,"activation_status":"auto_publish_with_light_checks","change_detection":{"strategy":"job_id_diff","unique_key":"tal.net opp/<id>"},"fallback_method":"monitored_change_detection_only"}`

### 16. BlackRock

**Assessment.** Relevant and official, but lower-confidence extraction — a custom **TalentBrew/Radancy** build (not a clean ATS feed). Confirmed live 2026 EMEA/London summer programmes, but job-detail URLs 404'd on direct fetch (id rotation/bot protection), so it is held to manual review.

| Field | Value |
|---|---|
| Employer | BlackRock |
| Official careers homepage | https://careers.blackrock.com/early-careers/ |
| Student / internships page | https://careers.blackrock.com/students-and-graduates-emea |
| Listings page | https://careers.blackrock.com/students-and-graduates-emea |
| Source type | custom_html |
| Evidence for source type | TalentBrew (`talentbrew.com` assets); URL pattern `/job/<location>/<slug>/<companyId>/<jobId>` (e.g. `/job/london/2026-client-and-product-summer-internship-programme-emea/45831/…`). Legacy `blackrock.tal.net` also in search. No Workday/Greenhouse/Lever/Oracle markers. |
| Extraction method | html_parser |
| Scope relevance | high |
| Recommended polling frequency | 360 min |
| Confidence score | 0.62 |
| Activation status | manual_review_required |

**Validation rules**
- EMEA/London + "Summer Internship"; exclude Full-Time Analyst, US/APAC, non-finance (confirm finance/markets relevance per role).
- Require both URL segments `<companyId>/<jobId>`; verify detail URL 200s (direct fetch 404'd).
- Confirm active-cycle year + EMEA region facet (not US-default).
- Reconcile vs legacy `blackrock.tal.net`; `careers.blackrock.com` is system of record.

**Change detection plan**
- **Unique key:** TalentBrew job id (trailing numeric segment); fallback apply_url + title.
- **New/Update/Removal:** new id/card on EMEA listing / content_hash_diff / card gone.
- **Notes:** id stability uncertain (404s) → monitor the EMEA listing page then reparse; a TalentBrew JSON search endpoint likely exists but was not observed.

**Final JSON** — `{"employer":"BlackRock","source_type":"custom_html","extraction_method":"html_parser","scope_relevance":"high","poll_frequency_minutes":360,"confidence_score":0.62,"activation_status":"manual_review_required","change_detection":{"strategy":"page_change_trigger_then_reparse","unique_key":"TalentBrew job id"},"fallback_method":"monitored_change_detection_only"}`

### 17. Schroders

**Assessment.** Strong, official, structured — **Oracle Cloud HCM (Fusion Recruiting)** with live 2026 UK summer programmes (Client Group, Schroders Capital PE, Wealth Management UK). A competitor tracker was even observed hitting `/jobs?iis=Trackr`, confirming the canonical listings surface.

| Field | Value |
|---|---|
| Employer | Schroders |
| Official careers homepage | https://www.schroders.com/en-gb/uk/individual/about-us/careers/internships-and-placements/ |
| Student / internships page | https://www.schroders.com/en/global/individual/careers/early-careers/ |
| Listings page | https://ekbq.fa.em2.oraclecloud.com/hcmUI/CandidateExperience/en/sites/CX_2/jobs |
| Source type | oracle_cloud |
| Evidence for source type | Host `ekbq.fa.em2.oraclecloud.com` site `CX_2`; job-detail `/sites/CX_2/job/1081`, `/job/656`, `/job/609` (integer IDs); titles "2026 Client Group Internship", "2026 Schroders Capital Internship (PE)", "2026 Wealth Management Internship - UK". `/jobs?iis=Trackr` observed in the wild. |
| Extraction method | public_json_endpoint |
| Scope relevance | high |
| Recommended polling frequency | 60 min |
| Confidence score | 0.86 |
| Activation status | auto_publish_with_light_checks |

**Validation rules**
- Confirm host `ekbq.fa.em2.oraclecloud.com` site `CX_2`; reject other host/site.
- UK/London + internship/summer/placement titles; exclude grad/off-cycle/experienced.
- Require an integer job ID + working `/job/<id>` detail URL.
- Cross-check finance scope by department/title; flag tech/ops-only interns as medium.

**Change detection plan**
- **Unique key:** Oracle requisition integer ID in `/job/<id>` (namespaced to CX_2).
- **New/Update/Removal:** id appears / content_hash_diff / 404 or dropped from results.
- **Notes:** use the Oracle Fusion CE JSON/REST search (`recruitingCEJobRequisitions`), not HTML (JS-rendered); exact request shape not live-verified.

**Final JSON** — `{"employer":"Schroders","source_type":"oracle_cloud","extraction_method":"public_json_endpoint","scope_relevance":"high","poll_frequency_minutes":60,"confidence_score":0.86,"activation_status":"auto_publish_with_light_checks","change_detection":{"strategy":"job_id_diff","unique_key":"Oracle req id @ /job/<id>"},"fallback_method":"structured_data_parser"}`

### 18. Fidelity International

**Assessment.** Official and in-scope but operationally messy — the UK early-careers funnel runs on `fidelityinternational.tal.net` and is currently a **"Register Your Interest" pre-registration** rather than discrete role listings, with detail views behind login. Activate with manual review; relevance marked **medium**.

| Field | Value |
|---|---|
| Employer | Fidelity International |
| Official careers homepage | https://careers.fidelityinternational.com/early-careers |
| Student / internships page | https://careers.fidelityinternational.com/early-careers-overview/interns-and-insights/internships/ |
| Listings page | https://fidelityinternational.tal.net/vx/lang-en-GB/mobile-0/brand-5/candidate/jobboard/vacancy/1/adv/ |
| Source type | tal_net |
| Evidence for source type | `fidelityinternational.tal.net`; vacancy `/vx/…/so/pm/2/pl/6/opp/<id>-<slug>/en-GB` (opp 1256 "Register Your Interest - 2026 Summer Internships - UK"; 1129 for 2025). Login/Register exposed. Workday `fil.wd3` exists but is the separate experienced-hire/US tenant. |
| Extraction method | html_parser |
| Scope relevance | medium |
| Recommended polling frequency | 360 min |
| Confidence score | 0.74 |
| Activation status | manual_review_required |

**Validation rules**
- Ingest only from the public tal.net job board; **do not log in or register**.
- Treat the UK summer "Register Your Interest" as a single pre-registration entry, not per-discipline roles.
- UK/London only; exclude Tokyo/Paris/Luxembourg/off-cycle.
- Flag for review at the pre-reg → live-roles transition (streams open after pre-reg closes ~30 Nov).

**Change detection plan**
- **Unique key:** tal.net opportunity ID in `/opp/<id>` (e.g. 1256).
- **New/Update/Removal:** new opp ID / content_hash_diff (pre-reg → live roles) / no longer present.
- **Notes:** rich fields behind login (do not cross); parse public cards only.

**Final JSON** — `{"employer":"Fidelity International","source_type":"tal_net","extraction_method":"html_parser","scope_relevance":"medium","poll_frequency_minutes":360,"confidence_score":0.74,"activation_status":"manual_review_required","change_detection":{"strategy":"apply_url_diff","unique_key":"tal.net opp/<id>"},"fallback_method":"monitored_change_detection_only"}`

### 19. Man Group

**Assessment.** Excellent, highly structured — runs **both** a Greenhouse EU board (`mangroup`, documented public API) and a Workday tenant, with live UK/London early-careers roles. Greenhouse API makes this the most deterministic buy-side source. Apprenticeships must be tagged separately (not published as summer internships).

| Field | Value |
|---|---|
| Employer | Man Group |
| Official careers homepage | https://www.man.com/careers |
| Student / internships page | https://www.man.com/students-and-graduates |
| Listings page | https://job-boards.eu.greenhouse.io/mangroup |
| Source type | greenhouse |
| Evidence for source type | Live `job-boards.eu.greenhouse.io/mangroup` (token `mangroup`, EU instance, "66 jobs") with London early-careers entries. Separately `mangroupplc.wd3.myworkdayjobs.com/Man_Group_Careers` (Workday). Aggregators mirror "AHL IDI Summer Internship 2026" and "2026 Summer Technology Internship". |
| Extraction method | official_api |
| Scope relevance | high |
| Recommended polling frequency | 60 min |
| Confidence score | 0.90 |
| Activation status | auto_publish_with_light_checks |

**Validation rules**
- Primary: `boards-api.greenhouse.io/v1/boards/mangroup/jobs?content=true`; reject other tokens.
- Also poll Workday `mangroupplc/Man_Group_Careers` and dedupe across both.
- UK/London + summer internship; tag apprenticeships separately (not internships).
- Require a live Greenhouse `absolute_url` (gh_jid).

**Change detection plan**
- **Unique key:** Greenhouse `gh_jid` (Workday `externalPath`/jobPostingId for the secondary feed).
- **New/Update/Removal:** gh_jid appears / `updated_at`/content change / absent from boards-api.
- **Notes:** stable ids + `updated_at` + locations → clean diffs; dedupe Greenhouse vs Workday duplicates.

**Final JSON** — `{"employer":"Man Group","source_type":"greenhouse","extraction_method":"official_api","scope_relevance":"high","poll_frequency_minutes":60,"confidence_score":0.9,"activation_status":"auto_publish_with_light_checks","change_detection":{"strategy":"job_id_diff","unique_key":"Greenhouse gh_jid"},"fallback_method":"public_json_endpoint"}`

### 20. Blackstone

**Assessment.** Strong, structured, clearly in-scope — a dedicated **Workday campus tenant** (`blackstone.wd1`, site `Blackstone_Campus_Careers`) with live 2026 London Summer Analyst roles across PE, Private Wealth, Strategic Partners, Credit & Insurance. The campus tenant cleanly isolates interns from the `BX_External_Site` experienced-hire tenant.

| Field | Value |
|---|---|
| Employer | Blackstone |
| Official careers homepage | https://www.blackstone.com/careers/careers-blackstone/ |
| Student / internships page | https://www.blackstone.com/careers/students/ |
| Listings page | https://blackstone.wd1.myworkdayjobs.com/en-US/Blackstone_Campus_Careers |
| Source type | workday |
| Evidence for source type | Tenant `blackstone` on `wd1`, campus site `Blackstone_Campus_Careers`. Job-detail paths `…2026-Blackstone-Private-Equity-Summer-Analyst--London-_37058`, `…Credit-and-Insurance…Summer-Analyst---London-_38838`. Separate `BX_External_Site` for experienced hires. eFinancialCareers mirrors 2026 London Summer Analyst. |
| Extraction method | public_json_endpoint |
| Scope relevance | high |
| Recommended polling frequency | 60 min |
| Confidence score | 0.88 |
| Activation status | auto_publish_with_light_checks |

**Validation rules**
- POST CXS `/wday/cxs/blackstone/Blackstone_Campus_Careers/jobs`; reject other tenant/site (esp. `BX_External_Site`).
- London/UK location facet + "Summer Analyst"/"Internship"; exclude full-time analyst/associate.
- Resolve `externalPath` to a live `/job/...` URL; require a `jobPostingId`.
- Tag division (PE, Private Wealth, Strategic Partners, Credit & Insurance, Real Estate) — all finance-relevant.

**Change detection plan**
- **Unique key:** Workday `jobPostingId` / trailing req number in `externalPath` (e.g. 37058, 38838).
- **New/Update/Removal:** id appears / content_hash_diff on title/location/postedOn / drops or `/job` 404.
- **Notes:** CXS returns total + jobPostingId + locationsText + postedOn + externalPath → clean dedupe.

**Final JSON** — `{"employer":"Blackstone","source_type":"workday","extraction_method":"public_json_endpoint","scope_relevance":"high","poll_frequency_minutes":60,"confidence_score":0.88,"activation_status":"auto_publish_with_light_checks","change_detection":{"strategy":"job_id_diff","unique_key":"Workday jobPostingId"},"fallback_method":"html_parser"}`

### 21. Citadel

**Assessment.** Genuine London quant/trading/SWE summer internships, high relevance. **Reclassified from `unknown` after a follow-up pass:** the HTTP 403 was a Cloudflare *user-agent* block on the HTML, not the absence of a source. Citadel runs a **self-hosted custom careers site** (application completed on-domain — Greenhouse tokens `citadel`/`citadelsecurities` both 404), and it exposes a **public `career-sitemap.xml` that loads fine and deterministically enumerates every role** (34 detail URLs). Now activatable with light checks.

| Field | Value |
|---|---|
| Employer | Citadel |
| Official careers homepage | https://www.citadel.com/careers/ |
| Student / internships page | https://www.citadel.com/careers/internships/ |
| Listings page | https://www.citadel.com/careers/open-opportunities/ |
| **Enumeration endpoint** | **https://www.citadel.com/career-sitemap.xml** (loads despite the HTML 403) |
| Source type | custom_html |
| Evidence for source type | Self-hosted site; roles at `/careers/details/<slug>/`. Greenhouse tokens `citadel`/`citadelsecurities` → **404** (not Greenhouse); apply is on-domain (resume → online assessment). `career-sitemap.xml` enumerates **34** detail URLs incl. London/Europe interns: `software-engineer-intern-europe`, `quantitative-research-analyst-intern-bs-ms-europe`, `quantitative-researcher-phd-intern-europe`, `international-equities-associate-intern-europe` (all `lastmod 2026-06-05`). Detail pages are SEO-indexed (Google reads full title/description). |
| Extraction method | html_parser |
| Scope relevance | high |
| Recommended polling frequency | 360 min |
| Confidence score | 0.65 |
| Activation status | auto_publish_with_light_checks |

**Validation rules**
- Enumerate from the public `career-sitemap.xml` (loads normally; the 403 only gates the HTML to non-browser UAs) — it lists every `/careers/details/<slug>/` with a `<lastmod>`.
- Fetch each detail page with a **compliant browser user-agent** (naive fetch → Cloudflare 403; pages are SEO-rendered and public). If a compliant fetch can't retrieve bodies, fall back to sitemap-only change detection + manual review.
- Keep only roles whose detail page resolves to London/UK (slugs use `-europe`; Citadel's only European office is London — confirm per page) AND interns/early-career in a finance/quant/trading or finance-tech function.
- Confirm current-season summer internship (not full-time/graduate/off-cycle).
- Never submit the on-domain application/online assessment; stop at the public listing.

**Change detection plan**
- **Unique key:** `/careers/details/<slug>` path (stable role slug); sitemap `<lastmod>` as the update signal.
- **New/Update/Removal:** new slug in the sitemap set / `<lastmod>` advances / slug drops from the sitemap.
- **Notes:** first/last_seen trackable per slug. Off-season the UK intern subset can be empty — a zero count is a valid state, **not** a removed source.

**Final JSON** — `{"employer":"Citadel","source_type":"custom_html","extraction_method":"html_parser","scope_relevance":"high","poll_frequency_minutes":360,"confidence_score":0.65,"activation_status":"auto_publish_with_light_checks","enumeration_endpoint":"https://www.citadel.com/career-sitemap.xml","change_detection":{"strategy":"job_id_diff","unique_key":"/careers/details/<slug> + sitemap lastmod"},"fallback_method":"monitored_change_detection_only"}`

### 22. Citadel Securities

**Assessment.** Same reclassification as Citadel — real London quant/trading/SWE summer internships, high relevance. Self-hosted custom site on the same platform; **public `career-sitemap.xml` enumerates 73 role detail URLs** (`lastmod 2026-06-05`). The 403 was a UA block, not a missing source. Now activatable with light checks; keep separate from Citadel LLC.

| Field | Value |
|---|---|
| Employer | Citadel Securities |
| Official careers homepage | https://www.citadelsecurities.com/careers/ |
| Student / internships page | https://www.citadelsecurities.com/careers/students/ |
| Listings page | https://www.citadelsecurities.com/careers/open-opportunities/ |
| **Enumeration endpoint** | **https://www.citadelsecurities.com/career-sitemap.xml** (loads despite the HTML 403) |
| Source type | custom_html |
| Evidence for source type | Self-hosted site, same platform as citadel.com; roles at `/careers/details/<slug>/`. Greenhouse token `citadelsecurities` → **404**; apply on-domain (resume → online assessment → interviews). `career-sitemap.xml` enumerates **73** detail URLs incl. Europe interns: `quantitative-research-analyst-intern-bs-ms-europe`, `quantitative-researcher-phd-intern-europe`, `quantitative-researcher-engineer-phd-intern-europe`, `software-engineer-intern-europe` (all `lastmod 2026-06-05`). Detail pages SEO-indexed. |
| Extraction method | html_parser |
| Scope relevance | high |
| Recommended polling frequency | 360 min |
| Confidence score | 0.65 |
| Activation status | auto_publish_with_light_checks |

**Validation rules**
- Enumerate from the public `career-sitemap.xml` (loads normally; 403 only gates the HTML to non-browser UAs).
- Fetch each detail page with a compliant browser user-agent; if that fails, fall back to sitemap-only change detection + manual review.
- Keep only roles resolving to London/UK (European office is London) AND interns/early-career in a finance/quant/trading or finance-tech function.
- Confirm current-season summer internship (not full-time/graduate/off-cycle).
- Distinguish Citadel Securities from Citadel (LLC) postings; never submit the on-domain application/assessment.

**Change detection plan**
- **Unique key:** `/careers/details/<slug>` path (stable role slug); sitemap `<lastmod>` as the update signal.
- **New/Update/Removal:** new slug in the sitemap set / `<lastmod>` advances / slug drops from the sitemap.
- **Notes:** first/last_seen trackable per slug; off-season empty UK intern subset is a valid state, not a removed source.

**Final JSON** — `{"employer":"Citadel Securities","source_type":"custom_html","extraction_method":"html_parser","scope_relevance":"high","poll_frequency_minutes":360,"confidence_score":0.65,"activation_status":"auto_publish_with_light_checks","enumeration_endpoint":"https://www.citadelsecurities.com/career-sitemap.xml","change_detection":{"strategy":"job_id_diff","unique_key":"/careers/details/<slug> + sitemap lastmod"},"fallback_method":"monitored_change_detection_only"}`

### 23. Jane Street

**Assessment.** High-relevance employer with genuine London summer internships — but the **Greenhouse board (`janestreet`) holds only experienced/new-grad roles; internships are on the custom `janestreet.com` open-roles surface** (JS-rendered). Point the adapter at janestreet.com, not Greenhouse.

| Field | Value |
|---|---|
| Employer | Jane Street |
| Official careers homepage | https://www.janestreet.com/join-jane-street/ |
| Student / internships page | https://www.janestreet.com/join-jane-street/internships/ |
| Listings page | https://www.janestreet.com/join-jane-street/open-roles/?type=internship&location=all-locations |
| Source type | custom_html |
| Evidence for source type | Greenhouse board live at `job-boards.greenhouse.io/janestreet` (API returns JSON) **but every role is Full-Time/Experienced/New Grad — no internships**. Internships route to `janestreet.com` open-roles (`?type=internship`) with on-site `/position/<id>/` pages; JS-rendered, no Greenhouse iframe on the intern page. |
| Extraction method | hidden_xhr_or_fetch |
| Scope relevance | high |
| Recommended polling frequency | 60 min |
| Confidence score | 0.62 |
| Activation status | auto_publish_with_light_checks |

**Validation rules**
- Source the intern feed from `janestreet.com` open-roles (`type=internship`), **not** the Greenhouse board.
- Locate the open-roles data XHR/JSON; if only HTML, parse `/position/<id>/` pages.
- London/UK + finance/tech (SWE, Quant, Trading) + internship; confirm summer via Season/Duration.
- Validate each role resolves to a live `/position/<id>/` page (not `/closed-internship/`).
- Use the Greenhouse API only as a secondary non-intern signal; never merge feeds.

**Change detection plan**
- **Unique key:** `janestreet.com` `/position/<id>/` numeric id.
- **New/Update/Removal:** id appears in the filtered intern set / field change / leaves list or 404.
- **Notes:** JS-rendered list → headless/XHR fetch needed; Greenhouse API non-authoritative for interns.

**Final JSON** — `{"employer":"Jane Street","source_type":"custom_html","extraction_method":"hidden_xhr_or_fetch","scope_relevance":"high","poll_frequency_minutes":60,"confidence_score":0.62,"activation_status":"auto_publish_with_light_checks","change_detection":{"strategy":"job_id_diff","unique_key":"janestreet.com /position/<id>"},"fallback_method":"html_parser"}`

### 24. Point72

**Assessment.** **Strongest buy-side source** — `careers.point72.com` is backed by Greenhouse (token `point72`, public API live) with a dedicated Internships filter and multiple confirmed London/EMEA summer internships. Deterministic `official_api` extraction; highest-priority 15-min polling.

| Field | Value |
|---|---|
| Employer | Point72 |
| Official careers homepage | https://careers.point72.com/ |
| Student / internships page | https://job-boards.greenhouse.io/point72 |
| Listings page | https://job-boards.greenhouse.io/point72 |
| Source type | greenhouse |
| Evidence for source type | `careers.point72.com` → Greenhouse board (token `point72`); API `boards-api.greenhouse.io/v1/boards/point72/jobs` returns JSON (200+ jobs). London/EMEA summer-internship postings with gh_jids: 8183047002 (Data Engineer L/S Equities London), 8435134002 (Academy Investment Analyst EMEA), 8149040002 (Summer Internship – Strategy), 8150574002 (Technology Internship – SWE). Front-end exposes an "Internships" experience filter + London location filter. |
| Extraction method | official_api |
| Scope relevance | high |
| Recommended polling frequency | 15 min |
| Confidence score | 0.90 |
| Activation status | auto_publish_with_light_checks |

**Validation rules**
- Pull from `boards-api.greenhouse.io/v1/boards/point72/jobs` (`?content=true` for descriptions); treat as authoritative.
- London/UK (or EMEA programmes hosting London) + internship + finance/tech.
- Confirm season = summer + target year; exclude Spring Insight/off-cycle/full-time Academy.
- Validate `absolute_url` host `job-boards.greenhouse.io/point72/jobs/<id>` resolves.
- Distinguish "Academy" full-time grad programmes from true summer internships.

**Change detection plan**
- **Unique key:** Greenhouse job id (gh_jid / API `id`, e.g. 8183047002).
- **New/Update/Removal:** new id matching intern+UK filters / `updated_at` advances / id disappears from API.
- **Notes:** API id + `updated_at` → clean first/last_seen and reliable update detection; very low extraction risk.

**Final JSON** — `{"employer":"Point72","source_type":"greenhouse","extraction_method":"official_api","scope_relevance":"high","poll_frequency_minutes":15,"confidence_score":0.9,"activation_status":"auto_publish_with_light_checks","change_detection":{"strategy":"job_id_diff","unique_key":"Greenhouse gh_jid"},"fallback_method":"html_parser"}`

---

## Implementation notes for the execution layer

1. **Build adapters in confidence order.** Start with the live-verified deterministic feeds: J.P. Morgan (Oracle REST), Point72 + Man Group (Greenhouse API), Barclays + Blackstone + Morgan Stanley (Workday CXS), Schroders (Oracle Fusion CE). These map cleanly onto `job_id_diff` and the existing adapter seam in `src/ingestion/`.
2. **Workday CXS uses POST.** `barclays`, `blackstone`, `ms` all returned HTTP 400 on a GET to `/wday/cxs/<tenant>/<site>/jobs`; the endpoint requires a POST body `{limit, offset, searchText, appliedFacets}`. Confirm the body shape per tenant before first run.
3. **The four ATS adapter stubs already in the repo cover most of the field:** Greenhouse (`boards-api.greenhouse.io/v1/boards/{token}/jobs`), Workday (`/wday/cxs/{tenant}/{site}/jobs`), Lever (none of these 24 use Lever) — and you'll want to add **Oracle Cloud HCM** (`recruitingCEJobRequisitions`) and **tal.net** adapters, since 7 employers are tal.net and 2 are Oracle.
4. **`activation_status` is the gate.** Only `auto_publish_with_light_checks` employers should reach publication without a human; the 5 `manual_review_required` employers (Goldman, BofA, Deutsche Bank, BlackRock, Fidelity) must land in a review queue.
5. **Bot-gating is real and must be respected, not evaded.** tal.net (Imperva "Quick Check"), Citadel (UA-based 403), and several JS-rendered SPAs were observed. The guardrails forbid evasion: use a compliant headless render where a page is simply JS-rendered, debounce verification interstitials with retries, and where a non-browser UA is blocked but a public surface exists (Citadel ×2 → `career-sitemap.xml` + SEO-rendered detail pages) prefer that public surface with a normal browser UA — never attempt to defeat the protection itself.
6. **Seasonality.** Today (2026-06) several boards are mid-cycle or off-season; a count of 0 from a healthy feed (e.g. HSBC Eightfold, Nomura tal.net) is a valid "no current openings" state and must not be treated as an error or trigger a false removal.
