(() => {
  "use strict";

  const DASHBOARD_ID = "731a7b2c-c25f-4ff6-a032-5f62ef6d2272";
  const ORIGIN = "https://achmea-production-1-a3srealtime-eu-west-1-prod.kb.eu-west-1.aws.found.io";
  const BASE = `${ORIGIN}/s/centraal-beheer`;
  const DASHBOARD_URL = `${BASE}/app/dashboards#/view/${DASHBOARD_ID}?embed=true&_g=(refreshInterval%3A(pause%3A!f%2Cvalue%3A5000)%2Ctime%3A(from%3Anow%2Fd%2Cto%3Anow%2Fd))&show-top-menu=true&show-query-input=true&show-time-filter=true`;
  const WINDOW_NAME = "roosterTrafficLiveDashboard";

  const app = document.getElementById("app");
  if (!app) return;

  let dashboardWindow = null;

  function isRosterPage() {
    return !app.hidden && !document.body.classList.contains("public-portal-mode");
  }

  function openDashboard() {
    // Microsoft Entra-login mag niet betrouwbaar binnen een cross-origin iframe draaien.
    // Open Traffic Live daarom altijd als normale bovenliggende browserpagina.
    try {
      if (dashboardWindow && !dashboardWindow.closed) {
        dashboardWindow.location.href = DASHBOARD_URL;
        dashboardWindow.focus();
        return dashboardWindow;
      }
    } catch (_) {
      // Een cross-origin venster kan beperkt toegankelijk zijn; open dan opnieuw.
    }

    dashboardWindow = window.open(DASHBOARD_URL, WINDOW_NAME);
    if (dashboardWindow) {
      try { dashboardWindow.opener = null; } catch (_) {}
      dashboardWindow.focus?.();
    }
    return dashboardWindow;
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
      <button id="trafficLiveToggle" class="traffic-live-button" type="button">Traffic Live openen ↗</button>
      <span class="traffic-live-note">Opent veilig in een aparte dashboardtab</span>`;
    bar.after(controls);

    controls.querySelector("#trafficLiveToggle")?.addEventListener("click", openDashboard);
    return controls;
  }

  function sync() {
    if (!isRosterPage()) {
      document.getElementById("trafficLiveControls")?.remove();
      document.getElementById("trafficLivePanel")?.remove();
      return;
    }
    ensureControls();
  }

  window.addEventListener("rooster-unlocked", () => window.setTimeout(sync, 0));
  const observer = new MutationObserver(sync);
  observer.observe(document.body, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ["class", "hidden"]
  });
  window.setTimeout(sync, 0);

  window.RoosterTrafficLive = Object.freeze({
    open: openDashboard,
    test: openDashboard,
    getDiagnostic: () => "Traffic Live gebruikt de normale dashboardtab; iframe- en CORS-tests zijn uitgeschakeld.",
    getUrls: () => ({ dashboard: DASHBOARD_URL })
  });
})();
