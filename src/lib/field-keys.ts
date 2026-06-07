/**
 * Canonical mapping from a form field's visible label to a known profile key,
 * and a heuristic for whether a free-text field is an essay (draft) or a short
 * factual field (ask). Server-side single source of truth for the planner.
 * Mirrors the value keys produced by `buildFieldMap` in server/ext-profile.ts.
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

const QUESTION_HINT =
  /\b(why|describe|tell us|explain|motivat|interest|cover letter|what (makes|are)|how would|your experience|strengths?)\b/i;

/** Map a label to a known profile key, or null. */
export function matchKey(label: string): string | null {
  const l = label.toLowerCase();
  for (const [key, re] of PATTERNS) {
    if (re.test(l)) return key;
  }
  return null;
}

/**
 * Classify a free-text field. "essay" → draft prose for review;
 * "factual" → a short answer we should fill or ask for.
 */
export function classifyQuestion(
  label: string,
  type: string,
): "essay" | "factual" {
  if (type !== "textarea") return "factual";
  if (label.length > 12 && (label.includes("?") || QUESTION_HINT.test(label))) {
    return "essay";
  }
  return "factual";
}
