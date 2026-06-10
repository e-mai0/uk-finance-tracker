export type DraftKindArg = "ANSWER" | "COVER_LETTER";

export type DraftArgs = {
  kind: DraftKindArg;
  question: string; // for COVER_LETTER: a synthetic "Cover letter for <role> at <employer>"
  employerName?: string;
  employerSlug?: string;
  roleTitle?: string;
  charLimit?: number;
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
  residualTells: string[]; // tells remaining in the final text
  /** True when grounding is thin: story-backed question with no stories selected,
   *  or commercial question with no research. Signals elevated fabrication risk. */
  thinGrounding: boolean;
};

export type DraftResult = { text: string; provenance: Provenance };
