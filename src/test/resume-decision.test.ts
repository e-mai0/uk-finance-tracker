// src/test/resume-decision.test.ts
import { describe, it, expect } from "vitest";
import { resolveResumeDecision } from "@/server/chat/resume-decision";

describe("resolveResumeDecision", () => {
  const session = { id: "sess-1" };

  it("401 when unauthenticated", () => {
    expect(resolveResumeDecision({ userId: undefined, session, activeStreamId: "x" }))
      .toEqual({ status: 401 });
  });

  it("404 when the session is not found / not owned", () => {
    expect(resolveResumeDecision({ userId: "u1", session: null, activeStreamId: "x" }))
      .toEqual({ status: 404 });
  });

  it("204 when there is no active stream pointer", () => {
    expect(resolveResumeDecision({ userId: "u1", session, activeStreamId: null }))
      .toEqual({ status: 204 });
  });

  it("200 with the streamId when an active stream exists", () => {
    expect(resolveResumeDecision({ userId: "u1", session, activeStreamId: "stream-9" }))
      .toEqual({ status: 200, streamId: "stream-9" });
  });
});
