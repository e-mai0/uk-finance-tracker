/**
 * Old-vs-new writing eval harness. Requires ANTHROPIC_API_KEY in .env or environment.
 * No DB needed — fixtures only. DB calls inside draftText/critiqueAndRevise are caught
 * with .catch(() => {}) and will not crash the runner (prisma rejects without a live DB).
 *
 * Usage:
 *   npx tsx scripts/eval-writing.ts [--limit N]
 *
 * Output: src/eval/REPORT.md
 * Pairs are blind A/B with randomised order per question (no fixed seed); the reveal key is at the bottom.
 */

// Load .env before any other import (Next.js does this automatically, tsx does not).
// Node 20.12+ / Node 24 exposes process.loadEnvFile.
if (typeof (process as NodeJS.Process & { loadEnvFile?: (path: string) => void }).loadEnvFile === "function") {
  try {
    (process as NodeJS.Process & { loadEnvFile: (path: string) => void }).loadEnvFile(
      new URL("../.env", import.meta.url).pathname.replace(/^\/([A-Z]:)/, "$1"),
    );
  } catch {
    // .env may not exist in CI; continue and let the key check below handle it
  }
}

if (!process.env.ANTHROPIC_API_KEY) {
  console.error("[eval] ANTHROPIC_API_KEY is not set — cannot run eval. Mark as pending in docs/MANUAL-TASKS.md Gate B.");
  process.exit(1);
}

import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import Anthropic from "@anthropic-ai/sdk";
import { generateObject } from "ai";
import { z } from "zod";
import { createAnthropic } from "@ai-sdk/anthropic";

// Engine imports (no server-only in these modules)
import { parseStory } from "../src/server/engine/stories";
import { parseVoice } from "../src/server/engine/voice";
import { draftText } from "../src/server/engine/draft";

// ─── Paths ───────────────────────────────────────────────────────────────────
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = join(__dirname, "..", "src", "eval");

// ─── Load fixtures ────────────────────────────────────────────────────────────
type Question = { id: string; question: string; employer: string; charLimit: number };
const questions: Question[] = JSON.parse(readFileSync(join(ROOT, "questions.json"), "utf8"));
const profileRaw = JSON.parse(readFileSync(join(ROOT, "fixtures", "profile.json"), "utf8")) as {
  name: string;
  university: string;
  degree: string;
  degreeSubject?: string;
  degreeType?: string;
  graduationYear: number;
  skills: string[];
  cvText: string;
  workAuthStatement: string;
  sponsorshipStatement?: string;
};
const voiceProfile = parseVoice(readFileSync(join(ROOT, "fixtures", "voice.md"), "utf8"));
const storiesDir = join(ROOT, "fixtures", "stories");
const stories = readdirSync(storiesDir)
  .filter((f) => f.endsWith(".md"))
  .map((f) => parseStory(`stories/${f}`, readFileSync(join(storiesDir, f), "utf8")))
  .filter((s): s is NonNullable<typeof s> => s !== null);

// Build a combined fixture sources string for faithfulness checks
const fixturesSources = [
  profileRaw.cvText,
  ...stories.map((s) => (s.finalVersions || s.rawNotes)),
].join("\n\n");

// ─── Old pipeline (inlined to avoid `import "server-only"` in generate.ts) ───
const anthropicClient = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// Label strings for the report header. The new arm's actual model comes from
// src/server/ai/models.ts via draftText; keep these imports in sync with it.
import { HAIKU_ID, SONNET_ID } from "../src/server/ai/models";

const OLD_STYLE = [
  "Write in the first person as the applicant.",
  "Use British English and a professional, specific tone suited to UK finance recruiting.",
  "Only use facts present in the applicant's profile or CV — never invent experience, grades, or employers.",
  "Avoid generic filler and clichés; be concrete and concise.",
  "Return only the answer text — no preamble, quotes, labels, or sign-off unless asked.",
].join(" ");

function applicantBlock(a: typeof profileRaw): string {
  const lines: string[] = [];
  if (a.name) lines.push(`Name: ${a.name}`);
  if (a.university) lines.push(`University: ${a.university}`);
  if (a.degreeSubject) lines.push(`Degree: ${(a.degreeType ?? "") + " " + a.degreeSubject}`.trim());
  if (a.graduationYear) lines.push(`Graduates: ${a.graduationYear}`);
  if (a.skills?.length) lines.push(`Skills: ${a.skills.join(", ")}`);
  if (a.workAuthStatement) lines.push(`Work authorisation: ${a.workAuthStatement}`);
  if (a.cvText) lines.push(`\nCV:\n${a.cvText}`);
  return lines.join("\n") || "(no profile details provided)";
}

async function generateAnswerOld(args: {
  question: string;
  charLimit: number;
  employer: string;
}): Promise<string> {
  const limit = args.charLimit
    ? `\n\nHard limit: keep the answer under ${args.charLimit} characters.`
    : "";
  const ctx = `Employer: ${args.employer}`;
  const user = [
    "Draft an answer to this job-application question.",
    `\n${ctx}`,
    `\nQuestion: ${args.question}`,
    `\n\nApplicant:\n${applicantBlock(profileRaw)}`,
    limit,
  ].join("");

  const maxTokens = args.charLimit ? Math.min(1024, Math.ceil(args.charLimit / 2)) : 700;
  const res = await anthropicClient.messages.create({
    model: HAIKU_ID,
    max_tokens: maxTokens,
    system: OLD_STYLE,
    messages: [{ role: "user", content: user }],
  });
  let out = res.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("")
    .trim();
  if (args.charLimit && out.length > args.charLimit) {
    const slice = out.slice(0, args.charLimit);
    const lastStop = Math.max(slice.lastIndexOf(". "), slice.lastIndexOf("! "), slice.lastIndexOf("? "));
    const lastSpace = slice.lastIndexOf(" ");
    const cut = lastStop > args.charLimit * 0.6 ? lastStop + 1 : lastSpace > 0 ? lastSpace : args.charLimit;
    out = slice.slice(0, cut).trim();
  }
  return out;
}

// ─── New engine context builder ───────────────────────────────────────────────
function buildNewContext() {
  return {
    profile: {
      name: profileRaw.name,
      university: profileRaw.university,
      degree: profileRaw.degree,
      graduationYear: profileRaw.graduationYear,
      skills: profileRaw.skills,
      cvText: profileRaw.cvText,
      workAuthStatement: profileRaw.workAuthStatement,
    },
    voice: voiceProfile,
    stories,
    companyNotes: null,
    research: null,
    pastAnswers: [] as { question: string; excerpt: string }[],
  };
}

// ─── Haiku pre-judge ──────────────────────────────────────────────────────────
const aiSdk = createAnthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const haikuModel = aiSdk(HAIKU_ID);

const JudgeScore = z.object({
  a: z.object({ voice: z.number().min(1).max(5), detail: z.number().min(1).max(5), tells: z.number().min(0) }),
  b: z.object({ voice: z.number().min(1).max(5), detail: z.number().min(1).max(5), tells: z.number().min(0) }),
  better: z.enum(["a", "b", "tie"]),
});
type JudgeScore = z.infer<typeof JudgeScore>;

const FaithfulnessResult = z.object({
  inventedSpecifics: z.array(z.string()).max(10),
});
type FaithfulnessResult = z.infer<typeof FaithfulnessResult>;

async function judgeBlind(question: string, a: string, b: string): Promise<JudgeScore | "FAILED"> {
  try {
    const { object } = await generateObject({
      model: haikuModel,
      schema: JudgeScore,
      prompt: `Two anonymous drafts answer the same UK finance job-application question. Score each on:
- voice: sounds like a specific human (not generic AI), 1=boilerplate, 5=clearly someone's own voice
- detail: concrete real specifics (numbers, named things), 1=none, 5=rich specifics every paragraph
- tells: count of AI-giveaway phrases (em dashes, "I'm excited", "proven track record", "delve", "passionate about", "in today's fast-paced", symmetric abstract noun lists)

Then decide which a recruiter would more likely believe a real student wrote.

Question: ${question}

<a>
${a}
</a>

<b>
${b}
</b>`,
    });
    return object;
  } catch (err) {
    console.error(`  judge failed:`, err);
    return "FAILED";
  }
}

async function checkFaithfulness(draft: string, sources: string): Promise<FaithfulnessResult> {
  try {
    const { object } = await generateObject({
      model: haikuModel,
      schema: FaithfulnessResult,
      prompt: `You are a faithfulness checker. Given source material and a draft, list any specific claims in the draft (numbers, names, events, outcomes) that are NOT present in the sources. These are potential fabrications.

Sources:
${sources.slice(0, 4000)}

Draft:
${draft}

List claims with numbers, names, or events that do not appear in the sources above. Return an empty array if everything checks out.`,
    });
    return object;
  } catch (err) {
    console.error(`  faithfulness check failed:`, err);
    return { inventedSpecifics: [] };
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  const limit = process.argv.includes("--limit")
    ? Number(process.argv[process.argv.indexOf("--limit") + 1])
    : questions.length;

  const subset = questions.slice(0, limit);
  const newCtx = buildNewContext();

  const rows: string[] = [];
  const key: string[] = [];
  let newWins = 0;
  let oldWins = 0;
  let ties = 0;
  let judgeFailures = 0;
  let totalInventedNew = 0;
  let totalInventedOld = 0;
  let callCount = 0;

  console.log(`[eval] Running ${subset.length} questions...`);
  const start = Date.now();

  for (const q of subset) {
    console.log(`  ${q.id}: generating...`);

    // Old pipeline
    let oldText: string;
    try {
      oldText = await generateAnswerOld({ question: q.question, charLimit: q.charLimit, employer: q.employer });
      callCount++;
    } catch (err) {
      console.error(`  ${q.id}: old pipeline failed:`, err);
      oldText = "(old pipeline error)";
    }

    // New engine
    let newText: string;
    try {
      const result = await draftText("eval", newCtx, {
        kind: "ANSWER",
        question: q.question,
        employerName: q.employer,
        charLimit: q.charLimit,
      });
      newText = result.text;
      callCount += 2; // draft + critique
    } catch (err) {
      console.error(`  ${q.id}: new engine failed:`, err);
      newText = "(new engine error)";
    }

    // Blind A/B — randomise which is A (no fixed seed)
    const newIsA = Math.random() < 0.5;
    const [a, b] = newIsA ? [newText, oldText] : [oldText, newText];
    key.push(`${q.id}: A=${newIsA ? "new" : "old"}, B=${newIsA ? "old" : "new"}`);

    // Faithfulness pre-check for both arms
    console.log(`  ${q.id}: faithfulness check...`);
    const [faithA, faithB] = await Promise.all([
      checkFaithfulness(a, fixturesSources),
      checkFaithfulness(b, fixturesSources),
    ]);
    callCount += 2;

    const inventedA = faithA.inventedSpecifics;
    const inventedB = faithB.inventedSpecifics;

    // Map back to new/old
    const inventedNew = newIsA ? inventedA : inventedB;
    const inventedOld = newIsA ? inventedB : inventedA;
    totalInventedNew += inventedNew.length;
    totalInventedOld += inventedOld.length;

    // Judge
    console.log(`  ${q.id}: judging...`);
    const judge = await judgeBlind(q.question, a, b);
    callCount++;

    let winner: "new" | "old" | "tie" | "FAILED";
    let judgeDisplay: string;

    if (judge === "FAILED") {
      judgeFailures++;
      winner = "FAILED";
      judgeDisplay = "FAILED";
    } else {
      winner =
        judge.better === "tie"
          ? "tie"
          : (judge.better === "a") === newIsA
          ? "new"
          : "old";

      if (winner === "new") newWins++;
      else if (winner === "old") oldWins++;
      else ties++;

      judgeDisplay = `A voice ${judge.a.voice}/5 detail ${judge.a.detail}/5 tells ${judge.a.tells} | B voice ${judge.b.voice}/5 detail ${judge.b.detail}/5 tells ${judge.b.tells} | better: **${judge.better}**`;
    }

    console.log(`  ${q.id}: judge=${judgeDisplay} (${winner}) | inventedNew=${inventedNew.length} inventedOld=${inventedOld.length}`);

    const faithSection = [
      `_Faithfulness — A invented: ${inventedA.length > 0 ? inventedA.join("; ") : "none"}_`,
      `_Faithfulness — B invented: ${inventedB.length > 0 ? inventedB.join("; ") : "none"}_`,
    ].join("\n");

    rows.push(
      [
        `## ${q.id} — ${q.question}`,
        `**Employer:** ${q.employer} | **Char limit:** ${q.charLimit}`,
        "",
        "**Answer A**",
        "",
        a,
        "",
        "**Answer B**",
        "",
        b,
        "",
        judge === "FAILED"
          ? `_Pre-judge: FAILED_`
          : `_Pre-judge: ${judgeDisplay}_`,
        "",
        faithSection,
        "",
      ].join("\n"),
    );
  }

  const elapsed = ((Date.now() - start) / 1000).toFixed(1);

  const report = [
    `# Writing eval — old pipeline vs new engine`,
    `_Run: ${new Date().toISOString().slice(0, 16).replace("T", " ")} UTC | Questions: ${subset.length} | Elapsed: ${elapsed}s | Approx API calls: ${callCount}_`,
    `_Models: old arm = ${HAIKU_ID} | new arm = ${SONNET_ID} | judge = ${HAIKU_ID} | A/B assignment is random per run (no fixed seed)_`,
    "",
    `## LLM pre-judge summary`,
    `| | Count |`,
    `|---|---|`,
    `| New engine wins | ${newWins} |`,
    `| Old pipeline wins | ${oldWins} |`,
    `| Ties | ${ties} |`,
    `| Judge failures (excluded from totals) | ${judgeFailures} |`,
    "",
    `## Faithfulness (invented specifics)`,
    `| Arm | Total invented specifics across all questions |`,
    `|---|---|`,
    `| New engine | ${totalInventedNew} |`,
    `| Old pipeline | ${totalInventedOld} |`,
    "",
    `**THE USER IS THE FINAL JUDGE** — read each pair against \`rubric.md\`, record verdict in docs/MANUAL-TASKS.md Gate B.`,
    `_Note: The LLM pre-judge is a pre-filter only; judge failures are excluded from totals and do not count for or against either arm._`,
    "",
    "---",
    "",
    rows.join("\n---\n\n"),
    "",
    "---",
    "",
    "## Blind key",
    "",
    key.join("\n"),
    "",
  ].join("\n");

  writeFileSync(join(ROOT, "REPORT.md"), report, "utf8");

  console.log(`\n[eval] Done in ${elapsed}s`);
  console.log(`[eval] Pre-judge: new=${newWins} old=${oldWins} ties=${ties} failures=${judgeFailures}`);
  console.log(`[eval] Invented specifics: new=${totalInventedNew} old=${totalInventedOld}`);
  console.log(`[eval] Report written to src/eval/REPORT.md`);
}

main().catch((err) => {
  console.error("[eval] Fatal:", err);
  process.exit(1);
});
