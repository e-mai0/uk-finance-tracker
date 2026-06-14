"use server";

import { auth } from "../auth";
import { prisma } from "../db";
import { DOCK_THREAD_TITLE } from "@/lib/dock-context";

export type PaletteResults = {
  listings: { id: string; label: string }[];
  threads: { id: string; label: string }[];
};

/**
 * ⌘K palette search: opportunities by title/employer name + chat threads by
 * title (the dock's hidden thread excluded). Read-only, so an unauthenticated
 * call degrades to empty results rather than the {error} union — the palette
 * has nowhere sensible to surface an error string.
 */
export async function paletteSearch(q: string): Promise<PaletteResults> {
  const session = await auth();
  if (!session?.user?.id) return { listings: [], threads: [] };
  const userId = session.user.id;

  const term = q.trim();
  if (term.length < 2) return { listings: [], threads: [] };

  const [opportunities, threads] = await Promise.all([
    prisma.opportunity.findMany({
      where: {
        OR: [
          { title: { contains: term, mode: "insensitive" } },
          { employer: { name: { contains: term, mode: "insensitive" } } },
        ],
      },
      include: { employer: true },
      orderBy: { lastSeenAt: "desc" },
      take: 5,
    }),
    prisma.chatSession.findMany({
      where: {
        userId,
        kind: "cyclops",
        title: { contains: term, mode: "insensitive" },
        NOT: { title: DOCK_THREAD_TITLE },
      },
      orderBy: { updatedAt: "desc" },
      take: 5,
    }),
  ]);

  return {
    listings: opportunities.map((o) => ({
      id: o.id,
      label: `${o.employer.name} — ${o.title}`,
    })),
    threads: threads.map((t) => ({ id: t.id, label: t.title })),
  };
}
