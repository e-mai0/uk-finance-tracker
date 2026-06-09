export const CANONICAL_TEMPLATES: Record<string, string> = {
  "profile.md": `# Profile
Facts Cyclops knows about you beyond the structured profile.
Each fact carries (confidence: high|medium|low, confirmed: YYYY-MM-DD).

## Academics

## Interests & constraints
`,
  "voice.md": `# Voice
How you write. Used to make every draft sound like you.

## Banned tells
- Em dashes
- "I'm excited to"
- "proven track record"
- Symmetric three-item lists

## Observed traits

## Exemplars
<!-- short excerpts of the user's real writing; never invented -->
`,
  "strategy.md": `# Strategy

## Current direction
<!-- live facts only; superseded entries move to History with their dates -->

## History
`,
};
