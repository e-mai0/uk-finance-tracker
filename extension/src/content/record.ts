/**
 * Application-recording helpers.
 *
 * Extracted from index.ts so retry logic + in-flight cleanup are unit-testable
 * without a real browser environment. The content script calls these; the
 * module has no direct dependency on chrome.* or the DOM.
 */

export interface TrackPayload {
  externalUrl: string;
  ats: string;
  employerName?: string;
  roleTitle?: string;
  status: string;
}

export interface RecordResult {
  ok: boolean;
  error?: string;
}

/** Send result shape expected from the send() function (bg message response). */
interface SendResult {
  ok: boolean;
  error?: string;
  status?: number;
}

/** Options controlling retry behaviour. */
export interface RetryOptions {
  /** Maximum total attempts (including the first). Default: 3. */
  maxAttempts?: number;
  /** Milliseconds to wait between attempts. Default: 1000. */
  delayMs?: number;
}

/**
 * Returns true for errors that are worth retrying:
 *   – No HTTP status (network / connection error)
 *   – 429 Too Many Requests
 *   – 5xx Server errors
 * 400-series client errors (except 429) are NOT retried; they won't resolve on
 * their own and retrying just delays surfacing the failure to the user.
 */
function isTransient(r: SendResult): boolean {
  if (r.ok) return false;
  if (r.status === undefined) return true; // network error, no HTTP status
  if (r.status === 429) return true;
  if (r.status >= 500) return true;
  return false;
}

/**
 * Send a `trackApplication` message with bounded retries for transient errors.
 *
 * @param payload   The application data to record.
 * @param sendFn    Async function that dispatches the message; must return a
 *                  { ok, error?, status? } shape — mirrors BgResponse.
 * @param opts      Optional retry tuning (delayMs=0 is useful in tests).
 * @returns         RecordResult — ok=true on any successful attempt.
 */
export async function sendTrackApplicationWithRetry(
  payload: TrackPayload,
  sendFn: (payload: TrackPayload) => Promise<SendResult>,
  opts: RetryOptions = {},
): Promise<RecordResult> {
  const maxAttempts = opts.maxAttempts ?? 3;
  const delayMs = opts.delayMs ?? 1000;

  let lastResult: SendResult = { ok: false, error: "No attempts made." };

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    if (attempt > 0 && delayMs > 0) {
      await new Promise<void>((r) => setTimeout(r, delayMs));
    }

    lastResult = await sendFn(payload);

    if (lastResult.ok) return { ok: true };

    // Non-transient failure: don't retry (client errors such as 400, 401, 403).
    if (!isTransient(lastResult)) break;
  }

  return { ok: false, error: lastResult.error ?? "Failed to record application." };
}

/**
 * Clear the in-flight draft set — call when the panel closes so that stuck
 * in-progress field generations are unblocked on next open / re-trigger.
 */
export function clearInFlight(inFlight: Set<string>): void {
  inFlight.clear();
}
