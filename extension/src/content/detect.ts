/**
 * Lightweight, network-free heuristic that decides whether the current page
 * looks like an application form, plus a dormant bottom-right "cue" pill. The
 * panel (and any network call) is only created when the user clicks the cue.
 */

const APPLY_HINT =
  /\b(apply|application|cover letter|why (do|are) you|right to work|sponsorship|notice period|cv|resume)\b/i;

/** True if the page has a form-like cluster of inputs and application wording. */
export function looksLikeApplication(doc: Document = document): boolean {
  const fields = doc.querySelectorAll(
    "input:not([type=hidden]):not([type=submit]):not([type=button]), textarea, select",
  );
  if (fields.length < 4) return false;
  const hasTextarea = doc.querySelector("textarea") != null;
  const text = (doc.body?.innerText || "").slice(0, 5000);
  return hasTextarea || APPLY_HINT.test(text);
}

/** Mount the dormant cue. Calls onEngage exactly once when clicked. */
export function mountCue(onEngage: () => void): () => void {
  if (document.getElementById("trackr-cue-root")) return () => {};
  const host = document.createElement("div");
  host.id = "trackr-cue-root";
  const root = host.attachShadow({ mode: "open" });

  const style = document.createElement("style");
  style.textContent = `
    .cue {
      position: fixed; right: 20px; bottom: 20px; z-index: 2147483646;
      display: inline-flex; align-items: center; gap: 8px;
      padding: 10px 14px; border-radius: 999px; cursor: pointer;
      font-family: ui-sans-serif, system-ui, sans-serif; font-size: 13px; font-weight: 600;
      color: #fdf6f0; background: #7c2433; border: 0;
      box-shadow: 0 8px 24px -8px rgba(0,0,0,.4);
    }
    .cue:hover { background: #641b27; }
  `;
  root.appendChild(style);

  const btn = document.createElement("button");
  btn.className = "cue";
  btn.textContent = "◆ Trackr — apply with copilot";
  btn.addEventListener("click", () => {
    host.remove();
    onEngage();
  });
  root.appendChild(btn);
  document.body.appendChild(host);

  return () => host.remove();
}
