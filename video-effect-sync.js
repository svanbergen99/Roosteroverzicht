(() => {
  "use strict";

  const PLAYER_SELECTOR = "#videoLibraryPlayerSection .video-library-player";
  const playedSource = new WeakMap();

  function normalizedSource(value) {
    let text = String(value || "");
    try { text = decodeURIComponent(text); } catch (_) {}
    return text.toLocaleLowerCase("nl-NL");
  }

  function effectForSource(value) {
    const text = normalizedSource(value);

    if (/nieuwjaar\.mp4(?:[?#]|$)/i.test(text)) return "fireworks";
    if (/happy_eastern_fijne_pasen_soft\.mp4(?:[?#]|$)/i.test(text)) return "easter";
    if (/netherlands koningsdag\.mp4(?:[?#]|$)/i.test(text)) return "orange";
    if (/happy mother's day! - animated card\.mp4(?:[?#]|$)/i.test(text)) return "hearts-petals";
    if (/vaderdag\.mp4(?:[?#]|$)/i.test(text)) return "hearts-petals";
    if (/halloween\.mp4(?:[?#]|$)/i.test(text)) return "halloween";
    if (/sinterklaas\.mp4(?:[?#]|$)/i.test(text)) return "sinterklaas";
    if (/kerst\.mp4(?:[?#]|$)/i.test(text)) return "christmas-snow";
    if (/verjaardag\.mp4(?:[?#]|$)/i.test(text)) return "birthday";
    if (/payday\.mp4(?:[?#]|$)/i.test(text)) return "payday";

    if (/christmas|kerst|xmas/.test(text)) return "christmas-snow";
    if (/sinterklaas|sint[-_ ]?nicolaas|st[-_ ]?nicholas/.test(text)) return "sinterklaas";
    if (/easter|pasen|bunny|eastern/.test(text)) return "easter";
    if (/koningsdag|king.?s?[-_ ]?day|oranje/.test(text)) return "orange";
    if (/mother.?s?[-_ ]?day|moederdag/.test(text)) return "hearts-petals";
    if (/father.?s?[-_ ]?day|vaderdag/.test(text)) return "hearts-petals";
    if (/valentijn|valentine|romantic|love/.test(text)) return "hearts-petals";
    if (/halloween|witch|spooky|creepy/.test(text)) return "halloween";
    if (/birthday|verjaardag/.test(text)) return "birthday";
    if (/payday|pay[-_ ]?day|ching[-_ ]?ching/.test(text)) return "payday";
    if (/oud.?en.?nieuw|new[-_ ]?year|nieuwjaar|oudjaar/.test(text)) return "fireworks";
    return "";
  }

  function playLinkedEffect(effect) {
    if (!effect) return;

    if (effect === "payday") {
      window.RoosterBirthdayScene?.hide?.();
      window.RoosterPaydayEffect?.start?.();
      window.RoosterHolidayEffects?.playForVideo?.("fireworks");
      // Vuurwerk mag de vaste Payday-onderscène niet vervangen.
      window.RoosterPaydayStaticScene?.show?.();
      return;
    }

    window.RoosterPaydayEffect?.stop?.();

    if (effect === "birthday") {
      if (window.RoosterBirthdayScene?.show) {
        window.RoosterBirthdayScene.show(true);
      } else if (window.RoosterHolidayEffects?.playForVideo) {
        window.RoosterHolidayEffects.playForVideo("birthday");
      } else {
        window.RoosterEffects?.start?.("birthday");
      }
      return;
    }

    window.RoosterBirthdayScene?.hide?.();
    if (window.RoosterHolidayEffects?.playForVideo) {
      window.RoosterHolidayEffects.playForVideo(effect);
    } else {
      window.RoosterEffects?.start?.(effect);
    }
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

    playLinkedEffect(effectForSource(source));
  }, true);

  window.RoosterVideoEffectSync = Object.freeze({ effectForSource, playLinkedEffect });
})();