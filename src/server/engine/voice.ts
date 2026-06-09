import type { VoiceProfile } from "@/server/engine/types";

function section(content: string, name: string): string {
  const m = content.match(new RegExp(`^## ${name}\\s*$([\\s\\S]*?)(?=^## |$(?![\\s\\S]))`, "im"));
  return m ? m[1].trim() : "";
}

export function parseVoice(content: string): VoiceProfile {
  const tells = section(content, "Banned tells")
    .split("\n")
    .map((l) => l.replace(/^- /, "").replace(/^["']+|["']+$/g, "").trim())
    .filter(Boolean);
  const traits = section(content, "Observed traits")
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.startsWith("- "));
  return { bannedTells: tells, traits, exemplars: section(content, "Exemplars") };
}
