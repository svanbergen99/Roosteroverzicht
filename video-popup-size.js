(() => {
  "use strict";

  const SECTION_ID = "videoLibraryPlayerSection";
  const STORAGE_KEY = "roosteroverzicht.videoPopupSize.v1";
  const STYLE_ID = "videoPopupSizeStyle";
  const SAVE_BUTTON_ATTR = "data-video-window-save";
  const MIN_WIDTH = 420;
  const MIN_HEIGHT = 360;
  const VIEWPORT_GAP = 16;

  function isLibraryVideo(element) {
    return element instanceof HTMLVideoElement && element.matches(`#${SECTION_ID} .video-library-player`);
  }

  function blockAutomaticFullscreen() {
    if (!window.__roosterVideoFullscreenBlocked) {
      window.__roosterVideoFullscreenBlocked = true;

      try {
        const nativeRequestFullscreen = Element.prototype.requestFullscreen;
        if (typeof nativeRequestFullscreen === "function") {
          Element.prototype.requestFullscreen = function (...args) {
            if (isLibraryVideo(this)) return Promise.resolve();
            return nativeRequestFullscreen.apply(this, args);
          };
        }
      } catch (_) {}

      try {
        const proto = HTMLVideoElement.prototype;
        const nativeWebkitEnterFullscreen = proto.webkitEnterFullscreen;
        if (typeof nativeWebkitEnterFullscreen === "function") {
          proto.webkitEnterFullscreen = function (...args) {
            if (isLibraryVideo(this)) return undefined;
            return nativeWebkitEnterFullscreen.apply(this, args);
          };
        }
      } catch (_) {}
    }
  }

  function ensureStyle() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
      #${SECTION_ID}.video-library-resizable-popup {
        position: fixed !important;
        z-index: 10040 !important;
        margin: 0 !important;
        box-sizing: border-box;
        resize: both;
        overflow: auto;
        min-width: ${MIN_WIDTH}px;
        min-height: ${MIN_HEIGHT}px;
        max-width: calc(100vw - ${VIEWPORT_GAP}px);
        max-height: calc(100vh - ${VIEWPORT_GAP}px);
        box-shadow: 0 28px 80px rgba(15, 23, 42, .34), 0 0 0 1px rgba(255,255,255,.6);
        overscroll-behavior: contain;
      }

      #${SECTION_ID}.video-library-resizable-popup .video-library-player-head {
        position: sticky;
        top: 0;
        z-index: 4;
        grid-template-columns: minmax(0, 1fr) auto;
        padding: 6px 6px 11px;
        background: inherit;
        backdrop-filter: blur(10px);
        cursor: move;
        cursor: grab;
        user-select: none;
        touch-action: none;
      }

      #${SECTION_ID}.video-library-resizable-popup.is-dragging .video-library-player-head {
        cursor: grabbing;
      }

      #${SECTION_ID}.video-library-resizable-popup .video-library-window-actions,
      #${SECTION_ID}.video-library-resizable-popup .video-library-window-actions * {
        cursor: default;
      }

      #${SECTION_ID}.video-library-resizable-popup .video-library-window-actions {
        display: flex;
        align-items: center;
        gap: 6px;
      }

      #${SECTION_ID}.video-library-resizable-popup .video-library-size-save,
      #${SECTION_ID}.video-library-resizable-popup .video-library-close {
        flex: 0 0 auto;
        width: 36px;
        height: 36px;
      }

      #${SECTION_ID}.video-library-resizable-popup .video-library-size-save {
        display: inline-grid;
        place-items: center;
        padding: 0;
        border: 1px solid var(--line);
        border-radius: 10px;
        background: #fff;
        color: var(--accent-dark);
        font: inherit;
        font-size: 17px;
        font-weight: 1000;
        cursor: pointer !important;
      }

      #${SECTION_ID}.video-library-resizable-popup .video-library-close {
        cursor: pointer !important;
      }

      #${SECTION_ID}.video-library-resizable-popup .video-library-size-save:hover,
      #${SECTION_ID}.video-library-resizable-popup .video-library-size-save.is-saved {
        background: var(--soft-accent);
        border-color: #bca9ba;
      }

      #${SECTION_ID}.video-library-resizable-popup .video-library-player {
        width: 100%;
        max-height: none;
        aspect-ratio: 16 / 9;
        object-fit: contain;
      }

      #${SECTION_ID}.video-library-resizable-popup::after {
        content: "↘";
        position: sticky;
        float: right;
        right: 2px;
        bottom: 0;
        display: grid;
        place-items: center;
        width: 22px;
        height: 22px;
        margin: -16px -7px -7px 0;
        color: var(--muted);
        font-size: 14px;
        pointer-events: none;
        opacity: .72;
      }

      html[data-theme="dark"] #${SECTION_ID}.video-library-resizable-popup .video-library-size-save {
        border-color: #465263;
        background: #1f2937;
        color: #f0b5e8;
      }

      html[data-theme="dark"] #${SECTION_ID}.video-library-resizable-popup .video-library-size-save:hover,
      html[data-theme="dark"] #${SECTION_ID}.video-library-resizable-popup .video-library-size-save.is-saved {
        background: #302633;
      }

      @media (max-width: 620px) {
        #${SECTION_ID}.video-library-resizable-popup {
          top: 8px !important;
          left: 8px !important;
          width: calc(100vw - 16px) !important;
          height: calc(100vh - 16px) !important;
          min-width: 0;
          min-height: 0;
          max-width: none;
          max-height: none;
          resize: none;
        }
        #${SECTION_ID}.video-library-resizable-popup .video-library-player-head {
          cursor: default;
          touch-action: auto;
        }
        #${SECTION_ID}.video-library-resizable-popup::after { display: none; }
      }
    `;
    document.head.appendChild(style);
  }

  function readSavedGeometry() {
    try {
      const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
      if (!parsed || !Number.isFinite(parsed.width) || !Number.isFinite(parsed.height)) return null;
      return parsed;
    } catch (_) {
      return null;
    }
  }

  function viewportBounds() {
    return {
      width: Math.max(280, window.innerWidth - VIEWPORT_GAP * 2),
      height: Math.max(260, window.innerHeight - VIEWPORT_GAP * 2)
    };
  }

  function clampedSize(size) {
    const bounds = viewportBounds();
    const fallbackWidth = Math.min(900, bounds.width);
    const fallbackHeight = Math.min(760, bounds.height);
    return {
      width: Math.min(bounds.width, Math.max(Math.min(MIN_WIDTH, bounds.width), Number(size?.width) || fallbackWidth)),
      height: Math.min(bounds.height, Math.max(Math.min(MIN_HEIGHT, bounds.height), Number(size?.height) || fallbackHeight))
    };
  }

  function clampedPosition(position, width, height) {
    const maxLeft = Math.max(VIEWPORT_GAP, window.innerWidth - width - VIEWPORT_GAP);
    const maxTop = Math.max(VIEWPORT_GAP, window.innerHeight - height - VIEWPORT_GAP);
    const fallbackLeft = Math.max(VIEWPORT_GAP, Math.round((window.innerWidth - width) / 2));
    const fallbackTop = Math.max(VIEWPORT_GAP, Math.round((window.innerHeight - height) / 2));
    return {
      left: Math.min(maxLeft, Math.max(VIEWPORT_GAP, Number.isFinite(position?.left) ? position.left : fallbackLeft)),
      top: Math.min(maxTop, Math.max(VIEWPORT_GAP, Number.isFinite(position?.top) ? position.top : fallbackTop))
    };
  }

  function applyGeometry(section, geometry) {
    if (!section || window.innerWidth <= 620) return;
    const size = clampedSize(geometry);
    const position = clampedPosition(geometry, size.width, size.height);
    section.style.width = `${Math.round(size.width)}px`;
    section.style.height = `${Math.round(size.height)}px`;
    section.style.left = `${Math.round(position.left)}px`;
    section.style.top = `${Math.round(position.top)}px`;
  }

  function applySavedGeometry(section) {
    applyGeometry(section, readSavedGeometry());
  }

  function saveCurrentGeometry(section, button) {
    if (!section || window.innerWidth <= 620) return;
    const rect = section.getBoundingClientRect();
    const size = clampedSize({ width: rect.width, height: rect.height });
    const position = clampedPosition({ left: rect.left, top: rect.top }, size.width, size.height);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        width: Math.round(size.width),
        height: Math.round(size.height),
        left: Math.round(position.left),
        top: Math.round(position.top)
      }));
    } catch (_) {}

    if (button) {
      button.classList.add("is-saved");
      button.textContent = "✓";
      button.title = `Formaat en positie opgeslagen: ${Math.round(size.width)} × ${Math.round(size.height)} px`;
      window.setTimeout(() => {
        button.classList.remove("is-saved");
        button.textContent = "V";
        button.title = "Huidig formaat en positie opslaan";
      }, 1100);
    }
  }

  function keepInsideViewport(section) {
    if (!section || section.hidden || window.innerWidth <= 620) return;
    const rect = section.getBoundingClientRect();
    applyGeometry(section, {
      width: rect.width,
      height: rect.height,
      left: rect.left,
      top: rect.top
    });
  }

  function enableDragging(section, head) {
    if (!section || !head || head.dataset.videoPopupDragReady === "true") return;
    head.dataset.videoPopupDragReady = "true";

    let drag = null;

    head.addEventListener("pointerdown", (event) => {
      if (window.innerWidth <= 620 || event.button !== 0) return;
      if (event.target.closest(".video-library-window-actions, button, input, select, textarea, a")) return;

      const rect = section.getBoundingClientRect();
      drag = {
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        left: rect.left,
        top: rect.top,
        width: rect.width,
        height: rect.height
      };

      section.classList.add("is-dragging");
      try { head.setPointerCapture(event.pointerId); } catch (_) {}
      event.preventDefault();
    });

    head.addEventListener("pointermove", (event) => {
      if (!drag || drag.pointerId !== event.pointerId) return;
      const next = clampedPosition({
        left: drag.left + event.clientX - drag.startX,
        top: drag.top + event.clientY - drag.startY
      }, drag.width, drag.height);
      section.style.left = `${Math.round(next.left)}px`;
      section.style.top = `${Math.round(next.top)}px`;
      event.preventDefault();
    });

    function stopDrag(event) {
      if (!drag || (event && drag.pointerId !== event.pointerId)) return;
      try { head.releasePointerCapture(drag.pointerId); } catch (_) {}
      drag = null;
      section.classList.remove("is-dragging");
    }

    head.addEventListener("pointerup", stopDrag);
    head.addEventListener("pointercancel", stopDrag);
    head.addEventListener("lostpointercapture", () => {
      drag = null;
      section.classList.remove("is-dragging");
    });
  }

  function install(section) {
    if (!section || section.dataset.videoPopupSizeReady === "true") return;
    section.dataset.videoPopupSizeReady = "true";
    section.classList.add("video-library-resizable-popup");

    const head = section.querySelector(".video-library-player-head");
    const close = head?.querySelector("[data-video-close]");
    if (head && close) {
      let actions = head.querySelector(".video-library-window-actions");
      if (!actions) {
        actions = document.createElement("div");
        actions.className = "video-library-window-actions";
        close.before(actions);
        actions.appendChild(close);
      }

      let saveButton = actions.querySelector(`[${SAVE_BUTTON_ATTR}]`);
      if (!saveButton) {
        saveButton = document.createElement("button");
        saveButton.type = "button";
        saveButton.className = "video-library-size-save";
        saveButton.setAttribute(SAVE_BUTTON_ATTR, "true");
        saveButton.setAttribute("aria-label", "Huidig formaat en positie opslaan");
        saveButton.title = "Huidig formaat en positie opslaan";
        saveButton.textContent = "V";
        actions.insertBefore(saveButton, close);
        saveButton.addEventListener("click", () => saveCurrentGeometry(section, saveButton));
      }

      enableDragging(section, head);
    }

    const observer = new MutationObserver(() => {
      if (!section.hidden) requestAnimationFrame(() => applySavedGeometry(section));
    });
    observer.observe(section, { attributes: true, attributeFilter: ["hidden"] });

    if (!section.hidden) applySavedGeometry(section);
  }

  function findAndInstall() {
    const section = document.getElementById(SECTION_ID);
    if (section) install(section);
  }

  blockAutomaticFullscreen();
  ensureStyle();
  findAndInstall();

  const bodyObserver = new MutationObserver(findAndInstall);
  bodyObserver.observe(document.documentElement, { childList: true, subtree: true });

  window.addEventListener("resize", () => {
    const section = document.getElementById(SECTION_ID);
    keepInsideViewport(section);
  });
})();