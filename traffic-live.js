(() => {
  "use strict";

  const ACCESS_CONFIG_URL = "traffic-access.json";
  const REFRESH_MS = 5000;
  const TIME_ZONE = "Europe/Amsterdam";
  const ACCESS_AAD = "roosteroverzicht-traffic-read-key-v1";
  const COLLECTOR_PAGE_SOURCE = "roosteroverzicht-traffic-page";
  const COLLECTOR_EXTENSION_SOURCE = "roosteroverzicht-traffic-extension";

  const app = document.getElementById("app");
  const searchCard = document.querySelector(".search-card");
  const unlockForm = document.getElementById("unlockForm");
  const rosterId = document.getElementById("rosterId");
  const rosterPassword = document.getElementById("rosterPassword");
  if (!app || !searchCard) return;

  const encoder = new TextEncoder();
  const decoder = new TextDecoder();

  let readKey = "";
  let pendingId = "";
  let pendingPassword = "";
  let accessConfigPromise = null;
  let unlockBusy = false;
  let refreshTimer = null;
  let requestBusy = false;
  let lastSnapshot = null;
  let collectorStartBusy = false;
  let collectorPopup = null;
  let collectorRequestTimer = null;
  let collectorRequestId = "";

  function privateTraffic() {
    const config = window.RoosterPrivateConfig?.traffic;
    return config && typeof config === "object" ? config : {};
  }

  function liveUrl() {
    return String(privateTraffic().liveUrl || "").trim();
  }

  function collectorConfig() {
    const config = privateTraffic().collector;
    if (!config || typeof config !== "object") return null;
    const safe = {
      kibanaOrigin: String(config.kibanaOrigin || "").trim(),
      dashboardUrl: String(config.dashboardUrl || "").trim(),
      space: String(config.space || "").trim(),
      dashboardId: String(config.dashboardId || "").trim(),
      dashboardVersion: Number(config.dashboardVersion) || 0,
      trafficPanelId: String(config.trafficPanelId || "").trim(),
      pushUrl: String(config.pushUrl || "").trim()
    };
    return safe.kibanaOrigin && safe.dashboardUrl && safe.space && safe.dashboardId && safe.dashboardVersion && safe.trafficPanelId && safe.pushUrl
      ? safe
      : null;
  }

  function collectorTokenUrl() {
    const direct = String(privateTraffic().collectorTokenUrl || "").trim();
    if (direct) return direct;
    const live = liveUrl();
    if (!live) return "";
    try {
      const url = new URL(live);
      url.pathname = "/api/traffic-collector-token";
      url.search = "";
      url.hash = "";
      return url.href;
    } catch (_) {
      return "";
    }
  }

  function bridgeBase() {
    const live = liveUrl();
    if (!live) return "";
    try { return new URL(live).origin; } catch (_) { return ""; }
  }

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

  function base64ToBytes(value) {
    const binary = atob(String(value || ""));
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
    return bytes;
  }

  function number(value) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  function formatNumber(value) {
    const parsed = number(value);
    return parsed === null ? "—" : new Intl.NumberFormat("nl-NL", { maximumFractionDigits: 0 }).format(parsed);
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
    return parsed === null ? "—" : `${new Intl.NumberFormat("nl-NL", { maximumFractionDigits: 1 }).format(parsed)}%`;
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

  function ensureCollectorStyles() {
    if (document.getElementById("trafficCollectorPopupStyles")) return;
    const style = document.createElement("style");
    style.id = "trafficCollectorPopupStyles";
    style.textContent = `
      .traffic-collector-popup{position:fixed;z-index:2147483000;top:92px;right:22px;width:min(360px,calc(100vw - 28px));overflow:hidden;border:1px solid rgba(71,85,105,.22);border-radius:16px;background:rgba(255,255,255,.985);box-shadow:0 22px 60px rgba(15,23,42,.2);font-family:inherit;color:#172033}
      .traffic-collector-popup[hidden]{display:none!important}.traffic-collector-popup-head{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:12px 13px;background:linear-gradient(135deg,#f8fafc,#f4edf3);border-bottom:1px solid #e2e8f0;cursor:move;user-select:none;touch-action:none}
      .traffic-collector-popup-title{min-width:0}.traffic-collector-popup-kicker{font-size:10px;font-weight:900;letter-spacing:.08em;text-transform:uppercase;color:#6b3a67}.traffic-collector-popup-title strong{display:block;margin-top:2px;font-size:14px;line-height:1.25}
      .traffic-collector-popup-close{flex:0 0 auto;width:30px;height:30px;border:1px solid #d8dee7;border-radius:9px;background:#fff;color:#64748b;font-size:18px;line-height:1;cursor:pointer}.traffic-collector-popup-body{padding:14px}.traffic-collector-popup-state{display:flex;align-items:center;gap:10px;padding:11px;border:1px solid #e2e8f0;border-radius:12px;background:#f8fafc}
      .traffic-collector-popup-dot{width:10px;height:10px;flex:0 0 10px;border-radius:999px;background:#94a3b8;box-shadow:0 0 0 4px rgba(148,163,184,.14)}.traffic-collector-popup[data-state="starting"] .traffic-collector-popup-dot,.traffic-collector-popup[data-state="waiting"] .traffic-collector-popup-dot{background:#8b5a86}.traffic-collector-popup[data-state="active"] .traffic-collector-popup-dot{background:#2f8a4d}.traffic-collector-popup[data-state="error"] .traffic-collector-popup-dot,.traffic-collector-popup[data-state="stopped"] .traffic-collector-popup-dot{background:#c2414f}
      .traffic-collector-popup-copy{min-width:0}.traffic-collector-popup-copy strong{display:block;font-size:13px}.traffic-collector-popup-copy span{display:block;margin-top:2px;color:#64748b;font-size:11.5px;line-height:1.4}.traffic-collector-popup-note{margin-top:10px;color:#64748b;font-size:11px;line-height:1.45}.traffic-collector-popup-note b{color:#334155}@media(max-width:560px){.traffic-collector-popup{left:14px!important;right:14px!important;top:72px;width:auto}}
    `;
    document.head.appendChild(style);
  }

  function makeCollectorPopupDraggable(popup) {
    const handle = popup.querySelector(".traffic-collector-popup-head");
    if (!handle || handle.dataset.dragBound === "true") return;
    handle.dataset.dragBound = "true";
    let dragging = false, startX = 0, startY = 0, startLeft = 0, startTop = 0;
    handle.addEventListener("pointerdown", (event) => {
      if (event.button !== 0 || event.target.closest("button")) return;
      const rect = popup.getBoundingClientRect();
      dragging = true; startX = event.clientX; startY = event.clientY; startLeft = rect.left; startTop = rect.top;
      popup.style.left = `${rect.left}px`; popup.style.top = `${rect.top}px`; popup.style.right = "auto";
      handle.setPointerCapture?.(event.pointerId); event.preventDefault();
    });
    handle.addEventListener("pointermove", (event) => {
      if (!dragging) return;
      const maxLeft = Math.max(8, window.innerWidth - popup.offsetWidth - 8);
      const maxTop = Math.max(8, window.innerHeight - popup.offsetHeight - 8);
      popup.style.left = `${Math.min(maxLeft, Math.max(8, startLeft + event.clientX - startX))}px`;
      popup.style.top = `${Math.min(maxTop, Math.max(8, startTop + event.clientY - startY))}px`;
    });
    const end = (event) => { if (!dragging) return; dragging = false; try { handle.releasePointerCapture?.(event.pointerId); } catch (_) {} };
    handle.addEventListener("pointerup", end); handle.addEventListener("pointercancel", end);
  }

  function ensureCollectorPopup() {
    ensureCollectorStyles();
    if (collectorPopup?.isConnected) return collectorPopup;
    collectorPopup = document.createElement("aside");
    collectorPopup.id = "trafficCollectorPopup";
    collectorPopup.className = "traffic-collector-popup";
    collectorPopup.dataset.state = "idle";
    collectorPopup.setAttribute("role", "status");
    collectorPopup.innerHTML = `<div class="traffic-collector-popup-head"><div class="traffic-collector-popup-title"><div class="traffic-collector-popup-kicker">Edge extensie</div><strong>Roosteroverzicht Traffic Collector</strong></div><button class="traffic-collector-popup-close" type="button" aria-label="Verberg collectorvenster">×</button></div><div class="traffic-collector-popup-body"><div class="traffic-collector-popup-state"><span class="traffic-collector-popup-dot" aria-hidden="true"></span><div class="traffic-collector-popup-copy"><strong id="trafficCollectorPopupTitle">Klaar om te starten</strong><span id="trafficCollectorPopupMessage">De collectorconfiguratie wordt pas na ontgrendelen beschikbaar.</span></div></div><div class="traffic-collector-popup-note"><b>Achtergrondmodus:</b> de extensie gebruikt een geminimaliseerd venster. Je blijft in Roosteroverzicht werken.</div></div>`;
    document.body.appendChild(collectorPopup);
    collectorPopup.querySelector(".traffic-collector-popup-close")?.addEventListener("click", () => { collectorPopup.hidden = true; });
    makeCollectorPopupDraggable(collectorPopup);
    return collectorPopup;
  }

  function setCollectorPopupStatus(state, title, message) {
    const popup = ensureCollectorPopup();
    popup.hidden = false; popup.dataset.state = state || "idle";
    const titleEl = popup.querySelector("#trafficCollectorPopupTitle");
    const messageEl = popup.querySelector("#trafficCollectorPopupMessage");
    if (titleEl) titleEl.textContent = title || "Traffic Collector";
    if (messageEl) messageEl.textContent = message || "";
  }

  function setCollectorButtonState(state) {
    const button = document.getElementById("trafficCollectorTestButton");
    if (!button) return;
    if (state === "active") { button.textContent = "Traffic actief"; button.disabled = false; return; }
    if (state === "starting" || state === "waiting") { button.textContent = "Traffic starten…"; button.disabled = true; return; }
    button.textContent = "Test Traffic"; button.disabled = false;
  }

  async function requestCollectorToken() {
    const url = collectorTokenUrl();
    if (!url) throw new Error("De beveiligde Traffic-endpointconfiguratie ontbreekt.");
    if (!readKey) throw new Error("Traffic-toegang is nog niet klaar. Wacht een paar seconden en probeer opnieuw.");
    const response = await fetch(url, {
      method: "POST", credentials: "omit", cache: "no-store",
      headers: { "content-type": "application/json", "x-traffic-read-key": readKey }
    });
    let data = null; try { data = await response.json(); } catch (_) {}
    if (!response.ok || !data?.token) throw new Error(data?.message || `Collector-toegang gaf HTTP ${response.status}.`);
    return data.token;
  }

  function sendCollectorStart(token) {
    return new Promise((resolve, reject) => {
      const config = collectorConfig();
      if (!config) { reject(new Error("De beveiligde Traffic Collector-configuratie ontbreekt.")); return; }
      if (collectorRequestTimer) window.clearTimeout(collectorRequestTimer);
      collectorRequestId = crypto.randomUUID?.() || `${Date.now()}-${Math.random()}`;
      collectorRequestTimer = window.setTimeout(() => {
        collectorRequestTimer = null; collectorRequestId = "";
        reject(new Error("De Traffic Collector-extensie is niet geïnstalleerd of reageert niet."));
      }, 3000);

      const onResponse = (event) => {
        if (event.source !== window || event.origin !== window.location.origin) return;
        const message = event.data;
        if (!message || message.source !== COLLECTOR_EXTENSION_SOURCE || message.type !== "collector-response" || message.requestId !== collectorRequestId) return;
        window.removeEventListener("message", onResponse);
        if (collectorRequestTimer) window.clearTimeout(collectorRequestTimer);
        collectorRequestTimer = null; collectorRequestId = "";
        if (message.ok) resolve(message); else reject(new Error(message.message || "De extensie kon de collector niet starten."));
      };

      window.addEventListener("message", onResponse);
      window.postMessage({ source: COLLECTOR_PAGE_SOURCE, type: "collector-start", requestId: collectorRequestId, token, config }, window.location.origin);
    });
  }

  async function startTrafficCollector() {
    if (collectorStartBusy) return;
    collectorStartBusy = true; setCollectorButtonState("starting");
    setCollectorPopupStatus("starting", "Extensie controleren…", "Beveiligde collector-toegang wordt voorbereid.");
    try {
      const token = await requestCollectorToken();
      setCollectorPopupStatus("starting", "Achtergrondvenster voorbereiden…", "De extensie start de beveiligde Traffic-bron geminimaliseerd.");
      const response = await sendCollectorStart(token);
      const state = response?.status || "waiting";
      setCollectorPopupStatus(state, state === "active" ? "Collector actief" : "Verbonden met extensie", response?.message || "Wachten op de eerste Traffic-update…");
      setCollectorButtonState(state);
    } catch (error) {
      setCollectorPopupStatus("error", "Collector kon niet starten", error?.message || "Onbekende extensiefout.");
      setCollectorButtonState("error");
    } finally {
      collectorStartBusy = false;
      const button = document.getElementById("trafficCollectorTestButton");
      if (button && button.disabled && button.textContent === "Traffic starten…") button.disabled = false;
    }
  }

  function handleCollectorExtensionMessage(event) {
    if (event.source !== window || event.origin !== window.location.origin) return;
    const message = event.data;
    if (!message || message.source !== COLLECTOR_EXTENSION_SOURCE || message.type !== "collector-status") return;
    const state = message.status || "idle";
    const time = message.lastPushAt ? formatUpdatedAt(message.lastPushAt) : "";
    const title = state === "active" ? `Collector actief${time ? ` • ${time}` : ""}` : state === "waiting" ? "Bron verbonden" : state === "starting" ? "Collector starten…" : state === "stopped" ? "Collector gestopt" : state === "error" ? "Collectorfout" : "Traffic Collector";
    setCollectorPopupStatus(state, title, message.message || "");
    setCollectorButtonState(state);
  }
  window.addEventListener("message", handleCollectorExtensionMessage);

  function ensurePanel() {
    if (!isRosterPage()) return null;
    let panel = document.getElementById("trafficLivePanel");
    if (!panel) {
      panel = document.createElement("section");
      panel.id = "trafficLivePanel"; panel.className = "traffic-live-panel"; panel.setAttribute("aria-label", "Traffic Live");
      panel.innerHTML = `<div class="traffic-live-head"><div><div class="traffic-live-kicker">Traffic Live</div><h2 id="trafficLiveTitle" class="traffic-live-title">Live verkeersinformatie</h2></div><div class="traffic-live-head-actions"><button id="trafficCollectorTestButton" class="traffic-live-key-button" type="button">Test Traffic</button><span id="trafficLiveStatus" class="traffic-live-status">Automatisch verbinden…</span></div></div><div id="trafficLiveBody" class="traffic-live-body"><div class="traffic-live-placeholder">Na het ontgrendelen wordt de live Traffic-data automatisch geladen.</div></div>`;
    }
    const testButton = panel.querySelector("#trafficCollectorTestButton");
    if (testButton && testButton.dataset.collectorBound !== "true") { testButton.dataset.collectorBound = "true"; testButton.addEventListener("click", startTrafficCollector); }
    const bar = document.getElementById("trafficTodayBar");
    if (bar && panel.previousElementSibling !== bar) bar.after(panel);
    else if (!panel.isConnected) {
      const salaryBar = document.getElementById("nextSalaryPaymentBar");
      if (salaryBar) salaryBar.after(panel); else searchCard.prepend(panel);
    }
    return panel;
  }

  function setStatus(text, state = "") {
    const status = ensurePanel()?.querySelector("#trafficLiveStatus");
    if (!status) return; status.textContent = text; status.dataset.state = state;
  }

  function table(title, columns, rows) {
    const body = Array.isArray(rows) && rows.length
      ? rows.map((row) => `<tr>${columns.map((column) => `<td data-label="${escapeHtml(column.label)}">${column.render(row)}</td>`).join("")}</tr>`).join("")
      : `<tr><td class="traffic-live-empty" colspan="${columns.length}">Geen gegevens</td></tr>`;
    return `<section class="traffic-live-section"><h3>${escapeHtml(title)}</h3><div class="traffic-live-table-wrap"><table class="traffic-live-table"><thead><tr>${columns.map((column) => `<th>${escapeHtml(column.label)}</th>`).join("")}</tr></thead><tbody>${body}</tbody></table></div></section>`;
  }

  function renderSnapshot(snapshot) {
    const panel = ensurePanel(); if (!panel) return;
    const title = panel.querySelector("#trafficLiveTitle"); if (title) title.textContent = snapshot?.trafficHeader || "Traffic Live";
    const panels = snapshot?.panels || {}; const queue = (row) => `<strong>${escapeHtml(row?.queue || "—")}</strong>`;
    const telefonie = table("Telefonie", [
      { label:"Queue",render:queue },{ label:"Aanbod",render:(row)=>formatNumber(row?.aangeboden) },{ label:"Wachtenden",render:(row)=>formatNumber(row?.wachtenden) },{ label:"Langste wachttijd",render:(row)=>formatDuration(row?.langsteWachttijd) },{ label:"ASA",render:(row)=>formatDuration(asa(row)) },{ label:"Bereikbaarheid",render:(row)=>formatPercent(reachability(row)) }
    ], panels.telefonie);
    const webMessaging = table("Web Messaging – nu", [
      { label:"Queue",render:queue },{ label:"Wachtenden",render:(row)=>formatNumber(row?.wachtenden) },{ label:"Langste wachttijd",render:(row)=>formatDuration(row?.langsteWachttijd) }
    ], panels.webMessaging);
    const webMessagingVandaag = table("Web Messaging – vandaag", [
      { label:"Queue",render:queue },{ label:"Aanbod",render:(row)=>formatNumber(row?.aangeboden) },{ label:"Beantwoord",render:(row)=>formatNumber(row?.beantwoord) },{ label:"Wachtenden",render:(row)=>formatNumber(row?.wachtenden) },{ label:"Langste wachttijd",render:(row)=>formatDuration(row?.langsteWachttijd) },{ label:"Bereikbaarheid",render:(row)=>formatPercent(reachability(row)) }
    ], panels.webMessagingVandaag);
    const queueStatus = table("Queue Status", [
      { label:"Queue",render:queue },{ label:"Beschikbaar",render:(row)=>formatNumber(row?.beschikbaar) },{ label:"Ingelogd",render:(row)=>formatNumber(row?.ingelogd) },{ label:"Pauze",render:(row)=>formatNumber(row?.pauze) }
    ], panels.queueStatus);
    const email = table("E-mail", [
      { label:"Queue",render:queue },{ label:"Openstaande voorraad",render:(row)=>formatNumber(row?.voorraad) },{ label:"Langste wachttijd",render:(row)=>formatDuration(row?.langsteWachttijd) }
    ], panels.email);
    const body = panel.querySelector("#trafficLiveBody"); if (body) body.innerHTML = `<div class="traffic-live-grid">${telefonie}${webMessaging}${webMessagingVandaag}${queueStatus}${email}</div>`;
    const updated = formatUpdatedAt(snapshot?.capturedAt || snapshot?.receivedAt);
    if (snapshot?.stale) setStatus(`Verouderd • ${Math.max(0, Math.round((number(snapshot?.ageMs) || 0) / 1000))}s geleden`, "stale");
    else setStatus(updated ? `Live • ${updated}` : "Live", "live");
  }

  function renderMessage(message) {
    const body = ensurePanel()?.querySelector("#trafficLiveBody");
    if (body) body.innerHTML = `<div class="traffic-live-placeholder">${escapeHtml(message)}</div>`;
  }

  async function getAccessConfig() {
    if (!accessConfigPromise) {
      accessConfigPromise = fetch(`${ACCESS_CONFIG_URL}?v=${Date.now()}`, { cache: "no-store" }).then(async (response) => {
        if (response.status === 404) { const error = new Error("Traffic-toegang is nog niet gekoppeld."); error.code = "ACCESS_NOT_CONFIGURED"; throw error; }
        if (!response.ok) throw new Error(`Traffic-toegang kon niet worden geladen (HTTP ${response.status}).`);
        const config = await response.json();
        if (config?.kind !== "roosteroverzicht-traffic-access" || config?.encrypted !== true || !config.crypto || !config.payload) throw new Error("Traffic-toegang heeft een ongeldig formaat.");
        return config;
      }).catch((error) => { accessConfigPromise = null; throw error; });
    }
    return accessConfigPromise;
  }

  async function decryptReadKey(id, password) {
    const config = await getAccessConfig(); const cryptoInfo = config.crypto || {};
    const secret = encoder.encode(`${id}\u0000${password}`);
    const keyMaterial = await crypto.subtle.importKey("raw", secret, "PBKDF2", false, ["deriveKey"]);
    const key = await crypto.subtle.deriveKey({ name:"PBKDF2", hash:cryptoInfo.hash || "SHA-256", salt:base64ToBytes(cryptoInfo.salt), iterations:Number(cryptoInfo.iterations) || 250000 }, keyMaterial, { name:"AES-GCM", length:Number(cryptoInfo.keyLength) || 256 }, false, ["decrypt"]);
    const plaintext = await crypto.subtle.decrypt({ name:"AES-GCM", iv:base64ToBytes(cryptoInfo.iv), additionalData:encoder.encode(cryptoInfo.aad || ACCESS_AAD) }, key, base64ToBytes(config.payload));
    const value = decoder.decode(plaintext).trim(); if (!value || value.length > 500) throw new Error("Traffic read key kon niet worden ontsleuteld."); return value;
  }

  async function unlockTrafficAccess() {
    if (!isRosterPage() || readKey || unlockBusy || !pendingId || !pendingPassword) return;
    unlockBusy = true; setStatus("Automatisch verbinden…", "loading");
    try { readKey = await decryptReadKey(pendingId, pendingPassword); pendingId = ""; pendingPassword = ""; startPolling(); }
    catch (error) {
      readKey = ""; const notConfigured = error?.code === "ACCESS_NOT_CONFIGURED";
      setStatus(notConfigured ? "Nog niet gekoppeld" : "Automatische toegang mislukt", "error");
      renderMessage(notConfigured ? "Traffic-toegang moet eenmalig worden gekoppeld." : "Traffic Live kon niet automatisch met de roosterlogin worden ontgrendeld.");
      pendingId = ""; pendingPassword = "";
    } finally { unlockBusy = false; }
  }

  async function loadTraffic() {
    const url = liveUrl();
    if (!isRosterPage() || !readKey || requestBusy || !url) return;
    requestBusy = true;
    try {
      const response = await fetch(url, { method:"GET", credentials:"omit", cache:"no-store", headers:{ "x-traffic-read-key":readKey } });
      let data = null; try { data = await response.json(); } catch (_) {}
      if (response.status === 401) { readKey = ""; setStatus("Traffic-toegang ongeldig", "error"); renderMessage("De gekoppelde Traffic-toegang is niet meer geldig en moet opnieuw worden gekoppeld."); stopPolling(); return; }
      if (!response.ok) { setStatus("Niet beschikbaar", "error"); renderMessage(data?.message || `Traffic Live gaf HTTP ${response.status}.`); return; }
      lastSnapshot = data; renderSnapshot(data);
    } catch (_) { setStatus("Bridge niet bereikbaar", "error"); if (!lastSnapshot) renderMessage("Traffic Live kan de bridge momenteel niet bereiken."); }
    finally { requestBusy = false; }
  }

  function startPolling() {
    if (!readKey || !isRosterPage() || !liveUrl()) return;
    loadTraffic(); if (refreshTimer !== null) return; refreshTimer = window.setInterval(loadTraffic, REFRESH_MS);
  }

  function stopPolling() { if (refreshTimer === null) return; window.clearInterval(refreshTimer); refreshTimer = null; }

  function sync() {
    if (!isRosterPage()) { stopPolling(); document.getElementById("trafficLivePanel")?.remove(); if (collectorPopup?.isConnected) collectorPopup.hidden = true; return; }
    if (!liveUrl()) return;
    ensurePanel(); if (readKey) startPolling();
  }

  unlockForm?.addEventListener("submit", () => { pendingId = rosterId?.value?.trim() || ""; pendingPassword = rosterPassword?.value || ""; }, true);
  window.addEventListener("rooster-private-config-ready", () => window.setTimeout(sync, 0));
  window.addEventListener("rooster-unlocked", (event) => { if (event?.detail?.publicPortal) return; window.setTimeout(() => { sync(); unlockTrafficAccess(); }, 0); });
  document.addEventListener("visibilitychange", () => { if (!document.hidden && isRosterPage() && readKey) loadTraffic(); });
  const observer = new MutationObserver(sync); observer.observe(document.body, { childList:true, subtree:true, attributes:true, attributeFilter:["class","hidden"] });
  window.setTimeout(sync, 0);

  window.RoosterTrafficLive = Object.freeze({
    refresh: loadTraffic,
    startCollector: startTrafficCollector,
    getBridgeUrl: bridgeBase,
    getLastSnapshot: () => lastSnapshot,
    isAccessReady: () => Boolean(readKey)
  });
})();