/**
 * eval-writing.ts — incumbent-Claude vs candidate-model writing eval.
 *
 * Runs the SAME engine path (draftText) twice over the src/eval fixtures:
 *   Arm 1 (INCUMBENT): no MODEL_* overrides → every role resolves to today's Claude.
 *   Arm 2 (CANDIDATE): the target role's MODEL_* is set to EVAL_CANDIDATE_MODEL,
 *                      so that ONE role routes through the Vercel AI Gateway while
 *                      everything else stays on Claude.
 *
 * Both arms' drafts are judged TWO ways:
 *   1. The REAL production rubric grader (src/server/engine/grader.ts gradeDraft) —
 *      run on each arm's output, pass/fail compared.
 *   2. The existing blind pairwise A/B (randomised order) by a FIXED frontier Claude
 *      judge (Sonnet) — NEVER the candidate, to avoid self-preference bias.
 * The PURE gate (src/eval/gate.ts decideGate) then emits a PASS/FAIL verdict over
 * grader pass-rate (within tolerance) AND pairwise-not-worse, plus indicative cost.
 *
 * Env:
 *   EVAL_ROLE              role under test (default "draft"). Must be an overridable role.
 *   EVAL_CANDIDATE_MODEL   gateway model id for Arm 2 (e.g. "openai/gpt-4o-mini"). Required.
 *   ANTHROPIC_API_KEY      required for the incumbent arm + the fixed Claude judge.
 *   AI_GATEWAY_API_KEY     required for the candidate arm (gateway routing).
 *   EVAL_TOLERANCE         max grader pass-rate slip (default 0.05).
 *
 * Usage:
 *   EVAL_CANDIDATE_MODEL=openai/gpt-4o-mini npx tsx scripts/eval-writing.ts [--limit N]
 *   npx tsx scripts/eval-writing.ts --dry-run   # validate wiring, NO API calls
 *
 * Output: src/eval/REPORT.md (cost + quality columns + the gate verdict).
 *
 * NOTE: not yet run live — the Anthropic account currently returns "credit balance
 * too low" and there is no AI_GATEWAY_API_KEY. The PURE gate logic is unit-tested in
 * src/test/eval-gate.test.ts; --dry-run validates the wiring without spending credits.
 */

// Load .env before any other import (Next.js does this automatically, tsx does not).
if (typeof (process as NodeJS.Process & { loadEnvFile?: (path: string) => void }).loadEnvFile === "function") {
  try {
    (process as NodeJS.Process & { loadEnvFile: (path: string) => void }).loadEnvFile(
      new URL("../.env", import.meta.url).pathname.replace(/^\/([A-Z]:)/, "$1"),
    );
  } catch {
    // .env may not exist in CI; the checks below decide what is required.
  }
}

import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { generateObject } from "ai";
import { z } from "zod";
import { createAnthropic } from "@ai-sdk/anthropic";

// Engine imports (no `server-only` in these modules).
import { parseStory } from "../src/server/engine/stories";
import { parseVoice } from "../src/server/engine/voice";
import { draftText } from "../src/server/engine/draft";
import { gradeDraft } from "../src/server/engine/grader";
import { classifyQuestion } from "../src/server/engine/stories";
import { inferRegister } from "../src/server/engine/register";
import { SONNET_ID, ENV_KEY, CLAUDE_DEFAULT, modelIdFor, type ModelRole } from "../src/server/ai/models";
import { decideGate, costFor, type Pairwise } from "../src/eval/gate";
import type { GradeContext } from "../src/server/engine/types";

// ─── Config ────────────────────────────────────────────────────────────────────
const DRY_RUN = process.argv.includes("--dry-run");
const EVAL_ROLE = (process.env.EVAL_ROLE ?? "draft") as ModelRole;
const CANDIDATE_MODEL = process.env.EVAL_CANDIDATE_MODEL ?? "";
const TOLERANCE = process.env.EVAL_TOLERANCE ? Number(process.env.EVAL_TOLERANCE) : 0.05;

// Validate the role is one the seam can actually override (chat/agent/research are pinned).
const ENV_VAR_FOR_ROLE = ENV_KEY[EVAL_ROLE];
if (!ENV_VAR_FOR_ROLE) {
  console.error(
    `[eval] EVAL_ROLE="${EVAL_ROLE}" is not overridable (chat/agent/research are pinned to Claude). ` +
      `Choose one of: ${Object.keys(ENV_KEY).join(", ")}.`,
  );
  process.exit(1);
}

if (!CANDIDATE_MODEL && !DRY_RUN) {
  console.error("[eval] EVAL_CANDIDATE_MODEL is required (a gateway model id, e.g. openai/gpt-4o-mini).");
  process.exit(1);
}

if (!DRY_RUN) {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error("[eval] ANTHROPIC_API_KEY is required for the incumbent arm + the fixed Claude judge.");
    process.exit(1);
  }
  if (!process.env.AI_GATEWAY_API_KEY && !process.env.VERCEL_OIDC_TOKEN && CANDIDATE_MODEL && !CANDIDATE_MODEL.startsWith("claude")) {
    console.error("[eval] AI_GATEWAY_API_KEY (or VERCEL_OIDC_TOKEN) is required to route the candidate through the gateway.");
    process.exit(1);
  }
}

// ─── Paths + fixtures ────────────────────────────────────────────────────────────
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = join(__dirname, "..", "src", "eval");

type Question = { id: string; question: string; employer: string; charLimit: number };
const questions: Question[] = JSON.parse(readFileSync(join(ROOT, "questions.json"), "utf8"));
const profileRaw = JSON.parse(readFileSync(join(ROOT, "fixtures", "profile.json"), "utf8")) as {
  name: string;
  university: string;
  degree: string;
  graduationYear: number;
  skills: string[];
  cvText: string;
  workAuthStatement: string;
};
const voiceProfile = parseVoice(readFileSync(join(ROOT, "fixtures", "voice.md"), "utf8"));
const storiesDir = join(ROOT, "fixtures", "stories");
const stories = readdirSync(storiesDir)
  .filter((f) => f.endsWith(".md"))
  .map((f) => parseStory(`stories/${f}`, readFileSync(join(storiesDir, f), "utf8")))
  .filter((s): s is NonNullable<typeof s> => s !== null);

function buildContext() {
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

// Grounding corpus for the rubric grader's faithfulness (RAGAS) check. Mirrors the
// engine's buildGroundingCorpus over the eval fixtures: the applicant's CV text plus
// every story (title + body). The eval has no companyNotes/research/pastAnswers. The
// grader contract requires the FULL corpus (false positives come from missing evidence),
// so we pass all stories, not just the selected subset — this only makes the grader more
// accurate, never more lenient toward fabrication.
function buildGroundingCorpus(): string {
  const parts: string[] = [];
  if (profileRaw.cvText) parts.push(profileRaw.cvText);
  for (const s of stories) {
    parts.push(s.title);
    parts.push(s.finalVersions || s.rawNotes);
  }
  return parts.filter(Boolean).join("\n\n");
}

// ─── Arm runner: toggle the role override around a single draftText call ──────────
type ArmOutput = { text: string; inputTokens: number; outputTokens: number; modelId: string };

async function runArm(q: Question, useCandidate: boolean): Promise<ArmOutput> {
  const prev = process.env[ENV_VAR_FOR_ROLE!];
  if (useCandidate) process.env[ENV_VAR_FOR_ROLE!] = CANDIDATE_MODEL;
  else delete process.env[ENV_VAR_FOR_ROLE!];
  const modelId = modelIdFor(EVAL_ROLE);
  try {
    const result = await draftText("eval", buildContext(), {
      kind: "ANSWER",
      question: q.question,
      employerName: q.employer,
      charLimit: q.charLimit,
    });
    // draftText does not surface per-call usage in its result; the engine records it
    // via recordUsage (no-op without a DB). For the report we attribute a coarse
    // estimate from the text length so the indicative cost column is populated. The
    // gate's quality decision does NOT depend on these figures.
    const outputTokens = Math.ceil(result.text.length / 4);
    const inputTokens = Math.ceil((profileRaw.cvText.length + q.question.length + 4000) / 4);
    return { text: result.text, inputTokens, outputTokens, modelId };
  } finally {
    if (prev === undefined) delete process.env[ENV_VAR_FOR_ROLE!];
    else process.env[ENV_VAR_FOR_ROLE!] = prev;
  }
}

// ─── Fixed Claude judge (NEVER the candidate) ────────────────────────────────────
const judgeProvider = createAnthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const judgeModel = judgeProvider(SONNET_ID); // frontier Claude, fixed.

const JudgeScore = z.object({
  a: z.object({ voice: z.number().min(1).max(5), detail: z.number().min(1).max(5) }),
  b: z.object({ voice: z.number().min(1).max(5), detail: z.number().min(1).max(5) }),
  better: z.enum(["a", "b", "tie"]),
});

async function judgeBlind(question: string, a: string, b: string): Promise<z.infer<typeof JudgeScore> | "FAILED"> {
  try {
    const { object } = await generateObject({
      model: judgeModel,
      schema: JudgeScore,
      prompt: `Two anonymous drafts answer the same UK finance job-application question. Score each on voice (sounds like a specific human, 1-5) and detail (concrete real specifics, 1-5), then decide which a recruiter would more likely believe a real student wrote.

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
    console.error("  judge failed:", err);
    return "FAILED";
  }
}

// ─── Grade an arm's draft with the REAL production rubric grader ──────────────────
async function gradeArm(q: Question, text: string): Promise<boolean | "FAILED"> {
  const { kind: questionKind } = classifyQuestion(q.question);
  const { programme: register, division } = inferRegister("", q.question);
  const firmHookExpected = questionKind === "motivation" || questionKind === "commercial";
  const ctx: GradeContext = {
    question: q.question,
    questionKind,
    register,
    division,
    firmName: q.employer,
    wordCap: null,
    firmHookDisclosed: false,
    firmHookExpected,
    groundingCorpus: buildGroundingCorpus(),
  };
  try {
    // Grader always runs on Claude (its role is not overridden by EVAL_ROLE unless
    // the role under test IS grader — but the judge here is the rubric, run identically
    // on both arms' text, so it is fair).
    const grade = await gradeDraft("eval-grade", text, ctx);
    return grade.passed;
  } catch (err) {
    console.error("  grade failed:", err);
    return "FAILED";
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  if (DRY_RUN) {
    // Validate wiring with NO API calls: confirm the seam toggles the role and the
    // gate logic is importable + runnable on synthetic numbers.
    delete process.env[ENV_VAR_FOR_ROLE!];
    const incumbentId = modelIdFor(EVAL_ROLE);
    process.env[ENV_VAR_FOR_ROLE!] = CANDIDATE_MODEL || "openai/gpt-4o-mini";
    const candidateId = modelIdFor(EVAL_ROLE);
    delete process.env[ENV_VAR_FOR_ROLE!];

    const demo = decideGate({
      incumbent: { modelId: incumbentId, graderPasses: [true, true, true, false], usage: { inputTokens: 1_000_000, outputTokens: 200_000 } },
      candidate: { modelId: candidateId, graderPasses: [true, true, true, false], usage: { inputTokens: 1_000_000, outputTokens: 200_000 } },
      pairwise: { candidateWins: 2, incumbentWins: 2, ties: 1 },
      tolerance: TOLERANCE,
    });

    console.log("[eval][dry-run] wiring OK");
    console.log(`  role under test : ${EVAL_ROLE} (env ${ENV_VAR_FOR_ROLE})`);
    console.log(`  incumbent id    : ${incumbentId} (default ${CLAUDE_DEFAULT[EVAL_ROLE]})`);
    console.log(`  candidate id    : ${candidateId}`);
    console.log(`  tolerance       : ${TOLERANCE}`);
    console.log(`  demo gate verdict (synthetic): ${demo.pass ? "PASS" : "FAIL"} — ${demo.reasons.join("; ")}`);
    console.log("[eval][dry-run] no API calls made.");
    return;
  }

  const limit = process.argv.includes("--limit")
    ? Number(process.argv[process.argv.indexOf("--limit") + 1])
    : questions.length;
  const subset = questions.slice(0, limit);

  const rows: string[] = [];
  const key: string[] = [];
  const incumbentPasses: boolean[] = [];
  const candidatePasses: boolean[] = [];
  let incInput = 0;
  let incOutput = 0;
  let candInput = 0;
  let candOutput = 0;
  const pairwise: Pairwise = { candidateWins: 0, incumbentWins: 0, ties: 0 };
  let incumbentModelId = CLAUDE_DEFAULT[EVAL_ROLE];
  let candidateModelId = CANDIDATE_MODEL;

  console.log(`[eval] role=${EVAL_ROLE} candidate=${CANDIDATE_MODEL} questions=${subset.length}`);
  const start = Date.now();

  for (const q of subset) {
    console.log(`  ${q.id}: incumbent + candidate...`);
    const inc = await runArm(q, false);
    const cand = await runArm(q, true);
    incumbentModelId = inc.modelId;
    candidateModelId = cand.modelId;
    incInput += inc.inputTokens;
    incOutput += inc.outputTokens;
    candInput += cand.inputTokens;
    candOutput += cand.outputTokens;

    // Real rubric grader on BOTH arms.
    const [gInc, gCand] = await Promise.all([gradeArm(q, inc.text), gradeArm(q, cand.text)]);
    if (gInc !== "FAILED") incumbentPasses.push(gInc);
    if (gCand !== "FAILED") candidatePasses.push(gCand);

    // Blind pairwise — randomise which arm is A.
    const candIsA = Math.random() < 0.5;
    const [a, b] = candIsA ? [cand.text, inc.text] : [inc.text, cand.text];
    key.push(`${q.id}: A=${candIsA ? "candidate" : "incumbent"}, B=${candIsA ? "incumbent" : "candidate"}`);
    const judge = await judgeBlind(q.question, a, b);
    let pairDisplay = "FAILED";
    if (judge !== "FAILED") {
      const candWon = judge.better === "tie" ? "tie" : (judge.better === "a") === candIsA ? "candidate" : "incumbent";
      if (candWon === "candidate") pairwise.candidateWins++;
      else if (candWon === "incumbent") pairwise.incumbentWins++;
      else pairwise.ties++;
      pairDisplay = `A voice ${judge.a.voice}/5 detail ${judge.a.detail}/5 | B voice ${judge.b.voice}/5 detail ${judge.b.detail}/5 | better: ${judge.better} (${candWon})`;
    }

    rows.push(
      [
        `## ${q.id} — ${q.question}`,
        `**Employer:** ${q.employer} | **Char limit:** ${q.charLimit}`,
        "",
        `**Incumbent (${inc.modelId})** — grader: ${gInc === "FAILED" ? "FAILED" : gInc ? "PASS" : "fail"}`,
        "",
        inc.text,
        "",
        `**Candidate (${cand.modelId})** — grader: ${gCand === "FAILED" ? "FAILED" : gCand ? "PASS" : "fail"}`,
        "",
        cand.text,
        "",
        `_Pairwise: ${pairDisplay}_`,
        "",
      ].join("\n"),
    );
  }

  const elapsed = ((Date.now() - start) / 1000).toFixed(1);

  const verdict = decideGate({
    incumbent: { modelId: incumbentModelId, graderPasses: incumbentPasses, usage: { inputTokens: incInput, outputTokens: incOutput } },
    candidate: { modelId: candidateModelId, graderPasses: candidatePasses, usage: { inputTokens: candInput, outputTokens: candOutput } },
    pairwise,
    tolerance: TOLERANCE,
  });

  const incCost = costFor(incumbentModelId, { inputTokens: incInput, outputTokens: incOutput });
  const candCost = costFor(candidateModelId, { inputTokens: candInput, outputTokens: candOutput });
  const fmt = (c: number | null) => (c === null ? "n/a (no price)" : `$${c.toFixed(4)}`);

  const report = [
    `# Writing eval — incumbent Claude vs candidate model`,
    `_Run: ${new Date().toISOString().slice(0, 16).replace("T", " ")} UTC | Role: ${EVAL_ROLE} | Questions: ${subset.length} | Elapsed: ${elapsed}s_`,
    `_Incumbent: ${incumbentModelId} | Candidate: ${candidateModelId} | Judge (fixed): ${SONNET_ID} | Tolerance: ${TOLERANCE}_`,
    "",
    `## GATE VERDICT: ${verdict.pass ? "✅ PASS" : "❌ FAIL"}`,
    verdict.reasons.map((r) => `- ${r}`).join("\n"),
    "",
    `## Quality + cost`,
    `| Arm | Grader pass-rate | Indicative cost | Pairwise |`,
    `|---|---|---|---|`,
    `| Incumbent | ${(verdict.incumbentPassRate * 100).toFixed(1)}% | ${fmt(incCost)} | — |`,
    `| Candidate | ${(verdict.candidatePassRate * 100).toFixed(1)}% | ${fmt(candCost)} | net ${verdict.pairwiseNet} (${pairwise.candidateWins}W/${pairwise.incumbentWins}L/${pairwise.ties}T) |`,
    "",
    `_Cost figures are INDICATIVE (src/eval/gate.ts PRICE_TABLE), not billing. Pairwise judged blind by a FIXED frontier Claude (never the candidate). The gate PASSES a candidate only when its grader pass-rate is within ${(TOLERANCE * 100).toFixed(0)}% of the incumbent AND it is pairwise not-worse; cost never overrides a quality loss._`,
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
  console.log(`\n[eval] Done in ${elapsed}s — gate ${verdict.pass ? "PASS" : "FAIL"}`);
  console.log(`[eval] incumbent pass-rate=${(verdict.incumbentPassRate * 100).toFixed(1)}% candidate=${(verdict.candidatePassRate * 100).toFixed(1)}%`);
  console.log(`[eval] Report written to src/eval/REPORT.md`);
}

main().catch((err) => {
  console.error("[eval] Fatal:", err);
  process.exit(1);
});
