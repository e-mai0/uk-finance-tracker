import Link from "next/link";
import { notFound } from "next/navigation";
import { auth } from "@/server/auth";
import { prisma } from "@/server/db";
import { getOpportunityDetail } from "@/server/queries/opportunities";
import { Monogram } from "@/components/ui/monogram";
import { Badge } from "@/components/ui/badge";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusBadge } from "@/components/tracker/status-badge";
import { FitPill } from "@/components/tracker/fit-pill";
import { SaveButton } from "@/components/tracker/save-button";
import { NotesEditor } from "@/components/tracker/notes-editor";
import { CoverLetterCard } from "@/components/copilot/cover-letter-card";
import { ROLE_FAMILY_LABEL } from "@/lib/constants";
import { fitTierLabel } from "@/lib/scoring";
import { formatDate, daysUntil } from "@/lib/utils";

const APP_STATUS_LABEL: Record<string, string> = {
  DRAFT: "Application started",
  AUTOFILLED: "Autofilled",
  SUBMITTED: "Submitted",
  INTERVIEWING: "Interviewing",
  OFFER: "Offer",
  REJECTED: "Rejected",
  WITHDRAWN: "Withdrawn",
};

export const dynamic = "force-dynamic";

export default async function OpportunityDetailPage({
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

  return (
    <div className="mx-auto max-w-5xl px-4 py-6">
      <Link
        href="/dashboard"
        className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-ink"
      >
        <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.6">
          <path d="M12 5l-5 5 5 5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        Back to tracker
      </Link>

      <div className="mt-4 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-4">
          <Monogram name={o.employer.name} hint={o.employer.logoHint} className="h-12 w-12 text-sm" />
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-ink">
              {o.title}
            </h1>
            <p className="mt-1 text-sm text-muted">
              {o.employer.name}
              {o.divisionDesk ? ` · ${o.divisionDesk}` : ""} · {o.location}
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <StatusBadge status={o.status} />
              <Badge tone="neutral">{ROLE_FAMILY_LABEL[o.roleFamily]}</Badge>
              <Badge tone="neutral">{o.programmeType}</Badge>
              {o.isUkBased && <Badge tone="neutral">UK-based</Badge>}
              {application && (
                <Badge tone="accent" dot>
                  {APP_STATUS_LABEL[application.status] ?? application.status}
                </Badge>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <SaveButton opportunityId={o.id} initialSaved={saved} variant="full" />
          {applyUrl && (
            <a
              href={applyUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex h-10 items-center gap-2 rounded-lg bg-accent px-4 text-sm font-medium text-accent-fg shadow-sm transition-colors hover:bg-accent-hover"
            >
              Apply
              <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.6">
                <path d="M7 13l6-6M8 7h5v5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </a>
          )}
        </div>
      </div>

      <div className="mt-6 grid gap-5 lg:grid-cols-[minmax(0,1fr)_300px]">
        <div className="space-y-5">
          <Card>
            <CardHeader>
              <CardTitle>About this programme</CardTitle>
            </CardHeader>
            <CardBody className="space-y-4">
              <p className="text-sm leading-relaxed text-ink">
                {o.descriptionSummary}
              </p>
              {o.eligibilityNotes && (
                <div>
                  <h4 className="text-xs font-semibold uppercase tracking-wide text-subtle">
                    Eligibility
                  </h4>
                  <p className="mt-1 text-sm text-muted">{o.eligibilityNotes}</p>
                </div>
              )}
              {o.sponsorshipInfo && (
                <div>
                  <h4 className="text-xs font-semibold uppercase tracking-wide text-subtle">
                    Visa sponsorship
                  </h4>
                  <p className="mt-1 text-sm text-muted">{o.sponsorshipInfo}</p>
                </div>
              )}
              {o.tags.length > 0 && (
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {o.tags.map((t) => (
                    <Badge key={t.id} tone="neutral">
                      {t.label}
                    </Badge>
                  ))}
                </div>
              )}
            </CardBody>
          </Card>

          <CoverLetterCard opportunityId={o.id} />

          <Card>
            <CardHeader>
              <CardTitle>Your private notes</CardTitle>
            </CardHeader>
            <CardBody>
              <NotesEditor opportunityId={o.id} initialNotes={savedNotes} />
            </CardBody>
          </Card>
        </div>

        <div className="space-y-5">
          <Card>
            <CardHeader className="flex items-center justify-between">
              <CardTitle>Your fit</CardTitle>
              <FitPill score={score} />
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
                        className={
                          warn
                            ? "mt-0.5 text-warning"
                            : "mt-0.5 text-success"
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
              <CardTitle>Key details</CardTitle>
            </CardHeader>
            <CardBody className="divide-y divide-border">
              <Detail label="Opens" value={formatDate(o.opensAt)} />
              <Detail
                label="Deadline"
                value={
                  o.deadlineAt
                    ? `${formatDate(o.deadlineAt)}${
                        dl !== null && dl >= 0 ? ` · in ${dl}d` : ""
                      }`
                    : "Rolling / not stated"
                }
              />
              <Detail label="Location" value={`${o.location}, ${o.country}`} />
              <Detail label="Programme" value={o.programmeType} />
              <Detail label="Source" value={o.sourceType.replace(/_/g, " ").toLowerCase()} />
              <Detail
                label="Parse confidence"
                value={`${Math.round(o.confidence * 100)}%`}
              />
              <Detail label="First seen" value={formatDate(o.firstSeenAt)} />
              <Detail label="Last seen" value={formatDate(o.lastSeenAt)} />
            </CardBody>
          </Card>

          {o.sources.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Links</CardTitle>
              </CardHeader>
              <CardBody className="space-y-2">
                {o.sources.map((s) => (
                  <a
                    key={s.id}
                    href={s.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-between rounded-md border border-border px-3 py-2 text-sm text-ink hover:bg-surface-2"
                  >
                    {s.label ?? "Source"}
                    <span className="text-subtle">↗</span>
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

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between py-2 first:pt-0 last:pb-0">
      <span className="text-sm text-muted">{label}</span>
      <span className="text-right text-sm font-medium capitalize text-ink">
        {value}
      </span>
    </div>
  );
}
