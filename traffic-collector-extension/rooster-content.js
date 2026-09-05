(() => {
  "use strict";

  const PAGE_SOURCE = "roosteroverzicht-traffic-page";
  const EXT_SOURCE = "roosteroverzicht-traffic-extension";

  function postToPage(message) {
    window.postMessage({ source: EXT_SOURCE, ...message }, window.location.origin);
  }

  window.addEventListener("message", async (event) => {
    if (event.source !== window || event.origin !== window.location.origin) return;
    const message = event.data;
    if (!message || message.source !== PAGE_SOURCE) return;
    if (message.type !== "collector-start" && message.type !== "collector-status-request") return;

    try {
      const response = await chrome.runtime.sendMessage({
        type: message.type,
        token: typeof message.token === "string" ? message.token : ""
      });
      postToPage({
        type: "collector-response",
        requestId: message.requestId || "",
        ...(response || { ok: false, status: "error", message: "Geen reactie van de extensie." })
      });
    } catch (error) {
      postToPage({
        type: "collector-response",
        requestId: message.requestId || "",
        ok: false,
        status: "error",
        message: error?.message || "De extensie kon niet worden bereikt."
      });
    }
  });

  chrome.runtime.onMessage.addListener((message) => {
    if (!message || message.type !== "collector-status") return;
    postToPage(message);
  });

  postToPage({ type: "collector-ready", ok: true, status: "ready" });
})();
