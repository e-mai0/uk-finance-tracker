/**
 * playbook.ts - the SINGLE SOURCE OF TRUTH for UK-finance-applications expertise.
 *
 * Pure module: no I/O, no imports, no side effects. Every surface that needs
 * applications expertise (the chat coach in `ai/brain.ts`, the writing skill in
 * `engine/skills/index.ts`) compiles its prompt FROM the blocks below, so the
 * standards can never drift apart.
 *
 * House style for the wording: British English, no em dashes, tight directive
 * sentences. These are instructions to the model, not prose for a human.
 */

/**
 * FIRM_HOOK - every "why this firm / why this division" must carry a specific,
 * checkable hook. The competitor-swap test is the gate.
 */
export const FIRM_HOOK = `FIRM HOOK (why this firm / why this division):
- Every "why them" claim must carry at least one SPECIFIC, CHECKABLE hook: a named recent deal or transaction, a specific desk, group or programme, a named person you genuinely met (with their title and office), or a specific fund, strategy or research piece.
- NEVER invent a person, meeting, conversation or networking contact. A named-contact hook is valid ONLY when the applicant genuinely met them and it is grounded in the applicant's own materials (their stories, memory or CV). Inventing a contact you did not meet is fabrication and an instant reject.
- Prefer a checkable, non-personal specific (a named deal, a specific desk, group or programme, a fund or strategy, a research piece) over a personal-meeting claim: a non-personal hook does not rest on an unverifiable personal claim and is the safer, stronger choice.
- The competitor-swap test: if a sentence still reads true after you swap in a rival firm's name, it is filler. Cut it.
- Banned filler (fails the swap test): "market leader", "prestigious", "great culture", "smart people", "strong reputation", "exposure to big deals". One precise, sourced reason beats five generic ones.
- Tie the hook back to the applicant: a fact about the firm only counts if it connects to what this applicant wants to do or has done.`;

/**
 * STAR_RULES - competency-answer craft.
 */
export const STAR_RULES = `COMPETENCY ANSWERS (STAR, done properly):
- Use STAR for competency questions, but spend the words on Action and Result. One line of Situation, one line of Task, then the rest on what YOU did and what it changed.
- "I" not "we". At least 60% of the answer is on the applicant's own actions, not the team's.
- ALWAYS quantify the Result: a number, a delta, a time saved, a sum handled, a rank. An unquantified result reads as unfinished.
- Lead straight into the example. Do not restate the question or label the STAR parts out loud.`;

/**
 * COMMERCIAL_AWARENESS - deal / markets answers, register-split IB vs AM.
 */
export const COMMERCIAL_AWARENESS = `COMMERCIAL AWARENESS (deals and markets):
- Skeleton for any deal answer: a one-line overview, then the rationale and synergies, then the financing, then the risks, then YOUR VIEW. Lead with a roughly 100-word version and offer to go deeper.
- Pick a story from within the last six months. Never recite the press release.
- ALWAYS end on a view backed by at least two hard numbers. An answer with no named risk and no view is a fail.
- IB register = deal mechanics: accretion or dilution, synergies, antitrust and execution risk, who pays what and why.
- AM and markets register = a MISPRICING thesis with metrics (P/E, EV/EBITDA, rates, positioning) naming real asset classes, sectors or funds. The question is "what is the market missing", not "why is this company good".`;

/**
 * REGISTER - keyed by programme. Spring weeks differ sharply from summers.
 */
export const REGISTER: {
  spring_week: string;
  summer: string;
  off_cycle: string;
  placement: string;
} = {
  spring_week: `SPRING WEEK (first-years): reward curiosity, motivation, fit and what the applicant wants to LEARN. Do NOT demand technical or commercial depth. The bar is genuine interest and a reason for THIS firm, shown through one concrete thing they did or read, not polish.`,
  summer: `SUMMER INTERNSHIP (penultimate-years): demand a real STAR competency example, technical grounding, commercial depth and polish. This is the most demanding register and the safe default when the programme is unclear. Vague enthusiasm is not enough here.`,
  off_cycle: `OFF-CYCLE: foreground availability, duration and immediate contribution. Say when the applicant can start, for how long, and what they can do from day one. Long-term ambition matters less than fitting a live gap now.`,
  placement: `PLACEMENT (year in industry): foreground commitment, responsibility and a longer tenure. Show the applicant wants to own real work over many months, not sample it.`,
};

/**
 * DIVISION_EMPHASIS - keyed by division. Each names what to foreground and what
 * empty phrase to avoid.
 */
export const DIVISION_EMPHASIS: {
  ibd: string;
  markets: string;
  am_wm: string;
  research: string;
} = {
  ibd: `IBD: foreground long-term advisory relationships, teamwork under pressure and execution sustained over months. Avoid "I love investing" (that is the wrong job).`,
  markets: `MARKETS (sales and trading): foreground real-time decisiveness, a SPECIFIC product view (rates, FX or credit) and a risk/reward framing. Avoid empty "fast-paced" or "markets are always changing"; name a trade and its risk.`,
  am_wm: `ASSET AND WEALTH MANAGEMENT: foreground fundamental research, long horizons, a fiduciary mindset and conviction held through cycles. Avoid short-term hot takes.`,
  research: `RESEARCH: foreground independent, written, defensible views, genuine sector depth and modelling. The output is an argument someone can disagree with on the page.`,
};

/**
 * UK_NORMS - British conventions and the hard mechanical rules.
 */
export const UK_NORMS = `UK NORMS:
- British spelling throughout: analyse, programme, organise, specialise.
- Say "graduate scheme", "internship" or "placement", NEVER "program".
- Use a named contact where it is known; "Dear Sir or Madam" with "Yours faithfully" only when it is not.
- Obey any stated word or character cap EXACTLY. The cap is hard; 70% of it with substance beats 100% with padding.
- Mirror the firm's own language for its divisions and values. Understatement over hype.
- Cover letters run roughly 250 to 400 words.
- A firm's STATED VALUES are stable and may be used when known; specific question WORDINGS are volatile, so never assume a fixed question.`;

/**
 * GRADER_PRINCIPLES - the penalised failure modes a human grader screens for.
 */
export const GRADER_PRINCIPLES = `WHAT GRADERS PENALISE:
- Generic, swappable content that survives the competitor-swap test.
- The wrong firm name left in the answer: an instant reject.
- Typos and not answering the actual question asked.
- Clichés: "detail-oriented", "fast learner", "proven track record".
- Listing firm facts without connecting any of them to the applicant.
- Regurgitated marketing copy from the firm's own website.
- A commercial answer with no named risk and no view.`;

/**
 * coachBlock() - CONDENSED advice-giving voice for the CHAT system prompt.
 * Roughly 150 to 250 words. This is how the coach talks, not the writing rules.
 */
export function coachBlock(): string {
  return `Applications expertise (coach the user to these standards):
- Push specificity over category words. A real "why them" names a recent deal, a specific desk or programme, a person they met or a fund or research piece. Apply the competitor-swap test: if their reason still fits a rival firm, it is filler, so help them replace it. Bin "market leader", "prestigious" and "great culture".
- Know the register. A SPRING WEEK is for first-years and rewards curiosity, motivation and what they want to learn, with no technical depth demanded. A SUMMER internship is for penultimate-years and demands a real STAR example, technical grounding and commercial depth. Off-cycle is about availability now; a placement is about commitment over a longer tenure. Coach to the right one.
- Demand a view in commercial awareness. A deal answer runs overview, rationale, financing, risks and then THEIR view, ending on at least two hard numbers. For markets and asset management it is a mispricing thesis ("what is the market missing"), not "this is a good company". Reject answers with no risk and no view.
- Know the divisions. IBD is long-term advisory relationships and execution; markets wants a specific product view (rates, FX, credit) with risk/reward; asset and wealth management is long-horizon conviction; research is a written, defensible thesis.
- Use the firm's stated values and recent specifics when you know them, and tell the user to look them up when you do not. Obey stated word and character caps exactly.`;
}

/**
 * draftStandards() - the hard WRITING rules for the drafting skill, composed
 * from the blocks above so they are a single source of truth.
 */
export function draftStandards(): string {
  return [
    FIRM_HOOK,
    STAR_RULES,
    COMMERCIAL_AWARENESS,
    UK_NORMS,
    GRADER_PRINCIPLES,
  ].join("\n\n");
}
