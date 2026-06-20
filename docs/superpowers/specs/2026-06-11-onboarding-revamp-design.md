# Onboarding Revamp: Frictionless Wizard + Memory Sync

**Date:** 2026-06-11
**Status:** Approved

## Goals

1. Onboarding answers (and later profile edits) are written into the user's
   memory (`profile.md`) so Cyclops knows them from the first chat.
2. Onboarding friction drops from 8 wizard steps to 3, with only one mandatory
   step. Mandatory fields: university, degree subject, course/degree type,
   graduation year, current year of study, role family targets.
3. CV upload becomes a real (optional) upload during onboarding, with AI
   extraction of CV content into memory.
4. All other questions collapse into a single optional questionnaire page that
   remains editable after onboarding.

## Current state (verified 2026-06-11)

- Wizard: 8 steps in `src/components/onboarding/onboarding-wizard.tsx`
  (Welcome, Education, Interests, Eligibility, Preferences, Review, Writing,
  Stories). Submission via `completeOnboarding()` in
  `src/server/actions/onboarding.ts`.
- `completeOnboarding()` writes Profile / Preferences / ApplyProfile rows and
  sets `User.onboardedAt`, but never touches memory files. `updateSettings()`
  (`src/server/actions/settings.ts`) has the same gap.
- Memory: canonical files `profile.md` / `voice.md` / `strategy.md` managed by
  `src/server/memory/service.ts` with revision history. Fact lines are
  appended/updated by `applyFact()` in `src/server/memory/facts.ts` (currently
  only used by the extension's `/api/ext/fact` route).
- CV upload in onboarding is filename-only. Real upload + text extraction
  (unpdf / mammoth → `ApplyProfile.cvText`, ≤24k chars) exists in Settings via
  `uploadCvAction()` (`src/server/actions/applyProfile.ts`).
- `Profile.workAuth` is a non-nullable enum in `prisma/schema.prisma`.

## Design

### 1. Wizard restructure (8 steps → 3)

**Step 1 — Essentials (mandatory; completes onboarding).**
One page collecting: university, degree subject, degree type, graduation year,
current year of study, role family targets (≥1). Submitting calls the slimmed
`completeOnboarding()` which:

- validates the new `essentialsSchema`;
- upserts Profile (education fields) and Preferences (`targetRoleFamilies`;
  `openToAnywhereUk` defaults to `true` until the user says otherwise);
- sets `User.onboardedAt`;
- syncs facts to memory (section 3);
- recomputes match scores.

The user is fully onboarded after step 1. Steps 2–3 are progressive
enhancement; abandoning the wizard after step 1 leaves a valid account.

**Step 2 — CV upload (optional, skippable).**
Real upload reusing the `uploadCvAction()` machinery (PDF/DOCX/DOC/TXT,
10 MB cap, text extraction to `ApplyProfile.cvText`). On success, CV facts are
extracted to memory (section 4). Prominent "Skip for now"; the identical
upload remains available in Settings. The old filename-hint field is removed.

**Step 3 — Quick questionnaire (optional, single page, skippable).**
All remaining fields, every one optional:

- work authorization (button group)
- grades: A-levels, GCSEs, degree grade/GPA
- skills (tag input, ≤20)
- preferred UK locations + "open to anywhere UK" toggle
- target employers (tag input, ≤40)
- Writing (voice sample) — collapsed section reusing `WritingStep` internals
- Stories — collapsed section reusing `StoriesStep` internals

Saved via a new `saveQuestionnaire()` server action; finish or skip routes to
the dashboard. Welcome and Review steps are deleted. localStorage autosave is
kept with the key bumped to `cyclops.onboarding.v2` (old `v1` state is
discarded, not migrated — pre-launch data only).

### 2. Schema & validation changes

- **Migration:** `Profile.workAuth` becomes nullable. Matching treats `null`
  as "unknown — do not penalize". The dashboard may nudge the user to provide
  it since it improves match quality (nudge UI is out of scope for this spec).
- **Defaults:** no locations answered → `openToAnywhereUk = true`.
- **Validation** (`src/lib/validation.ts`): the merged `onboardingSchema` is
  replaced by:
  - `essentialsSchema` — university, degreeSubject, degreeType,
    graduationYear, currentYear, targetRoleFamilies (all required; reuse
    existing per-field rules);
  - `questionnaireSchema` — all step-3 fields, all optional.

### 3. Memory sync (closes the main gap)

New module `src/server/memory/sync.ts`:

```
syncProfileFactsToMemory(userId: string, reason: string): Promise<void>
```

Reads Profile + Preferences and applies deterministic fact lines to
`profile.md` via the existing `applyFact()` (update-in-place by label,
sanitized, no-op when unchanged). Labels written when data exists:

- `university`, `degree` (subject + type), `graduation year`,
  `current year of study`, `targeting` (role families), `work authorization`,
  `preferred locations` (or "anywhere in the UK"), `skills`,
  `target employers`, `grades`.

Writes go through `memoryService.write()` (author `CYCLOPS`) so revisions are
recorded with the supplied reason ("onboarding completed", "questionnaire
updated", "settings updated").

Call sites: `completeOnboarding()`, `saveQuestionnaire()`, and the existing
`updateSettings()`. Memory failures are logged and never fail the user-facing
action.

### 4. CV → memory (LLM extraction)

After `uploadCvAction()` stores `cvText`, an LLM pass (same Claude infra as
Cyclops) distills the CV into **≤8 concise facts** — experience highlights,
notable skills, achievements — written to `profile.md` via `applyFact()` with
reason "extracted from CV". Properties:

- runs on every CV upload path (onboarding step 2 and Settings);
- replaces prior CV facts by label (`applyFact` update-in-place; the prompt
  asks for stable labels like `cv highlight 1..n`);
- extraction failure is non-blocking and logged, matching the existing CV
  parse philosophy (file + text still stored).

### 5. Updatable later (single source of truth)

The step-3 questionnaire is extracted as a shared component rendered in both
the wizard and the Settings page. The overlapping fields in
`settings-form.tsx` are replaced by this component so there are not two
drifting forms. Both paths submit `saveQuestionnaire()` → memory sync →
match-score recompute. Education/essentials fields remain editable in Settings
as today, with `updateSettings()` now also syncing memory.

### 6. Error handling

- Memory writes: try/catch around sync; log and continue. Onboarding must
  never fail because of a memory error.
- CV extraction (text or LLM): non-blocking; the upload still succeeds and the
  user can paste text manually as today.
- Step-1 validation errors surface per-field as the wizard does today.

### 7. Testing

TDD throughout:

- Unit: `syncProfileFactsToMemory` (fact formatting, update-in-place on
  re-run, partial data omits absent labels, failure isolation);
  `essentialsSchema` / `questionnaireSchema`; CV fact extraction with a mocked
  model (≤8 facts, stable labels, failure path).
- Integration: `completeOnboarding` seeds `profile.md` and sets
  `onboardedAt`; `saveQuestionnaire` and `updateSettings` update facts;
  re-running sync does not duplicate lines.
- Manual: full wizard run-through including skip-everything path and
  CV upload path.

## Out of scope

- Dashboard nudges for missing optional fields (work auth, CV).
- Migrating existing users' rows into memory retroactively (can be a
  follow-up one-off script).
- Changes to voice.md / strategy.md handling beyond reusing existing
  Writing/Stories persistence.
