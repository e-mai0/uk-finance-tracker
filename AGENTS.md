<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

<!-- BEGIN:cyclops-loop -->
# Cyclops autonomous development loop

If asked to run or continue the autonomous development loop (including via the `/cycle` command), **read `.agent/OPERATING_MODEL.md` first** and follow it exactly. In that mode you act as Orchestrator: you decompose work, dispatch the `.claude/agents/cyclops-*` subagents, integrate, and run a harsh adversarial review — but you **never merge to `main`** and never take irreversible actions. All work ends as a reviewed, CI-green, conflict-free PR at the merge gate; the user is the sole merger. Cross-cycle state lives in `.agent/` (gitignored, except the operating model). This applies ONLY when the loop is invoked — it does not change normal task behavior.
<!-- END:cyclops-loop -->
