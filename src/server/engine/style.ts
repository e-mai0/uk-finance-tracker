/**
 * Default writing style guide for all generated application text.
 * This is the baseline craft layer, applied BEFORE any per-user voice
 * personalization (voice.md traits/exemplars are layered on top in
 * buildSystem). Synthesized from UK recruiter guidance (TargetJobs,
 * Prospects, Oxford Careers), hiring-manager writing, and known
 * AI-writing tells. Faithfulness rules in the draft system prompt
 * override anything here.
 */
export const STYLE_GUIDE = `Writing craft rules (UK early-career applications):

CORE
- Answer two questions only: "why them?" and "why you?". Cut anything serving neither.
- Add what the CV cannot show: why this firm, how the applicant works, what a CV line actually involved, what they took from it. The reader has the CV; never summarise it.
- Evidence over assertion. Never state a quality ("I am analytical"); show one incident that proves it and let the reader conclude.
- One developed example beats five name-checked ones. Write at the applicant's real altitude: modest, concrete, curious. Grandiose reads as fake.

SELECTION (anti-recitation, hard rules)
- Cover letter: develop 1-2 CV items, reference at most 3 total. A ~250-word answer gets exactly one example. Never tour the CV chronologically.
- Choose items by relevance to the role's top stated requirements, not by impressiveness.
- Develop, don't mention: for each chosen item spend 2-4 sentences on ONE of: a specific decision or difficulty, the approach, what changed, or what it taught that matters for this role.
- CV-echo test: if a sentence could be reconstructed from the CV alone, cut it or add the off-CV detail (the why, the how, the lesson).
- Thin material: write a SHORTER draft around what exists. Never pad with adjectives, values-talk, or restated job-description language.

STRUCTURE
- Cover letter (3-4 paragraphs): opener = role + the single most specific reason of fit, starting from a concrete fact; then 1-2 developed examples mapped to requirements; then "why them" with one or two specific checkable reasons from supplied material; close in 1-2 confident sentences and stop.
- Banned openers: "I am writing to express/apply...", "I am excited to apply...", "As a [adjective] student...", any opener praising the firm's prestige.
- Banned closers: "Thank you for considering my application", "I look forward to hearing from you", "I am confident I would be a valuable asset", any closer re-summarising the letter.
- Competency answers: lead straight into the example, never restate the question. ~1-2 sentences situation, ~60% on the applicant's own actions ("I", not "we"), then the real outcome and, if room, one sentence of takeaway. No STAR labels, no robotic marching.

SENTENCES
- Concrete nouns and verbs carry meaning. If a sentence's payload is an adjective, rewrite it.
- No self-praise adjectives (motivated, driven, detail-oriented, hardworking, dynamic).
- Cut throat-clearing: "I believe that", "I feel that", "It is worth noting", "Throughout my academic career".
- Vary sentence length; include one short sentence (under 8 words) in most paragraphs. Max two consecutive sentences starting with "I". One idea per sentence, ~25 words max.
- Plain register: "use" not "utilise", "help" not "facilitate", "before" not "prior to", "about" not "regarding".
- No bullet points in letters. No semicolon chains.

BANNED PATTERNS (AI tells recruiters screen for)
- "not only X but also Y", "it's not X, it's Y", "more than just X": banned.
- Adjective triplets ("collaborative, innovative, and inclusive"): banned; one precise adjective or none.
- Paragraphs opening with "Furthermore/Moreover/Additionally": banned; connect with content.
- Mirroring the job advert's phrasing back verbatim: banned; paraphrase or cut.
- Generic flattery that fits any employer ("a leading global firm"): if a sentence could be pasted into a rival's letter unchanged, it fails.

UK NORMS
- British English spelling throughout (organise, programme, specialise).
- Named contact: "Dear Ms Patel," with "Yours sincerely,". No name: "Dear Sir or Madam," with "Yours faithfully,". Never "Dear Hiring Manager" or "To Whom It May Concern".
- Understatement over hype: "I'd welcome the chance to..." not "I would be thrilled...". No "world-class", "perfect fit", "dream job".
- "Graduate scheme" not "program", "CV" not "resume", "a 2:1" not "GPA".
- Finance/professional services: precision is the audition. Use the division's actual name. Qualification support (ACA, CFA) is a legitimate specific "why them".

LENGTH
- Cover letter: 250-350 words, never over one A4 page. Word-limited answers: the limit is hard; 70% of it with substance beats 100% with padding. No-limit form answers: 150-250 words.
- Final pass: delete the draft's weakest sentence; if the draft doesn't miss it, delete the next weakest.

TRANSFORMATION EXAMPLES (shape only; NEVER reuse their content or facts):
- Recitation -> development: "During university I developed strong analytical skills through coursework, served as treasurer, and honed my teamwork abilities" -> "As treasurer I inherited a budget spreadsheet nobody trusted. Rebuilding it line by line showed me I like the unglamorous checking work that makes a number safe to rely on."
- Assertion -> evidence: "I am a detail-oriented person who thrives in fast-paced environments" -> "I found the discrepancy everyone else had stopped looking for."`;
