(() => {
  "use strict";

  const MIN_BRIGHTNESS = 1;
  const MAX_BRIGHTNESS = 100;
  const DEFAULT_BRIGHTNESS = 18;
  const app = document.getElementById("app");
  if (!app) return;

  let userAdjusted = false;

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

  function applyBrightness(value) {
    const brightness = clampBrightness(value);
    const overlayAlpha = Math.min(.99, Math.max(0, 1 - brightness / 100));
    document.body.style.setProperty("--background-overlay-alpha", overlayAlpha.toFixed(2));
    const output = document.getElementById("backgroundBrightnessValue");
    const slider = document.getElementById("backgroundBrightnessSlider");
    if (output) output.textContent = `${brightness}%`;
    if (slider && Number(slider.value) !== brightness) slider.value = String(brightness);
  }

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
          <label class="background-brightness-label" for="backgroundBrightnessSlider">Helderheid achtergrond</label>
          <output class="background-brightness-value" id="backgroundBrightnessValue" for="backgroundBrightnessSlider">${brightness}%</output>
          <input class="background-brightness-slider" id="backgroundBrightnessSlider" type="range" min="1" max="100" step="1" value="${brightness}" aria-label="Achtergrond helderheid van 1 tot 100 procent">
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
  }

  const themeObserver = new MutationObserver(() => {
    if (userAdjusted || app.hidden) return;
    const brightness = brightnessFromCurrentOverlay();
    const slider = document.getElementById("backgroundBrightnessSlider");
    const output = document.getElementById("backgroundBrightnessValue");
    if (slider) slider.value = String(brightness);
    if (output) output.textContent = `${brightness}%`;
  });
  themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });

  window.addEventListener("rooster-unlocked", render);
  window.addEventListener("rooster-months-updated", render);
  if (!app.hidden) render();
})();
