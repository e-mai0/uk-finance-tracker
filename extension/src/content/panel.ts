/**
 * On-page floating panel, rendered in a Shadow DOM so host-page CSS can't leak
 * in or out. This is the "copilot on the page" surface: an Autofill action and
 * an AI draft for each free-text question. The user always reviews and submits —
 * the panel never touches the form's submit button.
 */

export interface PanelQuestion {
  label: string;
  charLimit?: number;
}

export interface PanelHandlers {
  onAutofill: () => void;
  onGenerate: (index: number) => Promise<string | null>;
  onInsert: (index: number, text: string) => void;
  onSave: (index: number, text: string) => Promise<boolean>;
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
.err { color: #b1431f; font-size: 12px; margin-top: 6px; }
.ok { color: #2f6a45; }
`;

export class Panel {
  private host: HTMLDivElement;
  private root: ShadowRoot;
  private body: HTMLDivElement;
  private statusEl: HTMLSpanElement;
  private handlers: PanelHandlers;

  constructor(handlers: PanelHandlers) {
    this.handlers = handlers;
    this.host = document.createElement("div");
    this.host.id = "trackr-autofill-root";
    this.root = this.host.attachShadow({ mode: "open" });

    const style = document.createElement("style");
    style.textContent = STYLE;
    this.root.appendChild(style);

    const wrap = el("div", "wrap");
    const head = el("div", "head");
    const brand = el("span", "brand");
    brand.textContent = "Trackr";
    this.statusEl = el("span", "status") as HTMLSpanElement;
    const close = el("button", "close");
    close.textContent = "×";
    close.addEventListener("click", () => this.remove());
    head.append(brand, this.statusEl, close);

    this.body = el("div", "body") as HTMLDivElement;

    const foot = el("div", "foot");
    foot.textContent = "You review and submit. Trackr never submits for you.";

    wrap.append(head, this.body, foot);
    this.root.appendChild(wrap);
  }

  mount() {
    if (!document.getElementById("trackr-autofill-root")) {
      document.body.appendChild(this.host);
    }
  }

  remove() {
    this.host.remove();
  }

  setStatus(text: string) {
    this.statusEl.textContent = text;
  }

  private clearBody() {
    this.body.innerHTML = "";
  }

  showConnectPrompt() {
    this.clearBody();
    const p = el("p", "muted");
    p.textContent =
      "Connect the extension to your Trackr account: open Trackr → Settings → Browser extension, then paste the token in this extension's popup.";
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
    btn.addEventListener("click", () => this.handlers.onAutofill());
    this.body.append(p, btn);
  }

  showFilled(count: number, questions: PanelQuestion[]) {
    this.clearBody();
    const summary = el("p", "muted");
    summary.innerHTML = `Filled <strong>${count}</strong> field${count === 1 ? "" : "s"}. Review everything before submitting.`;
    this.body.append(summary);

    const again = el("button", "btn sec");
    again.textContent = "Autofill again";
    again.addEventListener("click", () => this.handlers.onAutofill());
    this.body.append(again);

    if (questions.length === 0) {
      const none = el("p", "muted");
      none.style.marginTop = "10px";
      none.textContent = "No open-ended questions detected on this step.";
      this.body.append(none);
      return;
    }

    const heading = el("p", "muted");
    heading.style.marginTop = "12px";
    heading.textContent = "Draft answers (you can edit before inserting):";
    this.body.append(heading);

    questions.forEach((q, i) => this.body.append(this.questionCard(q, i)));
  }

  private questionCard(q: PanelQuestion, index: number): HTMLElement {
    const card = el("div", "q");
    const label = el("p", "q-label");
    label.textContent =
      q.label + (q.charLimit ? `  (max ${q.charLimit} chars)` : "");
    card.append(label);

    const ta = el("textarea") as HTMLTextAreaElement;
    ta.placeholder = "Click Draft to generate an answer…";
    card.append(ta);

    const actions = el("div", "q-actions");
    const draft = el<HTMLButtonElement>("button", "btn sec row");
    draft.textContent = "Draft";
    const insert = el<HTMLButtonElement>("button", "btn row");
    insert.textContent = "Insert";
    const save = el<HTMLButtonElement>("button", "btn sec row");
    save.textContent = "Save to bank";
    const msg = el("span", "err");
    msg.style.display = "none";

    draft.addEventListener("click", async () => {
      draft.disabled = true;
      draft.textContent = "Drafting…";
      msg.style.display = "none";
      const text = await this.handlers.onGenerate(index);
      draft.disabled = false;
      draft.textContent = "Redraft";
      if (text == null) {
        msg.textContent = "Couldn’t generate — check the popup is connected.";
        msg.style.display = "block";
      } else {
        ta.value = text;
      }
    });

    insert.addEventListener("click", () => {
      if (ta.value.trim()) this.handlers.onInsert(index, ta.value);
    });

    save.addEventListener("click", async () => {
      if (!ta.value.trim()) return;
      save.disabled = true;
      const ok = await this.handlers.onSave(index, ta.value);
      save.textContent = ok ? "Saved ✓" : "Save failed";
      if (ok) save.className = "btn sec row ok";
      setTimeout(() => {
        save.disabled = false;
        save.textContent = "Save to bank";
        save.className = "btn sec row";
      }, 1500);
    });

    actions.append(draft, insert, save);
    card.append(actions, msg);
    return card;
  }

  showError(text: string) {
    const e = el("p", "err");
    e.textContent = text;
    this.body.append(e);
  }
}

function el<T extends HTMLElement = HTMLElement>(tag: string, className?: string): T {
  const e = document.createElement(tag);
  if (className) e.className = className;
  return e as unknown as T;
}
