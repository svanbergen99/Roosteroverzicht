(() => {
  "use strict";

  const API = "https://roosteroverzicht-rooster-bridge-production.up.railway.app";
  const BUTTON_ID = "colleagueProfileManagerButton";
  const OVERLAY_ID = "colleagueProfileManagerOverlay";
  const STYLE_ID = "colleagueProfileManagerStyles";
  const WEATHER_LOCATION_KEY = "roosteroverzicht.weather.location.v2.0";
  const PROFILE_SAVED_KEY = "rhColleagueProfileSavedV1";
  const BIRTHDAY_PLAY_KEY = "rhColleagueBirthdayPlayedV1";
  const TIME_ZONE = "Europe/Amsterdam";

  let deleteArmed = false;
  let weatherRefreshTimer = 0;

  function profile() {
    return window.RoosterColleagueProfile && typeof window.RoosterColleagueProfile === "object"
      ? window.RoosterColleagueProfile
      : null;
  }

  function browserId() {
    return window.RoosterColleagueProfileSetup?.getBrowserId?.() || "";
  }

  function isStartPageOpen() {
    const app = document.getElementById("app");
    return Boolean(app && !app.hidden && document.body.classList.contains("public-portal-mode"));
  }

  function amsterdamDateKey() {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: TIME_ZONE,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(new Date());
    const read = (type) => parts.find((part) => part.type === type)?.value || "";
    return `${read("year")}-${read("month")}-${read("day")}`;
  }

  function todayMonthDay() {
    return amsterdamDateKey().slice(5);
  }

  function formatBirthday(value) {
    const match = String(value || "").match(/^(\d{2})-(\d{2})$/);
    if (!match) return "Niet ingesteld";
    const date = new Date(Date.UTC(2000, Number(match[1]) - 1, Number(match[2]), 12));
    return new Intl.DateTimeFormat("nl-NL", {
      day: "numeric",
      month: "long",
      timeZone: "UTC",
    }).format(date);
  }

  function installStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
      #${BUTTON_ID} {
        margin-top: 10px;
        min-height: 50px;
      }
      #${BUTTON_ID} .public-roster-button-icon {
        font-size: 17px;
      }
      .colleague-profile-manager-status {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 10px;
        margin: 18px 0 0;
      }
      .colleague-profile-manager-status > div {
        padding: 11px 12px;
        border: 1px solid #e2e8f0;
        border-radius: 12px;
        background: #f8fafc;
        color: #475569;
        font-size: 12.5px;
        line-height: 1.4;
      }
      .colleague-profile-manager-status strong {
        display: block;
        margin-bottom: 3px;
        color: #172033;
        font-size: 13px;
      }
      .colleague-profile-manager-birthday {
        display: grid;
        grid-template-columns: 1fr 1.6fr;
        gap: 10px;
        margin-top: 7px;
      }
      .colleague-profile-manager-birthday select {
        width: 100%;
        padding: 12px 13px;
        border: 1px solid #cbd5e1;
        border-radius: 12px;
        background: #fff;
        color: #172033;
        font: inherit;
      }
      .colleague-profile-manager-delete {
        margin-right: auto;
        background: #fff1f2;
        color: #9f1239;
      }
      .colleague-profile-manager-delete:hover {
        background: #ffe4e6;
      }
      .colleague-profile-manager-success {
        color: #166534;
      }
      @media (max-width: 620px) {
        .colleague-profile-manager-status,
        .colleague-profile-manager-birthday {
          grid-template-columns: 1fr;
        }
        .colleague-profile-manager-delete {
          margin-right: 0;
        }
      }
    `;
    document.head.appendChild(style);
  }

  function readWeatherLocation() {
    try {
      const value = JSON.parse(localStorage.getItem(WEATHER_LOCATION_KEY) || "null");
      if (value?.name && Number.isFinite(Number(value.latitude)) && Number.isFinite(Number(value.longitude))) return value;
    } catch (_) {}
    return null;
  }

  async function geocodeProfileLocation(locationName) {
    const query = String(locationName || "").trim();
    if (!query) return null;
    try {
      const url = new URL("https://geocoding-api.open-meteo.com/v1/search");
      url.searchParams.set("name", query);
      url.searchParams.set("count", "1");
      url.searchParams.set("language", "nl");
      url.searchParams.set("format", "json");
      url.searchParams.set("countryCode", "NL");
      const response = await fetch(url.toString(), { cache: "no-store" });
      if (!response.ok) return null;
      const data = await response.json();
      const result = Array.isArray(data?.results) ? data.results[0] : null;
      if (!result || !Number.isFinite(Number(result.latitude)) || !Number.isFinite(Number(result.longitude))) return null;
      const location = {
        name: result.admin1 && result.admin1 !== result.name ? `${result.name}, ${result.admin1}` : result.name,
        latitude: Number(result.latitude),
        longitude: Number(result.longitude),
      };
      localStorage.setItem(WEATHER_LOCATION_KEY, JSON.stringify(location));
      return location;
    } catch (_) {
      return null;
    }
  }

  function refreshWeatherWhenReady(attempt = 0) {
    clearTimeout(weatherRefreshTimer);
    const weather = window.RoosterStartWeather;
    if (weather?.refresh) {
      weather.refresh();
      return;
    }
    if (attempt >= 80) return;
    weatherRefreshTimer = window.setTimeout(() => refreshWeatherWhenReady(attempt + 1), 100);
  }

  function installBirthdayOncePerDayGuard() {
    if (window.__rhColleagueBirthdayOncePerDayGuard) return;
    const scene = window.RoosterBirthdayScene;
    if (!scene?.show) {
      window.setTimeout(installBirthdayOncePerDayGuard, 50);
      return;
    }

    const originalShow = scene.show.bind(scene);
    const originalHide = scene.hide?.bind(scene);
    window.RoosterBirthdayScene = Object.freeze({
      show(animate = true) {
        const current = profile();
        if (animate && current?.birthday && current.birthday === todayMonthDay()) {
          const key = `${browserId()}:${amsterdamDateKey()}`;
          try {
            if (localStorage.getItem(BIRTHDAY_PLAY_KEY) === key) return;
            localStorage.setItem(BIRTHDAY_PLAY_KEY, key);
          } catch (_) {}
        }
        return originalShow(animate);
      },
      hide(...args) {
        return originalHide?.(...args);
      },
    });
    window.__rhColleagueBirthdayOncePerDayGuard = true;
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
      throw error;
    }
    return data;
  }

  function ensureProfileButton(attempt = 0) {
    installStyles();
    const current = profile();
    if (!current || !isStartPageOpen()) return;

    let button = document.getElementById(BUTTON_ID);
    if (button) {
      const copy = button.querySelector("small");
      if (copy) copy.textContent = `${current.name} · ${current.location}`;
      return;
    }

    const row = document.getElementById("publicPortalQuickActions");
    if (!row) {
      if (attempt < 80) window.setTimeout(() => ensureProfileButton(attempt + 1), 75);
      return;
    }

    button = document.createElement("button");
    button.id = BUTTON_ID;
    button.className = "today-workers-button public-roster-button";
    button.type = "button";
    button.setAttribute("aria-label", "Mijn profiel openen");
    button.innerHTML = `
      <span class="public-roster-button-main">
        <span class="public-roster-button-icon" aria-hidden="true">👤</span>
        <span class="public-roster-button-copy">
          <strong>Mijn profiel</strong>
          <small>${current.name} · ${current.location}</small>
        </span>
      </span>
      <span class="public-roster-arrow" aria-hidden="true">›</span>`;
    button.addEventListener("click", openProfileManager);
    row.appendChild(button);
  }

  function birthdayOptions(value) {
    const match = String(value || "").match(/^(\d{2})-(\d{2})$/);
    const currentMonth = match?.[1] || "01";
    const currentDay = match?.[2] || "01";
    const months = [
      "Januari", "Februari", "Maart", "April", "Mei", "Juni",
      "Juli", "Augustus", "September", "Oktober", "November", "December",
    ];
    const dayOptions = Array.from({ length: 31 }, (_, index) => {
      const day = String(index + 1).padStart(2, "0");
      return `<option value="${day}" ${day === currentDay ? "selected" : ""}>${index + 1}</option>`;
    }).join("");
    const monthOptions = months.map((label, index) => {
      const month = String(index + 1).padStart(2, "0");
      return `<option value="${month}" ${month === currentMonth ? "selected" : ""}>${label}</option>`;
    }).join("");
    return { dayOptions, monthOptions };
  }

  function closeManager() {
    document.getElementById(OVERLAY_ID)?.remove();
    deleteArmed = false;
  }

  function credentialUi(mode, input, wrap, help) {
    const type = String(mode || "keep");
    const active = type === "pin" || type === "password";
    wrap.hidden = !active;
    input.required = active;
    input.value = "";
    input.removeAttribute("pattern");
    if (!active) return;
    input.type = "password";
    input.autocomplete = "new-password";
    if (type === "pin") {
      input.inputMode = "numeric";
      input.pattern = "[0-9]{4,6}";
      input.minLength = 4;
      input.maxLength = 6;
      input.placeholder = "4–6 cijfers";
      help.textContent = "Kies een nieuwe pincode van 4–6 cijfers.";
    } else {
      input.inputMode = "text";
      input.minLength = 6;
      input.maxLength = 72;
      input.placeholder = "Minimaal 6 tekens";
      help.textContent = "Kies een nieuw persoonlijk paginawachtwoord.";
    }
  }

  function openProfileManager() {
    const current = profile();
    if (!current || document.getElementById(OVERLAY_ID)) return;
    installStyles();

    const { dayOptions, monthOptions } = birthdayOptions(current.birthday);
    const weather = readWeatherLocation();
    const overlay = document.createElement("div");
    overlay.id = OVERLAY_ID;
    overlay.className = "colleague-profile-overlay";
    overlay.setAttribute("role", "dialog");
    overlay.setAttribute("aria-modal", "true");
    overlay.setAttribute("aria-labelledby", "colleagueProfileManagerTitle");
    overlay.innerHTML = `
      <form class="colleague-profile-card" id="colleagueProfileManagerForm" autocomplete="off">
        <div class="colleague-profile-head">
          <div class="colleague-profile-kicker">Mijn profiel</div>
          <h2 id="colleagueProfileManagerTitle">Persoonlijke gegevens</h2>
          <p>Deze browser is al aan jouw profiel gekoppeld. Hier kun je je persoonlijke gegevens aanpassen zonder opnieuw je AA-nummer in te voeren.</p>
        </div>

        <div class="colleague-profile-manager-status">
          <div><strong>AA-koppeling</strong>Actief en pseudoniem opgeslagen</div>
          <div><strong>Weerlocatie</strong>${weather?.name ? `Gekoppeld aan ${weather.name}` : "Wordt automatisch aan je locatie gekoppeld"}</div>
          <div><strong>Verjaardag</strong>${formatBirthday(current.birthday)}</div>
          <div><strong>Verjaardagseffect</strong>Automatisch, maximaal één keer per dag op deze browser</div>
        </div>

        <div class="colleague-profile-grid">
          <label>Naam
            <input name="name" type="text" maxlength="120" autocomplete="name" required value="${escapeHtml(current.name)}">
          </label>
          <label>Locatie
            <input name="location" type="text" maxlength="120" required value="${escapeHtml(current.location)}">
          </label>
          <label>Verjaardag
            <span class="colleague-profile-manager-birthday">
              <select name="birthdayDay" aria-label="Dag">${dayOptions}</select>
              <select name="birthdayMonth" aria-label="Maand">${monthOptions}</select>
            </span>
            <span class="colleague-profile-help">Alleen dag en maand staan in je profiel; een geboortejaar wordt niet bewaard.</span>
          </label>
        </div>

        <div class="colleague-profile-unlock-block">
          <label>Persoonlijke code
            <select name="unlockAction" id="colleagueProfileManagerUnlockAction">
              <option value="keep">Huidige instelling behouden${current.hasUnlock ? ` (${current.unlockType === "pin" ? "pincode" : "wachtwoord"})` : ""}</option>
              <option value="none">Geen persoonlijke code</option>
              <option value="pin">Nieuwe persoonlijke pincode</option>
              <option value="password">Nieuw persoonlijk paginawachtwoord</option>
            </select>
          </label>
          <div id="colleagueProfileManagerCredentialWrap" hidden>
            <label>Nieuwe persoonlijke code
              <input name="credential" id="colleagueProfileManagerCredential" type="password" autocomplete="new-password">
              <span id="colleagueProfileManagerCredentialHelp" class="colleague-profile-help"></span>
            </label>
          </div>
          <div class="colleague-profile-scope-note">Je persoonlijke code blijft optioneel en wordt niet bij iedere pagina-opening gevraagd. De beveiligde informatiepagina's houden hun eigen toegangscontrole.</div>
        </div>

        <div id="colleagueProfileManagerError" class="colleague-profile-error" aria-live="polite"></div>
        <div class="colleague-profile-actions">
          <button type="button" class="colleague-profile-manager-delete" id="colleagueProfileManagerDelete">Profiel verwijderen</button>
          <button type="button" class="colleague-profile-later" id="colleagueProfileManagerCancel">Annuleren</button>
          <button type="submit" class="colleague-profile-save" id="colleagueProfileManagerSave">Wijzigingen opslaan</button>
        </div>
        <div class="colleague-profile-browser-note">Na opslaan wordt de pagina één keer opnieuw geladen zodat locatie, weer en verjaardag direct met het bijgewerkte profiel starten.</div>
      </form>`;
    document.body.appendChild(overlay);

    const form = overlay.querySelector("#colleagueProfileManagerForm");
    const errorNode = overlay.querySelector("#colleagueProfileManagerError");
    const saveButton = overlay.querySelector("#colleagueProfileManagerSave");
    const deleteButton = overlay.querySelector("#colleagueProfileManagerDelete");
    const unlockAction = overlay.querySelector("#colleagueProfileManagerUnlockAction");
    const credentialWrap = overlay.querySelector("#colleagueProfileManagerCredentialWrap");
    const credential = overlay.querySelector("#colleagueProfileManagerCredential");
    const credentialHelp = overlay.querySelector("#colleagueProfileManagerCredentialHelp");

    unlockAction?.addEventListener("change", () => credentialUi(unlockAction.value, credential, credentialWrap, credentialHelp));
    credentialUi("keep", credential, credentialWrap, credentialHelp);
    overlay.querySelector("#colleagueProfileManagerCancel")?.addEventListener("click", closeManager);
    overlay.addEventListener("click", (event) => {
      if (event.target === overlay) closeManager();
    });

    deleteButton?.addEventListener("click", async () => {
      errorNode.textContent = "";
      if (!deleteArmed) {
        deleteArmed = true;
        deleteButton.textContent = "Nogmaals: profiel verwijderen";
        return;
      }
      deleteButton.disabled = true;
      saveButton.disabled = true;
      deleteButton.textContent = "Verwijderen…";
      try {
        await apiPost("/api/colleague-profile/delete", { browserId: browserId() });
        try {
          localStorage.removeItem(PROFILE_SAVED_KEY);
          localStorage.removeItem(BIRTHDAY_PLAY_KEY);
        } catch (_) {}
        errorNode.classList.add("colleague-profile-manager-success");
        errorNode.textContent = "Profiel verwijderd. De pagina wordt opnieuw geladen.";
        window.setTimeout(() => window.location.reload(), 450);
      } catch (error) {
        errorNode.textContent = error?.message || "Profiel verwijderen is niet gelukt.";
        deleteArmed = false;
        deleteButton.disabled = false;
        saveButton.disabled = false;
        deleteButton.textContent = "Profiel verwijderen";
      }
    });

    form?.addEventListener("submit", async (event) => {
      event.preventDefault();
      errorNode.classList.remove("colleague-profile-manager-success");
      errorNode.textContent = "";
      if (!form.reportValidity()) return;
      saveButton.disabled = true;
      deleteButton.disabled = true;
      saveButton.textContent = "Opslaan…";
      const unlock = String(form.elements.unlockAction.value || "keep");
      const birthday = `${form.elements.birthdayMonth.value}-${form.elements.birthdayDay.value}`;
      try {
        const result = await apiPost("/api/colleague-profile/update", {
          browserId: browserId(),
          name: form.elements.name.value,
          location: form.elements.location.value,
          birthday,
          unlockAction: unlock,
          credential: unlock === "pin" || unlock === "password" ? form.elements.credential.value : "",
        });
        await geocodeProfileLocation(result.profile?.location || form.elements.location.value);
        errorNode.classList.add("colleague-profile-manager-success");
        errorNode.textContent = "Opgeslagen. De pagina wordt opnieuw geladen.";
        window.setTimeout(() => window.location.reload(), 450);
      } catch (error) {
        errorNode.textContent = error?.message || "Wijzigingen opslaan is niet gelukt.";
        saveButton.disabled = false;
        deleteButton.disabled = false;
        saveButton.textContent = "Wijzigingen opslaan";
      }
    });
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function onProfileReady() {
    ensureProfileButton();
    refreshWeatherWhenReady();
  }

  installBirthdayOncePerDayGuard();
  installStyles();
  window.addEventListener("rooster-colleague-profile-ready", onProfileReady);
  window.addEventListener("rooster-profile-location-ready", () => refreshWeatherWhenReady());

  if (window.RoosterReady?.when) {
    window.RoosterReady.when("startPageReady", () => {
      if (profile()) onProfileReady();
    });
  } else if (isStartPageOpen() && profile()) {
    onProfileReady();
  }

  if (profile()) onProfileReady();
})();
