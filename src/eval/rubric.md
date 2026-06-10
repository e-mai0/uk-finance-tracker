# Writing eval rubric

## Purpose

This rubric is used by the Haiku pre-judge in the eval runner and by **you** (the human) when reading `REPORT.md`. The Haiku scores are a convenience pre-filter; your verdict is the one that matters. See docs/MANUAL-TASKS.md Gate B.

## Scoring dimensions (1–5 each unless noted)

### 1. Sounds like a specific person (voice)
| Score | Description |
|-------|-------------|
| 5 | Reads like someone specific wrote it — distinctive opening, real vocabulary, no generic opener |
| 4 | Mostly distinctive; one generic phrase but the texture is personal |
| 3 | Neutral; could be from a template but has some grounding |
| 2 | Feels AI-generated; several stock phrases |
| 1 | Pure boilerplate — "I'm excited to", "proven track record", symmetric bullet lists |

### 2. Concrete real detail (substance)
| Score | Description |
|-------|-------------|
| 5 | At least one specific number, named thing, or named event per paragraph; nothing invented |
| 4 | Good specifics in most paragraphs; one paragraph is a bit vague |
| 3 | Some specific detail but relies partly on generic claims |
| 2 | Mostly generic; one passing reference to something real |
| 1 | No concrete detail; could have been written for any applicant |

### 3. AI-tell count
Count of flagged phrases: em dashes, "I'm excited", "proven track record", "delve", "tapestry", "passionate about", "leverage my", "in today's fast-paced", "circle back", any symmetric three-item list of abstract nouns. Lower is better.

### 4. Would you send it with fewer than 2 minutes of edits? (binary)
Yes / No — the key question. If yes, the draft is production-ready.

## Judging instructions for the human reviewer

1. Open `src/eval/REPORT.md`.
2. For each question, read both A and B **without** looking at the blind key first.
3. Score each on dimensions 1–3; answer dimension 4 for each.
4. Note your overall winner (new engine / old pipeline / tie).
5. After all 20, look at the blind key at the bottom of REPORT.md.
6. Record your final verdict in docs/MANUAL-TASKS.md Gate B: **new engine wins**, **old wins**, or **rerun needed** (if fewer than 12 clear wins either way).

## Kill-gate rule

**If the new engine does not clearly outperform the old pipeline on voice (dim 1) and substance (dim 2) for at least 12 of 20 questions, do not merge `cyclopslevelup` to main.** Iterate on the engine prompts and re-run the eval.
