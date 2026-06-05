/**
 * Runs on Trackr pages. When the user clicks "Generate connection token" in
 * Settings, the page posts the token via window.postMessage; we capture it and
 * hand it to the background worker along with this Trackr origin as the API base.
 */

window.addEventListener("message", (event) => {
  if (event.source !== window) return;
  const data = event.data;
  if (
    !data ||
    typeof data !== "object" ||
    data.source !== "trackr-extension-connect" ||
    typeof data.token !== "string"
  ) {
    return;
  }

  chrome.runtime.sendMessage(
    { type: "connect", token: data.token, apiBase: window.location.origin },
    () => {
      // Acknowledge back to the page so the UI can confirm the handoff.
      window.postMessage({ source: "trackr-extension-ack", ok: true }, window.location.origin);
    },
  );
});

// Announce presence so the page can show "extension installed" if it wants to.
window.postMessage({ source: "trackr-extension-present" }, window.location.origin);
