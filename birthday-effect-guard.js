(() => {
  "use strict";

  const effects = window.RoosterEffects;
  if (!effects?.start || window.__roosterBirthdayEffectGuard) return;
  window.__roosterBirthdayEffectGuard = true;

  const originalStart = effects.start.bind(effects);

  function birthdayVideoIsPlaying() {
    const player = document.querySelector("#videoLibraryPlayerSection .video-library-player");
    if (!(player instanceof HTMLVideoElement) || player.paused || player.ended) return false;
    let source = player.currentSrc || player.src || "";
    try { source = decodeURIComponent(source); } catch (_) {}
    return /(?:^|\/)(?:verjaardag|[^/]*birthday[^/]*)\.mp4(?:[?#]|$)/i.test(source);
  }

  effects.start = function guardedEffectStart(type) {
    if (String(type || "") === "birthday" && !birthdayVideoIsPlaying()) return;
    return originalStart(type);
  };
})();
