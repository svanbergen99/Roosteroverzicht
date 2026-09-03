(() => {
  "use strict";

  let closePending = false;

  function isLibraryPlayer(target) {
    return target instanceof HTMLVideoElement && target.matches("#videoLibraryPlayerSection .video-library-player");
  }

  function closePlayerSoon() {
    if (closePending) return;
    closePending = true;
    window.setTimeout(() => {
      closePending = false;
      try { window.RoosterVideoLibrary?.close?.(); } catch (_) {}
    }, 0);
  }

  document.addEventListener("ended", (event) => {
    if (!isLibraryPlayer(event.target)) return;
    closePlayerSoon();
  }, true);

  document.addEventListener("timeupdate", (event) => {
    const player = event.target;
    if (!isLibraryPlayer(player) || player.paused || player.ended) return;

    const endInput = document.getElementById("videoLibraryEnd");
    const end = Number(endInput?.value);
    if (!Number.isFinite(end) || end <= 0) return;

    if (player.currentTime >= end - 0.04) closePlayerSoon();
  }, true);
})();
