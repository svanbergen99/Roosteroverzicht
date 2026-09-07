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
    if (!["collector-start", "collector-status-request", "collector-monitor-request"].includes(message.type)) return;

    try {
      const response = await chrome.runtime.sendMessage({
        type: message.type,
        token: typeof message.token === "string" ? message.token : "",
        config: message.type === "collector-start" && message.config && typeof message.config === "object"
          ? message.config
          : undefined
      });
      postToPage({
        type: message.type === "collector-monitor-request" ? "collector-monitor-response" : "collector-response",
        requestId: message.requestId || "",
        ...(response || { ok: false, status: "error", message: "Geen reactie van de extensie." })
      });
    } catch (error) {
      postToPage({
        type: message.type === "collector-monitor-request" ? "collector-monitor-response" : "collector-response",
        requestId: message.requestId || "",
        ok: false,
        status: "error",
        message: error?.message || "De extensie kon niet worden bereikt."
      });
    }
  });

  chrome.runtime.onMessage.addListener((message) => {
    if (!message || !["collector-status", "collector-monitor-state"].includes(message.type)) return;
    postToPage(message);
  });

  postToPage({ type: "collector-ready", ok: true, status: "ready" });
})();
