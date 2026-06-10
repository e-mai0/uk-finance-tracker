import { timingSafeEqual } from "node:crypto";

/**
 * Constant-time check that the request carries `Authorization: Bearer ${CRON_SECRET}`.
 * Fails closed when CRON_SECRET is unset.
 */
export function cronAuthorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const header = req.headers.get("authorization") ?? "";
  const expected = `Bearer ${secret}`;
  const a = Buffer.from(header);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
