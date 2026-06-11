import { auth } from "../../../../server/auth";
import { prisma } from "../../../../server/db";
import { buildCalendar, type CalendarEvent } from "../../../../lib/ics";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Download the signed-in user's saved-role deadlines (plus opening dates for
 *  roles that haven't opened yet) as an .ics file for any calendar app. */
export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const saved = await prisma.savedOpportunity.findMany({
    where: { userId: session.user.id },
    include: { opportunity: { include: { employer: true } } },
  });

  const events: CalendarEvent[] = [];
  for (const { opportunity: o } of saved) {
    const firm = o.employer.name;
    const url = o.applicationUrl ?? o.sourceUrl ?? undefined;
    if (o.deadlineAt) {
      events.push({
        uid: `${o.id}-deadline`,
        title: `${firm} — ${o.title} closes`,
        date: o.deadlineAt,
        description: `Application deadline (${o.location}). Saved on Trackr.`,
        url,
      });
    }
    if (o.opensAt && o.status === "OPENING_SOON") {
      events.push({
        uid: `${o.id}-opens`,
        title: `${firm} — ${o.title} opens`,
        date: o.opensAt,
        description: `Applications open (${o.location}). Saved on Trackr.`,
        url,
      });
    }
  }

  return new Response(buildCalendar(events), {
    headers: {
      "content-type": "text/calendar; charset=utf-8",
      "content-disposition": 'attachment; filename="trackr-deadlines.ics"',
    },
  });
}
