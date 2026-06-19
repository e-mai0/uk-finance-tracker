/**
 * grounding-guard.ts - the deterministic, ZERO-LLM anti-fabrication detector.
 *
 * Pure module: no I/O, no imports, no side effects, no network. It is the only NEW
 * compute the grounding gate adds (the grader + revise it feeds are existing LLM
 * calls). It exists because PR #52's prompt-only "never invent a named contact"
 * wording did NOT stop the draft engine from fabricating first-person EXPERIENCES
 * the applicant never had (invented events, conversations and meetings, most often
 * on networking/engagement questions). A pure detector at the gate is a far stronger
 * lever than prose buried in the system prompt.
 *
 * `findUngroundedClaims` flags a sentence ONLY when it is BOTH:
 *   (1) a first-person EXPERIENTIAL claim by pattern (a participation / communication /
 *       perception verb, or an event noun, with a first-person subject), AND
 *   (2) its key ENTITY/EVENT noun is ABSENT from the grounding corpus.
 * This precision-first design protects genuine grounded experiences (e.g. a real
 * "BlackRock spring week" when "BlackRock" is in the corpus) via the entity-present
 * short-circuit, and never flags reportative/informational phrasing ("I read that…",
 * "according to their website…").
 *
 * House style for any wording surfaced to the model elsewhere: British English, no
 * em dashes.
 */

/** One flagged first-person experiential claim that is not grounded in the corpus. */
export type UngroundedClaim = {
  /** The offending sentence, trimmed. */
  sentence: string;
  /** Why it was flagged: the participation/communication/perception verb or event noun. */
  trigger: string;
  /** The key entity/event noun checked against (and absent from) the corpus, if any. */
  entity?: string;
};

/** First-person subject pronouns/determiners that mark an experiential claim's owner. */
const FIRST_PERSON = /\b(?:I|we|my|our|me)\b/i;

/**
 * Reportative / informational discriminators. When a sentence carries any of these it
 * is reporting what the applicant READ, LEARNED, HEARD-THAT or what a SOURCE STATES,
 * not claiming a lived experience, so it is never flagged. The key discriminator is a
 * reading/learning source or a that/wh-clause ("I saw that…" allowed; "I saw the
 * recruiter" is a claim).
 */
const REPORTATIVE: RegExp[] = [
  /\bI\s+read\b(?:\s+(?:that|about))?/i,
  /\bI\s+have\s+read\b/i,
  /\bhaving\s+read\b/i,
  /\bI\s+learned\b(?:\s+(?:that|from))?/i,
  /\bI\s+have\s+learned\b/i,
  /\bI\s+(?:have\s+)?heard\s+that\b/i,
  /\bI\s+saw\s+that\b/i,
  /\bI\s+(?:have\s+)?read\b/i,
  /\baccording\s+to\b/i,
  /\b(?:their|the)\s+website\s+(?:states|says)\b/i,
  /\bthe\s+report\s+(?:says|states)\b/i,
  /\bfrom\s+following\b/i,
  /\bas\s+stated\b/i,
  /\bI\s+have\s+been\s+following\b/i,
];

/**
 * Experiential trigger patterns. Each entry pairs a regex (which must co-occur with a
 * first-person subject) with a short human-readable trigger label. Ordering does not
 * matter; the first match supplies the reported `trigger`.
 *
 * Categories:
 *  - participation verbs (attended, went to, joined, took part in, …)
 *  - communication/social verbs (spoke to/with, met, networked with, coffee chat, …)
 *  - experiential perception (shadowed, watched a talk, observed in person, heard a speaker)
 */
const EXPERIENTIAL_VERBS: { re: RegExp; label: string }[] = [
  // participation
  { re: /\battended\b/i, label: "attended" },
  { re: /\bwent\s+to\b/i, label: "went to" },
  { re: /\bjoined\b/i, label: "joined" },
  { re: /\btook\s+part\s+in\b/i, label: "took part in" },
  { re: /\bparticipated\s+in\b/i, label: "participated in" },
  { re: /\bsat\s+in\s+on\b/i, label: "sat in on" },
  { re: /\bsigned\s+up\s+for\b/i, label: "signed up for" },
  { re: /\bwas\s+at\b/i, label: "was at" },
  // communication / social
  { re: /\bspoke\s+(?:to|with)\b/i, label: "spoke to/with" },
  { re: /\btalked\s+(?:to|with)\b/i, label: "talked to/with" },
  { re: /\bmet\s+(?:with\s+)?\b/i, label: "met (with)" },
  { re: /\bnetworked\s+with\b/i, label: "networked with" },
  { re: /\breached\s+out\s+to\b/i, label: "reached out to" },
  { re: /\bconnected\s+with\b/i, label: "connected with" },
  { re: /\bchatted\s+with\b/i, label: "chatted with" },
  { re: /\bhad\s+a\s+(?:call|meeting|coffee\s+chat|conversation|chat)\s+with\b/i, label: "had a call/meeting/chat with" },
  { re: /\bcoffee\s+chat\b/i, label: "coffee chat" },
  { re: /\bemailed\b/i, label: "emailed" },
  { re: /\bmessaged\b/i, label: "messaged" },
  // experiential perception
  { re: /\bshadowed\b/i, label: "shadowed" },
  { re: /\bwatched\s+(?:a\s+)?(?:talk|presentation)\b/i, label: "watched a talk/presentation" },
  { re: /\bobserved\s+in\s+person\b/i, label: "observed in person" },
  { re: /\bheard\s+(?:a\s+)?speaker\b/i, label: "heard a speaker" },
  { re: /\bsaw\s+(?:the|a|an)\b/i, label: "saw (a person/thing)" },
];

/**
 * Event nouns. A first-person sentence that names one of these (alongside a first-person
 * subject) is treated as an experiential claim even without an explicit verb above, since
 * naming the event implies attendance ("our coffee chat", "the panel I was on"). These
 * also serve as the entity-event nouns extracted for the corpus-presence check.
 */
const EVENT_NOUNS: { re: RegExp; label: string }[] = [
  { re: /\binsight\s+day\b/i, label: "insight day" },
  { re: /\bopen\s+day\b/i, label: "open day" },
  { re: /\bspring\s+week\b/i, label: "spring week" },
  { re: /\bnetworking\s+event\b/i, label: "networking event" },
  { re: /\bcoffee\s+chat\b/i, label: "coffee chat" },
  { re: /\bcareers?\s+fair\b/i, label: "careers fair" },
  { re: /\bwebinar\b/i, label: "webinar" },
  { re: /\bpanel\b/i, label: "panel" },
  { re: /\bconference\b/i, label: "conference" },
  { re: /\bpresentation\b/i, label: "presentation" },
  { re: /\btalk\b/i, label: "talk" },
  { re: /\bfair\b/i, label: "fair" },
];

/** Split text into sentences, keeping each trimmed and non-empty. */
function splitSentences(text: string): string[] {
  return text
    .split(/(?<=[.?!])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Normalise text for case-insensitive, whitespace-collapsed corpus matching. */
function normalize(s: string): string {
  return s.toLowerCase().replace(/\s+/g, " ").trim();
}

/**
 * Extract the key entity/event tokens to check against the corpus for a flagged
 * sentence: any matched event noun, plus capitalised proper-noun runs (e.g. "Citi",
 * "Goldman Sachs", "James Lin", "BlackRock"). Sentence-initial single capitalised words
 * are included too; that is safe because a sentence is only consulted here AFTER it has
 * been flagged experiential, and a false "present in corpus" only ever DROPS a flag,
 * which is the precision-safe direction.
 */
function extractEntities(sentence: string): { phrases: string[]; primary?: string } {
  const phrases: string[] = [];

  // Event nouns present in the sentence.
  for (const { label } of EVENT_NOUNS) {
    if (new RegExp(`\\b${label.replace(/\s+/g, "\\s+")}\\b`, "i").test(sentence)) {
      phrases.push(label);
    }
  }

  // Proper-noun runs: one or more capitalised words in a row.
  const proper = sentence.match(/\b[A-Z][a-zA-Z]+(?:\s+[A-Z][a-zA-Z]+)*\b/g) ?? [];
  for (const p of proper) phrases.push(p);

  // The primary entity for reporting: prefer a "<Proper> <eventNoun>" combination
  // (e.g. "BlackRock spring week", "Citi careers panel") when both are present.
  const eventLabel = EVENT_NOUNS.find(({ label }) =>
    new RegExp(`\\b${label.replace(/\s+/g, "\\s+")}\\b`, "i").test(sentence),
  )?.label;
  const firstProper = proper[0];
  let primary: string | undefined;
  if (firstProper && eventLabel) primary = `${firstProper} ${eventLabel}`;
  else primary = firstProper ?? eventLabel;

  return { phrases, primary };
}

/**
 * The entity-present short-circuit. A flagged sentence is GROUNDED (and therefore
 * dropped) when its key entity/event appears in the corpus. We check, in order:
 *  - the full "<Proper> <eventNoun>" combination (e.g. "BlackRock spring week"); then
 *  - each proper-noun run on its own (a real "BlackRock" / "James Lin" in the corpus);
 * An event noun ALONE (e.g. "panel") is deliberately NOT treated as grounding, because
 * generic event words appear everywhere and would punch holes in the gate; grounding
 * requires the specific actor/organisation behind the experience.
 */
function isGrounded(sentence: string, normCorpus: string): { grounded: boolean; entity?: string } {
  const { primary } = extractEntities(sentence);

  // Full proper+event combination.
  if (primary && primary.includes(" ") && normCorpus.includes(normalize(primary))) {
    return { grounded: true, entity: primary };
  }

  // Each proper-noun run individually.
  const proper = sentence.match(/\b[A-Z][a-zA-Z]+(?:\s+[A-Z][a-zA-Z]+)*\b/g) ?? [];
  for (const p of proper) {
    // Skip a sentence-initial first-person "I" / generic openers that are not entities.
    if (/^(?:I|We|My|Our|During|Later|Then|The|This|After|Before)$/i.test(p)) continue;
    if (normCorpus.includes(normalize(p))) return { grounded: true, entity: p };
  }

  return { grounded: false, entity: primary };
}

/**
 * findUngroundedClaims - PURE detector (no I/O).
 *
 * @param draftText        the generated draft to screen.
 * @param groundingCorpus  the applicant's own grounding material concatenated (CV text
 *                         + stories + memory facts + employer research). Verify against
 *                         the FULL corpus: false positives come from missing evidence,
 *                         so pass everything.
 * @returns one entry per first-person experiential claim whose entity/event is absent
 *          from the corpus. Reportative sentences and grounded entities are never
 *          returned.
 */
export function findUngroundedClaims(
  draftText: string,
  groundingCorpus: string,
): UngroundedClaim[] {
  const normCorpus = normalize(groundingCorpus);
  const out: UngroundedClaim[] = [];

  for (const sentence of splitSentences(draftText)) {
    // Must have a first-person subject to be a first-person experiential claim.
    if (!FIRST_PERSON.test(sentence)) continue;

    // Reportative/informational phrasing is never a lived-experience claim.
    if (REPORTATIVE.some((re) => re.test(sentence))) continue;

    // Experiential by pattern: a verb above, OR an event noun named in a first-person
    // sentence (naming an event implies attendance).
    const verbHit = EXPERIENTIAL_VERBS.find(({ re }) => re.test(sentence));
    const eventHit = EVENT_NOUNS.find(({ re }) => re.test(sentence));
    if (!verbHit && !eventHit) continue;

    // Entity-present short-circuit: a grounded entity/event protects a real experience.
    const { grounded, entity } = isGrounded(sentence, normCorpus);
    if (grounded) continue;

    out.push({
      sentence,
      trigger: verbHit?.label ?? eventHit?.label ?? "experiential claim",
      ...(entity ? { entity } : {}),
    });
  }

  return out;
}
