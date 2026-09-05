(() => {
  "use strict";

  const HOOK_SOURCE = "roosteroverzicht-traffic-kibana-hook";

  window.addEventListener("message", (event) => {
    if (event.source !== window || event.origin !== window.location.origin) return;
    const message = event.data;
    if (!message || message.source !== HOOK_SOURCE || message.type !== "traffic-snapshot") return;
    if (!message.snapshot || typeof message.snapshot !== "object") return;

    chrome.runtime.sendMessage({
      type: "traffic-snapshot",
      snapshot: message.snapshot
    }).catch(() => {});
  });

  chrome.runtime.sendMessage({ type: "kibana-content-ready" }).catch(() => {});
})();
