"use client";

import Link from "next/link";
import { useTransition } from "react";
import { Select } from "@/components/ui/select";
import { Monogram } from "@/components/ui/monogram";
import {
  updateApplicationStatus,
  deleteApplication,
} from "@/server/actions/applications";
import {
  APPLICATION_STATUSES,
  APPLICATION_STATUS_LABEL,
} from "@/lib/constants";

export interface ApplicationRow {
  id: string;
  externalUrl: string;
  employerName: string | null;
  roleTitle: string | null;
  ats: string;
  status: string;
  source: string;
  createdAt: string;
  submittedAt: string | null;
  draftCount: number;
  opportunityId: string | null;
}

function hostOf(url: string) {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

function Row({
  app,
  showSubmittedDate,
}: {
  app: ApplicationRow;
  showSubmittedDate: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const employer = app.employerName || hostOf(app.externalUrl);

  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3">
      <Monogram name={employer} className="h-9 w-9" />
      <Link
        href={`/applications/${app.id}`}
        className="group min-w-0 flex-1 basis-52"
      >
        <p className="truncate text-[0.875rem]">
          <span className="font-bold text-ink group-hover:underline">
            {employer}
          </span>{" "}
          <span className="text-muted">{app.roleTitle || "Untitled role"}</span>
        </p>
        <p className="label mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-faint">
          {app.draftCount > 0 && (
            <span className="rounded-pill bg-accent-soft px-2 py-0.5 text-accent">
              ◆ {app.draftCount} draft{app.draftCount === 1 ? "" : "s"}
            </span>
          )}
          <span>{app.ats}</span>
          {showSubmittedDate && app.submittedAt && (
            <span>
              submitted <span className="tabular">{app.submittedAt}</span>
            </span>
          )}
        </p>
      </Link>
      <span className="tabular shrink-0 text-[0.6875rem] text-subtle">
        {app.createdAt}
      </span>
      <Select
        value={app.status}
        disabled={pending}
        aria-label={`Status for ${employer}`}
        onChange={(e) =>
          startTransition(() =>
            updateApplicationStatus(app.id, e.target.value).then(),
          )
        }
        className="h-8 w-36 text-[0.8125rem]"
      >
        {APPLICATION_STATUSES.map((s) => (
          <option key={s} value={s}>
            {APPLICATION_STATUS_LABEL[s]}
          </option>
        ))}
      </Select>
      <button
        type="button"
        disabled={pending}
        onClick={() => startTransition(() => deleteApplication(app.id).then())}
        className="label min-h-6 shrink-0 px-1.5 py-1 text-subtle transition-colors hover:text-danger disabled:opacity-40"
      >
        Delete
      </button>
    </li>
  );
}

/** One pipeline group — GB+ card with a slab caption, count, and rows. */
export function ApplicationsGroup({
  caption,
  apps,
  showSubmittedDate = false,
}: {
  caption: string;
  apps: ApplicationRow[];
  showSubmittedDate?: boolean;
}) {
  return (
    <section className="rounded-card border border-border bg-surface shadow-card">
      <div className="flex items-baseline justify-between border-b border-border px-4 py-2.5">
        <h2 className="text-[1.0625rem] leading-none text-ink">{caption}</h2>
        <span className="tabular label text-faint">{apps.length}</span>
      </div>
      <ul className="divide-y divide-hairline">
        {apps.map((app) => (
          <Row key={app.id} app={app} showSubmittedDate={showSubmittedDate} />
        ))}
      </ul>
    </section>
  );
}
