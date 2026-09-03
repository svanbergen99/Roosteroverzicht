(() => {
  "use strict";

  const SCENE_TYPE = "payday";

  function paydayMarkup() {
    return `
      <svg class="holiday-scene-svg scene-payday" viewBox="0 0 1200 300" preserveAspectRatio="xMidYMax meet" role="presentation" aria-hidden="true">
        <defs>
          <linearGradient id="paydayGround" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stop-color="#fef3c7"/>
            <stop offset="1" stop-color="#fde68a"/>
          </linearGradient>
          <linearGradient id="paydayNote" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stop-color="#86efac"/>
            <stop offset="1" stop-color="#16a34a"/>
          </linearGradient>
        </defs>
        <path d="M0 264 Q180 238 360 261 T720 257 T1200 246 V300 H0Z" fill="url(#paydayGround)" opacity=".96"/>

        <g transform="translate(730 150)">
          <g transform="rotate(-10 100 58)">
            <rect x="20" y="12" width="180" height="92" rx="12" fill="url(#paydayNote)" stroke="#15803d" stroke-width="6"/>
            <rect x="38" y="28" width="144" height="60" rx="8" fill="none" stroke="#dcfce7" stroke-width="4"/>
            <text x="110" y="72" text-anchor="middle" font-family="Arial, sans-serif" font-size="48" font-weight="900" fill="#ffffff">€</text>
          </g>
          <g transform="translate(155 42) rotate(8 100 58)">
            <rect x="20" y="12" width="180" height="92" rx="12" fill="#4ade80" stroke="#15803d" stroke-width="6"/>
            <rect x="38" y="28" width="144" height="60" rx="8" fill="none" stroke="#dcfce7" stroke-width="4"/>
            <text x="110" y="72" text-anchor="middle" font-family="Arial, sans-serif" font-size="48" font-weight="900" fill="#14532d">€</text>
          </g>
        </g>

        <g transform="translate(690 215)">
          ${Array.from({ length: 8 }, (_, i) => `<ellipse cx="${38 + i * 49}" cy="${52 - (i % 3) * 10}" rx="31" ry="13" fill="#facc15" stroke="#ca8a04" stroke-width="5"/>`).join("")}
          ${Array.from({ length: 6 }, (_, i) => `<ellipse cx="${62 + i * 56}" cy="${27 - (i % 2) * 9}" rx="28" ry="12" fill="#fde047" stroke="#ca8a04" stroke-width="4"/>`).join("")}
        </g>

        <g transform="translate(1040 190)">
          <circle cx="55" cy="55" r="48" fill="#facc15" stroke="#ca8a04" stroke-width="7"/>
          <circle cx="55" cy="55" r="34" fill="none" stroke="#fef3c7" stroke-width="4"/>
          <text x="55" y="73" text-anchor="middle" font-family="Arial, sans-serif" font-size="54" font-weight="900" fill="#92400e">€</text>
        </g>
      </svg>`;
  }

  function ensureScene() {
    let overlay = document.getElementById("holidaySceneOverlay");
    if (!overlay) {
      overlay = document.createElement("div");
      overlay.id = "holidaySceneOverlay";
      overlay.className = "holiday-scene-overlay";
      overlay.setAttribute("aria-hidden", "true");
      document.body.appendChild(overlay);
    }

    if (overlay.dataset.scene === SCENE_TYPE) return overlay;
    overlay.dataset.scene = SCENE_TYPE;
    const markup = paydayMarkup();
    overlay.innerHTML = `
      <div class="holiday-scene-side holiday-scene-side-left">
        <div class="holiday-scene-static-stage">${markup}</div>
      </div>
      <div class="holiday-scene-side holiday-scene-side-right">
        <div class="holiday-scene-static-stage">${markup}</div>
      </div>`;
    return overlay;
  }

  function showPaydayScene() {
    ensureScene();
  }

  function patchPaydayLabel() {
    const item = document.querySelector("[data-payday-effect]");
    if (!item) return;
    const icon = item.querySelector(".effects-menu-icon");
    const label = item.querySelector("span:last-child");
    if (icon && icon.textContent !== "💶") icon.textContent = "💶";
    if (label && label.textContent !== "Payday") label.textContent = "Payday";
  }

  // Laat eerst de normale Payday-knop zijn eigen geldanimatie opbouwen. Daarna
  // start het vuurwerk via de bypass en zetten we de Payday-onderscène terug,
  // zodat geen van beide door de andere start wordt overschreven.
  document.addEventListener("click", (event) => {
    if (!event.target.closest?.("[data-payday-effect]")) return;
    window.setTimeout(() => {
      window.RoosterHolidayEffects?.playForVideo?.("fireworks");
      showPaydayScene();
    }, 0);
  }, true);

  patchPaydayLabel();
  const observer = new MutationObserver(patchPaydayLabel);
  observer.observe(document.documentElement, { childList: true, subtree: true });

  window.RoosterPaydayStaticScene = Object.freeze({ show: showPaydayScene });
})();