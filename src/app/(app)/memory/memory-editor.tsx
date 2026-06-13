"use client";

import { useState, useTransition, useEffect } from "react";
import { cn } from "@/lib/utils";
import { saveMemoryFile, revertMemoryRevision } from "./actions";

export interface MemoryRevision {
  id: string;
  author: "USER" | "CYCLOPS";
  reason: string | null;
  createdAt: string; // ISO string
}

interface Props {
  path: string;
  content: string;
  revisions: MemoryRevision[];
}

export function MemoryEditor({ path, content, revisions }: Props) {
  const [text, setText] = useState(content);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  // Resync textarea when server refreshes the content prop (after save/restore)
  useEffect(() => {
    setText(content);
  }, [content]);

  const isDirty = text !== content;

  function handleSave() {
    setError(null);
    startTransition(async () => {
      try {
        const res = await saveMemoryFile(path, text);
        if (!res.ok) setError(res.error);
      } catch {
        setError("Save failed.");
      }
    });
  }

  function handleRestore(rev: MemoryRevision) {
    const ts = new Date(rev.createdAt).toLocaleString("en-GB", {
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
    const who = rev.author === "CYCLOPS" ? "Cyclops" : "you";
    const confirmed = window.confirm(
      `Restore the version that existed before the change made by ${who} at ${ts}?\n\nThis will overwrite the current file (the action itself is recorded and reversible).`,
    );
    if (!confirmed) return;
    setError(null);
    startTransition(async () => {
      try {
        const res = await revertMemoryRevision(rev.id);
        if (!res.ok) setError(res.error);
      } catch {
        setError("Restore failed.");
      }
    });
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Header row */}
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 className="truncate font-mono text-[0.75rem] font-normal text-ink">
            {path}
          </h2>
          <p className="mt-0.5 text-[0.8125rem] text-muted">
            Cyclops reads these files before every conversation. Edit anything;
            every change is recorded below.
          </p>
        </div>
        <button
          type="button"
          onClick={handleSave}
          disabled={!isDirty || isPending}
          className={cn(
            // Manual save is a user commit — ink pill, never amber.
            "shrink-0 rounded-pill px-4 py-1.5 text-[0.8125rem] font-extrabold transition-colors",
            isDirty && !isPending
              ? "bg-ink text-canvas hover:bg-chrome-2"
              : "cursor-not-allowed border border-border bg-surface text-faint",
          )}
        >
          {isPending ? "Saving…" : "Save"}
        </button>
      </div>

      {/* Error banner */}
      {error && (
        <div
          role="alert"
          className="rounded-[var(--radius-control)] border border-danger-soft bg-danger-soft px-3 py-2 text-[0.8125rem] text-danger"
        >
          <span aria-hidden className="mr-1">
            ▲
          </span>
          {error}
        </div>
      )}

      {/* Textarea */}
      <textarea
        aria-label={`Edit memory file: ${path}`}
        value={text}
        onChange={(e) => setText(e.target.value)}
        spellCheck={false}
        className={cn(
          "h-96 w-full resize-y rounded-[var(--radius-control)] border border-border-interactive bg-surface px-3 py-2.5",
          "font-mono text-[0.75rem] leading-relaxed text-ink",
          "placeholder:text-faint",
        )}
      />

      {/* Revision history */}
      <div>
        <p className="label mb-2 text-subtle uppercase tracking-widest">
          History
        </p>
        {revisions.length === 0 ? (
          <p className="font-mono text-[0.6875rem] text-faint">
            No revisions yet.
          </p>
        ) : (
          <div className="divide-y divide-hairline overflow-hidden rounded-[var(--radius-control)] border border-border">
            {revisions.map((rev) => {
              const who = rev.author === "CYCLOPS" ? "Cyclops" : "You";
              const ts = new Date(rev.createdAt).toLocaleString("en-GB", {
                day: "numeric",
                month: "short",
                year: "numeric",
                hour: "2-digit",
                minute: "2-digit",
              });
              return (
                <div
                  key={rev.id}
                  className="flex items-center justify-between gap-3 px-3 py-2"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline gap-2">
                      <span className="font-mono text-[0.6875rem] text-ink">
                        {who}
                      </span>
                      <span className="font-mono text-[0.6875rem] text-subtle">
                        {ts}
                      </span>
                    </div>
                    {rev.reason && (
                      <p className="mt-0.5 truncate font-mono text-[0.6875rem] text-muted">
                        {rev.reason}
                      </p>
                    )}
                  </div>
                  <button
                    type="button"
                    aria-label={`Restore version before ${who}'s change at ${ts}`}
                    onClick={() => handleRestore(rev)}
                    disabled={isPending}
                    className={cn(
                      "label shrink-0 rounded-pill border border-border-interactive px-2.5 py-1 text-subtle transition-colors",
                      "hover:bg-surface-2 hover:text-ink",
                      "disabled:cursor-not-allowed disabled:opacity-40",
                    )}
                  >
                    Restore
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
