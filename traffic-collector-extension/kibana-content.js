(() => {
  "use strict";

  const HOOK_SOURCE = "roosteroverzicht-traffic-kibana-hook";

  function postConfig(config) {
    if (!config || typeof config !== "object") return;
    window.postMessage({
      source: HOOK_SOURCE,
      type: "traffic-config",
      config
    }, window.location.origin);
  }

  function requestConfig() {
    return chrome.runtime.sendMessage({ type: "kibana-content-ready" })
      .then((response) => {
        if (response?.ok && response.config) postConfig(response.config);
      })
      .catch(() => {});
  }

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

  requestConfig();
  window.setTimeout(requestConfig, 250);
  window.setTimeout(requestConfig, 1000);
})();
