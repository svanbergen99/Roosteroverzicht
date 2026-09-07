(() => {
  "use strict";

  if (window.__roosterTrafficStandaloneLinkV7) return;
  window.__roosterTrafficStandaloneLinkV7 = true;

  const PAGE_SOURCE = "roosteroverzicht-traffic-page";
  const EXTENSION_SOURCE = "roosteroverzicht-traffic-extension";
  const COLLECTOR_WINDOW_NAMES = ["TrafficCollectorFinalV2", "TrafficCollectorFinalV1"];
  const LINK_HASH = "#traffic-collector-link";
  const RELAY_TIMEOUT_MS = 1800;
  const GATEWAY_TIMEOUT_MS = 3200;

  // Bewaard voor herstel/reference, maar de oude standalone Railway/push-route is bewust 0.0 actief.
  const LEGACY_STANDALONE_RELAY_ENABLED = false;
  let gatewayStartBusy = false;

  function privateCollectorConfig() {
    const traffic = window.RoosterPrivateConfig?.traffic;
    const config = traffic?.collector;
    if (!config || typeof config !== "object") return null;

    const safe = {
      kibanaOrigin: String(config.kibanaOrigin || "").trim(),
      dashboardUrl: String(config.dashboardUrl || "").trim(),
      space: String(config.space || "").trim(),
      dashboardId: String(config.dashboardId || "").trim(),
      dashboardVersion: Number(config.dashboardVersion) || 0,
      trafficPanelId: String(config.trafficPanelId || "").trim(),
      chatBoxUrl: String(config.chatBoxUrl || traffic?.chatBoxUrl || "").trim(),
      // Alleen bewaren voor herstel/reference; de nieuwe collectorroute gebruikt dit veld niet.
      pushUrl: String(config.pushUrl || "").trim()
    };

    return safe.kibanaOrigin && safe.dashboardUrl && safe.space && safe.dashboardId && safe.dashboardVersion && safe.trafficPanelId
      ? safe
      : null;
  }

  function startCollectorThroughGateway(button) {
    if (gatewayStartBusy) return;
    const config = privateCollectorConfig();
    if (!config) {
      if (button) {
        button.disabled = false;
        button.textContent = "Test Traffic";
      }
      return;
    }

    gatewayStartBusy = true;
    if (button) {
      button.disabled = true;
      button.textContent = "Traffic starten…";
    }

    const requestId = crypto.randomUUID?.() || `${Date.now()}-${Math.random()}`;
    let settled = false;

    const finish = (ok) => {
      if (settled) return;
      settled = true;
      gatewayStartBusy = false;
      window.removeEventListener("message", onResponse);
      window.clearTimeout(timer);
      if (!ok && button) {
        button.disabled = false;
        button.textContent = "Test Traffic";
      }
    };

    const onResponse = (event) => {
      if (event.source !== window || event.origin !== window.location.origin) return;
      const message = event.data;
      if (!message || message.source !== EXTENSION_SOURCE || message.type !== "collector-response" || message.requestId !== requestId) return;
      finish(Boolean(message.ok));
    };

    const timer = window.setTimeout(() => finish(false), GATEWAY_TIMEOUT_MS);
    window.addEventListener("message", onResponse);

    // Nieuwe start: geen Railway-token, geen legacy push-endpoint. Alleen collectorconfig + ChatBox/Fake Box gateway.
    window.postMessage({
      source: PAGE_SOURCE,
      type: "collector-start",
      requestId,
      token: "",
      config
    }, window.location.origin);
  }

  // Vang de expliciete Test Traffic-klik vóór traffic-live.js hem via de oude tokenroute kan afhandelen.
  window.addEventListener("click", (event) => {
    const button = event.target?.closest?.("#trafficCollectorTestButton");
    if (!button) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    startCollectorThroughGateway(button);
  }, true);

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

  function safePushUrl(value) {
    try {
      const parsed = new URL(String(value || "").trim());
      const bridgeOrigin = new URL(String(window.RoosterTrafficLive?.getBridgeUrl?.() || "")).origin;
      if (parsed.protocol !== "https:" || parsed.origin !== bridgeOrigin) return "";
      if (parsed.pathname !== "/api/traffic-push" || parsed.username || parsed.password) return "";
      parsed.search = "";
      parsed.hash = "";
      return parsed.href;
    } catch (_) {
      return "";
    }
  }

  function safeHeaderConfig(config) {
    if (!config || typeof config !== "object") return null;
    const safe = {
      space: String(config.space || "").trim(),
      dashboardId: String(config.dashboardId || "").trim(),
      dashboardVersion: Number(config.dashboardVersion) || 0,
      trafficPanelId: String(config.trafficPanelId || "").trim(),
      pushUrl: safePushUrl(config.pushUrl)
    };
    return safe.space && safe.dashboardId && safe.dashboardVersion && safe.pushUrl ? safe : null;
  }

  function linkedOpener() {
    try {
      if (window.opener && !window.opener.closed) return window.opener;
    } catch (_) {}
    return null;
  }

  function namedCollector(name) {
    let collector = null;
    try {
      collector = window.open("", name);
    } catch (_) {
      return null;
    }
    if (!collector) return null;

    try {
      const href = String(collector.location?.href || "");
      if (!href || href === "about:blank" || collector.location?.origin === window.location.origin) {
        try { collector.close(); } catch (_) {}
        return null;
      }
    } catch (_) {
      return collector;
    }
    return collector;
  }

  function collectorCandidates() {
    const candidates = [];
    const opener = linkedOpener();
    if (opener) candidates.push(opener);
    for (const name of COLLECTOR_WINDOW_NAMES) {
      const candidate = namedCollector(name);
      if (candidate && !candidates.includes(candidate)) candidates.push(candidate);
    }
    return candidates;
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

  function relayToken(collector, targetOrigin, token, config) {
    return new Promise((resolve) => {
      const relayId = crypto.randomUUID?.() || `${Date.now()}-${Math.random()}`;
      let settled = false;

      const finish = (ok) => {
        if (settled) return;
        settled = true;
        window.removeEventListener("message", onAck);
        window.clearTimeout(timer);
        resolve(ok);
      };

      const onAck = (event) => {
        if (event.source !== collector || event.origin !== targetOrigin) return;
        const message = event.data;
        if (!message || message.source !== PAGE_SOURCE || message.type !== "traffic-collector-token-ack" || message.relayId !== relayId) return;
        finish(true);
      };

      const timer = window.setTimeout(() => finish(false), RELAY_TIMEOUT_MS);
      window.addEventListener("message", onAck);

      try {
        collector.postMessage({
          source: PAGE_SOURCE,
          type: "traffic-collector-token",
          token,
          relayId,
          config
        }, targetOrigin);
      } catch (_) {
        finish(false);
      }
    });
  }

  async function sendToStandaloneCollector(message) {
    if (!LEGACY_STANDALONE_RELAY_ENABLED) return false;

    const token = String(message.token || "").trim();
    if (!token || token.length > 4096) return false;

    const targetOrigin = resolveTargetOrigin(message.config);
    if (!targetOrigin) return false;
    const config = safeHeaderConfig(message.config);
    if (!config) return false;

    for (const collector of collectorCandidates()) {
      if (await relayToken(collector, targetOrigin, token, config)) return true;
    }
    return false;
  }

  window.addEventListener("message", async (event) => {
    if (event.source !== window || event.origin !== window.location.origin) return;
    const message = event.data;
    if (!message || message.source !== PAGE_SOURCE || message.type !== "collector-start") return;
    if (!LEGACY_STANDALONE_RELAY_ENABLED) return;

    const delivered = await sendToStandaloneCollector(message);
    if (!delivered) return;

    acknowledge(
      message.requestId,
      true,
      "waiting",
      "Tijdelijke Railway-token en push-endpoint zijn bevestigd door de zelfstandige Traffic Collector. Wacht op Railway LIVE ✓."
    );
  });

  if (window.location.hash === LINK_HASH) {
    try { history.replaceState(null, "", `${location.pathname}${location.search}`); } catch (_) {}
  }
})();
