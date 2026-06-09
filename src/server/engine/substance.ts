import { prisma } from "@/server/db";
import { memoryService } from "@/server/memory/service";
import { semanticSearch } from "@/server/ai/embed";
import { loadApplicantContext } from "@/server/ext-profile";
import { parseStory } from "@/server/engine/stories";
import { parseVoice } from "@/server/engine/voice";
import type { DraftArgs, DraftContext, Story } from "@/server/engine/types";

/** Slugify an employer name the same way companies/<slug>.md paths are formed. */
export function employerSlugOf(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

export async function gatherSubstance(userId: string, args: DraftArgs): Promise<DraftContext> {
  // loadApplicantContext returns ApplicantContext with fields:
  //   name, university, degreeSubject (not "degree"), degreeType, graduationYear,
  //   skills, cvText, workAuthStatement, sponsorshipStatement
  const applicant = await loadApplicantContext(userId);

  const files = await memoryService.list(userId);
  const voiceFile = files.find((f) => f.path === "voice.md");
  const stories: Story[] = files
    .filter((f) => f.path.startsWith("stories/"))
    .map((f) => parseStory(f.path, f.content))
    .filter((s): s is Story => s !== null);

  const slug = args.employerSlug ?? (args.employerName ? employerSlugOf(args.employerName) : undefined);
  const companyFile = slug ? files.find((f) => f.path === `companies/${slug}.md`) : undefined;

  let research: string | null = null;
  if (args.employerName) {
    const employer = await prisma.employer.findFirst({
      where: { name: { equals: args.employerName, mode: "insensitive" } },
      include: { research: true },
    });
    research = employer?.research?.content ?? null;
  }

  const pastAnswers = await semanticSearch(userId, args.question, 4)
    .then((hits) => hits.map((h) => ({ question: "", excerpt: h.content.slice(0, 500) })))
    .catch(() => []);

  return {
    profile: {
      name: applicant.name ?? null,
      university: applicant.university ?? null,
      // loadApplicantContext uses degreeSubject (not "degree") — map to DraftContext.profile.degree
      degree: applicant.degreeSubject ?? null,
      graduationYear: applicant.graduationYear ?? null,
      skills: applicant.skills ?? [],
      cvText: applicant.cvText ?? null,
      workAuthStatement: applicant.workAuthStatement ?? null,
    },
    voice: parseVoice(voiceFile?.content ?? ""),
    stories,
    companyNotes: companyFile?.content ?? null,
    research,
    pastAnswers,
  };
}
