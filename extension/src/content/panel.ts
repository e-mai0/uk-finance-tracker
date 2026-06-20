/**
 * On-page floating panel, rendered in a Shadow DOM so host-page CSS can't leak
 * in or out. This is the "copilot on the page" surface: an Autofill action and
 * an AI draft for each free-text question. The user always reviews and submits —
 * the panel never touches the form's submit button.
 */

import type { PlanSuggestion, DraftProvenance } from "../shared/types";

export interface AskItem { fieldId: string; label: string; profileKey?: string; options?: string[]; suggestion?: PlanSuggestion; }
export interface DraftItem { fieldId: string; label: string; charLimit?: number; }
export interface GeneratedDraft { text: string; draftId?: string; provenance?: DraftProvenance; }
/** Generation failure carrying a server-provided reason (e.g. daily budget reached). */
export interface GenerateFailure { error: string }

/** One proposed write from the agent, pending explicit user approval. */
export interface AgentReviewAction {
  fieldId: string;
  label: string;
  value: string;
  reason: string;
  confidence: "high" | "medium" | "low";
}

/** A field the agent could not ground - rendered as an ask-style row. */
export interface AgentUnresolvedItem {
  fieldId: string;
  question: string;
  options?: string[];
}

export interface AgentReviewState {
  canContinue: boolean; // another round is available (done=false, round < 3)
  handBack: boolean;    // round cap reached with work remaining
  done: boolean;        // server says every field is proposed or unresolved
}

export interface PanelHandlers {
  onEngage: () => void;                                                // user asked to plan this form
  onAnswerAsk: (fieldId: string, value: string) => Promise<boolean>;   // fill + write-back
  onGenerate: (fieldId: string, excludeStories?: string[]) => Promise<GeneratedDraft | GenerateFailure | null>;
  onInsert: (fieldId: string, text: string) => void;
  onSaveDraft: (fieldId: string, label: string, text: string, original?: string, draftId?: string) => Promise<boolean>;
  onAgentAssist: () => void;                                           // start / continue an agent round
  onAgentApply: (fieldId: string, value: string) => boolean;           // write one approved value to the page
  onAgentAnswer: (fieldId: string, value: string) => Promise<boolean>; // fill + save for an unresolved question
  onClose?: () => void;                                                // panel dismissed by user (× button)
}

/** Per-card hooks so the content script can drive pre-staged drafting. */
interface DraftCardControls {
  setPending: () => void;
  applyResult: (r: GeneratedDraft) => void;
  setFailed: () => void;
  isDirty: () => boolean;
  hasResult: () => boolean;
}

const STYLE = `
:host { all: initial; }
.wrap {
  position: fixed; right: 20px; bottom: 20px; z-index: 2147483647;
  width: 340px; max-height: 70vh; display: flex; flex-direction: column;
  font-family: ui-sans-serif, system-ui, -apple-system, sans-serif;
  color: #1b1714; background: #fffdf8; border: 1px solid #d6cfbd;
  border-radius: 12px; box-shadow: 0 12px 32px -12px rgba(0,0,0,.35), 0 2px 6px -2px rgba(0,0,0,.2);
  overflow: hidden;
}
.head { display: flex; align-items: center; gap: 8px; padding: 12px 14px; border-bottom: 1px solid #e6e0d2; }
.brand { font-weight: 700; letter-spacing: -.01em; color: #7c2433; font-size: 14px; }
.status { font-size: 11px; color: #6a6258; margin-left: auto; }
.close { cursor: pointer; border: 0; background: transparent; color: #9b9385; font-size: 16px; line-height: 1; padding: 2px 4px; }
.body { padding: 12px 14px; overflow-y: auto; }
.muted { font-size: 12px; color: #6a6258; margin: 0 0 10px; }
.btn {
  display: inline-flex; align-items: center; justify-content: center; gap: 6px;
  height: 34px; padding: 0 14px; border-radius: 8px; border: 0; cursor: pointer;
  font-size: 13px; font-weight: 600; background: #7c2433; color: #fdf6f0; width: 100%;
}
.btn:hover { background: #641b27; }
.btn[disabled] { opacity: .55; cursor: default; }
.btn.sec { background: transparent; color: #1b1714; border: 1px solid #d6cfbd; }
.btn.sec:hover { background: #f0ece1; }
.btn.row { width: auto; height: 28px; padding: 0 10px; font-size: 12px; }
.q { border: 1px solid #e6e0d2; border-radius: 8px; padding: 10px; margin-top: 10px; }
.q-label { font-size: 12px; font-weight: 600; margin: 0 0 6px; }
.q-actions { display: flex; gap: 6px; margin-top: 8px; flex-wrap: wrap; }
textarea {
  width: 100%; box-sizing: border-box; min-height: 90px; resize: vertical;
  font: inherit; font-size: 12px; color: #1b1714; background: #fff; border: 1px solid #d6cfbd;
  border-radius: 6px; padding: 7px;
}
.foot { padding: 9px 14px; border-top: 1px solid #e6e0d2; font-size: 10.5px; color: #9b9385; }
.foot a { display: block; margin-top: 4px; color: #7c2433; font-weight: 600; text-decoration: none; }
.foot a:hover { text-decoration: underline; }
.err { color: #b1431f; font-size: 12px; margin-top: 6px; }
.ok { color: #2f6a45; }
.prov { font-size: 10.5px; color: #6a6258; margin: 5px 0 0; }
.prov .chip { font-weight: 700; font-size: 9.5px; letter-spacing: .05em; border: 1px solid #d6cfbd; border-radius: 4px; padding: 0 4px; }
.warn { font-size: 10.5px; color: #b1431f; margin: 3px 0 0; }
.hint { font-size: 11px; color: #1b1714; background: #f6f2e7; border: 1px dashed #d6cfbd; border-radius: 6px; padding: 5px 7px; margin: 6px 0 0; }
.agent-val { font-size: 12px; color: #1b1714; background: #f6f2e7; border-radius: 6px; padding: 5px 7px; margin: 0; white-space: pre-wrap; word-break: break-word; }
.foot .btn { margin-top: 6px; height: 30px; font-size: 12px; }
`;

export class Panel {
  private host: HTMLDivElement;
  private root: ShadowRoot;
  private body: HTMLDivElement;
  private statusEl: HTMLSpanElement;
  private handlers: PanelHandlers;
  private discussLink: HTMLAnchorElement;
  private draftCards = new Map<string, DraftCardControls>();
  private agentBtn: HTMLButtonElement;
  private agentSection: HTMLDivElement | null = null;
  private agentContinueBtn: HTMLButtonElement | null = null;
  private agentErrorEl: HTMLParagraphElement | null = null;
  private agentBusy = false;
  // Per-row busy hooks for the agent review section: while a round is in
  // flight, apply/skip/Apply-all must be inert so a stale row can't write
  // through the next round's snapshot. Settled rows stay disabled.
  private agentRowBusyHooks: ((busy: boolean) => void)[] = [];

  constructor(handlers: PanelHandlers) {
    this.handlers = handlers;
    this.host = document.createElement("div");
    this.host.id = "cyclops-autofill-root";
    this.root = this.host.attachShadow({ mode: "open" });

    const style = document.createElement("style");
    style.textContent = STYLE;
    this.root.appendChild(style);

    const wrap = el("div", "wrap");
    const head = el("div", "head");
    const brand = el("span", "brand");
    brand.textContent = "Cyclops";
    this.statusEl = el("span", "status") as HTMLSpanElement;
    const close = el("button", "close");
    close.textContent = "×";
    close.addEventListener("click", () => {
      this.remove();
      this.handlers.onClose?.();
    });
    head.append(brand, this.statusEl, close);

    this.body = el("div", "body") as HTMLDivElement;

    const foot = el("div", "foot");
    const footText = el("span");
    footText.textContent = "You review and submit. Cyclops never submits for you.";
    this.discussLink = el<HTMLAnchorElement>("a");
    this.discussLink.target = "_blank";
    this.discussLink.rel = "noopener";
    this.discussLink.textContent = "Discuss in Cyclops ↗";
    this.discussLink.style.display = "none";
    // Agent assist: strictly click-to-start fallback for unresolved fields.
    this.agentBtn = el<HTMLButtonElement>("button", "btn sec");
    this.agentBtn.textContent = "Agent assist ▸";
    this.agentBtn.style.display = "none";
    this.agentBtn.addEventListener("click", () => {
      if (!this.agentBusy) this.handlers.onAgentAssist();
    });
    foot.append(footText, this.discussLink, this.agentBtn);

    wrap.append(head, this.body, foot);
    this.root.appendChild(wrap);
  }

  mount() {
    if (!document.getElementById("cyclops-autofill-root")) {
      document.body.appendChild(this.host);
    }
  }

  remove() {
    this.host.remove();
  }

  setStatus(text: string) {
    this.statusEl.textContent = text;
  }

  /** Whether the panel is still on the page - pre-staging checks this between calls. */
  isOpen(): boolean {
    return this.host.isConnected;
  }

  /** Show the "Discuss in Cyclops" footer link pointing at the web app's chat. */
  setDiscussLink(href: string) {
    this.discussLink.href = href;
    this.discussLink.style.display = "block";
  }

  /** Pre-staging hooks: drive a draft card from the content script. No-ops if the card is gone. */
  setDraftPending(fieldId: string) {
    this.draftCards.get(fieldId)?.setPending();
  }

  setDraftResult(fieldId: string, result: GeneratedDraft) {
    this.draftCards.get(fieldId)?.applyResult(result);
  }

  setDraftFailed(fieldId: string) {
    this.draftCards.get(fieldId)?.setFailed();
  }

  /** True when the user has typed into the card's textarea (diverged from the last generated text). */
  isDraftDirty(fieldId: string): boolean {
    return this.draftCards.get(fieldId)?.isDirty() ?? false;
  }

  /** True when the card already holds a generated result. */
  hasDraftResult(fieldId: string): boolean {
    return this.draftCards.get(fieldId)?.hasResult() ?? false;
  }

  private clearBody() {
    this.body.innerHTML = "";
    this.draftCards.clear();
    this.agentSection = null;
    this.agentContinueBtn = null;
    this.agentErrorEl = null;
    this.agentRowBusyHooks = [];
    this.setAgentAffordance(false);
  }

  /** Show or hide the footer "Agent assist ▸" affordance. */
  setAgentAffordance(visible: boolean) {
    this.agentBtn.style.display = visible ? "" : "none";
  }

  /** Reflect an in-flight agent round: affordances disabled, "thinking...". */
  setAgentBusy(busy: boolean) {
    this.agentBusy = busy;
    this.agentBtn.disabled = busy;
    this.agentBtn.textContent = busy ? "thinking..." : "Agent assist ▸";
    if (this.agentContinueBtn?.isConnected) {
      this.agentContinueBtn.disabled = busy;
      this.agentContinueBtn.textContent = busy ? "thinking..." : "Continue ▸";
    }
    for (const hook of this.agentRowBusyHooks) hook(busy);
  }

  private ensureAgentSection(): HTMLDivElement {
    if (!this.agentSection || !this.agentSection.isConnected) {
      this.agentSection = el<HTMLDivElement>("div");
      this.body.append(this.agentSection);
    }
    return this.agentSection;
  }

  /** Standard failure line for agent rounds (budget 429, old server 404, ...). */
  showAgentError(text: string) {
    const sec = this.ensureAgentSection();
    this.agentErrorEl?.remove();
    const e = el<HTMLParagraphElement>("p", "err");
    e.textContent = text;
    this.agentErrorEl = e;
    sec.append(e);
  }

  /**
   * Confirmation checkpoint: the agent's proposed actions as a review list.
   * NOTHING is written to the page until the user clicks apply / Apply all.
   */
  showAgentReview(
    actions: AgentReviewAction[],
    unresolved: AgentUnresolvedItem[],
    state: AgentReviewState,
  ) {
    this.setAgentAffordance(false); // the review section owns the flow now
    const sec = this.ensureAgentSection();
    sec.innerHTML = "";
    this.agentErrorEl = null;
    this.agentContinueBtn = null;
    this.agentRowBusyHooks = []; // old rows are gone with sec.innerHTML = ""

    const h = el("p", "muted");
    h.style.marginTop = "12px";
    h.textContent = actions.length
      ? `Agent proposals (${actions.length}) · nothing is written until you apply`
      : "Agent assist found no confident proposals.";
    sec.append(h);

    const rows: { applyIfPending: () => void }[] = [];
    let rowApplies = 0;
    let rowSkips = 0;
    const onApplied = () => {
      // The first apply (or unresolved-answer save) unlocks Continue when
      // another round is available.
      if (this.agentContinueBtn) this.agentContinueBtn.style.display = "";
    };
    // Skip-all path: if every row was skipped and nothing applied, the normal
    // "first apply unlocks Continue" never fires - give the user a way forward.
    const onSkipped = () => {
      rowSkips++;
      if (rowSkips + rowApplies === actions.length && rowApplies === 0) {
        if (this.agentContinueBtn) this.agentContinueBtn.style.display = "";
        else this.setAgentAffordance(true);
      }
    };

    if (actions.length > 1) {
      const all = el<HTMLButtonElement>("button", "btn row");
      all.textContent = "Apply all";
      let allUsed = false;
      all.addEventListener("click", () => {
        if (this.agentBusy) return;
        allUsed = true;
        all.disabled = true;
        rows.forEach((r) => r.applyIfPending());
      });
      this.agentRowBusyHooks.push((busy) => {
        if (!allUsed) all.disabled = busy;
      });
      sec.append(all);
    }

    for (const a of actions) {
      const row = this.agentActionRow(
        a,
        () => {
          rowApplies++;
          onApplied();
        },
        onSkipped,
      );
      rows.push({ applyIfPending: row.applyIfPending });
      this.agentRowBusyHooks.push(row.setBusy);
      sec.append(row.card);
    }

    if (unresolved.length) {
      const uh = el("p", "muted");
      uh.style.marginTop = "12px";
      uh.textContent = `Still needs you (${unresolved.length})`;
      sec.append(uh);
      for (const u of unresolved) {
        sec.append(
          this.askCard(
            { fieldId: u.fieldId, label: u.question, options: u.options },
            async (fieldId, value) => {
              const ok = await this.handlers.onAgentAnswer(fieldId, value);
              // A saved answer is round progress too - it must unlock Continue,
              // or a zero-action round with unresolved items dead-ends.
              if (ok) onApplied();
              return ok;
            },
          ),
        );
      }
    }

    if (state.handBack) {
      const hb = el("p", "muted");
      hb.style.marginTop = "10px";
      hb.textContent = unresolved.length
        ? "Handing back to you - the questions above still need your answer."
        : "Handing back to you - review the form before submitting.";
      sec.append(hb);
    } else if (state.done) {
      const dn = el("p", "muted");
      dn.style.marginTop = "10px";
      dn.textContent = "Agent assist is done. Review before submitting.";
      sec.append(dn);
    } else if (state.canContinue) {
      const cont = el<HTMLButtonElement>("button", "btn sec");
      cont.textContent = "Continue ▸";
      // Normally appears after the first apply; a zero-action round with
      // unresolved items has nothing to apply, so show it immediately or the
      // flow dead-ends.
      cont.style.display =
        actions.length === 0 && unresolved.length > 0 ? "" : "none";
      cont.style.marginTop = "10px";
      cont.addEventListener("click", () => {
        if (!this.agentBusy) this.handlers.onAgentAssist();
      });
      this.agentContinueBtn = cont;
      sec.append(cont);
    }
  }

  /** One proposed action: label, truncated value, reason + confidence chip, apply/skip. */
  private agentActionRow(
    a: AgentReviewAction,
    onApplied: () => void,
    onSkipped: () => void,
  ): { card: HTMLElement; applyIfPending: () => void; setBusy: (busy: boolean) => void } {
    const card = el("div", "q");
    const label = el("p", "q-label");
    label.textContent = a.label;
    const val = el("p", "agent-val");
    val.textContent = a.value.length > 160 ? a.value.slice(0, 160) + "…" : a.value;
    const provLine = el("p", "prov");
    if (a.reason) provLine.append(`${a.reason} · `);
    const chip = el("span", "chip");
    chip.textContent = a.confidence.toUpperCase();
    provLine.append(chip);

    const actions = el("div", "q-actions");
    const apply = el<HTMLButtonElement>("button", "btn row");
    apply.textContent = "apply";
    const skip = el<HTMLButtonElement>("button", "btn sec row");
    skip.textContent = "skip";
    const msg = el("span", "err");
    msg.style.display = "none";

    let settled = false;
    const applyIfPending = () => {
      if (settled || this.agentBusy) return;
      settled = true;
      const ok = this.handlers.onAgentApply(a.fieldId, a.value);
      apply.disabled = true;
      skip.disabled = true;
      apply.textContent = ok ? "applied ✓" : "failed";
      if (ok) {
        onApplied();
      } else {
        msg.textContent = "could not apply - field changed";
        msg.style.display = "block";
      }
    };
    apply.addEventListener("click", applyIfPending);
    skip.addEventListener("click", () => {
      if (settled || this.agentBusy) return;
      settled = true;
      apply.disabled = true;
      skip.disabled = true;
      skip.textContent = "skipped";
      card.style.opacity = ".6";
      onSkipped();
    });
    // While a round is in flight this row is inert; once settled it stays disabled.
    const setBusy = (busy: boolean) => {
      if (settled) return;
      apply.disabled = busy;
      skip.disabled = busy;
    };

    actions.append(apply, skip);
    card.append(label, val, provLine, actions, msg);
    return { card, applyIfPending, setBusy };
  }

  showConnectPrompt() {
    this.clearBody();
    const p = el("p", "muted");
    p.textContent =
      "Connect the extension to your Cyclops account: open Cyclops → Settings → Browser extension, then paste the token in this extension's popup.";
    this.body.append(p);
  }

  showReady(employer?: string, role?: string) {
    this.clearBody();
    const p = el("p", "muted");
    p.textContent =
      role || employer
        ? `Detected ${[role, employer].filter(Boolean).join(" · ")}.`
        : "Application form detected.";
    const btn = el("button", "btn");
    btn.textContent = "Autofill this form";
    btn.addEventListener("click", () => this.handlers.onEngage());
    this.body.append(p, btn);
  }

  showTriage(filled: number, asks: AskItem[], drafts: DraftItem[]) {
    this.clearBody();

    const summary = el("p", "muted");
    summary.innerHTML = `✅ Filled <strong>${filled}</strong> field${filled === 1 ? "" : "s"}. Review before submitting.`;
    this.body.append(summary);

    if (asks.length) {
      const h = el("p", "muted");
      h.style.marginTop = "12px";
      h.textContent = `❓ Needs you (${asks.length})`;
      this.body.append(h);
      asks.forEach((a) => this.body.append(this.askCard(a)));
    }

    if (drafts.length) {
      const h = el("p", "muted");
      h.style.marginTop = "12px";
      h.textContent = `✏️ Drafts to review (${drafts.length})`;
      this.body.append(h);
      drafts.forEach((d) => this.body.append(this.draftCard(d)));
    }

    if (!asks.length && !drafts.length) {
      const none = el("p", "muted");
      none.style.marginTop = "10px";
      none.textContent = "Nothing else needs you on this step.";
      this.body.append(none);
    }
  }

  private askCard(
    a: AskItem,
    answer: (fieldId: string, value: string) => Promise<boolean> = this.handlers.onAnswerAsk,
  ): HTMLElement {
    const card = el("div", "q");
    const label = el("p", "q-label");
    label.textContent = a.label;

    // select/radio asks render a dropdown of the field's options; everything
    // else gets a free-text box. `readValue`/`prefillValue` abstract the two.
    let readValue: () => string;
    let prefillValue: (v: string) => boolean;
    let isFreeText = false;
    let control: HTMLElement;
    if (a.options && a.options.length) {
      const sel = el("select") as HTMLSelectElement;
      sel.style.cssText =
        "width:100%;box-sizing:border-box;font:inherit;font-size:12px;padding:6px;border:1px solid #d6cfbd;border-radius:6px;background:#fff;";
      const placeholder = document.createElement("option");
      placeholder.value = "";
      placeholder.textContent = "— select —";
      sel.append(placeholder);
      for (const opt of a.options) {
        const o = document.createElement("option");
        o.value = opt;
        o.textContent = opt;
        sel.append(o);
      }
      control = sel;
      readValue = () => sel.value.trim();
      prefillValue = (v) => {
        const t = v.toLowerCase().trim();
        const opt = Array.from(sel.options).find(
          (o) => o.value && (o.text.toLowerCase().trim() === t || o.value.toLowerCase().trim() === t),
        );
        if (!opt) return false;
        sel.value = opt.value;
        return true;
      };
    } else {
      const input = el("textarea") as HTMLTextAreaElement;
      input.style.minHeight = "38px";
      control = input;
      isFreeText = true;
      readValue = () => input.value.trim();
      prefillValue = (v) => {
        input.value = v;
        return true;
      };
    }

    // Suggestion handling (feature-detected - older servers send none).
    // High/medium confidence: prefill + one-tap "Use". Low confidence (or a
    // select with no matching option): hint line only, never auto-primed.
    const s = a.suggestion;
    const hasSuggestion = Boolean(s && typeof s.value === "string" && s.value.trim());
    const conf =
      s && (s.confidence === "high" || s.confidence === "medium") ? s.confidence : "low";
    const prefilled = hasSuggestion && conf !== "low" ? prefillValue(s!.value) : false;

    const actions = el("div", "q-actions");
    const fill = el<HTMLButtonElement>("button", "btn row");
    const idleLabel = prefilled ? "Use" : "Fill & save";
    fill.textContent = idleLabel;
    const msg = el("span", "err");
    msg.style.display = "none";

    fill.addEventListener("click", async () => {
      const value = readValue();
      if (!value) return;
      fill.disabled = true;
      const ok = await answer(a.fieldId, value);
      fill.textContent = ok ? "Saved ✓" : "Failed";
      if (!ok) {
        msg.textContent = "Couldn’t save — is the extension connected?";
        msg.style.display = "block";
      }
      setTimeout(() => {
        fill.disabled = false;
        fill.textContent = idleLabel;
      }, 1500);
    });

    actions.append(fill);
    card.append(label, control);

    if (hasSuggestion && s) {
      if (!prefilled) {
        const hint = el("p", "hint");
        const v = s.value.trim();
        hint.textContent = `suggested: ${v.length > 160 ? v.slice(0, 160) + "…" : v}`;
        card.append(hint);
        // Free-text fields get a small "use anyway" that primes the input -
        // the user still presses Fill & save. Selects with no matching option
        // stay hint-only.
        if (isFreeText) {
          const useAnyway = el<HTMLButtonElement>("button", "btn sec row");
          useAnyway.textContent = "use anyway";
          useAnyway.addEventListener("click", () => prefillValue(s.value));
          actions.append(useAnyway);
        }
      }
      const provLine = el("p", "prov");
      const sourceText =
        s.source === "memory" ? "from your memory"
        : s.source === "bank" ? "from your answer bank"
        : "suggested";
      provLine.append(`${sourceText} · `);
      const chip = el("span", "chip");
      chip.textContent = conf.toUpperCase();
      provLine.append(chip);
      card.append(provLine);
    }

    card.append(actions, msg);
    return card;
  }

  private draftCard(d: DraftItem): HTMLElement {
    const card = el("div", "q");
    const label = el("p", "q-label");
    label.textContent = d.label + (d.charLimit ? `  (max ${d.charLimit} chars)` : "");
    const ta = el("textarea") as HTMLTextAreaElement;
    ta.placeholder = "Click Draft to generate an answer…";
    const prov = el("p", "prov");
    prov.style.display = "none";
    const warn = el("p", "warn");
    warn.textContent = "thin grounding - double-check specifics";
    warn.style.display = "none";
    const actions = el("div", "q-actions");
    const draft = el<HTMLButtonElement>("button", "btn sec row");
    draft.textContent = "Draft";
    const different = el<HTMLButtonElement>("button", "btn sec row");
    different.textContent = "Different story";
    different.style.display = "none";
    const insert = el<HTMLButtonElement>("button", "btn row");
    insert.textContent = "Insert";
    const save = el<HTMLButtonElement>("button", "btn sec row");
    save.textContent = "Save to bank";
    const msg = el("span", "err");
    msg.style.display = "none";

    // Track the original generated text and its draftId for edit learning,
    // plus every story slug used so far so "Different story" can exclude them
    // (capped at 10 - the server schema's limit).
    let generatedText: string | undefined;
    let generatedDraftId: string | undefined;
    let usedStories: string[] = [];

    // Dirty when the textarea diverges from the last generated text - set on
    // user input, cleared when the user explicitly regenerates (Draft /
    // "Different story") or types the textarea back to its generated/empty
    // state. Pre-staged results never overwrite a dirty textarea.
    let dirty = false;
    ta.addEventListener("input", () => {
      dirty = ta.value !== (generatedText ?? "");
    });

    // Apply a generation result: textarea, edit-learning state, provenance
    // line, thin-grounding warning, and "Different story" visibility. Shared
    // by the Draft click path and the pre-stage path (panel.setDraftResult).
    const applyResult = (result: GeneratedDraft) => {
      if (dirty) {
        // The user typed while this generation was in flight (pre-stage path);
        // silently drop the result and restore the card's idle state.
        setFailed();
        return;
      }
      draft.disabled = false;
      different.disabled = false;
      draft.textContent = "Redraft";
      ta.value = result.text;
      generatedText = result.text;
      generatedDraftId = result.draftId;

      const p = result.provenance;
      const stories =
        p && Array.isArray(p.storiesUsed)
          ? p.storiesUsed.filter((x): x is string => typeof x === "string" && x.length > 0)
          : [];
      const kind = p && typeof p.questionKind === "string" ? p.questionKind : "";
      const line = stories.length
        ? `based on: ${stories.join(", ")}${kind ? ` · ${kind}` : ""}`
        : kind;
      prov.textContent = line;
      prov.style.display = line ? "block" : "none";
      warn.style.display = p?.thinGrounding === true ? "block" : "none";

      for (const slug of stories) if (!usedStories.includes(slug)) usedStories.push(slug);
      if (usedStories.length > 10) usedStories = usedStories.slice(-10);
      different.style.display = stories.length ? "" : "none";
    };

    const setPending = () => {
      draft.disabled = true;
      different.disabled = true;
      draft.textContent = "Drafting…";
      msg.style.display = "none";
    };

    const setFailed = () => {
      draft.disabled = false;
      different.disabled = false;
      draft.textContent = generatedText ? "Redraft" : "Draft";
    };

    const runGenerate = async (excludeStories?: string[]) => {
      // Explicit user intent (Draft / "Different story") may overwrite typed text.
      dirty = false;
      setPending();
      const result = await this.handlers.onGenerate(d.fieldId, excludeStories);
      if (result == null || "error" in result) {
        setFailed();
        msg.textContent =
          result && "error" in result && result.error
            ? result.error
            : "Couldn’t generate - check the popup is connected.";
        msg.style.display = "block";
      } else {
        applyResult(result);
      }
    };

    draft.addEventListener("click", () => void runGenerate());
    different.addEventListener("click", () => void runGenerate(usedStories.slice(0, 10)));
    insert.addEventListener("click", () => {
      if (ta.value.trim()) this.handlers.onInsert(d.fieldId, ta.value);
    });
    save.addEventListener("click", async () => {
      if (!ta.value.trim()) return;
      save.disabled = true;
      // Pass original + draftId so the server can capture the edit for learning.
      const ok = await this.handlers.onSaveDraft(d.fieldId, d.label, ta.value, generatedText, generatedDraftId);
      save.textContent = ok ? "Saved ✓" : "Save failed";
      setTimeout(() => {
        save.disabled = false;
        save.textContent = "Save to bank";
      }, 1500);
    });

    this.draftCards.set(d.fieldId, {
      setPending,
      applyResult,
      setFailed,
      isDirty: () => dirty,
      hasResult: () => generatedText !== undefined,
    });

    actions.append(draft, different, insert, save);
    card.append(label, ta, prov, warn, actions, msg);
    return card;
  }

  showError(text: string) {
    const e = el("p", "err");
    e.textContent = text;
    this.body.append(e);
  }

  /**
   * Show a persistent recording-failure error in the panel body (below any
   * existing content). Used when sendTrackApplicationWithRetry exhausts all
   * retries so the user knows the Application row was not saved.
   */
  showRecordError(text: string) {
    // Remove any previous record-error element to avoid stacking duplicates
    // (e.g. if engage is somehow called twice on the same panel state).
    this.root.querySelector(".record-err")?.remove();
    const e = el("p", "err record-err");
    e.textContent = text;
    this.body.append(e);
  }
}

function el<T extends HTMLElement = HTMLElement>(tag: string, className?: string): T {
  const e = document.createElement(tag);
  if (className) e.className = className;
  return e as unknown as T;
}
