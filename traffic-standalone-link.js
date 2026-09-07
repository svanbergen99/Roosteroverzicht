(() => {
  "use strict";

  if (window.__roosterTrafficStandaloneLinkV1) return;
  window.__roosterTrafficStandaloneLinkV1 = true;

  const PAGE_SOURCE = "roosteroverzicht-traffic-page";
  const EXTENSION_SOURCE = "roosteroverzicht-traffic-extension";
  const COLLECTOR_WINDOW_NAME = "TrafficCollectorFinalV1";

  function resolveTargetOrigin(config) {
    try {
      const origin = new URL(String(config?.kibanaOrigin || "")).origin;
      const parsed = new URL(origin);
      if (parsed.protocol !== "https:") return "";
      if (!/\.kb\.eu-west-1\.aws\.found\.io$/i.test(parsed.hostname)) return "";
      return origin;
    } catch (_) {
      return "";
    }
  }

  function findStandaloneCollector() {
    let collector = null;
    try {
      collector = window.open("", COLLECTOR_WINDOW_NAME);
    } catch (_) {
      return null;
    }
    if (!collector) return null;

    // Als er nog geen collector met deze naam bestaat, maakt window.open een
    // eigen about:blank-venster aan. Dat sluiten we direct weer. Een bestaande
    // Kibana-collector is cross-origin; uitlezen van location geeft dan bewust
    // een SecurityError en bevestigt juist dat het bestaande venster is gevonden.
    try {
      const href = String(collector.location?.href || "");
      if (!href || href === "about:blank") {
        try { collector.close(); } catch (_) {}
        return null;
      }
      if (collector.location?.origin === window.location.origin) {
        try { collector.close(); } catch (_) {}
        return null;
      }
    } catch (_) {
      return collector;
    }

    return collector;
  }

  function acknowledge(requestId, ok, status, message) {
    if (!requestId) return;
    window.postMessage({
      source: EXTENSION_SOURCE,
      type: "collector-response",
      requestId,
      ok,
      status,
      message
    }, window.location.origin);
  }

  window.addEventListener("message", (event) => {
    if (event.source !== window || event.origin !== window.location.origin) return;
    const message = event.data;
    if (!message || message.source !== PAGE_SOURCE || message.type !== "collector-start") return;

    const token = String(message.token || "").trim();
    if (!token || token.length > 4096) return;

    const targetOrigin = resolveTargetOrigin(message.config);
    if (!targetOrigin) return;

    const collector = findStandaloneCollector();
    if (!collector) return; // Oude extensieroute blijft dan ongemoeid functioneren.

    try {
      collector.postMessage({
        source: PAGE_SOURCE,
        type: "traffic-collector-token",
        token
      }, targetOrigin);

      acknowledge(
        message.requestId,
        true,
        "waiting",
        "Tijdelijke Railway-token is naar de zelfstandige Traffic Collector gestuurd. Wacht op Railway LIVE ✓."
      );
    } catch (_) {
      acknowledge(
        message.requestId,
        false,
        "error",
        "De zelfstandige Traffic Collector kon niet worden gekoppeld."
      );
    }
  });
})();
