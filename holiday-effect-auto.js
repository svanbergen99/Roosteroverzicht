(() => {
  "use strict";

  const effects = window.RoosterEffects;
  if (!effects?.start) return;

  const THEME_EFFECTS = Object.freeze({
    Nieuwjaar: "fireworks",
    Valentijnsdag: "hearts",
    Pasen: "easter",
    Koningsdag: "orange",
    Moederdag: "hearts",
    Vaderdag: "hearts",
    Suikerfeest: "eid",
    Halloween: "halloween",
    Sinterklaas: "sinterklaas",
    Kerst: "christmas",
    Oudjaar: "fireworks"
  });

  const originalStart = effects.start.bind(effects);
  let lastPlayedKey = "";

  effects.start = function startAutomaticHolidayEffect(type) {
    const theme = document.body.dataset.backgroundTheme || "";
    const expectedEffect = THEME_EFFECTS[theme] || "";

    // Verjaardag blijft bewust los beschikbaar voor de toekomstige koppeling
    // aan de ingelogde collega. Alle overige effecten mogen alleen bij de
    // automatisch gekozen feestdag-afbeelding horen.
    if (type !== "birthday" && (!expectedEffect || type !== expectedEffect)) return;

    const playKey = type === "birthday" ? "birthday" : `${theme}|${type}`;
    if (playKey === lastPlayedKey) return;
    lastPlayedKey = playKey;
    originalStart(type);
  };

  window.RoosterHolidayEffects = Object.freeze({
    effectForCurrentTheme() {
      return THEME_EFFECTS[document.body.dataset.backgroundTheme || ""] || "";
    },
    playBirthday() {
      window.RoosterBirthdayScene?.show?.(true);
    }
  });
})();
