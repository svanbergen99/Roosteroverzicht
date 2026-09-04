(() => {
  "use strict";

  const REFRESH_MS = 10 * 60 * 1000;
  const STORAGE_PREFIX = "roosteroverzicht.weather.location.v2.";
  const SCENE_ID = "startWeatherScene";
  const CONTROL_ID = "weatherEffectsWrap";
  const BARS_ID = "publicWeatherBars";

  const DEFAULTS = Object.freeze([
    Object.freeze({ name: "Rotterdam", latitude: 51.9225, longitude: 4.47917 }),
    Object.freeze({ name: "Apeldoorn", latitude: 52.21, longitude: 5.96944 })
  ]);

  const WEATHER_EFFECTS = Object.freeze({
    sun: Object.freeze({ label: "Zon", icon: "☀️" }),
    rain: Object.freeze({ label: "Regen", icon: "🌧️" }),
    fog: Object.freeze({ label: "Mist", icon: "🌫️" }),
    cloudy: Object.freeze({ label: "Bewolkt", icon: "☁️" }),
    snow: Object.freeze({ label: "Sneeuw", icon: "🌨️" }),
    thunder: Object.freeze({ label: "Onweer", icon: "⛈️" }),
    wind: Object.freeze({ label: "Wind", icon: "💨" }),
    rainbow: Object.freeze({ label: "Regenboog", icon: "🌈" })
  });

  const app = document.getElementById("app");
  if (!app) return;

  let refreshTimer = 0;
  let activeEffect = "cloudy";

  function isPublicStart() {
    return document.body.classList.contains("public-portal-mode") && !app.hidden;
  }

  function formatNumber(value, digits = 0) {
    const number = Number(value);
    if (!Number.isFinite(number)) return "–";
    return new Intl.NumberFormat("nl-NL", {
      minimumFractionDigits: digits,
      maximumFractionDigits: digits
    }).format(number);
  }

  function weatherCodeInfo(code) {
    const value = Number(code);
    if (value === 0) return { label: "Onbewolkt", icon: "☀️" };
    if (value === 1) return { label: "Overwegend zonnig", icon: "🌤️" };
    if (value === 2) return { label: "Half bewolkt", icon: "⛅" };
    if (value === 3) return { label: "Bewolkt", icon: "☁️" };
    if (value === 45 || value === 48) return { label: "Mist", icon: "🌫️" };
    if ([51,53,55,56,57].includes(value)) return { label: "Motregen", icon: "🌦️" };
    if ([61,63,65,66,67].includes(value)) return { label: "Regen", icon: "🌧️" };
    if ([71,73,75,77,85,86].includes(value)) return { label: "Sneeuw", icon: "🌨️" };
    if ([80,81,82].includes(value)) return { label: "Regenbuien", icon: "🌦️" };
    if ([95,96,99].includes(value)) return { label: "Onweer", icon: "⛈️" };
    return { label: "Wisselend bewolkt", icon: "🌥️" };
  }

  function locationKey(index) {
    return `${STORAGE_PREFIX}${index}`;
  }

  function readLocation(index) {
    try {
      const parsed = JSON.parse(localStorage.getItem(locationKey(index)) || "null");
      if (parsed && parsed.name && Number.isFinite(parsed.latitude) && Number.isFinite(parsed.longitude)) return parsed;
    } catch (_) {}
    return { ...DEFAULTS[index] };
  }

  function saveLocation(index, location) {
    try { localStorage.setItem(locationKey(index), JSON.stringify(location)); } catch (_) {}
  }

  async function geocodePlace(query) {
    const url = new URL("https://geocoding-api.open-meteo.com/v1/search");
    url.searchParams.set("name", query);
    url.searchParams.set("count", "8");
    url.searchParams.set("language", "nl");
    url.searchParams.set("format", "json");
    url.searchParams.set("countryCode", "NL");
    const response = await fetch(url.toString(), { cache: "no-store" });
    if (!response.ok) throw new Error(`Geocoding HTTP ${response.status}`);
    const data = await response.json();
    const result = Array.isArray(data?.results) ? data.results[0] : null;
    if (!result) return null;
    return {
      name: result.admin1 && result.admin1 !== result.name ? `${result.name}, ${result.admin1}` : result.name,
      latitude: Number(result.latitude),
      longitude: Number(result.longitude)
    };
  }

  async function fetchWeather(location) {
    const url = new URL("https://api.open-meteo.com/v1/forecast");
    url.searchParams.set("latitude", String(location.latitude));
    url.searchParams.set("longitude", String(location.longitude));
    url.searchParams.set("current", [
      "temperature_2m",
      "apparent_temperature",
      "relative_humidity_2m",
      "precipitation",
      "weather_code",
      "wind_speed_10m"
    ].join(","));
    url.searchParams.set("timezone", "Europe/Amsterdam");
    url.searchParams.set("forecast_days", "1");
    const response = await fetch(url.toString(), { cache: "no-store" });
    if (!response.ok) throw new Error(`Weather HTTP ${response.status}`);
    return response.json();
  }

  function ensureScene() {
    let scene = document.getElementById(SCENE_ID);
    if (scene) return scene;
    scene = document.createElement("aside");
    scene.id = SCENE_ID;
    scene.className = "start-weather-scene-large roster-only-start";
    scene.setAttribute("aria-hidden", "true");
    scene.innerHTML = `
      <div class="start-weather-scene-sky" data-weather-effect="cloudy">
        <span class="start-weather-scene-icon">☁️</span>
        <strong data-weather-scene-label>Bewolkt</strong>
      </div>`;
    document.body.appendChild(scene);
    return scene;
  }

  function setWeatherEffect(effect) {
    const chosen = WEATHER_EFFECTS[effect] ? effect : "cloudy";
    activeEffect = chosen;
    const scene = ensureScene();
    const sky = scene.querySelector(".start-weather-scene-sky");
    const icon = scene.querySelector(".start-weather-scene-icon");
    const label = scene.querySelector("[data-weather-scene-label]");
    if (sky) sky.dataset.weatherEffect = chosen;
    if (icon) icon.textContent = WEATHER_EFFECTS[chosen].icon;
    if (label) label.textContent = WEATHER_EFFECTS[chosen].label;
    document.querySelectorAll("[data-weather-effect]").forEach((button) => {
      button.classList.toggle("is-active", button.dataset.weatherEffect === chosen);
    });
  }

  function ensureWeatherControl(attempt = 0) {
    let wrap = document.getElementById(CONTROL_ID);
    if (wrap) return wrap;
    const shell = document.getElementById("backgroundBrightnessBar");
    const effects = shell?.querySelector(".brightness-effects-wrap");
    if (!shell || !effects) {
      if (attempt < 80) setTimeout(() => ensureWeatherControl(attempt + 1), 75);
      return null;
    }

    wrap = document.createElement("div");
    wrap.id = CONTROL_ID;
    wrap.className = "weather-effects-wrap";
    wrap.innerHTML = `
      <button id="weatherEffectsButton" class="weather-effects-button" type="button" aria-haspopup="menu" aria-expanded="false" aria-controls="weatherEffectsMenu">
        Weer-effecten <span aria-hidden="true">▾</span>
      </button>
      <div id="weatherEffectsMenu" class="weather-effects-menu" role="menu" hidden>
        ${Object.entries(WEATHER_EFFECTS).map(([id, item]) => `
          <button type="button" class="weather-effects-item" data-weather-effect="${id}" role="menuitem">
            <span aria-hidden="true">${item.icon}</span><span>${item.label}</span>
          </button>`).join("")}
      </div>`;

    const video = document.getElementById("videoLibraryWrap");
    if (video?.parentElement === shell) shell.insertBefore(wrap, video);
    else effects.after(wrap);

    const button = wrap.querySelector("#weatherEffectsButton");
    const menu = wrap.querySelector("#weatherEffectsMenu");
    button?.addEventListener("click", (event) => {
      event.stopPropagation();
      const open = menu.hidden;
      menu.hidden = !open;
      button.setAttribute("aria-expanded", String(open));
    });
    menu?.addEventListener("click", (event) => {
      event.stopPropagation();
      const item = event.target.closest?.("[data-weather-effect]");
      if (!item) return;
      setWeatherEffect(item.dataset.weatherEffect);
      menu.hidden = true;
      button.setAttribute("aria-expanded", "false");
    });
    document.addEventListener("click", (event) => {
      if (wrap && !wrap.contains(event.target)) {
        menu.hidden = true;
        button.setAttribute("aria-expanded", "false");
      }
    });
    setWeatherEffect(activeEffect);
    return wrap;
  }

  function weatherCardMarkup(index, location) {
    return `
      <article class="public-weather-card" data-weather-card="${index}">
        <div class="public-weather-summary">
          <span class="public-weather-icon" data-weather-icon aria-hidden="true">🌤️</span>
          <div class="public-weather-copy">
            <small>Actueel weer</small>
            <div class="public-weather-mainline">
              <strong class="public-weather-temperature" data-weather-temperature>–°</strong>
              <span class="public-weather-condition" data-weather-condition>Laden…</span>
            </div>
            <strong class="public-weather-location" data-weather-location>${location.name}</strong>
          </div>
        </div>
        <div class="public-weather-details">
          <div class="public-weather-detail"><span>Voelt als</span><strong data-weather-feels>–</strong></div>
          <div class="public-weather-detail"><span>Luchtvochtigheid</span><strong data-weather-humidity>–</strong></div>
          <div class="public-weather-detail"><span>Wind</span><strong data-weather-wind>–</strong></div>
          <div class="public-weather-detail"><span>Neerslag</span><strong data-weather-rain>–</strong></div>
        </div>
        <button class="public-weather-edit" type="button" data-weather-edit="${index}" aria-label="Locatie ${location.name} aanpassen" title="Locatie aanpassen">✎</button>
        <div class="public-weather-note" data-weather-note>Weerdata: Open-Meteo</div>
      </article>`;
  }

  function ensureWeatherBars(attempt = 0) {
    let bars = document.getElementById(BARS_ID);
    if (bars) return bars;
    const primary = document.getElementById("publicPrimaryActions");
    if (!primary) {
      if (attempt < 60) setTimeout(() => ensureWeatherBars(attempt + 1), 80);
      return null;
    }
    bars = document.createElement("section");
    bars.id = BARS_ID;
    bars.className = "public-weather-bars roster-only-start";
    bars.setAttribute("aria-label", "Actueel weer");
    bars.innerHTML = DEFAULTS.map((_, index) => weatherCardMarkup(index, readLocation(index))).join("");
    primary.before(bars);

    bars.addEventListener("click", async (event) => {
      const edit = event.target.closest?.("[data-weather-edit]");
      if (!edit) return;
      const index = Number(edit.dataset.weatherEdit);
      const current = readLocation(index);
      const query = window.prompt("Welke Nederlandse plaats wil je voor deze weerbalk gebruiken?", current.name);
      if (!query || !query.trim()) return;
      const card = bars.querySelector(`[data-weather-card="${index}"]`);
      const condition = card?.querySelector("[data-weather-condition]");
      if (condition) condition.textContent = "Plaats zoeken…";
      try {
        const location = await geocodePlace(query.trim());
        if (!location) {
          if (condition) condition.textContent = "Plaats niet gevonden";
          return;
        }
        saveLocation(index, location);
        const name = card?.querySelector("[data-weather-location]");
        if (name) name.textContent = location.name;
        edit.setAttribute("aria-label", `Locatie ${location.name} aanpassen`);
        await loadCard(index);
      } catch (error) {
        console.warn("Plaats kon niet worden aangepast.", error);
        if (condition) condition.textContent = "Plaats niet beschikbaar";
      }
    });
    return bars;
  }

  function updateCard(index, data) {
    const card = document.querySelector(`[data-weather-card="${index}"]`);
    if (!card) return;
    const current = data?.current || {};
    const info = weatherCodeInfo(current.weather_code);
    const set = (selector, value) => {
      const node = card.querySelector(selector);
      if (node) node.textContent = value;
    };
    set("[data-weather-icon]", info.icon);
    set("[data-weather-temperature]", `${formatNumber(current.temperature_2m)}°`);
    set("[data-weather-condition]", info.label);
    set("[data-weather-location]", readLocation(index).name);
    set("[data-weather-feels]", `${formatNumber(current.apparent_temperature)} °C`);
    set("[data-weather-humidity]", `${formatNumber(current.relative_humidity_2m)}%`);
    set("[data-weather-wind]", `${formatNumber(current.wind_speed_10m)} km/u`);
    set("[data-weather-rain]", `${formatNumber(current.precipitation, 1)} mm`);
    const note = card.querySelector("[data-weather-note]");
    if (note) note.textContent = `Bijgewerkt ${new Date().toLocaleTimeString("nl-NL", { hour: "2-digit", minute: "2-digit" })} · Open-Meteo`;
  }

  async function loadCard(index) {
    if (!isPublicStart()) return;
    const card = document.querySelector(`[data-weather-card="${index}"]`);
    const condition = card?.querySelector("[data-weather-condition]");
    if (condition) condition.textContent = "Laden…";
    try {
      const data = await fetchWeather(readLocation(index));
      updateCard(index, data);
    } catch (error) {
      console.warn("Weer kon niet worden geladen.", error);
      if (condition) condition.textContent = "Weer niet beschikbaar";
    }
  }

  function start() {
    if (!isPublicStart()) return;
    ensureScene();
    ensureWeatherControl();
    if (!ensureWeatherBars()) return;
    loadCard(0);
    loadCard(1);
    clearInterval(refreshTimer);
    refreshTimer = setInterval(() => {
      if (!isPublicStart()) return;
      loadCard(0);
      loadCard(1);
    }, REFRESH_MS);
  }

  window.addEventListener("rooster-unlocked", (event) => {
    if (event?.detail?.publicPortal) requestAnimationFrame(start);
  });
  if (isPublicStart()) start();

  window.RoosterStartWeather = Object.freeze({
    refresh: () => { loadCard(0); loadCard(1); },
    setEffect: setWeatherEffect,
    effects: () => Object.entries(WEATHER_EFFECTS).map(([id, item]) => ({ id, label: item.label }))
  });
})();
