// src/test/cv-handoff-client.test.ts
//
// Cycle 5 U4b — dock→CV handoff CLIENT mechanism tests.
//
// Scope: the WIRING that turns the main brain's `go_to_cv` navigation signal
// (a tool output `{ kind:"navigate", to:"/cv", pane:"refine", request }`) into
// (a) a single router.push to the CV page carrying the request, and (b) a
// single auto-send of that request to the CV coach on arrival, followed by a
// query-param strip so a refresh does NOT replay the send.
//
// This pins the MECHANISM only. It deliberately does NOT assert that the LLM
// CHOOSES go_to_cv for any given sentence — that is non-deterministic intent
// classification (Amber; sampled by the user, not unit-tested).
//
// Harness: the repo uses vitest + the `node` environment with NO jsdom /
// @testing-library / react-test-renderer (see vitest.config.ts). React effects
// therefore cannot be exercised by mounting. The once-guards are implemented as
// PURE helpers in src/lib/cv-handoff.ts that the components consume; we test
// those helpers directly (the same code path the components run), which is what
// makes the "exactly once" guarantee verifiable here.
import { describe, it, expect } from "vitest";
import {
  buildHandoffUrl,
  isNavigationSignal,
  nextNavigationPush,
  decideAutoSend,
  type NavigationSignal,
} from "@/lib/cv-handoff";

// A faithful shape of an AI-SDK tool UI part that has produced output.
function navPart(toolCallId: string, output: unknown) {
  return {
    type: "tool-go_to_cv",
    toolCallId,
    state: "output-available",
    output,
  };
}

const SIGNAL: NavigationSignal = {
  kind: "navigate",
  to: "/cv",
  pane: "refine",
  request: "tighten my summary",
};

describe("buildHandoffUrl — handoff URL/param scheme", () => {
  it("targets /cv and carries the request (encoded) + pane as query params", () => {
    const url = buildHandoffUrl("tighten my summary", "refine");
    expect(url.startsWith("/cv?")).toBe(true);
    expect(url).toContain("handoff=");
    expect(url).toContain("pane=refine");
    // The request is URL-encoded, not raw — a literal space must not appear
    // (URLSearchParams encodes spaces as "+", which decodes back to a space).
    expect(url).not.toContain("tighten my summary");
    const params = new URLSearchParams(url.slice(url.indexOf("?") + 1));
    expect(params.get("handoff")).toBe("tighten my summary");
  });

  it("round-trips a request with special characters through the query param", () => {
    const req = "tailor my CV to Goldman & make bullets 100% quantified?";
    const url = buildHandoffUrl(req, "refine");
    const params = new URLSearchParams(url.slice(url.indexOf("?") + 1));
    expect(params.get("handoff")).toBe(req);
    expect(params.get("pane")).toBe("refine");
  });

  it("defaults the pane to refine when omitted", () => {
    expect(buildHandoffUrl("x")).toContain("pane=refine");
  });
});

describe("isNavigationSignal — generic discriminant detection", () => {
  it("accepts a { kind: 'navigate' } object", () => {
    expect(isNavigationSignal(SIGNAL)).toBe(true);
  });

  it("rejects non-navigate / malformed outputs", () => {
    expect(isNavigationSignal({ kind: "other", to: "/cv" })).toBe(false);
    expect(isNavigationSignal({ ok: true, cv: {} })).toBe(false);
    expect(isNavigationSignal(null)).toBe(false);
    expect(isNavigationSignal("navigate")).toBe(false);
    // Missing a usable `to` target → not a routable signal.
    expect(isNavigationSignal({ kind: "navigate" })).toBe(false);
  });
});

describe("nextNavigationPush — route ONCE per signal", () => {
  it("returns a push for a fresh navigate signal in the parts", () => {
    const handled = new Set<string>();
    const result = nextNavigationPush(
      [{ type: "text", text: "ok" }, navPart("call-1", SIGNAL)],
      handled,
    );
    expect(result).not.toBeNull();
    expect(result!.url.startsWith("/cv?")).toBe(true);
    const p = new URLSearchParams(result!.url.slice(result!.url.indexOf("?") + 1));
    expect(p.get("handoff")).toBe("tighten my summary");
    expect(result!.url).toContain("pane=refine");
    expect(result!.id).toBe("call-1");
  });

  it("does NOT push again for the same signal id on a re-render", () => {
    const handled = new Set<string>();
    const first = nextNavigationPush([navPart("call-1", SIGNAL)], handled);
    expect(first).not.toBeNull();
    // The caller records the id as handled (mirrors the component's ref).
    handled.add(first!.id);
    // Re-render / re-stream with the SAME signal present → no second push.
    const second = nextNavigationPush([navPart("call-1", SIGNAL)], handled);
    expect(second).toBeNull();
  });

  it("ignores tool parts that are still streaming (no output yet)", () => {
    const handled = new Set<string>();
    const streaming = {
      type: "tool-go_to_cv",
      toolCallId: "call-2",
      state: "input-streaming",
    };
    expect(nextNavigationPush([streaming], handled)).toBeNull();
  });

  it("returns null when no navigation signal is present", () => {
    const handled = new Set<string>();
    const parts = [
      { type: "text", text: "here is some advice about CVs" },
      navPart("call-3", { ok: true, cv: { fullName: "x" } }),
    ];
    expect(nextNavigationPush(parts, handled)).toBeNull();
  });

  it("routes a DIFFERENT later signal once the first was handled", () => {
    const handled = new Set<string>();
    const a = nextNavigationPush([navPart("call-1", SIGNAL)], handled);
    handled.add(a!.id);
    const b = nextNavigationPush(
      [navPart("call-1", SIGNAL), navPart("call-9", { ...SIGNAL, request: "add a summary" })],
      handled,
    );
    expect(b).not.toBeNull();
    expect(b!.id).toBe("call-9");
    const pb = new URLSearchParams(b!.url.slice(b!.url.indexOf("?") + 1));
    expect(pb.get("handoff")).toBe("add a summary");
  });
});

describe("decideAutoSend — auto-send ONCE, then strip", () => {
  it("sends the handoff request exactly once and asks to strip the param", () => {
    const handoff = "tighten my summary";
    const first = decideAutoSend(handoff, false);
    expect(first.send).toBe(true);
    expect(first.text).toBe(handoff);
    expect(first.strip).toBe(true);
  });

  it("does NOT send again once it has already fired (already=true)", () => {
    const second = decideAutoSend("tighten my summary", true);
    expect(second.send).toBe(false);
    // Even when not sending, a stale param should still be stripped so a
    // refresh can't replay — but never a second send.
    expect(second.strip).toBe(true);
  });

  it("does NOT auto-send when there is no handoff param", () => {
    expect(decideAutoSend(undefined, false)).toEqual({ send: false, strip: false, text: "" });
    expect(decideAutoSend("", false)).toEqual({ send: false, strip: false, text: "" });
    expect(decideAutoSend("   ", false)).toEqual({ send: false, strip: false, text: "" });
  });
});
