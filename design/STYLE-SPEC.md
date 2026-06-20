# Cyclops — Style Spec & Port Plan

Design system for the Cyclops redesign, and the concrete plan to port it into the
Next.js app. The reference implementation is **`design/terminal-b-paper.html`**
(open it side-by-side while porting — every token and component below is realised
there).

> Earlier explorations for context: `design/redesign.html` (INDEX, the first
> direction), `design/terminal-a-amber.html`, `design/terminal-c-cobalt.html`.
> **`terminal-b-paper.html` is the chosen direction.**

---

## 1. Concept

**Two surfaces, one product.**

| Surface | Where | Mood | Theme |
|---|---|---|---|
| **Marketing** | landing, auth, marketing copy | editorial, premium, FT-paper | **light** |
| **The Desk** | the dashboard / tracker (the product) | dense, professional, Bloomberg-grade | **dark** |

This "light marketing → dark product" split is how serious fintech presents
(Stripe, Linear, Bloomberg). It also gives the page a deliberate light/dark rhythm.

**Principles** (from research — see §11):
1. Every pixel accountable; hierarchy earned by importance, not decoration.
2. Density through proximity, alignment and colour-coding — not crowding.
3. Numbers are data: monospace, tabular figures, right-aligned.
4. Muted base + semantic colour (green up / red down) + one identifier accent (amber).
5. No AI-slop tells: text wordmark (no glyph), icon-free/typographic, no arrow-on-every-button, no pulsing dots, flat fills, intentional (not uniform) radii.

---

## 2. Typography

Three families, each with a strict job. **The Desk uses NO serif** — serif is
marketing-only.

| Role | Family | Used in | Notes |
|---|---|---|---|
| Display / editorial | **Newsreader** (incl. italic) | marketing headlines & section heads ONLY | the FT voice; never in the Desk |
| UI / body | **Hanken Grotesk** | all UI text, both surfaces | 400/500/600/700/800 |
| Numerics / mono | **Geist Mono** | every number, ticker, the entire Desk | `tabular-nums` + `"tnum"` always on |

**Rules**
- All numerics render in Geist Mono with `font-variant-numeric: tabular-nums`.
- Caps "labels" (column heads, eyebrows, ribbon labels): Geist Mono, ~9.5–11px, `letter-spacing: .06–.12em`, uppercase.
- Headlines: tighten tracking (`-.02 to -.035em`); use Newsreader italic for the one emphasised word.
- Body line-height 1.5; dense Desk rows 1.4.

**next/font setup** (in `src/app/layout.tsx`):
```ts
import { Newsreader, Hanken_Grotesk, Geist_Mono } from "next/font/google";
const display = Newsreader({ subsets:["latin"], style:["normal","italic"], variable:"--font-display" });
const ui      = Hanken_Grotesk({ subsets:["latin"], weight:["400","500","600","700","800"], variable:"--font-ui" });
const mono    = Geist_Mono({ subsets:["latin"], weight:["400","500","600"], variable:"--font-mono" });
// add `${display.variable} ${ui.variable} ${mono.variable}` to <html className>
```
> ⚠️ The repo's `AGENTS.md` warns this Next.js build has non-standard conventions —
> **read `node_modules/next/dist/docs/` for fonts + Tailwind before writing port code.**
> Verify the `next/font` and Tailwind v4 `@theme` APIs against that, not memory.

---

## 3. Color tokens

### 3a. Marketing (light) — current `:root`
```css
/* surfaces */
--paper:#fbfaf7; --surface:#ffffff; --surface-2:#f4f3ef; --surface-3:#ecebe5;
--salmon-wash:#fdf3ee;                 /* faint FT salmon, decorative only */
/* ink scale */
--ink:#15181c; --ink-2:#43484f; --ink-3:#7c828b; --ink-4:#a6abb2;
/* hairlines */
--line:#e4e2db; --line-strong:#d2cfc6;
/* accent — committed ink-blue */
--accent:#16407a; --accent-2:#1d539e; --accent-soft:#e7eef8; --accent-tint:#f1f5fb;
/* semantic */
--pos:#1f7a4d; --pos-soft:#e4f2ea;
--warn:#b4791b; --warn-soft:#f8efdc;
--neg:#b23a2e; --neg-soft:#f7e7e4;
/* fit tiers (light) */
--tier-strong:#1f7a4d; --tier-good:#16407a; --tier-mod:#b4791b; --tier-low:#8a8f97;
```

### 3b. The Desk (dark) — current `.desk` scope
Not pure black (avoids harsh contrast); elevation via layered surfaces + borders, **not shadows**.
```css
--d-bg:#0a0d11; --d-panel:#0d1117; --d-elev:#11161d;      /* base → panel → elevated */
--d-line:#1b212a; --d-line-2:#28313c;                      /* hairline → divider */
--d-txt:#cdd5de; --d-txt-2:#9099a4; --d-dim:#6b7480;       /* primary → secondary → meta (WCAG-checked) */
--d-amber:#e8a33d; --d-amber-2:#f2b659; --d-amber-d:#3a2e16; /* identifier accent (codes, live, CTA) */
--d-up:#42c172; --d-down:#f0584f; --d-cyan:#56c2d6;        /* semantic up/down + link */
--d-hi:rgba(232,163,61,.06);                               /* row hover */
/* fit tiers (desk): hi=up, mid=amber, lo=txt-2, bad=down */
```

### 3c. Semantic mapping (use these names in components, not raw hues)
| Meaning | Light | Desk |
|---|---|---|
| primary action | `--accent` | `--d-amber` |
| positive / OPEN / strong fit | `--pos` | `--d-up` |
| caution / SOON / closing | `--warn` | `--d-amber` |
| negative / urgent / low fit | `--neg` | `--d-down` |
| identifier (ticker code, live) | `--accent` | `--d-amber` |

---

## 4. Spacing, radii, borders, elevation, motion

**Spacing** — 4px base scale: `4 · 8 · 12 · 16 · 20 · 24 · 32 · 48 · 64`.

**Radii** — intentional hierarchy, *not* one value everywhere:
- Light: cards `14px`, controls `6px`, tags/pills **`4px`** (squared, not 100px), meters `2px`.
- Desk: frame `8px`; **everything inside sharp `0–2px`** (terminal feel).

**Borders / hairlines** — `--line` (light) / `--d-line` (desk) for row & cell rules; `--line-strong` / `--d-line-2` for stronger dividers and column splits. Max 1px, light grey. Vertical dividers minimal (ribbon cells, the table↔watchlist split only).

**Elevation**
- Light: soft low shadows — `--sh-1` (rest), `--sh-2` (hover), `--sh-3` (floating frame).
- Desk: **no shadows internally** — use `--d-panel`/`--d-elev` surface steps + borders. Only the whole Desk gets one outer shadow to lift it off the paper.

**Motion** (all gated by `prefers-reduced-motion`)
- One staggered page-load reveal (`opacity + translateY 14px`, `cubic-bezier(.2,.7,.2,1)`, stagger via `--d` delay).
- Marquee ticker, pauses on hover.
- Blinking command caret (`steps(1)`).
- Buttons: easing colour/shadow transition, subtle `:active` press — **no lift-on-hover, no snap**.

**Density** — Desk rows: Regular `37px` / Compact `29px`, toggled via `.compact` on the Desk root (research: let users pick density). Reference impl has a working `DENSITY · REGULAR/COMPACT` toggle.

---

## 5. Component inventory → repo mapping

Repo uses `src/components/ui/*` (primitives), `src/components/tracker/*` (the desk),
plus marketing in `src/app/page.tsx`. Map:

### Primitives — `src/components/ui/`
| File | Change |
|---|---|
| `button.tsx` | Variants: `primary` (accent solid), `ghost` (outline), `dark`, **`link`** (new — underlined editorial text action), and Desk `desk-btn` (amber solid). Remove arrow affordances. Easing hover, `:active` press. |
| `input.tsx` | Light: `--surface-2` fill, focus → accent border. Desk: bare mono input inside the command line. |
| `select.tsx` | Match input; chevron via CSS, not icon font. |
| `badge.tsx` → status | **Replace pill badges with semantic colored text** for the Desk (`OPEN`/`SOON`/`CLOSED`). Keep a squared (4px) tag variant for marketing if needed. |
| `card.tsx` | Light only. Radius 14, `--sh-1`. Not used inside the Desk. |
| `monogram.tsx` | **Flat solid** color by division (drop gradients). In the Desk, prefer the **ticker CODE** (HLVR, BWTR…) over avatars. |
| `toggle-chip.tsx` | Light chips → 6px radius; Desk → `.fchip` (sharp, amber when `on`). |
| `skeleton.tsx`, `tag-input.tsx` | Re-token to the palettes; no structural change. |
| `brand.tsx` | **Text-only wordmark `Cyclops.`** (accent full-stop). No glyph/svg. Optional mono descriptor. |
| `app-header.tsx` | Light marketing nav uses light tokens; in-app header may adopt a slim Desk command-bar treatment. |

### The Desk — `src/components/tracker/`
| File | Becomes |
|---|---|
| `opportunity-table.tsx` | **`DataGrid`** — dense mono table. Columns: `# · CODE · FIRM/ROLE · DIV · LOC · DEADLINE · DAYS · FIT · bar · STATUS`. Row states: hover, **selected** (left amber rail), closed (dimmed). Sticky header. Left-align text, **right-align numerics**, header alignment matches column. |
| `fit-pill.tsx` | **FitCell** — big mono score colored by tier + a **segmented mono bar** (`repeating-linear-gradient`), width = score%. |
| `status-badge.tsx` | Colored uppercase mono text (not a pill). |
| `summary-cards.tsx` | **Ribbon** — flat 4-cell divided index strip (OPEN ▲ / NEW / MATCH≥75 / DEADLINE ≤14 ▼), no rounded cards. |
| `top-matches.tsx` | **Watchlist** — compact ranked list (`# · CODE · firm · score`), amber codes, colored scores. |
| `filters-bar.tsx` | Desk **filter line** — `FILTER [chips] + ADD · SORT FIT▾ · DENSITY toggle · n/45 ROWS`. |
| `notes-editor.tsx`, `save-button.tsx` | Re-token to Desk palette. |
| new: `DeskShell` | Wraps the dashboard: **command bar** (wordmark, `INTERN <GO>` command line + caret, function keys F1–F9, live/clock status), the ribbon, filter line, the grid+watchlist split, and a **status/legend footer** (OPEN/SOON/CLOSED legend · "DETERMINISTIC · NO ML" · last sync). |

### Marketing — `src/app/page.tsx` (+ auth pages)
Nav · hero (editorial headline + floating fit-score card showing the +30/+23/+20/+15 breakdown) · dark ticker band · stats strip · 3-up features (numerals `01/02/03`, no icons) · the embedded Desk preview · dark manifesto · footer CTA. All light except the dark bands.

### Global — `src/app/globals.css`
Rewrite the `@theme` / `:root` with §3 tokens (replace the old "Broadsheet Terminal" tokens). Add the `.desk` dark scope. Wire the three font variables.

---

## 6. The DataGrid contract (most important component)

```
columns = [
  { key:"idx",      label:"#",            align:"center", mono:true,  role:"meta" },
  { key:"code",     label:"CODE",         align:"left",   mono:true,  role:"identifier" }, // amber
  { key:"firmRole", label:"FIRM / ROLE",  align:"left",   primary:"firm (Hanken 600)", secondary:"role (mono dim)" },
  { key:"div",      label:"DIV",          align:"left",   mono:true },
  { key:"loc",      label:"LOC",          align:"left",   mono:true },  // LON/EDI/RMT
  { key:"deadline", label:"DEADLINE",     align:"left",   mono:true },  // qualitative date → left
  { key:"days",     label:"DAYS",         align:"right",  mono:true,  color:"urgency(≤7 down, ≤14 amber, else dim)" },
  { key:"fit",      label:"FIT",          align:"right",  mono:true,  color:"tier", sortDefault:true },
  { key:"fitBar",   label:"",             align:"left",   render:"segmented bar, width=fit%, color=tier" },
  { key:"status",   label:"STATUS",       align:"right",  mono:true,  color:"OPEN up / SOON amber / CLOSED dim" },
]
```
Tier function: `fit≥80 → hi(green) · 70–79 → mid(amber) · 55–69 → lo(grey) · <55 → bad(red)`.
Hide on narrow (`.gc-*`): bar (≤880), then LOC/DIV/DAYS (≤620). Don't repeat column titles inside cells.

---

## 7. Accessibility

- **Contrast**: target WCAG 4.5:1 for body text. Desk `--d-txt`/`--d-txt-2` pass on `--d-bg`; `--d-dim` is meta-only (large/non-essential). Re-check any amber-on-dark text at small sizes.
- **Focus**: visible focus ring on every interactive element (`outline: 2px accent/amber, offset 2px`).
- **Reduced motion**: kill reveal, ticker, caret blink (already handled).
- **Semantics**: the grid is a real `<table>` with `<thead>`/sortable `<th>`; status/fit not conveyed by colour alone (text label + position carry meaning too).
- **Keyboard**: sort headers, chips, density toggle, copilot CTA all reachable & operable.

---

## 8. Responsive

- Marketing: hero 2-col → 1-col ≤980; stats 4→2; features 3→1; nav links collapse ≤720.
- Desk: grid+watchlist → stacked ≤880 (watchlist below); ribbon 4→2 ≤620; hide bar/LOC/DIV/DAYS + function keys progressively. Grid scrolls horizontally before columns get too tight (consider freezing CODE/FIRM later).

---

## 9. Port plan (phased)

**Phase 0 — Foundations**
- [ ] Read `node_modules/next/dist/docs/` for fonts + Tailwind v4 conventions (per `AGENTS.md`).
- [ ] Wire 3 fonts in `app/layout.tsx`; rewrite `globals.css` `@theme`/tokens (§3) + add `.desk` scope; add `tabular-nums` utility.

**Phase 1 — Primitives** (`components/ui/*`)
- [ ] `brand.tsx` (text wordmark), `button.tsx` (+`link`, de-arrowed), `input/select`, `badge`→status text, `card`, `monogram` (flat), chips.

**Phase 2 — Marketing** (`app/page.tsx`, auth)
- [ ] Nav, hero + float card, ticker, stats, features (numerals), manifesto, footer CTA. Replace old "Broadsheet" landing.

**Phase 3 — The Desk** (`components/tracker/*`, dashboard)
- [ ] `DeskShell` (command/ribbon/filter/status bars), `DataGrid` (§6), `FitCell`, `Watchlist`, `filters-bar`, density toggle.
- [ ] Map real query data (`getTrackerItems`, scoring tiers, deadlines) into the grid; derive CODE from employer name; wire status/urgency from real dates.

**Phase 4 — Polish & a11y**
- [ ] Focus states, reduced-motion, contrast pass, keyboard, responsive breakpoints.

**Phase 5 — QA**
- [ ] Visual diff vs `terminal-b-paper.html`; check `dashboard`, `opportunities/[id]`, `saved`, `settings`, `onboarding`, auth all re-tokened (no orphaned old vars).

---

## 10. Open decisions (confirm before/while porting)

1. **Desk theme** — dark (current, most "Bloomberg") vs a **light-pro** desk (same density/gridlines/mono on white). Structure is identical; only tokens flip. *Default: dark.*
2. **Accent in the Desk** — amber (classic terminal) vs a cooler cyan/blue to tie to the marketing ink-blue. *Default: amber.*
3. **Density default** — Regular vs Compact on first load. *Default: Regular.*
4. **In-app header** — full Desk command bar vs a slimmer app header.
5. **Firm CODE source** — derive deterministically from employer name, or add a `ticker` field to the `Employer` model.

---

## 11. Research basis
- Bloomberg Terminal UX — concealing complexity / density: https://www.bloomberg.com/company/stories/how-bloomberg-terminal-ux-designers-conceal-complexity/
- Matt Ström, *UI Density* (Gestalt proximity/similarity): https://mattstromawn.com/writing/ui-density/
- Pencil & Paper, *Enterprise Data Tables* (alignment, density, states, no-zebra-with-states): https://www.pencilandpaper.io/articles/ux-pattern-analysis-enterprise-data-tables
- Dark-mode dashboards (avoid pure black, borders over shadows, desaturate, WCAG 4.5:1): https://www.qodequay.com/dark-mode-dashboards
- Avoiding AI-slop design (typography, no purple gradients, intentional spacing, specific copy): https://www.925studios.co/blog/ai-slop-web-design-guide · https://dev.to/a_shokn/how-to-break-the-ai-generated-ui-curse-your-guide-to-authentic-professional-design-2en
