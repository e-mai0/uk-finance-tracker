import { getAuth, setAuth, clearAuth } from "./shared/storage";
import type { BgRequest, BgResponse } from "./shared/types";

/**
 * Service worker: the only place that holds the API token and talks to the
 * Trackr API. Content scripts and the popup message it; it never exposes the
 * token to page context. Cross-origin fetches are permitted by host_permissions.
 */

async function apiFetch(
  path: string,
  init?: RequestInit,
): Promise<BgResponse> {
  const { token, apiBase } = await getAuth();
  if (!token || !apiBase) return { ok: false, error: "Not connected to Trackr." };

  try {
    const res = await fetch(`${apiBase}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        ...(init?.headers ?? {}),
      },
    });
    const status = res.status;
    let data: unknown = null;
    try {
      data = await res.json();
    } catch {
      /* empty body */
    }
    if (!res.ok) {
      const error =
        (data as { error?: string })?.error ?? `Request failed (${status}).`;
      return { ok: false, error, status };
    }
    return { ok: true, data, status };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Network error." };
  }
}

chrome.runtime.onMessage.addListener(
  (msg: BgRequest, _sender, sendResponse: (r: BgResponse) => void) => {
    (async () => {
      switch (msg.type) {
        case "connect":
          await setAuth({ token: msg.token, apiBase: msg.apiBase });
          sendResponse({ ok: true });
          break;
        case "disconnect":
          await clearAuth();
          sendResponse({ ok: true });
          break;
        case "status": {
          const { token, apiBase } = await getAuth();
          sendResponse({ ok: true, data: { connected: Boolean(token), apiBase } });
          break;
        }
        case "getProfile":
          sendResponse(await apiFetch("/api/ext/profile"));
          break;
        case "getCv":
          sendResponse(await apiFetch("/api/ext/cv"));
          break;
        case "answer":
          sendResponse(
            await apiFetch("/api/ext/answer", {
              method: "POST",
              body: JSON.stringify(msg.payload),
            }),
          );
          break;
        case "trackApplication":
          sendResponse(
            await apiFetch("/api/ext/application", {
              method: "POST",
              body: JSON.stringify(msg.payload),
            }),
          );
          break;
        case "plan":
          sendResponse(
            await apiFetch("/api/ext/plan", {
              method: "POST",
              body: JSON.stringify(msg.payload),
            }),
          );
          break;
        case "agent": {
          // Map the panel payload onto the server wire shape, clamping to the
          // endpoint's zod bounds so an oversized page can't 400 the round.
          const p = msg.payload;
          const body = {
            fields: p.fields.slice(0, 60).map((f) => ({
              fieldId: f.id,
              label: f.label.slice(0, 300),
              type: f.type,
              options: f.options?.slice(0, 40).map((o) => o.slice(0, 200)),
              currentValue: f.currentValue
                ? f.currentValue.slice(0, 2000)
                : undefined,
              required: f.required,
            })),
            context: {
              employer: p.employer?.slice(0, 200),
              role: p.role?.slice(0, 200),
              url: p.url?.slice(0, 2000),
            },
            round: p.round,
          };
          sendResponse(
            await apiFetch("/api/ext/agent", {
              method: "POST",
              body: JSON.stringify(body),
            }),
          );
          break;
        }
        case "saveFact":
          sendResponse(
            await apiFetch("/api/ext/fact", {
              method: "POST",
              body: JSON.stringify(msg.payload),
            }),
          );
          break;
        default:
          sendResponse({ ok: false, error: "Unknown request." });
      }
    })();
    // Keep the message channel open for the async response.
    return true;
  },
);
