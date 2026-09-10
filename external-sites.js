(() => {
  "use strict";

  const app = document.getElementById("app");
  if (!app) return;

  const CLOCK_ID = "startHeaderClock";
  const CLOCK_STYLE_ID = "startDigitalClockStyle";
  const TIME_ZONE = "Europe/Amsterdam";
  let clockTimer = 0;

  function ensureClockStyle() {
    if (document.getElementById(CLOCK_STYLE_ID)) return;
    const style = document.createElement("style");
    style.id = CLOCK_STYLE_ID;
    style.textContent = `
      #${CLOCK_ID}.start-digital-clock {
        position: relative !important;
        z-index: 3 !important;
        width: min(760px, 100%) !important;
        min-width: 0 !important;
        min-height: 154px !important;
        margin: 0 auto 24px !important;
        padding: 18px 24px !important;
        display: grid !important;
        grid-template-columns: minmax(150px, 1.05fr) minmax(270px, 2fr) minmax(150px, 1.05fr) !important;
        align-items: center !important;
        gap: 18px !important;
        border: 2px solid #20242a !important;
        border-radius: 8px !important;
        background: linear-gradient(180deg, #171a1f 0%, #050607 48%, #020304 100%) !important;
        color: #fff !important;
        box-shadow: 0 18px 34px rgba(0,0,0,.42), inset 0 0 0 1px rgba(255,255,255,.05) !important;
        isolation: isolate;
        font-family: "Segoe UI", Arial, sans-serif !important;
      }
      #${CLOCK_ID}.start-digital-clock::before {
        content: "";
        position: absolute;
        z-index: -1;
        inset: 5px 8px auto;
        height: 42%;
        border-radius: 6px;
        background: linear-gradient(180deg, rgba(255,255,255,.08), transparent);
        pointer-events: none;
      }
      #${CLOCK_ID}.start-digital-clock::after {
        content: "";
        position: absolute;
        z-index: -2;
        left: 8%;
        right: 8%;
        bottom: -20px;
        height: 28px;
        border-radius: 50%;
        background: rgba(255, 213, 77, .38);
        filter: blur(17px);
        pointer-events: none;
      }
      #${CLOCK_ID}[hidden] { display: none !important; }
      #${CLOCK_ID} .digital-clock-day,
      #${CLOCK_ID} .digital-clock-date { min-width: 0; }
      #${CLOCK_ID} .digital-clock-day strong {
        display: block;
        color: #f64ce7;
        font-size: clamp(20px, 1.9vw, 30px);
        font-weight: 1000;
        line-height: 1.08;
        text-shadow: 0 0 10px rgba(246,76,231,.42);
        white-space: nowrap;
      }
      #${CLOCK_ID} .digital-clock-time {
        min-width: 0;
        display: flex;
        align-items: center;
        justify-content: center;
        font-family: "Arial Black", "Segoe UI Black", "Courier New", monospace;
        font-size: clamp(68px, 6.8vw, 104px);
        font-weight: 1000;
        line-height: .86;
        letter-spacing: -.08em;
        white-space: nowrap;
        font-variant-numeric: tabular-nums;
        background: linear-gradient(90deg, #ff46dd 0%, #ff6f47 23%, #ffe84f 48%, #8eff5c 73%, #4eeaff 100%);
        -webkit-background-clip: text;
        background-clip: text;
        color: transparent;
        filter: drop-shadow(0 0 7px rgba(255,220,80,.22));
      }
      #${CLOCK_ID} .digital-clock-colon {
        margin: 0 .04em 0 .08em;
        color: #ffe44c;
        -webkit-text-fill-color: #ffe44c;
        text-shadow: 0 0 9px rgba(255,228,76,.42);
      }
      #${CLOCK_ID} .digital-clock-date {
        display: grid;
        gap: 3px;
        justify-items: end;
        text-align: right;
      }
      #${CLOCK_ID} .digital-clock-date-day,
      #${CLOCK_ID} .digital-clock-date-month {
        display: block;
        color: #4eeaff;
        font-family: "Arial Black", "Segoe UI Black", "Courier New", monospace;
        font-weight: 1000;
        line-height: 1.02;
        text-shadow: 0 0 10px rgba(78,234,255,.34);
        white-space: nowrap;
      }
      #${CLOCK_ID} .digital-clock-date-day { font-size: clamp(20px, 1.9vw, 30px); }
      #${CLOCK_ID} .digital-clock-date-month { font-size: clamp(17px, 1.55vw, 24px); }
      @media (max-width: 720px) {
        #${CLOCK_ID}.start-digital-clock {
          min-height: 120px !important;
          padding: 14px 12px !important;
          grid-template-columns: minmax(90px,1fr) minmax(180px,1.8fr) minmax(105px,1fr) !important;
          gap: 9px !important;
        }
        #${CLOCK_ID} .digital-clock-time { font-size: clamp(48px, 12vw, 72px); }
        #${CLOCK_ID} .digital-clock-day strong,
        #${CLOCK_ID} .digital-clock-date-day { font-size: clamp(14px, 3.7vw, 20px); }
        #${CLOCK_ID} .digital-clock-date-month { font-size: clamp(12px, 3.1vw, 17px); }
      }
      @media (max-width: 480px) {
        #${CLOCK_ID}.start-digital-clock {
          grid-template-columns: 1fr 1.8fr 1fr !important;
          min-height: 102px !important;
          margin-bottom: 18px !important;
        }
        #${CLOCK_ID} .digital-clock-time { font-size: 43px; }
        #${CLOCK_ID} .digital-clock-day strong,
        #${CLOCK_ID} .digital-clock-date-day { font-size: 12px; }
        #${CLOCK_ID} .digital-clock-date-month { font-size: 10px; }
      }`;
    document.head.appendChild(style);
  }

  function ensureDigitalClock() {
    ensureClockStyle();
    let clock = document.getElementById(CLOCK_ID);
    if (!clock) {
      clock = document.createElement("section");
      clock.id = CLOCK_ID;
      clock.className = "start-weather-header-clock start-digital-clock";
      clock.setAttribute("aria-label", "Digitale klok met dag en datum");
      clock.innerHTML = `
        <div class="digital-clock-day"><strong data-digital-day>---</strong></div>
        <div class="digital-clock-time" data-digital-time aria-label="Huidige tijd">
          <span data-digital-hour>00</span><span class="digital-clock-colon">:</span><span data-digital-minute>00</span>
        </div>
        <div class="digital-clock-date">
          <strong class="digital-clock-date-day" data-digital-date-day>0</strong>
          <strong class="digital-clock-date-month" data-digital-date-month>Maand</strong>
        </div>`;
      const primary = document.getElementById("publicPrimaryActions");
      if (primary?.parentElement === app) primary.before(clock);
      else app.prepend(clock);
    }
    return clock;
  }

  function capitalize(value) {
    const text = String(value || "").trim();
    return text ? text.charAt(0).toUpperCase() + text.slice(1) : "";
  }

  function renderClock() {
    const clock = ensureDigitalClock();
    const visible = document.body.classList.contains("public-portal-mode") && !app.hidden;
    clock.hidden = !visible;
    if (!visible) return;

    const parts = new Intl.DateTimeFormat("nl-NL", {
      timeZone: TIME_ZONE,
      weekday: "long",
      day: "numeric",
      month: "long",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23"
    }).formatToParts(new Date());
    const read = (type) => parts.find((part) => part.type === type)?.value || "";
    clock.querySelector("[data-digital-day]").textContent = capitalize(read("weekday"));
    clock.querySelector("[data-digital-hour]").textContent = read("hour").padStart(2, "0");
    clock.querySelector("[data-digital-minute]").textContent = read("minute").padStart(2, "0");
    clock.querySelector("[data-digital-date-day]").textContent = String(Number(read("day")) || read("day"));
    clock.querySelector("[data-digital-date-month]").textContent = capitalize(read("month"));
  }

  function start() {
    renderClock();
    if (clockTimer) return;
    clockTimer = window.setInterval(renderClock, 1000);
  }

  window.addEventListener("public-portal-ready", start);
  window.addEventListener("rooster-unlocked", (event) => {
    if (event?.detail?.publicPortal) start();
  });
  if (!app.hidden) start();
})();
