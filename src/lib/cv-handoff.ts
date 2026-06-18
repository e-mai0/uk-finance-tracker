// src/lib/cv-handoff.ts
//
// Cycle 5 U4b — dock→CV handoff CLIENT mechanism (pure helpers).
//
// The main brain's `go_to_cv` tool emits a navigation SIGNAL as its tool
// output: `{ kind: "navigate", to: "/cv", pane: "refine", request }`. The dock /
// Ask-Cyclops chat client (cyclops-chat.tsx) interprets that signal and routes
// to the CV page carrying the request; the CV chat client then auto-sends the
// request to the coach exactly once and strips the carrying query param so a
// refresh cannot replay the send.
//
// All of the once-guard logic lives here as PURE functions so it is unit-
// testable in the repo's node test environment (no jsdom / effects). The React
// components are thin: they hold the "already handled" state (a ref / Set) and
// delegate the decisions to these helpers.

/** The CV page reads the handoff request under this query param. */
export const HANDOFF_PARAM = "handoff";
/** The CV page reads which pane to open under this query param. */
export const PANE_PARAM = "pane";
/** Where the handoff lands; also the strip target (a refresh-safe bare URL). */
export const CV_PATH = "/cv";

/** The navigation signal a `kind: "navigate"` tool emits. */
export interface NavigationSignal {
  kind: "navigate";
  /** Target path, e.g. "/cv". */
  to: string;
  /** Which pane to open at the target (CV uses "refine" for the coach view). */
  pane?: string;
  /** The user's instruction to forward to the destination assistant. */
  request?: string;
}

/**
 * Build the handoff URL the client routes to. The request is URL-encoded into
 * the `handoff` param and the pane into `pane`. Using URLSearchParams keeps
 * arbitrary user text (ampersands, %, ?) safe in the query string.
 */
export function buildHandoffUrl(request: string, pane: string = "refine"): string {
  const params = new URLSearchParams();
  params.set(HANDOFF_PARAM, request);
  params.set(PANE_PARAM, pane);
  return `${CV_PATH}?${params.toString()}`;
}

/**
 * Generic discriminant check: is `output` a routable navigation signal?
 * Detect by `kind === "navigate"` (so any future navigation tool works), and
 * require a non-empty string `to` so we never push to nowhere.
 */
export function isNavigationSignal(output: unknown): output is NavigationSignal {
  if (!output || typeof output !== "object") return false;
  const o = output as Record<string, unknown>;
  return o.kind === "navigate" && typeof o.to === "string" && o.to.length > 0;
}

/** A tool UI part that may carry a navigation signal as its output. */
interface ToolPartLike {
  type?: unknown;
  toolCallId?: unknown;
  state?: unknown;
  output?: unknown;
}

/** The push the client should perform for a freshly-seen navigation signal. */
export interface NavigationPush {
  /** Stable id of the signal (the tool call id) — recorded to guard re-fires. */
  id: string;
  /** The destination URL with the request + pane encoded as query params. */
  url: string;
}

/**
 * Scan a message's parts for the FIRST navigation signal whose id is not yet in
 * `handled`, and return the push the client should perform — or null if there
 * is nothing new to route. The caller records the returned id in `handled`
 * (a ref-held Set) so a re-render / re-stream carrying the same signal returns
 * null: route EXACTLY ONCE per signal.
 *
 * We key the once-guard on the tool call id, which is stable across the
 * re-renders of a single streamed turn — so the guard survives React
 * re-renders without firing twice, and a genuinely new turn (new id) still
 * routes.
 */
export function nextNavigationPush(
  parts: readonly unknown[],
  handled: ReadonlySet<string>,
): NavigationPush | null {
  for (const raw of parts) {
    const part = raw as ToolPartLike;
    if (!part || typeof part !== "object") continue;
    if (part.state !== "output-available") continue;
    if (!isNavigationSignal(part.output)) continue;

    const id = typeof part.toolCallId === "string" && part.toolCallId
      ? part.toolCallId
      : // Fallback: derive a stable-ish id from the signal so a missing
        // toolCallId still guards within a render set.
        `nav:${part.output.to}:${part.output.request ?? ""}`;

    if (handled.has(id)) continue;

    const signal = part.output;
    const url = buildHandoffUrl(signal.request ?? "", signal.pane ?? "refine");
    return { id, url };
  }
  return null;
}

/** The decision the CV chat client makes about the handoff param. */
export interface AutoSendDecision {
  /** Send the request to the coach as an ordinary user message. */
  send: boolean;
  /** Strip the carrying query param (so a refresh can't replay the send). */
  strip: boolean;
  /** The (trimmed) text to send when `send` is true. */
  text: string;
}

/**
 * Decide what the CV chat client does with a `handoff` param on mount.
 *
 * - No / blank handoff param → do nothing (send=false, strip=false). A normal
 *   /cv visit must not auto-send anything.
 * - A handoff param present and not yet fired (`already === false`) → send it
 *   ONCE and strip the param.
 * - Already fired (`already === true`, e.g. a re-render after send) → never
 *   send again; still request a strip so a lingering param can't replay.
 *
 * `already` is the component's once-guard (a ref), so the send fires exactly
 * once on mount and the strip removes the param from the URL.
 */
export function decideAutoSend(
  handoff: string | undefined | null,
  already: boolean,
): AutoSendDecision {
  const text = (handoff ?? "").trim();
  if (!text) return { send: false, strip: false, text: "" };
  if (already) return { send: false, strip: true, text };
  return { send: true, strip: true, text };
}
