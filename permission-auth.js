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
  let nameStepBusy = false;

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

  function searchSignature(value) {
    return String(value || "")
      .toLocaleLowerCase("nl-NL")
      .normalize("NFD")
      .replace(/\p{M}/gu, "")
      .replace(/[^\p{L}\p{N}]+/gu, " ")
      .trim();
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

  async function permissionForSelectedEmployee(fullName) {
    const rosterHash = await hashName(fullName);
    const loginHash = await hashName(firstNameFromInput(fullName));
    const byRoster = PERMISSIONS.find((permission) => permission?.rosterHash === rosterHash);
    const byLogin = PERMISSIONS.find((permission) => permission?.loginHash === loginHash);
    const matched = byRoster || byLogin || null;
    return matched ? { ...matched, rosterHash } : { rosterHash };
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
    nameStepBusy = false;
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
      activePermission = null;
      resolvedEmployeeName = "";
      colleagueFirstName = "Collega";
      unlockCompleted = false;
      showPasswordStep();
    });
    focusSoon("#permissionTeamSelect");
  }

  function showPasswordStep() {
    authPending = false;
    nameStepBusy = false;
    const target = ensureOverlay();
    target.innerHTML = `
      <form id="permissionPasswordForm" class="unlock-card permission-auth-card" autocomplete="off">
        <h1>Team ontgrendelen</h1>
        <p>Typ het Team Wachtwoord voor <strong>${escapeHtml(selectedTeam)}</strong>. Daarna kun je je naam kiezen uit het ontgrendelde rooster.</p>
        <label for="permissionPasswordInput">Team Wachtwoord</label>
        <input id="permissionPasswordInput" type="password" autocomplete="new-password" required>
        <button id="permissionUnlockButton" class="full-button" type="submit">Rooster ontgrendelen</button>
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
      const password = passwordInput.value;
      if (!password || !selectedTeam || authPending) return;
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

  async function collectUnlockedEmployeeNames(attempt = 0) {
    const monthBridge = window.RoosterMonthBridge;
    const names = new Set();
    for (const monthKey of availableMonthKeys()) {
      const roster = monthBridge?.getRoster?.(monthKey);
      for (const employee of roster?.employees || []) {
        const name = String(employee?.name || "").trim();
        if (name) names.add(name);
      }
    }
    if (names.size) return [...names].sort((a, b) => a.localeCompare(b, "nl"));
    if (attempt >= 50) return [];
    await new Promise((resolve) => setTimeout(resolve, 100));
    return collectUnlockedEmployeeNames(attempt + 1);
  }

  function rankedMatches(names, query) {
    const q = searchSignature(query);
    if (!q) return [];
    return names
      .map((name) => {
        const normalized = searchSignature(name);
        const words = normalized.split(/\s+/).filter(Boolean);
        let score = 99;
        if (normalized.startsWith(q)) score = 0;
        else if (words[0]?.startsWith(q)) score = 1;
        else if (words.some((word) => word.startsWith(q))) score = 2;
        else if (normalized.includes(q)) score = 3;
        return { name, score };
      })
      .filter((item) => item.score < 99)
      .sort((a, b) => itemCompare(a, b))
      .slice(0, 14)
      .map((item) => item.name);
  }

  function itemCompare(a, b) {
    if (a.score !== b.score) return a.score - b.score;
    return a.name.localeCompare(b.name, "nl");
  }

  async function finalizeEmployeeSelection(fullName) {
    const exactName = String(fullName || "").trim();
    if (!exactName) return;
    resolvedEmployeeName = exactName;
    colleagueFirstName = firstNameFromInput(exactName);
    activePermission = await permissionForSelectedEmployee(exactName);
    unlockCompleted = true;
    configureAccessButtons();
    closeOverview();

    if (overlay?.isConnected) overlay.remove();
    overlay = null;
    unlockOverlay.hidden = true;
    body.classList.add("roster-person-selected");

    window.dispatchEvent(new CustomEvent("rooster-user-selected", {
      detail: {
        name: resolvedEmployeeName,
        firstName: colleagueFirstName,
        team: selectedTeam
      }
    }));
  }

  async function showNameStep() {
    if (nameStepBusy || unlockCompleted) return;
    nameStepBusy = true;
    authPending = false;
    const target = ensureOverlay();
    target.innerHTML = `
      <form id="permissionNameForm" class="unlock-card permission-auth-card" autocomplete="off">
        <h1>Wie ben je?</h1>
        <p>Het rooster is ontgrendeld. Typ je naam; suggesties komen rechtstreeks uit het beveiligde roosterbestand.</p>
        <label for="permissionNameInput">Naam</label>
        <div class="permission-auth-name-field">
          <input id="permissionNameInput" type="text" autocomplete="off" autocapitalize="words" placeholder="Begin met typen…" disabled required>
          <div id="permissionNameSuggestions" class="permission-auth-name-suggestions" role="listbox" hidden></div>
        </div>
        <button id="permissionNameSubmit" class="full-button" type="submit" disabled>Verder naar WFM</button>
        <div id="permissionNameError" class="permission-auth-error" aria-live="polite">Namen uit rooster laden…</div>
      </form>`;
    target.hidden = false;

    const form = target.querySelector("#permissionNameForm");
    const input = target.querySelector("#permissionNameInput");
    const suggestions = target.querySelector("#permissionNameSuggestions");
    const submit = target.querySelector("#permissionNameSubmit");
    const error = target.querySelector("#permissionNameError");
    const names = await collectUnlockedEmployeeNames();

    if (!names.length) {
      nameStepBusy = false;
      error.textContent = "Er konden geen namen uit het ontgrendelde rooster worden geladen. Vernieuw de pagina en probeer opnieuw.";
      return;
    }

    error.textContent = "";
    input.disabled = false;
    submit.disabled = false;
    let selectedName = "";
    let activeIndex = -1;
    let currentMatches = [];

    function hideSuggestions() {
      suggestions.hidden = true;
      suggestions.innerHTML = "";
      activeIndex = -1;
      currentMatches = [];
    }

    function chooseName(name) {
      selectedName = name;
      input.value = name;
      hideSuggestions();
      error.textContent = "";
    }

    function renderSuggestions() {
      selectedName = "";
      currentMatches = rankedMatches(names, input.value);
      activeIndex = -1;
      if (!currentMatches.length) {
        hideSuggestions();
        return;
      }
      suggestions.innerHTML = currentMatches.map((name, index) =>
        `<button class="permission-auth-name-option" type="button" role="option" data-name-index="${index}">${escapeHtml(name)}</button>`
      ).join("");
      suggestions.hidden = false;
      suggestions.querySelectorAll("[data-name-index]").forEach((button) => {
        button.addEventListener("pointerdown", (event) => event.preventDefault());
        button.addEventListener("click", () => {
          const index = Number(button.dataset.nameIndex);
          if (Number.isInteger(index) && currentMatches[index]) chooseName(currentMatches[index]);
        });
      });
    }

    function updateActiveOption() {
      suggestions.querySelectorAll("[data-name-index]").forEach((button, index) => {
        button.classList.toggle("is-active", index === activeIndex);
      });
    }

    input.addEventListener("input", () => {
      error.textContent = "";
      renderSuggestions();
    });
    input.addEventListener("focus", () => {
      if (input.value.trim()) renderSuggestions();
    });
    input.addEventListener("blur", () => window.setTimeout(hideSuggestions, 120));
    input.addEventListener("keydown", (event) => {
      if (suggestions.hidden || !currentMatches.length) return;
      if (event.key === "ArrowDown") {
        event.preventDefault();
        activeIndex = (activeIndex + 1) % currentMatches.length;
        updateActiveOption();
      } else if (event.key === "ArrowUp") {
        event.preventDefault();
        activeIndex = activeIndex <= 0 ? currentMatches.length - 1 : activeIndex - 1;
        updateActiveOption();
      } else if (event.key === "Enter" && activeIndex >= 0) {
        event.preventDefault();
        chooseName(currentMatches[activeIndex]);
      } else if (event.key === "Escape") {
        hideSuggestions();
      }
    });

    form?.addEventListener("submit", async (event) => {
      event.preventDefault();
      error.textContent = "";
      const typed = searchSignature(input.value);
      const exact = selectedName || names.find((name) => searchSignature(name) === typed) || "";
      if (!exact) {
        error.textContent = "Kies je volledige naam uit de suggestielijst.";
        input.focus();
        renderSuggestions();
        return;
      }
      submit.disabled = true;
      input.disabled = true;
      error.textContent = "WFM voorbereiden…";
      await finalizeEmployeeSelection(exact);
    });

    nameStepBusy = false;
    focusSoon("#permissionNameInput");
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

  async function collectEmployeeNames() {
    return collectUnlockedEmployeeNames();
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
      rosterResult.innerHTML = '<div class="no-activities">Je eigen rooster kon nog niet worden gekoppeld aan deze naam.</div>';
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
    if (activePermission?.rosterHash) {
      ensureMyRosterButton();
    } else {
      document.getElementById("myRosterButton")?.remove();
    }

    if (hasAllColleaguesAccess()) {
      ensureAllColleaguesButton();
    } else {
      document.getElementById("allColleaguesButton")?.remove();
    }
  }

  function handleSuccessfulUnlock() {
    if (!selectedTeam || !authPending || app.hidden) return;
    authPending = false;
    unlockOverlay.hidden = true;
    showNameStep();
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

  window.addEventListener("rooster-unlocked", handleSuccessfulUnlock);

  const appObserver = new MutationObserver(() => {
    if (!app.hidden) handleSuccessfulUnlock();
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