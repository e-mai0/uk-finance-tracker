import { describe, expect, it } from "vitest";
import {
  FIRM_HOOK,
  STAR_RULES,
  COMMERCIAL_AWARENESS,
  REGISTER,
  DIVISION_EMPHASIS,
  UK_NORMS,
  GRADER_PRINCIPLES,
  ENGAGEMENT_GUIDANCE,
  coachBlock,
  draftStandards,
} from "@/server/engine/playbook";

const noEmDash = (s: string) => expect(s).not.toContain("—");

describe("playbook FIRM_HOOK", () => {
  it("names the competitor-swap test and bans filler category words", () => {
    expect(FIRM_HOOK.toLowerCase()).toContain("competitor-swap");
    // a specific, checkable hook
    expect(FIRM_HOOK.toLowerCase()).toMatch(/specific|checkable/);
    // bans the named filler phrases
    expect(FIRM_HOOK).toContain("market leader");
    expect(FIRM_HOOK.toLowerCase()).toContain("prestigious");
    noEmDash(FIRM_HOOK);
  });

  it("forbids inventing a person/meeting/contact and grounds a named-contact hook in the applicant's own materials", () => {
    const lc = FIRM_HOOK.toLowerCase();
    // Never invent a person/meeting/conversation/networking contact.
    expect(lc).toMatch(/never invent a (?:person|contact)/);
    expect(lc).toMatch(/person|meeting|conversation|contact/);
    // A named-contact hook is valid only when genuinely met / grounded in the applicant's own materials.
    expect(lc).toMatch(/genuinely met|grounded in the applicant/);
    // Inventing one is fabrication and an instant reject.
    expect(lc).toContain("fabrication");
    expect(lc).toContain("instant reject");
    // Still prefers non-personal checkable specifics.
    expect(lc).toMatch(/non-personal/);
    // The existing competitor-swap test + banned filler are NOT dropped.
    expect(lc).toContain("competitor-swap");
    expect(FIRM_HOOK).toContain("market leader");
    expect(FIRM_HOOK.toLowerCase()).toContain("prestigious");
    expect(FIRM_HOOK).toContain("great culture");
    expect(FIRM_HOOK).toContain("strong reputation");
    noEmDash(FIRM_HOOK);
  });

  it("forbids inventing an EVENT/attendance, not just a person (broadened anti-invention rule)", () => {
    const lc = FIRM_HOOK.toLowerCase();
    // Never claim to have attended an event you did not attend.
    expect(lc).toMatch(/never claim to have attended/);
    // The specific event/experience types are enumerated.
    expect(lc).toMatch(/event|presentation|webinar|careers fair|panel|insight day|open day|coffee chat/);
    // Inventing attendance/a conversation is fabrication and an instant reject.
    expect(lc).toMatch(/attendance|spoken to|met anyone/);
    expect(lc).toContain("fabrication");
    expect(lc).toContain("instant reject");
    noEmDash(FIRM_HOOK);
  });
});

describe("playbook ENGAGEMENT_GUIDANCE", () => {
  it("exists, pivots engagement questions to genuine self-directed research, never invented attendance", () => {
    const lc = ENGAGEMENT_GUIDANCE.toLowerCase();
    expect(ENGAGEMENT_GUIDANCE.length).toBeGreaterThan(200);
    // Targets engagement/"how have you engaged / events or people" questions.
    expect(lc).toMatch(/engage|events or people|learn about/);
    // The strong honest answer is SPECIFIC SELF-DIRECTED RESEARCH, not events/contacts.
    expect(lc).toMatch(/research/);
    // Recruiters do NOT expect prior networking (esp. spring weeks).
    expect(lc).toMatch(/do not expect|not expect.*networking|recruiters/);
    // Never invent attendance/a conversation; mention an event/contact only if real.
    expect(lc).toMatch(/only if real|never invent|genuinely/);
    // The cause-and-effect template: a real grounded action -> what appealed -> connection.
    expect(lc).toMatch(/deal.*read|published research|course|competition|own project|market reading/);
    noEmDash(ENGAGEMENT_GUIDANCE);
  });
});

describe("playbook STAR_RULES", () => {
  it("demands I-voice, quantified result, and Action/Result weighting", () => {
    expect(STAR_RULES).toContain("STAR");
    expect(STAR_RULES.toLowerCase()).toContain("quantif");
    expect(STAR_RULES).toMatch(/"I" not "we"|"I", not "we"/);
    noEmDash(STAR_RULES);
  });
});

describe("playbook COMMERCIAL_AWARENESS", () => {
  it("requires the deal skeleton and ending on a view with hard numbers", () => {
    expect(COMMERCIAL_AWARENESS.toLowerCase()).toContain("skeleton");
    expect(COMMERCIAL_AWARENESS.toLowerCase()).toContain("rationale");
    expect(COMMERCIAL_AWARENESS.toLowerCase()).toContain("financing");
    expect(COMMERCIAL_AWARENESS.toLowerCase()).toContain("risk");
    expect(COMMERCIAL_AWARENESS.toLowerCase()).toContain("view");
    // a mispricing thesis for AM/markets register
    expect(COMMERCIAL_AWARENESS.toLowerCase()).toContain("mispricing");
    noEmDash(COMMERCIAL_AWARENESS);
  });
});

describe("playbook REGISTER", () => {
  it("keys all four programmes", () => {
    expect(Object.keys(REGISTER).sort()).toEqual([
      "off_cycle",
      "placement",
      "spring_week",
      "summer",
    ]);
  });
  it("spring_week rewards curiosity/fit and does NOT demand technical depth, summer does", () => {
    expect(REGISTER.spring_week.toLowerCase()).toMatch(/curiosity|motivation|fit|learn/);
    expect(REGISTER.spring_week.toLowerCase()).not.toContain("technical depth");
    expect(REGISTER.summer.toLowerCase()).toContain("technical");
    expect(REGISTER.summer.toLowerCase()).toMatch(/commercial|competency/);
  });
  it("off_cycle foregrounds availability and placement foregrounds commitment", () => {
    expect(REGISTER.off_cycle.toLowerCase()).toMatch(/availability|duration|immediate/);
    expect(REGISTER.placement.toLowerCase()).toMatch(/commitment|responsibility|tenure/);
  });
});

describe("playbook DIVISION_EMPHASIS", () => {
  it("keys all four divisions", () => {
    expect(Object.keys(DIVISION_EMPHASIS).sort()).toEqual(["am_wm", "ibd", "markets", "research"]);
  });
  it("markets requires a specific product view (rates/FX/credit) and risk/reward", () => {
    expect(DIVISION_EMPHASIS.markets.toLowerCase()).toMatch(/rates|fx|credit/);
    expect(DIVISION_EMPHASIS.markets.toLowerCase()).toMatch(/risk\/reward|risk-reward|risk\b/);
    expect(DIVISION_EMPHASIS.markets.toLowerCase()).toContain("view");
  });
  it("ibd emphasises long-term advisory relationships; am_wm long horizons/fiduciary", () => {
    expect(DIVISION_EMPHASIS.ibd.toLowerCase()).toMatch(/advisory|relationship/);
    expect(DIVISION_EMPHASIS.am_wm.toLowerCase()).toMatch(/fiduciary|long horizon|conviction/);
    expect(DIVISION_EMPHASIS.research.toLowerCase()).toMatch(/written|defensible|sector/);
  });
});

describe("playbook UK_NORMS", () => {
  it("forbids 'program' and mandates British spelling / word caps", () => {
    expect(UK_NORMS.toLowerCase()).toContain("never");
    expect(UK_NORMS).toContain("program");
    expect(UK_NORMS.toLowerCase()).toMatch(/british|programme|analyse/);
    expect(UK_NORMS.toLowerCase()).toMatch(/word|character/);
    noEmDash(UK_NORMS);
  });
});

describe("playbook GRADER_PRINCIPLES", () => {
  it("lists penalised failure modes (wrong firm name, clichés, no view)", () => {
    expect(GRADER_PRINCIPLES.toLowerCase()).toMatch(/wrong firm|firm name/);
    expect(GRADER_PRINCIPLES.toLowerCase()).toMatch(/swappable|generic/);
    noEmDash(GRADER_PRINCIPLES);
  });
});

describe("playbook builders", () => {
  it("coachBlock() is non-empty and carries register + firm-hook coaching", () => {
    const b = coachBlock();
    expect(b.length).toBeGreaterThan(200);
    expect(b.toLowerCase()).toContain("spring");
    expect(b.toLowerCase()).toContain("summer");
    expect(b.toLowerCase()).toMatch(/specific|hook/);
    expect(b.toLowerCase()).toContain("view");
    noEmDash(b);
  });
  it("draftStandards() is non-empty and composes firm-hook + UK norms + grader principles", () => {
    const d = draftStandards();
    expect(d.length).toBeGreaterThan(400);
    expect(d.toLowerCase()).toContain("competitor-swap");
    expect(d).toContain("program"); // from UK_NORMS ban
    expect(d.toLowerCase()).toContain("quantif"); // from STAR_RULES
    noEmDash(d);
  });
});
