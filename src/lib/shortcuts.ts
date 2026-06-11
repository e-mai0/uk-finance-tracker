/**
 * Platform-aware shortcut service. The spec's keyboard law:
 * - printed hints are NEVER hardcoded glyphs — always rendered via formatShortcut
 * - Ctrl+Shift+J is browser-reserved on Windows (DevTools) so the dock-collapse
 *   chord is ⌘⇧J on mac and Ctrl+\ on win/linux.
 */
export function isMacPlatform(): boolean {
  if (typeof navigator === "undefined" || !navigator) return false;
  return /Mac|iPhone|iPad|iPod/.test(navigator.platform ?? "");
}

type Chord = "mod+K" | "mod+J" | "mod+Enter" | "collapse";

export function formatShortcut(chord: Chord | string): string {
  const mac = isMacPlatform();
  if (chord === "collapse") return mac ? "⌘⇧J" : "Ctrl+\\";
  const [mod, key] = chord.split("+");
  if (mod !== "mod") return chord;
  const k = key === "Enter" ? "⏎" : key.toUpperCase();
  return mac ? `⌘${k}` : `Ctrl+${k}`;
}

export function matchesShortcut(
  e: Pick<KeyboardEvent, "key" | "ctrlKey" | "metaKey" | "shiftKey">,
  chord: Chord | string,
): boolean {
  const mac = isMacPlatform();
  const mod = mac ? e.metaKey : e.ctrlKey;
  if (chord === "collapse") {
    return mac
      ? mod && e.shiftKey && e.key.toLowerCase() === "j"
      : mod && !e.shiftKey && e.key === "\\";
  }
  const [m, key] = chord.split("+");
  if (m !== "mod") return false;
  const want = key === "Enter" ? "enter" : key.toLowerCase();
  return mod && !e.shiftKey && e.key.toLowerCase() === want;
}
