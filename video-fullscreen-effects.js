(() => {
  "use strict";

  const SECTION_ID = "videoLibraryPlayerSection";
  const STYLE_ID = "videoFullscreenEffectsStyle";
  const BUTTON_ATTR = "data-video-effect-fullscreen";
  const EFFECT_SELECTOR = ".effect-canvas, #paydayEffectOverlay";

  let popupGeometryBeforeFullscreen = null;

  function getSection() {
    return document.getElementById(SECTION_ID);
  }

  function getFullscreenElement() {
    return document.fullscreenElement || document.webkitFullscreenElement || null;
  }

  function isOurFullscreen(section = getSection()) {
    return Boolean(section && getFullscreenElement() === section);
  }

  function rememberPopupGeometry(section) {
    if (!section) return;
    const rect = section.getBoundingClientRect();
    popupGeometryBeforeFullscreen = {
      width: rect.width,
      height: rect.height,
      left: rect.left,
      top: rect.top
    };
  }

  function restorePopupGeometry(section) {
    if (!section || !popupGeometryBeforeFullscreen || window.innerWidth <= 620) return;
    const geometry = popupGeometryBeforeFullscreen;
    section.style.width = `${Math.round(geometry.width)}px`;
    section.style.height = `${Math.round(geometry.height)}px`;
    section.style.left = `${Math.round(geometry.left)}px`;
    section.style.top = `${Math.round(geometry.top)}px`;
  }

  function effectNodes(root = document) {
    return [...root.querySelectorAll(EFFECT_SELECTOR)];
  }

  function moveEffectsIntoFullscreen(section) {
    if (!section) return;
    for (const effect of effectNodes(document)) {
      if (!section.contains(effect)) section.appendChild(effect);
    }
  }

  function restoreEffectsToPage(section) {
    if (!section) return;
    for (const effect of effectNodes(section)) {
      document.body.appendChild(effect);
    }
  }

  function setButtonState(section) {
    const button = section?.querySelector(`[${BUTTON_ATTR}]`);
    if (!button) return;
    const active = isOurFullscreen(section);
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-pressed", String(active));
    button.setAttribute("aria-label", active ? "Fullscreen afsluiten" : "Fullscreen met effecten");
    button.title = active ? "Fullscreen afsluiten" : "Fullscreen met effecten";
    button.textContent = active ? "⤢" : "⛶";
  }

  async function enterFullscreen(section) {
    if (!section || section.hidden || isOurFullscreen(section)) return;
    rememberPopupGeometry(section);
    moveEffectsIntoFullscreen(section);

    try {
      if (typeof section.requestFullscreen === "function") {
        await section.requestFullscreen({ navigationUI: "hide" });
      } else if (typeof section.webkitRequestFullscreen === "function") {
        section.webkitRequestFullscreen();
      } else {
        throw new Error("Fullscreen wordt niet ondersteund door deze browser.");
      }
    } catch (error) {
      restoreEffectsToPage(section);
      console.warn("Fullscreen met effecten kon niet worden geopend.", error);
    }
  }

  async function exitFullscreen() {
    try {
      if (document.fullscreenElement && typeof document.exitFullscreen === "function") {
        await document.exitFullscreen();
      } else if (document.webkitFullscreenElement && typeof document.webkitExitFullscreen === "function") {
        document.webkitExitFullscreen();
      }
    } catch (_) {}
  }

  function toggleFullscreen(section) {
    if (isOurFullscreen(section)) exitFullscreen();
    else enterFullscreen(section);
  }

  function ensureStyle() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
      #${SECTION_ID} .video-library-fullscreen-effects {
        display: inline-grid;
        place-items: center;
        width: 36px;
        height: 36px;
        padding: 0;
        border: 1px solid var(--line);
        border-radius: 10px;
        background: #fff;
        color: var(--accent-dark);
        font: inherit;
        font-size: 18px;
        font-weight: 1000;
        line-height: 1;
        cursor: pointer !important;
      }

      #${SECTION_ID} .video-library-fullscreen-effects:hover,
      #${SECTION_ID} .video-library-fullscreen-effects.is-active {
        background: var(--soft-accent);
        border-color: #bca9ba;
      }

      html[data-theme="dark"] #${SECTION_ID} .video-library-fullscreen-effects {
        border-color: #465263;
        background: #1f2937;
        color: #f0b5e8;
      }

      #${SECTION_ID} .video-library-player::-webkit-media-controls-fullscreen-button {
        display: none !important;
      }

      #${SECTION_ID}:fullscreen,
      #${SECTION_ID}:-webkit-full-screen {
        position: fixed !important;
        inset: 0 !important;
        width: 100vw !important;
        height: 100vh !important;
        min-width: 0 !important;
        min-height: 0 !important;
        max-width: none !important;
        max-height: none !important;
        margin: 0 !important;
        padding: 0 !important;
        border: 0 !important;
        border-radius: 0 !important;
        box-shadow: none !important;
        resize: none !important;
        overflow: hidden !important;
        background: #000 !important;
      }

      #${SECTION_ID}:fullscreen::after,
      #${SECTION_ID}:-webkit-full-screen::after {
        display: none !important;
      }

      #${SECTION_ID}:fullscreen > .video-library-player,
      #${SECTION_ID}:-webkit-full-screen > .video-library-player {
        position: absolute !important;
        inset: 0 !important;
        z-index: 1 !important;
        width: 100% !important;
        height: 100% !important;
        max-width: none !important;
        max-height: none !important;
        margin: 0 !important;
        border: 0 !important;
        border-radius: 0 !important;
        aspect-ratio: auto !important;
        object-fit: contain !important;
        background: #000 !important;
      }

      #${SECTION_ID}:fullscreen > :not(.video-library-player):not(.video-library-player-head):not(.effect-canvas):not(#paydayEffectOverlay),
      #${SECTION_ID}:-webkit-full-screen > :not(.video-library-player):not(.video-library-player-head):not(.effect-canvas):not(#paydayEffectOverlay) {
        display: none !important;
      }

      #${SECTION_ID}:fullscreen .video-library-player-head,
      #${SECTION_ID}:-webkit-full-screen .video-library-player-head {
        position: absolute !important;
        top: 12px !important;
        right: 12px !important;
        left: auto !important;
        z-index: 10650 !important;
        display: flex !important;
        width: auto !important;
        padding: 0 !important;
        background: transparent !important;
        box-shadow: none !important;
        backdrop-filter: none !important;
        cursor: default !important;
      }

      #${SECTION_ID}:fullscreen .video-library-player-title-wrap,
      #${SECTION_ID}:-webkit-full-screen .video-library-player-title-wrap,
      #${SECTION_ID}:fullscreen .video-library-size-save,
      #${SECTION_ID}:-webkit-full-screen .video-library-size-save,
      #${SECTION_ID}:fullscreen .video-library-document-pip,
      #${SECTION_ID}:-webkit-full-screen .video-library-document-pip,
      #${SECTION_ID}:fullscreen .video-library-close,
      #${SECTION_ID}:-webkit-full-screen .video-library-close {
        display: none !important;
      }

      #${SECTION_ID}:fullscreen .video-library-window-actions,
      #${SECTION_ID}:-webkit-full-screen .video-library-window-actions {
        display: flex !important;
        justify-content: flex-end !important;
      }

      #${SECTION_ID}:fullscreen .video-library-fullscreen-effects,
      #${SECTION_ID}:-webkit-full-screen .video-library-fullscreen-effects {
        display: inline-grid !important;
        width: 44px !important;
        height: 44px !important;
        border-color: rgba(255,255,255,.42) !important;
        background: rgba(0,0,0,.58) !important;
        color: #fff !important;
        box-shadow: 0 6px 24px rgba(0,0,0,.25) !important;
      }

      #${SECTION_ID}:fullscreen > .effect-canvas,
      #${SECTION_ID}:-webkit-full-screen > .effect-canvas,
      #${SECTION_ID}:fullscreen > #paydayEffectOverlay,
      #${SECTION_ID}:-webkit-full-screen > #paydayEffectOverlay {
        position: fixed !important;
        inset: 0 !important;
        z-index: 10550 !important;
        width: 100vw !important;
        height: 100vh !important;
        pointer-events: none !important;
      }
    `;
    document.head.appendChild(style);
  }

  function suppressNativeFullscreen(player) {
    if (!player) return;
    try {
      player.controlsList?.add?.("nofullscreen");
    } catch (_) {}

    const tokens = new Set(String(player.getAttribute("controlslist") || "").split(/\s+/).filter(Boolean));
    tokens.add("nofullscreen");
    player.setAttribute("controlslist", [...tokens].join(" "));
  }

  function install(section) {
    if (!section) return;
    const player = section.querySelector(".video-library-player");
    suppressNativeFullscreen(player);

    const head = section.querySelector(".video-library-player-head");
    const close = head?.querySelector("[data-video-close]");
    if (!head || !close) return;

    let actions = head.querySelector(".video-library-window-actions");
    if (!actions) {
      actions = document.createElement("div");
      actions.className = "video-library-window-actions";
      close.before(actions);
      actions.appendChild(close);
    }

    let button = actions.querySelector(`[${BUTTON_ATTR}]`);
    if (!button) {
      button = document.createElement("button");
      button.type = "button";
      button.className = "video-library-fullscreen-effects";
      button.setAttribute(BUTTON_ATTR, "true");
      button.setAttribute("aria-pressed", "false");
      button.setAttribute("aria-label", "Fullscreen met effecten");
      button.title = "Fullscreen met effecten";
      button.textContent = "⛶";
      actions.insertBefore(button, actions.firstChild);
      button.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        toggleFullscreen(section);
      });
    }

    setButtonState(section);
  }

  function findAndInstall() {
    const section = getSection();
    if (section) install(section);
  }

  function handleFullscreenChange() {
    const section = getSection();
    if (!section) return;

    if (isOurFullscreen(section)) {
      moveEffectsIntoFullscreen(section);
    } else {
      restoreEffectsToPage(section);
      restorePopupGeometry(section);
    }
    setButtonState(section);
  }

  function handleAddedNodes(records) {
    const section = getSection();
    if (!section || !isOurFullscreen(section)) return;

    let shouldMove = false;
    for (const record of records) {
      for (const node of record.addedNodes) {
        if (!(node instanceof Element)) continue;
        if (node.matches?.(EFFECT_SELECTOR) || node.querySelector?.(EFFECT_SELECTOR)) {
          shouldMove = true;
          break;
        }
      }
      if (shouldMove) break;
    }
    if (shouldMove) moveEffectsIntoFullscreen(section);
  }

  ensureStyle();
  findAndInstall();

  const observer = new MutationObserver((records) => {
    findAndInstall();
    handleAddedNodes(records);
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });

  document.addEventListener("fullscreenchange", handleFullscreenChange);
  document.addEventListener("webkitfullscreenchange", handleFullscreenChange);

  document.addEventListener("ended", (event) => {
    if (!(event.target instanceof HTMLVideoElement)) return;
    if (!event.target.matches(`#${SECTION_ID} .video-library-player`)) return;
    if (isOurFullscreen()) exitFullscreen();
  }, true);

  window.RoosterVideoEffectFullscreen = Object.freeze({
    enter: () => enterFullscreen(getSection()),
    exit: exitFullscreen,
    toggle: () => toggleFullscreen(getSection()),
    active: () => isOurFullscreen(getSection())
  });
})();
