"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { deleteAccount, exportMyData } from "@/server/actions/account";
import { DELETE_CONFIRM_PHRASE } from "@/app/(app)/settings/account-constants";

/**
 * Settings "Your data" section — additive, matches the GB+ design system
 * (typographic glyphs only, no icons). Two affordances:
 *   - Export my data: pulls the full JSON payload and downloads it as a file.
 *   - Delete account: an irreversible hard delete behind a typed confirmation
 *     (the user must type DELETE) — the destructive button stays disabled until
 *     the phrase matches exactly.
 */
export function AccountData() {
  const [pending, startTransition] = useTransition();
  const [exportError, setExportError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState("");
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const confirmed = confirm === DELETE_CONFIRM_PHRASE;

  const onExport = () => {
    setExportError(null);
    startTransition(async () => {
      const res = await exportMyData();
      if (res.error || !res.data) {
        setExportError(res.error ?? "Could not export your data.");
        return;
      }
      try {
        const blob = new Blob([JSON.stringify(res.data, null, 2)], {
          type: "application/json",
        });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        const stamp = new Date().toISOString().slice(0, 10);
        a.download = `cyclops-data-export-${stamp}.json`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
      } catch {
        setExportError("Download failed — try again.");
      }
    });
  };

  const onDelete = () => {
    if (!confirmed) return;
    setDeleteError(null);
    startTransition(async () => {
      const res = await deleteAccount({ confirm });
      if (res.error || !res.ok) {
        setDeleteError(res.error ?? "Could not delete your account.");
        return;
      }
      // Session is invalidated server-side; leave the app.
      window.location.href = res.redirectTo ?? "/";
    });
  };

  return (
    <section className="rounded-card border border-border bg-surface shadow-card">
      <div className="flex items-baseline justify-between border-b border-border px-4 py-2.5">
        <h2 className="text-[1rem] font-semibold text-ink">Your data</h2>
        <span className="label text-faint">EXPORT · DELETE</span>
      </div>

      <div className="space-y-5 px-4 py-4">
        {/* Export */}
        <div className="space-y-2">
          <p className="text-[0.8125rem] font-bold text-ink">
            Export everything we hold about you
          </p>
          <p className="text-[0.8125rem] text-muted">
            Downloads a single JSON file with your profile, preferences, saved
            roles, applications, drafts, memory, chats and more. API token
            secrets are never included.
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" variant="outline" onClick={onExport} disabled={pending}>
              {pending ? "Preparing…" : "Export my data"}
            </Button>
          </div>
          {exportError && <p className="label text-danger">{exportError}</p>}
        </div>

        {/* Danger zone */}
        <div className="space-y-2 rounded-control border border-danger/40 bg-danger/5 p-3">
          <p className="label text-danger">▸ DANGER ZONE — CANNOT BE UNDONE</p>
          <p className="text-[0.8125rem] font-bold text-ink">Delete account</p>
          <p className="text-[0.8125rem] text-muted">
            Permanently deletes your account and all of your data — profile,
            applications, drafts, memory, chats and tokens. This is immediate and
            irreversible.
          </p>
          <label className="block">
            <span className="label text-subtle">
              Type {DELETE_CONFIRM_PHRASE} to confirm
            </span>
            <input
              type="text"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              autoComplete="off"
              spellCheck={false}
              placeholder={DELETE_CONFIRM_PHRASE}
              className="mt-1 w-full rounded-control border border-border bg-surface px-3 py-2 text-[0.8125rem] text-ink tabular outline-none focus:border-border-strong"
            />
          </label>
          <Button
            size="sm"
            variant="danger"
            onClick={onDelete}
            disabled={pending || !confirmed}
          >
            {pending ? "Deleting…" : "Delete account"}
          </Button>
          {deleteError && <p className="label text-danger">{deleteError}</p>}
        </div>
      </div>
    </section>
  );
}
