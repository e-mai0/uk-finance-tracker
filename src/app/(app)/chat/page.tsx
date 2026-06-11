import { redirect } from "next/navigation";
import { after } from "next/server";
import Link from "next/link";
import { auth } from "@/server/auth";
import { prisma } from "@/server/db";
import { CyclopsChat } from "./cyclops-chat";
import { createThread } from "./actions";
import { toUIMessages } from "@/server/chat/messages";
import { resolveAttentionByTarget } from "@/server/attention";
import { getOpenAttentionByTarget } from "@/server/queries/attention";
import { DOCK_THREAD_TITLE } from "@/lib/dock-context";

export const dynamic = "force-dynamic";
export const metadata = { title: "Cyclops — Trackr" };

/** Deep-link prefill: strip control/C1/zero-width/bidi chars, collapse whitespace, cap at 200. */
function sanitizePrefill(raw: string): string {
  return raw
    .replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u202a-\u202e]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 200);
}

/** Return the Europe/London calendar-day string "YYYY-MM-DD" for a given Date. */
function toLondonDay(d: Date): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/London",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(d);
  const p: Record<string, string> = {};
  for (const { type, value } of parts) {
    if (type !== "literal") p[type] = value;
  }
  return `${p["year"]}-${p["month"]}-${p["day"]}`;
}

export default async function ChatPage({
  searchParams,
}: {
  searchParams: Promise<{
    t?: string | string[];
    prefill?: string | string[];
    opportunity?: string | string[];
  }>;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  const userId = session.user.id;

  const sp = await searchParams;
  // item 6: coerce string | string[] → string | undefined
  const tParam = Array.isArray(sp.t) ? sp.t[0] : sp.t;
  const prefillParam = Array.isArray(sp.prefill) ? sp.prefill[0] : sp.prefill;
  const opportunityParam = Array.isArray(sp.opportunity)
    ? sp.opportunity[0]
    : sp.opportunity;

  // Explicit ?prefill= wins; otherwise derive one from ?opportunity=<id>
  let prefill: string | undefined = prefillParam;
  // Opportunity deep links also seed the thread title so abandoned threads
  // are distinguishable in the rail. Cap matches the auto-title slice(0, 60)
  // in /api/chat; that logic only overwrites the default "New conversation",
  // so a seeded title sticks.
  let seededTitle: string | undefined;
  if (opportunityParam) {
    const opp = await prisma.opportunity.findUnique({
      where: { id: opportunityParam },
      include: { employer: true },
    });
    // Unknown id → ignore silently
    if (opp) {
      seededTitle = `${opp.employer.name} - ${opp.title}`.slice(0, 60);
      if (!prefill) prefill = `Let's talk about ${opp.employer.name} - ${opp.title}.`;
    }
  }
  if (prefill) prefill = sanitizePrefill(prefill);
  if (!prefill) prefill = undefined;

  // Arriving with a prefill but no thread → land the context in a thread.
  // Reuse the newest empty thread (userId-scoped, excluding dock) so repeated
  // deep-link visits don't pile up blank sessions.
  if (prefill && !tParam) {
    const empty = await prisma.chatSession.findFirst({
      where: { userId, messages: { none: {} }, NOT: { title: DOCK_THREAD_TITLE } },
      orderBy: { updatedAt: "desc" },
    });
    let threadId: string;
    if (empty) {
      if (seededTitle && empty.title !== seededTitle) {
        await prisma.chatSession.update({
          where: { id: empty.id },
          data: { title: seededTitle },
        });
      }
      threadId = empty.id;
    } else {
      const created = await prisma.chatSession.create({
        data: { userId, ...(seededTitle ? { title: seededTitle } : {}) },
      });
      threadId = created.id;
    }
    redirect(`/chat?t=${threadId}&prefill=${encodeURIComponent(prefill)}`);
  }

  // Load up to 50 threads, newest first — exclude the dock thread (ambient
  // surface, not a conversation to manage in the rail).
  const threads = await prisma.chatSession.findMany({
    where: { userId, NOT: { title: DOCK_THREAD_TITLE } },
    orderBy: { updatedAt: "desc" },
    take: 50,
  });

  // No threads at all → create one and redirect
  if (threads.length === 0) {
    const created = await prisma.chatSession.create({
      data: { userId },
    });
    redirect(`/chat?t=${created.id}`);
  }

  // No `t` param → redirect to newest thread
  if (!tParam) {
    redirect(`/chat?t=${threads[0]!.id}`);
  }

  // Load the active thread via direct ownership query — NOT filtered by rail
  // list — so the dock thread remains loadable via explicit ?t=<dockId> (the
  // dock footer "Open in Ask Cyclops →" link uses this path).
  const activeThread = await prisma.chatSession.findFirst({
    where: { id: tParam, userId },
    include: {
      messages: {
        orderBy: { createdAt: "asc" },
      },
    },
  });

  // Thread not found or doesn't belong to user → redirect to newest,
  // preserving any prefill so the deep-link context isn't dropped.
  // Only truly absent/foreign ids fall here; dock-thread deep links resolve
  // correctly above.
  if (!activeThread) {
    const suffix = prefill ? `&prefill=${encodeURIComponent(prefill)}` : "";
    redirect(`/chat?t=${threads[0]!.id}${suffix}`);
  }

  // Map stored messages to UIMessages (shared helper — item 11)
  const initialMessages = toUIMessages(activeThread.messages);

  // Auto-resolve any BRIEF (or other) attention items for this session.
  // Fire-and-forget: harmless no-op for non-attention sessions.
  after(() => resolveAttentionByTarget(userId, "chat-session", activeThread.id));

  // --- Rail grouping ---
  // Open attention items targeting chat sessions → amber "Needs you" treatment.
  const needsYouMap = await getOpenAttentionByTarget(userId, "chat-session");
  const needsYouIds = new Set(needsYouMap.keys());

  const now = new Date();
  const todayStr = toLondonDay(now);
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  type Thread = (typeof threads)[number];

  const groups: { label: string; threads: Thread[] }[] = [
    { label: "NEEDS YOU", threads: [] },
    { label: "TODAY", threads: [] },
    { label: "THIS WEEK", threads: [] },
    { label: "EARLIER", threads: [] },
  ];

  for (const t of threads) {
    if (needsYouIds.has(t.id)) {
      groups[0]!.threads.push(t);
    } else if (toLondonDay(t.updatedAt) === todayStr) {
      groups[1]!.threads.push(t);
    } else if (t.updatedAt >= sevenDaysAgo) {
      groups[2]!.threads.push(t);
    } else {
      groups[3]!.threads.push(t);
    }
  }

  return (
    <div className="animate-rise flex h-[calc(100vh-3rem)] overflow-hidden">
      {/* Left rail — thread list */}
      <aside className="hidden w-56 shrink-0 flex-col border-r border-border bg-surface sm:flex">
        {/* New conversation */}
        <div className="border-b border-border px-3 py-2.5">
          <form action={createThread}>
            <button
              type="submit"
              className="label w-full border border-border px-2.5 py-1.5 text-left text-accent transition-colors hover:border-accent hover:bg-accent-tint"
            >
              <span aria-hidden className="mr-1 text-accent">
                +
              </span>
              New conversation
            </button>
          </form>
        </div>

        {/* Thread list — grouped by attention / recency */}
        <nav className="flex-1 overflow-y-auto py-1" aria-label="Conversations">
          {groups.map((group) => {
            if (group.threads.length === 0) return null;
            return (
              <div key={group.label}>
                <div className="label text-faint px-3 pt-3 pb-1">{group.label}</div>
                {group.threads.map((t) => {
                  const isActive = t.id === activeThread.id;
                  const isNeedsYou = needsYouIds.has(t.id);
                  const isMorningBrief = t.title.startsWith("Morning brief");

                  let rowClass: string;
                  if (isActive) {
                    // Selection law: ink inset stripe + surface-2 background
                    rowClass =
                      "block px-3 py-2 shadow-[inset_3px_0_0_var(--color-ink)] bg-surface-2";
                  } else if (isNeedsYou) {
                    // Needs-you: amber inset stripe + accent tint
                    rowClass =
                      "block px-3 py-2 bg-accent-tint shadow-[inset_3px_0_0_var(--color-agent-mark)] hover:bg-surface-2";
                  } else {
                    rowClass = "block px-3 py-2 hover:bg-surface-2";
                  }

                  return (
                    <Link
                      key={t.id}
                      href={`/chat?t=${t.id}`}
                      aria-current={isActive ? "page" : undefined}
                      className={rowClass}
                    >
                      <span className="flex items-baseline gap-1 truncate">
                        <span className="block truncate font-mono text-[0.72rem] text-ink">
                          {t.title}
                          {isMorningBrief && (
                            <>
                              {" "}
                              <span className="label text-accent" aria-hidden="true">
                                ◆ AUTO
                              </span>
                              <span className="sr-only">automatic</span>
                            </>
                          )}
                        </span>
                        {isNeedsYou && (
                          <>
                            <span className="label shrink-0 text-accent" aria-hidden="true">◆</span>
                            <span className="sr-only">needs you</span>
                          </>
                        )}
                      </span>
                      <span className="block font-mono text-[0.6875rem] text-subtle">
                        {t.updatedAt.toLocaleDateString("en-GB", {
                          day: "numeric",
                          month: "short",
                        })}
                      </span>
                    </Link>
                  );
                })}
              </div>
            );
          })}
        </nav>

        {/* Footer label */}
        <div className="border-t border-border px-3 py-2">
          <span className="label text-faint">Cyclops · AI</span>
        </div>
      </aside>

      {/* Main chat pane */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Pane header */}
        <div className="flex items-center justify-between border-b border-border bg-surface px-4 py-2">
          <div className="flex items-baseline gap-2">
            <span className="label text-subtle">Cyclops</span>
            <span className="truncate font-mono text-[0.78rem] text-ink">
              {activeThread.title}
            </span>
          </div>
          {/* Mobile new-thread button */}
          <form action={createThread} className="sm:hidden">
            <button
              type="submit"
              className="label px-2 py-1 text-accent hover:underline"
            >
              + New
            </button>
          </form>
        </div>

        {/* Chat client component */}
        <div className="flex-1 overflow-hidden">
          <CyclopsChat
            key={activeThread.id}
            sessionId={activeThread.id}
            initialMessages={initialMessages}
            prefill={prefill}
          />
        </div>
      </div>
    </div>
  );
}
