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
    return section && active === section ? section : document.body;
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

  function combinedStart(type) {
    const normalized = normalize(type);
    stopPetals();

    if (normalized === "hearts-petals") {
      originalStart("hearts");
      startPetals();
      return;
    }
    if (normalized === "christmas-snow") {
      // Het bestaande kersteffect bevat al kerstsymbolen én meerdere sneeuwlagen.
      originalStart("christmas");
      return;
    }
    originalStart(normalized);
  }

  function combinedStop() {
    stopPetals();
    originalStop();
  }

  function patchMenu() {
    const menu = document.getElementById("effectsMenu");
    if (!menu) return;

    const hearts = menu.querySelector('[data-effect="hearts"]');
    const petals = menu.querySelector('[data-effect="petals"]');
    if (hearts) {
      hearts.dataset.effect = "hearts-petals";
      const icon = hearts.querySelector(".effects-menu-icon");
      const label = hearts.querySelector("span:last-child");
      if (icon) icon.textContent = "❤️🌸";
      if (label) label.textContent = "Hartjes & Bloemblaadjes";
    }
    petals?.remove();

    const christmas = menu.querySelector('[data-effect="christmas"]');
    const snow = menu.querySelector('[data-effect="snow"]');
    if (christmas) {
      christmas.dataset.effect = "christmas-snow";
      const icon = christmas.querySelector(".effects-menu-icon");
      const label = christmas.querySelector("span:last-child");
      if (icon) icon.textContent = "🎄❄️";
      if (label) label.textContent = "Kerst & Sneeuw";
    }
    snow?.remove();
  }

  document.addEventListener("click", (event) => {
    if (event.target.closest?.("[data-effect]")) manualStartUntil = performance.now() + 300;
  }, true);

  document.addEventListener("fullscreenchange", keepOverlayInCorrectHost);
  document.addEventListener("webkitfullscreenchange", keepOverlayInCorrectHost);

  effects.start = combinedStart;
  effects.stop = combinedStop;
  effects.list = () => [
    { id: "fireworks", label: "Vuurwerk" },
    { id: "birthday", label: "Verjaardag" },
    { id: "orange", label: "Oranje feest" },
    { id: "hearts-petals", label: "Hartjes & Bloemblaadjes" },
    { id: "stars", label: "Sterrenregen" },
    { id: "easter", label: "Paaseieren" },
    { id: "autumn", label: "Herfstbladeren" },
    { id: "halloween", label: "Halloween" },
    { id: "sinterklaas", label: "Sinterklaas" },
    { id: "christmas-snow", label: "Kerst & Sneeuw" },
    { id: "eid", label: "Suikerfeest" }
  ];

  window.RoosterEffectCombinations = Object.freeze({
    normalize,
    isManualStart: () => performance.now() <= manualStartUntil,
    stopPetals
  });

  patchMenu();
  const observer = new MutationObserver(patchMenu);
  observer.observe(document.documentElement, { childList: true, subtree: true });
})();