"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { connectExtension, revokeToken } from "@/server/actions/extension";
import { cn } from "@/lib/utils";

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
          { source: "cyclops-extension-connect", token: res.token },
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
    <section className="rounded-card border border-border bg-surface shadow-card">
      <div className="flex items-baseline justify-between border-b border-border px-4 py-2.5">
        <h2 className="text-[1rem] font-semibold text-ink">Browser extension</h2>
        <span className="label text-faint">AUTOFILL · trk_</span>
      </div>

      <div className="space-y-4 px-4 py-4">
        <p className="text-[0.8125rem] text-muted">
          The Cyclops autofill extension fills application forms from your apply
          profile and drafts answers on the page. You always review and submit
          yourself.
        </p>

        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" onClick={onConnect} disabled={pending}>
            {pending ? "Generating…" : "Generate connection token"}
          </Button>
          <span className="text-xs text-muted">
            ▸ Connects an installed extension instantly — or paste it into the popup.
          </span>
        </div>
        {error && <p className="label text-danger">{error}</p>}

        {token && (
          <div className="rounded-control border border-border bg-surface-2 p-3">
            <p className="label text-subtle">▸ Copy now — shown once</p>
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
          <div className="rounded-control border border-border">
            <div className="flex items-baseline justify-between border-b border-border px-3 py-2">
              <span className="label text-subtle">Active tokens</span>
              <span className="label text-faint">{tokens.length}</span>
            </div>
            <ul className="divide-y divide-hairline">
              {tokens.map((t) => (
                <li
                  key={t.id}
                  className="flex items-center justify-between gap-3 px-3 py-2.5"
                >
                  <div className="min-w-0">
                    <p className="truncate text-[0.8125rem] font-bold text-ink">
                      {t.name}
                    </p>
                    <p className="label mt-0.5 text-subtle">Added {t.createdAt}</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2.5">
                    <span
                      className={cn(
                        "label rounded-pill px-2.5 py-0.5",
                        t.lastUsedAt
                          ? "bg-success-soft text-success"
                          : "bg-surface-2 text-faint",
                      )}
                    >
                      {t.lastUsedAt ? `Used ${t.lastUsedAt}` : "Never used"}
                    </span>
                    <button
                      type="button"
                      onClick={() => startTransition(() => revokeToken(t.id).then())}
                      className="text-xs font-bold text-danger hover:underline"
                    >
                      Revoke
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </section>
  );
}
