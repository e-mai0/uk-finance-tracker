import "server-only";

/**
 * Shared response helpers for the /api/ext/* extension API.
 *
 * Auth is via bearer token (not cookies), so CORS is not a security boundary
 * here — we allow any origin so the extension can call these endpoints from
 * either its service worker or a content script.
 */

export const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type",
  "Access-Control-Max-Age": "86400",
};

export function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...CORS_HEADERS },
  });
}

export function unauthorized(): Response {
  return json({ error: "Invalid or missing token." }, 401);
}

export function preflight(): Response {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}
