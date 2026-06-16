/**
 * Heuristics that map a form field's visible label to a Trackr profile key, and
 * that decide which fields are free-text questions worth an AI draft. Kept
 * declarative so per-ATS quirks are localized to the adapters.
 */

// Order matters — more specific patterns first.
const PATTERNS: [string, RegExp][] = [
  ["email", /\be-?mail\b/i],
  ["firstName", /\b(first|given)\s*name\b/i],
  ["lastName", /\b(last|family)\s*name\b|surname/i],
  ["fullName", /\bfull\s*name\b|\blegal name\b|^name\b|\byour name\b/i],
  ["phone", /\b(phone|mobile|telephone|tel)\b/i],
  ["linkedinUrl", /linkedin/i],
  ["githubUrl", /\b(github|portfolio)\b/i],
  ["websiteUrl", /\b(website|personal site|blog|url)\b/i],
  ["university", /\b(university|school|college|institution)\b/i],
  ["degreeType", /\b(degree type|qualification|level of study)\b/i],
  ["degree", /\b(degree|major|subject|course|field of study|discipline)\b/i],
  ["graduationDate", /\b(graduation date|expected graduation|completion date)\b/i],
  ["graduationYear", /\b(graduation|grad(uation)? year|year of graduation)\b/i],
  ["city", /\b(city|town)\b/i],
  ["country", /\bcountry\b/i],
  ["requiresSponsorship", /\bsponsor(ship)?\b/i],
  ["workAuthorizedUk", /\b(authori[sz]ed to work|right to work|legally.*work|work permit|eligib.*to work)\b/i],
  ["pronouns", /\bpronoun/i],
  ["gender", /\bgender\b/i],
  ["ethnicity", /\b(ethnic|race)\b/i],
  ["noticePeriod", /\bnotice period\b/i],
  ["earliestStart", /\b(start date|availability|available to start|earliest start)\b/i],
];

const QUESTION_HINT = /\b(why|describe|tell us|explain|motivat|interest|cover letter|what (makes|are)|how would|your experience|strengths?)\b/i;

export type FillableEl =
  | HTMLInputElement
  | HTMLTextAreaElement
  | HTMLSelectElement;

function clean(text: string): string {
  return text
    .replace(/\s+/g, " ")
    .replace(/\*/g, "")
    .replace(/\(required\)/gi, "")
    .replace(/required$/i, "")
    .trim();
}

/** CSS.escape, guarded for non-browser environments (jsdom tests, older hosts). */
export function esc(id: string): string {
  return typeof CSS !== "undefined" && CSS.escape ? CSS.escape(id) : id;
}

/**
 * Count distinct fillable controls in a container, collapsing same-name
 * radio/checkbox groups to one logical control. Used to decide whether a
 * shared container label unambiguously belongs to a single field.
 */
function logicalControlCount(container: Element): number {
  const seenGroups = new Set<string>();
  let count = 0;
  container.querySelectorAll<FillableEl>("input, textarea, select").forEach((c) => {
    if (c instanceof HTMLInputElement) {
      const t = (c.type || "text").toLowerCase();
      if (["hidden", "submit", "button", "image", "reset"].includes(t)) return;
      if ((t === "radio" || t === "checkbox") && c.name) {
        const key = `${t}:${c.name}`;
        if (seenGroups.has(key)) return;
        seenGroups.add(key);
      }
    }
    count++;
  });
  return count;
}

/** Best-effort visible label for a field. */
export function getLabelText(el: Element): string {
  const id = el.getAttribute("id");
  if (id) {
    const lbl = document.querySelector(`label[for="${esc(id)}"]`);
    if (lbl?.textContent) return clean(lbl.textContent);
  }
  const wrap = el.closest("label");
  if (wrap?.textContent) return clean(wrap.textContent);

  const aria = el.getAttribute("aria-label");
  if (aria) return clean(aria);

  const labelledby = el.getAttribute("aria-labelledby");
  if (labelledby) {
    const ref = document.getElementById(labelledby);
    if (ref?.textContent) return clean(ref.textContent);
  }

  // Only trust a shared-container label when it unambiguously belongs to a
  // single control. With several controls in one container (e.g. two essay
  // textareas in one fieldset) the label is ambiguous; attributing it to each
  // field yields identical questions and duplicate drafted answers. Fall
  // through to the per-field placeholder/name in that case.
  const container = el.closest(
    "[class*=field], [class*=question], .form-group, fieldset, li",
  );
  if (container && logicalControlCount(container) <= 1) {
    const lbl = container.querySelector("label, legend");
    if (lbl?.textContent) return clean(lbl.textContent);
  }

  const ph = el.getAttribute("placeholder");
  if (ph) return clean(ph);
  const name = el.getAttribute("name");
  if (name) return clean(name.replace(/[_\-]+/g, " "));
  return "";
}

/** Map a label to a known profile key, or null. */
export function matchKey(label: string): string | null {
  const l = label.toLowerCase();
  for (const [key, re] of PATTERNS) {
    if (re.test(l)) return key;
  }
  return null;
}

/** True if this looks like a free-text application question (essay-style). */
export function isFreeTextQuestion(el: Element, label: string): boolean {
  const isTextarea = el.tagName === "TEXTAREA";
  if (!isTextarea) return false;
  // Skip obvious non-questions (e.g. "Additional information" address blocks).
  if (!label) return true;
  return label.length > 12 && (label.includes("?") || QUESTION_HINT.test(label));
}

/** Enumerate fillable fields inside a container. */
export function collectFields(root: ParentNode): FillableEl[] {
  const els = root.querySelectorAll<FillableEl>(
    "input, textarea, select",
  );
  const out: FillableEl[] = [];
  els.forEach((el) => {
    if (el instanceof HTMLInputElement) {
      const t = (el.type || "text").toLowerCase();
      if (["hidden", "file", "submit", "button", "image", "reset", "password"].includes(t)) {
        return;
      }
    }
    if ((el as HTMLElement).offsetParent === null && el.tagName !== "SELECT") {
      // skip hidden fields (offsetParent null) but keep selects which can be styled
      if (el.getAttribute("aria-hidden") === "true") return;
    }
    out.push(el);
  });
  return out;
}
