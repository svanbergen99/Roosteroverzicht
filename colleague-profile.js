(() => {
  "use strict";

  const API = "https://roosteroverzicht-rooster-bridge-production.up.railway.app";
  const BROWSER_KEY = "rhColleagueProfileBrowserV1";
  const WEATHER_LOCATION_KEY = "roosteroverzicht.weather.location.v2.0";
  const OVERLAY_ID = "colleagueProfileOverlay";
  const TIME_ZONE = "Europe/Amsterdam";
  const app = document.getElementById("app");

  let profile = null;
  let resolveStarted = false;
  let promptDismissed = false;
  let birthdayPlayed = false;

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
    profile = Object.freeze({
      name: String(nextProfile.name || ""),
      location: String(nextProfile.location || ""),
      birthday: String(nextProfile.birthday || ""),
      hasPin: Boolean(nextProfile.hasPin),
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

  function showProfileForm() {
    if (!isStartPageOpen() || profile || promptDismissed || document.getElementById(OVERLAY_ID)) return;

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
            <p>Hiermee onthouden we op deze browser je locatie en verjaardag. Je AA-nummer wordt op Railway alleen als pseudonieme sleutel gebruikt.</p>
          </div>
        </div>

        <div class="colleague-profile-grid">
          <label>Naam
            <input id="colleagueProfileName" name="name" type="text" maxlength="120" autocomplete="name" required placeholder="Voor- en achternaam">
          </label>
          <label>Locatie
            <input id="colleagueProfileLocation" name="location" type="text" maxlength="120" required placeholder="Bijvoorbeeld Rotterdam">
          </label>
          <label>Geboortedatum
            <input id="colleagueProfileBirthDate" name="birthDate" type="date" autocomplete="bday" required>
            <span class="colleague-profile-help">Alleen dag en maand worden opgeslagen; het geboortejaar wordt weggegooid.</span>
          </label>
          <label>AA-nummer
            <input id="colleagueProfileAa" name="aa" type="text" maxlength="80" autocapitalize="none" spellcheck="false" required placeholder="Jouw AA-nummer">
            <span class="colleague-profile-help">Het AA-nummer zelf wordt niet leesbaar opgeslagen.</span>
          </label>
          <label>Persoonlijke pincode
            <input id="colleagueProfilePin" name="pin" type="password" inputmode="numeric" pattern="[0-9]{4,6}" minlength="4" maxlength="6" autocomplete="new-password" required placeholder="4–6 cijfers">
            <span class="colleague-profile-help"><strong>Gebruik hier niet je echte AA/WFM-wachtwoord.</strong> Dit is alleen jouw profielcode.</span>
          </label>
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
        const result = await apiPost("/api/colleague-profile/save", {
          browserId: browserId(),
          name: form.elements.name.value,
          location: form.elements.location.value,
          birthDate: form.elements.birthDate.value,
          aa: form.elements.aa.value,
          pin: form.elements.pin.value,
        });
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

  async function resolveProfile() {
    if (resolveStarted) return;
    resolveStarted = true;
    try {
      const result = await apiPost("/api/colleague-profile/resolve", { browserId: browserId() });
      if (result?.profile) publishProfile(result.profile);
    } catch (error) {
      if (error?.code === "PROFILE_NOT_FOUND") showProfileForm();
    }
  }

  function onStartReady() {
    if (profile) {
      applyProfileLocation(profile.location);
      maybePlayBirthday();
      return;
    }
    resolveProfile().finally(() => {
      if (!profile) showProfileForm();
    });
  }

  window.addEventListener("rooster-start-ready", onStartReady);
  window.addEventListener("rooster-unlocked", onStartReady);
  window.addEventListener("rooster-private-config-ready", () => {
    if (isStartPageOpen()) onStartReady();
  });

  window.RoosterColleagueProfileSetup = Object.freeze({
    open: () => {
      promptDismissed = false;
      closeOverlay();
      showProfileForm();
    },
    getBrowserId: () => browserId(),
    getProfile: () => profile,
  });

  if (isStartPageOpen()) onStartReady();
})();
