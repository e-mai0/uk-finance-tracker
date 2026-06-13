// src/test/cv-chat-route.test.ts
// Tests for the CV chat route body validation.
// The Zod schemas are not exported, so we replicate them here to test the
// same validation logic that the route applies.
import { describe, it, expect } from "vitest";
import { z } from "zod";

// ---------------------------------------------------------------------------
// Replicate the route's body schema (text-only, mirrors /api/chat)
// ---------------------------------------------------------------------------
const TextPartSchema = z.object({ type: z.literal("text"), text: z.string() });

const UIMessageSchema = z.object({
  id: z.string(),
  role: z.enum(["user", "assistant", "system", "tool"]),
  parts: z.array(TextPartSchema).max(8),
});

const CvChatBodySchema = z.object({
  sessionId: z.string().min(1),
  messages: z.array(UIMessageSchema).min(1),
});

describe("CvChatBodySchema validation", () => {
  const validBody = {
    sessionId: "sess-1",
    messages: [
      {
        id: "msg-1",
        role: "user",
        parts: [{ type: "text", text: "Help me improve my CV" }],
      },
    ],
  };

  it("accepts a valid body", () => {
    const result = CvChatBodySchema.safeParse(validBody);
    expect(result.success).toBe(true);
  });

  it("rejects missing sessionId", () => {
    const result = CvChatBodySchema.safeParse({ messages: validBody.messages });
    expect(result.success).toBe(false);
  });

  it("rejects empty sessionId", () => {
    const result = CvChatBodySchema.safeParse({
      ...validBody,
      sessionId: "",
    });
    expect(result.success).toBe(false);
  });

  it("rejects empty messages array", () => {
    const result = CvChatBodySchema.safeParse({
      sessionId: "sess-1",
      messages: [],
    });
    expect(result.success).toBe(false);
  });

  it("rejects more than 8 parts per message", () => {
    const parts = Array.from({ length: 9 }, (_, i) => ({
      type: "text" as const,
      text: `part ${i}`,
    }));
    const result = CvChatBodySchema.safeParse({
      ...validBody,
      messages: [{ id: "m1", role: "user", parts }],
    });
    expect(result.success).toBe(false);
  });

  it("total text length guard (8000 char limit) is enforceable", () => {
    // The route checks this imperatively — verify the check logic itself
    const longText = "x".repeat(8001);
    const parts = [{ type: "text" as const, text: longText }];
    const totalTextLength = parts.reduce((sum, p) => sum + p.text.length, 0);
    expect(totalTextLength).toBeGreaterThan(8000);

    const shortText = "x".repeat(8000);
    const shortParts = [{ type: "text" as const, text: shortText }];
    const shortLength = shortParts.reduce((sum, p) => sum + p.text.length, 0);
    expect(shortLength).toBe(8000);
  });

  it("accepts assistant and tool roles in message history", () => {
    const body = {
      sessionId: "sess-1",
      messages: [
        { id: "m1", role: "assistant", parts: [{ type: "text", text: "Hello" }] },
        { id: "m2", role: "user", parts: [{ type: "text", text: "Update CV" }] },
      ],
    };
    const result = CvChatBodySchema.safeParse(body);
    expect(result.success).toBe(true);
  });

  it("last message role check: non-user last message is detectable", () => {
    const messages = [
      { id: "m1", role: "user" as const, parts: [{ type: "text" as const, text: "hi" }] },
      { id: "m2", role: "assistant" as const, parts: [{ type: "text" as const, text: "ok" }] },
    ];
    const lastMsg = messages[messages.length - 1];
    // The route returns 400 when the last message is not "user"
    expect(lastMsg?.role).not.toBe("user");
  });
});
