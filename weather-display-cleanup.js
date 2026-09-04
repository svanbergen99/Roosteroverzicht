(() => {
  "use strict";

  const TIME_ZONE = "Europe/Amsterdam";

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

  cleanWeatherDisplay();
  window.setInterval(cleanWeatherDisplay, 250);
})();
