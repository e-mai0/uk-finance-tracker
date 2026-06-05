"use client";

import { useTransition } from "react";
import { Select } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import {
  updateApplicationStatus,
  deleteApplication,
} from "@/server/actions/applications";

export interface ApplicationRow {
  id: string;
  externalUrl: string;
  employerName: string | null;
  roleTitle: string | null;
  ats: string;
  status: string;
  source: string;
  createdAt: string;
  opportunityId: string | null;
}

const STATUS_OPTIONS = [
  "DRAFT",
  "AUTOFILLED",
  "SUBMITTED",
  "INTERVIEWING",
  "OFFER",
  "REJECTED",
  "WITHDRAWN",
] as const;

const STATUS_LABEL: Record<string, string> = {
  DRAFT: "Draft",
  AUTOFILLED: "Autofilled",
  SUBMITTED: "Submitted",
  INTERVIEWING: "Interviewing",
  OFFER: "Offer",
  REJECTED: "Rejected",
  WITHDRAWN: "Withdrawn",
};

function statusTone(s: string) {
  switch (s) {
    case "OFFER":
      return "success" as const;
    case "INTERVIEWING":
      return "info" as const;
    case "SUBMITTED":
      return "accent" as const;
    case "REJECTED":
    case "WITHDRAWN":
      return "danger" as const;
    default:
      return "neutral" as const;
  }
}

function hostOf(url: string) {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

function Row({ app }: { app: ApplicationRow }) {
  const [pending, startTransition] = useTransition();

  return (
    <tr className="border-b border-border last:border-0">
      <td className="py-3 pl-4 pr-4">
        <p className="text-sm font-medium text-ink">
          {app.roleTitle || "Untitled role"}
        </p>
        <p className="text-xs text-muted">{app.employerName || hostOf(app.externalUrl)}</p>
      </td>
      <td className="py-3 pr-4">
        <Badge tone="neutral">{app.ats}</Badge>
      </td>
      <td className="py-3 pr-4">
        <Badge tone={statusTone(app.status)} dot>
          {STATUS_LABEL[app.status] ?? app.status}
        </Badge>
      </td>
      <td className="py-3 pr-4 text-xs text-muted tabular">{app.createdAt}</td>
      <td className="py-3 pr-4">
        <Select
          value={app.status}
          disabled={pending}
          onChange={(e) =>
            startTransition(() =>
              updateApplicationStatus(app.id, e.target.value).then(),
            )
          }
          className="h-9 w-40"
        >
          {STATUS_OPTIONS.map((s) => (
            <option key={s} value={s}>
              {STATUS_LABEL[s]}
            </option>
          ))}
        </Select>
      </td>
      <td className="py-3 pr-4 text-right">
        <div className="flex items-center justify-end gap-3">
          <a
            href={app.externalUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs font-medium text-accent hover:underline"
          >
            Open
          </a>
          <button
            type="button"
            onClick={() =>
              startTransition(() => deleteApplication(app.id).then())
            }
            className="text-xs font-medium text-danger hover:underline"
          >
            Delete
          </button>
        </div>
      </td>
    </tr>
  );
}

export function ApplicationsList({ apps }: { apps: ApplicationRow[] }) {
  return (
    <div className="overflow-x-auto rounded-[var(--radius-card)] border border-border bg-surface shadow-[var(--shadow-card)]">
      <table className="w-full min-w-[680px]">
        <thead>
          <tr className="border-b border-border text-left text-xs font-medium text-subtle">
            <th className="px-4 py-3 font-medium">Role</th>
            <th className="px-4 py-3 font-medium">ATS</th>
            <th className="px-4 py-3 font-medium">Status</th>
            <th className="px-4 py-3 font-medium">Added</th>
            <th className="px-4 py-3 font-medium">Update</th>
            <th className="px-4 py-3" />
          </tr>
        </thead>
        <tbody className="px-4">
          {apps.map((app) => (
            <Row key={app.id} app={app} />
          ))}
        </tbody>
      </table>
    </div>
  );
}
