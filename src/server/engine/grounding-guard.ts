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
  // sit-down / catch-up / coffee phrasings (review recall fix): these read as a real
  // in-person meeting just like "met with", so an ungrounded one must flag.
  { re: /\bsat\s+down\s+with\b/i, label: "sat down with" },
  { re: /\bcaught\s+up\s+with\b/i, label: "caught up with" },
  { re: /\bgrabbed\s+coffee\s+with\b/i, label: "grabbed coffee with" },
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
  { re: /\binsight\s+event\b/i, label: "insight event" },
  { re: /\binsight\s+evening\b/i, label: "insight evening" },
  { re: /\binsight\s+session\b/i, label: "insight session" },
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

/**
 * Hypothetical / comparative / conditional / negational discriminators. An event noun or
 * participation verb inside one of these is NOT a claim of having attended — it is a
 * counterfactual ("...more than any careers fair would have", "if I had attended an insight
 * day", "rather than a networking event"). Kept deliberately narrow and conservative so a
 * real "I attended a careers fair" still flags.
 */
const HYPOTHETICAL: RegExp[] = [
  /\bthan\s+any\b/i,
  /\bwould\s+have\b/i,
  /\bif\s+I\s+had\b/i,
  /\bif\s+we\s+had\b/i,
  /\brather\s+than\b/i,
  /\binstead\s+of\b/i,
];

/**
 * Sentence-opener / function words that are capitalised only because they begin a sentence
 * (or are too short to be a meaningful entity). These must NEVER be treated as grounding
 * proper nouns: e.g. the opener "At" must not ground a claim by matching "at" in the corpus.
 */
const OPENER_OR_SHORT = new Set([
  "i", "we", "my", "our", "at", "in", "on", "to", "as", "of", "during", "later",
  "then", "the", "this", "that", "after", "before", "and", "but", "so", "if",
  "a", "an", "he", "she", "they", "it",
]);

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

/** Escape a phrase for safe use as a literal inside a RegExp (whitespace stays flexible). */
function escapeForCorpus(phrase: string): string {
  return normalize(phrase)
    .split(" ")
    .map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    .join("\\s+");
}

/**
 * WORD-BOUNDARY corpus presence test. Replaces the old `normCorpus.includes(...)` substring
 * check, which silently grounded a claim when a short token (e.g. the opener "At") matched
 * inside an unrelated word ("penultim-AT-e"). A phrase is "present" only when it appears as a
 * whole word / phrase, bounded by non-word characters. Tokens shorter than 3 chars (or that
 * are sentence-opener function words) are never treated as grounding tokens and return false.
 */
function corpusHas(normCorpus: string, phrase: string): boolean {
  const norm = normalize(phrase);
  if (!norm) return false;
  // A single short / function-word token can never ground a claim.
  if (!norm.includes(" ") && (norm.length < 3 || OPENER_OR_SHORT.has(norm))) return false;
  const re = new RegExp(`(?<![\\w])${escapeForCorpus(phrase)}(?![\\w])`, "i");
  return re.test(normCorpus);
}

/**
 * GENERIC single-word event nouns whose presence in the corpus must NOT, on its own, ground
 * an event claim (they appear everywhere: "talk", "fair", "panel"). Grounding such an event
 * still requires the specific actor/organisation behind it (a "<Proper> <eventNoun>" combo).
 * The distinctive MULTI-WORD labels ("spring week", "insight day", "careers fair") may ground
 * on their own, because their bare appearance in the corpus is itself strong evidence.
 */
const GENERIC_EVENT_LABELS = new Set(["panel", "conference", "presentation", "talk", "fair", "webinar"]);

/** Capitalised proper-noun runs in a sentence, with openers/short tokens stripped out. */
function properRuns(sentence: string): string[] {
  const raw = sentence.match(/\b[A-Z][a-zA-Z]+(?:\s+[A-Z][a-zA-Z]+)*\b/g) ?? [];
  const out: string[] = [];
  for (const run of raw) {
    // Drop leading opener/function words from the run (e.g. "At Warwick" -> "Warwick",
    // "During BlackRock" -> "BlackRock"), then keep what remains if it is a real entity.
    const words = run.split(/\s+/);
    while (words.length && OPENER_OR_SHORT.has(words[0].toLowerCase())) words.shift();
    const cleaned = words.join(" ").trim();
    if (!cleaned) continue;
    // A single residual token must be >= 3 chars and not an opener to count as an entity.
    if (!cleaned.includes(" ") && (cleaned.length < 3 || OPENER_OR_SHORT.has(cleaned.toLowerCase()))) continue;
    out.push(cleaned);
  }
  return out;
}

/** Recognised event-noun labels present in the sentence. */
function eventLabelsIn(sentence: string): string[] {
  const out: string[] = [];
  for (const { label } of EVENT_NOUNS) {
    if (new RegExp(`\\b${label.replace(/\s+/g, "\\s+")}\\b`, "i").test(sentence)) out.push(label);
  }
  return out;
}

/**
 * The entity-present short-circuit, refined so grounding matches the EVENT or the PERSON, not
 * merely any grounded proper noun that happens to share the sentence (the core review hole).
 *
 * EVENT claim (an event noun is named): grounded ONLY if the EVENT itself is in the corpus —
 *   a "<Proper> <eventNoun>" combination (e.g. "BlackRock spring week"), or the distinctive
 *   multi-word event label on its own ("spring week"). A bare GENERIC event word ("panel")
 *   never grounds, and an unrelated grounded proper noun ("Citi", "Warwick") never grounds the
 *   event. So "I attended Citi's insight event at Warwick" stays FLAGGED when no Citi insight
 *   event is in the materials, while "my BlackRock spring week" is grounded.
 *
 * PERSON / generic claim (no event noun): grounded when the named person/org proper-noun run
 *   appears in the corpus (a real "James Lin" / "BlackRock"). Word-boundary matched, with
 *   sentence-openers and sub-3-char tokens excluded so "At" can never ground via "penultimate".
 */
function isGrounded(sentence: string, normCorpus: string): { grounded: boolean; entity?: string } {
  const events = eventLabelsIn(sentence);
  const proper = properRuns(sentence);

  if (events.length > 0) {
    // EVENT grounding: require the event phrase itself, never a stray proper noun.
    for (const ev of events) {
      // 1) "<Proper> <eventNoun>" combination (e.g. "BlackRock spring week", "Citi insight event").
      for (const p of proper) {
        const combo = `${p} ${ev}`;
        if (corpusHas(normCorpus, combo)) return { grounded: true, entity: combo };
      }
      // 2) Distinctive multi-word event label on its own (e.g. "spring week", "careers fair").
      if (ev.includes(" ") && !GENERIC_EVENT_LABELS.has(ev) && corpusHas(normCorpus, ev)) {
        return { grounded: true, entity: ev };
      }
    }
    const primary = proper[0] ? `${proper[0]} ${events[0]}` : events[0];
    return { grounded: false, entity: primary };
  }

  // PERSON / generic claim: ground on the named person/org if present in the corpus.
  for (const p of proper) {
    if (corpusHas(normCorpus, p)) return { grounded: true, entity: p };
  }
  return { grounded: false, entity: proper[0] };
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

    // Hypothetical / comparative / conditional phrasing is a counterfactual, not a claim of
    // attendance ("...more than any careers fair would have", "if I had attended an insight
    // day"). Skip these. Deliberately narrow so a real "I attended a careers fair" still flags.
    if (HYPOTHETICAL.some((re) => re.test(sentence))) continue;

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
