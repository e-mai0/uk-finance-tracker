# Copilot on Unknown / Universal Forms — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the Trackr Autofill copilot work on application forms that aren't covered by a built-in ATS adapter (e.g. Greenhouse's new job board, D.E. Shaw's custom ATS, Google Forms) and stop the `"Invalid request"` 400 that kills planning on real-world forms.

**Architecture:** Five independent fixes, each separately mergeable. (A) The serializer↔schema contract is made forgiving on both sides so one oversized field can't 400 the whole form. (B) A manual "Activate on this page" trigger in the popup, received by a new content-script message listener, gives a universal escape hatch when auto-detection declines. (C) Auto-detection is repaired for form-less field clusters and the new Greenhouse markup. (D) `all_frames` injection plus a sub-frame size guard handles iframed embeds. (E) An ARIA-widget module serializes and fills Google-Forms-style `role="radio"/"listbox"` controls that native serialization misses.

**Tech Stack:** TypeScript, Chrome MV3 extension (`@crxjs/vite-plugin`), Next.js 15 API route, Zod validation, Vitest (node for server, **new** jsdom config for extension), playwright-core (already a devDependency) for live-page probes.

---

## Root-Cause Summary (the "why")

| # | Symptom (user report) | Root cause | Fix phase |
|---|---|---|---|
| 1 | `"Invalid request"` on unknown ATS | `serialize.ts` never clamps to the bounds in `extPlanRequestSchema` (`label`≤400, `option`≤200, ≤80 options, ≤200 fields). One over-long label → whole batch 400s at `plan/route.ts:28`. | A |
| 2 | Copilot cue never appears | Auto-detect needs ≥4 native fields + (textarea \| apply-words) + a `<form>` cluster; form-less / short / new-Greenhouse layouts miss. No manual fallback exists. | B, C |
| 3 | Clicking the extension icon does nothing | `popup.ts` only connects/disconnects; the content script has **no** `onMessage` listener — there is no trigger path at all. | B |
| 4 | Iframed embeds dead | `manifest.json` omits `all_frames` (defaults false) → content script never runs in the form's iframe. | D |
| 5 | Google Forms radios/dropdowns ignored | They are `<div role="radio">` / `role="listbox"`, not native inputs, so `collectFields` can't see them. | E |

---

## File Structure

**Server (Next.js app):**
- Modify `src/lib/validation.ts` — add `sanitizePlanBody()` (pure, testable) + export `FIELD_TYPES` reuse.
- Modify `src/app/api/ext/plan/route.ts` — sanitize before `safeParse`; clearer error when no usable fields.
- Modify `src/test/validation.test.ts` — tests for `sanitizePlanBody`.

**Extension — new files:**
- Create `extension/vitest.config.ts` — jsdom test config.
- Create `extension/src/shared/limits.ts` — bounds mirroring the server.
- Create `extension/src/content/aria-controls.ts` — ARIA widget discovery + fill.
- Create `extension/src/content/serialize.test.ts`, `extension/src/content/detect.test.ts`, `extension/src/content/aria-controls.test.ts`.

**Extension — modified files:**
- `extension/package.json` — add `vitest` + `jsdom`, `"test"` script.
- `extension/src/content/serialize.ts` — clamp fields; fold in ARIA controls.
- `extension/src/content/detect.ts` — export `hasAnyField`; robust `innerText` fallback; relaxed threshold.
- `extension/src/content/index.ts` — `engage(force)`, `trackr:activate` listener, sub-frame guard.
- `extension/src/content/autofill.ts` — `FillTarget` union; route ARIA fills.
- `extension/src/content/adapters/greenhouse.ts` — refresh selectors.
- `extension/src/popup/popup.html` + `extension/src/popup/popup.ts` — "Activate on this page" button.
- `extension/manifest.json` — `"all_frames": true`.

---

## Phase 0 — Extension test harness

### Task 0: Stand up Vitest + jsdom for the extension

**Files:**
- Modify: `extension/package.json`
- Create: `extension/vitest.config.ts`

- [ ] **Step 1: Add dev deps and a test script**

In `extension/package.json`, add to `scripts`:

```json
    "test": "vitest run",
    "test:watch": "vitest"
```

Then install:

```bash
cd extension && npm install -D vitest jsdom
```

- [ ] **Step 2: Create the jsdom config**

Create `extension/vitest.config.ts`:

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "jsdom",
    include: ["src/**/*.test.ts"],
  },
});
```

- [ ] **Step 3: Smoke-test the runner**

Create a throwaway `extension/src/content/_smoke.test.ts`:

```ts
import { describe, it, expect } from "vitest";

describe("jsdom env", () => {
  it("has a document", () => {
    document.body.innerHTML = `<input type="text" />`;
    expect(document.querySelectorAll("input").length).toBe(1);
  });
});
```

Run: `cd extension && npm test`
Expected: 1 passing test.

- [ ] **Step 4: Delete the smoke test and commit**

```bash
rm extension/src/content/_smoke.test.ts
git add extension/package.json extension/package-lock.json extension/vitest.config.ts
git commit -m "test(ext): add vitest + jsdom harness for content scripts"
```

---

## Phase A — Kill the "Invalid request" 400

### Task 1: Server-side `sanitizePlanBody` (truncate/drop instead of reject)

**Files:**
- Modify: `src/lib/validation.ts`
- Test: `src/test/validation.test.ts`

- [ ] **Step 1: Write the failing tests**

Append to `src/test/validation.test.ts` (and add `sanitizePlanBody` to the import on line 2-7):

```ts
import { sanitizePlanBody } from "../lib/validation";

describe("sanitizePlanBody", () => {
  const field = (over: Record<string, unknown> = {}) => ({
    id: "f0", label: "Email", type: "email", required: false, ...over,
  });

  it("truncates an over-long label so the schema accepts it", () => {
    const clean = sanitizePlanBody({ fields: [field({ label: "x".repeat(900) })] });
    const parsed = extPlanRequestSchema.safeParse(clean);
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.fields[0].label.length).toBe(400);
  });

  it("drops a field with an unknown type instead of failing the batch", () => {
    const clean = sanitizePlanBody({
      fields: [field(), field({ id: "f1", type: "bogus" })],
    }) as { fields: unknown[] };
    expect(clean.fields.length).toBe(1);
  });

  it("caps the batch at 200 fields", () => {
    const many = Array.from({ length: 250 }, (_, i) => field({ id: `f${i}` }));
    const clean = sanitizePlanBody({ fields: many }) as { fields: unknown[] };
    expect(clean.fields.length).toBe(200);
  });

  it("caps options to 80 entries and 200 chars each", () => {
    const opts = Array.from({ length: 120 }, () => "o".repeat(300));
    const clean = sanitizePlanBody({
      fields: [field({ type: "select", options: opts })],
    }) as { fields: { options: string[] }[] };
    expect(clean.fields[0].options.length).toBe(80);
    expect(clean.fields[0].options[0].length).toBe(200);
  });

  it("produces a body the strict schema fully accepts", () => {
    const clean = sanitizePlanBody({
      fields: [field({ label: "y".repeat(900), charLimit: 99999 })],
      employer: "z".repeat(500),
    });
    expect(extPlanRequestSchema.safeParse(clean).success).toBe(true);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -- validation`
Expected: FAIL — `sanitizePlanBody is not a function`.

- [ ] **Step 3: Implement `sanitizePlanBody`**

In `src/lib/validation.ts`, after the `extPlanRequestSchema` definition (after line 221), add:

```ts
/**
 * Coerce an untrusted /api/ext/plan body into something extPlanRequestSchema
 * will accept: truncate over-long strings, cap option lists, drop fields with a
 * missing id or unknown type, and limit the batch to 200 fields — so one
 * malformed field can't 400 the entire form. Mirrors the bounds above.
 */
export function sanitizePlanBody(body: unknown): unknown {
  if (!body || typeof body !== "object") return body;
  const b = body as Record<string, unknown>;
  const rawFields = Array.isArray(b.fields) ? b.fields : [];

  const fields = rawFields
    .filter((f): f is Record<string, unknown> => !!f && typeof f === "object")
    .map((f) => {
      const typeOk =
        typeof f.type === "string" &&
        (FIELD_TYPES as readonly string[]).includes(f.type);
      const options = Array.isArray(f.options)
        ? f.options
            .filter((o): o is string => typeof o === "string")
            .slice(0, 80)
            .map((o) => o.slice(0, 200))
        : undefined;
      return {
        id: typeof f.id === "string" ? f.id.slice(0, 40) : "",
        label: typeof f.label === "string" ? f.label.slice(0, 400) : "",
        nearbyText:
          typeof f.nearbyText === "string" ? f.nearbyText.slice(0, 600) : undefined,
        type: typeOk ? (f.type as string) : "",
        options: options && options.length ? options : undefined,
        required: f.required === true,
        charLimit:
          typeof f.charLimit === "number" && f.charLimit > 0
            ? Math.min(Math.floor(f.charLimit), 20000)
            : undefined,
      };
    })
    .filter((f) => f.id !== "" && f.type !== "")
    .slice(0, 200);

  return {
    fields,
    employer: typeof b.employer === "string" ? b.employer.slice(0, 160) : b.employer,
    role: typeof b.role === "string" ? b.role.slice(0, 200) : b.role,
    url: typeof b.url === "string" ? b.url.slice(0, 500) : b.url,
  };
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm test -- validation`
Expected: PASS (all `sanitizePlanBody` cases green).

- [ ] **Step 5: Commit**

```bash
git add src/lib/validation.ts src/test/validation.test.ts
git commit -m "feat(api): sanitizePlanBody truncates/drops bad fields before validation"
```

### Task 2: Wire sanitizer into the plan route + clearer error

**Files:**
- Modify: `src/app/api/ext/plan/route.ts:25-31`

- [ ] **Step 1: Import the sanitizer**

Edit `src/app/api/ext/plan/route.ts` line 4:

```ts
import { extPlanRequestSchema, sanitizePlanBody } from "../../../../lib/validation";
```

- [ ] **Step 2: Sanitize before parsing and improve the failure message**

Replace lines 25-31:

```ts
  const parsed = extPlanRequestSchema.safeParse(sanitizePlanBody(body));
  if (!parsed.success) {
    return json(
      {
        error: "No usable form fields were found on this page.",
        fieldErrors: parsed.error.flatten().fieldErrors,
      },
      400,
    );
  }
```

- [ ] **Step 3: Verify nothing else broke**

Run: `npm test`
Expected: PASS (full suite). Then `npm run lint` → no new errors.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/ext/plan/route.ts
git commit -m "fix(api): plan route sanitizes payload so oversized fields don't 400"
```

### Task 3: Client-side clamping (defense in depth)

**Files:**
- Create: `extension/src/shared/limits.ts`
- Modify: `extension/src/content/serialize.ts`
- Test: `extension/src/content/serialize.test.ts`

- [ ] **Step 1: Create the shared bounds**

Create `extension/src/shared/limits.ts`:

```ts
/**
 * Mirror of the server bounds in src/lib/validation.ts (fieldSchemaSchema /
 * extPlanRequestSchema). Keep in sync with that file.
 */
export const LIMITS = {
  maxFields: 200,
  maxLabel: 400,
  maxNearbyText: 600,
  maxOption: 200,
  maxOptions: 80,
  maxCharLimit: 20000,
} as const;
```

- [ ] **Step 2: Write the failing test**

Create `extension/src/content/serialize.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { clampFields } from "./serialize";
import type { FieldSchema } from "../shared/types";

const base: FieldSchema = { id: "f0", label: "Email", type: "email", required: false };

describe("clampFields", () => {
  it("truncates labels to 400 chars", () => {
    const [f] = clampFields([{ ...base, label: "x".repeat(900) }]);
    expect(f.label.length).toBe(400);
  });

  it("caps options to 80 and 200 chars each", () => {
    const options = Array.from({ length: 120 }, () => "o".repeat(300));
    const [f] = clampFields([{ ...base, type: "select", options }]);
    expect(f.options?.length).toBe(80);
    expect(f.options?.[0].length).toBe(200);
  });

  it("limits the batch to 200 fields", () => {
    const many = Array.from({ length: 250 }, (_, i) => ({ ...base, id: `f${i}` }));
    expect(clampFields(many).length).toBe(200);
  });

  it("clamps an oversized charLimit", () => {
    const [f] = clampFields([{ ...base, type: "textarea", charLimit: 99999 }]);
    expect(f.charLimit).toBe(20000);
  });
});
```

- [ ] **Step 3: Run to verify it fails**

Run: `cd extension && npm test -- serialize`
Expected: FAIL — `clampFields` is not exported.

- [ ] **Step 4: Implement `clampFields` and apply it**

In `extension/src/content/serialize.ts`, add the import at the top:

```ts
import { LIMITS } from "../shared/limits";
```

Add the exported function (e.g. after `serializeForm`):

```ts
/** Clamp serialized fields to the server's accepted bounds (defense in depth —
 *  the server clamps too). Truncates over-long text and caps option/field counts. */
export function clampFields(fields: FieldSchema[]): FieldSchema[] {
  return fields.slice(0, LIMITS.maxFields).map((f) => ({
    ...f,
    label: (f.label ?? "").slice(0, LIMITS.maxLabel),
    nearbyText: f.nearbyText
      ? f.nearbyText.slice(0, LIMITS.maxNearbyText)
      : undefined,
    options: f.options
      ? f.options.slice(0, LIMITS.maxOptions).map((o) => o.slice(0, LIMITS.maxOption))
      : undefined,
    charLimit:
      f.charLimit && f.charLimit > LIMITS.maxCharLimit ? LIMITS.maxCharLimit : f.charLimit,
  }));
}
```

Change the `serializeForm` return (currently `return { fields, elements };` on line 66):

```ts
  return { fields: clampFields(fields), elements };
```

- [ ] **Step 5: Run to verify it passes**

Run: `cd extension && npm test -- serialize`
Expected: PASS. Then `cd extension && npm run typecheck` → no errors.

- [ ] **Step 6: Commit**

```bash
git add extension/src/shared/limits.ts extension/src/content/serialize.ts extension/src/content/serialize.test.ts
git commit -m "fix(ext): clamp serialized fields to server bounds before planning"
```

---

## Phase B — Manual trigger (popup button + content-script listener)

### Task 4: `engage(force)` + `trackr:activate` listener + `hasAnyField`

**Files:**
- Modify: `extension/src/content/detect.ts`
- Modify: `extension/src/content/index.ts`
- Test: `extension/src/content/detect.test.ts`

- [ ] **Step 1: Write the failing test for `hasAnyField`**

Create `extension/src/content/detect.test.ts`:

```ts
import { describe, it, expect, beforeEach } from "vitest";
import { hasAnyField, looksLikeApplication } from "./detect";

beforeEach(() => { document.body.innerHTML = ""; });

describe("hasAnyField", () => {
  it("is false on an empty page", () => {
    expect(hasAnyField()).toBe(false);
  });
  it("is true with a single text input", () => {
    document.body.innerHTML = `<input type="text" />`;
    expect(hasAnyField()).toBe(true);
  });
  it("ignores hidden / submit inputs", () => {
    document.body.innerHTML = `<input type="hidden" /><input type="submit" />`;
    expect(hasAnyField()).toBe(false);
  });
});

describe("looksLikeApplication", () => {
  it("is true for a 4-field form with a textarea", () => {
    document.body.innerHTML = `
      <input type="text"/><input type="email"/><input type="tel"/>
      <textarea></textarea>`;
    expect(looksLikeApplication()).toBe(true);
  });
  it("is true for 3 fields plus apply wording", () => {
    document.body.innerHTML = `
      <p>Submit your application and cover letter</p>
      <input type="text"/><input type="email"/><input type="tel"/>`;
    expect(looksLikeApplication()).toBe(true);
  });
});
```

> Note: jsdom does not implement `innerText`. Task step 3 switches `detect.ts` to `innerText ?? textContent`, which makes the apply-wording test meaningful.

- [ ] **Step 2: Run to verify it fails**

Run: `cd extension && npm test -- detect`
Expected: FAIL — `hasAnyField` is not exported (and the 3-field case fails until the threshold + textContent change land).

- [ ] **Step 3: Update `detect.ts`**

In `extension/src/content/detect.ts`, replace `looksLikeApplication` (lines 10-19) and add `hasAnyField`:

```ts
const FILLABLE_SELECTOR =
  "input:not([type=hidden]):not([type=submit]):not([type=button]):not([type=reset]):not([type=image]), textarea, select";

/** True if the page has at least one fillable field. */
export function hasAnyField(doc: Document = document): boolean {
  return doc.querySelector(FILLABLE_SELECTOR) != null;
}

/** True if the page has a form-like cluster of inputs and application wording. */
export function looksLikeApplication(doc: Document = document): boolean {
  const count = doc.querySelectorAll(FILLABLE_SELECTOR).length;
  if (count < 3) return false;
  const hasTextarea = doc.querySelector("textarea") != null;
  const text = (doc.body?.innerText ?? doc.body?.textContent ?? "").slice(0, 5000);
  const applyish = hasTextarea || APPLY_HINT.test(text);
  // 4+ fields look like a form on their own; exactly 3 needs apply wording.
  return count >= 4 ? true : applyish;
}
```

(Leave `APPLY_HINT` on lines 7-8 and `mountCue` unchanged.)

- [ ] **Step 4: Run to verify it passes**

Run: `cd extension && npm test -- detect`
Expected: PASS.

- [ ] **Step 5: Add `engage(force)` and the activate listener in `index.ts`**

In `extension/src/content/index.ts`:

Update the import on line 6:

```ts
import { looksLikeApplication, hasAnyField, mountCue } from "./detect";
```

Change `engage` (line 69) to accept a `force` flag and use the body fallback when forced:

```ts
async function engage(force = false) {
  const container =
    formContainer() ?? (force && hasAnyField() ? document.body : null);
  if (!container) { panel.showError("No application form found on this page."); return; }
```

(The rest of `engage` is unchanged but now references `container` from the new line.)

After the `panel` is constructed and before `init()` is defined, register the listener:

```ts
// The popup (extension icon) broadcasts this to every frame; the frame that
// owns a form engages, the rest no-op. This is the universal fallback for pages
// the auto-detector declines.
chrome.runtime.onMessage.addListener((msg: { type?: string }, _sender, sendResponse) => {
  if (msg?.type !== "trackr:activate") return false;
  const hasForm = formContainer() != null || hasAnyField();
  if (!hasForm) { sendResponse({ ok: false }); return true; }
  document.getElementById("trackr-cue-root")?.remove();
  panel.mount();
  panel.setStatus("");
  void engage(true);
  sendResponse({ ok: true });
  return true;
});
```

- [ ] **Step 6: Typecheck + commit**

Run: `cd extension && npm run typecheck`
Expected: no errors.

```bash
git add extension/src/content/detect.ts extension/src/content/detect.test.ts extension/src/content/index.ts
git commit -m "feat(ext): force-engage path + trackr:activate listener + hasAnyField"
```

### Task 5: "Activate on this page" button in the popup

**Files:**
- Modify: `extension/src/popup/popup.html:54-56`
- Modify: `extension/src/popup/popup.ts`

- [ ] **Step 1: Add the button to the markup**

In `extension/src/popup/popup.html`, after the `disconnect` button (line 56), add:

```html
    <button id="activate" class="sec">Activate on this page</button>
```

- [ ] **Step 2: Wire it up in `popup.ts`**

In `extension/src/popup/popup.ts`, add to the element handles (after line 11):

```ts
const activateBtn = $<HTMLButtonElement>("activate");
```

Then add a handler (before the final `void refresh();` on line 57):

```ts
activateBtn.addEventListener("click", async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) { setMsg("No active tab."); return; }
  // Broadcast to all frames; the frame with a form will engage.
  chrome.tabs.sendMessage(tab.id, { type: "trackr:activate" }, () => {
    // Swallow "no receiving end" when the content script isn't injected here.
    void chrome.runtime.lastError;
  });
  setMsg("Activated — look bottom-right of the page.", true);
  setTimeout(() => window.close(), 700);
});
```

- [ ] **Step 3: Manual verification (load unpacked)**

```bash
cd extension && npm run build
```

Then in Edge/Chrome → Extensions → Load unpacked → select `extension/dist`. Open any form page (e.g. a Google Form), click the toolbar icon → "Activate on this page". Expected: the Trackr panel mounts bottom-right and runs the plan (or shows the connect prompt if not connected).

- [ ] **Step 4: Commit**

```bash
git add extension/src/popup/popup.html extension/src/popup/popup.ts
git commit -m "feat(ext): popup 'Activate on this page' triggers the copilot manually"
```

---

## Phase C — Repair auto-detection

### Task 6: Refresh the Greenhouse adapter for the new job board

**Files:**
- Modify: `extension/src/content/adapters/greenhouse.ts:6-14`

- [ ] **Step 1: Broaden host match and form selectors**

Replace the `matches` and `formContainer` in `extension/src/content/adapters/greenhouse.ts`:

```ts
  matches: (host) =>
    host.includes("greenhouse.io") || host.includes("boards.greenhouse.io"),
  formContainer() {
    return (
      document.querySelector("#application_form") ??       // classic boards
      document.querySelector("#application-form") ??       // new job board
      document.querySelector('form[id*="application" i]') ??
      document.querySelector('form[action*="greenhouse"]') ??
      document.querySelector("main form") ??               // job-boards.greenhouse.io
      findApplicationForm()
    );
  },
```

(`host.includes("greenhouse.io")` already covers `job-boards.` and `boards.` subdomains; the explicit `boards.` clause documents intent.)

- [ ] **Step 2: Typecheck**

Run: `cd extension && npm run typecheck`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add extension/src/content/adapters/greenhouse.ts
git commit -m "fix(ext): greenhouse adapter handles new job-board markup"
```

### Task 7: Verify form-less clusters auto-detect (regression guard)

**Files:**
- Test: `extension/src/content/detect.test.ts` (append)

> `index.ts:formContainer()` already falls back to `document.body` when `looksLikeApplication()` is true and no `<form>` exists. Task 4 lowered the threshold; this task locks that behavior in so it can't regress.

- [ ] **Step 1: Write the failing/should-pass test**

Append to `extension/src/content/detect.test.ts`:

```ts
describe("looksLikeApplication — form-less layouts", () => {
  it("detects a cluster of inputs not wrapped in a <form>", () => {
    document.body.innerHTML = `
      <div><input type="text"/></div>
      <div><input type="email"/></div>
      <div><input type="tel"/></div>
      <div><textarea></textarea></div>`;
    expect(looksLikeApplication()).toBe(true);
  });

  it("ignores a single stray search box", () => {
    document.body.innerHTML = `<input type="search" placeholder="Search"/>`;
    expect(looksLikeApplication()).toBe(false);
  });
});
```

- [ ] **Step 2: Run**

Run: `cd extension && npm test -- detect`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add extension/src/content/detect.test.ts
git commit -m "test(ext): lock in form-less cluster detection"
```

---

## Phase D — Iframe embeds (`all_frames`)

### Task 8: Inject into sub-frames with a size guard

**Files:**
- Modify: `extension/manifest.json:20-26`
- Modify: `extension/src/content/index.ts` (the `init` function, lines 105-110)

- [ ] **Step 1: Enable `all_frames` for the page content script**

In `extension/manifest.json`, change the first `content_scripts` entry (lines 21-26) to include `all_frames`:

```json
    {
      "matches": ["<all_urls>"],
      "exclude_matches": ["http://localhost:3000/*", "https://trackr-brown.vercel.app/*"],
      "js": ["src/content/index.ts"],
      "all_frames": true,
      "run_at": "document_idle"
    },
```

- [ ] **Step 2: Guard tiny sub-frames so ads/widgets don't spawn cues**

In `extension/src/content/index.ts`, update `init` (lines 105-110):

```ts
function init() {
  if (mounted) return;
  // In sub-frames, only bother with reasonably sized frames (skip ad/util iframes).
  if (window.top !== window && window.innerWidth * window.innerHeight < 90_000) return;
  if (!formContainer()) return;
  mounted = true;
  mountCue(() => { panel.mount(); panel.setStatus(""); void engage(); });
}
```

- [ ] **Step 3: Manual verification**

```bash
cd extension && npm run build
```

Reload the unpacked extension. Visit a careers page that embeds Greenhouse/Lever in an iframe (or any page with a sizeable form iframe). Expected: the cue appears anchored to the iframe that holds the form; tiny iframes produce no cue. The toolbar "Activate" button also reaches the iframe (broadcast covers all frames).

- [ ] **Step 4: Commit**

```bash
git add extension/manifest.json extension/src/content/index.ts
git commit -m "feat(ext): inject in all frames with a sub-frame size guard for iframed forms"
```

---

## Phase E — Google Forms / ARIA widgets

### Task 9: ARIA control discovery + fill module

**Files:**
- Create: `extension/src/content/aria-controls.ts`
- Test: `extension/src/content/aria-controls.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `extension/src/content/aria-controls.test.ts`:

```ts
import { describe, it, expect, beforeEach } from "vitest";
import { collectAriaControls, fillAriaControl } from "./aria-controls";

beforeEach(() => { document.body.innerHTML = ""; });

const RADIO_GROUP = `
  <div role="radiogroup" aria-label="Are you eligible to work in the UK?">
    <div role="radio" aria-label="Yes"></div>
    <div role="radio" aria-label="No"></div>
  </div>`;

describe("collectAriaControls", () => {
  it("finds a radiogroup with its options", () => {
    document.body.innerHTML = RADIO_GROUP;
    const controls = collectAriaControls(document.body);
    expect(controls.length).toBe(1);
    expect(controls[0].type).toBe("radio");
    expect(controls[0].label).toBe("Are you eligible to work in the UK?");
    expect(controls[0].options.map((o) => o.label)).toEqual(["Yes", "No"]);
  });

  it("finds a listbox as a select", () => {
    document.body.innerHTML = `
      <div role="listbox" aria-label="Country">
        <div role="option" aria-label="United Kingdom"></div>
        <div role="option" aria-label="United States"></div>
      </div>`;
    const [c] = collectAriaControls(document.body);
    expect(c.type).toBe("select");
    expect(c.options.length).toBe(2);
  });
});

describe("fillAriaControl", () => {
  it("clicks the matching option", () => {
    document.body.innerHTML = RADIO_GROUP;
    const [c] = collectAriaControls(document.body);
    let clicked = "";
    c.options.forEach((o) => o.el.addEventListener("click", () => (clicked = o.label)));
    expect(fillAriaControl(c, "Yes")).toBe(true);
    expect(clicked).toBe("Yes");
  });

  it("returns false when no option matches", () => {
    document.body.innerHTML = RADIO_GROUP;
    const [c] = collectAriaControls(document.body);
    expect(fillAriaControl(c, "Maybe")).toBe(false);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd extension && npm test -- aria-controls`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the module**

Create `extension/src/content/aria-controls.ts`:

```ts
/**
 * Google Forms (and some custom ATS) render radios, checkboxes, and dropdowns as
 * ARIA widgets (<div role="radio">…) rather than native inputs, so the native
 * serializer/​autofill miss them. This module discovers those widgets, exposes
 * them as synthetic fields, and fills them by clicking the chosen option.
 */
import type { FieldType } from "../shared/types";

export interface AriaControl {
  kind: "aria";
  type: Extract<FieldType, "radio" | "select">;
  root: HTMLElement;
  label: string;
  options: { label: string; el: HTMLElement }[];
  required: boolean;
}

function ariaLabel(el: Element): string {
  const direct = el.getAttribute("aria-label");
  if (direct) return direct.replace(/\s+/g, " ").trim();
  const by = el.getAttribute("aria-labelledby");
  if (by) {
    const ref = by
      .split(/\s+/)
      .map((id) => document.getElementById(id)?.textContent ?? "")
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();
    if (ref) return ref;
  }
  return "";
}

/** Discover ARIA radiogroups and listboxes under root. */
export function collectAriaControls(root: ParentNode): AriaControl[] {
  const controls: AriaControl[] = [];

  root.querySelectorAll<HTMLElement>('[role="radiogroup"]').forEach((group) => {
    const options = Array.from(group.querySelectorAll<HTMLElement>('[role="radio"]'))
      .map((el) => ({ label: ariaLabel(el), el }))
      .filter((o) => o.label);
    if (options.length) {
      controls.push({
        kind: "aria", type: "radio", root: group,
        label: ariaLabel(group), options,
        required: group.getAttribute("aria-required") === "true",
      });
    }
  });

  root.querySelectorAll<HTMLElement>('[role="listbox"]').forEach((box) => {
    const options = Array.from(box.querySelectorAll<HTMLElement>('[role="option"]'))
      .map((el) => ({ label: ariaLabel(el), el }))
      .filter((o) => o.label && o.label.toLowerCase() !== "choose");
    if (options.length) {
      controls.push({
        kind: "aria", type: "select", root: box,
        label: ariaLabel(box), options,
        required: box.getAttribute("aria-required") === "true",
      });
    }
  });

  return controls;
}

/** Fill an ARIA control by clicking the option whose label best matches value. */
export function fillAriaControl(control: AriaControl, value: string): boolean {
  const v = value.toLowerCase().trim();
  const match =
    control.options.find((o) => o.label.toLowerCase().trim() === v) ??
    control.options.find((o) => v !== "" && o.label.toLowerCase().includes(v));
  if (!match) return false;
  match.el.click();
  return true;
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `cd extension && npm test -- aria-controls`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add extension/src/content/aria-controls.ts extension/src/content/aria-controls.test.ts
git commit -m "feat(ext): discover + fill ARIA radio/listbox widgets (Google Forms)"
```

### Task 10: Fold ARIA controls into serialize + autofill

**Files:**
- Modify: `extension/src/content/autofill.ts` (add `FillTarget` union; route ARIA fills)
- Modify: `extension/src/content/serialize.ts` (append ARIA controls)
- Test: `extension/src/content/serialize.test.ts` (append integration test)

- [ ] **Step 1: Add the `FillTarget` union and route ARIA fills in `autofill.ts`**

In `extension/src/content/autofill.ts`, add near the imports (after line 51):

```ts
import { type AriaControl, fillAriaControl } from "./aria-controls";

/** Anything the planner can target: a native field or a synthetic ARIA widget. */
export type FillTarget = FillableEl | AriaControl;

function isAria(el: FillTarget): el is AriaControl {
  return (el as AriaControl).kind === "aria";
}
```

Change `PlanQuestion.el` (line 55) from `FillableEl` to `FillTarget`:

```ts
  el: FillTarget;          // native field, OR an ARIA radio/listbox widget
```

Update `applyPlan`'s `elements` parameter type (line 70) and `setFieldValue` (line 106) to accept `FillTarget`, and short-circuit ARIA at the top of `setFieldValue`:

```ts
export function applyPlan(
  plan: FillPlanItem[],
  elements: Map<string, FillTarget>,
  schemaById: Map<string, FieldSchema>,
): AppliedPlan {
```

```ts
export function setFieldValue(el: FillTarget, value: string): boolean {
  if (isAria(el)) return fillAriaControl(el, value);
  if (el instanceof HTMLSelectElement) return fillSelect(el, value);
  // …unchanged below…
```

> The `draft` branch in `applyPlan` checks `el instanceof HTMLTextAreaElement`, which is correctly `false` for ARIA controls — they never become drafts. No change needed there.

- [ ] **Step 2: Append ARIA controls in `serialize.ts`**

In `extension/src/content/serialize.ts`:

Update imports (line 1-2) to add the ARIA helpers and the shared `FillTarget`:

```ts
import { getLabelText, collectFields, type FillableEl } from "./field-map";
import { collectAriaControls } from "./aria-controls";
import type { FillTarget } from "./autofill";
import type { FieldSchema, FieldType } from "../shared/types";
```

Change `SerializedForm.elements` (line 6) to the wider type:

```ts
export interface SerializedForm {
  fields: FieldSchema[];
  elements: Map<string, FillTarget>;
}
```

And change the map type inside `serializeForm` (line 33):

```ts
  const elements = new Map<string, FillTarget>();
```

Before the `return` (line 66), append ARIA controls discovered in the same root:

```ts
  for (const control of collectAriaControls(root)) {
    const id = `f${i++}`;
    elements.set(id, control);
    fields.push({
      id,
      label: control.label,
      type: control.type,
      options: control.options.map((o) => o.label),
      required: control.required,
    });
  }
```

- [ ] **Step 3: Add an integration test**

Append to `extension/src/content/serialize.test.ts`:

```ts
import { serializeForm } from "./serialize";

describe("serializeForm + ARIA", () => {
  it("serializes native inputs and ARIA radiogroups together", () => {
    document.body.innerHTML = `
      <input id="e" type="email"/><label for="e">Email</label>
      <div role="radiogroup" aria-label="Sponsorship needed?">
        <div role="radio" aria-label="Yes"></div>
        <div role="radio" aria-label="No"></div>
      </div>`;
    const { fields, elements } = serializeForm(document.body);
    const radio = fields.find((f) => f.label === "Sponsorship needed?");
    expect(radio?.type).toBe("radio");
    expect(radio?.options).toEqual(["Yes", "No"]);
    expect(elements.size).toBe(fields.length);
  });
});
```

- [ ] **Step 4: Run tests + typecheck**

Run: `cd extension && npm test`
Expected: PASS (serialize + aria-controls + detect).
Run: `cd extension && npm run typecheck`
Expected: no errors.

> If `npm run typecheck` reports a circular-import type error between `serialize.ts` and `autofill.ts`, move the `FillTarget` definition into `field-map.ts` (which both already import) and update both imports accordingly.

- [ ] **Step 5: Manual verification on a real Google Form**

```bash
cd extension && npm run build
```

Reload unpacked. Open a Google Form containing a multiple-choice question. Click toolbar → "Activate on this page". Expected: the panel lists the multiple-choice question (as an "ask" with a dropdown of its options), and choosing an option clicks the matching radio in the form.

- [ ] **Step 6: Commit**

```bash
git add extension/src/content/autofill.ts extension/src/content/serialize.ts extension/src/content/serialize.test.ts
git commit -m "feat(ext): serialize + fill ARIA widgets through the plan pipeline"
```

---

## Phase F — Surface server errors in the panel

### Task 11: Show the real plan error to the user

**Files:**
- Modify: `extension/src/content/index.ts` (the `engage` plan-failure branch, line 84)

> The plan route already returns a human-readable `error` ("No usable form fields were found on this page."). `engage` already surfaces `res.error`; this task verifies it and tightens the fallback copy.

- [ ] **Step 1: Confirm the error path passes the message through**

In `extension/src/content/index.ts`, the plan-failure line (currently line 84) should read:

```ts
  if (!res.ok || !res.data?.plan) {
    panel.showError(res.error || "Couldn’t plan this form. Try reloading the page.");
    return;
  }
```

- [ ] **Step 2: Manual verification**

With a connected extension, activate on a page with no real fields (e.g. a blank tab with one stray input). Expected: the panel shows "No application form found on this page." or the server's "No usable form fields…" message — never a silent failure.

- [ ] **Step 3: Commit**

```bash
git add extension/src/content/index.ts
git commit -m "fix(ext): surface the server's plan error text in the panel"
```

---

## Final verification

- [ ] **Server suite:** `npm test` (repo root) → all green, including new `sanitizePlanBody` tests.
- [ ] **Extension suite:** `cd extension && npm test` → all green (serialize, detect, aria-controls).
- [ ] **Typecheck:** `cd extension && npm run typecheck` and repo-root `npm run lint` → no new errors.
- [ ] **Build:** `cd extension && npm run build` → succeeds; `dist/` reloads cleanly.
- [ ] **End-to-end smoke (manual):**
  - Google Form → toolbar "Activate" → panel mounts, multiple-choice shows as an ask.
  - A Greenhouse `job-boards.greenhouse.io` posting → cue auto-appears; planning returns without "Invalid request".
  - A form with a 1,000-char consent label → planning succeeds (label truncated, not 400).

---

## Self-Review Notes

- **Spec coverage:** Each of the 5 root causes maps to a phase (1→A, 2→B/C, 3→B, 4→D, 5→E). Error surfacing (F) covers the "fails silently" sub-symptom.
- **Type consistency:** `FillTarget` is introduced in Task 10 and used consistently across `autofill.ts`/`serialize.ts`; `AriaControl.type` is constrained to `"radio" | "select"` so it always satisfies `FieldType`. `sanitizePlanBody` (server) and `clampFields`/`LIMITS` (client) use identical numeric bounds.
- **Known limitations (intentional, YAGNI):** ARIA *checkbox* multi-select and Google Forms grid questions are out of scope (radios + listboxes cover the common cases). Multiple large form-bearing iframes on one page could spawn multiple cues — acceptable and rare. Adapter selectors will still rot over time; the manual "Activate" button is the durable escape hatch.
