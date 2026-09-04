(() => {
  "use strict";

  const TIME_ZONE = "Europe/Amsterdam";
  const WEATHER_SELECTOR = "[data-weather-live-clock], .start-weather-scene-location, .public-weather-location";

  function shortLocationName(value) {
    return String(value || "").split(",")[0].trim();
  }

  function currentClock() {
    const parts = new Intl.DateTimeFormat("nl-NL", {
      timeZone: TIME_ZONE,
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23"
    }).formatToParts(new Date());
    const read = (type) => parts.find((part) => part.type === type)?.value || "00";
    return `${read("hour")}:${read("minute")}:${read("second")}`;
  }

  function cleanWeatherDisplay() {
    const time = currentClock();
    document.querySelectorAll("[data-weather-live-clock]").forEach((node) => {
      if (node.textContent !== time) node.textContent = time;
    });

    document.querySelectorAll(".start-weather-scene-location, .public-weather-location").forEach((node) => {
      const shortName = shortLocationName(node.textContent);
      if (shortName && node.textContent !== shortName) node.textContent = shortName;
    });
  }

  function touchesWeather(record) {
    const target = record.target?.nodeType === Node.TEXT_NODE ? record.target.parentElement : record.target;
    if (target instanceof Element && (target.matches(WEATHER_SELECTOR) || target.closest?.(WEATHER_SELECTOR))) return true;

    for (const node of record.addedNodes || []) {
      if (!(node instanceof Element)) continue;
      if (node.matches?.(WEATHER_SELECTOR) || node.querySelector?.(WEATHER_SELECTOR)) return true;
    }
    return false;
  }

  cleanWeatherDisplay();

  // start-weather.js schrijft nog een tijdzone achter de klok. Door direct op de
  // DOM-mutatie te reageren corrigeren we dat in dezelfde rendercyclus, vóór de
  // browser de tussenstand met CET/CEST kan tekenen.
  const observer = new MutationObserver((records) => {
    if (records.some(touchesWeather)) cleanWeatherDisplay();
  });
  observer.observe(document.documentElement, {
    subtree: true,
    childList: true,
    characterData: true
  });

  // Back-up voor het geval een browser een mutatie samenvoegt of uitstelt.
  window.setInterval(cleanWeatherDisplay, 1000);
})();
