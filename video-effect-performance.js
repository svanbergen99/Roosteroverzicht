(() => {
  "use strict";

  if (window.__roosterVideoEffectPerformanceInstalled) return;
  window.__roosterVideoEffectPerformanceInstalled = true;

  const PLAYER_SELECTOR = "#videoLibraryPlayerSection .video-library-player";
  const KEEP_RATE = 0.58;
  const VIDEO_EFFECT_WINDOW_MS = 12500;
  const EFFECT_PARTICLE_KINDS = new Set([
    "confetti", "ribbon", "snow", "emoji", "star", "petal",
    "spark", "shooting", "heart", "balloon"
  ]);

  let activeUntil = 0;

  function begin() {
    activeUntil = Math.max(activeUntil, Date.now() + VIDEO_EFFECT_WINDOW_MS);
  }

  function active() {
    return Date.now() < activeUntil;
  }

  function isEffectParticle(value) {
    return !!(
      value &&
      typeof value === "object" &&
      EFFECT_PARTICLE_KINDS.has(value.kind) &&
      Number.isFinite(value.x) &&
      Number.isFinite(value.y) &&
      Number.isFinite(value.vx) &&
      Number.isFinite(value.vy) &&
      Number.isFinite(value.life) &&
      Number.isFinite(value.age)
    );
  }

  // De canvas-effecten bewaren hun bewegende onderdelen in een interne array.
  // Tijdens een video laten we ongeveer 58% van die deeltjes door. Buiten een
  // video blijft Array.prototype.push volledig normaal werken.
  const nativeArrayPush = Array.prototype.push;
  Array.prototype.push = function videoEffectLightPush(...items) {
    if (!active() || !items.some(isEffectParticle)) {
      return nativeArrayPush.apply(this, items);
    }

    const kept = items.filter((item) => !isEffectParticle(item) || Math.random() < KEEP_RATE);
    if (!kept.length) return this.length;
    return nativeArrayPush.apply(this, kept);
  };

  // Valentijn en Payday gebruiken daarnaast losse DOM-deeltjes. Ook daarvan
  // wordt alleen tijdens een video dezelfde lichtere hoeveelheid geplaatst.
  const nativeAppendChild = Node.prototype.appendChild;
  Node.prototype.appendChild = function videoEffectLightAppendChild(child) {
    if (
      active() &&
      child instanceof Element &&
      child.matches?.(".combined-petal, .payday-money") &&
      Math.random() >= KEEP_RATE
    ) {
      return child;
    }
    return nativeAppendChild.call(this, child);
  };

  // Zowel handmatig gekozen als automatisch geopende bibliotheekvideo's lopen
  // via hetzelfde play-event, dus één regel dekt beide situaties af.
  document.addEventListener("play", (event) => {
    const player = event.target;
    if (!(player instanceof HTMLVideoElement) || !player.matches(PLAYER_SELECTOR)) return;
    begin();
  }, true);

  window.RoosterVideoEffectPerformance = Object.freeze({
    begin,
    active,
    keepRate: () => KEEP_RATE
  });
})();
