/** Truthful dock context line per route (spec: the dock never lies about what it sees). */
export function dockContextLabel(pathname: string): string {
  if (pathname.startsWith("/tracker/")) return "SEES: LISTING";
  if (pathname.startsWith("/tracker")) return "SEES: TRACKER";
  if (pathname.startsWith("/applications")) return "SEES: APPLICATIONS";
  if (pathname.startsWith("/memory")) return "SEES: MEMORY";
  if (pathname.startsWith("/radar")) return "SEES: RADAR";
  if (pathname.startsWith("/today")) return "SEES: TODAY";
  if (pathname.startsWith("/chat")) return "SEES: CHAT";
  return "SEES: APP";
}

/** ≤3 canned conversation starters per surface; clicking sends as a message. */
export function dockSuggestions(pathname: string): string[] {
  if (pathname.startsWith("/tracker"))
    return ["What should I apply to first?", "Which deadlines are closest?", "Why are my top fits ranked that way?"];
  if (pathname.startsWith("/applications"))
    return ["What's left before I can submit?", "Review my latest answers", "Which application is most at risk?"];
  if (pathname.startsWith("/memory"))
    return ["Which of my stories are unused?", "Quiz me on my voice rules", "What did you learn this week?"];
  if (pathname.startsWith("/today"))
    return ["Walk me through the brief", "Plan my week", "What changed overnight?"];
  return ["What needs my attention?", "Summarise where I stand", "What did you do overnight?"];
}
