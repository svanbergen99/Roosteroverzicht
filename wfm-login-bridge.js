(() => {
  "use strict";

  const WFM_ORIGIN = "https://genesyswfm.hosting.corp";
  const LOGIN_URL = `${WFM_ORIGIN}/wfm/Login.jsp`;

  let promptShown = false;
  let overlay = null;
  let frame = null;

  function setStatus(message) {
    const node = overlay?.querySelector("#wfmEmbedStatus");
    if (node) node.textContent = message;
  }

  function openExternal() {
    const popup = window.open(LOGIN_URL, "roosterWfmExternal", "popup=yes,width=1100,height=800,resizable=yes,scrollbars=yes");
    if (!popup) {
      setStatus("Edge blokkeerde het venster. Sta popups voor deze pagina toe en probeer opnieuw.");
      return;
    }
    try { popup.focus(); } catch (_) {}
    setStatus("WFM is extern geopend. Gebruik dit alleen als de ingebouwde weergave door WFM wordt geblokkeerd.");
  }

  function reloadFrame() {
    if (!frame) return;
    setStatus("WFM wordt opnieuw geladen…");
    frame.src = LOGIN_URL;
  }

  function closeOverlay() {
    overlay?.remove();
    overlay = null;
    frame = null;
  }

  function showBridgeStep() {
    if (overlay?.isConnected) return;

    overlay = document.createElement("div");
    overlay.id = "wfmLoginBridgeOverlay";
    overlay.className = "overlay";
    overlay.setAttribute("role", "dialog");
    overlay.setAttribute("aria-modal", "true");
    overlay.innerHTML = `
      <section class="wfm-embed-card">
        <header class="wfm-embed-head">
          <div class="wfm-embed-title">
            <h1>Genesys Workforce Management</h1>
            <p>Officiële WFM-pagina ingebouwd in Roosteroverzicht · <span class="wfm-official-origin">${WFM_ORIGIN}</span></p>
          </div>
          <div class="wfm-embed-actions">
            <button id="wfmReloadButton" class="permission-auth-back" type="button">Opnieuw laden</button>
            <button id="wfmOpenExternalButton" class="permission-auth-back" type="button">Extern openen ↗</button>
            <button id="wfmContinueLocalButton" class="full-button" type="button">Doorgaan naar rooster</button>
          </div>
        </header>
        <div class="wfm-embed-frame-wrap">
          <iframe id="wfmEmbeddedFrame" class="wfm-embed-frame" title="Officiële Genesys Workforce Management" src="${LOGIN_URL}" referrerpolicy="strict-origin-when-cross-origin"></iframe>
        </div>
        <footer class="wfm-embed-footer">
          <span id="wfmEmbedStatus" class="wfm-embed-status">WFM wordt geladen…</span>
          <span class="wfm-embed-note">Username en Password worden uitsluitend in de officiële WFM-pagina ingevoerd. Roosteroverzicht kan de inhoud van dit externe frame niet uitlezen.</span>
        </footer>
      </section>`;

    document.body.appendChild(overlay);
    overlay.hidden = false;
    frame = overlay.querySelector("#wfmEmbeddedFrame");

    frame?.addEventListener("load", () => {
      setStatus("WFM-pagina geladen. Als je al bent ingelogd, hoort je WFM-scherm hier direct zichtbaar te worden.");
    });
    overlay.querySelector("#wfmReloadButton")?.addEventListener("click", reloadFrame);
    overlay.querySelector("#wfmOpenExternalButton")?.addEventListener("click", openExternal);
    overlay.querySelector("#wfmContinueLocalButton")?.addEventListener("click", closeOverlay);
  }

  window.addEventListener("rooster-user-selected", () => {
    if (promptShown) return;
    if (!document.body.classList.contains("permission-auth-enabled")) return;
    promptShown = true;
    window.setTimeout(showBridgeStep, 0);
  });

  window.RoosterWfmBridge = Object.freeze({
    openEmbedded: showBridgeStep,
    openExternal,
    getUrl: () => LOGIN_URL
  });
})();