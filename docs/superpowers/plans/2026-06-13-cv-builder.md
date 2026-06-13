# CV Builder Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a CV Builder page (`/cv-builder`) with a 3-step form collecting Education, Academic Accomplishments, and Related Projects. The form seeds a structured CV; a dedicated chatbot assistant drafts and refines it conversationally. A separate My CV page (`/my-cv`) shows the saved CV and offers Download as PDF and Download as Word (.docx).

**Architecture:** A pure `src/lib/cv.ts` module defines `cvDataSchema`, `cvFormInputSchema`, `formInputToCvData`, and `cvToPlainText`. A 3-step client component (`cv-builder-client.tsx`) collects user input. The built CV feeds Cyclops' grounding the same way an uploaded CV does.

**Tech Stack:** Next.js 15 App Router, React 19, Prisma/Supabase, Zod 3, Vitest (node env), Tailwind v4, AI SDK v6.

**Spec:** `docs/superpowers/specs/2026-06-13-cv-builder-design.md`

**Note:** The canonical spec is at `docs/superpowers/specs/2026-06-13-cv-builder-design.md` (390 lines). This plan file was originally missing from the branch; created retroactively to resolve a spec-compliance review finding.

**Conventions:** This repo aliases `@/*` → `src/*`. Tests live in `src/test/*.test.ts` and run with `npm test` (vitest). After every task: commit. There is no DB test infra — server actions are kept thin and verified by `npx tsc --noEmit`; all logic lives in pure, unit-tested functions.

---

## Task summary

| Task | Description | Status |
|---|---|---|
| 12 | 3-step form client component (`cv-builder-client.tsx`), `src/lib/cv.ts` pure library | done (commit f67f69f) |
| 13 | Unit tests for `src/lib/cv.ts` (`src/test/cv-lib.test.ts`) covering `cvDataSchema` acceptance, rejection, and repair; `formInputToCvData` mapping; `cvToPlainText` serialisation | done |
