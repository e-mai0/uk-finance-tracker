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

activateBtn.addEventListener("click", async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) { setMsg("No active tab."); return; }
  // Broadcast to all frames; the frame with a form will engage.
  chrome.tabs.sendMessage(tab.id, { type: "trackr:activate" }, () => {
    // Swallow "no receiving end" when the content script isn't injected here.
    void chrome.runtime.lastError;
  });
  setMsg("Activated — look bottom-right of the page.", true);
  setTimeout(() => window.close(), 700);
});

void refresh();
