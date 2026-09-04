(() => {
  "use strict";

  const app = document.getElementById("app");
  const BODY_LOGIN_CLASS = "roster-login-active";
  const BODY_NO_ROOM_CLASS = "weather-scene-no-room";
  const GAP = 12;
  const MIN_SIZE = 220;

  function loginOverlayVisible() {
    const overlay = document.getElementById("permissionAuthOverlay");
    return !!(overlay && !overlay.hidden);
  }

  function syncLoginState() {
    const shouldHideForLogin = loginOverlayVisible() || (!!app?.hidden && document.body.classList.contains("public-portal-mode"));
    if (document.body.classList.contains(BODY_LOGIN_CLASS) !== shouldHideForLogin) {
      document.body.classList.toggle(BODY_LOGIN_CLASS, shouldHideForLogin);
    }
  }

  function positionWeatherScene() {
    syncLoginState();

    const scene = document.getElementById("startWeatherScene");
    const externalSites = document.getElementById("externalSitesSection");
    const publicStart = document.body.classList.contains("public-portal-mode") &&
      !app?.hidden &&
      !document.body.classList.contains(BODY_LOGIN_CLASS);

    if (!scene || !externalSites || !publicStart) return;

    const externalRect = externalSites.getBoundingClientRect();
    const size = Math.floor(externalRect.left - GAP);
    const noRoom = size < MIN_SIZE;

    if (document.body.classList.contains(BODY_NO_ROOM_CLASS) !== noRoom) {
      document.body.classList.toggle(BODY_NO_ROOM_CLASS, noRoom);
    }
    if (noRoom) return;

    // Het weerblok staat op een vaste plek IN de pagina, niet vast aan de viewport.
    // Daardoor vult het exact de vrije linker ruimte naast Externe websites en
    // scrollt het gewoon met de rest van de startpagina mee omhoog.
    scene.style.left = "0px";
    scene.style.top = `${Math.round(window.scrollY + externalRect.top)}px`;
    scene.style.width = `${size}px`;
    scene.style.height = `${size}px`;
  }

  function schedulePosition() {
    requestAnimationFrame(() => requestAnimationFrame(positionWeatherScene));
  }

  document.addEventListener("click", (event) => {
    if (!event.target.closest?.("#publicRosterButton")) return;
    document.body.classList.add(BODY_LOGIN_CLASS);
  }, true);

  window.addEventListener("resize", schedulePosition, { passive: true });
  window.addEventListener("rooster-unlocked", schedulePosition);
  window.addEventListener("load", schedulePosition, { once: true });

  const observer = new MutationObserver(() => schedulePosition());
  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ["hidden", "class"]
  });

  schedulePosition();
})();
