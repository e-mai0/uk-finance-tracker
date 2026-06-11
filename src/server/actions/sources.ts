"use server";

import { revalidatePath } from "next/cache";
import { auth } from "../auth";
import { prisma } from "../db";
import { syncSource } from "../../ingestion/sync";
import { fetchText } from "../../ingestion/adapters/common";
import { extractJobPostings } from "../../ingestion/jsonld";
import { recomputeMatchScores } from "../matching";
import {
  detectSource,
  prettifyIdentifier,
  safePublicUrl,
} from "../../lib/source-detect";

export interface ScoutState {
  ok: boolean;
  message: string;
}

export const SCOUT_IDLE: ScoutState = { ok: true, message: "" };

/**
 * Firm Scout: a user pastes any careers/job-board URL; if it's a Greenhouse /
 * Lever / Ashby board we register it as a live ingestion source, pull it
 * immediately, and the firm's UK internships appear for every user. This is
 * how niche/boutique firms enter the dataset without a code change.
 * Recognised-but-unsupported boards (Workday) are stored disabled as a
 * review queue.
 */
export async function scoutFirm(
  _prev: ScoutState,
  formData: FormData,
): Promise<ScoutState> {
  const session = await auth();
  if (!session?.user) return { ok: false, message: "Not signed in." };

  const url = String(formData.get("url") ?? "").trim();
  const firmName = String(formData.get("firm") ?? "").trim();
  if (!url) return { ok: false, message: "Paste a careers or job-board URL." };

  const detected = detectSource(url);
  if (!detected) {
    // Not a recognised ATS — a custom careers site. Probe it for JobPosting
    // structured data; failing that, register it as a watched page.
    return scoutCustomSite(url, firmName, session.user.id);
  }

  const employerName =
    firmName || prettifyIdentifier(detected.identifier);

  if (detected.kind === "UNSUPPORTED") {
    await prisma.ingestionSource.upsert({
      where: {
        kind_identifier: { kind: "WORKDAY", identifier: detected.identifier },
      },
      update: {},
      create: {
        kind: "WORKDAY",
        identifier: detected.identifier,
        employerName,
        url,
        enabled: false,
        suggestedById: session.user.id,
        lastStatus: "pending: Workday ingestion not supported yet",
      },
    });
    return {
      ok: true,
      message: `${employerName} uses Workday, which we can't read live yet — logged it for manual review.`,
    };
  }

  const existing = await prisma.ingestionSource.findUnique({
    where: {
      kind_identifier: { kind: detected.kind, identifier: detected.identifier },
    },
  });
  if (existing) {
    return {
      ok: true,
      message: `${existing.employerName} is already on the radar (${existing.lastStatus ?? "queued for the next sync"}).`,
    };
  }

  const source = await prisma.ingestionSource.create({
    data: {
      kind: detected.kind,
      identifier: detected.identifier,
      employerName,
      url,
      enabled: true,
      suggestedById: session.user.id,
    },
  });

  // Immediate first pull so the scout sees the result right away. A failed
  // pull keeps the row (with the error recorded) for the cron to retry.
  const result = await syncSource(prisma, source);
  if (!result.ok) {
    return {
      ok: false,
      message: `Registered ${employerName}, but the board couldn't be read just now (${result.error ?? "unknown error"}). We'll keep retrying on the next sync.`,
    };
  }

  await recomputeMatchScores(session.user.id);
  revalidatePath("/dashboard");
  revalidatePath("/saved");

  const found = result.created + result.updated;
  return {
    ok: true,
    message:
      found === 0
        ? `${employerName} is now tracked — no live UK internships on its board today, but new ones will appear automatically.`
        : `${employerName} added: ${found} UK internship${found === 1 ? "" : "s"} now tracked, live for every user.`,
  };
}

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * Custom-ATS path of Firm Scout (Citadel, Jane Street and co. run their own
 * careers sites). Probe the page for schema.org JobPosting JSON-LD: if it has
 * structured data we ingest it like any feed; otherwise the page is
 * registered watch-only — change detection flags new postings for review on
 * /radar. Either way the firm is monitored from now on.
 */
async function scoutCustomSite(
  rawUrl: string,
  firmName: string,
  userId: string,
): Promise<ScoutState> {
  const url = safePublicUrl(rawUrl);
  if (!url) {
    return {
      ok: false,
      message:
        "That doesn't look like a public careers URL. ATS boards (Greenhouse, Lever, Ashby) and https careers pages work.",
    };
  }

  const host = url.hostname.replace(/^www\./, "");
  const identifier = slugify(`${host}${url.pathname}`).slice(0, 80);
  const employerName =
    firmName || prettifyIdentifier(host.split(".")[0] ?? host);

  const existing = await prisma.ingestionSource.findUnique({
    where: { kind_identifier: { kind: "CAREERS_PAGE", identifier } },
  });
  if (existing) {
    return {
      ok: true,
      message: `${existing.employerName} is already on the radar (${existing.lastStatus ?? "queued for the next sync"}).`,
    };
  }

  let hasStructuredData = false;
  try {
    const html = await fetchText(url.toString());
    hasStructuredData = extractJobPostings(html).length > 0;
  } catch (err) {
    return {
      ok: false,
      message: `Couldn't reach ${host} (${err instanceof Error ? err.message : "unknown error"}). Nothing was registered — try the firm's main careers/jobs page.`,
    };
  }

  const source = await prisma.ingestionSource.create({
    data: {
      kind: "CAREERS_PAGE",
      identifier,
      employerName,
      url: url.toString(),
      enabled: true,
      watchOnly: !hasStructuredData,
      suggestedById: userId,
    },
  });

  const result = await syncSource(prisma, source);
  if (!result.ok) {
    return {
      ok: false,
      message: `Registered ${employerName}, but the page couldn't be read just now (${result.error ?? "unknown error"}). We'll keep retrying on the next sync.`,
    };
  }

  if (!hasStructuredData) {
    return {
      ok: true,
      message: `${employerName} runs a custom careers site without a readable feed, so we're now watching it — new postings will be flagged on the Radar page within ~6 hours of appearing.`,
    };
  }

  await recomputeMatchScores(userId);
  revalidatePath("/dashboard");
  revalidatePath("/saved");
  const found = result.created + result.updated;
  return {
    ok: true,
    message:
      found === 0
        ? `${employerName}'s careers site is now tracked via its structured data — no live UK internships today, but new ones will appear automatically.`
        : `${employerName} added via its careers site: ${found} UK internship${found === 1 ? "" : "s"} now tracked, live for every user.`,
  };
}
