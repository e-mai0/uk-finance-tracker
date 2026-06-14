// src/components/cv/cv-chat.tsx
// CV-builder chat component. Adapted from cyclops-chat.tsx.
// Calls /api/cv/chat instead of /api/chat, and lifts update_cv outputs to
// the parent via onCvUpdate so the live preview updates immediately.
"use client";

import { useChat } from "@ai-sdk/react";
import {
  DefaultChatTransport,
  isToolUIPart,
  isTextUIPart,
  getToolName,
} from "ai";
import type { UIMessage, UIMessagePart, ToolUIPart, DynamicToolUIPart } from "ai";
import { useRef, useState, useEffect, FormEvent, KeyboardEvent } from "react";
import { cn } from "@/lib/utils";
import type { CvData } from "@/lib/cv";

// ---------------------------------------------------------------------------
// Tool label map — add update_cv
// ---------------------------------------------------------------------------
const TOOL_LABELS: Record<string, string> = {
  update_cv: "updating your CV",
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function friendlyError(error: Error): string {
  try {
    const parsed = JSON.parse(error.message) as { error?: unknown };
    if (typeof parsed.error === "string") return parsed.error;
  } catch {
    // not JSON
  }
  return error.message || "Something went wrong.";
}

// ---------------------------------------------------------------------------
// MessagePart sub-component
// ---------------------------------------------------------------------------
function MessagePart({
  part,
  onCvUpdate,
}: {
  part: UIMessagePart<never, never>;
  onCvUpdate?: (cv: CvData) => void;
}) {
  const toolPart = isToolUIPart(part)
    ? (part as ToolUIPart | DynamicToolUIPart)
    : null;
  const toolName = toolPart ? getToolName(toolPart) : null;
  const state = toolPart?.state;
  const output =
    toolPart?.state === "output-available" ? toolPart.output : undefined;

  // Lift update_cv output to parent for live preview — must run in an effect
  // to avoid 'Cannot update a component while rendering a different component'.
  useEffect(() => {
    if (
      toolName === "update_cv" &&
      state === "output-available" &&
      output != null &&
      typeof output === "object"
    ) {
      const out = output as { ok?: boolean; cv?: CvData };
      if (out.ok && out.cv && onCvUpdate) {
        onCvUpdate(out.cv);
      }
    }
  }, [toolName, state, output, onCvUpdate]);

  if (isTextUIPart(part)) {
    return (
      <span className="whitespace-pre-wrap leading-relaxed">{part.text}</span>
    );
  }

  if (isToolUIPart(part)) {
    const label = TOOL_LABELS[toolName!] ?? toolName!;
    const isError =
      state === "output-error" ||
      (state === "output-available" &&
        output != null &&
        typeof output === "object" &&
        "error" in (output as Record<string, unknown>));

    return (
      <span className="block">
        <span
          className={cn(
            "inline-flex items-center gap-1 border px-1.5 py-0.5 font-mono text-[0.6875rem]",
            isError
              ? "border-danger-soft bg-danger-soft text-danger"
              : state === "output-available" || state === "output-denied"
              ? "border-border bg-surface-2 text-muted"
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

        {/* Error output chip */}
        {isError && state === "output-available" && (
          <span className="ml-1.5 font-mono text-[0.6875rem] text-danger">
            {String(
              (output as Record<string, unknown>).error ?? "update failed",
            )}
          </span>
        )}
      </span>
    );
  }

  return null;
}

// ---------------------------------------------------------------------------
// Main CvChat component
// ---------------------------------------------------------------------------
export function CvChat({
  sessionId,
  initialMessages,
  onCvUpdate,
}: {
  sessionId: string;
  initialMessages: UIMessage[];
  /** Called whenever update_cv produces a new CvData so the parent can refresh the preview. */
  onCvUpdate?: (cv: CvData) => void;
}) {
  const [input, setInput] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  const { messages, sendMessage, regenerate, stop, status, error } = useChat({
    id: sessionId,
    transport: new DefaultChatTransport({
      api: "/api/cv/chat",
      body: { sessionId },
      // Send only the last user message (mirrors cyclops-chat.tsx)
      prepareSendMessagesRequest: ({ messages: msgs, body }) => ({
        body: { ...body, messages: msgs.slice(-1) },
      }),
    }),
    messages: initialMessages,
  });

  const isStreaming = status === "submitted" || status === "streaming";

  // Auto-scroll when pinned near bottom
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
        className="flex-1 overflow-y-auto px-4 py-4"
      >
        {messages.length === 0 && !isStreaming && (
          <div className="flex h-full flex-col items-center justify-center text-center">
            <p className="label text-subtle">CV Builder</p>
            <p className="mt-1 text-sm text-muted">
              Tell me what to add, update, or improve in your CV. I&apos;ll also
              spot any gaps and ask you targeted questions.
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
                    key={`${msg.id}-${i}`}
                    part={part as UIMessagePart<never, never>}
                    onCvUpdate={onCvUpdate}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* Streaming indicator */}
        {isStreaming && (
          <div aria-live="polite" className="mt-3 flex items-center gap-1.5">
            <span className="caret text-[0.9rem] text-accent">▌</span>
            <span className="font-mono text-[0.6875rem] text-subtle">
              CV Builder is thinking…
            </span>
          </div>
        )}

        {/* Error state */}
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

      {/* Input bar */}
      <div className="border-t border-border bg-surface px-4 py-3">
        <form onSubmit={handleSubmit} className="flex items-center gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value.slice(0, 8000))}
            onKeyDown={handleKeyDown}
            placeholder="Tell me what to add or change…"
            maxLength={8000}
            className={cn(
              "flex-1 border border-border bg-canvas px-2.5 py-1.5 font-mono text-[0.8rem] text-ink placeholder:text-faint",
              "focus:border-accent",
            )}
            aria-label="Chat input"
          />
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
        {input.length > 7500 && (
          <p className="mt-1 font-mono text-[0.6875rem] text-warning">
            {8000 - input.length} chars remaining
          </p>
        )}
      </div>
    </div>
  );
}
