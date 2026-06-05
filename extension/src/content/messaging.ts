import type { BgRequest, BgResponse } from "../shared/types";

/** Promise wrapper around chrome.runtime.sendMessage to the service worker. */
export function send<T = unknown>(msg: BgRequest): Promise<BgResponse<T>> {
  return new Promise((resolve) => {
    try {
      chrome.runtime.sendMessage(msg, (r: BgResponse<T>) => {
        if (chrome.runtime.lastError) {
          resolve({ ok: false, error: chrome.runtime.lastError.message });
        } else {
          resolve(r ?? { ok: false, error: "No response." });
        }
      });
    } catch (e) {
      resolve({ ok: false, error: e instanceof Error ? e.message : "Message failed." });
    }
  });
}
