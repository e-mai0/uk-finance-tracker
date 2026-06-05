"use client";

import { useState, useTransition } from "react";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/input";
import { draftCoverLetter } from "@/server/actions/copilot";

export function CoverLetterCard({ opportunityId }: { opportunityId: string }) {
  const [pending, startTransition] = useTransition();
  const [content, setContent] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const onDraft = () => {
    setError(null);
    startTransition(async () => {
      const res = await draftCoverLetter(opportunityId);
      if (res.error) setError(res.error);
      else if (res.content) setContent(res.content);
    });
  };

  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(content);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* ignore */
    }
  };

  return (
    <Card>
      <CardHeader className="flex items-center justify-between gap-3">
        <div>
          <CardTitle>Cover letter</CardTitle>
          <p className="mt-0.5 text-xs text-muted">
            Drafted from your CV and profile. Always review before sending.
          </p>
        </div>
        <Button size="sm" variant="outline" onClick={onDraft} disabled={pending}>
          {pending ? "Drafting…" : content ? "Redraft" : "Draft"}
        </Button>
      </CardHeader>
      {(content || error) && (
        <CardBody className="space-y-2">
          {error && <p className="text-sm text-danger">{error}</p>}
          {content && (
            <>
              <Textarea
                rows={12}
                value={content}
                onChange={(e) => setContent(e.target.value)}
              />
              <div className="flex justify-end">
                <Button size="sm" variant="ghost" onClick={onCopy}>
                  {copied ? "Copied ✓" : "Copy"}
                </Button>
              </div>
            </>
          )}
        </CardBody>
      )}
    </Card>
  );
}
