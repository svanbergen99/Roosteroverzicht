(() => {
  "use strict";

  const TEAM_IDS = Object.freeze([
    "KCDTeam01", "KCDTeam02", "KCDTeam03", "KCDTeam04", "KCDTeam05", "KCDTeam06",
    "WOTeam01", "WOTeam02", "WOTeam03", "WOTeam04", "WOTeam05", "WOTeam06", "WOTeam07", "WOTeam08"
  ]);
  const PERMISSIONS = Array.isArray(window.RoosterAccessPermissions) ? window.RoosterAccessPermissions : [];
  const encoder = new TextEncoder();

  const body = document.body;
  const welcomeOverlay = document.getElementById("welcomeOverlay");
  const continueButton = document.getElementById("continueButton");
  const unlockOverlay = document.getElementById("unlockOverlay");
  const unlockForm = document.getElementById("unlockForm");
  const rosterId = document.getElementById("rosterId");
  const rosterPassword = document.getElementById("rosterPassword");
  const unlockError = document.getElementById("unlockError");
  const app = document.getElementById("app");
  const nameForm = document.getElementById("nameForm");
  const employeeName = document.getElementById("employeeName");
  const rosterResult = document.getElementById("rosterResult");
  const searchCard = document.querySelector(".search-card");

  if (!body || !welcomeOverlay || !continueButton || !unlockForm || !rosterId || !rosterPassword || !app || !nameForm || !employeeName || !rosterResult || !searchCard) return;

  body.classList.add("permission-auth-enabled");

  let overlay = null;
  let selectedTeam = "";
  let activePermission = null;
  let colleagueFirstName = "Collega";
  let authPending = false;
  let unlockCompleted = false;
  let passwordInput = null;
  let authError = null;
  let resolvedEmployeeName = "";

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function nameSignature(value) {
    return String(value || "")
      .toLocaleLowerCase("nl-NL")
      .normalize("NFD")
      .replace(/\p{M}/gu, "")
      .replace(/[^\p{L}\p{N}]+/gu, " ")
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .sort((a, b) => a.localeCompare(b, "nl"))
      .join("|");
  }

  async function hashName(value) {
    const signature = nameSignature(value);
    if (!signature) return "";
    const digest = await crypto.subtle.digest("SHA-256", encoder.encode(signature));
    return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  }

  function firstNameFromInput(value) {
    const parts = String(value || "").trim().split(/\s+/).filter(Boolean);
    if (!parts.length) return "Collega";
    const prefixes = new Set(["van", "de", "der", "den", "het", "'t", "ten", "ter", "von"]);
    const candidate = prefixes.has(parts[0].toLocaleLowerCase("nl-NL")) && parts.length > 1 ? parts.at(-1) : parts[0];
    return `${candidate.charAt(0).toLocaleUpperCase("nl-NL")}${candidate.slice(1)}`;
  }

  function hasAllColleaguesAccess(permission = activePermission) {
    return permission?.scope === "all";
  }

  async function permissionForInput(value) {
    const firstName = firstNameFromInput(value);
    if (!firstName || firstName === "Collega") return null;
    const loginHash = await hashName(firstName);
    return PERMISSIONS.find((permission) =>
      permission?.loginHash === loginHash && (permission?.rosterHash || hasAllColleaguesAccess(permission))
    ) || null;
  }

  function ensureOverlay() {
    if (overlay?.isConnected) return overlay;
    overlay = document.createElement("div");
    overlay.id = "permissionAuthOverlay";
    overlay.className = "overlay";
    overlay.setAttribute("role", "dialog");
    overlay.setAttribute("aria-modal", "true");
    body.appendChild(overlay);
    return overlay;
  }

  function focusSoon(selector) {
    requestAnimationFrame(() => ensureOverlay().querySelector(selector)?.focus());
  }

  function teamOptionsHtml() {
    const kcd = TEAM_IDS.filter((team) => team.startsWith("KCD")).map((team) =>
      `<option value="${team}"${selectedTeam === team ? " selected" : ""}>${team}</option>`
    ).join("");
    const wo = TEAM_IDS.filter((team) => team.startsWith("WO")).map((team) =>
      `<option value="${team}"${selectedTeam === team ? " selected" : ""}>${team}</option>`
    ).join("");
    return `<option value="">Kies een team</option><optgroup label="KCD Teams">${kcd}</optgroup><optgroup label="WO Teams">${wo}</optgroup>`;
  }

  function showTeamStep() {
    authPending = false;
    unlockOverlay.hidden = true;
    const target = ensureOverlay();
    target.innerHTML = `
      <form id="permissionTeamForm" class="unlock-card permission-auth-card" autocomplete="off">
        <h1>Selecteer je team</h1>
        <p>Kies het team waarvoor je roosterinzicht wilt openen.</p>
        <label for="permissionTeamSelect">Team</label>
        <select id="permissionTeamSelect" class="permission-auth-team-select" required>
          ${teamOptionsHtml()}
        </select>
        <button class="full-button" type="submit">Verder</button>
        <div id="permissionTeamError" class="permission-auth-error" aria-live="polite"></div>
      </form>`;
    target.hidden = false;

    const form = target.querySelector("#permissionTeamForm");
    const select = target.querySelector("#permissionTeamSelect");
    const error = target.querySelector("#permissionTeamError");
    form?.addEventListener("submit", (event) => {
      event.preventDefault();
      error.textContent = "";
      const value = select?.value || "";
      if (!TEAM_IDS.includes(value)) {
        error.textContent = "Selecteer eerst een team.";
        select?.focus();
        return;
      }
      selectedTeam = value;
      showNameStep();
    });
    focusSoon("#permissionTeamSelect");
  }

  function showNameStep() {
    authPending = false;
    const target = ensureOverlay();
    target.innerHTML = `
      <form id="permissionNameForm" class="unlock-card permission-auth-card" autocomplete="off">
        <h1>Wie ben je?</h1>
        <p>Vul je voornaam in. Alleen collega's met toestemming kunnen verder.</p>
        <label for="permissionNameInput">Voornaam</label>
        <input id="permissionNameInput" type="text" autocomplete="off" autocapitalize="words" required>
        <button class="full-button" type="submit">Verder</button>
        <button id="permissionBackToTeam" class="permission-auth-back" type="button">Terug</button>
        <div id="permissionNameError" class="permission-auth-error" aria-live="polite"></div>
      </form>`;

    const form = target.querySelector("#permissionNameForm");
    const input = target.querySelector("#permissionNameInput");
    const error = target.querySelector("#permissionNameError");
    target.querySelector("#permissionBackToTeam")?.addEventListener("click", showTeamStep);
    form?.addEventListener("submit", async (event) => {
      event.preventDefault();
      error.textContent = "";
      const value = input.value.trim();
      if (!value) return;
      const permission = await permissionForInput(value);
      if (!permission) {
        error.textContent = "Deze voornaam heeft geen toestemming voor roosterinzicht.";
        input.select();
        return;
      }
      activePermission = permission;
      colleagueFirstName = firstNameFromInput(value);
      resolvedEmployeeName = "";
      showPasswordStep();
    });
    focusSoon("#permissionNameInput");
  }

  function showPasswordStep() {
    authPending = false;
    const target = ensureOverlay();
    target.innerHTML = `
      <form id="permissionPasswordForm" class="unlock-card permission-auth-card" autocomplete="off">
        <h1>Welkom ${escapeHtml(colleagueFirstName)}</h1>
        <p>Typ hier je Team Wachtwoord voor <strong>${escapeHtml(selectedTeam)}</strong>:</p>
        <label for="permissionPasswordInput">Team Wachtwoord</label>
        <input id="permissionPasswordInput" type="password" autocomplete="new-password" required>
        <button id="permissionUnlockButton" class="full-button" type="submit">Rooster ontgrendelen</button>
        <button id="permissionBackToName" class="permission-auth-back" type="button">Terug</button>
        <div id="permissionAuthError" class="permission-auth-error" aria-live="polite"></div>
      </form>`;

    const form = target.querySelector("#permissionPasswordForm");
    passwordInput = target.querySelector("#permissionPasswordInput");
    authError = target.querySelector("#permissionAuthError");
    const submitButton = target.querySelector("#permissionUnlockButton");

    target.querySelector("#permissionBackToName")?.addEventListener("click", showNameStep);
    form?.addEventListener("submit", (event) => {
      event.preventDefault();
      const password = passwordInput.value;
      if (!password || !selectedTeam || !activePermission || authPending) return;
      authPending = true;
      authError.textContent = "";
      submitButton.disabled = true;

      rosterId.value = selectedTeam;
      rosterPassword.value = password;
      unlockOverlay.hidden = true;
      unlockForm.requestSubmit();
    });
    focusSoon("#permissionPasswordInput");
  }

  function availableMonthKeys() {
    const monthBridge = window.RoosterMonthBridge;
    const state = monthBridge?.getState?.() || {};
    return [...new Set([
      state.activeMonthKey,
      state.currentMonthKey,
      state.coreMonthKey,
      ...(state.availableMonths || [])
    ].filter((value) => /^\d{4}-\d{2}$/.test(String(value || ""))))];
  }

  async function resolveEmployeeName(attempt = 0) {
    if (resolvedEmployeeName) return resolvedEmployeeName;
    if (!activePermission?.rosterHash) return "";

    const monthBridge = window.RoosterMonthBridge;
    for (const monthKey of availableMonthKeys()) {
      const roster = monthBridge?.getRoster?.(monthKey);
      for (const employee of roster?.employees || []) {
        if (await hashName(employee?.name) === activePermission.rosterHash) {
          resolvedEmployeeName = employee.name;
          return resolvedEmployeeName;
        }
      }
    }

    if (attempt >= 30) return "";
    await new Promise((resolve) => setTimeout(resolve, 100));
    return resolveEmployeeName(attempt + 1);
  }

  async function collectEmployeeNames(attempt = 0) {
    const monthBridge = window.RoosterMonthBridge;
    const state = monthBridge?.getState?.() || {};
    const monthKey = /^\d{4}-\d{2}$/.test(String(state.currentMonthKey || ""))
      ? state.currentMonthKey
      : "";
    const roster = monthKey ? monthBridge?.getRoster?.(monthKey) : null;
    const names = new Set();

    for (const employee of roster?.employees || []) {
      const hasActiveScheduleThisMonth = (employee?.schedules || []).some((schedule) =>
        String(schedule?.date || "").slice(0, 7) === monthKey
      );
      if (!hasActiveScheduleThisMonth) continue;
      const name = String(employee?.name || "").trim();
      if (name) names.add(name);
    }

    if (names.size) return [...names].sort((a, b) => a.localeCompare(b, "nl"));
    if (attempt >= 30) return [];
    await new Promise((resolve) => setTimeout(resolve, 100));
    return collectEmployeeNames(attempt + 1);
  }

  function closeOverview() {
    rosterResult.hidden = true;
    rosterResult.innerHTML = "";
    searchCard.classList.remove("has-roster", "has-month-roster");
  }

  function openEmployeeRoster(actualName) {
    if (!actualName) return;
    employeeName.value = actualName;
    nameForm.requestSubmit();
    setTimeout(() => { employeeName.value = ""; }, 0);
  }

  async function openAllowedRoster() {
    const actualName = await resolveEmployeeName();
    if (!actualName) {
      rosterResult.innerHTML = '<div class="no-activities">Je eigen rooster kon nog niet worden gekoppeld aan deze toestemming.</div>';
      rosterResult.hidden = false;
      searchCard.classList.add("has-roster");
      return;
    }
    openEmployeeRoster(actualName);
  }

  async function openAllColleagues() {
    if (!hasAllColleaguesAccess()) return;
    const names = await collectEmployeeNames();
    if (!names.length) {
      rosterResult.innerHTML = '<div class="no-activities">Er konden nog geen collega\'s uit het rooster worden geladen.</div>';
      rosterResult.hidden = false;
      searchCard.classList.add("has-roster");
      return;
    }

    rosterResult.innerHTML = `
      <div class="manager-colleagues-view">
        <div class="today-workers-head">
          <div>
            <h2>Alle collega's</h2>
            <p class="today-workers-date">Kies een collega om het volledige rooster te openen.</p>
          </div>
        </div>
        <div class="manager-colleagues-grid">
          ${names.map((name, index) => `<button class="today-workers-button manager-colleague-button" type="button" data-colleague-index="${index}">${escapeHtml(name)}</button>`).join("")}
        </div>
      </div>`;
    rosterResult.hidden = false;
    searchCard.classList.add("has-roster");
    searchCard.classList.remove("has-month-roster");

    rosterResult.querySelectorAll("[data-colleague-index]").forEach((button) => {
      button.addEventListener("click", () => {
        const index = Number(button.dataset.colleagueIndex);
        if (!Number.isInteger(index) || !names[index]) return;
        openEmployeeRoster(names[index]);
      });
    });
  }

  function ensureMyRosterButton() {
    const action = document.querySelector(".today-workers-action");
    if (!action) return null;
    let button = document.getElementById("myRosterButton");
    if (button) return button;

    button = document.createElement("button");
    button.id = "myRosterButton";
    button.className = "today-workers-button";
    button.type = "button";
    button.textContent = "Mijn rooster";
    action.prepend(button);
    button.addEventListener("click", (event) => {
      event.preventDefault();
      if (!rosterResult.hidden && rosterResult.querySelector(".employee-head")) {
        closeOverview();
        return;
      }
      openAllowedRoster();
    });
    return button;
  }

  function ensureAllColleaguesButton() {
    const action = document.querySelector(".today-workers-action");
    if (!action) return null;
    let button = document.getElementById("allColleaguesButton");
    if (button) return button;

    button = document.createElement("button");
    button.id = "allColleaguesButton";
    button.className = "today-workers-button";
    button.type = "button";
    button.textContent = "Alle collega's";
    action.prepend(button);
    button.addEventListener("click", (event) => {
      event.preventDefault();
      if (!rosterResult.hidden && rosterResult.querySelector(".manager-colleagues-view")) {
        closeOverview();
        return;
      }
      openAllColleagues();
    });
    return button;
  }

  function configureAccessButtons() {
    if (hasAllColleaguesAccess()) {
      document.getElementById("myRosterButton")?.remove();
      ensureAllColleaguesButton();
      return;
    }
    document.getElementById("allColleaguesButton")?.remove();
    ensureMyRosterButton();
  }

  function completeUnlock() {
    if (app.hidden || !activePermission) return;
    authPending = false;
    if (overlay?.isConnected) overlay.remove();
    overlay = null;
    unlockOverlay.hidden = true;
    configureAccessButtons();
    if (unlockCompleted) return;
    unlockCompleted = true;
    closeOverview();
  }

  continueButton.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    welcomeOverlay.hidden = true;
    showTeamStep();
  }, true);

  if (unlockError) {
    const unlockErrorObserver = new MutationObserver(() => {
      if (!authPending || app.hidden === false) return;
      const message = unlockError.textContent.trim();
      if (!message) return;
      authPending = false;
      const submitButton = overlay?.querySelector("#permissionUnlockButton");
      if (submitButton) submitButton.disabled = false;
      if (authError) authError.textContent = "Het Team Wachtwoord is niet juist voor het geselecteerde team.";
      if (passwordInput) {
        passwordInput.value = "";
        passwordInput.focus();
      }
      unlockError.textContent = "";
    });
    unlockErrorObserver.observe(unlockError, { childList: true, characterData: true, subtree: true });
  }

  window.addEventListener("rooster-unlocked", completeUnlock);

  const appObserver = new MutationObserver(() => {
    if (!app.hidden) completeUnlock();
  });
  appObserver.observe(app, { attributes: true, attributeFilter: ["hidden"] });

  setTimeout(() => {
    if (!app.hidden) return;
    if (welcomeOverlay.hidden || !unlockOverlay.hidden) {
      unlockOverlay.hidden = true;
      showTeamStep();
    }
  }, 0);
})();
