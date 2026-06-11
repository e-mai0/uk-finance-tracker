import Link from "next/link";
import { redirect } from "next/navigation";
import type { AttentionItem } from "@prisma/client";
import { auth } from "@/server/auth";
import { prisma } from "@/server/db";
import { getTrackerItems } from "@/server/queries/opportunities";
import { toUIMessages } from "@/server/chat/messages";
import { resolveAttentionForm, snoozeAttentionForm } from "@/server/actions/attention";
import { Monogram } from "@/components/ui/monogram";
import { DraftReviewCard } from "@/components/draft-review-card";
import { cn, daysUntil, formatShortDate } from "@/lib/utils";

export const dynamic = "force-dynamic";

function dateLine(): string {
  return new Date()
    .toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", timeZone: "Europe/London" })
    .toUpperCase();
}

function greeting(): string {
  const h = Number(
    new Intl.DateTimeFormat("en-GB", {
      hour: "numeric",
      hour12: false,
      timeZone: "Europe/London",
    }).format(new Date()),
  );
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

function timeLabel(d: Date): string {
  return new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/London",
  }).format(d);
}

/** Typographic glyph per attention kind (no icons). All agent-origin → amber. */
const KIND_GLYPH: Record<string, string> = {
  PROPOSAL: "◆",
  QUESTION: "?",
  BRIEF: "◆",
  FLAG: "▲",
};

const SEC_PILL =
  "rounded-pill border border-border-interactive bg-surface px-3 py-1 text-[0.8125rem] font-bold text-ink transition-colors hover:bg-surface-2";
const GHOST = "label inline-flex min-h-6 items-center px-1.5 py-1 text-subtle transition-colors hover:text-ink";

export default async function TodayPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  const userId = session.user.id;
  const first = (session.user.name ?? "there").split(" ")[0];

  // The cron keys briefs by UTC date (now.toISOString().slice(0, 10)) — match it.
  const today = new Date().toISOString().slice(0, 10);

  const [attention, briefAttention, briefSession, tracker] = await Promise.all([
    // Attention queries no-op until the user applies the attention-items SQL.
    prisma.attentionItem
      .findMany({ where: { userId, status: "OPEN" }, orderBy: { createdAt: "asc" } })
      .catch(() => [] as AttentionItem[]),
    prisma.attentionItem
      .findFirst({ where: { userId, key: `brief:${today}` } })
      .catch(() => null),
    prisma.chatSession.findFirst({
      where: { userId, title: `Morning brief - ${today}` },
      include: { messages: { orderBy: { createdAt: "asc" }, take: 1 } },
    }),
    getTrackerItems(userId),
  ]);

  // Drafts behind the open PROPOSAL rows — the review card needs the content.
  const draftIds = attention
    .filter((a) => a.kind === "PROPOSAL" && a.targetType === "draft")
    .map((a) => a.targetId);
  const drafts = draftIds.length
    ? await prisma.generatedDraft.findMany({
        where: { id: { in: draftIds }, userId },
      })
    : [];
  const draftById = new Map(drafts.map((d) => [d.id, d]));

  // The brief text lives in the session's first assistant message; strip the
  // markdown H1 (the card header already says MORNING BRIEF).
  let briefText = "";
  if (briefSession) {
    const part = toUIMessages(briefSession.messages)[0]?.parts.find(
      (p) => p.type === "text",
    );
    briefText = (part && "text" in part ? part.text : "")
      .replace(/^# [^\n]*\n+/, "")
      .trim();
  }
  const hasBrief = Boolean(briefSession && briefText);

  const now = new Date();
  const upcoming = tracker
    .filter(
      (i) =>
        i.status === "OPEN" &&
        i.deadlineAt &&
        new Date(i.deadlineAt).getTime() > now.getTime(),
    )
    .sort(
      (a, b) =>
        new Date(a.deadlineAt!).getTime() - new Date(b.deadlineAt!).getTime(),
    )
    .slice(0, 3);

  return (
    <div className="mx-auto max-w-3xl px-5 py-8">
      <p className="label text-faint">{dateLine()}</p>
      <h1 className="mt-1 text-[1.75rem] text-ink">
        {greeting()}, {first}.
      </h1>
      <p className="mt-1 text-[0.875rem] text-muted">
        {hasBrief
          ? "Cyclops prepared your brief overnight."
          : "Quiet night — nothing moved. Next sweep runs overnight."}
      </p>

      {/* Morning brief — agent surface, hence the amber spine. */}
      {hasBrief && briefSession && (
        <section className="mt-5 rounded-card border border-border border-l-[3px] border-l-agent-mark bg-surface shadow-card">
          <div className="flex items-center gap-2 border-b border-border px-4 py-2.5">
            <span className="label rounded-pill bg-accent-soft px-2.5 py-0.5 text-accent">
              ◆ MORNING BRIEF
            </span>
            <span className="label text-faint">PREPARED 07:00</span>
            <span className="ml-auto">
              {briefAttention?.status === "RESOLVED" ? (
                <span className="label text-faint">READ ✓</span>
              ) : (
                <span
                  aria-label="Unread"
                  className="block h-1.5 w-1.5 rounded-full bg-agent-mark"
                />
              )}
            </span>
          </div>
          <div className="px-4 py-3">
            <p className="max-w-[70ch] whitespace-pre-wrap text-[0.875rem] leading-relaxed text-ink">
              {briefText}
            </p>
          </div>
          <div className="border-t border-border px-4 py-2.5">
            <Link
              href={`/chat?t=${briefSession.id}`}
              className="inline-block rounded-pill bg-ink px-4 py-1.5 text-[0.8125rem] font-extrabold text-canvas"
            >
              Open as chat
            </Link>
          </div>
        </section>
      )}

      {/* Needs you — one row per OPEN attention item, actions by kind. */}
      <section className="mt-5 rounded-card border border-border bg-surface shadow-card">
        <div className="flex items-baseline justify-between border-b border-border px-4 py-2.5">
          <h2 className="label text-faint">NEEDS YOU</h2>
          {attention.length > 0 && (
            <span className="tabular label text-faint">{attention.length}</span>
          )}
        </div>
        {attention.length === 0 ? (
          <p className="px-4 py-4 text-[0.875rem] text-muted">
            Queue clear — nothing needs you.
          </p>
        ) : (
          <ul className="divide-y divide-border">
            {attention.map((item) => {
              const draft =
                item.kind === "PROPOSAL" && item.targetType === "draft"
                  ? draftById.get(item.targetId)
                  : undefined;
              const draftCtx = (draft?.context ?? {}) as {
                question?: unknown;
                employer?: unknown;
              };
              return (
              <li key={item.id} className="px-4 py-3">
                <div className="flex items-start gap-3">
                  <span aria-hidden className="w-4 shrink-0 text-center text-agent-mark">
                    {KIND_GLYPH[item.kind] ?? "◆"}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-[0.875rem] text-ink">{item.title}</p>
                    <p className="mt-0.5 font-mono text-[0.6875rem] text-subtle">
                      {timeLabel(item.createdAt)}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1.5">
                    {item.kind === "QUESTION" && (
                      <>
                        <Link
                          href={`/chat?prefill=${encodeURIComponent(item.title)}`}
                          className={SEC_PILL}
                        >
                          Answer in chat
                        </Link>
                        <form action={resolveAttentionForm.bind(null, item.id)}>
                          <button type="submit" className={GHOST}>
                            Dismiss
                          </button>
                        </form>
                      </>
                    )}
                    {item.kind === "BRIEF" && (
                      <Link href={`/chat?t=${item.targetId}`} className={SEC_PILL}>
                        Read
                      </Link>
                    )}
                    {item.kind === "FLAG" && (
                      <form action={resolveAttentionForm.bind(null, item.id)}>
                        <button type="submit" className={SEC_PILL}>
                          Confirm
                        </button>
                      </form>
                    )}
                    {item.kind === "PROPOSAL" && item.targetType !== "draft" && (
                      <form action={resolveAttentionForm.bind(null, item.id)}>
                        <button type="submit" className={GHOST}>
                          Dismiss
                        </button>
                      </form>
                    )}
                    <form action={snoozeAttentionForm.bind(null, item.id)}>
                      <button type="submit" className={GHOST}>
                        later
                      </button>
                    </form>
                  </div>
                </div>
                {item.kind === "PROPOSAL" && item.targetType === "draft" && (
                  <details className="mt-2 pl-7">
                    <summary className="label inline-flex cursor-pointer list-none items-center gap-1 text-accent [&::-webkit-details-marker]:hidden">
                      Review ↓
                    </summary>
                    <div className="mt-2">
                      {draft ? (
                        <DraftReviewCard
                          draftId={draft.id}
                          question={
                            typeof draftCtx.question === "string" &&
                            draftCtx.question.trim()
                              ? draftCtx.question
                              : item.title
                          }
                          content={draft.content}
                          meta={
                            typeof draftCtx.employer === "string" &&
                            draftCtx.employer
                              ? `${draft.kind} · ${draftCtx.employer}`
                              : draft.kind
                          }
                        />
                      ) : (
                        <p className="rounded-control border border-border bg-surface-2 px-3 py-2 text-[0.8125rem] text-muted">
                          {item.title}
                        </p>
                      )}
                    </div>
                  </details>
                )}
              </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* Coming up — three nearest open deadlines. */}
      <section className="mt-5 rounded-card border border-border bg-surface shadow-card">
        <div className="flex items-baseline justify-between border-b border-border px-4 py-2.5">
          <h2 className="label text-faint">COMING UP</h2>
          <Link
            href="/tracker"
            className="label text-subtle transition-colors hover:text-ink"
          >
            full tracker →
          </Link>
        </div>
        {upcoming.length === 0 ? (
          <p className="px-4 py-4 text-[0.875rem] text-muted">
            No deadlines on the horizon.
          </p>
        ) : (
          <ul className="divide-y divide-border">
            {upcoming.map((i) => {
              const d = daysUntil(i.deadlineAt, now);
              const closing = d !== null && d <= 14;
              return (
                <li key={i.id}>
                  <Link
                    href={`/tracker/${i.id}`}
                    className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-surface-2"
                  >
                    <Monogram
                      name={i.employerName}
                      hint={i.logoHint}
                      className="h-8 w-8"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[0.875rem] font-bold text-ink">
                        {i.employerName}
                      </p>
                      <p className="truncate text-[0.8125rem] text-muted">{i.title}</p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p
                        className={cn(
                          "font-mono text-[0.78rem]",
                          closing ? "text-danger" : "text-ink",
                        )}
                      >
                        {closing && <span aria-hidden>▼ </span>}D-{d}
                      </p>
                      <p className="font-mono text-[0.6875rem] text-subtle">
                        {formatShortDate(i.deadlineAt)}
                      </p>
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
