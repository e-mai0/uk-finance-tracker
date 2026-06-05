import type { StoredAuth } from "./types";

export async function getAuth(): Promise<StoredAuth> {
  const v = await chrome.storage.local.get(["token", "apiBase"]);
  return { token: v.token, apiBase: v.apiBase };
}

export async function setAuth(auth: StoredAuth): Promise<void> {
  await chrome.storage.local.set(auth);
}

export async function clearAuth(): Promise<void> {
  await chrome.storage.local.remove(["token", "apiBase"]);
}
