(() => {
  "use strict";

  // Thema- en audio-instellingen blijven bewust verborgen. De bestaande effectenbediening
  // staat tijdens de ontwikkelfase wel weer aan en hoort onder Achtergrond Helderheid.
  const ENABLE_THEME_CONTROLS = false;
  const ENABLE_EFFECT_CONTROLS = true;

  function hideThemeControls() {
    document.getElementById("themeCustomizerPanel")?.setAttribute("hidden", "");
    document.getElementById("themeSideButtons")?.remove();
    document.getElementById("themeCustomizerButton")?.remove();
    const shell = document.getElementById("themeCustomizerShell");
    if (shell) shell.hidden = true;
  }

  function effectsWrap() {
    return document.querySelector(".effects-menu-wrap");
  }

  function ensureEffectsDock(attempt = 0) {
    if (!ENABLE_EFFECT_CONTROLS) return;

    const brightness = document.getElementById("backgroundBrightnessBar");
    const wrap = effectsWrap();
    if (!brightness || !wrap) {
      if (attempt < 60) setTimeout(() => ensureEffectsDock(attempt + 1), 75);
      return;
    }

    document.getElementById("publicEffectsSection")?.remove();
    wrap.classList.add("brightness-effects-wrap");
    if (wrap.parentElement !== brightness) brightness.appendChild(wrap);
  }

  function buildControls() {
    if (!ENABLE_THEME_CONTROLS) hideThemeControls();

    if (ENABLE_EFFECT_CONTROLS) ensureEffectsDock();
    else effectsWrap()?.remove();

    document.getElementById("audioSettingsButton")?.remove();
    document.getElementById("audioPreviewPanel")?.remove();
  }

  window.addEventListener("rooster-unlocked", () => {
    if (ENABLE_EFFECT_CONTROLS) requestAnimationFrame(() => ensureEffectsDock());
  });
  window.addEventListener("rooster-months-updated", () => {
    if (ENABLE_EFFECT_CONTROLS) requestAnimationFrame(() => ensureEffectsDock());
  });

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", buildControls, { once: true });
  } else {
    buildControls();
  }
})();
