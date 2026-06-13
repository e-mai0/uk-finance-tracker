// On-brand font stacks. The real product uses Hanken Grotesk (UI), Geist Mono
// (numerics) and Newsreader (marketing display) — all Google Fonts. We use
// system fallbacks here so the render is deterministic and works offline; to
// ship pixel-exact, drop the real .woff2 files into ./fonts and load them with
// Remotion's staticFile()/@remotion/fonts (no network dependency at render time).
export const fonts = {
  ui: 'system-ui, -apple-system, "Segoe UI", "Hanken Grotesk", sans-serif',
  mono: 'ui-monospace, "SF Mono", Menlo, Consolas, "Geist Mono", monospace',
  display: '"Newsreader", Georgia, "Times New Roman", serif',
};
