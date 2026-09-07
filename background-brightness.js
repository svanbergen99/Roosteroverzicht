(() => {
  "use strict";

  const MIN_BRIGHTNESS = 1;
  const MAX_BRIGHTNESS = 100;
  const DEFAULT_BRIGHTNESS = 100;
  const app = document.getElementById("app");
  if (!app) return;

  let userAdjusted = false;
  let currentBrightness = DEFAULT_BRIGHTNESS;

  function clampBrightness(value) {
    const number = Number(value);
    if (!Number.isFinite(number)) return DEFAULT_BRIGHTNESS;
    return Math.min(MAX_BRIGHTNESS, Math.max(MIN_BRIGHTNESS, Math.round(number)));
  }

  function brightnessFromCurrentOverlay() {
    const alpha = Number.parseFloat(getComputedStyle(document.body).getPropertyValue("--background-overlay-alpha"));
    if (!Number.isFinite(alpha)) return DEFAULT_BRIGHTNESS;
    return clampBrightness((1 - alpha) * 100);
  }

  function weatherImageBrightness(brightness) {
    const level = Math.min(1, Math.max(.01, brightness / 100));
    // Laat het weerplaatje zelf duidelijk donkerder worden. De curve is bewust
    // sterker dan lineair zodat 50% ook visueel echt ongeveer half/donker voelt.
    return Math.max(.06, Math.pow(level, 1.45));
  }

  function applyWeatherEffectBrightness(brightness) {
    const imageLevel = weatherImageBrightness(brightness);
    const imagePercent = Math.round(imageLevel * 100);
    const filter = `brightness(${imageLevel.toFixed(3)}) drop-shadow(0 12px 20px rgba(15,23,42,.16))`;

    document.documentElement.style.setProperty("--weather-effect-brightness", `${imagePercent}%`);
    document.body.style.setProperty("--weather-effect-brightness", `${imagePercent}%`);

    document.querySelectorAll(".start-weather-scene-image").forEach((image) => {
      image.style.setProperty("filter", filter, "important");
      // Niet transparanter maken: de echte pixels van het plaatje worden donkerder.
      image.style.setProperty("opacity", "1", "important");
    });
  }

  function applyBrightness(value) {
    const brightness = clampBrightness(value);
    currentBrightness = brightness;
    const overlayAlpha = Math.min(.99, Math.max(0, 1 - brightness / 100));
    document.body.style.setProperty("--background-overlay-alpha", overlayAlpha.toFixed(2));
    applyWeatherEffectBrightness(brightness);
    const output = document.getElementById("backgroundBrightnessValue");
    const slider = document.getElementById("backgroundBrightnessSlider");
    if (output) output.textContent = `${brightness}%`;
    if (slider && Number(slider.value) !== brightness) slider.value = String(brightness);
  }

  // Iedere nieuwe pagina-open start bewust opnieuw op 100% helderheid.
  // Handmatige wijzigingen gelden alleen voor de huidige geopende pagina.
  applyBrightness(DEFAULT_BRIGHTNESS);

  function closePanel() {
    const panel = document.getElementById("backgroundBrightnessPanel");
    const button = document.getElementById("backgroundBrightnessButton");
    if (!panel || !button) return;
    panel.hidden = true;
    button.setAttribute("aria-expanded", "false");
  }

  function togglePanel() {
    const panel = document.getElementById("backgroundBrightnessPanel");
    const button = document.getElementById("backgroundBrightnessButton");
    if (!panel || !button) return;
    const open = panel.hidden;
    panel.hidden = !open;
    button.setAttribute("aria-expanded", String(open));
  }

  function ensureControl() {
    let control = document.getElementById("backgroundBrightnessBar");
    if (control) return control;

    const brightness = brightnessFromCurrentOverlay();
    control = document.createElement("div");
    control.id = "backgroundBrightnessBar";
    control.className = "background-brightness-shell";
    control.innerHTML = `
      <button class="background-brightness-button" id="backgroundBrightnessButton" type="button" aria-expanded="false" aria-controls="backgroundBrightnessPanel">Achtergrond Helderheid</button>
      <div class="background-brightness-panel" id="backgroundBrightnessPanel" hidden>
        <div class="background-brightness-control">
          <label class="background-brightness-label" for="backgroundBrightnessSlider">Helderheid achtergrond + weereffecten</label>
          <output class="background-brightness-value" id="backgroundBrightnessValue" for="backgroundBrightnessSlider">${brightness}%</output>
          <input class="background-brightness-slider" id="backgroundBrightnessSlider" type="range" min="1" max="100" step="1" value="${brightness}" aria-label="Helderheid van achtergrond en weereffecten van 1 tot 100 procent">
        </div>
      </div>`;

    app.appendChild(control);

    control.querySelector("#backgroundBrightnessButton")?.addEventListener("click", (event) => {
      event.stopPropagation();
      togglePanel();
    });

    control.querySelector("#backgroundBrightnessPanel")?.addEventListener("click", (event) => {
      event.stopPropagation();
    });

    control.querySelector("#backgroundBrightnessSlider")?.addEventListener("input", (event) => {
      userAdjusted = true;
      applyBrightness(event.currentTarget.value);
    });

    document.addEventListener("click", (event) => {
      if (!control.contains(event.target)) closePanel();
    });

    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape") closePanel();
    });

    return control;
  }

  function render() {
    if (app.hidden) return;
    const control = ensureControl();
    control.hidden = false;
    applyWeatherEffectBrightness(currentBrightness);
  }

  const themeObserver = new MutationObserver(() => {
    if (userAdjusted || app.hidden) return;
    applyBrightness(DEFAULT_BRIGHTNESS);
  });
  themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });

  const weatherEffectObserver = new MutationObserver((mutations) => {
    const weatherChanged = mutations.some((mutation) => [...mutation.addedNodes].some((node) => {
      if (!(node instanceof Element)) return false;
      return node.matches?.(".start-weather-scene-image") || Boolean(node.querySelector?.(".start-weather-scene-image"));
    }));
    if (weatherChanged) applyWeatherEffectBrightness(currentBrightness);
  });
  weatherEffectObserver.observe(document.body, { childList: true, subtree: true });

  window.addEventListener("rooster-unlocked", render);
  window.addEventListener("rooster-months-updated", render);
  window.addEventListener("rooster-start-ready", () => applyWeatherEffectBrightness(currentBrightness));
  if (!app.hidden) render();
})();
