import { Prisma } from "@prisma/client";
import { requireToken } from "../../../../server/ext-auth";
import { prisma } from "../../../../server/db";
import { routeAskedAnswer } from "../../../../lib/form-plan";
import { normalizeQuestion } from "../../../../lib/answers";
import { extFactSchema } from "../../../../lib/validation";
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

  const parsed = extFactSchema.safeParse(body);
  if (!parsed.success) {
    return json({ error: "Invalid request." }, 400);
  }
  const { profileKey, questionText, answer } = parsed.data;
  const userId = auth.userId;
  const route = routeAskedAnswer(profileKey || undefined, questionText, answer);

  if (route.target === "profile") {
    // route.column is a string, so cast to Prisma's exact input types — a bare
    // computed-key object does not satisfy ApplyProfile{Create,Update}Input.
    await prisma.applyProfile.upsert({
      where: { userId },
      create: { userId, [route.column]: route.value } as Prisma.ApplyProfileUncheckedCreateInput,
      update: { [route.column]: route.value } as Prisma.ApplyProfileUncheckedUpdateInput,
    });
    return json({ saved: "profile", column: route.column });
  }

  const normalized = normalizeQuestion(route.questionText);
  const existing = await prisma.answerBankItem.findFirst({
    where: { userId, questionNormalized: normalized },
    select: { id: true },
  });
  if (existing) {
    await prisma.answerBankItem.update({
      where: { id: existing.id },
      data: { answer: route.answer },
    });
  } else {
    await prisma.answerBankItem.create({
      data: {
        userId,
        questionText: route.questionText,
        questionNormalized: normalized,
        answer: route.answer,
      },
    });
  }
  return json({ saved: "bank" });
}
