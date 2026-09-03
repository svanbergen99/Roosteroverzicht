(() => {
  "use strict";

  const TRACKS = Object.freeze([
    "mixkit-magical-coin-win-1936.mp3",
    "mixkit-clinking-coins-1993.mp3"
  ]);

  function makeAudio(src) {
    const audio = new Audio(src);
    audio.preload = "auto";
    return audio;
  }

  const players = TRACKS.map(makeAudio);
  players.forEach((audio) => {
    try { audio.load(); } catch (_) {}
  });

  function stopAudio() {
    for (const audio of players) {
      try {
        audio.pause();
        audio.currentTime = 0;
      } catch (_) {}
    }
  }

  function playTogether() {
    stopAudio();
    for (const audio of players) {
      try { audio.currentTime = 0; } catch (_) {}
    }

    // Beide vooraf geladen MP3-tracks worden in dezelfde klikactie gestart,
    // zodat ze zo gelijk mogelijk vanaf 0:00 over elkaar heen spelen.
    for (const audio of players) {
      audio.play().catch(() => {});
    }
  }

  document.addEventListener("click", (event) => {
    if (event.target.closest?.("#paydayEffectMenuItem")) {
      playTogether();
      return;
    }

    // Een ander effect of 'Effect stoppen' stopt beide Payday-tracks.
    if (event.target.closest?.("[data-effect]")) stopAudio();
  }, true);

  window.RoosterPaydayAudio = Object.freeze({
    play: playTogether,
    stop: stopAudio
  });
})();
