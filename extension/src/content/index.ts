import { pickAdapter } from "./adapters";
import { fillForm, insertIntoField, type FreeTextQuestion } from "./autofill";
import { Panel } from "./panel";
import { send } from "./messaging";
import type { FieldMapResponse } from "../shared/types";

/**
 * Entry point injected on ATS application pages. Detects the form, mounts the
 * panel, and wires Autofill + per-question AI drafting to the background worker.
 */

const adapter = pickAdapter();
let questions: FreeTextQuestion[] = [];
let mounted = false;

const panel = new Panel({
  onAutofill: runAutofill,
  onGenerate: generateAnswer,
  onInsert: (i, text) => {
    const q = questions[i];
    if (q) insertIntoField(q.el, text);
  },
  onSave: saveAnswer,
});

async function runAutofill() {
  const container = adapter.formContainer();
  if (!container) {
    panel.showError("No application form found on this page.");
    return;
  }

  const res = await send<FieldMapResponse>({ type: "getProfile" });
  if (!res.ok || !res.data) {
    panel.showConnectPrompt();
    return;
  }

  const { filled, questions: qs } = fillForm(container, res.data.fields);
  questions = qs;
  panel.setStatus(res.data.hasCv ? "CV on file" : "");
  panel.showFilled(filled, qs.map((q) => ({ label: q.label, charLimit: q.charLimit })));

  // Record the application (best-effort; don't block the UI).
  const { employer, role } = adapter.employerRole();
  void send({
    type: "trackApplication",
    payload: {
      externalUrl: location.href.split("#")[0],
      ats: adapter.kind,
      employerName: employer,
      roleTitle: role,
      status: "AUTOFILLED",
    },
  });
}

async function generateAnswer(index: number): Promise<string | null> {
  const q = questions[index];
  if (!q) return null;
  const { employer, role } = adapter.employerRole();
  const res = await send<{ answer?: string }>({
    type: "answer",
    payload: {
      questionText: q.label,
      questionType: "long",
      charLimit: q.charLimit,
      employer,
      role,
      externalUrl: location.href.split("#")[0],
    },
  });
  return res.ok && res.data?.answer ? res.data.answer : null;
}

async function saveAnswer(index: number, text: string): Promise<boolean> {
  const q = questions[index];
  if (!q) return false;
  const { employer } = adapter.employerRole();
  const res = await send({
    type: "answer",
    payload: { questionText: q.label, answer: text, employer, save: true },
  });
  return res.ok;
}

async function initWhenReady() {
  if (mounted) return;
  const container = adapter.formContainer();
  if (!container) return; // wait for SPA to render

  mounted = true;
  panel.mount();

  const status = await send<{ connected: boolean }>({ type: "status" });
  const { employer, role } = adapter.employerRole();
  if (status.ok && status.data?.connected) {
    panel.showReady(employer, role);
  } else {
    panel.setStatus("not connected");
    panel.showConnectPrompt();
  }
}

// Static pages: form is present now. SPAs (Ashby/Workday): observe until it is.
void initWhenReady();

const observer = new MutationObserver(() => {
  if (!mounted) void initWhenReady();
});
observer.observe(document.documentElement, { childList: true, subtree: true });

// Stop observing after a while to avoid overhead on pages that never show a form.
setTimeout(() => observer.disconnect(), 20000);
