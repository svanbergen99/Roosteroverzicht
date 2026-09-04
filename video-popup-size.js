(() => {
  "use strict";

  const SECTION_ID = "videoLibraryPlayerSection";
  const OLD_STORAGE_KEY = "roosteroverzicht.videoPopupSize.v1";
  const STYLE_ID = "videoPlayerLockStyle";

  function isLibraryVideo(element) {
    return element instanceof HTMLVideoElement && element.matches(`#${SECTION_ID} .video-library-player`);
  }

  // video-library-ui.js bevat nog een oude automatische fullscreen-aanroep op
  // het <video>-element. Die moet geblokkeerd blijven zodat alleen de speciale
  // fullscreen-met-effecten functie de volledige videosectie fullscreen maakt.
  function blockLegacyVideoFullscreen() {
    if (window.__roosterVideoFullscreenBlocked) return;
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

  function ensureLockedStyle() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
      #${SECTION_ID} {
        resize: none !important;
      }
      #${SECTION_ID}::after,
      #${SECTION_ID} .video-library-size-save,
      #${SECTION_ID} [data-video-window-save],
      #${SECTION_ID} .video-library-trim-control,
      #${SECTION_ID} .video-library-trim-actions,
      #${SECTION_ID} [data-video-trim-save],
      #${SECTION_ID} [data-video-preview-selection],
      #${SECTION_ID} [data-video-exact-12] {
        display: none !important;
      }
      #${SECTION_ID} .video-library-player-head {
        cursor: default !important;
        touch-action: auto !important;
        user-select: auto !important;
      }
    `;
    document.head.appendChild(style);
  }

  function cleanSection(section) {
    if (!section) return;
    section.classList.remove("video-library-resizable-popup", "is-dragging");
    section.style.removeProperty("width");
    section.style.removeProperty("height");
    section.style.removeProperty("left");
    section.style.removeProperty("top");
    section.querySelectorAll(".video-library-size-save, [data-video-window-save]").forEach((node) => node.remove());
  }

  try { localStorage.removeItem(OLD_STORAGE_KEY); } catch (_) {}

  blockLegacyVideoFullscreen();
  ensureLockedStyle();
  cleanSection(document.getElementById(SECTION_ID));

  const observer = new MutationObserver(() => cleanSection(document.getElementById(SECTION_ID)));
  observer.observe(document.documentElement, { childList: true, subtree: true });
})();
