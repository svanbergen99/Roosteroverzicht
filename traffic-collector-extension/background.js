"use strict";

const ROSTER_ORIGIN = "https://svanbergen99.github.io";
const ROSTER_URL_PATTERN = "https://svanbergen99.github.io/Roosteroverzicht/*";
const SESSION_TOKEN_KEY = "trafficCollectorToken";
const SESSION_CONFIG_KEY = "trafficCollectorConfig";
const SESSION_WINDOW_KEY = "trafficCollectorWindowId";
const SESSION_TAB_KEY = "trafficCollectorTabId";

let pushBusy = false;
let pendingSnapshot = null;
let lastStatus = {
  ok: true,
  status: "idle",
  message: "Collector staat klaar.",
  lastPushAt: null
};

function isRosterSender(sender) {
  const url = String(sender?.tab?.url || sender?.url || "");
  return url.startsWith(`${ROSTER_ORIGIN}/Roosteroverzicht/`);
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
    pushUrl: String(value.pushUrl || "").trim()
  };
  if (!config.kibanaOrigin || !config.dashboardUrl || !config.space || !config.dashboardId || !config.dashboardVersion || !config.trafficPanelId || !config.pushUrl) return null;
  try {
    const dashboard = new URL(config.dashboardUrl);
    const push = new URL(config.pushUrl);
    if (dashboard.origin !== config.kibanaOrigin || dashboard.protocol !== "https:" || push.protocol !== "https:") return null;
  } catch (_) {
    return null;
  }
  return config;
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

async function getCollectorToken() {
  const data = await chrome.storage.session.get(SESSION_TOKEN_KEY);
  return String(data[SESSION_TOKEN_KEY] || "");
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
  if (!token || token.length > 4096) {
    return { ok: false, status: "error", message: "Collector-toegang ontbreekt of is ongeldig." };
  }
  const config = normalizeConfig(rawConfig);
  if (!config) {
    return { ok: false, status: "error", message: "Beveiligde collectorconfiguratie ontbreekt of is ongeldig." };
  }

  await saveRuntime(token, config);
  await broadcastStatus({ ok: true, status: "starting", message: "Traffic-bron wordt geminimaliseerd op de achtergrond gestart." });
  const result = await ensureCollectorWindow(config);
  await broadcastStatus({
    ok: true,
    status: "waiting",
    message: result.reused
      ? "Bestaande Traffic-collector wordt gebruikt; wachten op live data…"
      : "Traffic-bron draait op de achtergrond; wachten op de eerste live update…"
  });
  return { ok: true, status: "waiting", message: lastStatus.message };
}

async function pushSnapshot(snapshot) {
  pendingSnapshot = snapshot;
  if (pushBusy) return;
  pushBusy = true;

  try {
    while (pendingSnapshot) {
      const next = pendingSnapshot;
      pendingSnapshot = null;
      const [token, config] = await Promise.all([getCollectorToken(), getCollectorConfig()]);
      if (!token || !config) {
        await broadcastStatus({ ok: false, status: "error", message: "Collector-toegang is verlopen. Start Traffic opnieuw vanuit Roosteroverzicht." });
        return;
      }

      const response = await fetch(config.pushUrl, {
        method: "POST",
        cache: "no-store",
        credentials: "omit",
        headers: {
          "content-type": "application/json",
          "x-traffic-collector-token": token
        },
        body: JSON.stringify(next)
      });

      let body = null;
      try { body = await response.json(); } catch (_) {}

      if (!response.ok) {
        if (response.status === 401) await chrome.storage.session.remove(SESSION_TOKEN_KEY);
        await broadcastStatus({ ok: false, status: "error", message: body?.message || `Bridge gaf HTTP ${response.status}.` });
        return;
      }

      const lastPushAt = body?.receivedAt || new Date().toISOString();
      await broadcastStatus({ ok: true, status: "active", message: "Collector actief. De Traffic-bron blijft geminimaliseerd op de achtergrond.", lastPushAt });
    }
  } catch (error) {
    await broadcastStatus({ ok: false, status: "error", message: error?.message || "Traffic-data kon niet naar de bridge worden verstuurd." });
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

    if (message?.type === "kibana-content-ready") {
      if (!(await isKibanaSender(sender))) return { ok: false };
      const config = await getCollectorConfig();
      await broadcastStatus({ ok: true, status: "waiting", message: "Traffic-bron is verbonden; wachten op de eerste live update…" });
      return { ok: true, config };
    }

    if (message?.type === "traffic-snapshot") {
      if (!(await isKibanaSender(sender))) return { ok: false };
      if (!message.snapshot || typeof message.snapshot !== "object") return { ok: false };
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
  await broadcastStatus({ ok: false, status: "stopped", message: "Het Traffic-achtergrondvenster is gesloten. Start Traffic opnieuw." });
});
