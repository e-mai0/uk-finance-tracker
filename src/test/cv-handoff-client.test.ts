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
  collectHandledNavIds,
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

// ---------------------------------------------------------------------------
// Cycle 6 F3 — the dock must NOT replay a HISTORICAL go_to_cv signal on mount.
//
// `handledNavRef` starts EMPTY each mount, so a persisted `kind:"navigate"`
// tool output sitting in the LOADED dock history re-fires router.push on mount,
// yanking the user (e.g. /today → /cv) after a past CV handoff. The fix seeds
// the handled set from the initial (historical) messages so ONLY genuinely new
// (streamed-this-session) signals route. `collectHandledNavIds` is the PURE
// helper that does the seeding; these tests pin the persisted-history semantics
// that escaped before (the previous suite only ever ran with an EMPTY handled
// set, so a history-resident signal would have routed).
// ---------------------------------------------------------------------------

/** A loaded dock message (UIMessage-like) carrying parts from history. */
function historyMsg(parts: unknown[]) {
  return { id: `m-${Math.random()}`, role: "assistant", parts };
}

describe("collectHandledNavIds — seed the handled set from loaded history", () => {
  it("returns the tool-call ids of every kind:'navigate' output in history", () => {
    const initial = [
      historyMsg([
        { type: "text", text: "Heading to your CV." },
        navPart("call-hist-1", SIGNAL),
      ]),
      historyMsg([{ type: "text", text: "no nav here" }]),
      historyMsg([navPart("call-hist-2", { ...SIGNAL, request: "add a summary" })]),
    ];
    const ids = collectHandledNavIds(initial);
    expect(ids.has("call-hist-1")).toBe(true);
    expect(ids.has("call-hist-2")).toBe(true);
    expect(ids.size).toBe(2);
  });

  it("ignores text parts and non-navigate tool outputs", () => {
    const initial = [
      historyMsg([{ type: "text", text: "just advice" }]),
      historyMsg([navPart("call-search", { ok: true, cv: { fullName: "x" } })]),
      historyMsg([
        { type: "tool-go_to_cv", toolCallId: "call-streaming", state: "input-streaming" },
      ]),
    ];
    const ids = collectHandledNavIds(initial);
    expect(ids.size).toBe(0);
  });

  it("returns an empty set for empty / malformed initial messages", () => {
    expect(collectHandledNavIds([]).size).toBe(0);
    expect(collectHandledNavIds(undefined as never).size).toBe(0);
    expect(collectHandledNavIds([null, { foo: 1 }, { parts: "nope" }] as never).size).toBe(0);
  });
});

describe("nextNavigationPush seeded from history (F3) — no replay of historical signals", () => {
  it("does NOT route a signal that already exists in the loaded history", () => {
    // History contains a go_to_cv signal from a PAST session/turn.
    const history = [historyMsg([navPart("call-hist-1", SIGNAL)])];
    const handled = collectHandledNavIds(history);
    // On mount the dock scans that same message's parts. Because the id was
    // pre-seeded from history, the historical signal must NOT re-fire.
    const push = nextNavigationPush(history[0].parts, handled);
    expect(push).toBeNull();
  });

  it("STILL routes a genuinely NEW signal whose id is not in the loaded history", () => {
    const history = [historyMsg([navPart("call-hist-1", SIGNAL)])];
    const handled = collectHandledNavIds(history);
    // A new turn streams in a fresh signal (new tool-call id).
    const liveParts = [navPart("call-new", { ...SIGNAL, request: "tighten my CV" })];
    const push = nextNavigationPush(liveParts, handled);
    expect(push).not.toBeNull();
    expect(push!.id).toBe("call-new");
    const p = new URLSearchParams(push!.url.slice(push!.url.indexOf("?") + 1));
    expect(p.get("handoff")).toBe("tighten my CV");
  });

  it("MUTATION SANITY: without the history seed, the historical signal WOULD route", () => {
    // Proves the test fails if the fix is reverted: an EMPTY handled set (the
    // pre-fix behaviour) routes the history-resident signal — the exact replay
    // bug. This must NOT be how the component initializes its ref.
    const history = [historyMsg([navPart("call-hist-1", SIGNAL)])];
    const pushWithEmptySet = nextNavigationPush(history[0].parts, new Set<string>());
    expect(pushWithEmptySet).not.toBeNull();
    expect(pushWithEmptySet!.id).toBe("call-hist-1");
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
