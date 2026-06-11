import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/server/auth";
import { prisma } from "@/server/db";
import { getOpportunityDetail } from "@/server/queries/opportunities";
import { startApplication } from "@/server/actions/applications";
import { Monogram } from "@/components/ui/monogram";
import { Badge } from "@/components/ui/badge";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { StatusBadge } from "@/components/tracker/status-badge";
import { FitPill, FitBar } from "@/components/tracker/fit-pill";
import { SaveButton } from "@/components/tracker/save-button";
import { NotesEditor } from "@/components/tracker/notes-editor";
import { CoverLetterCard } from "@/components/copilot/cover-letter-card";
import { ROLE_FAMILY_LABEL } from "@/lib/constants";
import { fitTierLabel } from "@/lib/scoring";
import { formatDate, daysUntil } from "@/lib/utils";

export const dynamic = "force-dynamic";

/** Pipeline tag — drafting vs submitted-and-beyond. */
function pipelineTag(status: string): { glyph: string; label: string; cls: string } {
  if (status === "DRAFT" || status === "AUTOFILLED")
    return { glyph: "◆", label: "drafting", cls: "text-accent" };
  return { glyph: "✓", label: status.toLowerCase(), cls: "text-success" };
}

async function startAndGo(opportunityId: string) {
  "use server";
  const res = await startApplication(opportunityId);
  if (res.ok) redirect("/applications");
}

export default async function ListingPeekPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await auth();
  const detail = await getOpportunityDetail(id, session!.user.id);
  if (!detail) notFound();

  const { opportunity: o, score, reasons, saved, savedNotes } = detail;
  const dl = daysUntil(o.deadlineAt);
  const applyUrl = o.applicationUrl ?? o.employer.website ?? o.sourceUrl;

  const application = await prisma.application.findFirst({
    where: { userId: session!.user.id, opportunityId: o.id },
    select: { status: true },
  });
  const tag = application ? pipelineTag(application.status) : null;

  return (
    <div className="mx-auto max-w-5xl animate-rise px-4 py-6">
      <Link
        href="/tracker"
        className="label inline-flex items-center gap-1.5 text-subtle transition-colors hover:text-ink"
      >
        <span aria-hidden>←</span> Tracker
      </Link>

      {/* Header — monogram, slab title, label meta line */}
      <div className="mt-5 flex items-start gap-4">
        <Monogram
          name={o.employer.name}
          hint={o.employer.logoHint}
          className="h-14 w-14 rounded-[var(--radius-control)] text-base"
        />
        <div className="min-w-0">
          <h1 className="text-[1.75rem] leading-tight text-ink">{o.title}</h1>
          <p className="mt-1 text-sm text-muted">{o.employer.name}</p>
          <div className="label mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-subtle">
            <span>{o.location}</span>
            {o.divisionDesk && (
              <>
                <span aria-hidden className="text-deco">·</span>
                <span>{o.divisionDesk}</span>
              </>
            )}
            <span aria-hidden className="text-deco">·</span>
            <span>{o.programmeType}</span>
            <span aria-hidden className="text-deco">·</span>
            <StatusBadge status={o.status} />
            {tag && (
              <>
                <span aria-hidden className="text-deco">·</span>
                <span className={`tabular ${tag.cls}`}>
                  <span aria-hidden>{tag.glyph}</span> {tag.label}
                </span>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Action row */}
      <div className="mt-5 flex flex-wrap items-center gap-2.5">
        <form action={startAndGo.bind(null, o.id)}>
          <button
            type="submit"
            className="inline-flex h-9 items-center gap-2 rounded-[var(--radius-pill)] bg-chrome px-4 text-sm font-medium text-chrome-ink transition-colors hover:bg-chrome-2"
          >
            {application ? "Continue application" : "Start application"}
          </button>
        </form>
        <SaveButton opportunityId={o.id} initialSaved={saved} variant="full" />
        <Link
          href={`/chat?opportunity=${o.id}`}
          className="inline-flex h-9 items-center gap-2 rounded-[var(--radius-pill)] border border-border-agent bg-accent-tint px-4 text-sm font-medium text-accent transition-colors hover:bg-accent-soft"
        >
          <span aria-hidden className="text-xs leading-none">◆</span>
          Ask Cyclops
        </Link>
        {applyUrl && (
          <a
            href={applyUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex h-9 items-center gap-2 rounded-[var(--radius-pill)] border border-border-interactive bg-surface px-4 text-sm font-medium text-ink transition-colors hover:bg-surface-2"
          >
            Apply
            <span aria-hidden className="text-base leading-none">↗</span>
          </a>
        )}
      </div>

      <div className="mt-6 grid gap-5 lg:grid-cols-[minmax(0,1fr)_300px]">
        {/* Left column */}
        <div className="space-y-5">
          <Card>
            <CardHeader>
              <span className="label text-subtle">About this programme</span>
            </CardHeader>
            <CardBody className="space-y-4">
              <p className="text-sm leading-relaxed text-ink">
                {o.descriptionSummary}
              </p>
              {o.eligibilityNotes && (
                <div>
                  <h4 className="label text-subtle">Eligibility</h4>
                  <p className="mt-1 text-sm text-muted">{o.eligibilityNotes}</p>
                </div>
              )}
              {o.sponsorshipInfo && (
                <div>
                  <h4 className="label text-subtle">Visa sponsorship</h4>
                  <p className="mt-1 text-sm text-muted">{o.sponsorshipInfo}</p>
                </div>
              )}
              <div className="flex flex-wrap gap-1.5 pt-1">
                <Badge tone="neutral">{ROLE_FAMILY_LABEL[o.roleFamily]}</Badge>
                {o.isUkBased && <Badge tone="neutral">UK-based</Badge>}
                {o.tags.map((t) => (
                  <Badge key={t.id} tone="neutral">
                    {t.label}
                  </Badge>
                ))}
              </div>
            </CardBody>
          </Card>

          <CoverLetterCard opportunityId={o.id} />

          <Card>
            <CardHeader>
              <span className="label text-subtle">Your private notes</span>
            </CardHeader>
            <CardBody>
              <NotesEditor opportunityId={o.id} initialNotes={savedNotes} />
            </CardBody>
          </Card>
        </div>

        {/* Right column */}
        <div className="space-y-5">
          <Card>
            <CardHeader className="flex items-center justify-between gap-3">
              <span className="label text-subtle">Your fit</span>
              <span className="flex items-center gap-2">
                <FitBar score={score} />
                <FitPill score={score} />
              </span>
            </CardHeader>
            <CardBody>
              <p className="text-sm font-medium text-ink">
                {score != null ? fitTierLabel(score) : "Not scored yet"}
              </p>
              <ul className="mt-3 space-y-2">
                {reasons.length === 0 && (
                  <li className="text-sm text-muted">
                    Update your profile in Settings to see why this role fits.
                  </li>
                )}
                {reasons.map((r, i) => {
                  const warn = r.startsWith("⚠");
                  return (
                    <li key={i} className="flex items-start gap-2 text-sm">
                      <span
                        aria-hidden
                        className={
                          warn ? "tabular mt-0.5 text-warning" : "tabular mt-0.5 text-success"
                        }
                      >
                        {warn ? "!" : "✓"}
                      </span>
                      <span className="text-muted">
                        {warn ? r.replace(/^⚠\s*/, "") : r}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </CardBody>
          </Card>

          <Card>
            <CardHeader>
              <span className="label text-subtle">Key details</span>
            </CardHeader>
            <CardBody className="divide-y divide-hairline">
              <Detail label="Opens" value={formatDate(o.opensAt)} mono />
              <Detail
                label="Deadline"
                value={
                  o.deadlineAt
                    ? `${formatDate(o.deadlineAt)}${
                        dl !== null && dl >= 0 ? ` · in ${dl}d` : ""
                      }`
                    : "Rolling / not stated"
                }
                mono={!!o.deadlineAt}
              />
              <Detail label="Location" value={`${o.location}, ${o.country}`} />
              <Detail label="Programme" value={o.programmeType} />
              <Detail
                label="Source"
                value={o.sourceType.replace(/_/g, " ").toLowerCase()}
              />
              <Detail
                label="Confidence"
                value={`${Math.round(o.confidence * 100)}%`}
                mono
              />
              <Detail label="First seen" value={formatDate(o.firstSeenAt)} mono />
              <Detail label="Last seen" value={formatDate(o.lastSeenAt)} mono />
            </CardBody>
          </Card>

          {o.sources.length > 0 && (
            <Card>
              <CardHeader>
                <span className="label text-subtle">Sources</span>
              </CardHeader>
              <CardBody className="space-y-2">
                {o.sources.map((s) => (
                  <a
                    key={s.id}
                    href={s.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-between rounded-[var(--radius-control)] border border-border px-3 py-2 text-sm text-ink transition-colors hover:bg-surface-2"
                  >
                    {s.label ?? "Source"}
                    <span aria-hidden className="text-subtle">↗</span>
                  </a>
                ))}
              </CardBody>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

function Detail({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-3 py-2 first:pt-0 last:pb-0">
      <span className="label shrink-0 text-subtle">{label}</span>
      <span
        className={
          mono
            ? "tabular text-right text-[0.8125rem] text-ink"
            : "text-right text-sm capitalize text-ink"
        }
      >
        {value}
      </span>
    </div>
  );
}
