(() => {
  "use strict";

  const TRACKS = Object.freeze([
    "mixkit-magical-coin-win-1936.wav",
    "mixkit-clinking-coins-1993.wav"
  ]);

  let currentAudio = null;
  let sequenceId = 0;

  function stopAudio() {
    sequenceId += 1;
    if (currentAudio) {
      try {
        currentAudio.pause();
        currentAudio.currentTime = 0;
      } catch (_) {}
    }
    currentAudio = null;
  }

  function makeAudio(src) {
    const audio = new Audio(src);
    audio.preload = "auto";
    return audio;
  }

  function playSequence() {
    stopAudio();
    const runId = sequenceId;
    const first = makeAudio(TRACKS[0]);
    const second = makeAudio(TRACKS[1]);

    // Tweede track alvast laten bufferen zodat hij direct na de eerste kan starten.
    try { second.load(); } catch (_) {}

    currentAudio = first;
    first.addEventListener("ended", () => {
      if (runId !== sequenceId) return;
      currentAudio = second;
      second.currentTime = 0;
      second.play().catch(() => {});
    }, { once: true });

    second.addEventListener("ended", () => {
      if (runId === sequenceId) currentAudio = null;
    }, { once: true });

    first.currentTime = 0;
    first.play().catch(() => {});
  }

  document.addEventListener("click", (event) => {
    if (event.target.closest?.("#paydayEffectMenuItem")) {
      playSequence();
      return;
    }

    // Een ander effect of 'Effect stoppen' stopt ook de Payday-audio.
    if (event.target.closest?.("[data-effect]")) stopAudio();
  }, true);

  window.RoosterPaydayAudio = Object.freeze({
    play: playSequence,
    stop: stopAudio
  });
})();
