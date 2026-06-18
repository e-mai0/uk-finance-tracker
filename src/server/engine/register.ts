/**
 * register.ts — pure register inference for UK finance applications.
 *
 * Infers the application PROGRAMME (spring week / summer / off-cycle / placement)
 * and DIVISION (IBD / markets / asset & wealth / research) from the role and
 * question TEXT alone. Deliberately text-based, NOT read from the tracker's
 * `programmeType` column, so the engine lane stays decoupled (see ADR-007).
 *
 * Pure: no I/O, no imports, no side effects.
 *
 * Programme precedence (first match wins):
 *   spring_week → off_cycle → placement → summer (default sink when ambiguous).
 * The most-demanding safe default is `summer`, so any genuinely ambiguous role
 * is graded against the summer bar rather than under-prepared.
 */

export type Programme = "spring_week" | "summer" | "off_cycle" | "placement";
export type Division = "ibd" | "markets" | "am_wm" | "research" | "unknown";

export type Register = { programme: Programme; division: Division };

/** Signal sets, ordered by precedence. The first set that matches wins. */
const PROGRAMME_SIGNALS: { programme: Exclude<Programme, "summer">; re: RegExp }[] = [
  {
    programme: "spring_week",
    // spring week / spring insight / insight / first-year / discovery programmes
    re: /\b(spring\s*week|spring\s*insight|spring\s*programme|insight\s*(?:day|week|programme|series|event)?|first[\s-]*year|discovery\s*(?:day|week|programme)?|early\s*insight)\b/i,
  },
  {
    programme: "off_cycle",
    re: /\boff[\s-]*cycle\b/i,
  },
  {
    programme: "placement",
    // year in industry / industrial placement / sandwich / placement year
    re: /\b(year\s*in\s*industry|industrial\s*placement|placement\s*year|sandwich|industrial\s*year|undergraduate\s*placement|12[\s-]*month\s*placement)\b/i,
  },
];

const DIVISION_SIGNALS: { division: Exclude<Division, "unknown">; re: RegExp }[] = [
  {
    division: "ibd",
    // M&A, advisory, IBD, investment banking, coverage
    re: /\b(m&a|m\s*&\s*a|mergers?\s*(?:and|&)?\s*acquisitions?|advisory|ibd|investment\s*bank(?:ing)?\s*division|investment\s*bank(?:ing|er)?|coverage)\b/i,
  },
  {
    division: "markets",
    // sales & trading, markets, S&T, FICC, equities trading, rates/FX/credit trading
    re: /\b(sales\s*(?:and|&)\s*trading|s\s*&\s*t|s&t|global\s*markets|\bmarkets\b|ficc|equities?\s*trading|trading\s*(?:desk|floor)?|rates\s*trading|fx\s*trading|credit\s*trading)\b/i,
  },
  {
    division: "am_wm",
    // asset / wealth / portfolio / fund management
    re: /\b(asset\s*management|wealth\s*management|portfolio\s*management|fund\s*management|investment\s*management)\b/i,
  },
  {
    division: "research",
    // equity research, research analyst
    re: /\b(equity\s*research|research\s*analyst|research\s*division|sell[\s-]*side\s*research|investment\s*research)\b/i,
  },
];

function inferProgramme(text: string): Programme {
  for (const { programme, re } of PROGRAMME_SIGNALS) {
    if (re.test(text)) return programme;
  }
  // summer is the default sink: an explicit summer/internship/penultimate signal AND
  // genuine ambiguity both land here. Summer is the most-demanding safe default.
  return "summer";
}

function inferDivision(text: string): Division {
  for (const { division, re } of DIVISION_SIGNALS) {
    if (re.test(text)) return division;
  }
  return "unknown";
}

/**
 * Infer the programme + division for a role, optionally informed by the question text.
 * Pure and total: never throws; returns `summer`/`unknown` defaults when no signal is found.
 */
export function inferRegister(roleText: string, questionText?: string): Register {
  const combined = `${roleText ?? ""} ${questionText ?? ""}`;
  return {
    programme: inferProgramme(combined),
    division: inferDivision(combined),
  };
}
