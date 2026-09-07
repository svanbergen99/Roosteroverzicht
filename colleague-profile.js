(() => {
  "use strict";

  const API = "https://roosteroverzicht-rooster-bridge-production.up.railway.app";
  const BROWSER_KEY = "rhColleagueProfileBrowserV1";
  const PROFILE_SAVED_KEY = "rhColleagueProfileSavedV1";
  const WEATHER_LOCATION_KEY = "roosteroverzicht.weather.location.v2.0";
  const OVERLAY_ID = "colleagueProfileOverlay";
  const TIME_ZONE = "Europe/Amsterdam";
  const app = document.getElementById("app");

  let profile = null;
  let resolvePromise = null;
  let promptDismissed = false;
  let birthdayPlayed = false;
  let unlockPending = null;

  function randomId() {
    const bytes = new Uint8Array(32);
    crypto.getRandomValues(bytes);
    let binary = "";
    bytes.forEach(byte => { binary += String.fromCharCode(byte); });
    return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
  }

  function browserId() {
    try {
      let id = localStorage.getItem(BROWSER_KEY) || "";
      if (!/^[A-Za-z0-9_-]{32,160}$/.test(id)) {
        id = randomId();
        localStorage.setItem(BROWSER_KEY, id);
      }
      return id;
    } catch (_) {
      if (!window.__rhTemporaryColleagueBrowserId) window.__rhTemporaryColleagueBrowserId = randomId();
      return window.__rhTemporaryColleagueBrowserId;
    }
  }

  function markProfileSaved() {
    try { localStorage.setItem(PROFILE_SAVED_KEY, browserId()); } catch (_) {}
  }

  function browserHasSavedProfile() {
    try { return localStorage.getItem(PROFILE_SAVED_KEY) === browserId(); }
    catch (_) { return Boolean(profile || unlockPending); }
  }

  function isStartPageOpen() {
    return Boolean(app && !app.hidden && document.body.classList.contains("public-portal-mode"));
  }

  function amsterdamMonthDay() {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: TIME_ZONE,
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(new Date());
    const month = parts.find(part => part.type === "month")?.value || "";
    const day = parts.find(part => part.type === "day")?.value || "";
    return `${month}-${day}`;
  }

  async function applyProfileLocation(locationName) {
    const query = String(locationName || "").trim();
    if (!query) return;
    try {
      const url = new URL("https://geocoding-api.open-meteo.com/v1/search");
      url.searchParams.set("name", query);
      url.searchParams.set("count", "1");
      url.searchParams.set("language", "nl");
      url.searchParams.set("format", "json");
      url.searchParams.set("countryCode", "NL");
      const response = await fetch(url.toString(), { cache: "no-store" });
      if (!response.ok) return;
      const data = await response.json();
      const result = Array.isArray(data?.results) ? data.results[0] : null;
      if (!result || !Number.isFinite(Number(result.latitude)) || !Number.isFinite(Number(result.longitude))) return;
      const location = {
        name: result.admin1 && result.admin1 !== result.name ? `${result.name}, ${result.admin1}` : result.name,
        latitude: Number(result.latitude),
        longitude: Number(result.longitude),
      };
      localStorage.setItem(WEATHER_LOCATION_KEY, JSON.stringify(location));
      window.dispatchEvent(new CustomEvent("rooster-profile-location-ready", { detail: { location } }));
    } catch (_) {}
  }

  function maybePlayBirthday() {
    if (birthdayPlayed || !profile?.birthday || !isStartPageOpen()) return;
    if (profile.birthday !== amsterdamMonthDay()) return;
    birthdayPlayed = true;
    window.setTimeout(() => window.RoosterBirthdayScene?.show?.(true), 250);
  }

  function publishProfile(nextProfile) {
    if (!nextProfile || typeof nextProfile !== "object") return;
    markProfileSaved();
    unlockPending = null;
    profile = Object.freeze({
      name: String(nextProfile.name || ""),
      location: String(nextProfile.location || ""),
      birthday: String(nextProfile.birthday || ""),
      hasUnlock: Boolean(nextProfile.hasUnlock ?? nextProfile.hasPin),
      unlockType: String(nextProfile.unlockType || (nextProfile.hasPin ? "pin" : "none")),
    });
    window.RoosterColleagueProfile = profile;
    window.dispatchEvent(new CustomEvent("rooster-colleague-profile-ready", { detail: { profile } }));
    applyProfileLocation(profile.location);
    maybePlayBirthday();
  }

  async function apiPost(path, body) {
    const response = await fetch(`${API}${path}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      cache: "no-store",
      body: JSON.stringify(body),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error(data?.message || `Railway HTTP ${response.status}`);
      error.code = data?.code || "RAILWAY_ERROR";
      error.status = response.status;
      throw error;
    }
    return data;
  }

  function closeOverlay() {
    document.getElementById(OVERLAY_ID)?.remove();
  }

  function credentialUi(mode, input, help) {
    const type = String(mode || "none");
    if (type === "pin") {
      input.type = "password";
      input.inputMode = "numeric";
      input.pattern = "[0-9]{4,6}";
      input.minLength = 4;
      input.maxLength = 6;
      input.placeholder = "4–6 cijfers";
      input.autocomplete = "new-password";
      input.required = true;
      help.innerHTML = "Kies 4–6 cijfers. <strong>Gebruik hier niet je echte AA/WFM- of Team-wachtwoord.</strong>";
      return;
    }
    if (type === "password") {
      input.type = "password";
      input.inputMode = "text";
      input.removeAttribute("pattern");
      input.minLength = 6;
      input.maxLength = 72;
      input.placeholder = "Minimaal 6 tekens";
      input.autocomplete = "new-password";
      input.required = true;
      help.innerHTML = "Dit wachtwoord is alleen voor jouw persoonlijke pagina. <strong>Gebruik niet je echte AA/WFM- of Team-wachtwoord.</strong>";
      return;
    }
    input.value = "";
    input.required = false;
    input.removeAttribute("pattern");
    input.minLength = 0;
    input.maxLength = 72;
  }

  function showProfileForm(force = false) {
    if (!isStartPageOpen() || profile || unlockPending || promptDismissed || document.getElementById(OVERLAY_ID)) return;
    if (!force && browserHasSavedProfile()) return;

    const overlay = document.createElement("div");
    overlay.id = OVERLAY_ID;
    overlay.className = "colleague-profile-overlay";
    overlay.setAttribute("role", "dialog");
    overlay.setAttribute("aria-modal", "true");
    overlay.setAttribute("aria-labelledby", "colleagueProfileTitle");
    overlay.innerHTML = `
      <form class="colleague-profile-card" id="colleagueProfileForm" autocomplete="off">
        <div class="colleague-profile-head">
          <div>
            <div class="colleague-profile-kicker">Even voorstellen</div>
            <h2 id="colleagueProfileTitle">Maak jouw persoonlijke profiel</h2>
            <p>Je profiel koppelt deze browser aan jouw naam, locatie en verjaardag. Het AA-nummer wordt op Railway alleen als pseudonieme sleutel gebruikt.</p>
          </div>
        </div>

        <div class="colleague-profile-grid">
          <label>Naam
            <input id="colleagueProfileName" name="name" type="text" maxlength="120" autocomplete="name" required placeholder="Voor- en achternaam">
          </label>
          <label>Geboortedatum
            <input id="colleagueProfileBirthDate" name="birthDate" type="date" autocomplete="bday" required>
            <span class="colleague-profile-help">Alleen dag en maand worden opgeslagen; het geboortejaar wordt weggegooid.</span>
          </label>
          <label>Locatie
            <input id="colleagueProfileLocation" name="location" type="text" maxlength="120" required placeholder="Bijvoorbeeld Rotterdam">
          </label>
          <label>AA-nummer
            <input id="colleagueProfileAa" name="aa" type="text" maxlength="80" autocapitalize="none" spellcheck="false" required placeholder="Jouw AA-nummer">
            <span class="colleague-profile-help">Het AA-nummer zelf wordt niet leesbaar opgeslagen.</span>
          </label>
        </div>

        <div class="colleague-profile-unlock-block">
          <label>Persoonlijke ontgrendeling <span class="colleague-profile-optional">optioneel</span>
            <select id="colleagueProfileUnlockType" name="unlockType">
              <option value="none">Geen extra code — automatisch herkennen</option>
              <option value="pin">Persoonlijke pincode</option>
              <option value="password">Persoonlijk paginawachtwoord</option>
            </select>
          </label>
          <div id="colleagueProfileCredentialWrap" hidden>
            <label id="colleagueProfileCredentialLabel">Jouw persoonlijke code
              <input id="colleagueProfileCredential" name="credential" type="password" autocomplete="new-password">
              <span id="colleagueProfileCredentialHelp" class="colleague-profile-help"></span>
            </label>
          </div>
          <div class="colleague-profile-scope-note">Deze persoonlijke code ontgrendelt alleen jouw persoonlijke startpagina-profiel. De beveiligde informatiepagina's houden hun eigen echte toegangscontrole.</div>
        </div>

        <div id="colleagueProfileError" class="colleague-profile-error" aria-live="polite"></div>
        <div class="colleague-profile-actions">
          <button type="button" class="colleague-profile-later" id="colleagueProfileLater">Niet nu</button>
          <button type="submit" class="colleague-profile-save" id="colleagueProfileSave">OK, profiel opslaan</button>
        </div>
        <div class="colleague-profile-browser-note">Deze browser krijgt automatisch een willekeurige browsercode. Die code blijft alleen in deze browser staan.</div>
      </form>`;
    document.body.appendChild(overlay);

    const form = overlay.querySelector("#colleagueProfileForm");
    const errorNode = overlay.querySelector("#colleagueProfileError");
    const saveButton = overlay.querySelector("#colleagueProfileSave");
    const unlockType = overlay.querySelector("#colleagueProfileUnlockType");
    const credentialWrap = overlay.querySelector("#colleagueProfileCredentialWrap");
    const credential = overlay.querySelector("#colleagueProfileCredential");
    const credentialLabel = overlay.querySelector("#colleagueProfileCredentialLabel");
    const credentialHelp = overlay.querySelector("#colleagueProfileCredentialHelp");

    function refreshCredentialChoice() {
      const mode = String(unlockType?.value || "none");
      const active = mode !== "none";
      credentialWrap.hidden = !active;
      if (!active) {
        credentialUi("none", credential, credentialHelp);
        return;
      }
      credentialLabel.firstChild.textContent = mode === "pin" ? "Jouw persoonlijke pincode " : "Jouw persoonlijke paginawachtwoord ";
      credentialUi(mode, credential, credentialHelp);
    }

    unlockType?.addEventListener("change", refreshCredentialChoice);
    refreshCredentialChoice();

    overlay.querySelector("#colleagueProfileLater")?.addEventListener("click", () => {
      promptDismissed = true;
      closeOverlay();
    });

    form?.addEventListener("submit", async (event) => {
      event.preventDefault();
      errorNode.textContent = "";
      if (!form.reportValidity()) return;
      saveButton.disabled = true;
      saveButton.textContent = "Opslaan…";

      try {
        const mode = String(form.elements.unlockType.value || "none");
        const result = await apiPost("/api/colleague-profile/save", {
          browserId: browserId(),
          name: form.elements.name.value,
          birthDate: form.elements.birthDate.value,
          location: form.elements.location.value,
          aa: form.elements.aa.value,
          unlockType: mode,
          credential: mode === "none" ? "" : form.elements.credential.value,
        });
        markProfileSaved();
        publishProfile(result.profile);
        closeOverlay();
      } catch (error) {
        errorNode.textContent = error?.message || "Profiel opslaan is niet gelukt.";
        saveButton.disabled = false;
        saveButton.textContent = "OK, profiel opslaan";
      }
    });

    requestAnimationFrame(() => overlay.querySelector("#colleagueProfileName")?.focus());
  }

  function showUnlockForm(type) {
    if (!isStartPageOpen() || profile || document.getElementById(OVERLAY_ID)) return;
    const mode = type === "password" ? "password" : "pin";
    unlockPending = { type: mode };
    markProfileSaved();

    const overlay = document.createElement("div");
    overlay.id = OVERLAY_ID;
    overlay.className = "colleague-profile-overlay";
    overlay.setAttribute("role", "dialog");
    overlay.setAttribute("aria-modal", "true");
    overlay.setAttribute("aria-labelledby", "colleagueProfileUnlockTitle");
    overlay.innerHTML = `
      <form class="colleague-profile-card colleague-profile-unlock-card" id="colleagueProfileUnlockForm" autocomplete="off">
        <div class="colleague-profile-head">
          <div class="colleague-profile-kicker">Welkom terug</div>
          <h2 id="colleagueProfileUnlockTitle">Ontgrendel jouw persoonlijke pagina</h2>
          <p>Deze browser herkent jouw profiel. Gebruik je ${mode === "pin" ? "persoonlijke pincode" : "persoonlijke paginawachtwoord"} om je persoonlijke instellingen te laden.</p>
        </div>
        <label class="colleague-profile-unlock-input">${mode === "pin" ? "Persoonlijke pincode" : "Persoonlijk paginawachtwoord"}
          <input id="colleagueProfileUnlockCredential" name="credential" type="password" autocomplete="current-password" ${mode === "pin" ? 'inputmode="numeric" pattern="[0-9]{4,6}" minlength="4" maxlength="6" placeholder="4–6 cijfers"' : 'minlength="6" maxlength="72" placeholder="Jouw persoonlijke wachtwoord"'} required>
        </label>
        <div id="colleagueProfileUnlockError" class="colleague-profile-error" aria-live="polite"></div>
        <div class="colleague-profile-actions">
          <button type="button" class="colleague-profile-later" id="colleagueProfileWithoutProfile">Doorgaan zonder profiel</button>
          <button type="submit" class="colleague-profile-save" id="colleagueProfileUnlockButton">Profiel openen</button>
        </div>
        <div class="colleague-profile-browser-note">Dit is alleen de persoonlijke profielontgrendeling. Beveiligde informatiepagina's gebruiken hun eigen toegangscontrole.</div>
      </form>`;
    document.body.appendChild(overlay);

    const form = overlay.querySelector("#colleagueProfileUnlockForm");
    const errorNode = overlay.querySelector("#colleagueProfileUnlockError");
    const button = overlay.querySelector("#colleagueProfileUnlockButton");

    overlay.querySelector("#colleagueProfileWithoutProfile")?.addEventListener("click", () => {
      promptDismissed = true;
      unlockPending = null;
      closeOverlay();
    });

    form?.addEventListener("submit", async (event) => {
      event.preventDefault();
      errorNode.textContent = "";
      if (!form.reportValidity()) return;
      button.disabled = true;
      button.textContent = "Controleren…";
      try {
        const result = await apiPost("/api/colleague-profile/verify-unlock", {
          browserId: browserId(),
          credential: form.elements.credential.value,
        });
        markProfileSaved();
        publishProfile(result.profile);
        closeOverlay();
      } catch (error) {
        errorNode.textContent = error?.message || "Ontgrendelen is niet gelukt.";
        button.disabled = false;
        button.textContent = "Profiel openen";
      }
    });

    requestAnimationFrame(() => overlay.querySelector("#colleagueProfileUnlockCredential")?.focus());
  }

  function resolveProfile() {
    if (resolvePromise) return resolvePromise;

    resolvePromise = (async () => {
      try {
        const result = await apiPost("/api/colleague-profile/resolve", { browserId: browserId() });
        if (result?.locked) {
          markProfileSaved();
          showUnlockForm(result.unlockType);
          return;
        }
        if (result?.profile) {
          markProfileSaved();
          publishProfile(result.profile);
          return;
        }
        if (!browserHasSavedProfile()) showProfileForm();
      } catch (error) {
        if (error?.code === "PROFILE_NOT_FOUND" && !browserHasSavedProfile()) {
          showProfileForm();
        }
      }
    })();

    return resolvePromise;
  }

  function onStartReady() {
    if (profile) {
      applyProfileLocation(profile.location);
      maybePlayBirthday();
      return;
    }
    if (unlockPending) {
      showUnlockForm(unlockPending.type);
      return;
    }
    resolveProfile();
  }

  if (window.RoosterReady?.when) {
    window.RoosterReady.when("startPageReady", onStartReady);
  } else if (isStartPageOpen()) {
    onStartReady();
  }

  window.RoosterColleagueProfileSetup = Object.freeze({
    open: () => {
      promptDismissed = false;
      closeOverlay();
      if (profile?.hasUnlock) {
        const type = profile.unlockType || "pin";
        profile = null;
        window.RoosterColleagueProfile = null;
        unlockPending = { type };
        showUnlockForm(type);
        return;
      }
      if (!profile) showProfileForm(true);
    },
    getBrowserId: () => browserId(),
    getProfile: () => profile,
  });
})();