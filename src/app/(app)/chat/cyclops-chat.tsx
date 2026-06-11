"use client";

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, isToolUIPart, isTextUIPart, getToolName } from "ai";
import type { UIMessage, UIMessagePart, ToolUIPart, DynamicToolUIPart } from "ai";
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
  draft_text: "drafting in your voice",
  research_employer: "researching the employer",
  update_application_status: "updating application status",
};

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
type HitChip = { kind: string; confidence: string };

/** Server errors arrive as JSON bodies ({"error": "..."}); surface the text, not the blob. */
function friendlyError(error: Error): string {
  try {
    const parsed = JSON.parse(error.message) as { error?: unknown };
    if (typeof parsed.error === "string") return parsed.error;
  } catch {
    // not JSON — fall through
  }
  return error.message || "Something went wrong.";
}

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
    // Bug 1 fix: use SDK helper — static parts derive name from type, dynamic from .toolName
    const toolPart = part as ToolUIPart | DynamicToolUIPart;
    const toolName = getToolName(toolPart);
    const state = toolPart.state;
    const output = (toolPart.state === "output-available") ? toolPart.output : undefined;

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
        // Bug 3 fix: server returns confidence as "high"|"medium"|"low" string
        semanticHits = (out.semantic as Array<Record<string, unknown>>)
          .slice(0, 3)
          .map((h) => ({
            kind: String(h.kind ?? h.type ?? "match"),
            confidence: String(h.confidence ?? ""),
          }));
      }
    }

    return (
      <span className="block">
        <span
          className={cn(
            "inline-flex items-center gap-1 border px-1.5 py-0.5 font-mono text-[0.6875rem]",
            // Bug 2 fix: real finished states per SDK are output-available/output-error/output-denied
            state === "output-available" || state === "output-denied"
              ? "border-border bg-surface-2 text-muted"
              : state === "output-error"
              ? "border-danger-soft bg-danger-soft text-danger"
              : "border-border-strong bg-surface text-subtle",
          )}
        >
          <span aria-hidden className="text-accent">
            ▸
          </span>
          {label}
          {(state === "input-streaming" || state === "input-available") && (
            <span className="caret text-accent">▌</span>
          )}
        </span>

        {/* Memory diff surface */}
        {hasDiff && (
          <details className="mt-1 ml-0.5">
            <summary className="cursor-pointer font-mono text-[0.6875rem] text-subtle hover:text-muted">
              memory updated — view diff
            </summary>
            <pre className="mt-1 overflow-x-auto border border-border bg-surface p-2 font-mono text-[0.6875rem] leading-tight text-ink">
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
                className="border border-border-strong bg-surface-2 px-1 py-0.5 font-mono text-[0.6875rem] uppercase tracking-wide text-muted"
              >
                {/* Bug 3 fix: confidence is "high"|"medium"|"low" — render uppercased string */}
                {h.kind.toUpperCase()}
                <span aria-hidden className="mx-0.5 text-border-strong">
                  ·
                </span>
                <span className="text-accent">
                  {h.confidence.toUpperCase()}
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
  prefill,
  compact,
  suggestions,
}: {
  sessionId: string;
  initialMessages: UIMessage[];
  /** Deep-link prefill: seeds the input only, never auto-sent. */
  prefill?: string;
  /** Dock mode: tighter paddings, no char counter. */
  compact?: boolean;
  /** ≤3 conversation starters shown above the composer on an empty thread; clicking sends immediately. */
  suggestions?: string[];
}) {
  // Component is keyed by thread id, so useState init is sufficient.
  // Only seed from prefill on a fresh thread — after a send/refresh the
  // thread has messages and a stale ?prefill= must not repopulate the input.
  const [input, setInput] = useState(
    initialMessages.length === 0 ? prefill ?? "" : "",
  );
  const bottomRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  const { messages, sendMessage, regenerate, stop, status, error } = useChat({
    id: sessionId,
    transport: new DefaultChatTransport({
      api: "/api/chat",
      body: { sessionId },
      // item 2: send only the last user message to avoid tool-part validation failures
      prepareSendMessagesRequest: ({ messages: msgs, body }) => ({
        body: { ...body, messages: msgs.slice(-1) },
      }),
    }),
    messages: initialMessages,
  });

  const isStreaming = status === "submitted" || status === "streaming";

  // item 7: auto-scroll only when pinned near the bottom
  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;
    const { scrollHeight, scrollTop, clientHeight } = container;
    if (scrollHeight - scrollTop - clientHeight < 80) {
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }
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
      if (!isStreaming) handleSubmit();
    }
  }

  return (
    <div className="flex h-full flex-col">
      {/* Message feed */}
      <div
        ref={scrollContainerRef}
        className={cn(
          "flex-1 overflow-y-auto",
          compact ? "px-3 py-2" : "px-4 py-4",
        )}
      >
        {messages.length === 0 && !isStreaming && (
          <div className="flex h-full flex-col items-center justify-center text-center">
            <p className="label text-subtle">Cyclops</p>
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

        {/* Streaming indicator — item 9: aria-live */}
        {isStreaming && (
          <div
            aria-live="polite"
            className="mt-3 flex items-center gap-1.5"
          >
            <span className="caret text-[0.9rem] text-accent">▌</span>
            <span className="font-mono text-[0.6875rem] text-subtle">
              Cyclops is thinking…
            </span>
          </div>
        )}

        {/* Error state — item 9: aria-live; item 3: regenerate */}
        {status === "error" && error && (
          <div
            aria-live="polite"
            className="mt-3 border border-danger-soft bg-danger-soft px-3 py-2 font-mono text-[0.6875rem] text-danger"
          >
            <span aria-hidden className="mr-1">
              ▲
            </span>
            {friendlyError(error)}{" "}
            <button
              type="button"
              className="underline hover:no-underline"
              onClick={() => regenerate()}
            >
              retry
            </button>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Suggestions — empty-thread starters, sent through the same path as submit */}
      {suggestions &&
        suggestions.length > 0 &&
        messages.length === 0 &&
        !isStreaming && (
          <div
            className={cn(
              "flex flex-wrap gap-1.5",
              compact ? "px-3 pb-2" : "px-4 pb-3",
            )}
          >
            {suggestions.slice(0, 3).map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => sendMessage({ text: s })}
                className="rounded-pill border border-border px-3 py-1.5 text-[0.8125rem] font-bold text-muted transition-colors hover:border-agent-mark hover:text-accent"
              >
                {s}
              </button>
            ))}
          </div>
        )}

      {/* Input bar */}
      <div
        className={cn(
          "border-t border-border bg-surface",
          compact ? "px-3 py-2" : "px-4 py-3",
        )}
      >
        <form
          onSubmit={handleSubmit}
          className="flex items-center gap-2"
        >
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value.slice(0, 8000))}
            onKeyDown={handleKeyDown}
            placeholder="Ask Cyclops…"
            maxLength={8000}
            className={cn(
              "flex-1 border border-border bg-canvas px-2.5 py-1.5 font-mono text-[0.8rem] text-ink placeholder:text-faint",
              "focus:border-accent",
            )}
            aria-label="Chat input"
          />
          {/* item 8: stop button while streaming */}
          {isStreaming ? (
            <button
              type="button"
              onClick={() => void stop()}
              className={cn(
                "label border border-border bg-surface px-3 py-1.5 text-danger transition-colors",
                "hover:border-danger hover:bg-danger-soft",
              )}
              aria-label="Stop generation"
            >
              Stop
            </button>
          ) : (
            <button
              type="submit"
              disabled={!input.trim()}
              className={cn(
                "label border border-border bg-surface px-3 py-1.5 text-accent transition-colors",
                "hover:border-accent hover:bg-accent-tint",
                "disabled:cursor-not-allowed disabled:opacity-40",
              )}
            >
              Send
            </button>
          )}
        </form>
        {!compact && input.length > 7500 && (
          <p className="mt-1 font-mono text-[0.6875rem] text-warning">
            {8000 - input.length} chars remaining
          </p>
        )}
      </div>
    </div>
  );
}
