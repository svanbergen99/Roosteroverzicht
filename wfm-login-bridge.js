(() => {
  "use strict";

  const WFM_ORIGIN = "https://genesyswfm.hosting.corp";
  const LOGIN_URL = `${WFM_ORIGIN}/wfm/Login.jsp`;
  const USER_INFO_URL = `${WFM_ORIGIN}/wfm/api/v3/system/userinfo`;

  let promptShown = false;
  let overlay = null;
  let loginPopup = null;
  let closeWatcher = 0;

  function popupFeatures(width = 500, height = 650) {
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

  function setStatus(message) {
    const status = overlay?.querySelector("#wfmBridgeStatus");
    if (status) status.textContent = message;
  }

  function stopCloseWatcher() {
    if (closeWatcher) window.clearInterval(closeWatcher);
    closeWatcher = 0;
  }

  function watchLoginPopup() {
    stopCloseWatcher();
    closeWatcher = window.setInterval(() => {
      if (!loginPopup || !loginPopup.closed) return;
      stopCloseWatcher();
      setStatus("De WFM-loginpopup is gesloten. Gebruik ‘WFM API-test openen’ om te controleren of de officiële sessie toegang geeft tot userinfo.");
    }, 700);
  }

  function openLogin() {
    loginPopup = window.open(LOGIN_URL, "roosterWfmLogin", popupFeatures(500, 650));
    if (!loginPopup) {
      setStatus("De browser blokkeerde de popup. Sta popups voor deze pagina toe en probeer opnieuw.");
      return;
    }
    try { loginPopup.focus(); } catch (_) {}
    setStatus("Officiële WFM-login geopend. Vul Username en Password alleen daar in. Roosteroverzicht kan deze gegevens niet lezen.");
    watchLoginPopup();
  }

  function openApiTest() {
    const apiPopup = window.open(USER_INFO_URL, "roosterWfmApiTest", popupFeatures(720, 620));
    if (!apiPopup) {
      setStatus("De browser blokkeerde de API-testpopup. Sta popups toe en probeer opnieuw.");
      return;
    }
    try { apiPopup.focus(); } catch (_) {}
    setStatus("API-test geopend op de officiële WFM-host. Als je daar JSON/gebruiker-info ziet, is de WFM API bereikbaar met jouw sessie. Bij 401/403/loginpagina is extra WFM-configuratie nodig.");
  }

  function closeOverlay() {
    stopCloseWatcher();
    overlay?.remove();
    overlay = null;
  }

  function showBridgeStep() {
    if (overlay?.isConnected) return;

    overlay = document.createElement("div");
    overlay.id = "wfmLoginBridgeOverlay";
    overlay.className = "overlay";
    overlay.setAttribute("role", "dialog");
    overlay.setAttribute("aria-modal", "true");
    overlay.innerHTML = `
      <div class="unlock-card permission-auth-card">
        <h1>Genesys Workforce Management</h1>
        <p>Je Team Wachtwoord is geaccepteerd. Log nu rechtstreeks in op de officiële WFM-site.</p>
        <p><strong>Roosteroverzicht leest of bewaart je WFM Username/Password niet.</strong></p>
        <button id="wfmOpenLoginButton" class="full-button" type="button">Inloggen bij Genesys WFM</button>
        <button id="wfmApiTestButton" class="permission-auth-back" type="button">WFM API-test openen</button>
        <button id="wfmContinueLocalButton" class="permission-auth-back" type="button">Doorgaan met huidig rooster</button>
        <div id="wfmBridgeStatus" class="permission-auth-error" aria-live="polite"></div>
      </div>`;

    document.body.appendChild(overlay);
    overlay.hidden = false;

    overlay.querySelector("#wfmOpenLoginButton")?.addEventListener("click", openLogin);
    overlay.querySelector("#wfmApiTestButton")?.addEventListener("click", openApiTest);
    overlay.querySelector("#wfmContinueLocalButton")?.addEventListener("click", closeOverlay);

    setStatus("Klik eerst op ‘Inloggen bij Genesys WFM’. Het popupvenster is bewust compact zodat vooral de officiële login zichtbaar is.");
    requestAnimationFrame(() => overlay?.querySelector("#wfmOpenLoginButton")?.focus());
  }

  window.addEventListener("rooster-unlocked", (event) => {
    if (promptShown) return;
    if (event?.detail?.publicPortal) return;
    if (!document.body.classList.contains("permission-auth-enabled")) return;
    promptShown = true;
    window.setTimeout(showBridgeStep, 0);
  });

  window.RoosterWfmBridge = Object.freeze({
    openLogin,
    openApiTest,
    getUrls: () => ({ login: LOGIN_URL, userInfo: USER_INFO_URL })
  });
})();