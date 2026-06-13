"use client";
// src/components/cv/cv-chat.tsx
// Chat panel for the CV builder. Adapts cyclops-chat.tsx.
// When the `update_cv` tool completes, lifts the new CvData to the parent via onCvUpdate.
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
// Tool label map
// ---------------------------------------------------------------------------
const TOOL_LABELS: Record<string, string> = {
  update_cv: "updating your CV",
};

// ---------------------------------------------------------------------------
// Error helper
// ---------------------------------------------------------------------------
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
// CvToolPart — renders an update_cv tool chip and fires onCvUpdate via effect
// ---------------------------------------------------------------------------
function CvToolPart({
  toolPart,
  onCvUpdate,
}: {
  toolPart: ToolUIPart | DynamicToolUIPart;
  onCvUpdate?: (cv: CvData) => void;
}) {
  const toolName = getToolName(toolPart);
  const state = toolPart.state;
  const output =
    toolPart.state === "output-available" ? toolPart.output : undefined;

  const label = TOOL_LABELS[toolName] ?? toolName;

  // Derive the new CvData (undefined when the tool hasn't finished or failed)
  const newCv =
    toolName === "update_cv" &&
    state === "output-available" &&
    output != null &&
    typeof output === "object" &&
    "cv" in (output as Record<string, unknown>)
      ? ((output as Record<string, unknown>).cv as CvData)
      : undefined;

  // Defer the parent state update to after render — avoids the React warning
  // "Cannot update a component while rendering a different component".
  useEffect(() => {
    if (newCv !== undefined) {
      onCvUpdate?.(newCv);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  return (
    <span className="block">
      <span
        className={cn(
          "inline-flex items-center gap-1 border px-1.5 py-0.5 font-mono text-[0.6875rem]",
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

      {/* Error output chip */}
      {state === "output-error" &&
        output != null &&
        typeof output === "object" &&
        "error" in (output as Record<string, unknown>) && (
          <span className="ml-1 font-mono text-[0.6875rem] text-danger">
            {String((output as Record<string, unknown>).error)}
          </span>
        )}
    </span>
  );
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
  if (isTextUIPart(part)) {
    return (
      <span className="whitespace-pre-wrap leading-relaxed">{part.text}</span>
    );
  }

  if (isToolUIPart(part)) {
    const toolPart = part as ToolUIPart | DynamicToolUIPart;
    return <CvToolPart toolPart={toolPart} onCvUpdate={onCvUpdate} />;
  }

  // Ignore step-start, reasoning, etc.
  return null;
}

// ---------------------------------------------------------------------------
// Main CV chat component
// ---------------------------------------------------------------------------
export function CvChat({
  sessionId,
  initialMessages,
  onCvUpdate,
}: {
  sessionId: string;
  initialMessages: UIMessage[];
  /** Called with the new CvData whenever the model calls update_cv. */
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
      // Send only the last user message to avoid tool-part validation failures
      prepareSendMessagesRequest: ({ messages: msgs, body }) => ({
        body: { ...body, messages: msgs.slice(-1) },
      }),
    }),
    messages: initialMessages,
  });

  const isStreaming = status === "submitted" || status === "streaming";

  // Auto-scroll when near bottom
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
            <p className="label text-subtle">CV Assistant</p>
            <p className="mt-1 text-sm text-muted">
              Tell me what to add or change. I will ask you one question at a
              time to fill any gaps.
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
              CV Assistant is thinking…
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
            aria-label="CV chat input"
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
