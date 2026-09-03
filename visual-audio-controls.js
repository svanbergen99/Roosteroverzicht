(() => {
  "use strict";

  function buildRightControls(attempt = 0) {
    const shell = document.getElementById("themeCustomizerShell");
    const themeButton = document.getElementById("themeCustomizerButton");

    if (!shell || !themeButton) {
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

    // Effecten zijn voortaan volledig automatisch aan feestdagen gekoppeld.
    document.querySelector(".effects-menu-wrap")?.remove();
    document.getElementById("audioSettingsButton")?.remove();
    document.getElementById("audioPreviewPanel")?.remove();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => buildRightControls(), { once: true });
  } else {
    buildRightControls();
  }
})();
