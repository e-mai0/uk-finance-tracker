import type { RoleFamily, WorkAuth } from "@prisma/client";
import { prisma } from "@/server/db";
import { memoryService } from "@/server/memory/service";
import { applyFact } from "@/server/memory/facts";
import { ROLE_FAMILY_LABEL, WORK_AUTH_LABEL } from "@/lib/constants";

export interface FactSourceProfile {
  university: string;
  degreeSubject: string;
  degreeType: string;
  graduationYear: number;
  currentYear: number;
  workAuth: WorkAuth | null;
  skills: string[];
  gradeInfo: unknown;
}

export interface FactSourcePrefs {
  targetRoleFamilies: RoleFamily[];
  preferredLocations: string[];
  openToAnywhereUk: boolean;
  targetEmployers: string[];
}

export interface ProfileFact {
  label: string;
  value: string;
}

/**
 * Deterministic Profile/Preferences → fact lines for profile.md. Labels are
 * stable so applyFact() updates in place on every re-sync. Absent optional
 * data emits no fact at all (never "unknown" placeholders).
 */
export function buildProfileFacts(
  profile: FactSourceProfile,
  prefs: FactSourcePrefs | null,
): ProfileFact[] {
  const facts: ProfileFact[] = [
    { label: "university", value: profile.university },
    { label: "degree", value: `${profile.degreeType} ${profile.degreeSubject}`.trim() },
    { label: "graduation year", value: String(profile.graduationYear) },
    { label: "current year of study", value: String(profile.currentYear) },
  ];

  if (profile.workAuth) {
    facts.push({ label: "work authorization", value: WORK_AUTH_LABEL[profile.workAuth] });
  }
  if (profile.skills.length) {
    facts.push({ label: "skills", value: profile.skills.join(", ") });
  }
  const grade = (profile.gradeInfo ?? {}) as {
    aLevels?: string;
    gcseSummary?: string;
    gpaOrEquivalent?: string;
  };
  const grades = [
    grade.aLevels && `A-levels ${grade.aLevels}`,
    grade.gcseSummary && `GCSEs ${grade.gcseSummary}`,
    grade.gpaOrEquivalent && `degree grade ${grade.gpaOrEquivalent}`,
  ]
    .filter(Boolean)
    .join("; ");
  if (grades) facts.push({ label: "grades", value: grades });

  if (prefs) {
    if (prefs.targetRoleFamilies.length) {
      facts.push({
        label: "targeting",
        value: prefs.targetRoleFamilies.map((r) => ROLE_FAMILY_LABEL[r]).join(", "),
      });
    }
    if (prefs.preferredLocations.length) {
      facts.push({ label: "preferred locations", value: prefs.preferredLocations.join(", ") });
    } else if (prefs.openToAnywhereUk) {
      facts.push({ label: "preferred locations", value: "open to anywhere in the UK" });
    }
    if (prefs.targetEmployers.length) {
      facts.push({ label: "target employers", value: prefs.targetEmployers.join(", ") });
    }
  }

  return facts;
}

/** Fold a fact list into existing profile.md content. Pure. */
export function applyFacts(content: string, facts: ProfileFact[], today: string): string {
  return facts.reduce((c, f) => applyFact(c, f.label, f.value, today), content);
}

/**
 * Read the user's Profile + Preferences and mirror them into profile.md.
 * Never throws — memory is best-effort and must not fail the calling action.
 */
export async function syncProfileFactsToMemory(userId: string, reason: string): Promise<void> {
  try {
    const [profile, prefs] = await Promise.all([
      prisma.profile.findUnique({ where: { userId } }),
      prisma.preferences.findUnique({ where: { userId } }),
    ]);
    if (!profile) return;

    const facts = buildProfileFacts(profile, prefs);
    if (!facts.length) return;

    // Ensure the canonical tree exists (list() seeds on first call).
    let file = await memoryService.read(userId, "profile.md");
    if (!file) {
      await memoryService.list(userId);
      file = await memoryService.read(userId, "profile.md");
    }
    if (!file) return;

    const today = new Date().toISOString().slice(0, 10);
    const next = applyFacts(file.content, facts, today);
    if (next === file.content) return; // no revision noise on no-op re-sync

    await memoryService.write(userId, "profile.md", next, "CYCLOPS", reason);
  } catch (err) {
    console.error("[memory sync] failed:", err);
  }
}
