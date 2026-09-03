(() => {
  "use strict";

  const effects = window.RoosterEffects;
  if (!effects?.start) return;

  const TIME_ZONE = "Europe/Amsterdam";
  const THEME_EFFECTS = Object.freeze({
    Nieuwjaar: "fireworks",
    Valentijnsdag: "hearts-petals",
    Pasen: "easter",
    Koningsdag: "orange",
    Moederdag: "hearts-petals",
    Vaderdag: "hearts-petals",
    Halloween: "halloween",
    Sinterklaas: "sinterklaas",
    Kerst: "christmas-snow",
    Oudjaar: "fireworks"
  });

  const normalize = (type) => window.RoosterEffectCombinations?.normalize?.(type) || String(type || "");
  const originalStart = effects.start.bind(effects);
  let lastAutomaticKey = "";

  function amsterdamParts() {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: TIME_ZONE,
      year: "numeric",
      month: "2-digit",
      day: "2-digit"
    }).formatToParts(new Date());
    const get = (type) => parts.find((part) => part.type === type)?.value || "";
    return { year: Number(get("year")), month: Number(get("month")), day: Number(get("day")) };
  }

  function dateKey() {
    const p = amsterdamParts();
    return `${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`;
  }

  function decemberOverride() {
    const p = amsterdamParts();
    if (p.month !== 12) return "";
    if (p.day >= 1 && p.day <= 5) return "sinterklaas";
    if (p.day >= 6 && p.day <= 31) return "christmas-snow";
    return "";
  }

  function themeEffect() {
    return normalize(THEME_EFFECTS[document.body.dataset.backgroundTheme || ""] || "");
  }

  function expectedAutomaticEffect() {
    return decemberOverride() || themeEffect();
  }

  effects.start = function managedHolidayStart(type) {
    const normalized = normalize(type);

    // Verjaardag blijft altijd los beschikbaar.
    if (normalized === "birthday") return originalStart(normalized);

    // Handmatige keuzes uit het Effecten-menu blijven altijd toegestaan.
    if (window.RoosterEffectCombinations?.isManualStart?.()) return originalStart(normalized);

    const expected = expectedAutomaticEffect();
    if (!expected || normalized !== expected) return;
    return originalStart(normalized);
  };

  function playCalendarOverrideWhenNeeded() {
    const expected = expectedAutomaticEffect();
    if (!expected) return;

    // Als de normale achtergrond-thema koppeling exact hetzelfde effect start,
    // laat holiday-scenes.js dat doen om dubbele starts te voorkomen.
    if (expected === themeEffect()) return;

    const key = `${dateKey()}|${expected}`;
    if (key === lastAutomaticKey) return;
    lastAutomaticKey = key;
    originalStart(expected);
  }

  function playForVideo(type) {
    const normalized = normalize(type);
    if (!normalized) return;
    // Een video moet altijd samen met zijn effect starten, ook als hij handmatig
    // buiten de normale feestdagperiode wordt geopend.
    originalStart(normalized);
  }

  window.RoosterHolidayEffects = Object.freeze({
    effectForCurrentTheme: expectedAutomaticEffect,
    playForVideo,
    playBirthday() {
      window.RoosterBirthdayScene?.show?.(true);
    }
  });

  window.addEventListener("rooster-unlocked", () => {
    requestAnimationFrame(playCalendarOverrideWhenNeeded);
  });

  const app = document.getElementById("app");
  if (app && !app.hidden) playCalendarOverrideWhenNeeded();
})();