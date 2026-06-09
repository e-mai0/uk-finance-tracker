"use server";

import { generateObject, generateText } from "ai";
import { z } from "zod";
import { auth } from "@/server/auth";
import { haiku, sonnet } from "@/server/ai/models";
import { memoryService } from "@/server/memory/service";
import { CANONICAL_TEMPLATES } from "@/server/memory/templates";

async function requireUserId(): Promise<string> {
  const session = await auth();
  if (!session?.user?.id) throw new Error("unauthorized");
  return session.user.id;
}

/** Max chars per writing sample */
const MAX_SAMPLE_CHARS = 4000;
/** Max chars per story entry */
const MAX_STORY_CHARS = 2000;
/** Max entries we process for stories */
const MAX_STORY_ENTRIES = 3;

export async function distillVoice(
  samples: string[],
): Promise<{ ok: boolean }> {
  const userId = await requireUserId();

  // Server-side input validation: enforce per-sample char limit
  const valid = samples
    .filter((s) => typeof s === "string")
    .map((s) => s.slice(0, MAX_SAMPLE_CHARS));

  const joined = valid.filter((s) => s.trim()).join("\n\n---\n\n");
  if (!joined) return { ok: true };

  // Protect re-runs: only write if voice.md is absent or still equals the
  // canonical template (i.e. the user has not customised it).
  try {
    const existing = await memoryService.read(userId, "voice.md");
    if (existing) {
      const canonical = CANONICAL_TEMPLATES["voice.md"] ?? "";
      if (existing.content !== canonical) {
        // User has a customised voice.md — skip without error.
        return { ok: true };
      }
    }
  } catch {
    // read failure is non-fatal; proceed
  }

  const today = new Date().toISOString().slice(0, 10);

  try {
    const { text } = await generateText({
      model: sonnet,
      prompt: `These are writing samples from one person. Produce a voice.md memory file describing how they write, for use when ghost-drafting application answers in their voice.

Required structure (markdown):
# Voice
## Banned tells
(keep the standard list: em dashes, "I'm excited to", "proven track record", symmetric three-item lists; add any clichés this person never uses)
## Observed traits
(bullet list of concrete, observed traits: sentence length habits, formality, contractions, vocabulary quirks. Each line ends with "(confidence: medium, confirmed: ${today})" - traits are inferred, not stated.)
## Exemplars
(2-4 short verbatim excerpts from the samples, max 80 words each, chosen as most characteristic. Quote exactly.)

Samples:
${joined.slice(0, 12000)}`,
    });

    await memoryService.write(
      userId,
      "voice.md",
      text,
      "CYCLOPS",
      "distilled from onboarding writing samples",
    );
    return { ok: true };
  } catch (err) {
    console.error("[distillVoice] LLM error:", err);
    return { ok: false };
  }
}

const StorySeed = z.object({
  stories: z
    .array(
      z.object({
        slug: z.string().regex(/^[a-z0-9-]+$/),
        title: z.string(),
        themes: z.array(z.string()).min(1).max(4),
        timeline: z.string(),
        rawNotes: z.string(),
      }),
    )
    .max(5),
});

export async function seedStories(
  entries: string[],
): Promise<{ ok: boolean }> {
  const userId = await requireUserId();

  // Server-side caps: max 3 entries, each ≤2000 chars
  const valid = entries
    .filter((s) => typeof s === "string")
    .slice(0, MAX_STORY_ENTRIES)
    .map((s) => s.slice(0, MAX_STORY_CHARS));

  const joined = valid.filter((s) => s.trim()).join("\n\n---\n\n");
  if (!joined) return { ok: true };

  const today = new Date().toISOString().slice(0, 10);

  try {
    const { object } = await generateObject({
      model: haiku,
      schema: StorySeed,
      prompt: `Turn these rough notes (one anecdote per block) into story records for a job-application story bank. Themes from: leadership, teamwork, failure, pressure, initiative, analysis, communication. Keep rawNotes as the user's own words, lightly cleaned. Do not invent details.

Notes:
${joined.slice(0, 8000)}`,
    });

    for (const s of object.stories) {
      const path = await resolveSlug(userId, s.slug);
      const content = `---
title: ${s.title}
themes: [${s.themes.join(", ")}]
employers_used: []
strength_signal: null
failure_signal: null
timeline: ${s.timeline}
confidence: high
last_confirmed: ${today}
---
## Raw notes
${s.rawNotes}

## Final versions
`;
      await memoryService.write(
        userId,
        path,
        content,
        "CYCLOPS",
        "seeded from onboarding",
      );
    }

    return { ok: true };
  } catch (err) {
    console.error("[seedStories] LLM error:", err);
    return { ok: false };
  }
}

/**
 * Resolves a slug to a non-colliding path.
 * If stories/<slug>.md already exists, tries stories/<slug>-2.md, -3.md, etc.
 */
async function resolveSlug(userId: string, slug: string): Promise<string> {
  const base = `stories/${slug}`;
  const candidate = `${base}.md`;
  const existing = await memoryService.read(userId, candidate).catch(() => null);
  if (!existing) return candidate;

  for (let i = 2; i <= 9; i++) {
    const next = `${base}-${i}.md`;
    const ex = await memoryService.read(userId, next).catch(() => null);
    if (!ex) return next;
  }

  // Last-resort fallback: append timestamp
  return `${base}-${Date.now()}.md`;
}
