# CV Builder: Guided Form + Conversational Assistant + My CV

**Date:** 2026-06-13
**Status:** Draft (awaiting review)

## Goals

1. A new **CV Builder** page (`/cv-builder`) with a 3-step form collecting
   **Education (years, grades)**, **Academic accomplishments**, and **Related
   projects**.
2. The form seeds a structured CV; a **dedicated chatbot assistant** then drafts
   and refines it conversationally. The user can tell it what else to add, and
   the bot **proactively prompts for missing information** (e.g. work
   experience, skills) — one question at a time.
3. A separate **My CV** page (`/my-cv`) shows the saved CV and offers
   **Download as PDF** and **Download as Word (.docx)**, available at all times.
4. The built CV **feeds Cyclops' grounding** (cover letters, application
   answers) the same way an uploaded CV does today.

The model CV (`Eric_Mai_CV`, supplied by the user) is the quality and structure
template: a one-line contact header; Education with college + free-text date
range + grade/modules/activities/prizes bullets; an Experience section;
a Projects & Competitions section with placement/result lines; and a grouped
Skills & Interests section.

## Non-goals

- No multiple CV variants / versioning in v1 (one CV per user, like
  `ApplyProfile`). History/variants can come later.
- No rich WYSIWYG editor — editing is via the form (structured fields) and the
  chatbot. The preview is read-only.
- No automated tailoring of the CV to a specific job posting (that is the
  separate `CV_TAILOR` draft path). This feature builds the base CV.

## Current state (verified 2026-06-13)

- **Routing/auth:** authenticated pages live under the `(app)` route group;
  `src/app/(app)/layout.tsx:13-15` runs `auth()` and redirects to `/login` /
  `/onboarding`. `src/middleware.ts` + `src/server/auth.config.ts:35-42` gate
  app prefixes on the `onboarded` flag. Nav is the `NAV` array at
  `src/components/app-nav.tsx:10-17`; active state is
  `pathname === href || pathname.startsWith(href + "/")` (so sibling,
  non-nested hrefs are required).
- **Chatbot infra (AI SDK v6):** `useChat` (`@ai-sdk/react` 3.x) +
  `DefaultChatTransport` with `prepareSendMessagesRequest` →
  `src/app/(app)/chat/cyclops-chat.tsx`; server `streamCyclops`
  (`src/server/ai/brain.ts`) calls `streamText({ model, messages, tools,
  stopWhen: stepCountIs(12), onStepFinish })` with a `role:"system"`
  `ModelMessage` carrying Anthropic `cacheControl` provider options. Route
  `src/app/api/chat/route.ts` validates a **text-only** body, persists messages
  to `ChatSession`/`ChatMessage`, and returns
  `result.toUIMessageStreamResponse({ originalMessages, consumeSseStream, onFinish })`.
  `rowToUIMessage` (`src/server/chat/messages.ts:7-24`) maps rows → `UIMessage`.
- **Tools:** `buildTools(userId)` (`src/server/ai/tools.ts:19`) returns
  `tool({ description, inputSchema: z.object({...}), execute: async (args) => ({...}) })`;
  `execute` returns a plain object (or `{ error }`) which becomes the tool
  **output** the client reads in state `output-available`
  (`cyclops-chat.tsx:50-57`).
- **AI plumbing:** `sonnet` / `haiku` from `src/server/ai/models.ts`
  (`SONNET_ID="claude-sonnet-4-6"`); `checkBudget(userId) → {ok, spent}` and
  `recordUsage(userId, tokens)` (`src/server/ai/budget.ts`); `generateObject`
  + Zod usage and `extractCvFactsToMemory(userId, cvText)` in
  `src/server/cv/facts.ts:36-79`; `after()` from `next/server`
  (`api/chat/route.ts:130-138`).
- **CV today:** uploaded file → `extractCvText` (`src/server/cv/parse.ts`,
  unpdf/mammoth) → `ApplyProfile.cvText` (set only in `uploadCvAction`,
  `src/server/actions/applyProfile.ts:88-105`) → grounds drafting; facts are
  distilled to `profile.md` via `extractCvFactsToMemory`.
- **Download pattern:** `src/app/api/saved/calendar/route.ts` — `runtime="nodejs"`,
  `dynamic="force-dynamic"`, `auth()` guard, `new Response(body, { headers: {
  "content-type", "content-disposition": 'attachment; filename="…"' }})`.
- **DB conventions:** Prisma 6 on Supabase; one-per-user rows use
  `@unique` on `userId` (e.g. `ApplyProfile`, `schema.prisma:303`); `Json`
  columns used for structured data (`MatchScore.reasons:239`); ids are
  `@default(cuid())`. **Migrations use `prisma db push`** (script `db:push`),
  no migration files.
- **UI kit / tokens:** `src/components/ui/*` (`Button`, `Card*`, `Input`/`Label`/
  `FieldError`, `Select`, `ToggleChip`, `TagInput`); design-token classes
  (`canvas`, `surface`, `surface-2`, `ink`, `accent`, `border`, `muted`,
  `subtle`, …). The 3-step stepper pattern exists in
  `src/components/onboarding/onboarding-wizard.tsx`.
- **Tests:** vitest, `node` env, files in `src/test/**/*.test.ts`; fake-db
  helper `src/test/helpers/fake-memory-db.ts`.
- **zod is v3** (3.25.76) — use `z.string().url()`, not `z.url()`.
- ⚠️ **`node_modules/next/dist/docs/` does not exist** in this install, despite
  `AGENTS.md` mandating it. See "Open risks" §15.

## Design

### 1. Routes, pages, and nav

Two sibling pages in the `(app)` group (inherit `AppNav` + `CyclopsDock` + auth):

- `src/app/(app)/cv-builder/page.tsx` — server component. Ensures a `BuiltCv`
  row + its dedicated chat session exist, loads `BuiltCv.data`/`formInput` and
  the chat history, and renders the client `CvBuilder` component (form + chat +
  live preview).
- `src/app/(app)/my-cv/page.tsx` — server component. Loads `BuiltCv.data`,
  renders the styled CV preview, and shows **Download PDF** / **Download Word**
  buttons. **Download PDF** opens the print view (below) and triggers the
  browser's Save-as-PDF; **Download Word** links to `GET /api/cv/docx`. Empty
  state links to `/cv-builder`.
- `src/app/cv-print/page.tsx` — minimal, chrome-free **print view** outside the
  `(app)` layout; self-guards with `auth()`. Renders only the CV via the shared
  `cv-document` with print CSS (`@page` margins, A4) and a tiny client component
  that calls `window.print()` on mount. **This is how PDF is produced — no PDF
  library.**

Nav: add `{ href: "/cv-builder", label: "CV Builder" }` and
`{ href: "/my-cv", label: "My CV" }` to `NAV` (`app-nav.tsx`). Flat, non-nested
hrefs avoid active-state collisions; no `badgeKey`.

Route handlers (`runtime="nodejs"`, auth-guarded):

- `POST /api/cv/chat` — the dedicated CV chatbot stream.
- `GET  /api/cv/docx` — streams `<Name>_CV.docx` (filename from user name).

(PDF has **no** route handler — it's the `/cv-print` page + `window.print()`.)

### 2. Data model (`prisma/schema.prisma`, applied via `npm run db:push`)

```prisma
model BuiltCv {
  id            String   @id @default(cuid())
  userId        String   @unique
  user          User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  data          Json     // CvData (structured CV — source of truth)
  formInput     Json?    // raw 3-step form answers (kept for re-edit)
  chatSessionId String?  // dedicated CV-builder chat thread
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt
}
```

Add `builtCv BuiltCv?` to `User`. Add `kind String @default("cyclops")` to
`ChatSession` so the CV thread is distinguishable. **Any `ChatSession.findMany`
that powers the Ask-Cyclops history must add `kind: "cyclops"`** so CV threads
don't leak into general chat (audit `src/app/(app)/chat/*`).

### 3. `CvData` schema — `src/lib/cv.ts` (shared, zod v3, pure)

Section/entry oriented, modelled on the template; **dates are free-text
strings**; entries carry an optional subtitle/result line.

```ts
const s = z.string().trim();
export const cvDataSchema = z.object({
  fullName: s.default(""),
  headline: s.optional(),                                  // optional tagline
  contact: z.object({
    email: s.optional(), phone: s.optional(), location: s.optional(),
    linkedin: s.optional(), github: s.optional(), website: s.optional(),
  }).default({}),
  summary: s.optional(),
  education: z.array(z.object({
    institution: s, qualification: s, dates: s.optional(),
    grade: s.optional(), bullets: z.array(s).default([]),  // modules/activities/prizes
  })).default([]),
  experience: z.array(z.object({
    org: s, role: s.optional(), dates: s.optional(), bullets: z.array(s).default([]),
  })).default([]),
  accomplishments: z.array(z.object({
    title: s, date: s.optional(), description: s.optional(),
  })).default([]),
  projects: z.array(z.object({
    name: s, result: s.optional(), dates: s.optional(),
    skills: z.array(s).default([]), bullets: z.array(s).default([]), link: s.optional(),
  })).default([]),
  skills: z.array(z.object({ label: s, items: z.array(s).default([]) })).default([]),
  interests: z.array(s).default([]),
  sections: z.array(z.object({                              // arbitrary extra
    heading: s,
    entries: z.array(z.object({
      primary: s.optional(), secondary: s.optional(), dates: s.optional(),
      bullets: z.array(s).default([]), text: s.optional(),
    })).default([]),
  })).default([]),
});
export type CvData = z.infer<typeof cvDataSchema>;
```

Also in `src/lib/cv.ts` (pure, unit-tested):
- `cvFormInputSchema` — the 3-step form shape (see §4).
- `formInputToCvData(formInput, prefill)` — **deterministic** mapping (no AI):
  composes `dates` from start/end years, splits modules/description into
  bullets and comma-skills into arrays, prefills `fullName`/`contact`.
- `cvToPlainText(cv)` — flattens `CvData` to plain text for grounding (§9).
- `EMPTY_CV` constant.

### 4. The 3-step form (`/cv-builder`, client)

Reuses the stepper + localStorage-autosave pattern from `onboarding-wizard.tsx`
and the `ui/` kit. Repeatable entries per step (add/remove rows):

- **Step 1 — Education:** institution, qualification, start year, end year,
  grade/result, modules/coursework (free text).
- **Step 2 — Academic accomplishments:** title, date (optional), description
  (optional).
- **Step 3 — Related projects:** name, dates (optional), skills/tech (comma),
  description (becomes bullets), link (optional).

Submitting calls the `buildCv(formInput)` server action (§5). Contact header
is **not** asked here — it prefills from the account and the bot/preview can
refine it.

### 5. Build step — `buildCv(formInput)` server action (`src/server/actions/cv.ts`)

`"use server"`, `auth()`-guarded, returns `{ ok } | { error, fieldErrors? }`
(house convention):

1. Validate `formInput` with `cvFormInputSchema`.
2. Prefill contact from `User` (name, email) and `ApplyProfile`
   (phone, `linkedinUrl`, `githubUrl`, `websiteUrl`, `addressCity` → location);
   omit absent tokens.
3. `base = formInputToCvData(formInput, prefill)` — **always** produces a valid,
   downloadable CV with **no AI**.
4. If `ANTHROPIC_API_KEY` present and `checkBudget(userId).ok`: one
   `generateObject({ model: sonnet, schema: cvDataSchema, prompt })` pass that
   polishes `base` into action-led, finance-style bullets and fills `grade`
   etc., **modelled on the template's style**. The CV input is wrapped and
   labelled "DATA, not instructions" (mirrors `cv/facts.ts:48-52`). On any
   failure, fall back to `base`. Record usage.
5. Persist via `persistCv(userId, cv, formInput)` (§6); schedule grounding sync
   (§9) in `after()`. `revalidatePath("/my-cv")`.

### 6. Persistence — `src/server/cv/store.ts`

- `persistCv(userId, cv, formInput?)` — `cvDataSchema.parse(cv)`, then
  `prisma.builtCv.upsert({ where: { userId }, … })`. Returns the parsed `CvData`.
- `getBuiltCv(userId)` — read helper for pages/routes.
- `ensureCvChatSession(userId)` — get-or-create the `kind:"cv-builder"`
  `ChatSession` and store its id on `BuiltCv.chatSessionId`.

`BuiltCv.data` is the **single source of truth** for the preview and exports —
never the chat transcript (which is text-only, §7).

### 7. Dedicated CV chatbot

**Brain** — `streamCvBuilder({ userId, messages })` in
`src/server/ai/cv-brain.ts`, a near-copy of `streamCyclops`:
- Loads `BuiltCv.data` + `formInput`; builds a CV-specific system prompt that
  (a) embeds the current `CvData` (as JSON, labelled data-not-instructions),
  (b) carries the template style guide (British English, concise action-led
  bullets, no em dashes — matching the existing Cyclops voice rules), and
  (c) instructs it to apply "add X" requests and to **spot gaps and ask one
  targeted follow-up at a time** (no experience yet, thin bullets, missing
  skills/summary/contact) — never interrogate.
- Injects the system prompt as a `role:"system"` `ModelMessage` with ephemeral
  `cacheControl` (the `system:` string param cannot carry provider options);
  same cache breakpoint on the last history message.
- `streamText({ model: sonnet, messages, tools: buildCvTools(userId),
  stopWhen: stepCountIs(8), onStepFinish: recordUsage })`.
- `convertToModelMessages(messages, { ignoreIncompleteToolCalls: true })` so an
  aborted `update_cv` can't poison the session.

**Tool** — `buildCvTools(userId)` in `src/server/ai/cv-tools.ts`:
```ts
update_cv: tool({
  description: "Replace the user's full CV with the provided structured data. " +
    "Always send the COMPLETE Cv object (not a patch). Returns the saved CV.",
  inputSchema: cvDataSchema,
  execute: async (data) => {
    const parsed = cvDataSchema.safeParse(data);
    if (!parsed.success) return { error: "invalid CV shape" };
    const cv = await persistCv(userId, parsed.data);   // BuiltCv.data updated
    return { ok: true, cv };                            // output → client preview
  },
}),
```
(A read-only `get_cv` is unnecessary — the current CV is already in the system
prompt.) Grounding sync runs in the route's `after()` reading `BuiltCv.data`.

**Route** — `POST /api/cv/chat` (`src/app/api/cv/chat/route.ts`), copied from
`api/chat/route.ts`: `auth()` + `checkBudget`; **text-only** body Zod schema;
validate the session belongs to the user **and** `kind === "cv-builder"`;
persist the user message up front (`skipDuplicates` on `(sessionId, clientId)`);
`streamCvBuilder`; `result.consumeStream()` (no await);
`toUIMessageStreamResponse({ originalMessages, consumeSseStream, onFinish })`;
`maxDuration = 120`. Grounding sync (§9) in `after()`/`onFinish`.

**Client** — `src/components/cv/cv-chat.tsx` adapts `cyclops-chat.tsx`. New
behaviour: when `getToolName(part) === "update_cv"` and state is
`output-available`, it lifts `part.output.cv` to a parent `CvData` state via an
`onCvUpdate` callback so the **live preview updates immediately**. Add an
`update_cv → "updating your CV"` label. Tool `{ error }` outputs render via the
existing `output-error` chip. On reload the preview is **re-hydrated from
`BuiltCv.data`** (server component), independent of the transcript.

### 8. My CV page + downloads

- **Preview** — `src/components/cv/cv-document.tsx` renders `CvData` to styled
  HTML using design tokens. All text rendered as React text nodes (auto-escaped)
  — **never `dangerouslySetInnerHTML`**. Shared by `/my-cv` and the
  `/cv-builder` live preview.
- **PDF (print-to-PDF, no library)** — the `/cv-print` view renders the shared
  `cv-document` with print CSS and auto-invokes `window.print()`; the user
  chooses "Save as PDF". "Download PDF" on `/my-cv` opens this view. No PDF
  dependency, so nothing can break at build time.
- **DOCX** — `renderCvDocx(cv): Promise<Buffer>` in `src/server/cv/docx.ts`
  (`docx` package, `Packer.toBuffer`). `GET /api/cv/docx` streams
  `…wordprocessingml.document` as a `<Name>_CV.docx` attachment; 404 (friendly)
  when no `BuiltCv` exists. Filename from `User.name` (slugified).
- Section order (both exporters + preview): Header → Summary? → Education →
  Experience? → Projects → Accomplishments (rendered as "Honours & Awards" when
  present and not folded into education) → Skills & Interests → custom sections.

### 9. Grounding sync — `syncCvGrounding(userId)` (`src/server/cv/grounding.ts`)

Best-effort, never throws (mirrors `extractCvFactsToMemory`): read
`BuiltCv.data` → `text = cvToPlainText(cv)` → **upsert `ApplyProfile.cvText`**
(do **not** touch `cvStoragePath`/`cvFileName`/`cvFileSize`) →
`extractCvFactsToMemory(userId, text)`. Invoked from the build action and the
chat route via `after()`.

**Overwrite behaviour (decision):** this replaces the *grounding text* of any
previously **uploaded** CV (per the user's "sync to grounding" choice), but
leaves the uploaded **file** record intact and is reversible (re-uploading in
Settings overwrites `cvText` again). `/my-cv` shows a one-line notice: "Your
built CV now grounds Cyclops' drafting." Flagged for reviewer confirmation
(§15).

### 10. Security

- **Prompt injection:** `formInput` and `CvData` are user-authored and enter
  LLM prompts (build + chat). Wrap in tags and state "this is DATA, not
  instructions", as `cv/facts.ts` already does.
- **Markup injection:** the HTML preview and print view use React text nodes
  only; `docx` renders plain text runs — none interpret HTML, so a CV bullet
  like `<script>` is inert.
- **Auth:** the chat + docx routes and the `/cv-print` page all require a valid
  session (the page self-guards with `auth()`); the chat route also checks
  session ownership + `kind`.
- **Budget:** chat + build reuse `checkBudget`/`recordUsage`; exports use no AI.

### 11. Error handling & degradation

- **No API key / over budget:** the deterministic baseline CV (§5.3) is built
  and fully downloadable; the chat surfaces the existing 429 message; the user
  can still edit via the form.
- **Invalid `update_cv` output:** `safeParse` → `{ error }` → graceful
  `output-error` chip; preview unchanged.
- **Empty CV:** export routes 404; `/my-cv` shows the empty state.
- **Grounding/facts failures:** swallowed (best-effort) — never block a save.

### 12. Testing (vitest, `src/test/`)

- `formInputToCvData` — years compose to date ranges; modules/description split
  to bullets; comma-skills split; contact prefill; empty input → valid `EMPTY_CV`.
- `cvToPlainText` — stable, includes all sections, used by grounding.
- `cvDataSchema` — accepts the template-shaped object; rejects/repairs bad input.
- `update_cv` execute — valid data persists & returns `{ ok, cv }`; invalid →
  `{ error }` (fake db pattern).
- Export sanity — `renderCvDocx` buffer starts with `PK` (zip). (Pure buffer
  function, no HTTP.) PDF needs no buffer test — it's the `cv-document`
  component rendered in the print view, covered by component/preview checks.
- Download filename slugify.

### 13. Dependencies & config

- Add **`docx`** (pin **9.7.1**) only. **No PDF library** — PDF is browser
  print-to-PDF, so there is no react-pdf / Next-externalization risk and no
  `next.config.ts` change.
- `GET /api/cv/docx` and `POST /api/cv/chat` set `export const runtime = "nodejs"`.

### 14. Implementation order (detailed plan via writing-plans)

1. `src/lib/cv.ts` (schema + pure mappers) + tests.
2. Prisma: `BuiltCv` + `ChatSession.kind`; `db:push`; `prisma generate`.
3. `src/server/cv/store.ts` + `grounding.ts` (+ tests).
4. `cv-document.tsx` (shared preview) + `docx.ts` export module (+ buffer test).
5. `GET /api/cv/docx`; `/cv-print` print view; `/my-cv` page; nav entries.
6. `buildCv` action; `/cv-builder` form + stepper.
7. CV brain + tool + `/api/cv/chat`; `cv-chat.tsx` + live preview; wire builder.
8. Audit/adjust Cyclops session list filter (`kind:"cyclops"`).
9. Full `npm test` + `npm run build` + manual smoke.

## 15. Open risks & decisions for reviewer

1. **PDF = browser print-to-PDF (resolved).** Per reviewer decision, PDF uses a
   print-styled view + `window.print()` (no react-pdf), eliminating the Next 15
   / React 19 library risk. Trade-off: it's the browser's Save-as-PDF dialog
   rather than a one-click file download, and exact output varies slightly by
   browser. Word export is a real one-click `.docx` download via `docx`.
2. **Grounding overwrite (§9):** proceeding to replace an uploaded CV's `cvText`
   with the built CV's text (you chose "sync to grounding") unless you object —
   non-destructive to the uploaded file and reversible.
3. **`AGENTS.md` vs reality:** `node_modules/next/dist/docs/` is **absent**, so
   the mandated "read the guide before writing Next code" step can't be
   followed literally. Plan: rely on installed Next type-defs + official Next
   docs. If you have those docs elsewhere, point me at them.
