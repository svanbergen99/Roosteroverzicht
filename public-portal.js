(() => {
  "use strict";

  const body = document.body;
  const welcome = document.getElementById("welcomeOverlay");
  const app = document.getElementById("app");
  const originalButton = document.getElementById("continueButton");
  const unlockOverlay = document.getElementById("unlockOverlay");
  const unlockForm = document.getElementById("unlockForm");
  const rosterId = document.getElementById("rosterId");
  const rosterPassword = document.getElementById("rosterPassword");
  const unlockError = document.getElementById("unlockError");

  if (!body || !welcome || !app || !originalButton || !unlockOverlay || !unlockForm || !rosterId || !rosterPassword) return;

  body.classList.add("public-portal-mode");
  document.title = "Roosteroverzicht";

  // Vervang de oude Verder-knop door de beveiligde Team-kiezer.
  // Door te clonen worden oudere klikhandlers bewust verwijderd.
  const button = originalButton.cloneNode(true);
  originalButton.replaceWith(button);
  button.textContent = "Team kiezen";

  let overlay = null;
  let selectedTeam = "";
  let unlockPending = false;
  let passwordInput = null;
  let authError = null;

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function ensureOverlay() {
    if (overlay?.isConnected) return overlay;
    overlay = document.createElement("div");
    overlay.id = "publicPortalAuthOverlay";
    overlay.className = "overlay";
    overlay.setAttribute("role", "dialog");
    overlay.setAttribute("aria-modal", "true");
    body.appendChild(overlay);
    return overlay;
  }

  function focusSoon(selector) {
    requestAnimationFrame(() => ensureOverlay().querySelector(selector)?.focus());
  }

  function showTeamStep() {
    unlockPending = false;
    welcome.hidden = true;
    unlockOverlay.hidden = true;

    const target = ensureOverlay();
    target.innerHTML = `
      <form id="permissionTeamForm" class="unlock-card permission-auth-card" autocomplete="off">
        <h1>Team kiezen</h1>
        <p>Vul je Team-ID in om de beveiligde startpagina te ontgrendelen.</p>
        <label for="permissionTeamInput">Team-ID</label>
        <input id="permissionTeamInput" type="text" autocomplete="off" spellcheck="false" required>
        <button class="full-button" type="submit">Verder</button>
        <div id="permissionTeamError" class="permission-auth-error" aria-live="polite"></div>
      </form>`;
    target.hidden = false;

    const form = target.querySelector("#permissionTeamForm");
    const input = target.querySelector("#permissionTeamInput");
    const error = target.querySelector("#permissionTeamError");

    form?.addEventListener("submit", (event) => {
      event.preventDefault();
      error.textContent = "";
      const value = input?.value?.trim() || "";
      if (!value) {
        error.textContent = "Vul eerst je Team-ID in.";
        input?.focus();
        return;
      }
      selectedTeam = value;
      showPasswordStep();
    });

    focusSoon("#permissionTeamInput");
  }

  function showPasswordStep() {
    unlockPending = false;
    const target = ensureOverlay();
    target.innerHTML = `
      <form id="permissionPasswordForm" class="unlock-card permission-auth-card" autocomplete="off">
        <h1>Team ontgrendelen</h1>
        <p>Typ het Team Wachtwoord voor <strong>${escapeHtml(selectedTeam)}</strong>. Na een geldige combinatie wordt de beveiligde configuratie geladen en verschijnt de volledige startpagina.</p>
        <label for="permissionPasswordInput">Team Wachtwoord</label>
        <input id="permissionPasswordInput" type="password" autocomplete="new-password" required>
        <button id="permissionUnlockButton" class="full-button" type="submit">Startpagina ontgrendelen</button>
        <button id="permissionBackToTeam" class="permission-auth-back" type="button">Terug</button>
        <div id="permissionAuthError" class="permission-auth-error" aria-live="polite"></div>
      </form>`;

    const form = target.querySelector("#permissionPasswordForm");
    passwordInput = target.querySelector("#permissionPasswordInput");
    authError = target.querySelector("#permissionAuthError");
    const submitButton = target.querySelector("#permissionUnlockButton");

    target.querySelector("#permissionBackToTeam")?.addEventListener("click", showTeamStep);

    form?.addEventListener("submit", (event) => {
      event.preventDefault();
      const password = passwordInput?.value || "";
      if (!password || !selectedTeam || unlockPending) return;

      // access-permissions.js onderschept de eerste submit in capture-fase,
      // ontsleutelt privateConfig en dient daarna hetzelfde formulier opnieuw in.
      // Alleen die tweede submit komt hier terecht.
      unlockPending = true;
      authError.textContent = "";
      if (submitButton) submitButton.disabled = true;

      rosterId.value = selectedTeam;
      rosterPassword.value = password;
      unlockOverlay.hidden = true;
      unlockForm.requestSubmit();
    });

    focusSoon("#permissionPasswordInput");
  }

  function finishStartPage() {
    if (!unlockPending || app.hidden) return;
    unlockPending = false;

    if (overlay?.isConnected) overlay.remove();
    overlay = null;
    welcome.hidden = true;
    unlockOverlay.hidden = true;
    body.classList.remove("locked", "roster-access-active", "roster-person-selected");
    body.classList.add("public-portal-mode");
    app.hidden = false;

    // De bestaande startpagina-modules luisteren op rooster-unlocked.
    // Houd de nieuwe teambeveiliging, maar geef na succesvolle login weer
    // hetzelfde start-signaal als vóór de beveiligingswijziging.
    window.dispatchEvent(new CustomEvent("rooster-unlocked", {
      detail: { publicPortal: true, team: selectedTeam }
    }));
    window.dispatchEvent(new CustomEvent("rooster-start-ready", {
      detail: { team: selectedTeam }
    }));
  }

  button.addEventListener("click", (event) => {
    event.preventDefault();
    showTeamStep();
  });

  if (unlockError) {
    const unlockErrorObserver = new MutationObserver(() => {
      if (!unlockPending || !app.hidden) return;
      const message = unlockError.textContent.trim();
      if (!message) return;

      unlockPending = false;
      const submitButton = overlay?.querySelector("#permissionUnlockButton");
      if (submitButton) submitButton.disabled = false;
      if (authError) authError.textContent = "Het Team Wachtwoord is niet juist voor het opgegeven Team-ID.";
      if (passwordInput) {
        passwordInput.value = "";
        passwordInput.focus();
      }
      unlockError.textContent = "";
    });
    unlockErrorObserver.observe(unlockError, { childList: true, characterData: true, subtree: true });
  }

  const appObserver = new MutationObserver(finishStartPage);
  appObserver.observe(app, { attributes: true, attributeFilter: ["hidden"] });
})();
