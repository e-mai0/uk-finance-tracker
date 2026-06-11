"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { acceptDraft, skipDraft } from "@/server/actions/drafts";

const PRI_PILL =
  "rounded-pill bg-ink px-4 py-1.5 text-[0.8125rem] font-bold text-canvas transition-opacity disabled:opacity-60";
const SEC_PILL =
  "rounded-pill border border-border-interactive bg-surface px-3 py-1 text-[0.8125rem] font-bold text-ink transition-colors hover:bg-surface-2 disabled:opacity-60";
const GHOST = "label px-1.5 py-1 text-subtle transition-colors hover:text-ink disabled:opacity-40";

/**
 * Review card for one generated draft (GB+ proposal idiom — agent border,
 * amber chip). Accept upserts the answer bank and resolves the attention
 * item; Edit first swaps the body for a textarea; Skip resolves only.
 */
export function DraftReviewCard({
  draftId,
  question,
  content,
  meta,
}: {
  draftId: string;
  question: string;
  content: string;
  meta?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(content);
  const [showOriginal, setShowOriginal] = useState(false);
  const [done, setDone] = useState<"saved" | "skipped" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  // Receipt collapse states — local, the queue row clears on next refresh.
  if (done === "saved") {
    return (
      <p className="label px-1 py-1 text-subtle">
        <span aria-hidden className="text-success">
          ✓
        </span>{" "}
        Saved to answer bank ·{" "}
        <Link href="/settings" className="text-ink underline">
          view
        </Link>
      </p>
    );
  }
  if (done === "skipped") {
    return <p className="label px-1 py-1 text-subtle">Skipped — kept in drafts</p>;
  }

  const edited = value.trim() !== content.trim() ? value : undefined;

  const accept = () => {
    setError(null);
    startTransition(async () => {
      const res = await acceptDraft(draftId, edited ?? undefined);
      if (res.error) setError(res.error);
      else setDone("saved");
    });
  };

  const skip = () => {
    setError(null);
    startTransition(async () => {
      const res = await skipDraft(draftId);
      if (res.error) setError(res.error);
      else setDone("skipped");
    });
  };

  return (
    <div className="overflow-hidden rounded-control border border-border-agent bg-surface">
      <div className="flex items-center gap-2 bg-surface-2 px-3.5 py-2">
        <span className="label rounded-pill bg-accent-soft px-2.5 py-0.5 text-accent">
          ◆ DRAFT READY
        </span>
        {meta && <span className="label truncate text-faint">{meta}</span>}
      </div>

      <div className="px-3.5 py-3">
        <p className="text-[0.8125rem] font-bold text-ink">{question}</p>

        {editing ? (
          <div className="mt-2">
            {showOriginal ? (
              <p className="max-h-48 overflow-y-auto whitespace-pre-wrap rounded-control border border-border bg-surface-2 px-3 py-2 text-[0.8125rem] text-muted">
                {content}
              </p>
            ) : (
              <textarea
                rows={10}
                value={value}
                onChange={(e) => setValue(e.target.value)}
                aria-label="Edit draft answer"
                className="w-full rounded-control border border-border-interactive bg-surface px-3 py-2 text-[0.8125rem] leading-relaxed text-ink"
              />
            )}
            <button
              type="button"
              onClick={() => setShowOriginal((s) => !s)}
              className={GHOST}
            >
              {showOriginal ? "back to edit" : "view original"}
            </button>
          </div>
        ) : (
          <p className="mt-2 max-h-48 overflow-y-auto whitespace-pre-wrap text-[0.8125rem] text-muted">
            {value}
          </p>
        )}

        {error && (
          <p className="label mt-2 text-danger">
            <span aria-hidden>▲</span> {error}
          </p>
        )}
      </div>

      <div className="flex items-center gap-2 border-t border-border px-3.5 py-2.5">
        <button type="button" onClick={accept} disabled={pending} className={PRI_PILL}>
          {pending ? "Saving…" : edited ? "Save edited" : "Accept"}
        </button>
        {!editing && (
          <button
            type="button"
            onClick={() => setEditing(true)}
            disabled={pending}
            className={SEC_PILL}
          >
            Edit first
          </button>
        )}
        <button
          type="button"
          onClick={skip}
          disabled={pending}
          className={`${GHOST} ml-auto`}
        >
          Skip
        </button>
      </div>
    </div>
  );
}
