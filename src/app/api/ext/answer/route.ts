import { after } from "next/server";
import { requireToken } from "../../../../server/ext-auth";
import { prisma } from "../../../../server/db";
import { aiConfigured } from "../../../../server/ai/generate";
import { gatherSubstance } from "../../../../server/engine/substance";
import { draftText } from "../../../../server/engine/draft";
import { maybeDistill } from "../../../../server/engine/distill";
import { indexContent } from "../../../../server/ai/embed";
import { normalizeQuestion, bestAnswerMatch } from "../../../../lib/answers";
import { extAnswerSchema } from "../../../../lib/validation";
import { json, unauthorized, preflight } from "../../../../server/ext-http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function OPTIONS() {
  return preflight();
}

export async function POST(req: Request) {
  const auth = await requireToken(req);
  if (!auth) return unauthorized();

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON body." }, 400);
  }

  const parsed = extAnswerSchema.safeParse(body);
  if (!parsed.success) {
    return json({ error: "Invalid request.", fieldErrors: parsed.error.flatten().fieldErrors }, 400);
  }
  const d = parsed.data;
  const userId = auth.userId;

  // 0. Explicit save of an edited answer (panel "Save to bank"): update the
  //    matching bank item or create one — no generation.
  if (d.answer && d.save) {
    const normalized = normalizeQuestion(d.questionText);
    const existing = await prisma.answerBankItem.findFirst({
      where: { userId, questionNormalized: normalized },
      select: { id: true },
    });
    if (existing) {
      const updated = await prisma.answerBankItem.update({
        where: { id: existing.id },
        data: { answer: d.answer, employer: d.employer || null },
      });
      after(() => indexContent({ userId, kind: "answer", sourceId: updated.id, content: `${updated.questionText}\n${updated.answer}` }));
    } else {
      const item = await prisma.answerBankItem.create({
        data: {
          userId,
          questionText: d.questionText,
          questionNormalized: normalized,
          answer: d.answer,
          employer: d.employer || null,
        },
      });
      after(() => indexContent({ userId, kind: "answer", sourceId: item.id, content: `${item.questionText}\n${item.answer}` }));
    }

    // Capture edit for learning: if the user edited an AI draft before saving.
    if (d.original && d.draftId && d.original !== d.answer) {
      await prisma.draftEdit
        .create({ data: { userId, draftId: d.draftId, original: d.original, edited: d.answer } })
        .catch(() => {});
      after(() => maybeDistill(userId));
    }

    return json({ answer: d.answer, source: "saved" });
  }

  // 1. Try the answer bank first — reuse near-identical questions verbatim.
  const bank = await prisma.answerBankItem.findMany({
    where: { userId },
    select: { id: true, questionText: true, answer: true },
  });
  // The panel always shows a reused answer for review before insert, so a
  // moderately loose threshold is safe and far more useful than exact-match.
  const match = bestAnswerMatch(bank, d.questionText, 0.6);
  if (match) {
    prisma.answerBankItem
      .update({ where: { id: match.item.id }, data: { usageCount: { increment: 1 } } })
      .catch(() => {});
    return json({ answer: match.item.answer, source: "bank", score: match.score });
  }

  // 2. Generate with the LLM, grounded in the user's profile + CV + voice + stories.
  if (!aiConfigured()) {
    return json({ error: "AI generation isn't configured on the server." }, 503);
  }

  let answer: string;
  let draftId: string | undefined;
  try {
    const draftArgs = {
      kind: "ANSWER" as const,
      question: d.questionText,
      employerName: d.employer ?? undefined,
      roleTitle: d.role ?? undefined,
      charLimit: d.charLimit ?? undefined,
    };
    const ctx = await gatherSubstance(userId, draftArgs);
    const result = await draftText(userId, ctx, draftArgs);
    answer = result.text;

    // 3. Optionally save to the bank for reuse.
    if (d.save && answer) {
      const item = await prisma.answerBankItem.create({
        data: {
          userId,
          questionText: d.questionText,
          questionNormalized: normalizeQuestion(d.questionText),
          answer,
          employer: d.employer || null,
        },
      }).catch(() => null);
      if (item) after(() => indexContent({ userId, kind: "answer", sourceId: item.id, content: `${item.questionText}\n${item.answer}` }));
    }

    // Record the generated draft for history (includes provenance).
    const draft = await prisma.generatedDraft.create({
      data: {
        userId,
        kind: "ANSWER",
        content: answer,
        context: { question: d.questionText, employer: d.employer, role: d.role },
        provenance: JSON.stringify(result.provenance),
      },
    }).catch(() => null);
    if (draft) {
      draftId = draft.id;
      after(() => indexContent({ userId, kind: "draft", sourceId: draft.id, content: draft.content }));
    }
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : "Generation failed." }, 502);
  }

  return json({ answer, source: "generated", draftId });
}
