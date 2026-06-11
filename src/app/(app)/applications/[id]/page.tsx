import Link from "next/link";
import { notFound } from "next/navigation";
import { auth } from "@/server/auth";
import { prisma } from "@/server/db";
import { updateApplicationStatusForm } from "@/server/actions/applications";
import { Monogram } from "@/components/ui/monogram";
import { DraftReviewCard } from "@/components/draft-review-card";
import {
  APPLICATION_STATUSES,
  APPLICATION_STATUS_LABEL,
} from "@/lib/constants";
import { cn, formatDate, daysUntil } from "@/lib/utils";

export const dynamic = "force-dynamic";

function hostOf(url: string) {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

export default async function ApplicationWorkspacePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await auth();
  const userId = session!.user.id;

  const application = await prisma.application.findFirst({
    where: { id, userId },
  });
  if (!application) notFound();

  const [drafts, opportunity] = await Promise.all([
    prisma.generatedDraft.findMany({
      where: { applicationId: id, userId },
      orderBy: { createdAt: "desc" },
    }),
    application.opportunityId
      ? prisma.opportunity.findUnique({
          where: { id: application.opportunityId },
          include: { employer: true },
        })
      : null,
  ]);

  const employer = application.employerName || hostOf(application.externalUrl);
  const role = application.roleTitle || "Untitled role";
  // startApplication stores a synthetic `tracker:<id>` URL when the listing
  // has no application link — only render the ↗ link for real URLs.
  const external = /^https?:\/\//.test(application.externalUrl)
    ? application.externalUrl
    : null;
  const dl = opportunity ? daysUntil(opportunity.deadlineAt) : null;

  return (
    <div className="mx-auto max-w-5xl animate-rise px-4 py-6">
      <Link
        href="/applications"
        className="label inline-flex items-center gap-1.5 text-subtle transition-colors hover:text-ink"
      >
        <span aria-hidden>←</span> Applications
      </Link>

      {/* Header — monogram, slab title, label meta line */}
      <div className="mt-5 flex items-start gap-4">
        <Monogram
          name={employer}
          className="h-14 w-14 rounded-[var(--radius-control)] text-base"
        />
        <div className="min-w-0">
          <h1 className="text-[1.75rem] leading-tight text-ink">
            {employer} — {role}
          </h1>
          <div className="label mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-subtle">
            <span>{application.ats}</span>
            <span aria-hidden className="text-deco">·</span>
            <span>{application.source}</span>
            <span aria-hidden className="text-deco">·</span>
            <span>
              Added <span className="tabular">{formatDate(application.createdAt)}</span>
            </span>
            {external && (
              <>
                <span aria-hidden className="text-deco">·</span>
                <a
                  href={external}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-ink transition-colors hover:text-accent"
                >
                  {hostOf(external)} <span aria-hidden>↗</span>
                </a>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Status stepper — segmented pill strip; every move is reversible, so
          each non-current status is a one-click form button. */}
      <div
        role="group"
        aria-label="Application status"
        className="mt-5 inline-flex flex-wrap items-center gap-1 rounded-pill border border-border bg-surface p-1 shadow-card"
      >
        {APPLICATION_STATUSES.map((s) => {
          const current = s === application.status;
          const terminal = s === "REJECTED" || s === "WITHDRAWN";
          if (current) {
            return (
              <span
                key={s}
                aria-current="step"
                className="label rounded-pill bg-ink px-3 py-1.5 text-canvas"
              >
                {APPLICATION_STATUS_LABEL[s]}
              </span>
            );
          }
          return (
            <form key={s} action={updateApplicationStatusForm.bind(null, application.id, s)}>
              <button
                type="submit"
                className={cn(
                  "label rounded-pill px-3 py-1.5 transition-colors hover:bg-surface-2 hover:text-ink",
                  terminal ? "text-faint" : "text-subtle",
                )}
              >
                {APPLICATION_STATUS_LABEL[s]}
              </button>
            </form>
          );
        })}
      </div>

      <div
        className={cn(
          "mt-6 grid gap-5",
          opportunity && "lg:grid-cols-[minmax(0,1fr)_320px]",
        )}
      >
        {/* Drafts & answers */}
        <section className="rounded-card border border-border bg-surface shadow-card">
          <div className="flex items-baseline justify-between border-b border-border px-4 py-2.5">
            <h2 className="label text-faint">DRAFTS &amp; ANSWERS</h2>
            {drafts.length > 0 && (
              <span className="tabular label text-faint">{drafts.length}</span>
            )}
          </div>
          {drafts.length === 0 ? (
            <p className="px-4 py-4 text-[0.875rem] text-muted">
              No drafts yet — generate from the extension or ask Cyclops.
            </p>
          ) : (
            <div className="space-y-3 px-4 py-3">
              {drafts.map((d) => {
                const ctx = (d.context ?? {}) as { question?: unknown };
                const question =
                  typeof ctx.question === "string" && ctx.question.trim()
                    ? ctx.question
                    : d.kind.replace(/_/g, " ").toLowerCase();
                return (
                  <DraftReviewCard
                    key={d.id}
                    draftId={d.id}
                    question={question}
                    content={d.content}
                    meta={[d.kind, d.model].filter(Boolean).join(" · ")}
                  />
                );
              })}
            </div>
          )}
        </section>

        {/* Listing — only when the application is linked to a tracked listing */}
        {opportunity && (
          <section className="self-start rounded-card border border-border bg-surface shadow-card">
            <div className="border-b border-border px-4 py-2.5">
              <h2 className="label text-faint">LISTING</h2>
            </div>
            <div className="px-4 py-3">
              <p className="text-[0.875rem] font-bold text-ink">
                {opportunity.employer.name}
              </p>
              <p className="text-[0.8125rem] text-muted">{opportunity.title}</p>
              <p className="label mt-2 text-subtle">
                {opportunity.deadlineAt ? (
                  <>
                    Deadline{" "}
                    <span className="tabular text-ink">
                      {formatDate(opportunity.deadlineAt)}
                    </span>
                    {dl !== null && dl >= 0 && (
                      <>
                        {" "}· <span className="tabular text-ink">D-{dl}</span>
                      </>
                    )}
                  </>
                ) : (
                  "Rolling / no stated deadline"
                )}
              </p>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <Link
                  href={`/tracker/${opportunity.id}`}
                  className="rounded-pill border border-border-interactive bg-surface px-3 py-1 text-[0.8125rem] font-bold text-ink transition-colors hover:bg-surface-2"
                >
                  View listing →
                </Link>
                <Link
                  href={`/chat?opportunity=${opportunity.id}`}
                  className="inline-flex items-center gap-1.5 rounded-pill border border-border-agent bg-accent-tint px-3 py-1 text-[0.8125rem] font-medium text-accent transition-colors hover:bg-accent-soft"
                >
                  <span aria-hidden className="text-xs leading-none">◆</span>
                  Ask Cyclops
                </Link>
              </div>
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
