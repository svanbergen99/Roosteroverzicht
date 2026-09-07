(() => {
  "use strict";

  const SCANNER_SOURCE = "https://raw.githubusercontent.com/svanbergen99/WFM-TEST/main/WFM-Auto-Login-Scanner-Bookmarklet-v30a.txt";

  let popup = null;
  let fallbackOverlay = null;
  let scannerInstallerOverlay = null;
  let scannerBookmarklet = "";
  let scannerLabel = "WFM Scanner";

  function loginUrl() {
    return String(window.RoosterPrivateConfig?.wfm?.loginUrl || "").trim();
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

  async function loadLatestScanner(force = false) {
    if (scannerBookmarklet && !force) return { bookmarklet: scannerBookmarklet, label: scannerLabel };
    const response = await fetch(`${SCANNER_SOURCE}?v=${Date.now()}`, { cache: "no-store" });
    if (!response.ok) throw new Error("De actuele WFM Scanner kon niet worden geladen.");
    const text = (await response.text()).trim();
    if (!/^javascript:/i.test(text)) throw new Error("De scanner heeft niet het verwachte bookmarklet-formaat.");

    const versionMatch = text.match(/WFM Scanner (Av\d+)/i) || text.match(/version:\s*["'](av\d+)["']/i);
    const version = versionMatch?.[1] || "";
    scannerBookmarklet = text;
    scannerLabel = version ? `WFM Scanner ${version.charAt(0).toUpperCase()}${version.slice(1)}` : "WFM Scanner";
    return { bookmarklet: scannerBookmarklet, label: scannerLabel };
  }

  function renderScannerInstallerLoading() {
    const target = scannerInstallerOverlay;
    if (!target) return;
    target.innerHTML = `
      <div class="unlock-card permission-auth-card">
        <h1>WFM Scanner installeren</h1>
        <p>De nieuwste scanner wordt opgehaald uit WFM-TEST…</p>
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
        <h1>WFM Scanner installeren</h1>
        <p>Zet in Edge eerst de favorietenbalk aan met <strong>Ctrl+Shift+B</strong>. Sleep daarna de scannerknop hieronder naar de favorietenbalk.</p>
        <a id="wfmScannerDragLink" class="full-button" href="#" draggable="true" style="display:block;text-align:center;text-decoration:none;cursor:grab;user-select:none">${label}</a>
        <p style="margin-top:14px">Staat er al een oudere WFM Scanner? Verwijder die eerst en sleep daarna deze actuele versie naar de balk.</p>
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
        if (status) status.textContent = `${label} is gekopieerd. Je kunt hem ook handmatig als favoriet aanmaken.`;
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
      if (status) status.textContent = error?.message || "De actuele WFM Scanner kon niet worden geladen.";
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
    button.setAttribute("aria-label", "Actuele WFM Scanner installeren of bijwerken");
    button.innerHTML = `
      <span class="public-roster-button-main">
        <span class="public-roster-button-icon" aria-hidden="true">★</span>
        <span class="public-roster-button-copy">
          <strong>WFM Scanner</strong>
          <small>Installeren / bijwerken</small>
        </span>
      </span>
      <span class="public-roster-arrow" aria-hidden="true">›</span>`;
    button.addEventListener("click", showScannerInstaller);
    row.appendChild(button);
    return button;
  }

  function showFallback() {
    if (fallbackOverlay?.isConnected) return;
    fallbackOverlay = document.createElement("div");
    fallbackOverlay.id = "wfmPopupFallbackOverlay";
    fallbackOverlay.className = "overlay";
    fallbackOverlay.setAttribute("role", "dialog");
    fallbackOverlay.setAttribute("aria-modal", "true");
    fallbackOverlay.innerHTML = `
      <div class="unlock-card permission-auth-card">
        <h1>Workforce Management</h1>
        <p>De externe roosteromgeving kan niet binnen Roosteroverzicht worden weergegeven.</p>
        <p>Open de officiële omgeving in een apart venster. Inloggegevens worden alleen daar ingevoerd.</p>
        <button id="wfmFallbackOpenButton" class="full-button" type="button">WFM openen</button>
        <button id="wfmFallbackScannerButton" class="permission-auth-back" type="button">WFM Scanner installeren</button>
        <button id="wfmFallbackContinueButton" class="permission-auth-back" type="button">Doorgaan naar rooster</button>
        <div class="permission-auth-error" aria-live="polite">Als Edge popups blokkeert, sta popups voor deze pagina toe.</div>
      </div>`;
    document.body.appendChild(fallbackOverlay);
    fallbackOverlay.hidden = false;
    fallbackOverlay.querySelector("#wfmFallbackOpenButton")?.addEventListener("click", () => {
      if (openExternal()) closeFallback();
    });
    fallbackOverlay.querySelector("#wfmFallbackScannerButton")?.addEventListener("click", showScannerInstaller);
    fallbackOverlay.querySelector("#wfmFallbackContinueButton")?.addEventListener("click", closeFallback);
    requestAnimationFrame(() => fallbackOverlay?.querySelector("#wfmFallbackOpenButton")?.focus());
  }

  function openExternal() {
    const url = loginUrl();
    if (!url) return false;
    try {
      popup = window.open(url, "roosterWfmLogin", popupFeatures());
    } catch (_) {
      popup = null;
    }
    if (!popup) return false;
    try { popup.focus(); } catch (_) {}
    return true;
  }

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