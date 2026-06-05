"use client";

import { useState, useTransition } from "react";
import { updateSavedNotes } from "@/server/actions/saved";
import { Textarea } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export function NotesEditor({
  opportunityId,
  initialNotes,
}: {
  opportunityId: string;
  initialNotes: string | null;
}) {
  const [notes, setNotes] = useState(initialNotes ?? "");
  const [pending, startTransition] = useTransition();
  const [saved, setSaved] = useState(false);

  const onSave = () => {
    setSaved(false);
    startTransition(async () => {
      await updateSavedNotes(opportunityId, notes);
      setSaved(true);
    });
  };

  return (
    <div>
      <Textarea
        rows={4}
        value={notes}
        onChange={(e) => {
          setNotes(e.target.value);
          setSaved(false);
        }}
        placeholder="Track your progress — referrals, contacts, application status, interview dates…"
      />
      <div className="mt-2 flex items-center gap-3">
        <Button size="sm" variant="outline" onClick={onSave} disabled={pending}>
          {pending ? "Saving…" : "Save notes"}
        </Button>
        {saved && <span className="text-xs text-success">Saved</span>}
      </div>
    </div>
  );
}
