export type DraftKindArg = "ANSWER" | "COVER_LETTER";

export type DraftArgs = {
  kind: DraftKindArg;
  question: string; // for COVER_LETTER: a synthetic "Cover letter for <role> at <employer>"
  employerName?: string;
  employerSlug?: string;
  roleTitle?: string;
  charLimit?: number;
  /** Stated word cap for the answer, if the form specifies one (e.g. "max 250 words").
   *  Threaded into the generation prompt so the model obeys it. Distinct from the
   *  hard `charLimit` character cap, which still governs the post-hoc trim. */
  wordLimit?: number;
  /** Story slugs to exclude from selection (e.g. user clicked "Different story"). */
  excludeStories?: string[];
};

export type Story = {
  path: string; // stories/<slug>.md
  slug: string;
  title: string;
  themes: string[];
  employersUsed: { employer: string; date?: string; question_kind?: string }[];
  strengthSignal: string | null;
  failureSignal: string | null;
  timeline: string;
  rawNotes: string;
  finalVersions: string;
};

export type VoiceProfile = {
  bannedTells: string[];
  traits: string[]; // raw lines from Observed traits
  exemplars: string; // raw Exemplars section text
};

export type DraftContext = {
  profile: {
    name: string | null;
    university: string | null;
    degree: string | null;
    graduationYear: number | null;
    skills: string[];
    cvText: string | null;
    workAuthStatement: string | null;
  };
  voice: VoiceProfile;
  stories: Story[];
  companyNotes: string | null; // user's companies/<slug>.md content
  research: string | null; // shared EmployerResearch content
  pastAnswers: { question: string; excerpt: string }[];
};

export type Provenance = {
  storiesUsed: string[]; // slugs
  researchUsed: boolean;
  pastAnswersUsed: number;
  checksFailed: string[]; // tells found in the first draft
  revised: boolean;
  questionKind: string;
  /** The model id that produced the draft. */
  model: string;
  residualTells: string[]; // tells remaining in the final text
  /** True when grounding is thin: story-backed question with no stories selected,
   *  or a why-firm/commercial question with no concrete firm hook available.
   *  Signals elevated fabrication risk; the draft DISCLOSES rather than invents. */
  thinGrounding: boolean;
  /** Inferred application programme register (from role/question text, not the tracker column). */
  register: "spring_week" | "summer" | "off_cycle" | "placement";
  /** Inferred division emphasis (from role/question text). */
  division: "ibd" | "markets" | "am_wm" | "research" | "unknown";
  /** The stated word cap threaded into generation, if any (null when none was supplied). */
  wordCap: number | null;
  /** True when this question demands a specific, checkable firm hook (why-firm / commercial). */
  firmHookExpected: boolean;
  /** True when a firm hook was expected but grounding was too thin to supply one, so the
   *  draft was instructed to DISCLOSE the gap rather than fabricate a hook. */
  firmHookDisclosed: boolean;
  /** The quality-grader verdict for the delivered draft (U3). Null only if the grader
   *  was skipped entirely (e.g. its LLM call threw — see `gradeResult.skipped`). */
  gradeResult: GradeResult;
};

/** One playbook-rubric criterion verdict from the quality grader. */
export type GradeCriterion = {
  /** Stable criterion key, e.g. "firm-hook", "quantified-result", "i-voice". */
  name: string;
  /** True when the draft satisfies this criterion. */
  pass: boolean;
  /** When `pass` is false: a short, targeted instruction for how to fix it. */
  fix?: string;
};

/** Structured quality-grader verdict against the playbook-derived rubric (U3). */
export type GradeResult = {
  criteria: GradeCriterion[];
  /** True when every applicable criterion passed. */
  passed: boolean;
  /** Number of grade→revise attempts taken (0 = passed first grade; capped at 2). */
  attempts: number;
  /** True when the grader LLM call threw and the pre-grader draft was returned unchanged. */
  skipped: boolean;
};

/** Context the grader needs to select and apply the right rubric criteria. */
export type GradeContext = {
  question: string;
  questionKind: string;
  register: Provenance["register"];
  division: Provenance["division"];
  firmName?: string;
  wordCap: number | null;
  /** When true (thin grounding), grade honest disclosure instead of penalising a missing hook. */
  firmHookDisclosed: boolean;
  /** True when this question demands a specific, checkable firm hook (why-firm / commercial). */
  firmHookExpected: boolean;
};

export type DraftResult = { text: string; provenance: Provenance };
