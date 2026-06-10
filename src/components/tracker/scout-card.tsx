"use client";

import { useActionState } from "react";
import { scoutFirm, SCOUT_IDLE } from "@/server/actions/sources";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/** Firm Scout — paste any careers/job-board URL and the firm joins the live
 *  radar for every user. The growth loop for niche/boutique coverage: the
 *  long tail of small funds is maintained by the students hunting them. */
export function ScoutCard() {
  const [state, formAction, pending] = useActionState(scoutFirm, SCOUT_IDLE);

  return (
    <div className="bg-surface">
      <div className="flex items-center justify-between border-b border-border-strong bg-surface-2 px-3 py-[0.5625rem]">
        <span className="label text-[0.62rem] text-ink">
          <span className="text-accent">◎</span> Firm Scout
        </span>
        <span className="label text-[0.62rem] text-subtle">
          Greenhouse · Lever · Ashby
        </span>
      </div>

      <form action={formAction} className="space-y-2 px-3 py-3">
        <p className="text-[0.78rem] leading-snug text-muted">
          Tracking a boutique fund or startup we don&apos;t list? Paste its job
          board and we&apos;ll watch it — new UK internships go live for
          everyone.
        </p>
        <Input
          name="url"
          type="text"
          required
          placeholder="jobs.ashbyhq.com/firm or boards.greenhouse.io/firm"
          className="h-8 text-[0.78rem]"
        />
        <div className="flex gap-2">
          <Input
            name="firm"
            type="text"
            placeholder="Firm name (optional)"
            className="h-8 flex-1 text-[0.78rem]"
          />
          <Button
            type="submit"
            size="sm"
            variant="secondary"
            disabled={pending}
            className="shrink-0"
          >
            {pending ? "Scanning…" : "Scan board"}
          </Button>
        </div>
        {state.message && (
          <p
            role="status"
            className={cn(
              "text-[0.74rem] leading-snug",
              state.ok ? "text-success" : "text-danger",
            )}
          >
            {state.message}
          </p>
        )}
      </form>
    </div>
  );
}
