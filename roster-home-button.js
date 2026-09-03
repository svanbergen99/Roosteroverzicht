(() => {
  "use strict";

  const RETURN_KEY = "rooster-return-to-start";
  const app = document.getElementById("app");
  const searchCard = document.querySelector(".search-card");
  if (!app) return;

  function stopActiveMedia() {
    try { window.RoosterPaydaySoundPreview?.stop?.(); } catch (_) {}
    try { window.RoosterPaydayAudio?.stop?.(); } catch (_) {}
    try { window.RoosterPaydayEffect?.stop?.(); } catch (_) {}
    try { window.RoosterBirthdayScene?.hide?.(); } catch (_) {}
    try { window.RoosterEffects?.stop?.(); } catch (_) {}
  }

  function returnToStartPage() {
    stopActiveMedia();
    try { sessionStorage.setItem(RETURN_KEY, "1"); } catch (_) {}
    window.location.reload();
  }

  function ensureButton() {
    let button = document.getElementById("rosterHomeButton");
    if (button) return button;

    button = document.createElement("button");
    button.id = "rosterHomeButton";
    button.className = "today-workers-button roster-home-button";
    button.type = "button";
    button.setAttribute("aria-label", "Terug naar startpagina");
    button.innerHTML = `
      <span class="roster-home-icon" aria-hidden="true">⌂</span>
      <span>Startpagina</span>`;
    button.addEventListener("click", returnToStartPage);

    if (searchCard?.parentElement === app) searchCard.before(button);
    else app.prepend(button);
    return button;
  }

  function handleUnlocked(event) {
    if (event?.detail?.publicPortal) return;
    ensureButton();
  }

  function resumePublicStartIfRequested() {
    let requested = false;
    try {
      requested = sessionStorage.getItem(RETURN_KEY) === "1";
      if (requested) sessionStorage.removeItem(RETURN_KEY);
    } catch (_) {}
    if (!requested) return;

    const continueButton = document.getElementById("continueButton");
    if (continueButton) {
      continueButton.click();
      window.scrollTo({ top: 0, behavior: "auto" });
    }
  }

  window.addEventListener("rooster-unlocked", handleUnlocked);

  if (document.body.classList.contains("roster-access-active")) ensureButton();
  resumePublicStartIfRequested();
})();
