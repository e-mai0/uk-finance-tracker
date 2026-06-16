import { send } from "../content/messaging";

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

const statusEl = $<HTMLDivElement>("status");
const connectForm = $<HTMLDivElement>("connectForm");
const disconnectBtn = $<HTMLButtonElement>("disconnect");
const connectBtn = $<HTMLButtonElement>("connect");
const tokenInput = $<HTMLInputElement>("token");
const apiBaseSelect = $<HTMLSelectElement>("apiBase");
const msg = $<HTMLDivElement>("msg");
const activateBtn = $<HTMLButtonElement>("activate");

function setMsg(text: string, ok = false) {
  msg.textContent = text;
  msg.className = "msg " + (ok ? "ok" : "err");
}

async function refresh() {
  const res = await send<{ connected: boolean; apiBase?: string }>({ type: "status" });
  const connected = res.ok && res.data?.connected;
  if (connected) {
    statusEl.textContent = `Connected to ${res.data?.apiBase ?? "Trackr"}`;
    statusEl.className = "status connected";
    connectForm.classList.add("hide");
    disconnectBtn.classList.remove("hide");
  } else {
    statusEl.textContent = "Not connected";
    statusEl.className = "status disconnected";
    connectForm.classList.remove("hide");
    disconnectBtn.classList.add("hide");
  }
}

connectBtn.addEventListener("click", async () => {
  const token = tokenInput.value.trim();
  const apiBase = apiBaseSelect.value;
  if (!token.startsWith("trk_")) {
    setMsg("That doesn’t look like a Trackr token (starts with trk_).");
    return;
  }
  const res = await send({ type: "connect", token, apiBase });
  if (res.ok) {
    setMsg("Connected.", true);
    tokenInput.value = "";
    await refresh();
  } else {
    setMsg(res.error ?? "Could not connect.");
  }
});

disconnectBtn.addEventListener("click", async () => {
  await send({ type: "disconnect" });
  setMsg("Disconnected.", true);
  await refresh();
});

/** Send trackr:activate to a tab; resolves true if a content script received it. */
function sendActivate(tabId: number): Promise<boolean> {
  return new Promise((resolve) => {
    chrome.tabs.sendMessage(tabId, { type: "trackr:activate" }, () => {
      // lastError === "no receiving end" means no content script is present.
      resolve(!chrome.runtime.lastError);
    });
  });
}

/**
 * Two-tier activation:
 *  - Tier 1 (known ATS): the content script is already injected — just message it.
 *  - Tier 2 (any other page, e.g. a Google Form or a bespoke careers portal):
 *    nothing is listening, so inject the content script on demand. activeTab
 *    (granted by this very click on the extension action) authorises the inject
 *    without a broad host permission. Then message the fresh script to engage.
 */
activateBtn.addEventListener("click", async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) { setMsg("No active tab."); return; }

  if (await sendActivate(tab.id)) {
    setMsg("Activated — look bottom-right of the page.", true);
    setTimeout(() => window.close(), 700);
    return;
  }

  // Tier 2: locate the index content script's built file(s) from the manifest
  // (CRXJS hashes the name, so we read it at runtime) and inject them.
  const cs = chrome.runtime
    .getManifest()
    .content_scripts?.find((c) => c.js?.some((f) => f.includes("index")));
  if (!cs?.js?.length) { setMsg("Couldn’t locate the content script to inject."); return; }

  try {
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: cs.js });
  } catch {
    setMsg("Can’t run on this page (e.g. Chrome system or Web Store pages).");
    return;
  }
  await sendActivate(tab.id);
  setMsg("Activated — look bottom-right of the page.", true);
  setTimeout(() => window.close(), 700);
});

void refresh();
