import { auth } from "@/server/auth";
import { prisma } from "@/server/db";
import {
  ApplicationsGroup,
  type ApplicationRow,
} from "@/components/applications/applications-list";

export const dynamic = "force-dynamic";
export const metadata = { title: "Applications — Trackr" };

const fmtDate = (d: Date) =>
  new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short" }).format(d);

const GROUPS = [
  { caption: "In progress", statuses: ["DRAFT", "AUTOFILLED"] },
  {
    caption: "Submitted",
    statuses: ["SUBMITTED", "INTERVIEWING", "OFFER"],
    showSubmittedDate: true,
  },
  { caption: "Closed", statuses: ["REJECTED", "WITHDRAWN"] },
] as const;

export default async function ApplicationsPage() {
  const session = await auth();
  const userId = session!.user.id;

  const [apps, draftGroups] = await Promise.all([
    prisma.application.findMany({
      where: { userId },
      orderBy: { updatedAt: "desc" },
    }),
    prisma.generatedDraft.groupBy({
      by: ["applicationId"],
      where: { userId, applicationId: { not: null } },
      _count: true,
    }),
  ]);
  const draftCounts = new Map(draftGroups.map((g) => [g.applicationId, g._count]));

  const rows: ApplicationRow[] = apps.map((a) => ({
    id: a.id,
    externalUrl: a.externalUrl,
    employerName: a.employerName,
    roleTitle: a.roleTitle,
    ats: a.ats,
    status: a.status,
    source: a.source,
    createdAt: fmtDate(a.createdAt),
    submittedAt: a.submittedAt ? fmtDate(a.submittedAt) : null,
    draftCount: draftCounts.get(a.id) ?? 0,
    opportunityId: a.opportunityId,
  }));

  const submitted = apps.filter(
    (a) => a.status !== "DRAFT" && a.status !== "AUTOFILLED",
  ).length;

  return (
    <div className="mx-auto max-w-5xl space-y-5 px-4 py-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="label text-subtle">Pipeline</div>
          <h1 className="mt-1 text-[1.375rem] leading-none text-ink">
            Applications
          </h1>
          <p className="mt-0.5 text-sm text-muted">
            Roles you’ve started or submitted with the apply copilot. Update the
            status as you progress.
          </p>
        </div>
        {apps.length > 0 && (
          <p className="text-sm text-muted tabular">
            {apps.length} tracked · {submitted} submitted+
          </p>
        )}
      </div>

      {apps.length === 0 ? (
        <div className="rounded-card border border-dashed border-border-strong bg-surface px-6 py-12 text-center">
          <p className="text-sm font-medium text-ink">No applications yet</p>
          <p className="mx-auto mt-1 max-w-md text-sm text-muted">
            Install the Trackr autofill extension and apply to a role — your
            applications will appear here automatically. You can also set it up in{" "}
            <a href="/settings" className="font-medium text-accent hover:underline">
              Settings
            </a>
            .
          </p>
        </div>
      ) : (
        GROUPS.map((g) => {
          const groupApps = rows.filter((r) =>
            (g.statuses as readonly string[]).includes(r.status),
          );
          if (groupApps.length === 0) return null;
          return (
            <ApplicationsGroup
              key={g.caption}
              caption={g.caption}
              apps={groupApps}
              showSubmittedDate={"showSubmittedDate" in g}
            />
          );
        })
      )}
    </div>
  );
}
