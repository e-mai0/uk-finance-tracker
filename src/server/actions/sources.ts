"use server";

import { revalidatePath } from "next/cache";
import { auth } from "../auth";
import { prisma } from "../db";
import { syncSource } from "../../ingestion/sync";
import { recomputeMatchScores } from "../matching";
import { detectSource, prettifyIdentifier } from "../../lib/source-detect";

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
    return {
      ok: false,
      message:
        "Couldn't recognise that board. Greenhouse, Lever and Ashby URLs work — e.g. jobs.ashbyhq.com/firm or boards.greenhouse.io/firm.",
    };
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
