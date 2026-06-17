import { pickAdapter } from "./adapters";
import { serializeForm, currentFieldValue, type SerializedForm } from "./serialize";
import {
  applyPlan,
  insertIntoField,
  isTargetConnected,
  setFieldValue,
  type PlanQuestion,
} from "./autofill";
import {
  Panel,
  type AgentReviewAction,
  type AgentUnresolvedItem,
  type GeneratedDraft,
  type GenerateFailure,
} from "./panel";
import { send } from "./messaging";
import { looksLikeApplication, hasAnyField, mountCue } from "./detect";
import { sendTrackApplicationWithRetry, clearInFlight } from "./record";
import type {
  AgentResultPayload,
  DraftProvenance,
  FieldSchema,
  FillPlanItem,
} from "../shared/types";

/**
 * Content-script entry point, injected on all pages (except Trackr's own — see
 * manifest exclude_matches). It detects application forms, shows a dormant cue,
 * and on engage: serializes the form, asks the backend for a fill plan, applies
 * it, and renders the ask-or-deduce triage. No network call happens until the
 * user clicks the cue. The panel never submits the form.
 */

const adapter = pickAdapter();
let mounted = false;
let serialized: SerializedForm | null = null;
let askIndex = new Map<string, PlanQuestion>();
let draftIndex = new Map<string, PlanQuestion>();
// Bumped on every engage; pre-staging loops abort when it moves on or the
// panel is closed, so a stale loop never writes into a re-planned panel.
let engageSeq = 0;
// Per-field in-flight guard shared by the manual Draft path and the pre-stage
// loop, so the same field is never generated twice concurrently.
const inFlight = new Set<string>();
// Agent assist (phase 4): per-engage round counter (hard cap 3, also enforced
// server-side), the snapshot the last round was built from (the ONLY field set
// agent writes may target), and the question text per unresolved field.
let agentRound = 0;
let agentBusy = false;
let agentForm: SerializedForm | null = null;
let agentQuestions = new Map<string, string>();

/**
 * One confirmation-gated agent round: re-serialize the page with current
 * values, POST /api/ext/agent, and render the proposals for review. Strictly
 * user-initiated (footer button / Continue) - never auto-fires.
 */
async function runAgentRound() {
  if (agentBusy || agentRound >= 3) return;
  const seq = engageSeq;
  const container = formContainer();
  if (!container) {
    panel.showAgentError("No application form found on this page.");
    return;
  }
  agentBusy = true;
  panel.setAgentBusy(true);
  try {
    const round = agentRound + 1;
    const form = serializeForm(container);
    if (!form.fields.length) {
      panel.showAgentError("No fillable fields found on this page.");
      return;
    }
    if (form.fields.length > 60) {
      console.debug(
        `[trackr] agent round ${round}: ${form.fields.length} fields on page, submitting first 60 (${form.fields.length - 60} dropped)`,
      );
    }
    const fields = form.fields.slice(0, 60).map((f) => {
      const fieldEl = form.elements.get(f.id);
      const cur = fieldEl ? currentFieldValue(fieldEl).trim() : "";
      return cur ? { ...f, currentValue: cur } : { ...f };
    });
    // Only the fields actually submitted this round may be written back to.
    const submittedIds = new Set(fields.map((f) => f.id));
    const { employer, role } = adapter.employerRole();
    const res = await send<AgentResultPayload>({
      type: "agent",
      payload: { fields, employer, role, url: location.href.split("#")[0], round },
    });
    // A newer engage (or a closed panel) supersedes this round - drop it.
    if (seq !== engageSeq || !panel.isOpen()) return;
    if (!res.ok || !res.data || !Array.isArray(res.data.actions)) {
      panel.showAgentError(res.error || "Agent assist failed - try again.");
      return;
    }
    agentRound = round;
    // Only now does this snapshot become the apply target: a superseded or
    // failed round must never swap the snapshot out from under live review
    // rows (their positional fieldIds would resolve against the wrong DOM).
    agentForm = form;
    const data = res.data;
    const labelOf = (fid: string) =>
      form.fields.find((f) => f.id === fid)?.label || fid;

    // Belt-and-braces client mirror of the server's fail-closed validation:
    // only the <=60 fields actually submitted THIS round can be proposed.
    const actions: AgentReviewAction[] = data.actions
      .filter((a) => a && submittedIds.has(a.fieldId) && typeof a.value === "string")
      .map((a) => ({
        fieldId: a.fieldId,
        label: labelOf(a.fieldId),
        value: a.value,
        reason: typeof a.reason === "string" ? a.reason : "",
        confidence:
          a.confidence === "high" || a.confidence === "medium" ? a.confidence : "low",
      }));
    const unresolved: AgentUnresolvedItem[] = (Array.isArray(data.unresolved) ? data.unresolved : [])
      .filter(
        (u) =>
          u && typeof u.fieldId === "string" && typeof u.question === "string" &&
          u.question.trim().length > 0 && submittedIds.has(u.fieldId),
      )
      .map((u) => ({
        fieldId: u.fieldId,
        question: u.question,
        options: form.fields.find((f) => f.id === u.fieldId)?.options,
      }));
    agentQuestions = new Map(unresolved.map((u) => [u.fieldId, u.question]));

    const done = data.done === true;
    panel.showAgentReview(actions, unresolved, {
      canContinue: !done && round < 3,
      handBack: !done && round >= 3,
      done,
    });
  } finally {
    agentBusy = false;
    panel.setAgentBusy(false);
  }
}

/** Call /api/ext/answer for a draft field; provenance/draftId are optional on older servers. */
async function generateDraft(
  fieldId: string,
  excludeStories?: string[],
): Promise<GeneratedDraft | GenerateFailure | null> {
  const q = draftIndex.get(fieldId);
  if (!q) return null;
  const { employer, role } = adapter.employerRole();
  const res = await send<{ answer?: string; draftId?: string; provenance?: DraftProvenance }>({
    type: "answer",
    payload: {
      questionText: q.label, questionType: "long", charLimit: q.charLimit,
      employer, role, externalUrl: location.href.split("#")[0],
      ...(excludeStories && excludeStories.length
        ? { excludeStories: excludeStories.slice(0, 10) }
        : {}),
    },
  });
  // Surface the server's reason (e.g. "Daily AI budget reached") to the panel.
  if (!res.ok) return res.error ? { error: res.error } : null;
  if (!res.data?.answer) return null;
  return { text: res.data.answer, draftId: res.data.draftId, provenance: res.data.provenance };
}

/** In-flight-guarded wrapper around generateDraft - the only generation entry point. */
async function generateDraftGuarded(
  fieldId: string,
  excludeStories?: string[],
): Promise<GeneratedDraft | GenerateFailure | null> {
  if (inFlight.has(fieldId)) return { error: "A draft is already in progress for this question." };
  inFlight.add(fieldId);
  try {
    return await generateDraft(fieldId, excludeStories);
  } finally {
    inFlight.delete(fieldId);
  }
}

const panel = new Panel({
  onEngage: engage,
  onAnswerAsk: async (fieldId, value) => {
    const q = askIndex.get(fieldId);
    if (!q) return false;
    setFieldValue(q.el, value); // handles text, textarea, select, and radio
    const res = await send({
      type: "saveFact",
      payload: { profileKey: q.profileKey, questionText: q.label, answer: value },
    });
    return res.ok;
  },
  onGenerate: (fieldId, excludeStories) => generateDraftGuarded(fieldId, excludeStories),
  onInsert: (fieldId, text) => {
    const q = draftIndex.get(fieldId);
    // Drafts are always textareas, but PlanQuestion.el is the wider FillableEl.
    if (q && (q.el instanceof HTMLTextAreaElement || q.el instanceof HTMLInputElement)) {
      insertIntoField(q.el, text);
    }
  },
  onSaveDraft: async (_fieldId, label, text, original, draftId) => {
    const { employer } = adapter.employerRole();
    const res = await send({
      type: "answer",
      payload: { questionText: label, answer: text, employer, save: true, original, draftId },
    });
    return res.ok;
  },
  onAgentAssist: () => void runAgentRound(),
  // Confirmation-gated write: only runs on explicit apply, and only against
  // elements from the agent's own serialized snapshot.
  onAgentApply: (fieldId, value) => {
    const fieldEl = agentForm?.elements.get(fieldId);
    // A detached element (SPA re-render since the snapshot) cannot receive the
    // write - fail visibly rather than reporting a phantom "applied".
    if (!fieldEl || !isTargetConnected(fieldEl)) return false;
    return setFieldValue(fieldEl, value);
  },
  // Unresolved agent question: fill the field + persist the fact, mirroring
  // the plan ask flow (agent field ids resolve against the agent snapshot).
  onAgentAnswer: async (fieldId, value) => {
    const form = agentForm;
    const fieldEl = form?.elements.get(fieldId);
    if (!form || !fieldEl || !isTargetConnected(fieldEl)) return false;
    setFieldValue(fieldEl, value);
    const questionText =
      agentQuestions.get(fieldId) ||
      form.fields.find((f) => f.id === fieldId)?.label ||
      "Application question";
    const res = await send({
      type: "saveFact",
      payload: { questionText: questionText.slice(0, 600), answer: value },
    });
    return res.ok;
  },
  // Clear any in-flight draft generations when the user closes the panel so
  // the same field can be re-generated after the panel is re-opened.
  onClose: () => clearInFlight(inFlight),
});

function formContainer(): ParentNode | null {
  return adapter.formContainer() ?? (looksLikeApplication() ? document.body : null);
}

async function engage(force = false) {
  const seq = ++engageSeq;
  // Fresh agent session per engage: round counter back to 1, stale snapshot
  // and question index dropped (a stale in-flight round is dropped by seq).
  agentRound = 0;
  agentForm = null;
  agentQuestions = new Map();
  const container =
    formContainer() ?? (force && hasAnyField() ? document.body : null);
  if (!container) { panel.showError("No application form found on this page."); return; }

  const status = await send<{ connected: boolean; apiBase?: string }>({ type: "status" });
  if (!status.ok || !status.data?.connected) { panel.showConnectPrompt(); return; }

  serialized = serializeForm(container);
  const schemaById = new Map(serialized.fields.map((f) => [f.id, f]));
  const { employer, role } = adapter.employerRole();

  const res = await send<{ plan: FillPlanItem[] }>({
    type: "plan",
    payload: { fields: serialized.fields as FieldSchema[], employer, role, url: location.href.split("#")[0] },
  });
  if (!res.ok || !res.data?.plan) {
    panel.showError(res.error || "Couldn’t plan this form. Try reloading the page.");
    return;
  }
  // A newer engage superseded this one while we awaited the plan - don't double-apply.
  if (seq !== engageSeq) return;

  const applied = applyPlan(res.data.plan, serialized.elements, schemaById);
  askIndex = new Map(applied.asks.map((q) => [q.fieldId, q]));
  draftIndex = new Map(applied.drafts.map((q) => [q.fieldId, q]));

  panel.showTriage(
    applied.filled,
    applied.asks.map((q) => ({
      fieldId: q.fieldId, label: q.label, profileKey: q.profileKey,
      options: q.options, suggestion: q.suggestion,
    })),
    applied.drafts.map((q) => ({ fieldId: q.fieldId, label: q.label, charLimit: q.charLimit })),
  );

  // Agent assist affordance: offered when the plan left asks for the user or
  // matched nothing at all (unknown ATS). Click-to-start only.
  const planMatchedNothing =
    applied.filled === 0 && applied.asks.length === 0 && applied.drafts.length === 0;
  panel.setAgentAffordance(applied.asks.length > 0 || planMatchedNothing);

  // Footer link into the web app's chat, prefilled with this application.
  const apiBase = status.data.apiBase?.replace(/\/+$/, "");
  if (apiBase) {
    const prefill = employer || role
      ? `Let's talk about my ${[employer, role].filter(Boolean).join(" ")} application.`
      : "Let's talk about this application.";
    panel.setDiscussLink(`${apiBase}/chat?prefill=${encodeURIComponent(prefill)}`);
  }

  // Record the application with retry on transient errors (network / 5xx / 429).
  // Runs in the background — does not block triage from rendering. On permanent
  // failure the user sees an in-panel error so they know the record was not saved.
  void (async () => {
    const trackPayload = {
      externalUrl: location.href.split("#")[0], ats: adapter.kind as string,
      employerName: employer, roleTitle: role, status: "AUTOFILLED",
    };
    const result = await sendTrackApplicationWithRetry(trackPayload, (p) =>
      send({ type: "trackApplication", payload: p }),
    );
    if (!result.ok && panel.isOpen()) {
      panel.showRecordError(
        "Couldn't save this application — click Apply to retry",
      );
    }
  })();

  // Pre-stage drafts for the first three draft fields, sequentially (kind to
  // the generation budget). Abort between calls if the panel was closed or a
  // new engage superseded this one; one field failing never blocks the next.
  // Skip fields that are already generating (manual Draft click), already have
  // a result, or where the user typed while waiting - pre-staging must never
  // clobber user text or duplicate work.
  for (const q of applied.drafts.slice(0, 3)) {
    if (seq !== engageSeq || !panel.isOpen()) break;
    if (inFlight.has(q.fieldId) || panel.isDraftDirty(q.fieldId) || panel.hasDraftResult(q.fieldId)) {
      continue;
    }
    inFlight.add(q.fieldId);
    panel.setDraftPending(q.fieldId);
    try {
      const result = await generateDraft(q.fieldId);
      if (seq !== engageSeq || !panel.isOpen()) break;
      if (result && !("error" in result)) panel.setDraftResult(q.fieldId, result);
      else panel.setDraftFailed(q.fieldId);
    } catch {
      if (seq !== engageSeq || !panel.isOpen()) break;
      panel.setDraftFailed(q.fieldId);
    } finally {
      inFlight.delete(q.fieldId);
    }
  }
}

// The popup (extension icon) broadcasts this to every frame; the frame that
// owns a form engages, the rest no-op. This is the universal fallback for pages
// the auto-detector declines.
chrome.runtime.onMessage.addListener((msg: { type?: string }, _sender, sendResponse) => {
  if (msg?.type !== "trackr:activate") return false;
  const hasForm = formContainer() != null || hasAnyField();
  if (!hasForm) return false;
  mounted = true;
  document.getElementById("trackr-cue-root")?.remove();
  panel.mount();
  panel.setStatus("");
  void engage(true);
  sendResponse({ ok: true });
  return true;
});

function init() {
  if (mounted) return;
  // In sub-frames, only bother with reasonably sized frames (skip ad/util iframes).
  if (window.top !== window && window.innerWidth * window.innerHeight < 90_000) return;
  if (!formContainer()) return;
  mounted = true;
  mountCue(() => { panel.mount(); panel.setStatus(""); void engage(); });
}

void init();

// Re-check on DOM changes for SPA-rendered forms, debounced so the heuristic
// (which scans innerText) runs at most ~once / 300ms on busy pages, and stops
// observing as soon as we've mounted the cue.
let debounce: ReturnType<typeof setTimeout> | null = null;
const observer = new MutationObserver(() => {
  if (mounted) { observer.disconnect(); return; }
  if (debounce) return;
  debounce = setTimeout(() => { debounce = null; init(); }, 300);
});
observer.observe(document.documentElement, { childList: true, subtree: true });
setTimeout(() => observer.disconnect(), 20000);
