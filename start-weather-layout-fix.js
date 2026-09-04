(() => {
  "use strict";

  const app = document.getElementById("app");
  const BODY_LOGIN_CLASS = "roster-login-active";
  const BODY_NO_ROOM_CLASS = "weather-scene-no-room";
  const GAP = 12;
  const MIN_SIZE = 220;
  const HEADER_CLOCK_ID = "startHeaderClock";
  let normalizingScene = false;

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

  function isPublicStart() {
    return document.body.classList.contains("public-portal-mode") &&
      !app?.hidden &&
      !document.body.classList.contains(BODY_LOGIN_CLASS);
  }

  function shortLocationName(value, fallback) {
    const name = String(value || "").split(",")[0].trim();
    return name || fallback;
  }

  function locationName(index) {
    const cardLocation = document.querySelector(`[data-weather-card="${index}"] [data-weather-location]`);
    if (cardLocation?.textContent?.trim()) {
      return shortLocationName(cardLocation.textContent, `Locatie ${index + 1}`);
    }

    const existing = document.querySelector(`.start-weather-scene-location.${index === 0 ? "is-left" : "is-right"}`);
    if (existing?.textContent?.trim()) {
      return shortLocationName(existing.textContent, `Locatie ${index + 1}`);
    }
    return `Locatie ${index + 1}`;
  }

  function ensureHeaderClock() {
    let clock = document.getElementById(HEADER_CLOCK_ID);
    if (clock) return clock;
    if (!app) return null;

    clock = document.createElement("strong");
    clock.id = HEADER_CLOCK_ID;
    clock.className = "start-weather-header-clock roster-only-start";
    clock.setAttribute("data-weather-live-clock", "");
    clock.setAttribute("aria-label", "Huidige tijd");
    clock.textContent = "00:00:00";
    app.appendChild(clock);
    return clock;
  }

  function positionHeaderClock() {
    const clock = ensureHeaderClock();
    if (!clock) return;

    clock.hidden = !isPublicStart();
    if (clock.hidden) return;

    const toggle = document.querySelector(".theme-toggle");
    if (!toggle) return;
    const rect = toggle.getBoundingClientRect();
    clock.style.top = `${Math.round(rect.top)}px`;
    clock.style.right = `${Math.max(8, Math.round(window.innerWidth - rect.left + 8))}px`;
    clock.style.minHeight = `${Math.round(rect.height)}px`;
  }

  function rawWeatherPanels(scene) {
    if (!scene) return [];
    if (scene.querySelector(":scope > .start-weather-dual-layout")) return [];

    const split = scene.querySelector(":scope > .start-weather-scene-split");
    if (split) {
      return [...split.querySelectorAll(":scope > .start-weather-scene-sky")];
    }
    return [...scene.querySelectorAll(":scope > .start-weather-scene-sky")];
  }

  function updateDualLabels(scene) {
    const labels = scene?.querySelectorAll(".start-weather-side-location");
    if (!labels?.length) return;
    labels.forEach((label, index) => {
      const next = locationName(index);
      if (label.textContent !== next) label.textContent = next;
    });
  }

  function normalizeWeatherScene(scene) {
    if (!scene || normalizingScene) return;
    if (scene.querySelector(":scope > .start-weather-dual-layout")) {
      updateDualLabels(scene);
      return;
    }

    const panels = rawWeatherPanels(scene);
    if (!panels.length) return;

    normalizingScene = true;
    try {
      const dual = document.createElement("div");
      dual.className = "start-weather-dual-layout";

      [0, 1].forEach((index) => {
        const source = panels[index] || panels[0];
        if (!source) return;

        const side = document.createElement("div");
        side.className = `start-weather-side ${index === 0 ? "is-left" : "is-right"}`;

        const panel = source.cloneNode(true);
        panel.classList.add("start-weather-side-sky");

        const label = document.createElement("strong");
        label.className = "start-weather-side-location start-weather-scene-location";
        label.textContent = locationName(index);

        side.append(panel, label);
        dual.appendChild(side);
      });

      scene.replaceChildren(dual);
    } finally {
      normalizingScene = false;
    }
  }

  function positionWeatherScene() {
    syncLoginState();
    positionHeaderClock();

    const scene = document.getElementById("startWeatherScene");
    const externalSites = document.getElementById("externalSitesSection");
    const publicStart = isPublicStart();

    if (!scene || !externalSites || !publicStart) return;

    normalizeWeatherScene(scene);

    const externalRect = externalSites.getBoundingClientRect();
    const viewportWidth = document.documentElement.clientWidth || window.innerWidth;
    const leftSize = Math.floor(externalRect.left - GAP);
    const rightSize = Math.floor(viewportWidth - externalRect.right - GAP);
    const noRoom = leftSize < MIN_SIZE || rightSize < MIN_SIZE;

    if (document.body.classList.contains(BODY_NO_ROOM_CLASS) !== noRoom) {
      document.body.classList.toggle(BODY_NO_ROOM_CLASS, noRoom);
    }
    if (noRoom) return;

    // Eén transparante positioneringslaag over de paginabreedte. Daarin staat
    // Locatie 1 uitsluitend links van de startpagina en Locatie 2 uitsluitend rechts.
    scene.style.left = "0px";
    scene.style.top = `${Math.round(window.scrollY + externalRect.top)}px`;
    scene.style.width = `${viewportWidth}px`;
    scene.style.height = `${Math.max(leftSize, rightSize)}px`;
    scene.style.setProperty("--weather-left-size", `${leftSize}px`);
    scene.style.setProperty("--weather-right-size", `${rightSize}px`);
    scene.style.setProperty("--weather-right-left", `${Math.round(externalRect.right + GAP)}px`);
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

  const observer = new MutationObserver(() => {
    if (!normalizingScene) schedulePosition();
  });
  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ["hidden", "class"]
  });

  schedulePosition();
})();
