(() => {
  "use strict";

  const DURATIONS = {
    fireworks: 7600,
    orange: 8200,
    hearts: 8500,
    easter: 8500,
    halloween: 8400,
    sinterklaas: 8500,
    christmas: 9000,
    eid: 8500
  };

  let hideTimer = 0;
  let removeTimer = 0;

  const svg = (body, className = "") => `
    <svg class="holiday-scene-svg ${className}" viewBox="0 0 1200 300" preserveAspectRatio="xMidYMax meet" role="presentation" aria-hidden="true">
      ${body}
    </svg>`;

  const SCENES = {
    christmas: () => svg(`
      <defs>
        <linearGradient id="xmasSnow" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffffff"/><stop offset="1" stop-color="#dbeafe"/></linearGradient>
        <filter id="xmasGlow"><feGaussianBlur stdDeviation="4" result="blur"/><feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
      </defs>
      <path d="M0 255 Q170 225 340 252 T680 246 T1010 250 T1200 235 V300 H0Z" fill="url(#xmasSnow)" opacity=".96"/>
      <g class="scene-gentle-sway" transform="translate(790 15)">
        <rect x="100" y="218" width="34" height="48" rx="6" fill="#7c3f1d"/>
        <polygon points="117,12 38,120 196,120" fill="#166534"/>
        <polygon points="117,58 22,170 212,170" fill="#15803d"/>
        <polygon points="117,108 6,224 228,224" fill="#16a34a"/>
        <path d="M42 125 Q117 155 193 123 M29 173 Q118 207 204 171" fill="none" stroke="#f6c453" stroke-width="6" stroke-linecap="round"/>
        <polygon points="117,0 124,18 144,19 128,31 134,50 117,39 100,50 106,31 90,19 110,18" fill="#ffd166" filter="url(#xmasGlow)"/>
        ${[[68,104,"#ef4444"],[151,101,"#60a5fa"],[107,135,"#ffd166"],[62,160,"#f472b6"],[166,158,"#ef4444"],[118,188,"#60a5fa"],[82,208,"#ffd166"],[165,207,"#f472b6"]].map(([x,y,c],i)=>`<circle class="scene-light scene-light-${i%3}" cx="${x}" cy="${y}" r="7" fill="${c}" filter="url(#xmasGlow)"/>`).join("")}
      </g>
      <g transform="translate(720 232)">
        <rect x="0" y="12" width="72" height="52" rx="7" fill="#dc2626"/><path d="M36 12V64M0 36H72" stroke="#f6c453" stroke-width="7"/>
        <rect x="205" y="0" width="82" height="64" rx="8" fill="#2563eb"/><path d="M246 0V64M205 30H287" stroke="#ffffff" stroke-width="7"/>
        <rect x="300" y="20" width="62" height="44" rx="7" fill="#16a34a"/><path d="M331 20V64M300 41H362" stroke="#ffd166" stroke-width="6"/>
      </g>
      <g class="scene-star-twinkle" fill="#fff" opacity=".9"><circle cx="680" cy="92" r="4"/><circle cx="1060" cy="82" r="5"/><circle cx="1110" cy="148" r="3"/><circle cx="746" cy="55" r="3"/></g>
    `, "scene-christmas"),

    easter: () => svg(`
      <defs><linearGradient id="easterGrass" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#86efac"/><stop offset="1" stop-color="#22c55e"/></linearGradient></defs>
      <path d="M0 256 Q160 230 310 252 T620 247 T910 252 T1200 238 V300 H0Z" fill="url(#easterGrass)" opacity=".94"/>
      <g class="scene-gentle-bob" transform="translate(790 42)">
        <ellipse cx="130" cy="184" rx="70" ry="82" fill="#fff7ed" stroke="#e7e5e4" stroke-width="5"/>
        <circle cx="130" cy="103" r="56" fill="#fff7ed" stroke="#e7e5e4" stroke-width="5"/>
        <ellipse cx="96" cy="31" rx="23" ry="66" transform="rotate(-10 96 31)" fill="#fff7ed" stroke="#e7e5e4" stroke-width="5"/>
        <ellipse cx="164" cy="31" rx="23" ry="66" transform="rotate(10 164 31)" fill="#fff7ed" stroke="#e7e5e4" stroke-width="5"/>
        <ellipse cx="96" cy="32" rx="9" ry="43" transform="rotate(-10 96 32)" fill="#f9a8d4" opacity=".8"/>
        <ellipse cx="164" cy="32" rx="9" ry="43" transform="rotate(10 164 32)" fill="#f9a8d4" opacity=".8"/>
        <circle cx="112" cy="96" r="5" fill="#1f2937"/><circle cx="148" cy="96" r="5" fill="#1f2937"/>
        <ellipse cx="130" cy="114" rx="8" ry="6" fill="#fb7185"/>
        <path d="M130 120q-12 16-25 4M130 120q12 16 25 4" fill="none" stroke="#64748b" stroke-width="3" stroke-linecap="round"/>
        <ellipse cx="76" cy="169" rx="23" ry="13" transform="rotate(-25 76 169)" fill="#fff7ed"/>
      </g>
      <g transform="translate(676 194)">
        <path d="M0 52 Q65 -12 130 52 L118 98 H12Z" fill="#b45309" stroke="#92400e" stroke-width="5"/>
        <path d="M28 48 Q66 -22 103 48" fill="none" stroke="#92400e" stroke-width="8"/>
        ${[[34,42,"#f472b6"],[63,34,"#60a5fa"],[89,43,"#facc15"],[50,56,"#a78bfa"],[79,58,"#fb7185"]].map(([x,y,c])=>`<ellipse cx="${x}" cy="${y}" rx="14" ry="19" fill="${c}" stroke="#fff" stroke-width="3"/>`).join("")}
      </g>
      <g class="scene-flower-sway"><circle cx="1080" cy="238" r="11" fill="#facc15"/><g fill="#f9a8d4"><circle cx="1080" cy="221" r="11"/><circle cx="1097" cy="238" r="11"/><circle cx="1080" cy="255" r="11"/><circle cx="1063" cy="238" r="11"/></g><path d="M1080 250v45" stroke="#15803d" stroke-width="5"/></g>
    `, "scene-easter"),

    sinterklaas: () => svg(`
      <defs><linearGradient id="sintRoof" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#334155"/><stop offset="1" stop-color="#0f172a"/></linearGradient></defs>
      <path d="M0 266 L110 266 150 218 190 266 310 266 365 228 420 266 555 266 610 214 670 266 1200 266V300H0Z" fill="url(#sintRoof)" opacity=".9"/>
      <g class="scene-horse-bob" transform="translate(735 80)">
        <ellipse cx="168" cy="144" rx="108" ry="48" fill="#f8fafc" stroke="#cbd5e1" stroke-width="5"/>
        <path d="M244 132 Q278 87 305 104 Q324 116 302 142 Q286 157 253 160Z" fill="#f8fafc" stroke="#cbd5e1" stroke-width="5"/>
        <path d="M295 109l24-24 10 35" fill="#f8fafc" stroke="#cbd5e1" stroke-width="5" stroke-linejoin="round"/>
        <circle cx="304" cy="123" r="4" fill="#1f2937"/>
        <path d="M89 175L70 246M144 181L137 250M216 178L229 248M258 170L278 242" stroke="#e2e8f0" stroke-width="16" stroke-linecap="round"/>
        <path d="M68 246h28M125 250h28M218 248h29M268 242h29" stroke="#64748b" stroke-width="7" stroke-linecap="round"/>
        <path d="M66 135Q19 124 28 84Q42 119 82 108" fill="none" stroke="#f8fafc" stroke-width="20" stroke-linecap="round"/>
        <g transform="translate(145 0)">
          <path d="M15 38 Q47 8 79 38 L70 82 H24Z" fill="#dc2626"/>
          <path d="M23 40h48M47 15v64" stroke="#f6c453" stroke-width="5"/>
          <circle cx="47" cy="96" r="27" fill="#f5d0b5"/>
          <path d="M24 99Q48 132 70 99Q67 139 48 146Q28 138 24 99" fill="#f8fafc"/>
          <path d="M15 145 Q48 122 83 145 L95 205 H0Z" fill="#b91c1c" stroke="#7f1d1d" stroke-width="4"/>
          <path d="M48 140v68" stroke="#f6c453" stroke-width="6"/>
          <path d="M88 152Q118 168 118 198" fill="none" stroke="#b91c1c" stroke-width="15" stroke-linecap="round"/>
          <path d="M118 84v126M118 84q25 6 18 30" fill="none" stroke="#d4a72c" stroke-width="7" stroke-linecap="round"/>
        </g>
      </g>
      <g fill="#f6c453" class="scene-star-twinkle"><circle cx="700" cy="75" r="5"/><circle cx="1100" cy="92" r="4"/><circle cx="1030" cy="48" r="3"/></g>
    `, "scene-sinterklaas"),

    halloween: () => svg(`
      <defs><linearGradient id="halloHill" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#312e81"/><stop offset="1" stop-color="#111827"/></linearGradient></defs>
      <path d="M0 258 Q180 205 350 255 Q530 218 700 255 Q900 206 1200 247V300H0Z" fill="url(#halloHill)" opacity=".94"/>
      <g transform="translate(795 87)" opacity=".92"><rect x="90" y="75" width="170" height="125" fill="#1f2937"/><polygon points="70,78 175,8 282,78" fill="#111827"/><rect x="142" y="130" width="42" height="70" fill="#0f172a"/><g fill="#fbbf24" class="scene-light"><rect x="106" y="100" width="28" height="32"/><rect x="214" y="100" width="28" height="32"/></g><rect x="250" y="35" width="22" height="72" fill="#111827"/></g>
      <g class="scene-pumpkin-glow" transform="translate(650 202)"><ellipse cx="58" cy="45" rx="55" ry="43" fill="#f97316"/><ellipse cx="43" cy="45" rx="25" ry="40" fill="#fb923c"/><path d="M55 4q4-20 19-17" fill="none" stroke="#166534" stroke-width="8"/><path d="M29 40l14-10 11 12M67 42l12-12 14 10M45 60q15 12 31 0" fill="none" stroke="#422006" stroke-width="6" stroke-linecap="round"/></g>
      <g class="scene-pumpkin-glow" transform="translate(1040 220) scale(.72)"><ellipse cx="58" cy="45" rx="55" ry="43" fill="#f97316"/><path d="M55 4q4-20 19-17" fill="none" stroke="#166534" stroke-width="8"/><path d="M29 40l14-10 11 12M67 42l12-12 14 10M45 60q15 12 31 0" fill="none" stroke="#422006" stroke-width="6" stroke-linecap="round"/></g>
      <g fill="#111827"><path d="M720 82q18-22 36 0q-18-8-36 0z"/><path d="M1090 64q22-25 44 0q-22-8-44 0z"/></g>
    `, "scene-halloween"),

    orange: () => svg(`
      <path d="M0 268 Q200 245 390 266 T790 262 T1200 255V300H0Z" fill="#fff7ed" opacity=".94"/>
      <path d="M0 54 Q300 112 600 52 T1200 55" fill="none" stroke="#c2410c" stroke-width="4"/>
      ${Array.from({length:15},(_,i)=>`<path d="M${i*86} ${58 + Math.sin(i)*8}l25 40 25-36z" fill="${i%3===0?'#ff6200':i%3===1?'#ffffff':'#21468b'}"/>`).join("")}
      <g class="scene-gentle-bob" transform="translate(835 135)"><path d="M0 76 L25 5 72 52 118 4 165 53 210 5 235 76Z" fill="#f97316" stroke="#ea580c" stroke-width="7"/><rect x="8" y="72" width="220" height="48" rx="12" fill="#fb923c"/><circle cx="55" cy="91" r="10" fill="#fff"/><circle cx="118" cy="91" r="10" fill="#21468b"/><circle cx="180" cy="91" r="10" fill="#ae1c28"/></g>
      <g transform="translate(660 238)"><rect x="0" y="0" width="130" height="34" fill="#ae1c28"/><rect x="0" y="34" width="130" height="34" fill="#ffffff"/><rect x="0" y="68" width="130" height="34" fill="#21468b"/></g>
    `, "scene-orange"),

    eid: () => svg(`
      <defs><linearGradient id="eidGround" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#134e4a"/><stop offset="1" stop-color="#042f2e"/></linearGradient></defs>
      <path d="M0 264H1200V300H0Z" fill="url(#eidGround)" opacity=".95"/>
      <g transform="translate(760 100)" fill="#0f766e" stroke="#f4c95d" stroke-width="4"><rect x="60" y="90" width="280" height="85" rx="8"/><path d="M95 90Q130 20 165 90M235 90Q270 10 305 90"/><rect x="82" y="38" width="18" height="137"/><path d="M91 8l18 30H73Z" fill="#f4c95d"/><rect x="323" y="45" width="18" height="130"/><path d="M332 15l18 30h-36Z" fill="#f4c95d"/></g>
      <g class="scene-lantern-sway" transform="translate(675 82)"><path d="M0-55v35" stroke="#f4c95d" stroke-width="4"/><rect x="-22" y="-20" width="44" height="64" rx="10" fill="#f4c95d" stroke="#fff4c2" stroke-width="4"/><path d="M-16-8h32M-16 30h32" stroke="#0f766e" stroke-width="4"/></g>
      <path d="M1085 65a48 48 0 1 0 38 78 42 42 0 1 1-38-78z" fill="#f4c95d" class="scene-star-twinkle"/>
      <g fill="#fff4c2" class="scene-star-twinkle"><circle cx="1030" cy="85" r="5"/><circle cx="1145" cy="115" r="4"/><circle cx="700" cy="55" r="4"/></g>
    `, "scene-eid"),

    fireworks: () => svg(`
      <defs><linearGradient id="city" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#334155"/><stop offset="1" stop-color="#0f172a"/></linearGradient></defs>
      <path d="M0 300V235H75V190H138V242H205V165H278V222H342V197H401V246H480V180H555V238H642V204H712V250H780V170H860V225H930V194H1000V240H1080V185H1145V225H1200V300Z" fill="url(#city)" opacity=".94"/>
      ${Array.from({length:20},(_,i)=>`<rect class="scene-light scene-light-${i%3}" x="${25+i*57}" y="${205+(i%4)*15}" width="8" height="12" rx="2" fill="${i%2?'#fde68a':'#bfdbfe'}"/>`).join("")}
      <path d="M0 275H1200" stroke="#475569" stroke-width="5"/>
    `, "scene-fireworks"),

    hearts: () => svg(`
      <path d="M0 270 Q220 245 420 269 T820 264 T1200 252V300H0Z" fill="#fff1f2" opacity=".94"/>
      <g class="scene-gentle-bob" transform="translate(875 125)"><path d="M105 132C-18 60 16-28 105 40C194-28 228 60 105 132Z" fill="#f43f5e"/><path d="M105 110C15 58 43 2 105 50C167 2 195 58 105 110Z" fill="#fb7185"/></g>
      <g transform="translate(700 224)"><path d="M0 60Q52-10 104 60" fill="none" stroke="#b45309" stroke-width="8"/><path d="M10 52h84l-12 43H22Z" fill="#d97706"/><g fill="#fb7185"><circle cx="25" cy="38" r="18"/><circle cx="52" cy="28" r="21" fill="#f43f5e"/><circle cx="78" cy="40" r="17" fill="#f9a8d4"/></g></g>
    `, "scene-hearts")
  };

  const THEME_TO_SCENE = Object.freeze({
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

  function removeScene() {
    document.getElementById("holidaySceneOverlay")?.remove();
  }

  function showStaticScene(type) {
    const factory = SCENES[type];
    if (!factory) return;

    let overlay = document.getElementById("holidaySceneOverlay");
    if (!overlay) {
      overlay = document.createElement("div");
      overlay.id = "holidaySceneOverlay";
      overlay.className = "holiday-scene-overlay";
      overlay.setAttribute("aria-hidden", "true");
      document.body.appendChild(overlay);
    }

    if (overlay.dataset.scene === type) return;
    overlay.dataset.scene = type;
    const sceneMarkup = factory();
    overlay.innerHTML = `
      <div class="holiday-scene-side holiday-scene-side-left">
        <div class="holiday-scene-static-stage">${sceneMarkup}</div>
      </div>
      <div class="holiday-scene-side holiday-scene-side-right">
        <div class="holiday-scene-static-stage">${sceneMarkup}</div>
      </div>`;
  }

  function automaticSceneType() {
    return THEME_TO_SCENE[document.body.dataset.backgroundTheme || ""] || "";
  }

  function applyAutomaticHolidayScene(animate = false) {
    const type = automaticSceneType();
    if (!type) {
      removeScene();
      return;
    }
    showStaticScene(type);
    if (animate) window.RoosterEffects?.start?.(type);
  }

  document.addEventListener("click", (event) => {
    const item = event.target.closest?.("[data-effect]");
    if (!item) return;
    const effect = item.dataset.effect;
    if (effect && effect !== "stop" && SCENES[effect]) showStaticScene(effect);
  });

  window.addEventListener("rooster-unlocked", () => {
    requestAnimationFrame(() => applyAutomaticHolidayScene(true));
  });

  const app = document.getElementById("app");
  if (app && !app.hidden) applyAutomaticHolidayScene(false);
})();
