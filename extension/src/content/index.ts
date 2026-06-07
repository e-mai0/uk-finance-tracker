import { pickAdapter } from "./adapters";
import { serializeForm, type SerializedForm } from "./serialize";
import { applyPlan, insertIntoField, setFieldValue, type PlanQuestion } from "./autofill";
import { Panel } from "./panel";
import { send } from "./messaging";
import { looksLikeApplication, mountCue } from "./detect";
import type { FieldSchema, FillPlanItem } from "../shared/types";

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
  onGenerate: async (fieldId) => {
    const q = draftIndex.get(fieldId);
    if (!q) return null;
    const { employer, role } = adapter.employerRole();
    const res = await send<{ answer?: string }>({
      type: "answer",
      payload: {
        questionText: q.label, questionType: "long", charLimit: q.charLimit,
        employer, role, externalUrl: location.href.split("#")[0],
      },
    });
    return res.ok && res.data?.answer ? res.data.answer : null;
  },
  onInsert: (fieldId, text) => {
    const q = draftIndex.get(fieldId);
    // Drafts are always textareas, but PlanQuestion.el is the wider FillableEl.
    if (q && (q.el instanceof HTMLTextAreaElement || q.el instanceof HTMLInputElement)) {
      insertIntoField(q.el, text);
    }
  },
  onSaveDraft: async (_fieldId, label, text) => {
    const { employer } = adapter.employerRole();
    const res = await send({
      type: "answer",
      payload: { questionText: label, answer: text, employer, save: true },
    });
    return res.ok;
  },
});

function formContainer(): ParentNode | null {
  return adapter.formContainer() ?? (looksLikeApplication() ? document.body : null);
}

async function engage() {
  const container = formContainer();
  if (!container) { panel.showError("No application form found on this page."); return; }

  const status = await send<{ connected: boolean }>({ type: "status" });
  if (!status.ok || !status.data?.connected) { panel.showConnectPrompt(); return; }

  serialized = serializeForm(container);
  const schemaById = new Map(serialized.fields.map((f) => [f.id, f]));
  const { employer, role } = adapter.employerRole();

  const res = await send<{ plan: FillPlanItem[] }>({
    type: "plan",
    payload: { fields: serialized.fields as FieldSchema[], employer, role, url: location.href.split("#")[0] },
  });
  if (!res.ok || !res.data?.plan) { panel.showError(res.error || "Couldn’t plan this form."); return; }

  const applied = applyPlan(res.data.plan, serialized.elements, schemaById);
  askIndex = new Map(applied.asks.map((q) => [q.fieldId, q]));
  draftIndex = new Map(applied.drafts.map((q) => [q.fieldId, q]));

  panel.showTriage(
    applied.filled,
    applied.asks.map((q) => ({ fieldId: q.fieldId, label: q.label, profileKey: q.profileKey, options: q.options })),
    applied.drafts.map((q) => ({ fieldId: q.fieldId, label: q.label, charLimit: q.charLimit })),
  );

  void send({
    type: "trackApplication",
    payload: {
      externalUrl: location.href.split("#")[0], ats: adapter.kind,
      employerName: employer, roleTitle: role, status: "AUTOFILLED",
    },
  });
}

function init() {
  if (mounted) return;
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
