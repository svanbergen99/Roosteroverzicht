(() => {
  "use strict";

  const FALLBACK = Object.freeze({ latitude: 52.101, longitude: 5.178, label: "Nederland (De Bilt)" });
  let loading = false;

  function weatherCodeInfo(code) {
    const value = Number(code);
    if (value === 0) return { label: "Onbewolkt", icon: "☀️", effect: "sun" };
    if (value === 1) return { label: "Overwegend zonnig", icon: "🌤️", effect: "sun" };
    if (value === 2) return { label: "Half bewolkt", icon: "⛅", effect: "cloudy" };
    if (value === 3) return { label: "Bewolkt", icon: "☁️", effect: "cloudy" };
    if (value === 45 || value === 48) return { label: "Mist", icon: "🌫️", effect: "fog" };
    if ([51,53,55,56,57,61,63,65,66,67,80,81,82].includes(value)) return { label: "Regen", icon: "🌧️", effect: "rain" };
    if ([71,73,75,77,85,86].includes(value)) return { label: "Sneeuw", icon: "🌨️", effect: "snow" };
    if ([95,96,99].includes(value)) return { label: "Onweer", icon: "⛈️", effect: "thunder" };
    return { label: "Wisselend bewolkt", icon: "🌥️", effect: "cloudy" };
  }

  function format(value, digits = 0) {
    const number = Number(value);
    if (!Number.isFinite(number)) return "–";
    return new Intl.NumberFormat("nl-NL", { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(number);
  }

  function setScene(effect) {
    const scene = document.querySelector("#startWeatherEffects .start-weather-scene");
    const icon = document.querySelector("#startWeatherEffects .start-weather-scene-icon");
    const label = document.querySelector("#startWeatherEffects [data-weather-scene-label]");
    const map = {
      sun: ["☀️", "Zon"], rain: ["🌧️", "Regen"], fog: ["🌫️", "Mist"], cloudy: ["☁️", "Bewolkt"],
      snow: ["🌨️", "Sneeuw"], thunder: ["⛈️", "Onweer"], wind: ["💨", "Wind"], rainbow: ["🌈", "Regenboog"]
    };
    const chosen = map[effect] ? effect : "cloudy";
    if (scene) scene.dataset.weatherEffect = chosen;
    if (icon) icon.textContent = map[chosen][0];
    if (label) label.textContent = map[chosen][1];
  }

  async function loadFallback() {
    if (loading || !document.body.classList.contains("public-portal-mode")) return;
    const bar = document.getElementById("publicWeatherBar");
    if (!bar) return;
    loading = true;

    try {
      const url = new URL("https://api.open-meteo.com/v1/forecast");
      url.searchParams.set("latitude", String(FALLBACK.latitude));
      url.searchParams.set("longitude", String(FALLBACK.longitude));
      url.searchParams.set("current", "temperature_2m,apparent_temperature,relative_humidity_2m,precipitation,weather_code,wind_speed_10m");
      url.searchParams.set("timezone", "Europe/Amsterdam");
      url.searchParams.set("forecast_days", "1");

      const response = await fetch(url.toString(), { cache: "no-store" });
      if (!response.ok) throw new Error(`Weather HTTP ${response.status}`);
      const data = await response.json();
      const current = data?.current || {};
      const info = weatherCodeInfo(current.weather_code);
      const wind = Number(current.wind_speed_10m);
      const effect = ![95,96,99].includes(Number(current.weather_code)) && Number.isFinite(wind) && wind >= 50 ? "wind" : info.effect;

      const set = (selector, value) => {
        const node = bar.querySelector(selector);
        if (node) node.textContent = value;
      };
      set("[data-weather-icon]", info.icon);
      set("[data-weather-temperature]", `${format(current.temperature_2m)}°`);
      set("[data-weather-condition]", info.label);
      set("[data-weather-location]", FALLBACK.label);
      set("[data-weather-feels]", `${format(current.apparent_temperature)} °C`);
      set("[data-weather-humidity]", `${format(current.relative_humidity_2m)}%`);
      set("[data-weather-wind]", `${format(current.wind_speed_10m)} km/u`);
      set("[data-weather-rain]", `${format(current.precipitation, 1)} mm`);

      const note = bar.querySelector("[data-weather-note]");
      if (note) note.textContent = "Locatie niet beschikbaar; daarom wordt automatisch het weer voor Nederland (De Bilt) getoond.";
      setScene(effect);
    } catch (error) {
      console.warn("Nederlandse weerfallback kon niet worden geladen.", error);
    } finally {
      loading = false;
    }
  }

  function checkForFallback() {
    const condition = document.querySelector("#publicWeatherBar [data-weather-condition]");
    const location = document.querySelector("#publicWeatherBar [data-weather-location]");
    if (!condition) return;
    const text = `${condition.textContent || ""} ${location?.textContent || ""}`.toLocaleLowerCase("nl-NL");
    if (/weer niet beschikbaar|geweigerd|locatie kon niet|ondersteunt geen locatie|duurde te lang/.test(text)) loadFallback();
  }

  const observer = new MutationObserver(checkForFallback);
  observer.observe(document.documentElement, { childList: true, subtree: true, characterData: true });
  window.addEventListener("rooster-unlocked", (event) => {
    if (event?.detail?.publicPortal) window.setTimeout(checkForFallback, 250);
  });
})();
