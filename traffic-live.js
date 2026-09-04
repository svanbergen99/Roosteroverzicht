(() => {
  "use strict";

  const DASHBOARD_ID = "731a7b2c-c25f-4ff6-a032-5f62ef6d2272";
  const ORIGIN = "https://achmea-production-1-a3srealtime-eu-west-1-prod.kb.eu-west-1.aws.found.io";
  const BASE = `${ORIGIN}/s/centraal-beheer`;
  const EMBED_URL = `${BASE}/app/dashboards#/view/${DASHBOARD_ID}?embed=true&_g=(refreshInterval%3A(pause%3A!f%2Cvalue%3A5000)%2Ctime%3A(from%3Anow%2Fd%2Cto%3Anow%2Fd))&show-top-menu=true&show-query-input=true&show-time-filter=true`;
  const OBJECT_URL = `${BASE}/api/saved_objects/dashboard/${DASHBOARD_ID}`;

  const app = document.getElementById("app");
  if (!app) return;

  let panel = null;
  let iframe = null;
  let lastDiagnostic = "Nog geen technische test uitgevoerd.";
  let messageCount = 0;

  function isRosterPage() {
    return !app.hidden && !document.body.classList.contains("public-portal-mode");
  }

  function setStatus(text) {
    const node = panel?.querySelector(".traffic-live-status");
    if (node) node.textContent = text;
  }

  function setDiagnostic(text) {
    lastDiagnostic = String(text || "");
    const node = panel?.querySelector(".traffic-live-diagnostic");
    if (node) node.textContent = lastDiagnostic;
  }

  function ensurePanel() {
    const controls = document.getElementById("trafficLiveControls");
    if (!controls || !isRosterPage()) return null;
    if (panel?.isConnected) return panel;

    panel = document.createElement("section");
    panel.id = "trafficLivePanel";
    panel.className = "traffic-live-panel";
    panel.hidden = true;
    panel.innerHTML = `
      <div class="traffic-live-head">
        <strong>🚨 Traffic Live</strong>
        <span class="traffic-live-status">Nog niet geladen</span>
      </div>
      <div id="trafficLiveFrameHost"></div>
      <pre class="traffic-live-diagnostic">${lastDiagnostic}</pre>`;
    controls.after(panel);
    return panel;
  }

  function ensureControls() {
    if (!isRosterPage()) return null;
    const bar = document.getElementById("trafficTodayBar");
    if (!bar) return null;

    let controls = document.getElementById("trafficLiveControls");
    if (controls) return controls;

    controls = document.createElement("div");
    controls.id = "trafficLiveControls";
    controls.className = "traffic-live-controls";
    controls.innerHTML = `
      <button id="trafficLiveToggle" class="traffic-live-button" type="button">Traffic Live openen</button>
      <button id="trafficLiveTest" class="traffic-live-button" type="button">Technische test</button>
      <button id="trafficLiveExternal" class="traffic-live-button" type="button">Volledig dashboard ↗</button>`;
    bar.after(controls);

    controls.querySelector("#trafficLiveToggle")?.addEventListener("click", togglePanel);
    controls.querySelector("#trafficLiveTest")?.addEventListener("click", runTechnicalTest);
    controls.querySelector("#trafficLiveExternal")?.addEventListener("click", () => window.open(EMBED_URL, "_blank", "noopener,noreferrer"));
    ensurePanel();
    return controls;
  }

  function ensureFrame() {
    const target = ensurePanel()?.querySelector("#trafficLiveFrameHost");
    if (!target || iframe?.isConnected) return iframe;

    iframe = document.createElement("iframe");
    iframe.className = "traffic-live-frame";
    iframe.title = "Traffic live dashboard";
    iframe.src = EMBED_URL;
    iframe.loading = "lazy";
    iframe.referrerPolicy = "strict-origin-when-cross-origin";
    iframe.addEventListener("load", () => setStatus("Dashboard geladen · verversing 5 sec"));
    target.appendChild(iframe);
    return iframe;
  }

  function togglePanel() {
    const target = ensurePanel();
    if (!target) return;
    const button = document.getElementById("trafficLiveToggle");
    target.hidden = !target.hidden;
    if (!target.hidden) {
      ensureFrame();
      if (button) button.textContent = "Traffic Live sluiten";
    } else if (button) {
      button.textContent = "Traffic Live openen";
    }
  }

  function summarizeDashboard(data) {
    const refs = Array.isArray(data?.references) ? data.references : [];
    const counts = refs.reduce((acc, ref) => {
      const type = String(ref?.type || "onbekend");
      acc[type] = (acc[type] || 0) + 1;
      return acc;
    }, {});
    let panels = [];
    try {
      const parsed = JSON.parse(data?.attributes?.panelsJSON || "[]");
      if (Array.isArray(parsed)) panels = parsed;
    } catch (_) {}
    const panelTypes = panels.reduce((acc, item) => {
      const type = String(item?.type || item?.embeddableConfig?.enhancements?.dynamicActions?.events?.[0]?.eventId || "onbekend");
      acc[type] = (acc[type] || 0) + 1;
      return acc;
    }, {});
    return [
      `Dashboard bereikbaar: JA`,
      `Titel: ${data?.attributes?.title || "onbekend"}`,
      `Panelen: ${panels.length}`,
      `Referenties: ${refs.length}`,
      `Referentietypen: ${Object.entries(counts).map(([k,v]) => `${k}=${v}`).join(", ") || "geen"}`,
      `Paneltypen: ${Object.entries(panelTypes).map(([k,v]) => `${k}=${v}`).join(", ") || "onbekend"}`,
      `Data-view/index verwijzingen: ${refs.filter((ref) => /index-pattern|data-view/i.test(String(ref?.type || ""))).map((ref) => ref.id).join(", ") || "niet direct gevonden"}`
    ].join("\n");
  }

  async function runTechnicalTest() {
    setStatus("Technische test bezig…");
    setDiagnostic("Dashboard-object wordt via de officiële Kibana API getest. Er worden geen wachtwoorden, cookies of tokens opgeslagen.");
    try {
      const response = await fetch(OBJECT_URL, {
        method: "GET",
        mode: "cors",
        credentials: "include",
        cache: "no-store",
        headers: { "Accept": "application/json" }
      });
      if (!response.ok) {
        setStatus(`API-test: HTTP ${response.status}`);
        setDiagnostic(`Dashboard-object niet leesbaar via de pagina. HTTP ${response.status}.\nDit kan betekenen dat authenticatie of CORS directe uitlezing blokkeert. Het iframe kan nog steeds gewoon live werken.`);
        return;
      }
      const data = await response.json();
      const summary = summarizeDashboard(data);
      setStatus("Dashboard-object bereikbaar");
      setDiagnostic(summary);
      window.dispatchEvent(new CustomEvent("rooster-traffic-dashboard-diagnostic", { detail: { summary } }));
    } catch (error) {
      setStatus("API-test geblokkeerd");
      setDiagnostic(`Direct uitlezen is door de browser/Kibana geblokkeerd (${error?.name || "fout"}).\nHet live iframe blijft bruikbaar. Voor echte automatische medewerkerdata hebben we dan een officiële API/CORS-koppeling of backend nodig.`);
    }
  }

  window.addEventListener("message", (event) => {
    if (event.origin !== ORIGIN) return;
    messageCount += 1;
    const type = typeof event.data === "object" && event.data ? String(event.data.type || event.data.event || "bericht") : typeof event.data;
    setStatus(`Dashboard actief · ${messageCount} bericht${messageCount === 1 ? "" : "en"} · ${type}`);
  });

  function sync() {
    if (!isRosterPage()) {
      document.getElementById("trafficLiveControls")?.remove();
      panel?.remove();
      panel = null;
      iframe = null;
      return;
    }
    ensureControls();
  }

  window.addEventListener("rooster-unlocked", () => window.setTimeout(sync, 0));
  const observer = new MutationObserver(sync);
  observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["class", "hidden"] });
  window.setTimeout(sync, 0);

  window.RoosterTrafficLive = Object.freeze({
    open: () => { ensurePanel(); if (panel?.hidden) togglePanel(); },
    test: runTechnicalTest,
    getDiagnostic: () => lastDiagnostic,
    getUrls: () => ({ embed: EMBED_URL, dashboardObject: OBJECT_URL })
  });
})();
