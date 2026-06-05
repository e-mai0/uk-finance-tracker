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
          "inline-flex h-10 items-center gap-2 rounded-lg border px-4 text-sm font-medium transition-colors disabled:opacity-60",
          saved
            ? "border-accent bg-accent-soft text-accent"
            : "border-border-strong bg-surface text-ink hover:bg-surface-2",
        )}
      >
        <BookmarkIcon filled={saved} />
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
        "inline-flex h-8 w-8 items-center justify-center rounded-md transition-colors",
        saved
          ? "text-accent hover:bg-accent-soft"
          : "text-subtle hover:bg-surface-2 hover:text-ink",
      )}
    >
      <BookmarkIcon filled={saved} />
    </button>
  );
}

function BookmarkIcon({ filled }: { filled: boolean }) {
  return (
    <svg
      viewBox="0 0 20 20"
      className="h-4 w-4"
      fill={filled ? "currentColor" : "none"}
      stroke="currentColor"
      strokeWidth="1.6"
    >
      <path
        d="M5 3.5h10a1 1 0 011 1V17l-6-3.2L4 17V4.5a1 1 0 011-1z"
        strokeLinejoin="round"
      />
    </svg>
  );
}
