(() => {
  "use strict";

  // Thema- en audio-instellingen blijven bewust verborgen. De bestaande effectenbediening
  // staat tijdens de ontwikkelfase wel weer aan zodat effecten bekeken en uitgebreid kunnen worden.
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

  function ensurePublicEffectsSection(attempt = 0) {
    if (!ENABLE_EFFECT_CONTROLS) return;

    const app = document.getElementById("app");
    const wrap = effectsWrap();
    if (!app || !wrap) {
      if (attempt < 40) setTimeout(() => ensurePublicEffectsSection(attempt + 1), 75);
      return;
    }

    let section = document.getElementById("publicEffectsSection");
    if (!section) {
      section = document.createElement("section");
      section.id = "publicEffectsSection";
      section.className = "public-effects-section roster-only-start";

      const title = document.createElement("h2");
      title.className = "public-effects-title";
      title.textContent = "Effecten";
      section.appendChild(title);
    }

    if (wrap.parentElement !== section) section.appendChild(wrap);

    const rosterRow = document.getElementById("publicPortalQuickActions");
    if (rosterRow?.parentElement === app) {
      rosterRow.after(section);
    } else if (!section.isConnected) {
      app.appendChild(section);
    }
  }

  function restoreRosterEffects() {
    if (!ENABLE_EFFECT_CONTROLS) return;
    const actionRow = document.querySelector(".today-workers-action");
    const wrap = effectsWrap();
    if (actionRow && wrap && wrap.parentElement !== actionRow) actionRow.appendChild(wrap);
    document.getElementById("publicEffectsSection")?.remove();
  }

  function buildRightControls(attempt = 0) {
    const shell = document.getElementById("themeCustomizerShell");
    const themeButton = document.getElementById("themeCustomizerButton");

    if (!shell || !themeButton) {
      if (attempt < 40) setTimeout(() => buildRightControls(attempt + 1), 75);
      return;
    }

    if (!ENABLE_THEME_CONTROLS) {
      hideThemeControls();
      if (ENABLE_EFFECT_CONTROLS) ensurePublicEffectsSection();
      else effectsWrap()?.remove();
      document.getElementById("audioSettingsButton")?.remove();
      document.getElementById("audioPreviewPanel")?.remove();
      return;
    }

    shell.hidden = false;

    let buttons = document.getElementById("themeSideButtons");
    if (!buttons) {
      buttons = document.createElement("div");
      buttons.id = "themeSideButtons";
      buttons.className = "theme-side-buttons";
      shell.insertBefore(buttons, shell.firstChild);
    }

    if (themeButton.parentElement !== buttons) buttons.appendChild(themeButton);

    if (!ENABLE_EFFECT_CONTROLS) effectsWrap()?.remove();
    document.getElementById("audioSettingsButton")?.remove();
    document.getElementById("audioPreviewPanel")?.remove();
  }

  window.addEventListener("rooster-unlocked", (event) => {
    if (!ENABLE_EFFECT_CONTROLS) return;
    if (event?.detail?.publicPortal) {
      requestAnimationFrame(() => ensurePublicEffectsSection());
    } else {
      requestAnimationFrame(restoreRosterEffects);
    }
  });

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => buildRightControls(), { once: true });
  } else {
    buildRightControls();
  }
})();
