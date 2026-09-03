(() => {
  "use strict";

  const bridge = window.RoosterSessionBridge;
  const app = document.getElementById("app");
  if (!bridge || !app) return;

  const IDLE_BEFORE_WARNING = 30000;
  const WARNING_DURATION = 30000;
  let idleTimer = null;
  let logoutTimer = null;
  let countdownTimer = null;
  let warningStartedAt = 0;

  const overlay = document.createElement("div");
  overlay.className = "session-timeout-overlay";
  overlay.hidden = true;
  overlay.setAttribute("role", "dialog");
  overlay.setAttribute("aria-modal", "true");
  overlay.innerHTML = `<section class="session-timeout-card"><h2>Ben je er nog?</h2><p>Vanwege privacy wordt het rooster automatisch vergrendeld. Je gaat over <span class="session-timeout-countdown" data-timeout-countdown>30</span> seconden terug naar het inlogscherm.</p><button type="button" data-stay-active>Ik ben er nog :-D</button></section>`;
  document.body.appendChild(overlay);

  const countdown = overlay.querySelector("[data-timeout-countdown]");
  const stayButton = overlay.querySelector("[data-stay-active]");

  function clearTimers() {
    clearTimeout(idleTimer);
    clearTimeout(logoutTimer);
    clearInterval(countdownTimer);
    idleTimer = null;
    logoutTimer = null;
    countdownTimer = null;
  }

  function isUnlocked() {
    return bridge.isUnlocked?.() && !app.hidden;
  }

  function hideWarning() {
    overlay.hidden = true;
    warningStartedAt = 0;
    clearTimeout(logoutTimer);
    clearInterval(countdownTimer);
    logoutTimer = null;
    countdownTimer = null;
  }

  function scheduleIdleWarning() {
    clearTimeout(idleTimer);
    if (!isUnlocked() || !overlay.hidden) return;
    idleTimer = setTimeout(showWarning, IDLE_BEFORE_WARNING);
  }

  function updateCountdown() {
    const elapsed = Date.now() - warningStartedAt;
    const remaining = Math.max(0, Math.ceil((WARNING_DURATION - elapsed) / 1000));
    countdown.textContent = String(remaining);
  }

  function showWarning() {
    if (!isUnlocked()) return;
    warningStartedAt = Date.now();
    countdown.textContent = "30";
    overlay.hidden = false;
    requestAnimationFrame(() => stayButton.focus());
    countdownTimer = setInterval(updateCountdown, 250);
    logoutTimer = setTimeout(() => {
      clearTimers();
      overlay.hidden = true;
      bridge.relock?.();
    }, WARNING_DURATION);
  }

  function confirmActive() {
    hideWarning();
    scheduleIdleWarning();
  }

  function registerActivity() {
    if (!isUnlocked() || !overlay.hidden) return;
    scheduleIdleWarning();
  }

  stayButton.addEventListener("click", confirmActive);
  ["pointerdown", "keydown", "touchstart", "wheel"].forEach((eventName) => {
    document.addEventListener(eventName, registerActivity, { passive: eventName !== "keydown", capture: true });
  });

  window.addEventListener("rooster-unlocked", () => {
    hideWarning();
    scheduleIdleWarning();
  });
  window.addEventListener("rooster-relocked", () => {
    clearTimers();
    overlay.hidden = true;
  });

  const observer = new MutationObserver(() => {
    if (isUnlocked()) scheduleIdleWarning();
    else {
      clearTimers();
      overlay.hidden = true;
    }
  });
  observer.observe(app, { attributes: true, attributeFilter: ["hidden"] });
})();
