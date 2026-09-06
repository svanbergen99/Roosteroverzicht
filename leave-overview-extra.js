(() => {
  "use strict";

  function leaveOverview() {
    const value = window.RoosterPrivateConfig?.leaveOverview;
    return value && typeof value === "object" && !Array.isArray(value) ? value : null;
  }

  function hasClosedData() {
    const root = leaveOverview()?.officieelGesloten;
    return Boolean(root && typeof root === "object" && Object.keys(root).length);
  }

  function ensureClosed(section, afterNode) {
    let shell = section.querySelector("#officialClosedDropdown");
    if (!shell) {
      shell = document.createElement("div");
      shell.id = "officialClosedDropdown";
      shell.className = "external-site-dropdown vacation-leave-dropdown";
      shell.innerHTML = `
        <button id="officialClosedButton" class="external-site-link external-site-dropdown-trigger" type="button" disabled aria-expanded="false">
          <strong>Officieel Gesloten</strong>
          <span class="vacation-leave-toggle" aria-hidden="true">▾</span>
        </button>
        <div class="vacation-leave-panel" hidden>
          <div class="vacation-leave-status" hidden></div>
          <div class="vacation-leave-content"></div>
        </div>`;
      afterNode.after(shell);
    }

    const button = shell.querySelector("#officialClosedButton");
    if (button) button.disabled = !hasClosedData();
    return shell;
  }

  function setup(attempt = 0) {
    const section = document.getElementById("externalSitesSection");
    if (!section) {
      if (attempt < 40) setTimeout(() => setup(attempt + 1), 100);
      return;
    }

    const vacation = section.querySelector("#vacationLeaveDropdown");
    const leave = [...section.querySelectorAll(".external-site-link")].find((link) =>
      link.querySelector("strong")?.textContent?.trim() === "Verlof aanvragen"
    );
    if (!leave) return;

    ensureClosed(section, vacation || leave);
  }

  window.addEventListener("rooster-private-config-ready", () => setup());
  window.addEventListener("rooster-unlocked", () => setup());
  if (!document.getElementById("app")?.hidden) setup();
})();
