(() => {
  "use strict";

  if (window.__roosterVideoSectionFullscreenGuardInstalled) return;
  window.__roosterVideoSectionFullscreenGuardInstalled = true;

  const PLAYER_SELECTOR = "#videoLibraryPlayerSection .video-library-player";
  const SECTION_ID = "videoLibraryPlayerSection";
  const PAYDAY_OVERLAY_ID = "paydayEffectOverlay";
  const FALLBACK_CLASS = "video-library-auto-fullscreen-fallback";

  const nativeRequestFullscreen = Element.prototype.requestFullscreen;

  if (typeof nativeRequestFullscreen === "function") {
    Element.prototype.requestFullscreen = function rosterSectionFullscreen(options) {
      if (this instanceof HTMLVideoElement && this.matches?.(PLAYER_SELECTOR)) {
        const section = document.getElementById(SECTION_ID);
        if (section && !section.hidden) {
          return nativeRequestFullscreen.call(section, options);
        }
      }
      return nativeRequestFullscreen.call(this, options);
    };
  }

  function isPaydaySource(player) {
    let source = String(player?.currentSrc || player?.src || "");
    try { source = decodeURIComponent(source); } catch (_) {}
    return /(?:^|\/)(?:[^/]*payday[^/]*)\.mp4(?:[?#]|$)/i.test(source);
  }

  function keepPaydayOverlayWithVideo() {
    const section = document.getElementById(SECTION_ID);
    let overlay = document.getElementById(PAYDAY_OVERLAY_ID);

    if (!overlay) {
      window.RoosterPaydayEffect?.start?.();
      overlay = document.getElementById(PAYDAY_OVERLAY_ID);
    }

    window.RoosterPaydayStaticScene?.show?.();

    const nativeFullscreen = document.fullscreenElement === section || document.webkitFullscreenElement === section;
    const fallbackFullscreen = section?.classList.contains(FALLBACK_CLASS);
    if (overlay && section && (nativeFullscreen || fallbackFullscreen) && overlay.parentElement !== section) {
      section.appendChild(overlay);
    }
  }

  document.addEventListener("play", (event) => {
    const player = event.target;
    if (!(player instanceof HTMLVideoElement) || !player.matches(PLAYER_SELECTOR) || !isPaydaySource(player)) return;

    // video-effect-sync.js start dezelfde Payday-melding al. Deze controle zorgt
    // ervoor dat hij ook echt aanwezig is én binnen dezelfde fullscreen-sectie
    // terechtkomt wanneer Payday.mp4 handmatig of automatisch wordt gestart.
    window.setTimeout(keepPaydayOverlayWithVideo, 0);
    window.setTimeout(keepPaydayOverlayWithVideo, 120);
  }, true);

  document.addEventListener("fullscreenchange", () => {
    const player = document.querySelector(PLAYER_SELECTOR);
    if (player instanceof HTMLVideoElement && !player.paused && isPaydaySource(player)) keepPaydayOverlayWithVideo();
  });

  document.addEventListener("webkitfullscreenchange", () => {
    const player = document.querySelector(PLAYER_SELECTOR);
    if (player instanceof HTMLVideoElement && !player.paused && isPaydaySource(player)) keepPaydayOverlayWithVideo();
  });
})();
