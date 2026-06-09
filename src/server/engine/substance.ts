import { prisma } from "@/server/db";
import { memoryService } from "@/server/memory/service";
import { semanticSearch } from "@/server/ai/embed";
import { loadApplicantContext } from "@/server/ext-profile";
import { parseStory, employerSlugOf } from "@/server/engine/stories";
import { parseVoice } from "@/server/engine/voice";
import type { DraftArgs, DraftContext, Story } from "@/server/engine/types";

// Re-export for compatibility (moved to stories.ts to avoid import cycles)
export { employerSlugOf };

export async function gatherSubstance(userId: string, args: DraftArgs): Promise<DraftContext> {
  const slug = args.employerSlug ?? (args.employerName ? employerSlugOf(args.employerName) : undefined);

  const [applicant, files, researchResult, pastAnswersRaw] = await Promise.all([
    loadApplicantContext(userId),
    memoryService.list(userId),
    // Employer + research lookup
    args.employerName
      ? prisma.employer
          .findFirst({
            where: { name: { equals: args.employerName, mode: "insensitive" } },
            include: { research: true },
          })
          .then((emp) => emp?.research?.content ?? null)
          .catch(() => null)
      : Promise.resolve(null),
    // Semantic search for past answers
    semanticSearch(userId, args.question, 4).catch(() => [] as { content: string }[]),
  ]);

  const voiceFile = files.find((f) => f.path === "voice.md");
  const stories: Story[] = files
    .filter((f) => f.path.startsWith("stories/"))
    .map((f) => parseStory(f.path, f.content))
    .filter((s): s is Story => s !== null);

  const companyFile = slug ? files.find((f) => f.path === `companies/${slug}.md`) : undefined;

  const pastAnswers = (pastAnswersRaw as { content: string }[]).map((h) => {
    const nl = h.content.indexOf("\n");
    if (nl > 0) {
      return { question: h.content.slice(0, nl).trim(), excerpt: h.content.slice(nl + 1).trim() };
    }
    return { question: "", excerpt: h.content.slice(0, 500) };
  });

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
    research: researchResult,
    pastAnswers,
  };
}
