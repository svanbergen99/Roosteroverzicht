(() => {
  "use strict";

  // Verjaardag mag handmatig getest worden via Effecten en via Verjaardag.mp4.
  // De automatische verjaardagsregel blijft uitsluitend in occasion-auto.js:
  // automatisch afspelen gebeurt alleen als de opgeslagen verjaardag van de
  // geselecteerde collega overeenkomt met vandaag.
  window.__roosterBirthdayEffectGuard = false;
})();
