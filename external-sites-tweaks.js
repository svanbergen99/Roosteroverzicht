(() => {
  "use strict";

  const LEAVE_WARNING = "⚠️ Alleen als Traffic dit op Teams aangeeft";

  function leaveOverview() {
    const value = window.RoosterPrivateConfig?.leaveOverview;
    return value && typeof value === "object" && !Array.isArray(value) ? value : null;
  }

  function hasVacationData() {
    const root = leaveOverview()?.vakantie;
    return Boolean(root?.meivakantie && root?.zomervakantie && root?.kerstvakantie);
  }

  function ensureVacationDropdown(section, leaveLink) {
    let shell = section.querySelector("#vacationLeaveDropdown");
    if (!shell) {
      shell = document.createElement("div");
      shell.id = "vacationLeaveDropdown";
      shell.className = "external-site-dropdown vacation-leave-dropdown";
      shell.innerHTML = `
        <button id="vacationLeaveButton" class="external-site-link external-site-dropdown-trigger" type="button" aria-expanded="false" aria-controls="vacationLeavePanel" disabled>
          <strong>Vakantie Verlof Aanvragen</strong>
          <span class="vacation-leave-toggle" aria-hidden="true">▾</span>
        </button>
        <div id="vacationLeavePanel" class="vacation-leave-panel" hidden>
          <div id="vacationLeaveStatus" class="vacation-leave-status" aria-live="polite" hidden></div>
          <div id="vacationLeaveContent" class="vacation-leave-content"></div>
        </div>`;
      leaveLink.after(shell);
    }

    const button = shell.querySelector("#vacationLeaveButton");
    if (button) button.disabled = !hasVacationData();
    shell.dataset.sourceAvailable = hasVacationData() ? "true" : "false";
    return shell;
  }

  function applyTweaks(attempt = 0) {
    const section = document.getElementById("externalSitesSection");
    if (!section) {
      if (attempt < 30) window.setTimeout(() => applyTweaks(attempt + 1), 100);
      return;
    }

    section.querySelectorAll(".external-site-meta").forEach((meta) => meta.remove());

    const leaveLink = [...section.querySelectorAll(".external-site-link")].find((link) =>
      link.querySelector("strong")?.textContent?.trim() === "Verlof aanvragen"
    );
    if (!leaveLink) return;

    leaveLink.classList.add("is-warning");
    let warning = leaveLink.querySelector(".external-site-warning");
    if (!warning) {
      warning = document.createElement("span");
      warning.className = "external-site-warning";
      leaveLink.appendChild(warning);
    }
    warning.textContent = LEAVE_WARNING;

    ensureVacationDropdown(section, leaveLink);
  }

  window.addEventListener("rooster-private-config-ready", () => applyTweaks());
  window.addEventListener("rooster-unlocked", () => applyTweaks());
  if (!document.getElementById("app")?.hidden) applyTweaks();
})();
