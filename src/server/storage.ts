import "server-only";
import { createClient } from "@supabase/supabase-js";

/**
 * Service-role Supabase client for private file storage (CV uploads).
 *
 * This key bypasses RLS and must NEVER reach the browser or the extension — it
 * is only imported from server actions / route handlers. The `server-only`
 * import above makes a client bundle fail loudly if that ever happens.
 */

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

export const CV_BUCKET = "cvs";

let _client: ReturnType<typeof createClient> | null = null;

function client() {
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    throw new Error(
      "Supabase storage is not configured. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.",
    );
  }
  _client ??= createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return _client;
}

/** True when storage env vars are present (lets the UI degrade gracefully). */
export function storageConfigured() {
  return Boolean(SUPABASE_URL && SERVICE_ROLE_KEY);
}

/** Upload (or overwrite) a user's CV. Returns the storage path. */
export async function uploadCv(
  userId: string,
  fileName: string,
  bytes: Uint8Array,
  contentType: string,
): Promise<string> {
  // One canonical object per user keeps storage tidy; we keep the display name
  // in the DB. Preserve the extension so signed downloads open correctly.
  const ext = fileName.includes(".") ? fileName.split(".").pop() : "bin";
  const path = `${userId}/cv.${ext}`;
  const { error } = await client()
    .storage.from(CV_BUCKET)
    .upload(path, bytes, { contentType, upsert: true });
  if (error) throw new Error(`CV upload failed: ${error.message}`);
  return path;
}

/** Short-lived signed URL so the extension can attach the CV to file inputs. */
export async function signedCvUrl(
  storagePath: string,
  expiresInSeconds = 120,
): Promise<string> {
  const { data, error } = await client()
    .storage.from(CV_BUCKET)
    .createSignedUrl(storagePath, expiresInSeconds);
  if (error || !data) throw new Error(`Could not sign CV URL: ${error?.message}`);
  return data.signedUrl;
}

/** Download a stored CV (used by the account data export). */
export async function downloadCv(storagePath: string): Promise<Blob> {
  const { data, error } = await client()
    .storage.from(CV_BUCKET)
    .download(storagePath);
  if (error || !data) {
    throw new Error(`CV download failed: ${error?.message ?? "no data"}`);
  }
  return data;
}

/**
 * Remove a stored CV (used when the user clears their CV).
 *
 * FAILS CLOSED: supabase-js reports failures via the returned `{ error }` — it
 * does not throw — so this must be surfaced explicitly or a "removed" CV can
 * silently keep existing in the bucket (GDPR erasure gap).
 */
export async function removeCv(storagePath: string): Promise<void> {
  const { error } = await client().storage.from(CV_BUCKET).remove([storagePath]);
  if (error) throw new Error(`CV removal failed: ${error.message}`);
}

/**
 * GDPR erasure sweep for account deletion: list the user's own folder and
 * remove EVERYTHING in it, returning the removed paths.
 *
 * The sweep is keyed on the userId PREFIX rather than the DB `cvStoragePath`
 * pointer for two reasons:
 *   - scoping: it can only ever touch objects under `${userId}/`, and
 *   - completeness: it also catches stale objects the pointer no longer
 *     references (e.g. a cv.pdf stranded by a later cv.docx replacement).
 * Any list/remove failure throws — deletion must never claim an erasure it
 * cannot prove.
 */
export async function removeAllCvObjectsForUser(
  userId: string,
): Promise<string[]> {
  const { data, error } = await client().storage.from(CV_BUCKET).list(userId);
  if (error) throw new Error(`CV storage list failed: ${error.message}`);
  const paths = (data ?? []).map((obj) => `${userId}/${obj.name}`);
  if (paths.length === 0) return [];
  const { error: removeError } = await client()
    .storage.from(CV_BUCKET)
    .remove(paths);
  if (removeError) throw new Error(`CV removal failed: ${removeError.message}`);
  return paths;
}
