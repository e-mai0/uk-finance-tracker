import { describe, expect, it } from "vitest";
import { findUngroundedClaims } from "@/server/engine/grounding-guard";

/**
 * The HEART of the anti-fabrication gate: a PURE (zero-LLM) detector that flags
 * first-person EXPERIENTIAL claims (attending an event, speaking to/meeting a
 * person, a conversation) whose key entity/event is ABSENT from the grounding
 * corpus, while NOT flagging:
 *   - reportative/informational phrasing ("I read that...", "according to...");
 *   - GROUNDED experiences whose entity IS present in the corpus (precision).
 */

// A corpus that contains NONE of the fabricated entities below.
const EMPTY_CORPUS = "Economics degree at LSE. Treasurer of the rowing club. Built a budget model in Excel.";

describe("findUngroundedClaims - flags fabricated first-person experiences", () => {
  it("flags 'I attended a Citi careers panel' when absent from corpus", () => {
    const claims = findUngroundedClaims("I attended a Citi careers panel last autumn.", EMPTY_CORPUS);
    expect(claims).toHaveLength(1);
    expect(claims[0].sentence).toContain("attended a Citi careers panel");
  });

  it("flags 'I spoke with a markets professional' when absent from corpus", () => {
    const claims = findUngroundedClaims("I spoke with a markets professional about the rates desk.", EMPTY_CORPUS);
    expect(claims).toHaveLength(1);
    expect(claims[0].sentence).toContain("spoke with a markets professional");
  });

  it("flags 'I had a coffee chat with someone on the rates desk' when absent", () => {
    const claims = findUngroundedClaims("I had a coffee chat with someone on the rates desk.", EMPTY_CORPUS);
    expect(claims).toHaveLength(1);
    expect(claims[0].sentence).toContain("coffee chat");
  });

  it("flags a webinar/insight-day attendance claim (event nouns + first-person verb)", () => {
    const claims = findUngroundedClaims("I joined their insight day and went to a networking event.", EMPTY_CORPUS);
    expect(claims.length).toBeGreaterThanOrEqual(1);
    expect(claims[0].sentence.toLowerCase()).toMatch(/insight day|networking event/);
  });

  it("flags 'we met with a recruiter' (we/our first-person subject)", () => {
    const claims = findUngroundedClaims("We met with a recruiter from the firm.", EMPTY_CORPUS);
    expect(claims).toHaveLength(1);
  });

  it("flags novel phrasing: 'I reached out to an analyst and connected with him'", () => {
    const claims = findUngroundedClaims("I reached out to an analyst and connected with him on LinkedIn.", EMPTY_CORPUS);
    expect(claims).toHaveLength(1);
  });

  it("flags 'I shadowed a trader for a morning' (experiential perception verb)", () => {
    const claims = findUngroundedClaims("I shadowed a trader for a morning.", EMPTY_CORPUS);
    expect(claims).toHaveLength(1);
  });

  it("returns the offending sentence(s) across multiple sentences, leaving clean ones out", () => {
    const text =
      "My degree taught me to model cash flows. I attended a Goldman careers panel. I enjoy fixed income.";
    const claims = findUngroundedClaims(text, EMPTY_CORPUS);
    expect(claims).toHaveLength(1);
    expect(claims[0].sentence).toContain("Goldman careers panel");
  });

  it("flags multiple distinct fabricated experiences in one draft", () => {
    const text =
      "I attended a Citi spring presentation. Later I spoke to an analyst on the credit desk.";
    const claims = findUngroundedClaims(text, EMPTY_CORPUS);
    expect(claims).toHaveLength(2);
  });
});

describe("findUngroundedClaims - does NOT flag reportative/informational phrasing", () => {
  it("does not flag 'I read about Citi's role advising on the X deal'", () => {
    expect(findUngroundedClaims("I read about Citi's role advising on the X deal.", EMPTY_CORPUS)).toEqual([]);
  });

  it("does not flag 'according to their website, the programme runs for ten weeks'", () => {
    expect(
      findUngroundedClaims("According to their website, the programme runs for ten weeks.", EMPTY_CORPUS),
    ).toEqual([]);
  });

  it("does not flag 'I have been following their research on emerging markets'", () => {
    expect(
      findUngroundedClaims("I have been following their research on emerging markets.", EMPTY_CORPUS),
    ).toEqual([]);
  });

  it("does not flag 'I saw that the deadline is Friday' (reportative that-clause)", () => {
    expect(findUngroundedClaims("I saw that the deadline is Friday.", EMPTY_CORPUS)).toEqual([]);
  });

  it("does not flag 'I learned that the firm advised on a landmark merger'", () => {
    expect(
      findUngroundedClaims("I learned that the firm advised on a landmark merger.", EMPTY_CORPUS),
    ).toEqual([]);
  });

  it("does not flag 'Having read their annual report, I admire their discipline'", () => {
    expect(
      findUngroundedClaims("Having read their annual report, I admire their discipline.", EMPTY_CORPUS),
    ).toEqual([]);
  });

  it("does not flag 'I heard that rates are expected to fall' (reportative heard-that)", () => {
    expect(findUngroundedClaims("I heard that rates are expected to fall.", EMPTY_CORPUS)).toEqual([]);
  });

  // The key discriminator: "I saw that X" (allowed) vs "I saw the recruiter" (claim).
  it("flags 'I saw the recruiter at the fair' but not 'I saw that the fair was useful'", () => {
    expect(findUngroundedClaims("I saw the recruiter at the fair.", EMPTY_CORPUS)).toHaveLength(1);
    expect(findUngroundedClaims("I saw that the fair was useful.", EMPTY_CORPUS)).toEqual([]);
  });
});

describe("findUngroundedClaims - entity-present short-circuit (PRECISION, mandatory)", () => {
  // A genuinely grounded experience: the corpus DOES contain "BlackRock spring week".
  const GROUNDED_CORPUS =
    "Eric did a BlackRock spring week in 2024, working with the index team. Treasurer of the rowing club.";

  it("does NOT flag 'during my BlackRock spring week I shadowed the index team' (entity present)", () => {
    const claims = findUngroundedClaims(
      "During my BlackRock spring week I shadowed the index team.",
      GROUNDED_CORPUS,
    );
    expect(claims).toEqual([]);
  });

  it("does NOT flag a grounded conversation when the person/desk is in the corpus", () => {
    const corpus = "I spoke to James Lin, a VP on the rates desk, during my internship at HSBC.";
    const claims = findUngroundedClaims("I spoke to James Lin on the rates desk about gilts.", corpus);
    expect(claims).toEqual([]);
  });

  it("still flags an UNGROUNDED event even when a DIFFERENT grounded event is in the corpus", () => {
    const corpus = "Eric did a BlackRock spring week in 2024.";
    // Citi panel is NOT in the corpus, so it must still be flagged.
    const claims = findUngroundedClaims("I attended a Citi careers panel.", corpus);
    expect(claims).toHaveLength(1);
    expect(claims[0].sentence).toContain("Citi careers panel");
  });

  it("matches the grounded entity case-insensitively", () => {
    const corpus = "eric attended a barclays spring week.";
    const claims = findUngroundedClaims("During my Barclays Spring Week I met the team.", corpus);
    expect(claims).toEqual([]);
  });
});

describe("findUngroundedClaims - event/person grounding (precision hole #1)", () => {
  // The core hole: a fabricated EVENT must not ground itself by name-dropping a
  // grounded proper noun. Grounding requires the EVENT (or PERSON) itself to be present.

  it("FLAGS 'I attended Citi's insight event at Warwick' when Citi+Warwick are in corpus but no Citi insight event is", () => {
    // Corpus mentions Citi and Warwick, but NOT a Citi insight event.
    const corpus = "I study at Warwick. I have read about Citi's markets division and its recent gilt mandate.";
    const claims = findUngroundedClaims("I attended Citi's insight event at Warwick.", corpus);
    expect(claims).toHaveLength(1);
    expect(claims[0].sentence).toContain("insight event");
  });

  it("FLAGS 'At your spring insight evening I spoke to several bankers' (event not in corpus)", () => {
    const corpus = "Economics at LSE. I have read about the firm's research.";
    const claims = findUngroundedClaims("At your spring insight evening I spoke to several bankers.", corpus);
    expect(claims).toHaveLength(1);
  });

  it("does NOT flag 'During my BlackRock spring week I shadowed the index team' (event phrase grounded) — MANDATORY", () => {
    const corpus = "Eric did a BlackRock spring week in 2024, working with the index team.";
    const claims = findUngroundedClaims("During my BlackRock spring week I shadowed the index team.", corpus);
    expect(claims).toEqual([]);
  });

  it("grounds a PERSON-interaction claim only when the named person is in the corpus", () => {
    const corpus = "I spoke to James Lin, a VP on the rates desk, during my internship.";
    expect(findUngroundedClaims("I spoke to James Lin about gilts.", corpus)).toEqual([]);
    // A different, ungrounded person is still flagged even though "James Lin" is in corpus.
    expect(findUngroundedClaims("I spoke to Sarah Wong about gilts.", corpus)).toHaveLength(1);
  });
});

describe("findUngroundedClaims - word-boundary matching (substring bug #2)", () => {
  it("does NOT let the opener 'At' ground a claim by matching inside 'penultimate'", () => {
    // "At" appears as a substring of "penultim-AT-e" in the corpus; word-boundary matching
    // must NOT treat that as grounding the sentence.
    const corpus = "I am a penultimate-year economics student at LSE.";
    const claims = findUngroundedClaims("At your spring insight evening I spoke to several bankers.", corpus);
    expect(claims).toHaveLength(1);
  });

  it("skips short proper-noun runs and sentence-opener function words as grounding tokens", () => {
    // "On" / "In" / "As" must not ground a claim by substring-matching common corpus words.
    const corpus = "Online research into the firm. Insight into markets. Associate programme overview.";
    expect(findUngroundedClaims("On their open day I met a recruiter.", corpus)).toHaveLength(1);
  });
});

describe("findUngroundedClaims - additional experiential triggers (recall #3)", () => {
  it("FLAGS 'I sat down with an analyst' when ungrounded", () => {
    expect(findUngroundedClaims("I sat down with an analyst from the desk.", EMPTY_CORPUS)).toHaveLength(1);
  });

  it("FLAGS 'I caught up with someone from the desk' when ungrounded", () => {
    expect(findUngroundedClaims("I caught up with someone from the desk.", EMPTY_CORPUS)).toHaveLength(1);
  });

  it("FLAGS 'I grabbed coffee with a trader' when ungrounded", () => {
    expect(findUngroundedClaims("I grabbed coffee with a trader.", EMPTY_CORPUS)).toHaveLength(1);
  });
});

describe("findUngroundedClaims - hypothetical/negational guard (false positive #4)", () => {
  it("does NOT flag a hypothetical comparison '...more than any careers-fair conversation would have'", () => {
    const text =
      "Reading their annual report taught me more than any careers-fair conversation would have.";
    expect(findUngroundedClaims(text, EMPTY_CORPUS)).toEqual([]);
  });

  it("still FLAGS a real ungrounded attendance 'I attended a careers fair'", () => {
    expect(findUngroundedClaims("I attended a careers fair last term.", EMPTY_CORPUS)).toHaveLength(1);
  });

  it("does NOT flag a conditional 'if I had attended an insight day'", () => {
    expect(findUngroundedClaims("If I had attended an insight day, I would understand the rotation.", EMPTY_CORPUS)).toEqual([]);
  });
});

describe("findUngroundedClaims - edge cases", () => {
  it("returns an empty array for an empty draft", () => {
    expect(findUngroundedClaims("", EMPTY_CORPUS)).toEqual([]);
  });

  it("does not flag a non-experiential first-person sentence", () => {
    expect(findUngroundedClaims("I am a final-year economics student.", EMPTY_CORPUS)).toEqual([]);
  });

  it("does not flag a third-person experiential sentence (no first-person subject)", () => {
    expect(findUngroundedClaims("The firm hosted a careers panel last year.", EMPTY_CORPUS)).toEqual([]);
  });

  it("each returned claim carries a trigger describing why it was flagged", () => {
    const claims = findUngroundedClaims("I attended a Citi careers panel.", EMPTY_CORPUS);
    expect(claims[0].trigger).toBeTruthy();
    expect(typeof claims[0].trigger).toBe("string");
  });
});
