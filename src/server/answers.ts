import { after } from "next/server";
import { prisma } from "@/server/db";
import { indexContent } from "@/server/ai/embed";
import { normalizeQuestion } from "@/lib/answers";

/**
 * Explicit-save upsert into the answer bank, shared by the extension answer
 * API (panel "Save to bank") and draft review (Accept). Updates the matching
 * bank item by normalized question or creates one, then indexes it for
 * retrieval after the response. Extracted verbatim from api/ext/answer.
 */
export async function saveAnswerToBank(args: {
  userId: string;
  questionText: string;
  answer: string;
  employer?: string | null;
}): Promise<{ id: string }> {
  const { userId, questionText, answer } = args;
  const employer = args.employer || null;
  const normalized = normalizeQuestion(questionText);

  const existing = await prisma.answerBankItem.findFirst({
    where: { userId, questionNormalized: normalized },
    select: { id: true },
  });
  const item = existing
    ? await prisma.answerBankItem.update({
        where: { id: existing.id },
        data: { answer, employer },
      })
    : await prisma.answerBankItem.create({
        data: {
          userId,
          questionText,
          questionNormalized: normalized,
          answer,
          employer,
        },
      });

  after(() =>
    indexContent({
      userId,
      kind: "answer",
      sourceId: item.id,
      content: `${item.questionText}\n${item.answer}`,
    }),
  );
  return { id: item.id };
}
