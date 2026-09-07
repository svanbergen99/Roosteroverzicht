import "./elastic-sync.js";

const PORT = Number(process.env.PORT || 8787);
const POLL_MS = 5000;
const LOCAL_LIVE_URL = `http://127.0.0.1:${PORT}/api/traffic-live`;
const KCD_CHAT_URL = String(process.env.KCD_CHAT_URL || "").trim().replace(/\/+$/, "");
const KCD_DASHBOARD_EVENT_KEY = String(process.env.KCD_DASHBOARD_EVENT_KEY || "").trim();
const READ_KEY = String(process.env.TRAFFIC_READ_KEY || "").trim();

let lastReceivedAt = "";
let busy = false;

function dashboardSnapshot(snapshot) {
  return {
    trafficHeader: snapshot?.trafficHeader || "Traffic Live",
    capturedAt: snapshot?.capturedAt || null,
    receivedAt: snapshot?.receivedAt || null,
    source: snapshot?.source || "browser-collector",
    panels: snapshot?.panels || {}
  };
}

async function sendDashboardEvent(status, snapshot = null) {
  if (!KCD_CHAT_URL || !KCD_DASHBOARD_EVENT_KEY) {
    return { ok: false, skipped: true };
  }

  const body = { status };
  if (snapshot) body.snapshot = dashboardSnapshot(snapshot);

  const response = await fetch(`${KCD_CHAT_URL}/api/internal/dashboard-status`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-kcd-dashboard-key": KCD_DASHBOARD_EVENT_KEY
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(5000)
  });

  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(payload?.message || `KCD dashboard-status gaf HTTP ${response.status}.`);
  }
  return payload || { ok: true };
}

async function syncOnce() {
  if (busy || !READ_KEY || !KCD_CHAT_URL || !KCD_DASHBOARD_EVENT_KEY) return;

  const response = await fetch(LOCAL_LIVE_URL, {
    headers: { "x-traffic-read-key": READ_KEY },
    signal: AbortSignal.timeout(5000)
  });

  if (response.status === 503) return;
  if (!response.ok) throw new Error(`Lokale Traffic Live gaf HTTP ${response.status}.`);

  const snapshot = await response.json();
  const receivedAt = String(snapshot?.receivedAt || "");
  if (!receivedAt || receivedAt === lastReceivedAt) return;

  lastReceivedAt = receivedAt;
  busy = true;
  try {
    await sendDashboardEvent("received");
    await sendDashboardEvent("sent", snapshot);
    console.log(`[kcd-dashboard] snapshot ${receivedAt} doorgestuurd naar KCD Chat.`);
  } finally {
    busy = false;
  }
}

async function loop() {
  try {
    await syncOnce();
  } catch (error) {
    console.error("[kcd-dashboard]", error?.message || error);
  } finally {
    setTimeout(loop, POLL_MS).unref();
  }
}

setTimeout(loop, 2000).unref();
