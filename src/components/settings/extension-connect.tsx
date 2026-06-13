"use client";

import { useState, useTransition } from "react";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { connectExtension, revokeToken } from "@/server/actions/extension";

export interface TokenRow {
  id: string;
  name: string;
  createdAt: string;
  lastUsedAt: string | null;
}

export function ExtensionConnect({ tokens }: { tokens: TokenRow[] }) {
  const [pending, startTransition] = useTransition();
  const [token, setToken] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onConnect = () => {
    setError(null);
    setToken(null);
    startTransition(async () => {
      const res = await connectExtension();
      if (res.error) setError(res.error);
      else if (res.token) {
        setToken(res.token);
        // Auto-handoff: an installed extension content script on this page
        // listens for this message and stores the token (manual paste also works).
        window.postMessage(
          { source: "trackr-extension-connect", token: res.token },
          window.location.origin,
        );
      }
    });
  };

  const onCopy = async () => {
    if (!token) return;
    try {
      await navigator.clipboard.writeText(token);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard blocked — user can select manually */
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Browser extension</CardTitle>
        <p className="mt-0.5 text-xs text-muted">
          The Trackr autofill extension fills application forms from your apply
          profile and drafts answers on the page. You always review and submit
          yourself.
        </p>
      </CardHeader>
      <CardBody className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" onClick={onConnect} disabled={pending}>
            {pending ? "Generating…" : "Generate connection token"}
          </Button>
          <span className="text-xs text-muted">
            Paste this into the extension popup to connect it to your account.
          </span>
        </div>
        {error && <p className="text-xs text-danger">{error}</p>}

        {token && (
          <div className="rounded-[var(--radius-control)] border border-border bg-surface-2 p-3">
            <p className="text-xs font-medium text-ink">
              Copy this token now — it won’t be shown again:
            </p>
            <div className="mt-2 flex items-center gap-2">
              <code className="grow break-all rounded bg-surface px-2 py-1.5 text-xs text-ink tabular">
                {token}
              </code>
              <Button size="sm" variant="outline" onClick={onCopy}>
                {copied ? "Copied ✓" : "Copy"}
              </Button>
            </div>
          </div>
        )}

        {tokens.length > 0 && (
          <div>
            <p className="mb-2 text-xs font-medium text-muted">Active tokens</p>
            <ul className="space-y-2">
              {tokens.map((t) => (
                <li
                  key={t.id}
                  className="flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-2"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm text-ink">{t.name}</p>
                    <p className="text-[0.6875rem] text-subtle">
                      Added {t.createdAt}
                      {t.lastUsedAt ? ` · last used ${t.lastUsedAt}` : " · never used"}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => startTransition(() => revokeToken(t.id).then())}
                    className="shrink-0 text-xs font-medium text-danger hover:underline"
                  >
                    Revoke
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </CardBody>
    </Card>
  );
}
