"use client";

import { useRouter } from "next/navigation";

/** Per-row "Ask Cyclops" affordance - deep-links into chat with the
 *  opportunity preloaded. Rendered inside the row <Link>, so it stops
 *  propagation the same way SaveButton does to keep row click-through intact. */
export function AskCyclopsButton({ opportunityId }: { opportunityId: string }) {
  const router = useRouter();

  const onClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    router.push(`/chat?opportunity=${opportunityId}`);
  };

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Ask Cyclops about this role"
      title="Ask Cyclops"
      className="inline-flex h-7 w-7 items-center justify-center rounded-[var(--radius-control)] text-base leading-none text-faint transition-colors hover:bg-surface-2 hover:text-accent"
    >
      <span aria-hidden>?</span>
    </button>
  );
}
