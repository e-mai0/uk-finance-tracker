import Link from "next/link";
import { redirect } from "next/navigation";
import type { AttentionItem } from "@prisma/client";
import { auth } from "@/server/auth";
import { prisma } from "@/server/db";

export const dynamic = "force-dynamic";
export const metadata = { title: "Activity — Trackr" };

/** Typographic glyph per attention kind (no icons) — mirrors Today. */
const KIND_GLYPH: Record<string, string> = {
  PROPOSAL: "◆",
  QUESTION: "?",
  BRIEF: "◆",
  FLAG: "▲",
};

type ActivityEvent = {
  when: Date;
  glyph: string;
  text: string;
  href?: string;
};

const STAMP = new Intl.DateTimeFormat("en-GB", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "Europe/London",
});

/**
 * The agent activity log behind the nav pill: everything Cyclops did recently
 * — morning briefs, memory-gardener runs, employer research refreshes, and
 * attention items it raised — merged reverse-chronologically.
 */
export default async function ActivityPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  const userId = session.user.id;

  const [briefs, runs, research, attention] = await Promise.all([
    prisma.chatSession.findMany({
      where: { userId, title: { startsWith: "Morning brief" } },
      orderBy: { updatedAt: "desc" },
      take: 7,
    }),
    prisma.gardenerRun.findMany({
      where: { userId },
      orderBy: { ranAt: "desc" },
      take: 5,
    }),
    prisma.employerResearch.findMany({
      orderBy: { refreshedAt: "desc" },
      take: 10,
      include: { employer: true },
    }),
    // Tolerate the table's absence until the attention-items SQL is applied.
    prisma.attentionItem
      .findMany({
        where: { userId },
        orderBy: { createdAt: "desc" },
        take: 10,
      })
      .catch(() => [] as AttentionItem[]),
  ]);

  const events: ActivityEvent[] = [
    ...briefs.map((s) => ({
      when: s.updatedAt,
      glyph: "◆",
      text: s.title,
      href: `/chat?t=${s.id}`,
    })),
    ...runs.map((r) => ({
      when: r.ranAt,
      glyph: "●",
      text: "Memory gardener ran",
      href: "/memory",
    })),
    ...research.map((r) => ({
      when: r.refreshedAt,
      glyph: "◉",
      text: `Researched ${r.employer.name}`,
    })),
    ...attention.map((a) => ({
      when: a.createdAt,
      glyph: KIND_GLYPH[a.kind] ?? "◆",
      text: `${a.title} · ${a.status.toLowerCase()}`,
    })),
  ]
    .sort((a, b) => b.when.getTime() - a.when.getTime())
    .slice(0, 25);

  return (
    <div className="animate-rise mx-auto max-w-3xl px-5 py-8">
      <div className="label text-faint">Agent activity</div>
      <h1 className="mt-1 text-xl font-semibold tracking-tight text-ink">
        Activity
      </h1>
      <p className="mt-0.5 max-w-2xl text-sm text-muted">
        What Cyclops has been doing — briefs, employer research, memory
        gardening, and items raised for you.
      </p>

      <section className="mt-5 rounded-card border border-border bg-surface shadow-card">
        <div className="flex items-baseline justify-between border-b border-border px-4 py-2.5">
          <h2 className="label text-faint">RECENT</h2>
          {events.length > 0 && (
            <span className="tabular label text-faint">{events.length}</span>
          )}
        </div>
        {events.length === 0 ? (
          <p className="px-4 py-4 text-[0.875rem] text-muted">
            Nothing logged yet — Cyclops records briefs, research and memory
            work here as it happens.
          </p>
        ) : (
          <ul className="divide-y divide-border">
            {events.map((e, i) => {
              const row = (
                <>
                  <span
                    aria-hidden
                    className="w-4 shrink-0 text-center text-agent-mark"
                  >
                    {e.glyph}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-[0.875rem] text-ink">
                    {e.text}
                  </span>
                  <span className="shrink-0 font-mono text-[0.6875rem] text-subtle">
                    {STAMP.format(e.when)}
                  </span>
                </>
              );
              return (
                <li key={i}>
                  {e.href ? (
                    <Link
                      href={e.href}
                      className="flex items-center gap-3 px-4 py-2.5 transition-colors hover:bg-surface-2"
                    >
                      {row}
                    </Link>
                  ) : (
                    <div className="flex items-center gap-3 px-4 py-2.5">
                      {row}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
