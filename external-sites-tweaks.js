(() => {
  "use strict";

  const LEAVE_WARNING = "⚠️ Alleen als Traffic dit op Teams aangeeft";

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
  }

  window.addEventListener("rooster-unlocked", () => applyTweaks());
  if (!document.getElementById("app")?.hidden) applyTweaks();
})();
