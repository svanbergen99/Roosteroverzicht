(() => {
  "use strict";

  const SCANNER_SOURCE = "https://raw.githubusercontent.com/svanbergen99/WFM-TEST/main/WFM-Personal-Rooster-Bookmarklet.txt";
  const WFM_ORIGIN = "https://genesyswfm.hosting.corp";
  const BINDING_KEY = "rhWfmIdentityBindingV1";

  let popup = null;
  let fallbackOverlay = null;
  let scannerInstallerOverlay = null;
  let personalStatusOverlay = null;
  let scannerBookmarklet = "";
  let scannerLabel = "WFM Rooster Scanner";
  let pendingPersonalJob = null;
  let freshViewPromise = null;

  function loginUrl() {
    return String(window.RoosterPrivateConfig?.wfm?.loginUrl || "").trim();
  }

  function browserBindingId() {
    try { return localStorage.getItem(BINDING_KEY) || ""; }
    catch (_) { return ""; }
  }

  function ensureFreshView() {
    if (window.RoosterFreshPersonalView) return Promise.resolve(window.RoosterFreshPersonalView);
    if (freshViewPromise) return freshViewPromise;
    freshViewPromise = new Promise((resolve, reject) => {
      const existing = [...document.querySelectorAll("script[src]")].find(script => /fresh-personal-view\.js/i.test(script.src));
      if (existing) {
        existing.addEventListener("load", () => resolve(window.RoosterFreshPersonalView), { once: true });
        existing.addEventListener("error", () => reject(new Error("De verse persoonlijke roosterweergave kon niet worden geladen.")), { once: true });
        return;
      }
      const script = document.createElement("script");
      script.src = `fresh-personal-view.js?v=20260907-1-${Date.now()}`;
      script.async = false;
      script.addEventListener("load", () => resolve(window.RoosterFreshPersonalView), { once: true });
      script.addEventListener("error", () => reject(new Error("De verse persoonlijke roosterweergave kon niet worden geladen.")), { once: true });
      document.body.appendChild(script);
    }).finally(() => { freshViewPromise = null; });
    return freshViewPromise;
  }

  function popupFeatures(width = 560, height = 720) {
    const left = Math.max(0, Math.round((window.screenX || 0) + ((window.outerWidth || screen.width) - width) / 2));
    const top = Math.max(0, Math.round((window.screenY || 0) + ((window.outerHeight || screen.height) - height) / 2));
    return [
      "popup=yes",
      `width=${width}`,
      `height=${height}`,
      `left=${left}`,
      `top=${top}`,
      "resizable=yes",
      "scrollbars=yes"
    ].join(",");
  }

  function closeFallback() {
    fallbackOverlay?.remove();
    fallbackOverlay = null;
  }

  function closeScannerInstaller() {
    scannerInstallerOverlay?.remove();
    scannerInstallerOverlay = null;
  }

  function closePersonalStatus() {
    personalStatusOverlay?.remove();
    personalStatusOverlay = null;
  }

  function formatAmsterdam(value) {
    const date = value ? new Date(value) : new Date();
    return new Intl.DateTimeFormat("nl-NL", {
      timeZone: "Europe/Amsterdam",
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit"
    }).format(date);
  }

  function showPersonalStatus(title, detail = "", kind = "busy") {
    if (!personalStatusOverlay?.isConnected) {
      personalStatusOverlay = document.createElement("div");
      personalStatusOverlay.id = "wfmPersonalStatusOverlay";
      personalStatusOverlay.className = "overlay";
      personalStatusOverlay.setAttribute("role", "dialog");
      personalStatusOverlay.setAttribute("aria-modal", "true");
      document.body.appendChild(personalStatusOverlay);
    }
    const tone = kind === "error" ? "#9f3030" : kind === "success" ? "#176b58" : "#172033";
    personalStatusOverlay.innerHTML = `
      <div class="unlock-card permission-auth-card" style="max-width:520px">
        <h1>${String(title || "Rooster ophalen")}</h1>
        <p style="white-space:pre-line">${String(detail || "")}</p>
        <div class="permission-auth-error" style="color:${tone}" aria-live="polite"></div>
        ${kind === "error" ? '<button id="wfmPersonalStatusClose" class="permission-auth-back" type="button">Sluiten</button>' : ""}
      </div>`;
    personalStatusOverlay.hidden = false;
    personalStatusOverlay.querySelector("#wfmPersonalStatusClose")?.addEventListener("click", closePersonalStatus);
  }

  function renderProgress(steps = {}, storedAt = "") {
    const order = [
      ["open", "WFM openen"],
      ["login", "Inloggen controleren"],
      ["schedule", "My Schedule openen"],
      ["scan", "6 weken scannen"],
      ["railway", "Railway verwerken"],
      ["repo", "Repo bijwerken"],
      ["done", "Verse scan bevestigd"]
    ];
    const icon = state => state === "done" ? "✓" : state === "active" ? "…" : state === "error" ? "✕" : "○";
    const lines = order.map(([key, label]) => `${icon(steps[key])} ${label}${steps[key] === "done" ? " ✓" : ""}`);
    if (steps.done === "done" && storedAt) lines.push("", formatAmsterdam(storedAt));
    showPersonalStatus("Rooster ophalen...", lines.join("\n"), steps.done === "done" ? "success" : "busy");
  }

  async function loadLatestScanner(force = false) {
    if (scannerBookmarklet && !force) return { bookmarklet: scannerBookmarklet, label: scannerLabel };
    const response = await fetch(`${SCANNER_SOURCE}?v=${Date.now()}`, { cache: "no-store" });
    if (!response.ok) throw new Error("De actuele persoonlijke WFM Scanner kon niet worden geladen.");
    const text = (await response.text()).trim();
    if (!/^javascript:/i.test(text)) throw new Error("De scanner heeft niet het verwachte bookmarklet-formaat.");
    scannerBookmarklet = text;
    scannerLabel = "WFM Rooster Scanner";
    return { bookmarklet: scannerBookmarklet, label: scannerLabel };
  }

  function renderScannerInstallerLoading() {
    const target = scannerInstallerOverlay;
    if (!target) return;
    target.innerHTML = `
      <div class="unlock-card permission-auth-card">
        <h1>WFM Rooster Scanner installeren</h1>
        <p>De nieuwste persoonlijke scanner wordt opgehaald uit WFM-TEST…</p>
        <button id="wfmScannerInstallerClose" class="permission-auth-back" type="button">Sluiten</button>
        <div id="wfmScannerInstallerStatus" class="permission-auth-error" aria-live="polite"></div>
      </div>`;
    target.querySelector("#wfmScannerInstallerClose")?.addEventListener("click", closeScannerInstaller);
  }

  function renderScannerInstallerReady(bookmarklet, label) {
    const target = scannerInstallerOverlay;
    if (!target) return;
    target.innerHTML = `
      <div class="unlock-card permission-auth-card">
        <h1>WFM Rooster Scanner installeren</h1>
        <p>Zet in Edge eerst de favorietenbalk aan met <strong>Ctrl+Shift+B</strong>. Sleep daarna de scannerknop hieronder één keer naar de favorietenbalk.</p>
        <a id="wfmScannerDragLink" class="full-button" href="#" draggable="true" style="display:block;text-align:center;text-decoration:none;cursor:grab;user-select:none">${label}</a>
        <p style="margin-top:14px">Bij een verse roosterophaling open je WFM via Roosteroverzicht en klik je deze favoriet één keer aan. Daarna neemt de scanner het automatisch over.</p>
        <button id="wfmScannerCopyButton" class="permission-auth-back" type="button">Scanner kopiëren</button>
        <button id="wfmScannerInstallerClose" class="permission-auth-back" type="button">Sluiten</button>
        <div id="wfmScannerInstallerStatus" class="permission-auth-error" aria-live="polite"></div>
      </div>`;

    const link = target.querySelector("#wfmScannerDragLink");
    const status = target.querySelector("#wfmScannerInstallerStatus");
    link?.setAttribute("href", bookmarklet);
    link?.setAttribute("title", `Sleep ${label} naar de favorietenbalk`);
    link?.addEventListener("click", (event) => {
      event.preventDefault();
      if (status) status.textContent = "Sleep de scannerknop naar de favorietenbalk; klik hem hier niet aan.";
    });
    link?.addEventListener("dragstart", () => {
      if (status) status.textContent = `Sleep ${label} nu naar de favorietenbalk.`;
    });

    target.querySelector("#wfmScannerCopyButton")?.addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(bookmarklet);
        if (status) status.textContent = `${label} is gekopieerd.`;
      } catch (_) {
        if (status) status.textContent = "Kopiëren werd door de browser geblokkeerd. Gebruik de sleepknop hierboven.";
      }
    });
    target.querySelector("#wfmScannerInstallerClose")?.addEventListener("click", closeScannerInstaller);
    requestAnimationFrame(() => link?.focus());
  }

  async function showScannerInstaller() {
    if (!scannerInstallerOverlay?.isConnected) {
      scannerInstallerOverlay = document.createElement("div");
      scannerInstallerOverlay.id = "wfmScannerInstallerOverlay";
      scannerInstallerOverlay.className = "overlay";
      scannerInstallerOverlay.setAttribute("role", "dialog");
      scannerInstallerOverlay.setAttribute("aria-modal", "true");
      document.body.appendChild(scannerInstallerOverlay);
    }
    scannerInstallerOverlay.hidden = false;
    renderScannerInstallerLoading();
    try {
      const latest = await loadLatestScanner(true);
      renderScannerInstallerReady(latest.bookmarklet, latest.label);
    } catch (error) {
      const status = scannerInstallerOverlay?.querySelector("#wfmScannerInstallerStatus");
      if (status) status.textContent = error?.message || "De actuele persoonlijke WFM Scanner kon niet worden geladen.";
    }
  }

  function ensureScannerInstallButton() {
    const row = document.getElementById("publicPortalQuickActions");
    if (!row) return null;
    let button = document.getElementById("wfmScannerInstallButton");
    if (button) return button;

    button = document.createElement("button");
    button.id = "wfmScannerInstallButton";
    button.className = "today-workers-button public-roster-button";
    button.type = "button";
    button.setAttribute("aria-label", "Persoonlijke WFM Rooster Scanner installeren of bijwerken");
    button.innerHTML = `
      <span class="public-roster-button-main">
        <span class="public-roster-button-icon" aria-hidden="true">★</span>
        <span class="public-roster-button-copy">
          <strong>WFM Rooster Scanner</strong>
          <small>Eenmalig installeren / bijwerken</small>
        </span>
      </span>
      <span class="public-roster-arrow" aria-hidden="true">›</span>`;
    button.addEventListener("click", showScannerInstaller);
    row.appendChild(button);
    return button;
  }

  function showFallback(message = "") {
    if (fallbackOverlay?.isConnected) return;
    fallbackOverlay = document.createElement("div");
    fallbackOverlay.id = "wfmPopupFallbackOverlay";
    fallbackOverlay.className = "overlay";
    fallbackOverlay.setAttribute("role", "dialog");
    fallbackOverlay.setAttribute("aria-modal", "true");
    fallbackOverlay.innerHTML = `
      <div class="unlock-card permission-auth-card">
        <h1>Workforce Management</h1>
        <p>${message || "WFM kon niet automatisch worden voorbereid."}</p>
        <button id="wfmFallbackOpenButton" class="full-button" type="button">Opnieuw proberen</button>
        <button id="wfmFallbackScannerButton" class="permission-auth-back" type="button">WFM Rooster Scanner installeren</button>
        <button id="wfmFallbackContinueButton" class="permission-auth-back" type="button">Sluiten</button>
        <div class="permission-auth-error" aria-live="polite">Als Edge popups blokkeert, sta popups voor deze pagina toe.</div>
      </div>`;
    document.body.appendChild(fallbackOverlay);
    fallbackOverlay.hidden = false;
    fallbackOverlay.querySelector("#wfmFallbackOpenButton")?.addEventListener("click", () => {
      closeFallback();
      openExternal();
    });
    fallbackOverlay.querySelector("#wfmFallbackScannerButton")?.addEventListener("click", showScannerInstaller);
    fallbackOverlay.querySelector("#wfmFallbackContinueButton")?.addEventListener("click", closeFallback);
  }

  async function preparePersonalPopup(target, url) {
    try {
      const id = browserBindingId();
      if (!/^[A-Za-z0-9_-]{32,160}$/.test(id)) {
        throw new Error("Deze browser is nog niet aan een WFM-persoon gekoppeld. Voer eerst één keer de Team Scanner uit.");
      }
      const access = window.RoosterAccessSession;
      if (!access?.createPersonalScanJob) throw new Error("De beveiligde roosterverbinding is nog niet geladen. Vernieuw de pagina en probeer opnieuw.");

      showPersonalStatus("Rooster ophalen...", "WFM openen... ✓\nVerse scanopdracht bij Railway voorbereiden...", "busy");
      const job = await access.createPersonalScanJob(id);
      pendingPersonalJob = {
        scanToken: String(job?.scanToken || ""),
        createdAt: Date.now(),
        expiresAt: Date.now() + (Number(job?.expiresInMinutes) || 20) * 60 * 1000
      };
      if (!pendingPersonalJob.scanToken) throw new Error("Railway gaf geen persoonlijke scanopdracht terug.");

      target.location.href = url;
      try { target.focus(); } catch (_) {}
      showPersonalStatus(
        "Rooster ophalen...",
        "WFM openen... ✓\n\nKlik nu één keer op ★ WFM Rooster Scanner in je favorietenbalk.\nVul daarna alleen je officiële WFM-wachtwoord in.",
        "busy"
      );
    } catch (error) {
      pendingPersonalJob = null;
      try { target.close(); } catch (_) {}
      const message = error?.message || String(error);
      const migration = /Team Scanner|roostertoegang/i.test(message)
        ? `${message}\n\nDe bestaande Team Scanner hoeft hiervoor nog maar één keer gedraaid te worden; daarna is deze browser klaar voor persoonlijke scans.`
        : message;
      showPersonalStatus("Rooster ophalen kon niet starten", migration, "error");
    }
  }

  function openExternal() {
    const url = loginUrl();
    if (!url) return false;
    try {
      popup = window.open("about:blank", "roosterWfmLogin", popupFeatures());
    } catch (_) {
      popup = null;
    }
    if (!popup) return false;
    try { popup.document.title = "WFM wordt voorbereid…"; } catch (_) {}
    preparePersonalPopup(popup, url);
    return true;
  }

  window.addEventListener("message", (event) => {
    if (event.origin !== WFM_ORIGIN) return;
    const data = event.data || {};

    if (data.type === "rooster-personal-scanner-request") {
      const job = pendingPersonalJob;
      const valid = job?.scanToken && Number(job?.expiresAt) > Date.now();
      try {
        event.source?.postMessage({
          type: "rooster-personal-scanner-config",
          requestId: data.requestId,
          ...(valid ? { scanToken: job.scanToken } : { message: "De verse scanopdracht is verlopen. Open WFM opnieuw via Roosteroverzicht." })
        }, WFM_ORIGIN);
      } catch (_) {}
      return;
    }

    if (data.type === "rooster-personal-scan-status") {
      renderProgress(data.steps || {}, data.storedAt || "");
      return;
    }

    if (data.type === "rooster-personal-scan-error") {
      showPersonalStatus("Rooster ophalen gestopt", data.message || "De persoonlijke WFM-scan is gestopt.", "error");
      return;
    }

    if (data.type === "rooster-personal-scan-complete") {
      pendingPersonalJob = null;
      renderProgress({ open:"done", login:"done", schedule:"done", scan:"done", railway:"done", repo:"done", done:"done" }, data.storedAt || new Date().toISOString());
      setTimeout(async () => {
        closePersonalStatus();
        try {
          await ensureFreshView();
          window.dispatchEvent(new CustomEvent("rooster-personal-fresh-ready", { detail: data }));
        } catch (error) {
          showPersonalStatus("Verse scan is opgeslagen", error?.message || "De verse persoonlijke roosterweergave kon niet worden geopend.", "error");
        }
      }, 1400);
    }
  });

  ensureFreshView().catch(() => {});

  window.addEventListener("rooster-private-config-ready", () => requestAnimationFrame(ensureScannerInstallButton));
  window.addEventListener("rooster-unlocked", () => requestAnimationFrame(ensureScannerInstallButton));
  window.addEventListener("rooster-start-ready", () => requestAnimationFrame(ensureScannerInstallButton));

  const quickActionObserver = new MutationObserver(() => {
    if (ensureScannerInstallButton()) quickActionObserver.disconnect();
  });
  quickActionObserver.observe(document.body, { childList: true, subtree: true });
  requestAnimationFrame(ensureScannerInstallButton);

  window.RoosterWfmBridge = Object.freeze({
    openExternal,
    showFallback,
    showScannerInstaller,
    getUrl: loginUrl
  });
})();