"use strict";

const ROSTER_ORIGIN = "https://svanbergen99.github.io";
const ROSTER_URL_PATTERN = "https://svanbergen99.github.io/Roosteroverzicht/*";
const SESSION_TOKEN_KEY = "trafficCollectorToken";
const SESSION_CONFIG_KEY = "trafficCollectorConfig";
const SESSION_WINDOW_KEY = "trafficCollectorWindowId";
const SESSION_TAB_KEY = "trafficCollectorTabId";
const SESSION_FAKE_BOX_KEY = "trafficCollectorFakeBox";
const SESSION_MONITOR_KEY = "trafficCollectorMonitorState";
const CHAT_BOX_HOST = "kcd-chat-production.up.railway.app";
const MAX_MONITOR_EVENTS = 80;

let pushBusy = false;
let pendingSnapshot = null;
let latestFakeSnapshot = null;
let lastStatus = {
  ok: true,
  status: "idle",
  message: "Collector staat klaar.",
  lastPushAt: null
};

let monitorState = {
  collectorState: "idle",
  startedAt: null,
  sourceConnectedAt: null,
  lastSnapshotAt: null,
  lastDeliveryAt: null,
  receiver: null,
  chatBoxConfigured: false,
  chatBoxAttempted: false,
  fakeFallbackUsed: false,
  snapshotSummary: null,
  latestSnapshot: null,
  events: []
};

function nowIso() {
  return new Date().toISOString();
}

function isRosterSender(sender) {
  const url = String(sender?.tab?.url || sender?.url || "");
  return url.startsWith(`${ROSTER_ORIGIN}/Roosteroverzicht/`);
}

function safeChatBoxUrl(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  try {
    const parsed = new URL(raw);
    if (parsed.protocol !== "https:" || parsed.hostname !== CHAT_BOX_HOST) return "";
    if (parsed.username || parsed.password) return "";
    parsed.hash = "";
    return parsed.href;
  } catch (_) {
    return "";
  }
}

function normalizeConfig(value) {
  if (!value || typeof value !== "object") return null;
  const config = {
    kibanaOrigin: String(value.kibanaOrigin || "").trim().replace(/\/$/, ""),
    dashboardUrl: String(value.dashboardUrl || "").trim(),
    space: String(value.space || "").trim(),
    dashboardId: String(value.dashboardId || "").trim(),
    dashboardVersion: Number(value.dashboardVersion) || 0,
    trafficPanelId: String(value.trafficPanelId || "").trim(),
    chatBoxUrl: safeChatBoxUrl(value.chatBoxUrl),
    // Oude route blijft alleen bewaard in de configuratie. Hij wordt nergens meer aangeroepen.
    pushUrl: String(value.pushUrl || "").trim()
  };
  if (!config.kibanaOrigin || !config.dashboardUrl || !config.space || !config.dashboardId || !config.dashboardVersion || !config.trafficPanelId) return null;
  try {
    const dashboard = new URL(config.dashboardUrl);
    if (dashboard.origin !== config.kibanaOrigin || dashboard.protocol !== "https:") return null;
  } catch (_) {
    return null;
  }
  return config;
}

function rowsCount(value) {
  return Array.isArray(value) ? value.length : 0;
}

function summarizeSnapshot(snapshot) {
  const panels = snapshot?.panels && typeof snapshot.panels === "object" ? snapshot.panels : {};
  const counts = {
    telefonie: rowsCount(panels.telefonie),
    webMessaging: rowsCount(panels.webMessaging),
    webMessagingVandaag: rowsCount(panels.webMessagingVandaag),
    queueStatus: rowsCount(panels.queueStatus),
    email: rowsCount(panels.email)
  };
  return {
    trafficHeader: String(snapshot?.trafficHeader || "Traffic Live"),
    capturedAt: snapshot?.capturedAt || null,
    source: snapshot?.source || "browser-collector",
    panelCounts: counts,
    totalRows: Object.values(counts).reduce((sum, count) => sum + count, 0)
  };
}

async function saveMonitorState() {
  try {
    await chrome.storage.session.set({ [SESSION_MONITOR_KEY]: monitorState });
  } catch (_) {}
}

async function broadcastMonitorState() {
  const tabs = await chrome.tabs.query({ url: ROSTER_URL_PATTERN });
  await Promise.allSettled(tabs.map((tab) => tab.id
    ? chrome.tabs.sendMessage(tab.id, { type: "collector-monitor-state", state: monitorState })
    : Promise.resolve()));
}

async function monitorEvent(step, status, message, extra = {}) {
  const event = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    at: nowIso(),
    step,
    status,
    message,
    ...extra
  };
  monitorState = {
    ...monitorState,
    ...extra.monitorPatch,
    events: [...monitorState.events, event].slice(-MAX_MONITOR_EVENTS)
  };
  delete event.monitorPatch;
  await saveMonitorState();
  await broadcastMonitorState();
}

async function getCollectorConfig() {
  const data = await chrome.storage.session.get(SESSION_CONFIG_KEY);
  return normalizeConfig(data[SESSION_CONFIG_KEY]);
}

async function isKibanaSender(sender) {
  const config = await getCollectorConfig();
  if (!config) return false;
  const url = String(sender?.tab?.url || sender?.url || "");
  return url.startsWith(`${config.kibanaOrigin}/`);
}

async function broadcastStatus(status) {
  lastStatus = { ...lastStatus, ...status };
  monitorState = { ...monitorState, collectorState: lastStatus.status || monitorState.collectorState };
  await saveMonitorState();
  const tabs = await chrome.tabs.query({ url: ROSTER_URL_PATTERN });
  await Promise.allSettled(tabs.map((tab) => tab.id
    ? chrome.tabs.sendMessage(tab.id, { type: "collector-status", ...lastStatus })
    : Promise.resolve()));
}

async function readSessionState() {
  return chrome.storage.session.get([SESSION_TOKEN_KEY, SESSION_CONFIG_KEY, SESSION_WINDOW_KEY, SESSION_TAB_KEY]);
}

async function saveRuntime(token, config) {
  await chrome.storage.session.set({
    [SESSION_TOKEN_KEY]: token,
    [SESSION_CONFIG_KEY]: config
  });
}

async function ensureCollectorWindow(config) {
  const state = await readSessionState();
  const existingWindowId = Number(state[SESSION_WINDOW_KEY]);
  const existingTabId = Number(state[SESSION_TAB_KEY]);

  if (Number.isInteger(existingWindowId) && Number.isInteger(existingTabId)) {
    try {
      const [win, tab] = await Promise.all([
        chrome.windows.get(existingWindowId),
        chrome.tabs.get(existingTabId)
      ]);
      if (win && tab && String(tab.url || "").startsWith(config.kibanaOrigin)) {
        if (win.state !== "minimized") await chrome.windows.update(existingWindowId, { state: "minimized" });
        return { windowId: existingWindowId, tabId: existingTabId, reused: true };
      }
    } catch (_) {}
  }

  const win = await chrome.windows.create({
    url: config.dashboardUrl,
    type: "popup",
    state: "minimized",
    focused: false
  });

  const tab = win.tabs?.[0];
  if (!win.id || !tab?.id) throw new Error("Traffic-achtergrondvenster kon niet worden gestart.");

  await chrome.storage.session.set({
    [SESSION_WINDOW_KEY]: win.id,
    [SESSION_TAB_KEY]: tab.id
  });

  return { windowId: win.id, tabId: tab.id, reused: false };
}

async function startCollector(token, rawConfig) {
  if (token.length > 4096) {
    return { ok: false, status: "error", message: "Collector-toegang is ongeldig." };
  }
  const config = normalizeConfig(rawConfig);
  if (!config) {
    return { ok: false, status: "error", message: "Beveiligde collectorconfiguratie ontbreekt of is ongeldig." };
  }

  monitorState = {
    collectorState: "starting",
    startedAt: nowIso(),
    sourceConnectedAt: null,
    lastSnapshotAt: null,
    lastDeliveryAt: null,
    receiver: null,
    chatBoxConfigured: Boolean(config.chatBoxUrl),
    chatBoxAttempted: false,
    fakeFallbackUsed: false,
    snapshotSummary: null,
    latestSnapshot: null,
    events: []
  };
  await monitorEvent("collector-start", "running", "Collectorstart ontvangen. De echte Kibana-bron wordt geopend.");

  await saveRuntime(token, config);
  await broadcastStatus({ ok: true, status: "starting", message: "Traffic-bron wordt geminimaliseerd op de achtergrond gestart." });
  const result = await ensureCollectorWindow(config);
  await monitorEvent(
    "source-window",
    "ok",
    result.reused ? "Bestaand Kibana collectorvenster opnieuw gebruikt." : "Nieuw Kibana collectorvenster gestart.",
    { monitorPatch: { collectorState: "waiting" } }
  );
  await broadcastStatus({
    ok: true,
    status: "waiting",
    message: result.reused
      ? "Bestaande Traffic-collector wordt gebruikt; wachten op live data…"
      : "Traffic-bron draait op de achtergrond; wachten op de eerste live update…"
  });
  return { ok: true, status: "waiting", message: lastStatus.message };
}

function receivedAck() {
  // ChatBox en Fake Box geven de collector bewust exact dezelfde ACK.
  return { ok: true, status: "received" };
}

async function sendToChatBox(snapshot, config) {
  if (!config.chatBoxUrl) throw new Error("ChatBox-ontvanger is nog niet gekoppeld.");

  await monitorEvent("send-chatbox", "running", "Snapshot wordt met de echte ChatBox-verzendcode aangeboden.", {
    monitorPatch: { chatBoxAttempted: true }
  });

  const response = await fetch(config.chatBoxUrl, {
    method: "POST",
    cache: "no-store",
    credentials: "omit",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      source: "traffic-collector",
      snapshot
    }),
    signal: AbortSignal.timeout(3500)
  });

  let body = null;
  try { body = await response.json(); } catch (_) {}
  if (!response.ok || body?.ok === false) {
    throw new Error(body?.message || `ChatBox gaf HTTP ${response.status}.`);
  }

  const receivedAt = body?.receivedAt || nowIso();
  await monitorEvent("chatbox-ack", "ok", "Ontvangstbevestiging van KCD Chat Box ontvangen.", {
    monitorPatch: {
      receiver: "ChatBox",
      lastDeliveryAt: receivedAt,
      fakeFallbackUsed: false
    }
  });

  return {
    ack: receivedAck(),
    receivedAt
  };
}

async function sendToFakeBox(snapshot, reason = "") {
  const receivedAt = nowIso();
  latestFakeSnapshot = { receivedAt, snapshot };
  try {
    await chrome.storage.session.set({
      [SESSION_FAKE_BOX_KEY]: latestFakeSnapshot
    });
  } catch (_) {
    // De in-memory Fake Box blijft de snapshot vasthouden zolang de service worker leeft.
  }

  await monitorEvent("fake-box", "ok", "Fake KCD Chat Box heeft de snapshot ontvangen en geeft dezelfde echte ACK terug.", {
    reason,
    monitorPatch: {
      receiver: "Fake",
      lastDeliveryAt: receivedAt,
      fakeFallbackUsed: true
    }
  });

  return {
    ack: receivedAck(),
    receivedAt
  };
}

async function deliverSnapshot(snapshot, config) {
  try {
    const result = await sendToChatBox(snapshot, config);
    return { ...result, receiver: "ChatBox" };
  } catch (error) {
    await monitorEvent("chatbox-intercept", "fallback", "Echte ChatBox-route leverde geen ACK op; de Fake Box onderschept de levering.", {
      reason: error?.message || "ChatBox niet bereikbaar"
    });
    const result = await sendToFakeBox(snapshot, error?.message || "ChatBox niet bereikbaar");
    return { ...result, receiver: "Fake" };
  }
}

async function pushSnapshot(snapshot) {
  pendingSnapshot = snapshot;
  if (pushBusy) return;
  pushBusy = true;

  try {
    while (pendingSnapshot) {
      const next = pendingSnapshot;
      pendingSnapshot = null;
      const config = await getCollectorConfig();
      if (!config) {
        await broadcastStatus({ ok: false, status: "error", message: "Collectorconfiguratie ontbreekt. Start Traffic opnieuw." });
        await monitorEvent("config", "error", "Collectorconfiguratie ontbreekt; snapshot kan niet worden afgeleverd.");
        return;
      }

      // Enige uitgaande route: ChatBox. Als die niet bereikbaar is, stopt de snapshot lokaal in Fake Box.
      // De oude config.pushUrl / Railway Traffic Bridge wordt hier bewust NIET gebruikt.
      const delivery = await deliverSnapshot(next, config);
      if (!delivery.ack?.ok || delivery.ack?.status !== "received") {
        await broadcastStatus({ ok: false, status: "error", message: "Ontvanger gaf geen geldige ontvangstbevestiging." });
        await monitorEvent("ack", "error", "Geen geldige received-ACK teruggekregen.");
        return;
      }

      await monitorEvent("delivery-complete", "ok", `Collector kreeg ACK received terug. Werkelijke ontvanger voor de monitor: <${delivery.receiver}>.`, {
        monitorPatch: {
          collectorState: "active",
          receiver: delivery.receiver,
          lastDeliveryAt: delivery.receivedAt
        }
      });

      await broadcastStatus({
        ok: true,
        status: "active",
        message: `Ontvangen <${delivery.receiver}>`,
        lastPushAt: delivery.receivedAt
      });
    }
  } catch (error) {
    await broadcastStatus({ ok: false, status: "error", message: error?.message || "Traffic-data kon niet worden afgeleverd." });
    await monitorEvent("delivery-error", "error", error?.message || "Traffic-data kon niet worden afgeleverd.");
  } finally {
    pushBusy = false;
  }
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  (async () => {
    if (message?.type === "collector-start") {
      if (!isRosterSender(sender)) return { ok: false, status: "error", message: "Onbekende startpagina." };
      return startCollector(String(message.token || ""), message.config);
    }

    if (message?.type === "collector-status-request") {
      if (!isRosterSender(sender)) return { ok: false, status: "error", message: "Onbekende statusaanvraag." };
      return lastStatus;
    }

    if (message?.type === "collector-monitor-request") {
      if (!isRosterSender(sender)) return { ok: false, status: "error", message: "Onbekende monitorpagina." };
      const stored = await chrome.storage.session.get(SESSION_MONITOR_KEY).catch(() => ({}));
      const state = stored?.[SESSION_MONITOR_KEY] || monitorState;
      return { ok: true, status: "monitor", state };
    }

    if (message?.type === "kibana-content-ready") {
      if (!(await isKibanaSender(sender))) return { ok: false };
      const config = await getCollectorConfig();
      const connectedAt = nowIso();
      await monitorEvent("source-connected", "ok", "Kibana content script is verbonden; wachten op echte Traffic-data.", {
        monitorPatch: { sourceConnectedAt: connectedAt, collectorState: "waiting" }
      });
      await broadcastStatus({ ok: true, status: "waiting", message: "Traffic-bron is verbonden; wachten op de eerste live update…" });
      return { ok: true, config };
    }

    if (message?.type === "traffic-snapshot") {
      if (!(await isKibanaSender(sender))) return { ok: false };
      if (!message.snapshot || typeof message.snapshot !== "object") return { ok: false };
      const summary = summarizeSnapshot(message.snapshot);
      const snapshotAt = nowIso();
      monitorState = {
        ...monitorState,
        lastSnapshotAt: snapshotAt,
        snapshotSummary: summary,
        latestSnapshot: message.snapshot
      };
      await monitorEvent("snapshot-collected", "ok", `Echte snapshot verzameld: ${summary.totalRows} regels over ${Object.keys(summary.panelCounts).length} panelgroepen.`, {
        summary,
        monitorPatch: {
          lastSnapshotAt: snapshotAt,
          snapshotSummary: summary,
          latestSnapshot: message.snapshot
        }
      });
      void pushSnapshot(message.snapshot);
      return { ok: true };
    }

    return { ok: false };
  })().then(sendResponse).catch((error) => {
    sendResponse({ ok: false, status: "error", message: error?.message || "Extensiefout." });
  });
  return true;
});

chrome.windows.onRemoved.addListener(async (windowId) => {
  const state = await readSessionState();
  if (Number(state[SESSION_WINDOW_KEY]) !== windowId) return;
  await chrome.storage.session.remove([SESSION_WINDOW_KEY, SESSION_TAB_KEY]);
  await monitorEvent("source-window", "stopped", "Het Kibana collectorvenster is gesloten.", {
    monitorPatch: { collectorState: "stopped" }
  });
  await broadcastStatus({ ok: false, status: "stopped", message: "Het Traffic-achtergrondvenster is gesloten. Start Traffic opnieuw." });
});
