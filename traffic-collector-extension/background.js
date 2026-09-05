"use strict";

const ROSTER_ORIGIN = "https://svanbergen99.github.io";
const ROSTER_URL_PATTERN = "https://svanbergen99.github.io/Roosteroverzicht/*";
const KIBANA_ORIGIN = "https://achmea-production-1-a3srealtime-eu-west-1-prod.kb.eu-west-1.aws.found.io";
const DASHBOARD_URL = `${KIBANA_ORIGIN}/s/centraal-beheer/app/dashboards#/view/731a7b2c-c25f-4ff6-a032-5f62ef6d2272?_g=(filters:!())`;
const BRIDGE_PUSH_URL = "https://roosteroverzicht-traffic-bridge-production.up.railway.app/api/traffic-push";
const SESSION_TOKEN_KEY = "trafficCollectorToken";
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

function isKibanaSender(sender) {
  const url = String(sender?.tab?.url || sender?.url || "");
  return url.startsWith(`${KIBANA_ORIGIN}/`);
}

async function broadcastStatus(status) {
  lastStatus = { ...lastStatus, ...status };
  const tabs = await chrome.tabs.query({ url: ROSTER_URL_PATTERN });
  await Promise.allSettled(tabs.map((tab) => tab.id
    ? chrome.tabs.sendMessage(tab.id, { type: "collector-status", ...lastStatus })
    : Promise.resolve()));
}

async function readSessionState() {
  return chrome.storage.session.get([SESSION_TOKEN_KEY, SESSION_WINDOW_KEY, SESSION_TAB_KEY]);
}

async function saveCollectorToken(token) {
  await chrome.storage.session.set({ [SESSION_TOKEN_KEY]: token });
}

async function getCollectorToken() {
  const data = await chrome.storage.session.get(SESSION_TOKEN_KEY);
  return String(data[SESSION_TOKEN_KEY] || "");
}

async function ensureCollectorWindow() {
  const state = await readSessionState();
  const existingWindowId = Number(state[SESSION_WINDOW_KEY]);
  const existingTabId = Number(state[SESSION_TAB_KEY]);

  if (Number.isInteger(existingWindowId) && Number.isInteger(existingTabId)) {
    try {
      const [win, tab] = await Promise.all([
        chrome.windows.get(existingWindowId),
        chrome.tabs.get(existingTabId)
      ]);
      if (win && tab && String(tab.url || "").startsWith(KIBANA_ORIGIN)) {
        if (win.state !== "minimized") await chrome.windows.update(existingWindowId, { state: "minimized" });
        return { windowId: existingWindowId, tabId: existingTabId, reused: true };
      }
    } catch (_) {}
  }

  const win = await chrome.windows.create({
    url: DASHBOARD_URL,
    type: "popup",
    state: "minimized",
    focused: false
  });

  const tab = win.tabs?.[0];
  if (!win.id || !tab?.id) throw new Error("Kibana-achtergrondvenster kon niet worden gestart.");

  await chrome.storage.session.set({
    [SESSION_WINDOW_KEY]: win.id,
    [SESSION_TAB_KEY]: tab.id
  });

  return { windowId: win.id, tabId: tab.id, reused: false };
}

async function startCollector(token) {
  if (!token || token.length > 4096) {
    return { ok: false, status: "error", message: "Collector-toegang ontbreekt of is ongeldig." };
  }

  await saveCollectorToken(token);
  await broadcastStatus({
    ok: true,
    status: "starting",
    message: "Kibana wordt geminimaliseerd op de achtergrond gestart."
  });

  const result = await ensureCollectorWindow();

  await broadcastStatus({
    ok: true,
    status: "waiting",
    message: result.reused
      ? "Bestaande Kibana-collector wordt gebruikt; wachten op live data…"
      : "Kibana draait op de achtergrond; wachten op de eerste live update…"
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
      const token = await getCollectorToken();
      if (!token) {
        await broadcastStatus({
          ok: false,
          status: "error",
          message: "Collector-toegang is verlopen. Start Traffic opnieuw vanuit Roosteroverzicht."
        });
        return;
      }

      const response = await fetch(BRIDGE_PUSH_URL, {
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
        await broadcastStatus({
          ok: false,
          status: "error",
          message: body?.message || `Railway gaf HTTP ${response.status}.`
        });
        return;
      }

      const lastPushAt = body?.receivedAt || new Date().toISOString();
      await broadcastStatus({
        ok: true,
        status: "active",
        message: "Collector actief. Kibana blijft geminimaliseerd op de achtergrond.",
        lastPushAt
      });
    }
  } catch (error) {
    await broadcastStatus({
      ok: false,
      status: "error",
      message: error?.message || "Traffic-data kon niet naar Railway worden verstuurd."
    });
  } finally {
    pushBusy = false;
  }
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  (async () => {
    if (message?.type === "collector-start") {
      if (!isRosterSender(sender)) return { ok: false, status: "error", message: "Onbekende startpagina." };
      return startCollector(String(message.token || ""));
    }

    if (message?.type === "collector-status-request") {
      if (!isRosterSender(sender)) return { ok: false, status: "error", message: "Onbekende statusaanvraag." };
      return lastStatus;
    }

    if (message?.type === "kibana-content-ready") {
      if (!isKibanaSender(sender)) return { ok: false };
      await broadcastStatus({
        ok: true,
        status: "waiting",
        message: "Kibana is verbonden; wachten op de eerste Traffic-update…"
      });
      return { ok: true };
    }

    if (message?.type === "traffic-snapshot") {
      if (!isKibanaSender(sender)) return { ok: false };
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
  await broadcastStatus({
    ok: false,
    status: "stopped",
    message: "Het Kibana-achtergrondvenster is gesloten. Start Traffic opnieuw."
  });
});
