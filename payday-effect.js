(() => {
  "use strict";

  const MENU_ITEM_ID = "paydayEffectMenuItem";
  const OVERLAY_ID = "paydayEffectOverlay";
  const STYLE_ID = "paydayEffectStyle";
  const SYMBOLS = ["💶", "💰", "🪙", "💸", "€", "€", "💶", "🤑"];
  let stopTimer = 0;

  function ensureStyle() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
      #${OVERLAY_ID} {
        position: fixed;
        inset: 0;
        z-index: 10001;
        overflow: hidden;
        pointer-events: none;
        font-family: Arial, Helvetica, sans-serif;
      }

      #${OVERLAY_ID} .payday-flash {
        position: absolute;
        inset: -20%;
        background:
          radial-gradient(circle at center, rgba(255,255,255,.98) 0 4%, rgba(255,224,92,.76) 18%, rgba(255,183,0,.24) 38%, transparent 68%);
        animation: paydayFlash .72s ease-out both;
      }

      #${OVERLAY_ID} .payday-ring {
        position: absolute;
        left: 50%;
        top: 50%;
        width: 18vmin;
        height: 18vmin;
        border: max(5px, .55vmin) solid rgba(255, 215, 0, .9);
        border-radius: 50%;
        transform: translate(-50%, -50%);
        box-shadow: 0 0 28px rgba(255, 198, 0, .72), inset 0 0 24px rgba(255,255,255,.55);
        animation: paydayRing 1.15s ease-out both;
      }

      #${OVERLAY_ID} .payday-ring:nth-of-type(2) { animation-delay: .12s; }
      #${OVERLAY_ID} .payday-ring:nth-of-type(3) { animation-delay: .24s; }

      #${OVERLAY_ID} .payday-center {
        position: absolute;
        left: 50%;
        top: 48%;
        width: min(96vw, 1200px);
        transform: translate(-50%, -50%);
        text-align: center;
        filter: drop-shadow(0 14px 20px rgba(0,0,0,.28));
      }

      #${OVERLAY_ID} .payday-bam {
        margin-bottom: -1.5vmin;
        color: #fff;
        font-size: clamp(24px, 4.2vw, 62px);
        font-weight: 1000;
        letter-spacing: .12em;
        text-shadow: 0 3px 0 #9a6700, 0 0 18px rgba(255,208,0,.95);
        animation: paydayBam .72s cubic-bezier(.15,.9,.25,1.4) both;
      }

      #${OVERLAY_ID} .payday-title {
        color: #ffd400;
        font-size: clamp(68px, 14vw, 195px);
        font-weight: 1000;
        line-height: .88;
        letter-spacing: -.055em;
        -webkit-text-stroke: clamp(2px, .35vw, 6px) #5b3a00;
        text-shadow:
          0 .055em 0 #ff9f00,
          0 .105em 0 #b56a00,
          0 .145em .13em rgba(0,0,0,.32),
          0 0 .24em rgba(255,238,102,.98);
        animation: paydayTitle 1.35s cubic-bezier(.13,.93,.2,1.28) both;
      }

      #${OVERLAY_ID} .payday-subtitle {
        display: inline-block;
        margin-top: 1.8vmin;
        padding: .28em .7em;
        border: clamp(2px, .22vw, 4px) solid rgba(255,255,255,.95);
        border-radius: 999px;
        background: rgba(38, 29, 0, .82);
        color: #fff5a8;
        font-size: clamp(22px, 4.1vw, 58px);
        font-weight: 1000;
        letter-spacing: .055em;
        box-shadow: 0 8px 26px rgba(0,0,0,.25), 0 0 24px rgba(255,200,0,.38);
        animation: paydaySubtitle 1.05s .34s cubic-bezier(.2,.88,.3,1.24) both;
      }

      #${OVERLAY_ID} .payday-money {
        position: absolute;
        display: block;
        width: 1em;
        height: 1em;
        font-size: var(--size, 44px);
        line-height: 1;
        text-align: center;
        will-change: transform, opacity;
        filter: drop-shadow(0 5px 5px rgba(0,0,0,.22));
      }

      #${OVERLAY_ID} .payday-money.is-rain {
        left: var(--left);
        top: -16vh;
        animation: paydayMoneyRain var(--duration) var(--delay) cubic-bezier(.1,.55,.2,1) both;
      }

      #${OVERLAY_ID} .payday-money.is-burst {
        left: 50%;
        top: 52%;
        animation: paydayMoneyBurst var(--duration) var(--delay) cubic-bezier(.08,.76,.22,1) both;
      }

      @keyframes paydayFlash {
        0% { opacity: 0; transform: scale(.35); }
        18% { opacity: 1; transform: scale(1.08); }
        100% { opacity: 0; transform: scale(1.45); }
      }

      @keyframes paydayRing {
        0% { opacity: .95; transform: translate(-50%, -50%) scale(.2); }
        100% { opacity: 0; transform: translate(-50%, -50%) scale(6.2); }
      }

      @keyframes paydayBam {
        0% { opacity: 0; transform: scale(.15) rotate(-7deg); }
        60% { opacity: 1; transform: scale(1.24) rotate(2deg); }
        100% { opacity: 1; transform: scale(1) rotate(0); }
      }

      @keyframes paydayTitle {
        0% { opacity: 0; transform: scale(.08) rotate(-8deg); }
        54% { opacity: 1; transform: scale(1.18) rotate(1.5deg); }
        76% { transform: scale(.94) rotate(-.5deg); }
        100% { opacity: 1; transform: scale(1) rotate(0); }
      }

      @keyframes paydaySubtitle {
        0% { opacity: 0; transform: translateY(30px) scale(.3); }
        65% { opacity: 1; transform: translateY(-4px) scale(1.1); }
        100% { opacity: 1; transform: translateY(0) scale(1); }
      }

      @keyframes paydayMoneyRain {
        0% { opacity: 0; transform: translate3d(0,-10vh,0) rotate(0deg) scale(.65); }
        8% { opacity: 1; }
        100% { opacity: .96; transform: translate3d(var(--drift),128vh,0) rotate(var(--spin)) scale(1.12); }
      }

      @keyframes paydayMoneyBurst {
        0% { opacity: 0; transform: translate(-50%,-50%) scale(.1) rotate(0deg); }
        12% { opacity: 1; }
        100% { opacity: .96; transform: translate(calc(-50% + var(--tx)), calc(-50% + var(--ty))) scale(1.16) rotate(var(--spin)); }
      }

      @media (max-width: 620px) {
        #${OVERLAY_ID} .payday-center { top: 46%; }
        #${OVERLAY_ID} .payday-title { font-size: clamp(62px, 20vw, 118px); }
        #${OVERLAY_ID} .payday-subtitle { font-size: clamp(19px, 6.4vw, 34px); }
      }
    `;
    document.head.appendChild(style);
  }

  function random(min, max) {
    return min + Math.random() * (max - min);
  }

  function pick(items) {
    return items[Math.floor(Math.random() * items.length)];
  }

  function stopPayday() {
    window.clearTimeout(stopTimer);
    stopTimer = 0;
    document.getElementById(OVERLAY_ID)?.remove();
  }

  function moneyParticle(mode) {
    const particle = document.createElement("span");
    particle.className = `payday-money ${mode === "burst" ? "is-burst" : "is-rain"}`;
    particle.textContent = pick(SYMBOLS);
    particle.style.setProperty("--size", `${Math.round(random(28, mode === "burst" ? 78 : 62))}px`);
    particle.style.setProperty("--delay", `${random(0, .52).toFixed(2)}s`);
    particle.style.setProperty("--duration", `${random(1.65, 2.85).toFixed(2)}s`);
    particle.style.setProperty("--spin", `${Math.round(random(-760, 760))}deg`);

    if (mode === "burst") {
      particle.style.setProperty("--tx", `${random(-52, 52).toFixed(1)}vw`);
      particle.style.setProperty("--ty", `${random(-48, 52).toFixed(1)}vh`);
    } else {
      particle.style.setProperty("--left", `${random(-3, 97).toFixed(1)}vw`);
      particle.style.setProperty("--drift", `${random(-18, 18).toFixed(1)}vw`);
    }
    return particle;
  }

  function startPayday() {
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches) return;

    stopPayday();
    window.RoosterBirthdayScene?.hide?.();
    window.RoosterEffects?.stop?.();
    window.RoosterEffects?.start?.("fireworks");
    ensureStyle();

    const overlay = document.createElement("div");
    overlay.id = OVERLAY_ID;
    overlay.setAttribute("aria-hidden", "true");
    overlay.innerHTML = `
      <div class="payday-flash"></div>
      <div class="payday-ring"></div>
      <div class="payday-ring"></div>
      <div class="payday-ring"></div>
      <div class="payday-center">
        <div class="payday-bam">BAM! 💥</div>
        <div class="payday-title">PAYDAY!</div>
        <div class="payday-subtitle">CHING CHING! € € €</div>
      </div>`;

    const mobile = window.innerWidth < 680;
    const rainCount = mobile ? 34 : 62;
    const burstCount = mobile ? 24 : 46;
    for (let i = 0; i < rainCount; i += 1) overlay.appendChild(moneyParticle("rain"));
    for (let i = 0; i < burstCount; i += 1) overlay.appendChild(moneyParticle("burst"));

    document.body.appendChild(overlay);
    stopTimer = window.setTimeout(stopPayday, 3200);
  }

  function closeEffectsMenu() {
    const menu = document.getElementById("effectsMenu");
    const button = document.getElementById("effectsButton");
    if (menu) menu.hidden = true;
    button?.setAttribute("aria-expanded", "false");
  }

  function ensureMenuItem(attempt = 0) {
    const menu = document.getElementById("effectsMenu");
    if (!menu) {
      if (attempt < 60) window.setTimeout(() => ensureMenuItem(attempt + 1), 75);
      return;
    }
    if (document.getElementById(MENU_ITEM_ID)) return;

    const button = document.createElement("button");
    button.id = MENU_ITEM_ID;
    button.className = "effects-menu-item";
    button.type = "button";
    button.setAttribute("role", "menuitem");
    button.setAttribute("data-payday-effect", "true");
    button.innerHTML = `
      <span class="effects-menu-icon" aria-hidden="true">💶</span>
      <span>Payday – Ching Ching</span>`;

    const birthday = menu.querySelector('[data-effect="birthday"]');
    const separator = menu.querySelector(".effects-menu-separator");
    if (birthday) birthday.after(button);
    else if (separator) separator.before(button);
    else menu.appendChild(button);

    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      closeEffectsMenu();
      startPayday();
    });
  }

  // Een ander standaard effect of 'Effect stoppen' beëindigt ook het Payday-effect.
  document.addEventListener("click", (event) => {
    if (event.target.closest?.("[data-effect]")) stopPayday();
  }, true);

  window.addEventListener("rooster-unlocked", () => ensureMenuItem());
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => ensureMenuItem(), { once: true });
  } else {
    ensureMenuItem();
  }

  window.RoosterPaydayEffect = Object.freeze({
    start: startPayday,
    stop: stopPayday
  });
})();
