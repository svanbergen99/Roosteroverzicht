(() => {
  "use strict";

  const DASHBOARD_ID = "731a7b2c-c25f-4ff6-a032-5f62ef6d2272";
  const ORIGIN = "https://achmea-production-1-a3srealtime-eu-west-1-prod.kb.eu-west-1.aws.found.io";
  const BASE = `${ORIGIN}/s/centraal-beheer`;
  const DASHBOARD_URL = `${BASE}/app/dashboards#/view/${DASHBOARD_ID}?embed=true&_g=(refreshInterval%3A(pause%3A!f%2Cvalue%3A5000)%2Ctime%3A(from%3Anow%2Fd%2Cto%3Anow%2Fd))&show-top-menu=true&show-query-input=true&show-time-filter=true`;
  const WINDOW_NAME = "roosterTrafficLiveDashboard";
  const RELAY_TARGET_WINDOW = "roosterTrafficRelayTarget";
  const RELAY_MESSAGE = "ROOSTER_TRAFFIC_RELAY_V1";
  const RELAY_ACK = "ROOSTER_TRAFFIC_RELAY_ACK_V1";
  const RELAY_STORAGE_KEY = "roosterTrafficRelayStateV1";
  const RELAY_STALE_MS = 5 * 60 * 1000;
  const MAX_HEADER_LENGTH = 500;

  const app = document.getElementById("app");
  if (!app) return;

  let dashboardWindow = null;
  let relayState = null;

  try {
    window.name = RELAY_TARGET_WINDOW;
  } catch (_) {}

  function isRosterPage() {
    return !app.hidden && !document.body.classList.contains("public-portal-mode");
  }

  function loadRelayState() {
    try {
      const parsed = JSON.parse(sessionStorage.getItem(RELAY_STORAGE_KEY) || "null");
      if (!parsed || typeof parsed !== "object") return null;
      if (typeof parsed.trafficHeader !== "string" || !parsed.trafficHeader.trim()) return null;
      if (!Number.isFinite(parsed.receivedAt)) return null;
      return parsed;
    } catch (_) {
      return null;
    }
  }

  function saveRelayState() {
    try {
      if (relayState) sessionStorage.setItem(RELAY_STORAGE_KEY, JSON.stringify(relayState));
    } catch (_) {}
  }

  function getFreshRelayState() {
    if (!relayState) return null;
    if (Date.now() - relayState.receivedAt > RELAY_STALE_MS) return null;
    return relayState;
  }

  function getOfficialHeader() {
    return getFreshRelayState()?.trafficHeader || "";
  }

  function applyOfficialHeader() {
    const bar = document.getElementById("trafficTodayBar");
    if (!bar) return;

    const state = getFreshRelayState();
    if (!state) {
      if (bar.dataset.trafficLiveSource === "kibana-relay") {
        delete bar.dataset.trafficLiveSource;
      }
      return;
    }

    const header = state.trafficHeader;
    if (bar.textContent !== header || bar.dataset.trafficLiveSource !== "kibana-relay") {
      bar.textContent = header;
      bar.dataset.trafficLiveSource = "kibana-relay";
      bar.hidden = false;
    }
  }

  function formatLastUpdate(state) {
    if (!state) return "Relay niet verbonden";
    try {
      const time = new Intl.DateTimeFormat("nl-NL", {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit"
      }).format(new Date(state.receivedAt));
      return `Live via Kibana relay · ${time}`;
    } catch (_) {
      return "Live via Kibana relay";
    }
  }

  function openDashboard() {
    try {
      if (dashboardWindow && !dashboardWindow.closed) {
        dashboardWindow.location.href = DASHBOARD_URL;
        dashboardWindow.focus();
        return dashboardWindow;
      }
    } catch (_) {}

    dashboardWindow = window.open(DASHBOARD_URL, WINDOW_NAME);
    if (dashboardWindow) dashboardWindow.focus?.();
    return dashboardWindow;
  }

  function ensureControls() {
    if (!isRosterPage()) return null;
    const bar = document.getElementById("trafficTodayBar");
    if (!bar) return null;

    let controls = document.getElementById("trafficLiveControls");
    if (!controls) {
      controls = document.createElement("div");
      controls.id = "trafficLiveControls";
      controls.className = "traffic-live-controls";
      controls.innerHTML = `
        <button id="trafficLiveToggle" class="traffic-live-button" type="button">Kibana Traffic openen ↗</button>
        <span id="trafficLiveNote" class="traffic-live-note">Relay niet verbonden</span>`;
      bar.after(controls);
      controls.querySelector("#trafficLiveToggle")?.addEventListener("click", openDashboard);
    }

    const state = getFreshRelayState();
    controls.classList.toggle("is-live", Boolean(state));
    const note = controls.querySelector("#trafficLiveNote");
    if (note) note.textContent = formatLastUpdate(state);
    return controls;
  }

  function acceptRelayMessage(event) {
    if (event.origin !== ORIGIN) return;
    const data = event.data;
    if (!data || data.type !== RELAY_MESSAGE || !data.payload) return;

    const header = String(data.payload.trafficHeader || "").trim();
    if (!header || header.length > MAX_HEADER_LENGTH) return;

    relayState = {
      trafficHeader: header,
      dashboardUpdatedAt: data.payload.dashboardUpdatedAt || null,
      fetchedAt: data.payload.fetchedAt || null,
      receivedAt: Date.now()
    };
    saveRelayState();
    applyOfficialHeader();
    ensureControls();

    try {
      event.source?.postMessage({ type: RELAY_ACK }, ORIGIN);
    } catch (_) {}

    window.dispatchEvent(new CustomEvent("traffic-relay-update", {
      detail: { trafficHeader: header }
    }));
  }

  function sync() {
    if (!isRosterPage()) {
      document.getElementById("trafficLiveControls")?.remove();
      document.getElementById("trafficLivePanel")?.remove();
      return;
    }
    ensureControls();
    applyOfficialHeader();
  }

  relayState = loadRelayState();
  window.addEventListener("message", acceptRelayMessage);
  window.addEventListener("rooster-unlocked", () => window.setTimeout(sync, 0));

  const observer = new MutationObserver(sync);
  observer.observe(document.body, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ["class", "hidden"]
  });

  window.setInterval(sync, 15000);
  window.setTimeout(sync, 0);

  window.RoosterTrafficLive = Object.freeze({
    open: openDashboard,
    test: openDashboard,
    getOfficialHeader,
    getRelayState: () => getFreshRelayState(),
    getDiagnostic: () => getFreshRelayState()
      ? "Traffic Live ontvangt de officiële header via de ingelogde Kibana browser-relay."
      : "Traffic Live wacht op de Kibana browser-relay.",
    getUrls: () => ({ dashboard: DASHBOARD_URL })
  });
})();
