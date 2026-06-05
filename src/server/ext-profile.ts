import "server-only";
import { prisma } from "./db";
import type { ApplicantContext } from "./ai/generate";

/**
 * Build the normalized autofill field map the extension fills into ATS forms.
 * The extension maps each form field's label to one of these keys; here we just
 * supply the values, plus a few derived answers to common Yes/No questions.
 */

export interface ExtFieldMap {
  fields: Record<string, string>;
  hasCv: boolean;
}

function splitName(name: string): { first: string; last: string } {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return { first: parts[0], last: "" };
  return { first: parts[0], last: parts.slice(1).join(" ") };
}

function workAuthAnswers(workAuth: string | undefined): Record<string, string> {
  switch (workAuth) {
    case "UK_CITIZEN":
    case "UK_SETTLED":
      return { workAuthorizedUk: "Yes", requiresSponsorship: "No" };
    case "UK_VISA_REQUIRED":
      return { workAuthorizedUk: "No", requiresSponsorship: "Yes" };
    default:
      return {};
  }
}

export async function buildFieldMap(userId: string): Promise<ExtFieldMap> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      name: true,
      email: true,
      profile: {
        select: {
          university: true,
          degreeSubject: true,
          degreeType: true,
          graduationYear: true,
          workAuth: true,
        },
      },
      applyProfile: true,
    },
  });
  if (!user) return { fields: {}, hasCv: false };

  const { first, last } = splitName(user.name);
  const p = user.profile;
  const ap = user.applyProfile;

  const fields: Record<string, string> = {
    fullName: user.name,
    firstName: first,
    lastName: last,
    email: user.email,
  };

  const put = (k: string, v: string | null | undefined) => {
    if (v != null && v !== "") fields[k] = String(v);
  };

  put("phone", ap?.phone);
  put("city", ap?.addressCity);
  put("country", ap?.country);
  put("linkedinUrl", ap?.linkedinUrl);
  put("githubUrl", ap?.githubUrl);
  put("websiteUrl", ap?.websiteUrl);
  put("pronouns", ap?.pronouns);
  put("noticePeriod", ap?.noticePeriod);
  put("earliestStart", ap?.earliestStart);
  put("gender", ap?.selfIdGender);
  put("ethnicity", ap?.selfIdEthnicity);

  put("university", p?.university);
  put("school", p?.university);
  put("degree", p?.degreeSubject);
  put("degreeType", p?.degreeType);
  if (p?.graduationYear) {
    put("graduationYear", String(p.graduationYear));
    // Many ATS use a month/year field; default to a summer graduation.
    put("graduationDate", `06/${p.graduationYear}`);
  }

  // Work-authorisation answers: prefer the user's own statement, else derive.
  const derived = workAuthAnswers(p?.workAuth);
  put("workAuthorizedUk", ap?.workAuthStatement || derived.workAuthorizedUk);
  put("requiresSponsorship", ap?.sponsorshipStatement || derived.requiresSponsorship);

  return { fields, hasCv: Boolean(ap?.cvStoragePath) };
}

/** Load the applicant context the LLM uses to ground generated answers. */
export async function loadApplicantContext(
  userId: string,
): Promise<ApplicantContext> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      name: true,
      profile: {
        select: {
          university: true,
          degreeSubject: true,
          degreeType: true,
          graduationYear: true,
          skills: true,
        },
      },
      applyProfile: {
        select: {
          cvText: true,
          workAuthStatement: true,
          sponsorshipStatement: true,
        },
      },
    },
  });

  return {
    name: user?.name ?? null,
    university: user?.profile?.university ?? null,
    degreeSubject: user?.profile?.degreeSubject ?? null,
    degreeType: user?.profile?.degreeType ?? null,
    graduationYear: user?.profile?.graduationYear ?? null,
    skills: user?.profile?.skills ?? [],
    cvText: user?.applyProfile?.cvText ?? null,
    workAuthStatement: user?.applyProfile?.workAuthStatement ?? null,
    sponsorshipStatement: user?.applyProfile?.sponsorshipStatement ?? null,
  };
}
