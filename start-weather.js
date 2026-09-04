(() => {
  "use strict";

  const REFRESH_MS = 10 * 60 * 1000;
  const STORAGE_PREFIX = "roosteroverzicht.weather.location.v2.";
  const SCENE_ID = "startWeatherScene";
  const CONTROL_ID = "weatherEffectsWrap";
  const BARS_ID = "publicWeatherBars";
  const WEATHER_CONFIG_FILE = "Weer.json";
  const TIME_ZONE = "Europe/Amsterdam";

  const DEFAULTS = Object.freeze([
    Object.freeze({ name: "Rotterdam", latitude: 51.9225, longitude: 4.47917 }),
    Object.freeze({ name: "Apeldoorn", latitude: 52.21, longitude: 5.96944 })
  ]);

  const FALLBACK_ASSETS = Object.freeze([
    { id: "heldere-zon", naam: "Heldere zon", bestand: "01_heldere_zon.png", automatisch: true },
    { id: "half-bewolkt", naam: "Half bewolkt", bestand: "02_half_bewolkt.png", automatisch: true },
    { id: "zwaar-bewolkt", naam: "Zwaar bewolkt", bestand: "03_zwaar_bewolkt.png", automatisch: true },
    { id: "betrokken", naam: "Betrokken", bestand: "04_betrokken.png", automatisch: true },
    { id: "motregen", naam: "Motregen", bestand: "05_motregen.png", automatisch: true },
    { id: "lichte-regen", naam: "Lichte regen", bestand: "06_lichte_regen.png", automatisch: true },
    { id: "zware-regen", naam: "Zware regen", bestand: "07_zware_regen.png", automatisch: true },
    { id: "plaatselijke-regenbui", naam: "Plaatselijke regenbui", bestand: "08_plaatselijke_regenbui.png", automatisch: true },
    { id: "onweer", naam: "Onweer", bestand: "09_onweer.png", automatisch: true },
    { id: "hagelbui", naam: "Hagelbui", bestand: "10_hagelbui.png", automatisch: true },
    { id: "lichte-sneeuw", naam: "Lichte sneeuw", bestand: "11_lichte_sneeuw.png", automatisch: true },
    { id: "zware-sneeuw", naam: "Zware sneeuw", bestand: "12_zware_sneeuw.png", automatisch: true },
    { id: "sneeuwstorm", naam: "Sneeuwstorm", bestand: "13_sneeuwstorm.png", automatisch: true },
    { id: "natte-sneeuw", naam: "Natte sneeuw", bestand: "14_natte_sneeuw.png", automatisch: true },
    { id: "ijzel", naam: "IJzel", bestand: "15_ijzel.png", automatisch: true },
    { id: "dichte-mist", naam: "Dichte mist", bestand: "16_dichte_mist.png", automatisch: true },
    { id: "nevel", naam: "Nevel", bestand: "17_nevel.png", automatisch: true },
    { id: "harde-wind", naam: "Harde wind", bestand: "18_harde_wind.png", automatisch: true },
    { id: "geen-1", naam: "Geen 1", bestand: "Geen 1.png", automatisch: false },
    { id: "geen-2", naam: "Geen 2", bestand: "Geen 2.png", automatisch: false },
    { id: "geen-3", naam: "Geen 3", bestand: "Geen 3.png", automatisch: false },
    { id: "geen-4", naam: "Geen 4", bestand: "Geen 4.png", automatisch: false },
    { id: "regenboog-na-regen", naam: "Regenboog na regen", bestand: "23_regenboog_na_regen.png", automatisch: true },
    { id: "hittegolf", naam: "Hittegolf", bestand: "24_hittegolf.png", automatisch: true },
    { id: "strenge-vorst", naam: "Strenge vorst", bestand: "25_strenge_vorst.png", automatisch: true }
  ]);

  const app = document.getElementById("app");
  if (!app) return;

  let refreshTimer = 0;
  let clockTimer = 0;
  let weatherConfigPromise = null;
  let weatherAssets = [];
  let weatherById = new Map();
  let activeEffect = "zwaar-bewolkt";
  let manualTarget = 0;
  const manualEffects = [null, null];
  const liveWeather = [null, null];

  function isPublicStart() {
    return document.body.classList.contains("public-portal-mode") && !app.hidden;
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function assetUrl(asset) {
    return encodeURI(String(asset?.bestand || ""));
  }

  function normalizeAssets(items) {
    return (Array.isArray(items) ? items : [])
      .map((item) => ({
        id: String(item?.id || "").trim(),
        naam: String(item?.naam || "").trim(),
        bestand: String(item?.bestand || "").trim(),
        automatisch: item?.automatisch !== false,
        origineel: String(item?.origineel || "").trim()
      }))
      .filter((item) => item.id && item.naam && item.bestand);
  }

  async function loadWeatherConfig(force = false) {
    if (weatherConfigPromise && !force) return weatherConfigPromise;
    weatherConfigPromise = (async () => {
      let items = [];
      try {
        const response = await fetch(`${WEATHER_CONFIG_FILE}?v=${Date.now()}`, { cache: "no-store" });
        if (!response.ok) throw new Error(`Weer.json HTTP ${response.status}`);
        const data = await response.json();
        items = normalizeAssets(data?.afbeeldingen);
      } catch (error) {
        console.warn("Weer.json kon niet worden geladen; lokale fallback wordt gebruikt.", error);
      }

      weatherAssets = items.length ? items : normalizeAssets(FALLBACK_ASSETS);
      weatherById = new Map(weatherAssets.map((item) => [item.id, item]));
      if (!weatherById.has(activeEffect)) activeEffect = weatherAssets[0]?.id || "zwaar-bewolkt";
      return weatherAssets;
    })();
    return weatherConfigPromise;
  }

  function assetById(id) {
    return weatherById.get(String(id || "")) || weatherAssets[0] || FALLBACK_ASSETS[0];
  }

  function formatNumber(value, digits = 0) {
    const number = Number(value);
    if (!Number.isFinite(number)) return "–";
    return new Intl.NumberFormat("nl-NL", {
      minimumFractionDigits: digits,
      maximumFractionDigits: digits
    }).format(number);
  }

  function amsterdamClockParts() {
    const now = new Date();
    const parts = new Intl.DateTimeFormat("nl-NL", {
      timeZone: TIME_ZONE,
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23"
    }).formatToParts(now);
    const read = (type) => parts.find((part) => part.type === type)?.value || "00";

    let zone = "CET";
    try {
      const offsetParts = new Intl.DateTimeFormat("en-GB", {
        timeZone: TIME_ZONE,
        timeZoneName: "shortOffset"
      }).formatToParts(now);
      const offset = offsetParts.find((part) => part.type === "timeZoneName")?.value || "";
      if (/GMT\+2(?:\D|$)/.test(offset)) zone = "CEST";
    } catch (_) {}

    return { time: `${read("hour")}:${read("minute")}:${read("second")}`, zone };
  }

  function updateWeatherClock() {
    const { time, zone } = amsterdamClockParts();
    document.querySelectorAll("[data-weather-live-clock]").forEach((node) => {
      node.textContent = `${time} ${zone}`;
    });
  }

  function startClock() {
    updateWeatherClock();
    clearInterval(clockTimer);
    clockTimer = window.setInterval(updateWeatherClock, 1000);
  }

  function chooseWeatherEffect(current = {}) {
    const code = Number(current.weather_code);
    const temperature = Number(current.temperature_2m);
    const wind = Number(current.wind_speed_10m);
    const precipitation = Number(current.precipitation);
    const cloudCover = Number(current.cloud_cover);
    const visibility = Number(current.visibility);

    if (code === 96 || code === 99) return "hagelbui";
    if (code === 95) return "onweer";

    if ([71, 73, 75, 77, 85, 86].includes(code)) {
      if (Number.isFinite(wind) && wind >= 50) return "sneeuwstorm";
      if (Number.isFinite(temperature) && temperature > -0.5 && temperature <= 2) return "natte-sneeuw";
      if (code === 75 || code === 86) return "zware-sneeuw";
      return "lichte-sneeuw";
    }

    if ([56, 57, 66, 67].includes(code)) return "ijzel";
    if ([51, 53, 55].includes(code)) return "motregen";
    if (code === 65) return "zware-regen";
    if (code === 61 || code === 63) return "lichte-regen";

    if ([80, 81, 82].includes(code)) {
      if (Number.isFinite(cloudCover) && cloudCover <= 60 && Number.isFinite(precipitation) && precipitation > 0) {
        return "regenboog-na-regen";
      }
      return "plaatselijke-regenbui";
    }

    if (code === 45 || code === 48) {
      if (Number.isFinite(visibility) && visibility <= 1000) return "dichte-mist";
      return "nevel";
    }

    if (Number.isFinite(temperature) && temperature >= 30) return "hittegolf";
    if (Number.isFinite(temperature) && temperature <= -10) return "strenge-vorst";
    if (Number.isFinite(wind) && wind >= 50) return "harde-wind";

    if (code === 0) return "heldere-zon";
    if (code === 1) return Number.isFinite(cloudCover) && cloudCover > 20 ? "half-bewolkt" : "heldere-zon";
    if (code === 2) return "half-bewolkt";
    if (code === 3) return Number.isFinite(cloudCover) && cloudCover >= 95 ? "betrokken" : "zwaar-bewolkt";

    if (Number.isFinite(cloudCover)) {
      if (cloudCover < 20) return "heldere-zon";
      if (cloudCover < 70) return "half-bewolkt";
      if (cloudCover < 95) return "zwaar-bewolkt";
      return "betrokken";
    }
    return "zwaar-bewolkt";
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
      "wind_speed_10m",
      "cloud_cover",
      "visibility"
    ].join(","));
    url.searchParams.set("timezone", TIME_ZONE);
    url.searchParams.set("forecast_days", "1");
    const response = await fetch(url.toString(), { cache: "no-store" });
    if (!response.ok) throw new Error(`Weather HTTP ${response.status}`);
    return response.json();
  }

  function scenePanelMarkup(effectId) {
    const asset = assetById(effectId);
    return `
      <div class="start-weather-scene-sky" data-weather-effect="${escapeHtml(asset.id)}">
        <img class="start-weather-scene-image" src="${escapeHtml(assetUrl(asset))}" alt="" aria-hidden="true">
      </div>`;
  }

  function sceneInfoMarkup(split) {
    if (!split) {
      return `
        <div class="start-weather-scene-info is-single">
          <span></span>
          <strong class="start-weather-live-clock" data-weather-live-clock>00:00:00 CEST</strong>
          <span></span>
        </div>`;
    }

    return `
      <div class="start-weather-scene-info is-split">
        <strong class="start-weather-scene-location is-left">${escapeHtml(readLocation(0).name)}</strong>
        <strong class="start-weather-live-clock" data-weather-live-clock>00:00:00 CEST</strong>
        <strong class="start-weather-scene-location is-right">${escapeHtml(readLocation(1).name)}</strong>
      </div>`;
  }

  function ensureScene() {
    let scene = document.getElementById(SCENE_ID);
    if (scene) return scene;
    scene = document.createElement("aside");
    scene.id = SCENE_ID;
    scene.className = "start-weather-scene-large roster-only-start";
    scene.setAttribute("aria-hidden", "true");
    scene.innerHTML = `${scenePanelMarkup(activeEffect)}${sceneInfoMarkup(false)}`;
    document.body.appendChild(scene);
    updateWeatherClock();
    return scene;
  }

  function effectiveEffect(index) {
    return manualEffects[index] || liveWeather[index]?.effect || activeEffect;
  }

  function markActiveWeatherButton() {
    document.querySelectorAll("[data-weather-effect]").forEach((button) => {
      const selected = manualEffects[manualTarget];
      button.classList.toggle("is-active", !!selected && button.dataset.weatherEffect === selected);
    });
    document.querySelectorAll("[data-weather-target]").forEach((button) => {
      button.classList.toggle("is-active", Number(button.dataset.weatherTarget) === manualTarget);
      button.setAttribute("aria-pressed", String(Number(button.dataset.weatherTarget) === manualTarget));
    });
  }

  function renderLiveWeatherScene() {
    if (!liveWeather[0] || !liveWeather[1]) return;
    const scene = ensureScene();
    const firstEffect = effectiveEffect(0);
    const secondEffect = effectiveEffect(1);
    const sameEffect = firstEffect === secondEffect;

    scene.dataset.weatherMode = sameEffect ? "single" : "split";
    if (sameEffect) {
      scene.innerHTML = `${scenePanelMarkup(firstEffect)}${sceneInfoMarkup(false)}`;
      activeEffect = firstEffect;
    } else {
      scene.innerHTML = `
        <div class="start-weather-scene-split">
          ${scenePanelMarkup(firstEffect)}
          ${scenePanelMarkup(secondEffect)}
        </div>
        ${sceneInfoMarkup(true)}`;
    }
    markActiveWeatherButton();
    updateWeatherClock();
  }

  async function setWeatherEffect(effectId, targetIndex = manualTarget) {
    await loadWeatherConfig();
    const target = Number(targetIndex) === 1 ? 1 : 0;
    const asset = assetById(effectId);
    manualTarget = target;
    manualEffects[target] = asset.id;
    renderLiveWeatherScene();
  }

  function restoreAutomaticEffect(targetIndex = manualTarget) {
    const target = Number(targetIndex) === 1 ? 1 : 0;
    manualEffects[target] = null;
    renderLiveWeatherScene();
  }

  function weatherMenuItemsMarkup() {
    return weatherAssets.map((item) => `
      <button type="button" class="weather-effects-item" data-weather-effect="${escapeHtml(item.id)}" role="menuitem">
        <img class="weather-effects-thumb" src="${escapeHtml(assetUrl(item))}" alt="" aria-hidden="true">
        <span>${escapeHtml(item.naam)}</span>
      </button>`).join("");
  }

  async function ensureWeatherControl(attempt = 0) {
    await loadWeatherConfig();
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
        <div class="weather-effects-targets" role="group" aria-label="Kies locatie voor handmatig weer-effect">
          <button type="button" class="weather-effects-target" data-weather-target="0" aria-pressed="true">Locatie 1</button>
          <button type="button" class="weather-effects-target" data-weather-target="1" aria-pressed="false">Locatie 2</button>
        </div>
        <button type="button" class="weather-effects-auto" data-weather-auto="true">↺ Actueel weer herstellen</button>
        <div class="weather-effects-list">
          ${weatherMenuItemsMarkup()}
        </div>
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
      markActiveWeatherButton();
    });

    menu?.addEventListener("click", async (event) => {
      event.stopPropagation();

      const targetButton = event.target.closest?.("[data-weather-target]");
      if (targetButton) {
        manualTarget = Number(targetButton.dataset.weatherTarget) === 1 ? 1 : 0;
        markActiveWeatherButton();
        return;
      }

      if (event.target.closest?.("[data-weather-auto]")) {
        restoreAutomaticEffect(manualTarget);
        markActiveWeatherButton();
        return;
      }

      const item = event.target.closest?.("[data-weather-effect]");
      if (!item) return;
      await setWeatherEffect(item.dataset.weatherEffect, manualTarget);
      markActiveWeatherButton();
    });

    document.addEventListener("click", (event) => {
      if (wrap && !wrap.contains(event.target)) {
        menu.hidden = true;
        button.setAttribute("aria-expanded", "false");
      }
    });
    markActiveWeatherButton();
    return wrap;
  }

  function weatherCardMarkup(index, location) {
    return `
      <article class="public-weather-card" data-weather-card="${index}">
        <div class="public-weather-summary">
          <span class="public-weather-icon" data-weather-icon aria-hidden="true"></span>
          <div class="public-weather-copy">
            <small>Actueel weer</small>
            <div class="public-weather-mainline">
              <strong class="public-weather-temperature" data-weather-temperature>–°</strong>
              <span class="public-weather-condition" data-weather-condition>Laden…</span>
            </div>
            <strong class="public-weather-location" data-weather-location>${escapeHtml(location.name)}</strong>
          </div>
        </div>
        <div class="public-weather-details">
          <div class="public-weather-detail"><span>Voelt als</span><strong data-weather-feels>–</strong></div>
          <div class="public-weather-detail"><span>Luchtvochtigheid</span><strong data-weather-humidity>–</strong></div>
          <div class="public-weather-detail"><span>Wind</span><strong data-weather-wind>–</strong></div>
          <div class="public-weather-detail"><span>Neerslag</span><strong data-weather-rain>–</strong></div>
        </div>
        <button class="public-weather-edit" type="button" data-weather-edit="${index}" aria-label="Locatie ${escapeHtml(location.name)} aanpassen" title="Locatie aanpassen">✎</button>
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
        liveWeather[index] = null;
        manualEffects[index] = null;
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
    const effect = chooseWeatherEffect(current);
    const asset = assetById(effect);
    const set = (selector, value) => {
      const node = card.querySelector(selector);
      if (node) node.textContent = value;
    };

    const icon = card.querySelector("[data-weather-icon]");
    if (icon) icon.innerHTML = `<img src="${escapeHtml(assetUrl(asset))}" alt="" aria-hidden="true">`;
    set("[data-weather-temperature]", `${formatNumber(current.temperature_2m)}°`);
    set("[data-weather-condition]", asset.naam);
    set("[data-weather-location]", readLocation(index).name);
    set("[data-weather-feels]", `${formatNumber(current.apparent_temperature)} °C`);
    set("[data-weather-humidity]", `${formatNumber(current.relative_humidity_2m)}%`);
    set("[data-weather-wind]", `${formatNumber(current.wind_speed_10m)} km/u`);
    set("[data-weather-rain]", `${formatNumber(current.precipitation, 1)} mm`);
    const note = card.querySelector("[data-weather-note]");
    if (note) note.textContent = `Bijgewerkt ${new Date().toLocaleTimeString("nl-NL", { hour: "2-digit", minute: "2-digit", timeZone: TIME_ZONE })} · Open-Meteo`;

    liveWeather[index] = { effect: asset.id };
    renderLiveWeatherScene();
  }

  async function loadCard(index) {
    if (!isPublicStart()) return;
    await loadWeatherConfig();
    const card = document.querySelector(`[data-weather-card="${index}"]`);
    const condition = card?.querySelector("[data-weather-condition]");
    if (condition) condition.textContent = "Laden…";
    try {
      const data = await fetchWeather(readLocation(index));
      updateCard(index, data);
    } catch (error) {
      console.warn("Weer kon niet worden geladen.", error);
      liveWeather[index] = null;
      if (condition) condition.textContent = "Weer niet beschikbaar";
    }
  }

  function refreshAll() {
    loadCard(0);
    loadCard(1);
  }

  async function start() {
    if (!isPublicStart()) return;
    await loadWeatherConfig();
    ensureScene();
    startClock();
    await ensureWeatherControl();
    if (!ensureWeatherBars()) return;
    refreshAll();
    clearInterval(refreshTimer);
    refreshTimer = setInterval(() => {
      if (!isPublicStart()) return;
      refreshAll();
    }, REFRESH_MS);
  }

  window.addEventListener("rooster-unlocked", (event) => {
    if (event?.detail?.publicPortal) requestAnimationFrame(() => start());
  });
  if (isPublicStart()) start();

  window.RoosterStartWeather = Object.freeze({
    refresh: refreshAll,
    setEffect: setWeatherEffect,
    setTarget(index) {
      manualTarget = Number(index) === 1 ? 1 : 0;
      markActiveWeatherButton();
    },
    restoreAutomatic: restoreAutomaticEffect,
    syncLive: renderLiveWeatherScene,
    reloadConfig: () => loadWeatherConfig(true),
    effects: () => weatherAssets.map((item) => ({ id: item.id, label: item.naam, automatisch: item.automatisch }))
  });
})();