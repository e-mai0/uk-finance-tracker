import { requireToken } from "../../../../server/ext-auth";
import { buildFieldMap } from "../../../../server/ext-profile";
import { planForm } from "../../../../server/ai/generate";
import { extPlanRequestSchema, sanitizePlanBody } from "../../../../lib/validation";
import { json, unauthorized, preflight, CORS_HEADERS } from "../../../../server/ext-http";
import { enforceExtLimit } from "../../../../server/ratelimit";
import { memoryService } from "../../../../server/memory/service";
import { prisma } from "../../../../server/db";
import { suggestForLabels } from "../../../../lib/suggest";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function OPTIONS() {
  return preflight();
}

export async function POST(req: Request) {
  const auth = await requireToken(req);
  if (!auth) return unauthorized();

  // Abuse rate-limit per token-user for this surface; fails open if Redis down.
  const limited = await enforceExtLimit("plan", auth.userId, CORS_HEADERS);
  if (limited) return limited;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON body." }, 400);
  }

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

  const { fields } = parsed.data;
  const { fields: values } = await buildFieldMap(auth.userId);
  const plan = await planForm(fields, values);

  // Attach suggestions to ask items — failure-isolated, never breaks planning.
  try {
    const askItems = plan.filter((item) => item.action === "ask");
    if (askItems.length > 0) {
      const [profileFile, bankItems] = await Promise.all([
        memoryService.read(auth.userId, "profile.md").catch(() => null),
        prisma.answerBankItem
          .findMany({
            where: { userId: auth.userId },
            select: { questionText: true, answer: true },
            take: 100,
          })
          .catch(() => [] as { questionText: string; answer: string }[]),
      ]);

      const profileFactLines = profileFile
        ? profileFile.content.split("\n")
        : [];

      const labels = askItems
        .map((item) => item.question ?? item.fieldId)
        .filter(Boolean) as string[];

      const suggestions = suggestForLabels(labels, profileFactLines, bankItems);

      for (const item of askItems) {
        const labelKey = item.question ?? item.fieldId;
        const suggestion = suggestions.find((s) => s.label === labelKey);
        if (suggestion) {
          (item as typeof item & { suggestion: typeof suggestion }).suggestion = suggestion;
        }
      }
    }
  } catch {
    // Suggestion errors must not break planning
  }

  return json({ plan });
}
