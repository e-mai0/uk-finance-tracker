"use client";

import { useState, useTransition } from "react";
import { toggleSave } from "@/server/actions/saved";
import { cn } from "@/lib/utils";

export function SaveButton({
  opportunityId,
  initialSaved,
  variant = "icon",
}: {
  opportunityId: string;
  initialSaved: boolean;
  variant?: "icon" | "full";
}) {
  const [saved, setSaved] = useState(initialSaved);
  const [pending, startTransition] = useTransition();

  const onClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    // Optimistic toggle.
    setSaved((s) => !s);
    startTransition(async () => {
      try {
        const res = await toggleSave(opportunityId);
        setSaved(res.saved);
      } catch {
        setSaved((s) => !s); // revert
      }
    });
  };

  if (variant === "full") {
    return (
      <button
        type="button"
        onClick={onClick}
        disabled={pending}
        className={cn(
          "inline-flex h-10 items-center gap-2 rounded-[var(--radius-control)] border px-4 text-sm font-medium transition-colors disabled:opacity-60",
          saved
            ? "border-accent bg-accent-soft text-accent"
            : "border-border-strong bg-surface text-ink hover:bg-surface-2",
        )}
      >
        <span aria-hidden className="text-base leading-none">
          {saved ? "★" : "☆"}
        </span>
        {saved ? "Saved" : "Save role"}
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={pending}
      aria-label={saved ? "Unsave" : "Save"}
      className={cn(
        "inline-flex h-7 w-7 items-center justify-center rounded-[var(--radius-control)] text-base leading-none transition-colors",
        saved
          ? "text-accent hover:bg-accent-soft"
          : "text-faint hover:bg-surface-2 hover:text-ink",
      )}
    >
      <span aria-hidden>{saved ? "★" : "☆"}</span>
    </button>
  );
}
