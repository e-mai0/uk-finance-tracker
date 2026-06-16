# Unified CV page — design

**Date:** 2026-06-15
**Status:** Approved design, pre-implementation
**Author:** Cyclops (with Eric)

## Problem

The CV feature is split into two disconnected concepts and two pages, and the
assistant re-asks for information the app already has.

1. **Two CV artifacts that never meet.**
   - *Uploaded CV* — `ApplyProfile.cvText` + the stored file, created by the
     onboarding "Upload your CV" step or Settings. Used **only** to distill a
     few grounding facts into `profile.md`. Never editable, never exportable.
   - *Built CV* — `BuiltCv.data` (a structured `CvData`), created by the
     `/cv-builder` form + chat. This is the only thing that exports to PDF/Word.
   A user who uploads a CV cannot revise or export it; a user who builds one has
   a second, unrelated document.

2. **Two pages.** `/cv-builder` (form + chat + preview) and `/my-cv` (read-only
   + download) are separate nav entries for one job.

3. **Cyclops re-asks what it knows.** `cv-brain.ts` loads only `BuiltCv.data` +
   `formInput`. It never reads the onboarding `Profile` (university, degree,
   graduation year), `ApplyProfile` (contact, uploaded CV text), `User` (name,
   email), or `profile.md` memory facts — so it interrogates the user for
   things captured during onboarding.

4. **The builder form cannot capture a real finance CV.** The 3-step form is
   Education / Accomplishments / Projects — there is **no Experience step**. A
   typical user CV (validated against Eric's real CV) has six experience entries
   (Millennium, Artifact AI, Deloitte, CamSIF, CIBS, Morgan Stanley) — the most
   important section — which the form structurally cannot collect. The form also
   imposes a separate "Accomplishments" section, whereas real CVs fold
   awards/olympiads into education bullets.

The underlying `CvData` schema (`src/lib/cv.ts`) is sound: it already models
`experience`, `projects` (with `result`), grouped `skills`, `interests`, and
free-form `sections`. **The schema stays; the rigid form goes.**

## Goals

- One CV artifact (`BuiltCv.data`) that every path reads and writes.
- One page (`/cv`) for build, revise, and export.
- Cyclops drafts from known data and never re-asks for it.
- Uploading a CV produces an editable, exportable structured CV.

## Non-goals (YAGNI)

- Multiple CVs / CV versioning per user (one CV per user, as today).
- Per-application tailored CVs.
- Direct inline field editing on `/cv` (v1 is chat + confirm only; deferred).
- Auto-running the draft after onboarding (`/cv` always lands on the empty
  state; the user clicks to build).
- A bespoke PDF rendering library — keep the existing browser print-to-PDF.
- Changing the grounding pipeline (`syncCvGrounding`) — it already serialises
  `BuiltCv` → `cvText` → `profile.md` and stays as-is.

## Locked decisions

1. **One CV everywhere.** Uploads are parsed into `CvData` and saved to
   `BuiltCv`; the original file stays in storage as a record but the editable
   CV is the parsed structured data.
2. **Build = AI-drafted outline.** Cyclops drafts a full `CvData` from known
   data, shows it as an editable preview, asks only about genuine gaps, the user
   edits/confirms, then exports. No blank form.
3. **Onboarding offers three choices** — Upload / Build with Cyclops / Skip —
   and defers the actual build to `/cv` (keeps onboarding fast).

## Architecture

### Data model

No schema migration required. `BuiltCv.data` (JSON `CvData`) remains the single
source of truth. `BuiltCv.formInput` is no longer written by the new flow; it is
left in place for backward compatibility and ignored. The existing pending SQL
gate `prisma/sql/2026-06-14-cv-builder.sql` (BuiltCv table + `ChatSession.kind`)
remains a prerequisite — this work does not add to it.

### New server module: `src/server/cv/known-profile.ts`

`gatherKnownProfile(userId): Promise<KnownProfile>` — assembles a compact,
read-only context block from everything the app already knows:

- `User` → name, email
- `Profile` → university, degreeSubject, degreeType, graduationYear, currentYear
- `ApplyProfile` → phone, addressCity, linkedinUrl, githubUrl, websiteUrl,
  and `cvText` (raw uploaded CV text, if any)
- `profile.md` memory facts via `memoryService.read` (including `cv highlight N`)

Returns a typed object plus a `toPromptBlock()` string helper. Used by both the
initial AI draft and the chat system prompt. This is the fix for problem #3.

### New server action: parse upload → CvData

`src/server/actions/cv.ts` gains `importCvFromUpload(userId)` (or the upload
action calls it): after `extractCvText` produces `cvText`, an AI call
(`generateObject`, schema = `cvDataSchema`, model = `sonnet`) converts the text
into a structured `CvData`, which is persisted via `persistCv`. Mirrors the
existing best-effort, budget-checked pattern in `extractCvFactsToMemory` /
`buildCv`. If the API key is missing or the budget is exhausted, the upload
still succeeds (file + grounding facts) and `/cv` falls back to the build flow.
`uploadCvAction` in `applyProfile.ts` is extended to trigger this so an uploaded
CV becomes immediately editable.

### New server action: draft from known data

`draftCvFromKnown(userId)` in `src/server/actions/cv.ts`: builds a `CvData` from
`gatherKnownProfile` via one `generateObject` call (schema = `cvDataSchema`).
Seeds contact + education deterministically from `Profile`/`User`/`ApplyProfile`,
then lets the model lay out a first-pass outline (it must not fabricate facts;
only use what `KnownProfile` provides). Persists via `persistCv`. This is the
"Cyclops outlines what it'll put on the CV" step.

### Chat brain update

`cv-brain.ts` `buildCvSystemPrompt` gains the `KnownProfile.toPromptBlock()`
context and an instruction: *the user's degree/university/grad-year/contact and
CV highlights are already known — never ask for them; ask only about genuine
gaps (work experience, project detail, quantified outcomes).* The `formInput`
section is removed. `update_cv` tool is unchanged.

### Page consolidation

- **New `/cv`** (`src/app/(app)/cv/page.tsx`) replaces `/cv-builder` and
  `/my-cv`. Server component: `ensureCvChatSession`, `getBuiltCv`,
  `gatherKnownProfile`, load chat history, render `CvPageClient`.
- **`CvPageClient`** (replaces `CvBuilderClient`) has two states:
  - **No CV** → entry screen with two actions: **Build with Cyclops**
    (calls `draftCvFromKnown`, then shows the CV + chat) and **Upload a CV**
    (file input → `uploadCvAction` → parsed → CV + chat).
  - **Has CV** → CV document centre stage, a **Refine with Cyclops** chat panel
    (existing `CvChat` + live preview lift), and **Download PDF / Word**. This
    absorbs the old `/my-cv` view.

  **v1 scope: chat + confirm only — no direct field editing.** All CV changes
  go through Cyclops chat (`update_cv`). Direct inline field editing is
  explicitly deferred to a later iteration.

  Print stays at `/cv-print` (no rename); only its no-CV fallback `redirect`
  changes from `/cv-builder` to `/cv`.
- The rigid 3-step `EducationStep`/`AccomplishmentsStep`/`ProjectsStep` form and
  `buildCv(formInput)` path are **removed**. Chat refinement replaces them.
  `cvFormInputSchema` / `formInputToCvData` become dead code and are deleted
  with their tests.
- **Nav:** `src/components/app-nav.tsx` — replace the two entries (`/cv-builder`
  "CV Builder", `/my-cv` "My CV") with a single `{ href: "/cv", label: "My CV" }`.
- **Redirects:** `/cv-builder` and `/my-cv` become thin redirects to `/cv` (keep
  old links/bookmarks working). `/cv-print` stays (or moves to `/cv/print`);
  update its `redirect("/cv-builder")` fallback to `/cv`. `getBuiltCv`'s
  `revalidatePath` targets update to `/cv`.

### Onboarding

`src/components/onboarding/cv-step.tsx` gains a three-way choice:
- **Upload my CV** → existing `uploadCvAction` (now also parses to `CvData`).
- **Build with Cyclops** → marks intent and continues; after onboarding the user
  lands on (or is nudged to) `/cv` to run `draftCvFromKnown`.
- **Skip for now** → unchanged.

No build work runs inside onboarding (decision #3). The "Build with Cyclops"
button just continues the wizard. **`/cv` always lands on the empty state and
never auto-runs the draft** — `draftCvFromKnown` fires only when the user clicks
"Build with Cyclops" on `/cv`. No persisted "intent" flag is needed.

## Data flow

```
Upload file ─▶ extractCvText ─▶ AI parse ─▶ CvData ─┐
Build w/ Cyclops ─▶ gatherKnownProfile ─▶ AI draft ─┼─▶ BuiltCv.data ◀─ chat update_cv
                                                     │         │
                                                     │         ├─▶ CvDocument (preview + /cv view)
                                                     │         ├─▶ /cv-print ─▶ browser Save-as-PDF
                                                     │         ├─▶ /api/cv/docx ─▶ Word
                                                     │         └─▶ syncCvGrounding ─▶ cvText + profile.md
```

## Error handling

- All AI steps (parse, draft, chat) are best-effort and budget-checked; failure
  never blocks the underlying action (upload still stores the file; the empty
  state still offers manual build via chat).
- `cvDataSchema.safeParse` guards every AI output before persisting; invalid
  output is discarded with a console error, never persisted.
- Missing `ANTHROPIC_API_KEY` → parse/draft are skipped; `/cv` shows the empty
  state or the unparsed upload record, and chat is disabled with the existing
  budget message.

## Testing

- `known-profile.test.ts` — `gatherKnownProfile` assembles all four sources;
  `toPromptBlock` is stable and omits absent fields.
- `cv parse` — AI parse output validates against `cvDataSchema`; malformed
  output is rejected; missing key path is a no-op that still succeeds.
- `draftCvFromKnown` — seeds contact/education deterministically; never
  fabricates beyond `KnownProfile`.
- Page state — empty state renders both actions; populated state renders the
  document + export controls.
- Redirect tests — `/cv-builder` and `/my-cv` redirect to `/cv`.
- Keep/adapt existing passing tests; delete `formInput`-only tests with the
  retired form.

## Migration / rollout

- No DB migration. Depends on the existing pending gate
  `prisma/sql/2026-06-14-cv-builder.sql` being applied (user runs SQL).
- Existing built CVs keep working (same `BuiltCv.data`). Existing uploaded-only
  users get an editable CV the next time they upload, or via Build with Cyclops.
