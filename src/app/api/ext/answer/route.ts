import { after } from "next/server";
import { requireToken } from "../../../../server/ext-auth";
import { prisma } from "../../../../server/db";
import { loadApplicantContext } from "../../../../server/ext-profile";
import { generateAnswer, aiConfigured } from "../../../../server/ai/generate";
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

  // 2. Generate with the LLM, grounded in the user's profile + CV.
  if (!aiConfigured()) {
    return json({ error: "AI generation isn't configured on the server." }, 503);
  }

  const applicant = await loadApplicantContext(userId);
  let answer: string;
  try {
    answer = await generateAnswer({
      question: d.questionText,
      charLimit: d.charLimit,
      employer: d.employer || null,
      role: d.role || null,
      applicant,
    });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : "Generation failed." }, 502);
  }

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

  // Record the generated draft for history.
  const draft = await prisma.generatedDraft.create({
    data: {
      userId,
      kind: "ANSWER",
      content: answer,
      context: { question: d.questionText, employer: d.employer, role: d.role },
    },
  }).catch(() => null);
  if (draft) after(() => indexContent({ userId, kind: "draft", sourceId: draft.id, content: draft.content }));

  return json({ answer, source: "generated" });
}
