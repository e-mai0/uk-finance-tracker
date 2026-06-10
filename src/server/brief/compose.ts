export interface BriefData {
  deadlines: { employer: string; title: string; deadlineAt: string }[]; // ISO dates
  refreshed: string[]; // employer names whose research was warmed tonight
  gardenerQuestions: string[]; // pending question texts
  staleApps: { employer: string; role: string; status: string; daysSince: number }[];
}

/** Deterministic markdown brief; null when there is nothing worth saying. */
export function composeBrief(data: BriefData, today: string): string | null {
  const t = new Date(`${today}T00:00:00Z`).getTime();
  const days = (iso: string) =>
    Math.ceil((new Date(iso).getTime() - t) / 86_400_000);
  const urgent = data.deadlines.filter((d) => days(d.deadlineAt) <= 3);
  const week = data.deadlines.filter((d) => {
    const n = days(d.deadlineAt);
    return n > 3 && n <= 7;
  });
  const sections: string[] = [];
  if (urgent.length) {
    sections.push(
      "## Deadlines in the next 3 days\n" +
        urgent.map((d) => `- ${d.employer} - ${d.title} (due ${d.deadlineAt.slice(0, 10)})`).join("\n"),
    );
  }
  if (week.length) {
    sections.push(
      "## Later this week\n" +
        week.map((d) => `- ${d.employer} - ${d.title} (due ${d.deadlineAt.slice(0, 10)})`).join("\n"),
    );
  }
  if (data.refreshed.length) {
    sections.push(
      "## Research warmed overnight\n" +
        data.refreshed.map((e) => `- ${e}`).join("\n"),
    );
  }
  if (data.gardenerQuestions.length) {
    const [first] = data.gardenerQuestions;
    const more =
      data.gardenerQuestions.length > 1
        ? ` (and ${data.gardenerQuestions.length - 1} more)`
        : "";
    sections.push(`## Quick check${more}\n${first}`);
  }
  if (data.staleApps.length) {
    sections.push(
      "## Applications going quiet\n" +
        data.staleApps
          .map((a) => `- ${a.employer} ${a.role}: ${a.status.toLowerCase()} for ${a.daysSince} days`)
          .join("\n"),
    );
  }
  if (!sections.length) return null;
  return `# Morning brief - ${today}\n\n${sections.join("\n\n")}\n`;
}
