(() => {
  "use strict";

  const effects = window.RoosterEffects;
  if (!effects?.start || window.__roosterBirthdayEffectGuard) return;
  window.__roosterBirthdayEffectGuard = true;

  const originalStart = effects.start.bind(effects);
  const PLAYER_SELECTOR = "#videoLibraryPlayerSection .video-library-player";

  function birthdayVideoIsPlaying() {
    const player = document.querySelector(PLAYER_SELECTOR);
    if (!(player instanceof HTMLVideoElement) || player.paused || player.ended) return false;
    let source = player.currentSrc || player.src || "";
    try { source = decodeURIComponent(source); } catch (_) {}
    return /(?:^|\/)(?:verjaardag|[^/]*birthday[^/]*)\.mp4(?:[?#]|$)/i.test(source);
  }

  function removeUnauthorizedBirthdayScene() {
    const overlay = document.getElementById("holidaySceneOverlay");
    if (overlay?.dataset.scene === "birthday" && !birthdayVideoIsPlaying()) overlay.remove();
  }

  effects.start = function guardedEffectStart(type) {
    if (String(type || "") === "birthday" && !birthdayVideoIsPlaying()) return;
    return originalStart(type);
  };

  const observer = new MutationObserver(removeUnauthorizedBirthdayScene);
  observer.observe(document.documentElement, { childList: true, subtree: true });

  for (const eventName of ["ended", "pause", "emptied", "abort"]) {
    document.addEventListener(eventName, (event) => {
      if (!(event.target instanceof HTMLVideoElement) || !event.target.matches(PLAYER_SELECTOR)) return;
      window.setTimeout(removeUnauthorizedBirthdayScene, 0);
    }, true);
  }
})();
