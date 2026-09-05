(() => {
  "use strict";

  const BRIDGE_BASE = "https://fluffy-palm-tree-6v4w9vj6xxx9f5g56-8787.app.github.dev";
  const LIVE_URL = `${BRIDGE_BASE}/api/traffic-live`;
  const REFRESH_MS = 5000;
  const TIME_ZONE = "Europe/Amsterdam";

  const app = document.getElementById("app");
  const searchCard = document.querySelector(".search-card");
  if (!app || !searchCard) return;

  let readKey = "";
  let promptAttempted = false;
  let refreshTimer = null;
  let requestBusy = false;
  let lastSnapshot = null;

  function isRosterPage() {
    return !app.hidden &&
      document.body.classList.contains("roster-access-active") &&
      !document.body.classList.contains("public-portal-mode");
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function number(value) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  function formatNumber(value) {
    const parsed = number(value);
    if (parsed === null) return "—";
    return new Intl.NumberFormat("nl-NL", { maximumFractionDigits: 0 }).format(parsed);
  }

  function formatDuration(value) {
    const parsed = number(value);
    if (parsed === null) return "—";
    const total = Math.max(0, Math.round(parsed));
    const hours = Math.floor(total / 3600);
    const minutes = Math.floor((total % 3600) / 60);
    const seconds = total % 60;
    if (hours) return `${hours}u ${String(minutes).padStart(2, "0")}m ${String(seconds).padStart(2, "0")}s`;
    if (minutes) return `${minutes}m ${String(seconds).padStart(2, "0")}s`;
    return `${seconds}s`;
  }

  function formatPercent(value) {
    const parsed = number(value);
    if (parsed === null) return "—";
    return `${new Intl.NumberFormat("nl-NL", { maximumFractionDigits: 1 }).format(parsed)}%`;
  }

  function reachability(item) {
    const answered = number(item?.answeredTime);
    const abandoned = number(item?.abandonedTime);
    if (answered === null || abandoned === null) return null;
    const total = answered + abandoned;
    return total > 0 ? (answered / total) * 100 : null;
  }

  function asa(item) {
    const answered = number(item?.answered) ?? number(item?.answeredTime);
    const speedAnswered = number(item?.speedAnswered) ?? 0;
    const speedFlowOut = number(item?.speedFlowOut) ?? 0;
    if (!answered || answered <= 0) return null;
    return (speedAnswered + speedFlowOut) / answered;
  }

  function formatUpdatedAt(value) {
    if (!value) return "";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "";
    return new Intl.DateTimeFormat("nl-NL", {
      timeZone: TIME_ZONE,
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit"
    }).format(date);
  }

  function ensurePanel() {
    if (!isRosterPage()) return null;

    let panel = document.getElementById("trafficLivePanel");
    if (!panel) {
      panel = document.createElement("section");
      panel.id = "trafficLivePanel";
      panel.className = "traffic-live-panel";
      panel.setAttribute("aria-label", "Traffic Live");
      panel.innerHTML = `
        <div class="traffic-live-head">
          <div>
            <div class="traffic-live-kicker">Traffic Live</div>
            <h2 id="trafficLiveTitle" class="traffic-live-title">Live verkeersinformatie</h2>
          </div>
          <div class="traffic-live-head-actions">
            <span id="trafficLiveStatus" class="traffic-live-status">Nog niet verbonden</span>
            <button id="trafficLiveKeyButton" class="traffic-live-key-button" type="button">Verbinden</button>
          </div>
        </div>
        <div id="trafficLiveBody" class="traffic-live-body">
          <div class="traffic-live-placeholder">Na het ontgrendelen wordt de live Traffic-data geladen.</div>
        </div>`;

      panel.querySelector("#trafficLiveKeyButton")?.addEventListener("click", () => {
        promptForReadKey(true);
      });
    }

    const bar = document.getElementById("trafficTodayBar");
    if (bar && panel.previousElementSibling !== bar) {
      bar.after(panel);
    } else if (!panel.isConnected) {
      const salaryBar = document.getElementById("nextSalaryPaymentBar");
      if (salaryBar) salaryBar.after(panel);
      else searchCard.prepend(panel);
    }

    return panel;
  }

  function setStatus(text, state = "") {
    const panel = ensurePanel();
    const status = panel?.querySelector("#trafficLiveStatus");
    if (!status) return;
    status.textContent = text;
    status.dataset.state = state;
  }

  function setKeyButton(text, hidden = false) {
    const button = ensurePanel()?.querySelector("#trafficLiveKeyButton");
    if (!button) return;
    button.textContent = text;
    button.hidden = hidden;
  }

  function table(title, columns, rows) {
    const body = Array.isArray(rows) && rows.length
      ? rows.map((row) => `<tr>${columns.map((column) => `<td data-label="${escapeHtml(column.label)}">${column.render(row)}</td>`).join("")}</tr>`).join("")
      : `<tr><td class="traffic-live-empty" colspan="${columns.length}">Geen gegevens</td></tr>`;

    return `
      <section class="traffic-live-section">
        <h3>${escapeHtml(title)}</h3>
        <div class="traffic-live-table-wrap">
          <table class="traffic-live-table">
            <thead><tr>${columns.map((column) => `<th>${escapeHtml(column.label)}</th>`).join("")}</tr></thead>
            <tbody>${body}</tbody>
          </table>
        </div>
      </section>`;
  }

  function renderSnapshot(snapshot) {
    const panel = ensurePanel();
    if (!panel) return;

    const title = panel.querySelector("#trafficLiveTitle");
    if (title) title.textContent = snapshot?.trafficHeader || "Traffic Live";

    const panels = snapshot?.panels || {};
    const queue = (row) => `<strong>${escapeHtml(row?.queue || "—")}</strong>`;

    const telefonie = table("Telefonie", [
      { label: "Queue", render: queue },
      { label: "Aanbod", render: (row) => formatNumber(row?.aangeboden) },
      { label: "Wachtenden", render: (row) => formatNumber(row?.wachtenden) },
      { label: "Langste wachttijd", render: (row) => formatDuration(row?.langsteWachttijd) },
      { label: "ASA", render: (row) => formatDuration(asa(row)) },
      { label: "Bereikbaarheid", render: (row) => formatPercent(reachability(row)) }
    ], panels.telefonie);

    const webMessaging = table("Web Messaging – nu", [
      { label: "Queue", render: queue },
      { label: "Wachtenden", render: (row) => formatNumber(row?.wachtenden) },
      { label: "Langste wachttijd", render: (row) => formatDuration(row?.langsteWachttijd) }
    ], panels.webMessaging);

    const webMessagingVandaag = table("Web Messaging – vandaag", [
      { label: "Queue", render: queue },
      { label: "Aanbod", render: (row) => formatNumber(row?.aangeboden) },
      { label: "Beantwoord", render: (row) => formatNumber(row?.beantwoord) },
      { label: "Wachtenden", render: (row) => formatNumber(row?.wachtenden) },
      { label: "Langste wachttijd", render: (row) => formatDuration(row?.langsteWachttijd) },
      { label: "Bereikbaarheid", render: (row) => formatPercent(reachability(row)) }
    ], panels.webMessagingVandaag);

    const queueStatus = table("Queue Status", [
      { label: "Queue", render: queue },
      { label: "Beschikbaar", render: (row) => formatNumber(row?.beschikbaar) },
      { label: "Ingelogd", render: (row) => formatNumber(row?.ingelogd) },
      { label: "Pauze", render: (row) => formatNumber(row?.pauze) }
    ], panels.queueStatus);

    const email = table("E-mail", [
      { label: "Queue", render: queue },
      { label: "Openstaande voorraad", render: (row) => formatNumber(row?.voorraad) },
      { label: "Langste wachttijd", render: (row) => formatDuration(row?.langsteWachttijd) }
    ], panels.email);

    const body = panel.querySelector("#trafficLiveBody");
    if (body) body.innerHTML = `<div class="traffic-live-grid">${telefonie}${webMessaging}${webMessagingVandaag}${queueStatus}${email}</div>`;

    const updated = formatUpdatedAt(snapshot?.capturedAt || snapshot?.receivedAt);
    if (snapshot?.stale) {
      const ageSeconds = Math.max(0, Math.round((number(snapshot?.ageMs) || 0) / 1000));
      setStatus(`Verouderd • ${ageSeconds}s geleden`, "stale");
    } else {
      setStatus(updated ? `Live • ${updated}` : "Live", "live");
    }
    setKeyButton("Verbonden", true);
  }

  function renderMessage(message) {
    const body = ensurePanel()?.querySelector("#trafficLiveBody");
    if (body) body.innerHTML = `<div class="traffic-live-placeholder">${escapeHtml(message)}</div>`;
  }

  async function loadTraffic() {
    if (!isRosterPage() || !readKey || requestBusy) return;
    requestBusy = true;

    try {
      const response = await fetch(LIVE_URL, {
        method: "GET",
        credentials: "omit",
        cache: "no-store",
        headers: { "x-traffic-read-key": readKey }
      });

      let data = null;
      try { data = await response.json(); } catch (_) {}

      if (response.status === 401) {
        readKey = "";
        setStatus("Sleutel ongeldig", "error");
        setKeyButton("Sleutel opnieuw invoeren", false);
        renderMessage("De Traffic read key is niet geldig.");
        stopPolling();
        return;
      }

      if (!response.ok) {
        const message = data?.message || `Traffic Live gaf HTTP ${response.status}.`;
        setStatus("Niet beschikbaar", "error");
        renderMessage(message);
        return;
      }

      lastSnapshot = data;
      renderSnapshot(data);
    } catch (_) {
      setStatus("Bridge niet bereikbaar", "error");
      if (!lastSnapshot) renderMessage("Traffic Live kan de bridge momenteel niet bereiken.");
      setKeyButton(readKey ? "Opnieuw proberen" : "Verbinden", false);
    } finally {
      requestBusy = false;
    }
  }

  function startPolling() {
    if (!readKey || !isRosterPage()) return;
    loadTraffic();
    if (refreshTimer !== null) return;
    refreshTimer = window.setInterval(loadTraffic, REFRESH_MS);
  }

  function stopPolling() {
    if (refreshTimer === null) return;
    window.clearInterval(refreshTimer);
    refreshTimer = null;
  }

  function promptForReadKey(force = false) {
    if (!isRosterPage()) return;
    if (readKey && !force) {
      startPolling();
      return;
    }

    const value = String(window.prompt("Voer je TRAFFIC_READ_KEY in. Deze sleutel wordt niet opgeslagen in de repo.") || "").trim();
    if (!value) {
      setStatus("Niet verbonden", "");
      setKeyButton("Verbinden", false);
      return;
    }

    readKey = value;
    setStatus("Verbinden…", "loading");
    setKeyButton("Verbinden…", true);
    startPolling();
  }

  function sync() {
    if (!isRosterPage()) {
      stopPolling();
      document.getElementById("trafficLivePanel")?.remove();
      return;
    }

    ensurePanel();
    if (!promptAttempted) {
      promptAttempted = true;
      window.setTimeout(() => promptForReadKey(false), 120);
    } else if (readKey) {
      startPolling();
    }
  }

  window.addEventListener("rooster-unlocked", () => window.setTimeout(sync, 0));
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) return;
    if (isRosterPage() && readKey) loadTraffic();
  });

  const observer = new MutationObserver(sync);
  observer.observe(document.body, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ["class", "hidden"]
  });

  window.setTimeout(sync, 0);

  window.RoosterTrafficLive = Object.freeze({
    refresh: loadTraffic,
    reconnect: () => promptForReadKey(true),
    getBridgeUrl: () => BRIDGE_BASE,
    getLastSnapshot: () => lastSnapshot
  });
})();
