/**
 * Tests for application recording reliability:
 *   1. Transient failures retry and ultimately succeed.
 *   2. Permanent failures surface a visible in-panel error.
 *   3. In-flight draft field entries are cleared when the panel closes.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  sendTrackApplicationWithRetry,
  clearInFlight,
  type TrackPayload,
  type RecordResult,
} from "./record";
import { Panel, type PanelHandlers } from "./panel";

// ──────────────────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────────────────

function makeSend(responses: Array<{ ok: boolean; error?: string; status?: number }>) {
  let call = 0;
  return vi.fn(async (): Promise<{ ok: boolean; error?: string; status?: number }> => {
    const r = responses[call] ?? responses[responses.length - 1];
    call++;
    return r;
  });
}

const payload: TrackPayload = {
  externalUrl: "https://example.com/apply",
  ats: "workday",
  employerName: "Acme Corp",
  roleTitle: "Analyst",
  status: "AUTOFILLED",
};

// ──────────────────────────────────────────────────────────────────────────────
// 1. Retry on transient failures
// ──────────────────────────────────────────────────────────────────────────────

describe("sendTrackApplicationWithRetry — transient failures", () => {
  it("succeeds on first try (no retry needed)", async () => {
    const send = makeSend([{ ok: true }]);
    const result = await sendTrackApplicationWithRetry(payload, send, { delayMs: 0 });
    expect(result.ok).toBe(true);
    expect(send).toHaveBeenCalledTimes(1);
  });

  it("retries once on network error then succeeds", async () => {
    const send = makeSend([
      { ok: false, error: "Network error." },
      { ok: true },
    ]);
    const result = await sendTrackApplicationWithRetry(payload, send, { delayMs: 0 });
    expect(result.ok).toBe(true);
    expect(send).toHaveBeenCalledTimes(2);
  });

  it("retries on 5xx failure then succeeds", async () => {
    const send = makeSend([
      { ok: false, status: 503, error: "Service unavailable." },
      { ok: true },
    ]);
    const result = await sendTrackApplicationWithRetry(payload, send, { delayMs: 0 });
    expect(result.ok).toBe(true);
    expect(send).toHaveBeenCalledTimes(2);
  });

  it("retries on 429 then succeeds", async () => {
    const send = makeSend([
      { ok: false, status: 429, error: "Too many requests." },
      { ok: false, status: 429, error: "Too many requests." },
      { ok: true },
    ]);
    const result = await sendTrackApplicationWithRetry(payload, send, { delayMs: 0, maxAttempts: 3 });
    expect(result.ok).toBe(true);
    expect(send).toHaveBeenCalledTimes(3);
  });

  it("does NOT retry on 4xx client error (not transient)", async () => {
    const send = makeSend([
      { ok: false, status: 400, error: "Bad request." },
      { ok: true },
    ]);
    const result = await sendTrackApplicationWithRetry(payload, send, { delayMs: 0 });
    // 400 is a client error — should not retry; caller gets back the failure
    expect(result.ok).toBe(false);
    expect(send).toHaveBeenCalledTimes(1);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// 2. Permanent failure — error must surface in the panel
// ──────────────────────────────────────────────────────────────────────────────

describe("sendTrackApplicationWithRetry — permanent failure result", () => {
  it("returns ok=false after all retries exhausted", async () => {
    const send = makeSend([
      { ok: false, error: "Network error." },
      { ok: false, error: "Network error." },
      { ok: false, error: "Network error." },
    ]);
    const result = await sendTrackApplicationWithRetry(payload, send, {
      delayMs: 0,
      maxAttempts: 3,
    });
    expect(result.ok).toBe(false);
    expect(send).toHaveBeenCalledTimes(3);
  });

  it("result carries an error message on permanent failure", async () => {
    const send = makeSend([{ ok: false, error: "Network error." }]);
    const result: RecordResult = await sendTrackApplicationWithRetry(payload, send, {
      delayMs: 0,
      maxAttempts: 1,
    });
    expect(result.ok).toBe(false);
    expect(result.error).toBeTruthy();
  });
});

// Panel integration: the content script shows an in-panel error on permanent failure.
// We test Panel.showRecordError() directly — the content script calls it when
// sendTrackApplicationWithRetry resolves with ok=false.
describe("Panel.showRecordError — error is visible in the panel", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("renders a visible error message in the panel body", () => {
    const handlers = {
      onEngage: vi.fn(),
      onAnswerAsk: vi.fn(),
      onGenerate: vi.fn(),
      onInsert: vi.fn(),
      onSaveDraft: vi.fn(),
      onAgentAssist: vi.fn(),
      onAgentApply: vi.fn().mockReturnValue(false),
      onAgentAnswer: vi.fn(),
    };
    const panel = new Panel(handlers as unknown as PanelHandlers);
    panel.mount();

    panel.showRecordError("Couldn't save this application — click Apply to retry");

    // The shadow root should contain the error text
    const shadow = document.getElementById("trackr-autofill-root")!.shadowRoot!;
    expect(shadow.textContent).toContain("Couldn't save this application");
  });

  it("error is inside a .err element", () => {
    const handlers = {
      onEngage: vi.fn(),
      onAnswerAsk: vi.fn(),
      onGenerate: vi.fn(),
      onInsert: vi.fn(),
      onSaveDraft: vi.fn(),
      onAgentAssist: vi.fn(),
      onAgentApply: vi.fn().mockReturnValue(false),
      onAgentAnswer: vi.fn(),
    };
    const panel = new Panel(handlers as unknown as PanelHandlers);
    panel.mount();

    panel.showRecordError("Couldn't save this application — click Apply to retry");

    const shadow = document.getElementById("trackr-autofill-root")!.shadowRoot!;
    const errEl = shadow.querySelector(".err");
    expect(errEl).not.toBeNull();
    expect(errEl!.textContent).toContain("Couldn't save this application");
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// 3. In-flight draft tracking cleared on panel close
// ──────────────────────────────────────────────────────────────────────────────

describe("clearInFlight — in-flight set cleared on panel close", () => {
  it("clears all entries from the provided inFlight set", () => {
    const inFlight = new Set<string>(["field-1", "field-2", "field-3"]);
    clearInFlight(inFlight);
    expect(inFlight.size).toBe(0);
  });

});
