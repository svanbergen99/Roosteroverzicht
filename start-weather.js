(() => {
  "use strict";

  const BAR_ID = "publicWeatherBar";
  const EFFECTS_ID = "startWeatherEffects";
  const REFRESH_MS = 10 * 60 * 1000;

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

  let coords = null;
  let refreshTimer = 0;
  let weatherLoading = false;
  let manualEffect = false;

  const body = document.body;
  const app = document.getElementById("app");
  if (!body || !app) return;

  function isPublicStart() {
    return body.classList.contains("public-portal-mode") && !app.hidden;
  }

  function weatherCodeInfo(code) {
    const value = Number(code);
    if (value === 0) return { label: "Onbewolkt", icon: "☀️", effect: "sun" };
    if (value === 1) return { label: "Overwegend zonnig", icon: "🌤️", effect: "sun" };
    if (value === 2) return { label: "Half bewolkt", icon: "⛅", effect: "cloudy" };
    if (value === 3) return { label: "Bewolkt", icon: "☁️", effect: "cloudy" };
    if (value === 45 || value === 48) return { label: "Mist", icon: "🌫️", effect: "fog" };
    if ([51, 53, 55, 56, 57].includes(value)) return { label: "Motregen", icon: "🌦️", effect: "rain" };
    if ([61, 63, 65, 66, 67].includes(value)) return { label: "Regen", icon: "🌧️", effect: "rain" };
    if ([71, 73, 75, 77, 85, 86].includes(value)) return { label: "Sneeuw", icon: "🌨️", effect: "snow" };
    if ([80, 81, 82].includes(value)) return { label: "Regenbuien", icon: "🌦️", effect: "rain" };
    if ([95, 96, 99].includes(value)) return { label: "Onweer", icon: "⛈️", effect: "thunder" };
    return { label: "Wisselend bewolkt", icon: "🌥️", effect: "cloudy" };
  }

  function formatNumber(value, digits = 0) {
    const number = Number(value);
    if (!Number.isFinite(number)) return "–";
    return new Intl.NumberFormat("nl-NL", {
      minimumFractionDigits: digits,
      maximumFractionDigits: digits
    }).format(number);
  }

  function setWeatherEffect(effect, options = {}) {
    const chosen = WEATHER_EFFECTS[effect] ? effect : "cloudy";
    const box = document.getElementById(EFFECTS_ID);
    if (!box) return;

    const scene = box.querySelector(".start-weather-scene");
    const icon = box.querySelector(".start-weather-scene-icon");
    const label = box.querySelector("[data-weather-scene-label]");
    const select = box.querySelector("[data-weather-effect-select]");

    if (scene) scene.dataset.weatherEffect = chosen;
    if (icon) icon.textContent = WEATHER_EFFECTS[chosen].icon;
    if (label) label.textContent = WEATHER_EFFECTS[chosen].label;
    if (select && select.value !== chosen) select.value = chosen;
    if (options.manual) manualEffect = true;
  }

  function ensureWeatherEffects() {
    let box = document.getElementById(EFFECTS_ID);
    if (box) return box;

    box = document.createElement("aside");
    box.id = EFFECTS_ID;
    box.className = "start-weather-effects roster-only-start";
    box.setAttribute("aria-label", "Weer-effecten op de startpagina");

    const options = Object.entries(WEATHER_EFFECTS)
      .map(([id, item]) => `<option value="${id}">${item.label}</option>`)
      .join("");

    box.innerHTML = `
      <div class="start-weather-scene" data-weather-effect="cloudy" aria-hidden="true">
        <span class="start-weather-scene-icon">☁️</span>
        <strong data-weather-scene-label>Bewolkt</strong>
      </div>
      <div>
        <label for="startWeatherEffectSelect">Weer-effect</label>
        <select id="startWeatherEffectSelect" class="start-weather-effect-select" data-weather-effect-select>
          ${options}
        </select>
      </div>`;

    box.querySelector("[data-weather-effect-select]")?.addEventListener("change", (event) => {
      setWeatherEffect(event.target.value, { manual: true });
    });

    return box;
  }

  function ensureWeatherBar() {
    let bar = document.getElementById(BAR_ID);
    if (bar) return bar;

    bar = document.createElement("section");
    bar.id = BAR_ID;
    bar.className = "public-weather-bar roster-only-start";
    bar.setAttribute("aria-label", "Actueel weer op jouw locatie");
    bar.innerHTML = `
      <div class="public-weather-card">
        <div class="public-weather-summary">
          <span class="public-weather-icon" data-weather-icon aria-hidden="true">📍</span>
          <div class="public-weather-copy">
            <small>Actueel weer</small>
            <div class="public-weather-mainline">
              <strong class="public-weather-temperature" data-weather-temperature>–°</strong>
              <span class="public-weather-condition" data-weather-condition>Locatie ophalen…</span>
            </div>
            <span class="public-weather-location" data-weather-location>Jouw locatie</span>
          </div>
        </div>

        <div class="public-weather-details">
          <div class="public-weather-detail"><span>Voelt als</span><strong data-weather-feels>–</strong></div>
          <div class="public-weather-detail"><span>Luchtvochtigheid</span><strong data-weather-humidity>–</strong></div>
          <div class="public-weather-detail"><span>Wind</span><strong data-weather-wind>–</strong></div>
          <div class="public-weather-detail"><span>Neerslag</span><strong data-weather-rain>–</strong></div>
        </div>

        <button class="public-weather-refresh" type="button" data-weather-refresh aria-label="Weer en locatie vernieuwen" title="Weer en locatie vernieuwen">↻</button>
        <div class="public-weather-note" data-weather-note>
          Na toestemming gebruikt de startpagina de locatie van dit apparaat. Weerdata: <a href="https://open-meteo.com/" target="_blank" rel="noopener noreferrer">Open-Meteo</a>.
        </div>
      </div>`;

    bar.querySelector("[data-weather-refresh]")?.addEventListener("click", () => locateAndLoad(true));
    return bar;
  }

  function mountStartWeather(attempt = 0) {
    if (!isPublicStart()) return false;
    const primary = document.getElementById("publicPrimaryActions");
    if (!primary) {
      if (attempt < 50) window.setTimeout(() => mountStartWeather(attempt + 1), 80);
      return false;
    }

    const effects = ensureWeatherEffects();
    const bar = ensureWeatherBar();
    if (effects.parentElement !== primary.parentElement || effects.nextElementSibling !== bar) {
      primary.before(effects, bar);
    }
    return true;
  }

  function updateWeatherUi(data) {
    const bar = document.getElementById(BAR_ID);
    if (!bar) return;
    const current = data?.current || {};
    const info = weatherCodeInfo(current.weather_code);

    const wind = Number(current.wind_speed_10m);
    let effect = info.effect;
    if (![95, 96, 99].includes(Number(current.weather_code)) && Number.isFinite(wind) && wind >= 50) effect = "wind";

    const set = (selector, value) => {
      const element = bar.querySelector(selector);
      if (element) element.textContent = value;
    };

    set("[data-weather-icon]", info.icon);
    set("[data-weather-temperature]", `${formatNumber(current.temperature_2m)}°`);
    set("[data-weather-condition]", info.label);
    set("[data-weather-location]", "Jouw huidige locatie");
    set("[data-weather-feels]", `${formatNumber(current.apparent_temperature)} °C`);
    set("[data-weather-humidity]", `${formatNumber(current.relative_humidity_2m)}%`);
    set("[data-weather-wind]", `${formatNumber(current.wind_speed_10m)} km/u`);
    set("[data-weather-rain]", `${formatNumber(current.precipitation, 1)} mm`);

    const note = bar.querySelector("[data-weather-note]");
    if (note) {
      const time = new Date().toLocaleTimeString("nl-NL", { hour: "2-digit", minute: "2-digit" });
      note.innerHTML = `Bijgewerkt om ${time} voor de locatie van dit apparaat. Weerdata: <a href="https://open-meteo.com/" target="_blank" rel="noopener noreferrer">Open-Meteo</a>.`;
    }

    if (!manualEffect) setWeatherEffect(effect);
  }

  function showWeatherError(message) {
    const bar = document.getElementById(BAR_ID);
    if (!bar) return;
    const condition = bar.querySelector("[data-weather-condition]");
    const location = bar.querySelector("[data-weather-location]");
    const note = bar.querySelector("[data-weather-note]");
    if (condition) condition.textContent = "Weer niet beschikbaar";
    if (location) location.textContent = message;
    if (note) note.textContent = "Klik op ↻ nadat je locatietoegang in de browser hebt toegestaan.";
  }

  async function fetchWeather(latitude, longitude) {
    const url = new URL("https://api.open-meteo.com/v1/forecast");
    url.searchParams.set("latitude", String(latitude));
    url.searchParams.set("longitude", String(longitude));
    url.searchParams.set("current", [
      "temperature_2m",
      "apparent_temperature",
      "relative_humidity_2m",
      "precipitation",
      "weather_code",
      "cloud_cover",
      "wind_speed_10m"
    ].join(","));
    url.searchParams.set("timezone", "auto");
    url.searchParams.set("forecast_days", "1");

    const response = await fetch(url.toString(), { cache: "no-store" });
    if (!response.ok) throw new Error(`Weather HTTP ${response.status}`);
    return response.json();
  }

  async function loadWeatherAtCurrentCoords() {
    if (!coords || weatherLoading || !isPublicStart()) return;
    weatherLoading = true;
    try {
      const data = await fetchWeather(coords.latitude, coords.longitude);
      updateWeatherUi(data);
    } catch (error) {
      console.warn("Actueel weer kon niet worden geladen.", error);
      showWeatherError("Weerservice tijdelijk niet bereikbaar.");
    } finally {
      weatherLoading = false;
    }
  }

  function locateAndLoad(forceLocation = false) {
    if (!mountStartWeather() || !isPublicStart()) return;

    if (!forceLocation && coords) {
      loadWeatherAtCurrentCoords();
      return;
    }

    if (!("geolocation" in navigator)) {
      showWeatherError("Deze browser ondersteunt geen locatiebepaling.");
      return;
    }

    const condition = document.querySelector(`#${BAR_ID} [data-weather-condition]`);
    if (condition) condition.textContent = "Locatie ophalen…";

    navigator.geolocation.getCurrentPosition(
      (position) => {
        coords = {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude
        };
        loadWeatherAtCurrentCoords();
      },
      (error) => {
        const message = error?.code === 1
          ? "Locatietoegang is geweigerd."
          : error?.code === 3
            ? "Locatiebepaling duurde te lang."
            : "Locatie kon niet worden bepaald.";
        showWeatherError(message);
      },
      { enableHighAccuracy: false, timeout: 12000, maximumAge: 10 * 60 * 1000 }
    );
  }

  function startPublicWeather() {
    if (!mountStartWeather()) return;
    locateAndLoad(false);
    window.clearInterval(refreshTimer);
    refreshTimer = window.setInterval(() => {
      if (isPublicStart() && coords) loadWeatherAtCurrentCoords();
    }, REFRESH_MS);
  }

  window.addEventListener("rooster-unlocked", (event) => {
    if (!event?.detail?.publicPortal) return;
    requestAnimationFrame(startPublicWeather);
  });

  if (isPublicStart()) startPublicWeather();

  window.RoosterStartWeather = Object.freeze({
    refresh: () => locateAndLoad(true),
    setEffect: (effect) => setWeatherEffect(effect, { manual: true }),
    resetAutomaticEffect() {
      manualEffect = false;
      if (coords) loadWeatherAtCurrentCoords();
    },
    effects: () => Object.entries(WEATHER_EFFECTS).map(([id, item]) => ({ id, label: item.label }))
  });
})();
