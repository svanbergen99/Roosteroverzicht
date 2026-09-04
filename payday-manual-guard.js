(() => {
  "use strict";

  if (window.__roosterPaydayManualGuardInstalled) return;
  window.__roosterPaydayManualGuardInstalled = true;

  const OVERLAY_ID = "paydayEffectOverlay";

  document.addEventListener("click", (event) => {
    const trigger = event.target.closest?.("[data-payday-effect]");
    if (!trigger) return;

    // Laat eerst de normale Payday-knop en de vaste Payday-scene hun werk doen.
    // Als de knop door andere UI-code opnieuw is opgebouwd en zijn directe
    // click-listener kwijt is, bestaat de Ka-Ching-overlay daarna nog niet.
    // In dat geval starten we dezelfde centrale Payday-functie alsnog.
    window.setTimeout(() => {
      if (document.getElementById(OVERLAY_ID)) return;
      window.RoosterPaydayEffect?.start?.();
      window.RoosterPaydayStaticScene?.show?.();
    }, 0);
  }, true);
})();
