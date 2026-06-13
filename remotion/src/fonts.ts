// Self-hosted real product fonts via @fontsource (bundled woff2, no network —
// the sandbox blocks Google's CDN). Hanken Grotesk (UI), Geist Mono (numerics),
// Newsreader italic (marketing display). Load is forced + awaited in Root.
import "@fontsource/hanken-grotesk/400.css";
import "@fontsource/hanken-grotesk/600.css";
import "@fontsource/hanken-grotesk/700.css";
import "@fontsource/hanken-grotesk/800.css";
import "@fontsource/geist-mono/400.css";
import "@fontsource/geist-mono/600.css";
import "@fontsource/geist-mono/700.css";
import "@fontsource/newsreader/400-italic.css";
import "@fontsource/newsreader/600-italic.css";

export const fonts = {
  ui: '"Hanken Grotesk", system-ui, -apple-system, sans-serif',
  mono: '"Geist Mono", ui-monospace, Menlo, monospace',
  display: '"Newsreader", Georgia, "Times New Roman", serif',
};

// Families/weights to force-load before the first frame renders.
export const FONT_SPECS = [
  '400 16px "Hanken Grotesk"',
  '600 16px "Hanken Grotesk"',
  '700 16px "Hanken Grotesk"',
  '800 16px "Hanken Grotesk"',
  '400 16px "Geist Mono"',
  '600 16px "Geist Mono"',
  '700 16px "Geist Mono"',
  'italic 400 16px "Newsreader"',
  'italic 600 16px "Newsreader"',
];
