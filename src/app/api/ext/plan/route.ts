import { requireToken } from "../../../../server/ext-auth";
import { buildFieldMap } from "../../../../server/ext-profile";
import { planForm } from "../../../../server/ai/generate";
import { extPlanRequestSchema, sanitizePlanBody } from "../../../../lib/validation";
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
  return json({ plan });
}
