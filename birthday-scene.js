(() => {
  "use strict";

  const SCENE_TYPE = "birthday";

  function birthdayMarkup() {
    return `
      <svg class="holiday-scene-svg scene-birthday" viewBox="0 0 1200 300" preserveAspectRatio="xMidYMax meet" role="presentation" aria-hidden="true">
        <defs>
          <linearGradient id="birthdayGround" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stop-color="#fff1f2"/>
            <stop offset="1" stop-color="#ffe4e6"/>
          </linearGradient>
          <filter id="birthdayCandleGlow">
            <feGaussianBlur stdDeviation="3" result="blur"/>
            <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
          </filter>
        </defs>

        <path d="M0 263 Q180 238 360 260 T720 257 T1200 247 V300 H0Z" fill="url(#birthdayGround)" opacity=".96"/>

        <g transform="translate(745 58)">
          <ellipse cx="170" cy="232" rx="174" ry="24" fill="#be185d" opacity=".12"/>
          <rect x="35" y="128" width="270" height="96" rx="20" fill="#f9a8d4" stroke="#db2777" stroke-width="6"/>
          <rect x="56" y="82" width="228" height="64" rx="16" fill="#fbcfe8" stroke="#ec4899" stroke-width="5"/>
          <path d="M57 108 Q80 126 105 108 T153 108 T201 108 T249 108 T284 108" fill="none" stroke="#ffffff" stroke-width="8" stroke-linecap="round"/>
          <circle cx="82" cy="178" r="9" fill="#60a5fa"/>
          <circle cx="124" cy="188" r="9" fill="#facc15"/>
          <circle cx="170" cy="176" r="9" fill="#34d399"/>
          <circle cx="216" cy="188" r="9" fill="#a78bfa"/>
          <circle cx="258" cy="178" r="9" fill="#fb7185"/>

          ${[
            [82, "#60a5fa"],
            [126, "#f59e0b"],
            [170, "#34d399"],
            [214, "#a78bfa"],
            [258, "#fb7185"]
          ].map(([x, color], index) => `
            <g>
              <rect x="${x - 5}" y="${index % 2 ? 27 : 37}" width="10" height="48" rx="4" fill="${color}"/>
              <path d="M${x} ${index % 2 ? 22 : 32} C${x - 10} ${index % 2 ? 7 : 17}, ${x + 10} ${index % 2 ? 4 : 14}, ${x} ${index % 2 ? -2 : 8} C${x + 12} ${index % 2 ? 6 : 16}, ${x + 15} ${index % 2 ? 15 : 25}, ${x} ${index % 2 ? 22 : 32}Z" fill="#fbbf24" filter="url(#birthdayCandleGlow)"/>
            </g>`).join("")}
        </g>

        <g transform="translate(625 188)">
          <circle cx="34" cy="38" r="25" fill="#60a5fa"/>
          <circle cx="78" cy="18" r="30" fill="#f472b6"/>
          <circle cx="124" cy="40" r="24" fill="#facc15"/>
          <path d="M34 63 C31 95 45 105 30 132 M78 48 C73 82 91 96 76 132 M124 64 C118 96 136 108 120 134" fill="none" stroke="#94a3b8" stroke-width="3"/>
        </g>

        <g transform="translate(1080 210)">
          <path d="M0 55 L22 4 L44 55Z" fill="#8b5cf6"/>
          <circle cx="22" cy="4" r="8" fill="#facc15"/>
          <path d="M8 31h28" stroke="#ffffff" stroke-width="5"/>
        </g>
      </svg>`;
  }

  function ensureOverlay() {
    let overlay = document.getElementById("holidaySceneOverlay");
    if (!overlay) {
      overlay = document.createElement("div");
      overlay.id = "holidaySceneOverlay";
      overlay.className = "holiday-scene-overlay";
      overlay.setAttribute("aria-hidden", "true");
      document.body.appendChild(overlay);
    }
    return overlay;
  }

  function showBirthdayScene(animate = true) {
    const overlay = ensureOverlay();
    const markup = birthdayMarkup();
    overlay.dataset.scene = SCENE_TYPE;
    overlay.innerHTML = `
      <div class="holiday-scene-side holiday-scene-side-left">
        <div class="holiday-scene-static-stage">${markup}</div>
      </div>
      <div class="holiday-scene-side holiday-scene-side-right">
        <div class="holiday-scene-static-stage">${markup}</div>
      </div>`;

    if (animate) window.RoosterEffects?.start?.(SCENE_TYPE);
  }

  function hideBirthdayScene() {
    const overlay = document.getElementById("holidaySceneOverlay");
    if (overlay?.dataset.scene === SCENE_TYPE) overlay.remove();
  }

  // Bewust niet automatisch uitgevoerd. Later kan de roosterlogin dit aanroepen
  // wanneer de ingelogde collega op die datum jarig is.
  window.RoosterBirthdayScene = Object.freeze({
    show: showBirthdayScene,
    hide: hideBirthdayScene
  });
})();
