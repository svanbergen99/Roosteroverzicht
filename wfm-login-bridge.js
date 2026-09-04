(() => {
  "use strict";

  const WFM_ORIGIN = "https://genesyswfm.hosting.corp";
  const LOGIN_URL = `${WFM_ORIGIN}/wfm/Login.jsp`;

  let popup = null;
  let fallbackOverlay = null;

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

  function showFallback() {
    if (fallbackOverlay?.isConnected) return;
    fallbackOverlay = document.createElement("div");
    fallbackOverlay.id = "wfmPopupFallbackOverlay";
    fallbackOverlay.className = "overlay";
    fallbackOverlay.setAttribute("role", "dialog");
    fallbackOverlay.setAttribute("aria-modal", "true");
    fallbackOverlay.innerHTML = `
      <div class="unlock-card permission-auth-card">
        <h1>Genesys Workforce Management</h1>
        <p>WFM kan om veiligheidsredenen niet binnen Roosteroverzicht worden weergegeven.</p>
        <p>Open de officiële WFM-site in een apart venster. Username en Password worden alleen daar ingevoerd.</p>
        <button id="wfmFallbackOpenButton" class="full-button" type="button">WFM openen</button>
        <button id="wfmFallbackContinueButton" class="permission-auth-back" type="button">Doorgaan naar rooster</button>
        <div class="permission-auth-error" aria-live="polite">Als Edge popups blokkeert, sta popups voor deze pagina toe.</div>
      </div>`;
    document.body.appendChild(fallbackOverlay);
    fallbackOverlay.hidden = false;
    fallbackOverlay.querySelector("#wfmFallbackOpenButton")?.addEventListener("click", () => {
      if (openExternal()) closeFallback();
    });
    fallbackOverlay.querySelector("#wfmFallbackContinueButton")?.addEventListener("click", closeFallback);
    requestAnimationFrame(() => fallbackOverlay?.querySelector("#wfmFallbackOpenButton")?.focus());
  }

  function openExternal() {
    try {
      popup = window.open(LOGIN_URL, "roosterWfmLogin", popupFeatures());
    } catch (_) {
      popup = null;
    }
    if (!popup) return false;
    try { popup.focus(); } catch (_) {}
    return true;
  }

  window.addEventListener("rooster-user-selected", () => {
    window.setTimeout(() => {
      if (!openExternal()) showFallback();
    }, 0);
  });

  window.RoosterWfmBridge = Object.freeze({
    openExternal,
    getUrl: () => LOGIN_URL
  });
})();
