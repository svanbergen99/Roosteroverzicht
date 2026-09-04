(() => {
  "use strict";

  const app = document.getElementById("app");
  const BODY_LOGIN_CLASS = "roster-login-active";
  const BODY_NO_ROOM_CLASS = "weather-scene-no-room";
  const OUTER_MARGIN = 20;
  const GAP = 12;
  const MIN_SIZE = 180;

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
    const primary = document.getElementById("publicPrimaryActions");
    const salary = document.getElementById("publicSalarySection") || document.getElementById("publicSalaryButton");
    const publicStart = document.body.classList.contains("public-portal-mode") && !app?.hidden && !document.body.classList.contains(BODY_LOGIN_CLASS);

    if (!scene || !primary || !salary || !publicStart) return;

    const primaryRect = primary.getBoundingClientRect();
    const salaryRect = salary.getBoundingClientRect();
    const rightEdge = primaryRect.left - GAP;
    const size = Math.floor(rightEdge - OUTER_MARGIN);
    const noRoom = size < MIN_SIZE;

    if (document.body.classList.contains(BODY_NO_ROOM_CLASS) !== noRoom) {
      document.body.classList.toggle(BODY_NO_ROOM_CLASS, noRoom);
    }
    if (noRoom) return;

    scene.style.left = `${OUTER_MARGIN}px`;
    scene.style.top = `${Math.round(salaryRect.bottom + GAP)}px`;
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
