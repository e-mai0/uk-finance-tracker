import "server-only";
import Anthropic from "@anthropic-ai/sdk";

/**
 * Server-only LLM helpers for the apply copilot. The API key never leaves the
 * server (this file is `server-only`). Every prompt is grounded in the user's
 * own profile + CV and tuned per employer — deliberately NOT boilerplate, which
 * is exactly what ATS bot-detection flags.
 */

const HAIKU = "claude-haiku-4-5";
const SONNET = "claude-sonnet-4-6";

let _client: Anthropic | null = null;
function client(): Anthropic {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error("ANTHROPIC_API_KEY is not set.");
  _client ??= new Anthropic({ apiKey: key });
  return _client;
}

export function aiConfigured(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

export interface ApplicantContext {
  name?: string | null;
  university?: string | null;
  degreeSubject?: string | null;
  degreeType?: string | null;
  graduationYear?: number | null;
  skills?: string[];
  cvText?: string | null;
  workAuthStatement?: string | null;
  sponsorshipStatement?: string | null;
}

function applicantBlock(a: ApplicantContext): string {
  const lines: string[] = [];
  if (a.name) lines.push(`Name: ${a.name}`);
  if (a.university) lines.push(`University: ${a.university}`);
  if (a.degreeSubject)
    lines.push(`Degree: ${a.degreeType ?? ""} ${a.degreeSubject}`.trim());
  if (a.graduationYear) lines.push(`Graduates: ${a.graduationYear}`);
  if (a.skills?.length) lines.push(`Skills: ${a.skills.join(", ")}`);
  if (a.workAuthStatement) lines.push(`Work authorisation: ${a.workAuthStatement}`);
  if (a.cvText) lines.push(`\nCV:\n${a.cvText}`);
  return lines.join("\n") || "(no profile details provided)";
}

const STYLE = [
  "Write in the first person as the applicant.",
  "Use British English and a professional, specific tone suited to UK finance recruiting.",
  "Only use facts present in the applicant's profile or CV — never invent experience, grades, or employers.",
  "Avoid generic filler and clichés; be concrete and concise.",
  "Return only the answer text — no preamble, quotes, labels, or sign-off unless asked.",
].join(" ");

async function complete(
  model: string,
  maxTokens: number,
  system: string,
  user: string,
): Promise<string> {
  const res = await client().messages.create({
    model,
    max_tokens: maxTokens,
    system,
    messages: [{ role: "user", content: user }],
  });
  return res.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("")
    .trim();
}

export interface GenerateAnswerArgs {
  question: string;
  charLimit?: number;
  employer?: string | null;
  role?: string | null;
  applicant: ApplicantContext;
}

/** Draft an answer to a free-text application question. */
export async function generateAnswer(args: GenerateAnswerArgs): Promise<string> {
  const { question, charLimit, employer, role, applicant } = args;
  const limit = charLimit
    ? `\n\nHard limit: keep the answer under ${charLimit} characters.`
    : "";
  const ctx = [
    employer ? `Employer: ${employer}` : "",
    role ? `Role: ${role}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  const user = [
    "Draft an answer to this job-application question.",
    ctx && `\n${ctx}`,
    `\nQuestion: ${question}`,
    `\n\nApplicant:\n${applicantBlock(applicant)}`,
    limit,
  ]
    .filter(Boolean)
    .join("");

  // Short-form answers are cheap + frequent → Haiku. Cap tokens to the limit.
  const maxTokens = charLimit ? Math.min(1024, Math.ceil(charLimit / 2)) : 700;
  let out = await complete(HAIKU, maxTokens, STYLE, user);
  if (charLimit && out.length > charLimit) {
    // Hard cap, but trim back to the last sentence/word boundary so we never
    // cut mid-word.
    const slice = out.slice(0, charLimit);
    const lastStop = Math.max(slice.lastIndexOf(". "), slice.lastIndexOf("! "), slice.lastIndexOf("? "));
    const lastSpace = slice.lastIndexOf(" ");
    const cut = lastStop > charLimit * 0.6 ? lastStop + 1 : lastSpace > 0 ? lastSpace : charLimit;
    out = slice.slice(0, cut).trim();
  }
  return out;
}

export interface CoverLetterArgs {
  employer: string;
  role: string;
  roleSummary?: string | null;
  applicant: ApplicantContext;
}

/** Draft a full cover letter (Sonnet for higher quality long-form). */
export async function generateCoverLetter(args: CoverLetterArgs): Promise<string> {
  const { employer, role, roleSummary, applicant } = args;
  const user = [
    `Write a concise cover letter (around 250-350 words) for the ${role} role at ${employer}.`,
    roleSummary ? `\n\nRole summary:\n${roleSummary}` : "",
    `\n\nApplicant:\n${applicantBlock(applicant)}`,
    "\n\nStructure it as 3-4 short paragraphs: motivation for the firm and role, the most relevant evidence from the CV, and a brief close. Address it to the hiring team.",
  ].join("");

  return complete(SONNET, 1200, STYLE, user);
}

export interface TailorCvArgs {
  role: string;
  employer?: string | null;
  roleSummary?: string | null;
  applicant: ApplicantContext;
}

/** Suggest tailored CV bullet edits for a specific role. */
export async function tailorCvBullets(args: TailorCvArgs): Promise<string> {
  const { role, employer, roleSummary, applicant } = args;
  const system =
    STYLE +
    " Output a short bulleted list of suggested CV bullet rewrites, each grounded in the applicant's real experience.";
  const user = [
    `Suggest how to tailor this applicant's CV bullets for the ${role} role${
      employer ? ` at ${employer}` : ""
    }.`,
    roleSummary ? `\n\nRole summary:\n${roleSummary}` : "",
    `\n\nApplicant:\n${applicantBlock(applicant)}`,
    "\n\nReturn 4-6 rewritten bullets that emphasise the most relevant experience. Do not fabricate.",
  ].join("");

  return complete(SONNET, 1000, system, user);
}
