(() => {
  "use strict";

  const effects = window.RoosterEffects;
  if (!effects?.start || window.RoosterEffectCombinations) return;

  const originalStart = effects.start.bind(effects);
  const originalStop = effects.stop.bind(effects);
  const PETAL_OVERLAY_ID = "combinedPetalEffectOverlay";
  const STYLE_ID = "combinedEffectStyle";
  const DURATION_MS = 12000;
  let petalTimer = 0;
  let manualStartUntil = 0;

  const normalize = (type) => {
    const value = String(type || "");
    if (value === "hearts" || value === "petals" || value === "hearts-petals") return "hearts-petals";
    if (value === "snow" || value === "christmas" || value === "christmas-snow") return "christmas-snow";
    return value;
  };

  function ensureStyle() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
      #${PETAL_OVERLAY_ID} {
        position: fixed;
        inset: 0;
        z-index: 10560;
        overflow: hidden;
        pointer-events: none;
      }
      #${PETAL_OVERLAY_ID} .combined-petal {
        position: absolute;
        left: var(--left);
        top: -12vh;
        width: var(--size);
        height: calc(var(--size) * .62);
        border-radius: 100% 0 100% 0;
        background: var(--color);
        opacity: .92;
        filter: drop-shadow(0 3px 3px rgba(120,40,80,.16));
        animation: combinedPetalFall var(--duration) linear var(--delay) infinite;
        will-change: transform;
      }
      @keyframes combinedPetalFall {
        0% { transform: translate3d(0,-12vh,0) rotate(0deg); }
        25% { transform: translate3d(calc(var(--drift) * .35),26vh,0) rotate(150deg); }
        55% { transform: translate3d(calc(var(--drift) * -.22),65vh,0) rotate(310deg); }
        100% { transform: translate3d(var(--drift),122vh,0) rotate(620deg); }
      }
      @media (prefers-reduced-motion: reduce) {
        #${PETAL_OVERLAY_ID} { display: none !important; }
      }
    `;
    document.head.appendChild(style);
  }

  function fullscreenHost() {
    const section = document.getElementById("videoLibraryPlayerSection");
    const active = document.fullscreenElement || document.webkitFullscreenElement;
    const fallback = section?.classList.contains("video-library-auto-fullscreen-fallback");
    return section && (active === section || fallback) ? section : document.body;
  }

  function keepOverlayInCorrectHost() {
    const overlay = document.getElementById(PETAL_OVERLAY_ID);
    if (!overlay) return;
    const host = fullscreenHost();
    if (overlay.parentElement !== host) host.appendChild(overlay);
  }

  function stopPetals() {
    window.clearTimeout(petalTimer);
    petalTimer = 0;
    document.getElementById(PETAL_OVERLAY_ID)?.remove();
  }

  function startPetals() {
    stopPetals();
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches) return;
    ensureStyle();

    const overlay = document.createElement("div");
    overlay.id = PETAL_OVERLAY_ID;
    overlay.setAttribute("aria-hidden", "true");
    const colors = ["#ffc2d1", "#ff8fab", "#fb6f92", "#ffe5ec", "#f9a8d4"];
    const count = window.innerWidth < 680 ? 58 : 96;
    for (let index = 0; index < count; index += 1) {
      const petal = document.createElement("i");
      petal.className = "combined-petal";
      petal.style.setProperty("--left", `${(Math.random() * 104 - 2).toFixed(1)}vw`);
      petal.style.setProperty("--size", `${Math.round(8 + Math.random() * 15)}px`);
      petal.style.setProperty("--drift", `${(Math.random() * 32 - 16).toFixed(1)}vw`);
      petal.style.setProperty("--duration", `${(4.4 + Math.random() * 4.8).toFixed(2)}s`);
      petal.style.setProperty("--delay", `${(-Math.random() * 7).toFixed(2)}s`);
      petal.style.setProperty("--color", colors[Math.floor(Math.random() * colors.length)]);
      overlay.appendChild(petal);
    }
    fullscreenHost().appendChild(overlay);
    petalTimer = window.setTimeout(stopPetals, DURATION_MS);
  }

  function requestExistingStaticScene(type) {
    const normalized = normalize(type);

    if (normalized === "birthday") {
      window.RoosterBirthdayScene?.show?.(false);
      return;
    }

    const sceneType = ({
      fireworks: "fireworks",
      orange: "orange",
      "hearts-petals": "hearts",
      easter: "easter",
      halloween: "halloween",
      sinterklaas: "sinterklaas",
      "christmas-snow": "christmas"
    })[normalized];
    if (!sceneType) return;

    // holiday-scenes.js beheert de bestaande vaste onderscènes via zijn
    // data-effect kliklistener. Een verborgen marker laat ons diezelfde scenes
    // ook gebruiken bij video/automatische starts zonder de SVG's te dupliceren.
    const marker = document.createElement("span");
    marker.hidden = true;
    marker.dataset.effect = sceneType;
    marker.dataset.staticSceneRequest = "true";
    document.body.appendChild(marker);
    marker.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    marker.remove();
  }

  function combinedStart(type) {
    const normalized = normalize(type);
    stopPetals();
    requestExistingStaticScene(normalized);

    if (normalized === "hearts-petals") {
      originalStart("hearts");
      startPetals();
      return;
    }
    if (normalized === "christmas-snow") {
      // Het bestaande kersteffect bevat kerstsymbolen en meerdere sneeuwlagen.
      originalStart("christmas");
      return;
    }
    originalStart(normalized);
  }

  function combinedStop() {
    stopPetals();
    originalStop();
  }

  function setMenuItem(item, id, iconText, labelText) {
    if (!item) return;
    item.dataset.effect = id;
    const icon = item.querySelector(".effects-menu-icon");
    const label = item.querySelector("span:last-child");
    if (icon && icon.textContent !== iconText) icon.textContent = iconText;
    if (label && label.textContent !== labelText) label.textContent = labelText;
  }

  function patchMenu() {
    const menu = document.getElementById("effectsMenu");
    if (!menu) return;

    // Alleen deze feest-/gelegenheidseffecten blijven in het menu, in de
    // gewenste volgorde. Payday wordt door payday-effect.js na Verjaardag gezet.
    menu.querySelector('[data-effect="snow"]')?.remove();
    menu.querySelector('[data-effect="petals"]')?.remove();
    menu.querySelector('[data-effect="stars"]')?.remove();
    menu.querySelector('[data-effect="autumn"]')?.remove();

    setMenuItem(menu.querySelector('[data-effect="fireworks"]'), "fireworks", "🎆", "Nieuwjaar");
    setMenuItem(menu.querySelector('[data-effect="birthday"]'), "birthday", "🎂", "Verjaardag");
    setMenuItem(menu.querySelector('[data-effect="orange"]'), "orange", "🧡", "Koningsdag");

    const hearts = menu.querySelector('[data-effect="hearts"], [data-effect="hearts-petals"]');
    setMenuItem(hearts, "hearts-petals", "❤️🌸", "Valentijns");

    setMenuItem(menu.querySelector('[data-effect="easter"]'), "easter", "🐣", "Pasen");
    setMenuItem(menu.querySelector('[data-effect="halloween"]'), "halloween", "🦇", "Halloween");
    setMenuItem(menu.querySelector('[data-effect="sinterklaas"]'), "sinterklaas", "🎁", "Sinterklaas");

    const christmas = menu.querySelector('[data-effect="christmas"], [data-effect="christmas-snow"]');
    setMenuItem(christmas, "christmas-snow", "🎄❄️", "Kerst");
  }

  document.addEventListener("click", (event) => {
    const item = event.target.closest?.("[data-effect]");
    if (!item || item.dataset.staticSceneRequest === "true") return;

    manualStartUntil = performance.now() + 300;
    const selected = normalize(item.dataset.effect);
    if (selected !== "hearts-petals" && selected !== "christmas-snow") return;

    // De interne menu-handler van effects.js kent de combinatie-id's niet.
    event.preventDefault();
    event.stopImmediatePropagation();

    const menu = document.getElementById("effectsMenu");
    const button = document.getElementById("effectsButton");
    if (menu) menu.hidden = true;
    button?.setAttribute("aria-expanded", "false");
    combinedStart(selected);
  }, true);

  document.addEventListener("fullscreenchange", keepOverlayInCorrectHost);
  document.addEventListener("webkitfullscreenchange", keepOverlayInCorrectHost);

  effects.start = combinedStart;
  effects.stop = combinedStop;
  effects.list = () => [
    { id: "fireworks", label: "Nieuwjaar" },
    { id: "birthday", label: "Verjaardag" },
    { id: "orange", label: "Koningsdag" },
    { id: "hearts-petals", label: "Valentijns" },
    { id: "easter", label: "Pasen" },
    { id: "halloween", label: "Halloween" },
    { id: "sinterklaas", label: "Sinterklaas" },
    { id: "christmas-snow", label: "Kerst" }
  ];

  window.RoosterEffectCombinations = Object.freeze({
    normalize,
    isManualStart: () => performance.now() <= manualStartUntil,
    stopPetals,
    showStaticUnderEffect: requestExistingStaticScene
  });

  patchMenu();
  const observer = new MutationObserver(patchMenu);
  observer.observe(document.documentElement, { childList: true, subtree: true });
})();