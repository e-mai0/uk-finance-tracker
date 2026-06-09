"use client";

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, isToolUIPart, isTextUIPart } from "ai";
import type { UIMessage, UIMessagePart } from "ai";
import { useRef, useState, useEffect, FormEvent, KeyboardEvent } from "react";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Tool label map
// ---------------------------------------------------------------------------
const TOOL_LABELS: Record<string, string> = {
  list_memory: "checking memory",
  read_memory: "reading memory",
  edit_memory: "saving to memory",
  search_applications: "searching your applications",
  search_opportunities: "searching listings",
  fit_check: "running fit check",
};

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
type HitChip = { kind: string; confidence: number };

// ---------------------------------------------------------------------------
// MessagePart sub-component
// ---------------------------------------------------------------------------
function MessagePart({ part }: { part: UIMessagePart<never, never> }) {
  if (isTextUIPart(part)) {
    return (
      <span className="whitespace-pre-wrap leading-relaxed">{part.text}</span>
    );
  }

  if (isToolUIPart(part)) {
    // Narrow to the shared structure we need
    const toolName = (part as { toolName?: string }).toolName ?? "";
    const state = (part as { state?: string }).state ?? "";
    const output = (part as { output?: unknown }).output;

    const label = TOOL_LABELS[toolName] ?? toolName;

    // Detect diff in edit_memory output
    const hasDiff =
      toolName === "edit_memory" &&
      output != null &&
      typeof output === "object" &&
      "diff" in (output as Record<string, unknown>) &&
      typeof (output as Record<string, unknown>).diff === "string";

    // Detect semantic hits in search_applications output
    let semanticHits: HitChip[] = [];
    if (
      toolName === "search_applications" &&
      output != null &&
      typeof output === "object"
    ) {
      const out = output as Record<string, unknown>;
      if (Array.isArray(out.semantic)) {
        semanticHits = (out.semantic as Array<Record<string, unknown>>)
          .slice(0, 3)
          .map((h) => ({
            kind: String(h.kind ?? h.type ?? "match"),
            confidence: Number(h.confidence ?? h.score ?? 0),
          }));
      }
    }

    return (
      <span className="block">
        <span
          className={cn(
            "inline-flex items-center gap-1 border px-1.5 py-0.5 font-mono text-[0.62rem]",
            state === "result" || state === "output"
              ? "border-border bg-surface-2 text-muted"
              : "border-border-strong bg-surface text-subtle",
          )}
        >
          <span aria-hidden className="text-accent">
            ▸
          </span>
          {label}
          {(state === "input-streaming" || state === "input-available") && (
            <span className="caret text-amber">▌</span>
          )}
        </span>

        {/* Memory diff surface */}
        {hasDiff && (
          <details className="mt-1 ml-0.5">
            <summary className="cursor-pointer font-mono text-[0.62rem] text-subtle hover:text-muted">
              memory updated — view diff
            </summary>
            <pre className="mt-1 overflow-x-auto border border-border bg-surface p-2 font-mono text-[0.6rem] leading-tight text-ink">
              {String((output as Record<string, unknown>).diff)}
            </pre>
          </details>
        )}

        {/* Semantic hit chips — search_applications §5.6 */}
        {semanticHits.length > 0 && (
          <span className="mt-1 flex flex-wrap gap-1">
            {semanticHits.map((h, i) => (
              <span
                key={i}
                className="border border-border-strong bg-surface-2 px-1 py-0.5 font-mono text-[0.58rem] uppercase tracking-wide text-muted"
              >
                {h.kind.toUpperCase()}
                <span aria-hidden className="mx-0.5 text-border-strong">
                  ·
                </span>
                <span className="text-accent">
                  {Math.round(h.confidence * 100)}%
                </span>
              </span>
            ))}
          </span>
        )}
      </span>
    );
  }

  // Ignore step-start, reasoning, etc.
  return null;
}

// ---------------------------------------------------------------------------
// Main chat component
// ---------------------------------------------------------------------------
export function CyclopsChat({
  sessionId,
  initialMessages,
}: {
  sessionId: string;
  initialMessages: UIMessage[];
}) {
  const [input, setInput] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);

  const { messages, sendMessage, status, error } = useChat({
    transport: new DefaultChatTransport({
      api: "/api/chat",
      body: { sessionId },
    }),
    messages: initialMessages,
  });

  const isStreaming = status === "submitted" || status === "streaming";

  // Auto-scroll on new messages / streaming updates
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  function handleSubmit(e?: FormEvent) {
    e?.preventDefault();
    const text = input.trim();
    if (!text || isStreaming) return;
    setInput("");
    sendMessage({ text });
  }

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  }

  return (
    <div className="flex h-full flex-col">
      {/* Message feed */}
      <div className="flex-1 overflow-y-auto px-4 py-4">
        {messages.length === 0 && !isStreaming && (
          <div className="flex h-full flex-col items-center justify-center text-center">
            <p className="label text-[0.6rem] text-subtle">Cyclops</p>
            <p className="mt-1 text-sm text-muted">
              Ask me anything about your applications, opportunities, or
              profile.
            </p>
          </div>
        )}

        <div className="space-y-4">
          {messages.map((msg) => (
            <div
              key={msg.id}
              className={cn(
                "flex",
                msg.role === "user" ? "justify-end" : "justify-start",
              )}
            >
              <div
                className={cn(
                  "max-w-[82%] space-y-1.5 text-sm",
                  msg.role === "user"
                    ? "border border-border bg-accent-tint px-3 py-2 text-ink"
                    : "text-ink",
                )}
              >
                {msg.parts.map((part, i) => (
                  <MessagePart
                    key={i}
                    part={part as UIMessagePart<never, never>}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* Streaming indicator */}
        {isStreaming && (
          <div className="mt-3 flex items-center gap-1.5">
            <span className="caret text-[0.9rem] text-amber">▌</span>
            <span className="font-mono text-[0.62rem] text-subtle">
              Cyclops is thinking…
            </span>
          </div>
        )}

        {/* Error state */}
        {status === "error" && error && (
          <div className="mt-3 border border-danger-soft bg-danger-soft px-3 py-2 font-mono text-[0.62rem] text-danger">
            <span aria-hidden className="mr-1">
              ▲
            </span>
            {error.message ?? "Something went wrong."}{" "}
            <button
              type="button"
              className="underline hover:no-underline"
              onClick={() => sendMessage({ text: input || "retry" })}
            >
              retry
            </button>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Input bar */}
      <div className="border-t border-border bg-surface px-4 py-3">
        <form
          onSubmit={handleSubmit}
          className="flex items-center gap-2"
        >
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value.slice(0, 8000))}
            onKeyDown={handleKeyDown}
            disabled={isStreaming}
            placeholder="Ask Cyclops…"
            maxLength={8000}
            className={cn(
              "flex-1 border border-border bg-canvas px-2.5 py-1.5 font-mono text-[0.8rem] text-ink placeholder:text-faint",
              "focus:border-accent focus:outline-none",
              "disabled:opacity-50",
            )}
            aria-label="Chat input"
          />
          <button
            type="submit"
            disabled={isStreaming || !input.trim()}
            className={cn(
              "label border border-border bg-surface px-3 py-1.5 text-[0.62rem] text-accent transition-colors",
              "hover:border-accent hover:bg-accent-tint",
              "disabled:cursor-not-allowed disabled:opacity-40",
            )}
          >
            Send
          </button>
        </form>
        {input.length > 7500 && (
          <p className="mt-1 font-mono text-[0.58rem] text-warning">
            {8000 - input.length} chars remaining
          </p>
        )}
      </div>
    </div>
  );
}
