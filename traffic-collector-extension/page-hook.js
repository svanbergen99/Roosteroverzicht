(() => {
  "use strict";

  if (window.__roosterTrafficHookInstalled) return;
  window.__roosterTrafficHookInstalled = true;

  const HOOK_SOURCE = "roosteroverzicht-traffic-kibana-hook";
  const SPACE = "/s/centraal-beheer";
  const DASHBOARD_ID = "731a7b2c-c25f-4ff6-a032-5f62ef6d2272";
  const DASHBOARD_VERSION = 3;
  const TRAFFIC_PANEL_ID = "aeb4840f-bb0e-4ac1-bac1-6e7892075291";
  const TIME_ZONE = "Europe/Amsterdam";

  let headerCacheDay = "";
  let headerCacheValue = "Traffic Live";
  let decodeBusy = false;
  let pendingResponseText = "";

  function todayKey() {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: TIME_ZONE,
      year: "numeric",
      month: "2-digit",
      day: "2-digit"
    }).formatToParts(new Date());
    const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
    return `${value.year}-${value.month}-${value.day}`;
  }

  function stripMarkdownHeading(markdown) {
    return String(markdown || "").replace(/^\s*#{1,6}\s*/u, "").trim();
  }

  async function getTrafficHeader() {
    const day = todayKey();
    if (headerCacheDay === day && headerCacheValue) return headerCacheValue;

    try {
      const response = await fetch(`${SPACE}/api/content_management/rpc/get`, {
        method: "POST",
        credentials: "include",
        cache: "no-store",
        headers: {
          "content-type": "application/json",
          "kbn-xsrf": "roosteroverzicht-traffic-collector"
        },
        body: JSON.stringify({
          contentTypeId: "dashboard",
          id: DASHBOARD_ID,
          version: DASHBOARD_VERSION
        })
      });
      if (!response.ok) return headerCacheValue;
      const dashboard = await response.json();
      const panels = dashboard?.result?.result?.item?.attributes?.panels;
      const panel = Array.isArray(panels)
        ? panels.find((item) => item?.panelIndex === TRAFFIC_PANEL_ID)
          || panels.find((item) => /\bTraffic\b/i.test(String(item?.panelConfig?.savedVis?.params?.markdown || "")))
        : null;
      const header = stripMarkdownHeading(panel?.panelConfig?.savedVis?.params?.markdown);
      if (header) {
        headerCacheDay = day;
        headerCacheValue = header;
      }
    } catch (_) {}

    return headerCacheValue;
  }

  function asNumber(value) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  function numericValue(node) {
    if (node === null || node === undefined) return null;
    if (typeof node === "number") return asNumber(node);
    if (typeof node !== "object") return asNumber(node);
    return asNumber(node.value)
      ?? asNumber(node.metric?.value)
      ?? asNumber(node.value_as_string);
  }

  function metric(bucket, bucketKey, metricKey) {
    return numericValue(bucket?.[bucketKey]?.[metricKey])
      ?? numericValue(bucket?.[bucketKey])
      ?? numericValue(bucket?.[metricKey]);
  }

  function count(bucket, bucketKey) {
    return asNumber(bucket?.[bucketKey]?.doc_count)
      ?? asNumber(bucket?.[bucketKey]?.[bucketKey]?.doc_count)
      ?? 0;
  }

  function buckets(response) {
    const candidates = [
      response?.result?.rawResponse?.aggregations?.["0"]?.buckets,
      response?.result?.result?.rawResponse?.aggregations?.["0"]?.buckets,
      response?.rawResponse?.aggregations?.["0"]?.buckets,
      response?.result?.rawResponse?.aggregations?.[0]?.buckets,
      response?.result?.result?.rawResponse?.aggregations?.[0]?.buckets
    ];
    return candidates.find(Array.isArray) || [];
  }

  async function inflateChunk(chunk) {
    const binary = atob(chunk);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
    const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("deflate"));
    const text = await new Response(stream).text();
    return JSON.parse(text);
  }

  async function decodeBsearch(text) {
    const chunks = String(text || "").trim().split(/\s+/).filter(Boolean);
    const decoded = [];
    for (const chunk of chunks) {
      try { decoded.push(await inflateChunk(chunk)); } catch (_) {}
    }
    return decoded;
  }

  function buildSnapshot(responses, trafficHeader) {
    if (!Array.isArray(responses) || responses.length < 5) return null;

    const telefonie = buckets(responses[0]).map((bucket) => ({
      queue: String(bucket?.key ?? ""),
      aangeboden: metric(bucket, "1-bucket", "1-metric"),
      wachtenden: metric(bucket, "2-bucket", "2-metric"),
      langsteWachttijd: metric(bucket, "3-bucket", "3-metric"),
      speedAnswered: metric(bucket, "4-bucket", "4-metric"),
      speedFlowOut: metric(bucket, "5-bucket", "5-metric"),
      answered: count(bucket, "6-bucket"),
      answeredTime: metric(bucket, "7-bucket", "7-metric"),
      abandonedTime: metric(bucket, "8-bucket", "8-metric")
    }));

    const webMessaging = buckets(responses[1]).map((bucket) => ({
      queue: String(bucket?.key ?? ""),
      wachtenden: metric(bucket, "1-bucket", "1-metric"),
      langsteWachttijd: metric(bucket, "2-bucket", "2-metric")
    }));

    const webMessagingVandaag = buckets(responses[2]).map((bucket) => ({
      queue: String(bucket?.key ?? ""),
      aangeboden: metric(bucket, "1-bucket", "1-metric"),
      beantwoord: metric(bucket, "2-bucket", "2-metric"),
      langsteWachttijd: metric(bucket, "3-bucket", "3-metric"),
      wachtenden: count(bucket, "4-bucket"),
      answeredTime: metric(bucket, "5-bucket", "5-metric"),
      abandonedTime: metric(bucket, "6-bucket", "6-metric")
    }));

    const queueStatus = buckets(responses[3]).map((bucket) => ({
      queue: String(bucket?.key ?? ""),
      beschikbaar: count(bucket, "1-bucket"),
      ingelogd: count(bucket, "2-bucket"),
      pauze: count(bucket, "3-bucket")
    }));

    const email = buckets(responses[4]).map((bucket) => ({
      queue: String(bucket?.key ?? ""),
      voorraad: metric(bucket, "1-bucket", "1-metric"),
      langsteWachttijd: metric(bucket, "2-bucket", "2-metric")
    }));

    if (![telefonie, webMessaging, webMessagingVandaag, queueStatus, email].some((items) => items.length)) return null;

    return {
      trafficHeader: trafficHeader || "Traffic Live",
      capturedAt: new Date().toISOString(),
      panels: {
        telefonie,
        webMessaging,
        webMessagingVandaag,
        queueStatus,
        email
      }
    };
  }

  async function processBsearch(text) {
    pendingResponseText = text;
    if (decodeBusy) return;
    decodeBusy = true;

    try {
      while (pendingResponseText) {
        const current = pendingResponseText;
        pendingResponseText = "";
        const [responses, trafficHeader] = await Promise.all([
          decodeBsearch(current),
          getTrafficHeader()
        ]);
        const snapshot = buildSnapshot(responses, trafficHeader);
        if (!snapshot) continue;
        window.postMessage({
          source: HOOK_SOURCE,
          type: "traffic-snapshot",
          snapshot
        }, window.location.origin);
      }
    } finally {
      decodeBusy = false;
    }
  }

  const originalOpen = XMLHttpRequest.prototype.open;
  const originalSend = XMLHttpRequest.prototype.send;

  XMLHttpRequest.prototype.open = function(method, url, ...rest) {
    this.__roosterTrafficUrl = String(url || "");
    return originalOpen.call(this, method, url, ...rest);
  };

  XMLHttpRequest.prototype.send = function(...args) {
    const url = String(this.__roosterTrafficUrl || "");
    if (url.includes("/internal/bsearch") && url.includes("compress=true")) {
      this.addEventListener("load", () => {
        try {
          if (typeof this.responseText === "string" && this.responseText.trim()) {
            void processBsearch(this.responseText);
          }
        } catch (_) {}
      }, { once: true });
    }
    return originalSend.apply(this, args);
  };
})();
