// Cyclops "GB+" tokens, lifted from src/app/globals.css so the reel uses the
// real shipped theme: warm linen paper, cream cards, amber agent accent.
export const theme = {
  paper: "#fffefb", // award-cut: crisp near-white stage (Ref-A temperature)
  gold: "#f0b35f", // amber -> gold gradient top
  gold2: "#ffd89a", // gold highlight
  canvas: "#f4f1ea", // linen page base
  surface: "#fffdf9", // cream cards
  surface2: "#faf6ee", // card heads / hover
  surface3: "#f0ebdf", // table heads / pressed
  ink: "#2b2722",
  muted: "#5d564b",
  subtle: "#6b6256",
  faint: "#756c5f",
  deco: "#a39885",
  border: "#e3dccd",
  hairline: "#efe9dc",
  borderStrong: "#d4cab6",
  // Amber = agent. Mark for fills/cursors/bars; accent for text.
  agentMark: "#c05f10",
  accentText: "#9a4c0c",
  accentSoft: "#f8ead9",
  accentTint: "#fdf6ea",
  // Dark ink surfaces (primary buttons, end card)
  chrome: "#2b2722",
  chrome2: "#3d372e",
  chromeInk: "#f4f1ea",
  chromeDim: "#9d917f",
  amberOnDark: "#f0b35f",
  success: "#3a6246",
  goodMark: "#4e7d5b",
} as const;

export const radius = {
  card: 14,
  control: 10,
  sm: 6,
  pill: 999,
} as const;
