"use server";

import { auth, signOut } from "../auth";
import { prisma } from "../db";
import {
  downloadCv,
  removeAllCvObjectsForUser,
  storageConfigured,
} from "../storage";
import { DELETE_CONFIRM_PHRASE } from "@/app/(app)/settings/account-constants";

/**
 * Account deletion + data export — the PII-trust minimum for an invite-only
 * beta. Both actions are STRICTLY scoped to the authenticated session user's own
 * id; no userId is ever accepted from the client.
 *
 * Deletion model coverage (kept in lockstep with prisma/schema.prisma):
 *
 *   CASCADE-COVERED (deleted automatically by `user.delete` via
 *   `onDelete: Cascade` on the userId relation):
 *     Profile, Preferences, ApplyProfile, BuiltCv, SavedOpportunity,
 *     MatchScore, ApiToken, AnswerBankItem, Application, GeneratedDraft,
 *     MemoryFile (→ MemoryRevision cascades), ChatSession (→ ChatMessage
 *     cascades), AttentionItem.
 *
 *   NON-CASCADE (a bare `userId` column with NO FK relation — these will NOT be
 *   removed by `user.delete`, so they are explicitly cleared first):
 *     GardenerQuestion, GardenerRun, DailyUsage, DraftEdit, ContentEmbedding.
 *
 * If a NEW user-referencing model is added to the schema, it must either carry
 * `onDelete: Cascade` on its userId relation or be added to NON_CASCADE_DELETES
 * below (the completeness test enumerates this set).
 */

export interface DeleteAccountInput {
  /** Must be exactly the confirmation phrase (DELETE) to proceed. */
  confirm: string;
}

export interface DeleteAccountResult {
  ok?: boolean;
  /** Where the client should send the user after a successful deletion. */
  redirectTo?: string;
  error?: string;
}

export async function deleteAccount(
  input: DeleteAccountInput,
): Promise<DeleteAccountResult> {
  const session = await auth();
  if (!session?.user) {
    return { error: "Your session has expired. Sign in again." };
  }

  // Explicit typed confirmation is required before any destructive work.
  if (input?.confirm !== DELETE_CONFIRM_PHRASE) {
    return {
      error: `Type ${DELETE_CONFIRM_PHRASE} to confirm. This cannot be undone.`,
    };
  }

  // SCOPED: only ever the authenticated user's own id. We deliberately read the
  // id from the verified session and ignore anything on `input`.
  const userId = session.user.id;
  const where = { userId };

  // GDPR erasure includes the uploaded CV FILE (Supabase Storage), not just
  // Prisma rows. The sweep runs BEFORE the DB transaction, and a failure ABORTS
  // the deletion: once the rows (and the session) are gone, nothing references
  // the storage path any more, so a failed post-hoc cleanup would strand the
  // file with no way to find or retry it. Failing first leaves every row
  // intact and the whole action retryable. Accepted (disclosed) inverse risk:
  // if the sweep succeeds and the transaction THEN fails, the surviving
  // account temporarily points at a deleted file — the user sees the error,
  // and re-running deleteAccount completes cleanly (the sweep is idempotent).
  if (storageConfigured()) {
    try {
      await removeAllCvObjectsForUser(userId);
    } catch (err) {
      console.error("[account delete] CV storage erasure failed:", err);
      return {
        error:
          "We couldn't delete your uploaded CV file, so your account was NOT deleted. Try again in a moment.",
      };
    }
  } else {
    // Storage env is missing — if a CV file is on record we cannot erase it,
    // and deleting the rows anyway would claim a complete erasure that never
    // happened (and lose the only pointer to the file).
    const applyProfile = await prisma.applyProfile.findUnique({
      where,
      select: { cvStoragePath: true },
    });
    if (applyProfile?.cvStoragePath) {
      return {
        error:
          "We couldn't reach file storage to delete your uploaded CV, so your account was NOT deleted. Try again later.",
      };
    }
  }

  await prisma.$transaction(async (tx) => {
    // 1) Clear non-cascade userId-keyed rows FIRST (they have no FK to drop).
    await tx.gardenerQuestion.deleteMany({ where });
    await tx.gardenerRun.deleteMany({ where });
    await tx.dailyUsage.deleteMany({ where });
    await tx.draftEdit.deleteMany({ where });
    await tx.contentEmbedding.deleteMany({ where });

    // 2) Delete the user — cascades remove every cascade-covered model. This is
    //    a HARD delete: no PII rows are left behind.
    await tx.user.delete({ where: { id: userId } });
  });

  // Invalidate the session so the deleted account can't keep browsing.
  // `signOut` with redirect:false avoids throwing the NEXT_REDIRECT control-flow
  // error inside this action; the client performs the navigation.
  await signOut({ redirect: false });

  return { ok: true, redirectTo: "/" };
}

/**
 * The uploaded CV FILE (Supabase Storage) as part of the export — GDPR access
 * covers the file itself, not just its DB metadata row. CV files are small
 * (≤10 MB enforced at upload), so base64-in-JSON is a faithful representation.
 * When the file cannot be read the export still completes, but the gap is
 * carried EXPLICITLY in the payload — never silently omitted.
 */
export type ExportedCvFile =
  | {
      available: true;
      fileName: string | null;
      storagePath: string;
      contentType: string | null;
      sizeBytes: number;
      encoding: "base64";
      base64: string;
    }
  | {
      available: false;
      fileName: string | null;
      storagePath: string;
      note: string;
    };

/** A single api-token row with its secret hash stripped (metadata only). */
interface ExportedApiToken {
  id: string;
  name: string;
  createdAt: Date | string | null;
  lastUsedAt: Date | string | null;
  revokedAt: Date | string | null;
}

export interface ExportMyDataResult {
  ok?: boolean;
  data?: ExportedData;
  error?: string;
}

export interface ExportedData {
  exportedAt: string;
  user: Record<string, unknown> | null;
  profile: unknown;
  preferences: unknown;
  applyProfile: unknown;
  /** The uploaded CV file itself; null when no CV was ever uploaded. */
  cvFile: ExportedCvFile | null;
  builtCv: unknown;
  savedOpportunities: unknown[];
  matchScores: unknown[];
  answerBank: unknown[];
  applications: unknown[];
  generatedDrafts: unknown[];
  memoryFiles: unknown[];
  chatSessions: unknown[];
  attentionItems: unknown[];
  apiTokens: ExportedApiToken[];
  gardenerQuestions: unknown[];
  dailyUsage: unknown[];
}

export async function exportMyData(): Promise<ExportMyDataResult> {
  const session = await auth();
  if (!session?.user) {
    return { error: "Your session has expired. Sign in again." };
  }

  const userId = session.user.id;
  const where = { userId };

  const [
    user,
    profile,
    preferences,
    applyProfile,
    builtCv,
    savedOpportunities,
    matchScores,
    answerBank,
    applications,
    generatedDrafts,
    memoryFiles,
    chatSessions,
    attentionItems,
    apiTokens,
    gardenerQuestions,
    dailyUsage,
  ] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId } }),
    prisma.profile.findUnique({ where }),
    prisma.preferences.findUnique({ where }),
    prisma.applyProfile.findUnique({ where }),
    prisma.builtCv.findUnique({ where }),
    prisma.savedOpportunity.findMany({ where }),
    prisma.matchScore.findMany({ where }),
    prisma.answerBankItem.findMany({ where }),
    prisma.application.findMany({ where }),
    prisma.generatedDraft.findMany({ where }),
    prisma.memoryFile.findMany({ where, include: { revisions: true } }),
    prisma.chatSession.findMany({ where, include: { messages: true } }),
    prisma.attentionItem.findMany({ where }),
    prisma.apiToken.findMany({ where }),
    prisma.gardenerQuestion.findMany({ where }),
    prisma.dailyUsage.findMany({ where }),
  ]);

  // REDACT secrets: never export the account password hash...
  let safeUser: Record<string, unknown> | null = null;
  if (user) {
    const rest = { ...(user as Record<string, unknown>) };
    delete rest.passwordHash;
    safeUser = rest;
  }

  // ...nor the raw api-token hash. Export token metadata only.
  const safeTokens: ExportedApiToken[] = (
    apiTokens as Array<Record<string, unknown>>
  ).map((t) => ({
    id: t.id as string,
    name: t.name as string,
    createdAt: (t.createdAt as Date | string | null) ?? null,
    lastUsedAt: (t.lastUsedAt as Date | string | null) ?? null,
    revokedAt: (t.revokedAt as Date | string | null) ?? null,
  }));

  // Include the uploaded CV FILE itself (GDPR access = everything we hold,
  // including the file in Supabase Storage). A failed read must not block the
  // rest of the export — degrade to an explicit note instead.
  let cvFile: ExportedCvFile | null = null;
  const applyProfileRow = applyProfile as {
    cvStoragePath?: unknown;
    cvFileName?: unknown;
  } | null;
  const cvStoragePath =
    typeof applyProfileRow?.cvStoragePath === "string"
      ? applyProfileRow.cvStoragePath
      : null;
  const cvFileName =
    typeof applyProfileRow?.cvFileName === "string"
      ? applyProfileRow.cvFileName
      : null;
  if (cvStoragePath) {
    if (!storageConfigured()) {
      cvFile = {
        available: false,
        fileName: cvFileName,
        storagePath: cvStoragePath,
        note: "Your uploaded CV file could not be included because file storage is not configured on the server. Everything else in this export is complete.",
      };
    } else {
      try {
        const blob = await downloadCv(cvStoragePath);
        const bytes = Buffer.from(await blob.arrayBuffer());
        cvFile = {
          available: true,
          fileName: cvFileName,
          storagePath: cvStoragePath,
          contentType: blob.type || null,
          sizeBytes: bytes.byteLength,
          encoding: "base64",
          base64: bytes.toString("base64"),
        };
      } catch (err) {
        console.error("[account export] CV download failed:", err);
        cvFile = {
          available: false,
          fileName: cvFileName,
          storagePath: cvStoragePath,
          note: "Your uploaded CV file could not be downloaded from storage right now. Everything else in this export is complete — try exporting again later for the file.",
        };
      }
    }
  }

  const data: ExportedData = {
    exportedAt: new Date().toISOString(),
    user: safeUser,
    profile,
    preferences,
    applyProfile,
    cvFile,
    builtCv,
    savedOpportunities,
    matchScores,
    answerBank,
    applications,
    generatedDrafts,
    memoryFiles,
    chatSessions,
    attentionItems,
    apiTokens: safeTokens,
    gardenerQuestions,
    dailyUsage,
  };

  return { ok: true, data };
}
