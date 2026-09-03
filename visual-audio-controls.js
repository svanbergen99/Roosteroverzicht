(() => {
  "use strict";

  function closeEffectsMenu() {
    const menu = document.getElementById("effectsMenu");
    const button = document.getElementById("effectsButton");
    if (!menu || !button || menu.hidden) return;
    menu.hidden = true;
    button.setAttribute("aria-expanded", "false");
  }

  function closeThemePanel() {
    const panel = document.getElementById("themeCustomizerPanel");
    const button = document.getElementById("themeCustomizerButton");
    if (!panel || !button || panel.hidden) return;
    panel.hidden = true;
    button.setAttribute("aria-expanded", "false");
  }

  function buildRightControls(attempt = 0) {
    const shell = document.getElementById("themeCustomizerShell");
    const themeButton = document.getElementById("themeCustomizerButton");
    const effectsWrap = document.querySelector(".effects-menu-wrap");

    if (!shell || !themeButton || !effectsWrap) {
      if (attempt < 40) setTimeout(() => buildRightControls(attempt + 1), 75);
      return;
    }

    let buttons = document.getElementById("themeSideButtons");
    if (!buttons) {
      buttons = document.createElement("div");
      buttons.id = "themeSideButtons";
      buttons.className = "theme-side-buttons";
      shell.insertBefore(buttons, shell.firstChild);
    }

    if (themeButton.parentElement !== buttons) buttons.appendChild(themeButton);
    if (effectsWrap.parentElement !== buttons) buttons.appendChild(effectsWrap);

    document.getElementById("audioSettingsButton")?.remove();
    document.getElementById("audioPreviewPanel")?.remove();

    themeButton.addEventListener("click", closeEffectsMenu);
    document.getElementById("effectsButton")?.addEventListener("click", closeThemePanel);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => buildRightControls(), { once: true });
  } else {
    buildRightControls();
  }
})();
