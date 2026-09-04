(() => {
  "use strict";

  const LEAVE_REQUEST = Object.freeze({
    label: "Verlof aanvragen",
    url: "https://forms.cloud.microsoft/Pages/ResponsePage.aspx?Host=Teams&lang=%7Blocale%7D&groupId=%7BgroupId%7D&tid=%7Btid%7D&teamsTheme=%7Btheme%7D&upn=%7Bupn%7D&id=EvJ-w6PUtkSS3w0d_4VgT5msSQM886ZJrZo0XE5plspUQ0wyN0VLOUMzVTM0UldKMEtLNUtZWlMwNyQlQCN0PWcu"
  });

  const GROUPS = Object.freeze([
    Object.freeze({
      title: "Belangrijke Websites Werk",
      links: Object.freeze([
        Object.freeze({ label: "1MDW", url: "https://azkrplbs001.az.unix.corp:44300/sap(bD1ubCZjPTEwMCZkPW1pbg==)/bc/bsp/sap/crm_ui_start/default.htm" }),
        Object.freeze({ label: "Compliance Check", url: "https://svanbergen99.github.io/Checklist/" }),
        LEAVE_REQUEST,
        Object.freeze({ label: "Beschikbaarheid Berekenen", url: "./ASES_Roosterplanner.html", internal: true }),
        Object.freeze({ label: "Brein", url: "https://brein-sio-particulier.custhelp.com/app/home/" }),
        Object.freeze({ label: "Beschikbaarheid Doorgeven", url: "https://genesyswfm.hosting.corp/Puntensysteem" }),
        Object.freeze({ label: "Rooster", url: "https://genesyswfm.hosting.corp/wfm/Login.jsp" }),
        Object.freeze({ label: "Wall board", url: "https://achmea-production-1-a3srealtime-eu-west-1-prod.kb.eu-west-1.aws.found.io/s/centraal-beheer/app/dashboards#/view/731a7b2c-c25f-4ff6-a032-5f62ef6d2272?_g=(filters:!())" }),
        Object.freeze({ label: "Noodprocedure formulier", url: "https://achmea.sharepoint.com/sites/SP-15261/Noodprocedures/Noodprocedures.aspx", warning: "Alleen gebruiken als Traffic toestemming geeft" }),
        Object.freeze({ label: "Werkbriefjes / Loonstrook", url: "https://klantcontactdiensten.nocore.nl/" }),
        Object.freeze({ label: "NPS", url: "https://dashboards.insights.metrixlab.com/Account/Login?ReturnUrl=%2fDashboard%2fDashboard%2f%3fProjectId%3d48316%26ProjectDashboardId%3d22&ProjectId=48316&ProjectDashboardId=22" }),
        Object.freeze({ label: "Meldcode opvragen", url: "https://auto.dispatch.nl" }),
        Object.freeze({ label: "RoyData", url: "https://portal.stichting-eps.nl/login" })
      ])
    }),
    Object.freeze({
      title: "Belangrijke Websites",
      links: Object.freeze([
        Object.freeze({ label: "Blije Klanten Box", url: "https://giftshopcentraalbeheer.nl/login" }),
        Object.freeze({ label: "Afschrijflijst Woon verzekering", url: "https://www.centraalbeheer.nl/-/media/files/prive/verzekeringen/woonverzekering/afschrijvingslijst.pdf" }),
        Object.freeze({ label: "WOZ Waardeloket", url: "https://www.wozwaardeloket.nl/" }),
        Object.freeze({ label: "Kadastriaalekaart", url: "https://kadastralekaart.com/" }),
        Object.freeze({ label: "Kenteken Check", url: "https://www.centraalbeheer.nl/verzekeringen/autoverzekering/kentekencheck" }),
        Object.freeze({ label: "RDW", url: "https://www.rdw.nl/" }),
        Object.freeze({ label: "Finnik", url: "https://finnik.nl/" })
      ])
    })
  ]);

  const app = document.getElementById("app");
  if (!app) return;

  const CLOCK_ID = "startHeaderClock";
  const CLOCK_STYLE_ID = "startDigitalClockStyle";
  const TIME_ZONE = "Europe/Amsterdam";
  let clockTimer = 0;

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function linkHtml(link) {
    const meta = link.internal ? "Opent planner ↗" : "Opent extern ↗";
    const warning = link.warning
      ? `<span class="external-site-warning">⚠ ${escapeHtml(link.warning)}</span>`
      : `<span class="external-site-meta">${meta}</span>`;
    return `
      <a class="external-site-link${link.warning ? " is-warning" : ""}"
         href="${escapeHtml(link.url)}"
         target="_blank"
         rel="noopener noreferrer">
        <strong>${escapeHtml(link.label)}</strong>
        ${warning}
      </a>`;
  }

  function ensureSection() {
    let section = document.getElementById("externalSitesSection");
    if (section) return section;

    section = document.createElement("section");
    section.id = "externalSitesSection";
    section.className = "external-sites-card";
    section.innerHTML = `
      <div class="external-sites-head">
        <div>
          <h1>Externe Websites</h1>
          <p>Handige werklocaties. Iedere knop opent in een nieuw tabblad.</p>
        </div>
      </div>
      <div class="external-sites-groups">
        ${GROUPS.map((group) => `
          <section class="external-sites-group">
            <h2>${escapeHtml(group.title)}</h2>
            <div class="external-sites-grid">
              ${group.links.map(linkHtml).join("")}
            </div>
          </section>`).join("")}
      </div>`;

    app.appendChild(section);
    return section;
  }

  function ensureClockStyle() {
    if (document.getElementById(CLOCK_STYLE_ID)) return;
    const style = document.createElement("style");
    style.id = CLOCK_STYLE_ID;
    style.textContent = `
      #${CLOCK_ID}.start-digital-clock {
        position: relative !important;
        top: auto !important;
        right: auto !important;
        left: auto !important;
        z-index: 3 !important;
        width: min(760px, calc(100% - 24px)) !important;
        min-width: 0 !important;
        min-height: 154px !important;
        margin: 0 auto 24px !important;
        padding: 18px 24px !important;
        display: grid !important;
        grid-template-columns: minmax(150px, 1.05fr) minmax(270px, 2fr) minmax(150px, 1.05fr) !important;
        align-items: center !important;
        gap: 18px !important;
        overflow: visible !important;
        border: 2px solid #20242a !important;
        border-radius: 8px !important;
        background: linear-gradient(180deg, #171a1f 0%, #050607 48%, #020304 100%) !important;
        color: #fff !important;
        box-shadow: 0 18px 34px rgba(0,0,0,.42), inset 0 0 0 1px rgba(255,255,255,.05) !important;
        backdrop-filter: none !important;
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
      #${CLOCK_ID} .digital-clock-date {
        min-width: 0;
      }
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
      #${CLOCK_ID} .digital-clock-date-day {
        font-size: clamp(20px, 1.9vw, 30px);
      }
      #${CLOCK_ID} .digital-clock-date-month {
        font-size: clamp(17px, 1.55vw, 24px);
        text-transform: none;
      }
      @media (max-width: 720px) {
        #${CLOCK_ID}.start-digital-clock {
          width: 100% !important;
          min-height: 120px !important;
          padding: 14px 12px !important;
          grid-template-columns: minmax(90px,1fr) minmax(180px,1.8fr) minmax(105px,1fr) !important;
          gap: 9px !important;
        }
        #${CLOCK_ID} .digital-clock-time { font-size: clamp(48px, 12vw, 72px); }
        #${CLOCK_ID} .digital-clock-day strong { font-size: clamp(14px, 3.7vw, 20px); }
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
        #${CLOCK_ID} .digital-clock-day strong { font-size: 12px; }
        #${CLOCK_ID} .digital-clock-date-day { font-size: 12px; }
        #${CLOCK_ID} .digital-clock-date-month { font-size: 10px; }
      }`;
    document.head.appendChild(style);
  }

  function ensureDigitalClock(section = document.getElementById("externalSitesSection")) {
    ensureClockStyle();
    let clock = document.getElementById(CLOCK_ID);
    if (!clock) {
      clock = document.createElement("section");
      clock.id = CLOCK_ID;
      app.appendChild(clock);
    }

    clock.removeAttribute("data-weather-live-clock");
    clock.className = "start-weather-header-clock start-digital-clock roster-only-start";
    clock.setAttribute("aria-label", "Digitale klok met dag van de week en datum");

    if (!clock.querySelector("[data-digital-time]")) {
      clock.innerHTML = `
        <div class="digital-clock-day">
          <strong data-digital-day>---</strong>
        </div>
        <div class="digital-clock-time" data-digital-time aria-label="Huidige tijd">
          <span data-digital-hour>00</span><span class="digital-clock-colon">:</span><span data-digital-minute>00</span>
        </div>
        <div class="digital-clock-date">
          <strong class="digital-clock-date-day" data-digital-date-day>0</strong>
          <strong class="digital-clock-date-month" data-digital-date-month>Maand</strong>
        </div>`;
    }

    if (section && clock.nextElementSibling !== section) section.before(clock);
    return clock;
  }

  function capitalize(value) {
    const text = String(value || "").trim();
    return text ? text.charAt(0).toUpperCase() + text.slice(1) : "";
  }

  function updateDigitalClock() {
    const section = document.getElementById("externalSitesSection");
    const clock = ensureDigitalClock(section);
    const visible = document.body.classList.contains("public-portal-mode") &&
      !app.hidden &&
      !document.body.classList.contains("roster-login-active") &&
      !document.body.classList.contains("roster-access-active");
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
    const day = clock.querySelector("[data-digital-day]");
    const hour = clock.querySelector("[data-digital-hour]");
    const minute = clock.querySelector("[data-digital-minute]");
    const dateDay = clock.querySelector("[data-digital-date-day]");
    const dateMonth = clock.querySelector("[data-digital-date-month]");
    if (day) day.textContent = capitalize(read("weekday"));
    if (hour) hour.textContent = read("hour").padStart(2, "0");
    if (minute) minute.textContent = read("minute").padStart(2, "0");
    if (dateDay) dateDay.textContent = String(Number(read("day")) || read("day"));
    if (dateMonth) dateMonth.textContent = capitalize(read("month"));
  }

  function startDigitalClock() {
    updateDigitalClock();
    if (clockTimer) return;
    clockTimer = window.setInterval(updateDigitalClock, 1000);
  }

  function start() {
    const section = ensureSection();
    ensureDigitalClock(section);
    startDigitalClock();
  }

  window.addEventListener("rooster-unlocked", start);
  if (!app.hidden) start();
})();