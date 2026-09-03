(() => {
  "use strict";

  const PLAYER_SELECTOR = "#videoLibraryPlayerSection .video-library-player";
  const playedSource = new WeakMap();

  function effectForSource(value) {
    let text = String(value || "");
    try { text = decodeURIComponent(text); } catch (_) {}
    text = text.toLocaleLowerCase("nl-NL");

    if (/christmas|kerst|xmas/.test(text)) return "christmas-snow";
    if (/sinterklaas|sint[-_ ]?nicolaas|st[-_ ]?nicholas/.test(text)) return "sinterklaas";
    if (/easter|pasen|bunny|eastern/.test(text)) return "easter";
    if (/koningsdag|king.?s?[-_ ]?day|oranje/.test(text)) return "orange";
    if (/mother.?s?[-_ ]?day|moederdag/.test(text)) return "hearts-petals";
    if (/father.?s?[-_ ]?day|vaderdag/.test(text)) return "hearts-petals";
    if (/valentijn|valentine|romantic|love/.test(text)) return "hearts-petals";
    if (/halloween|witch|spooky|creepy/.test(text)) return "halloween";
    if (/birthday|verjaardag/.test(text)) return "birthday";
    if (/oud.?en.?nieuw|new[-_ ]?year|nieuwjaar|oudjaar/.test(text)) return "fireworks";
    return "";
  }

  document.addEventListener("loadstart", (event) => {
    if (!(event.target instanceof HTMLVideoElement) || !event.target.matches(PLAYER_SELECTOR)) return;
    playedSource.delete(event.target);
  }, true);

  document.addEventListener("play", (event) => {
    const player = event.target;
    if (!(player instanceof HTMLVideoElement) || !player.matches(PLAYER_SELECTOR)) return;

    const source = player.currentSrc || player.src || "";
    if (!source || playedSource.get(player) === source) return;
    playedSource.set(player, source);

    const effect = effectForSource(source);
    if (!effect) return;

    if (window.RoosterHolidayEffects?.playForVideo) {
      window.RoosterHolidayEffects.playForVideo(effect);
    } else {
      window.RoosterEffects?.start?.(effect);
    }
  }, true);

  window.RoosterVideoEffectSync = Object.freeze({ effectForSource });
})();