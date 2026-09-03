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
        LEAVE_REQUEST,
        Object.freeze({ label: "1MDW", url: "https://azkrplbs001.az.unix.corp:44300/sap(bD1ubCZjPTEwMCZkPW1pbg==)/bc/bsp/sap/crm_ui_start/default.htm" }),
        Object.freeze({ label: "Brein", url: "https://brein-sio-particulier.custhelp.com/app/home/" }),
        Object.freeze({ label: "Compliance Check", url: "https://svanbergen99.github.io/Checklist/" }),
        Object.freeze({ label: "Rooster", url: "https://genesyswfm.hosting.corp/wfm/Login.jsp" }),
        Object.freeze({ label: "Wall board", url: "https://achmea-production-1-a3srealtime-eu-west-1-prod.kb.eu-west-1.aws.found.io/s/centraal-beheer/app/dashboards#/view/731a7b2c-c25f-4ff6-a032-5f62ef6d2272?_g=(filters:!())" }),
        Object.freeze({ label: "Noodprocedure formulier", url: "https://achmea.sharepoint.com/sites/SP-15261/Noodprocedures/Noodprocedures.aspx", warning: "Alleen gebruiken als Traffic toestemming geeft" }),
        Object.freeze({ label: "Werkbriefjes / Loonstrook", url: "https://klantcontactdiensten.nocore.nl/" }),
        Object.freeze({ label: "NPS", url: "https://dashboards.insights.metrixlab.com/Account/Login?ReturnUrl=%2fDashboard%2fDashboard%2f%3fProjectId%3d48316%26ProjectDashboardId%3d22&ProjectId=48316&ProjectDashboardId=22" })
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
        Object.freeze({ label: "Finnik", url: "https://finnik.nl/" }),
        Object.freeze({ label: "Meldcode opvragen", url: "https://auto.dispatch.nl" })
      ])
    })
  ]);

  const FLOATING_GROUP = GROUPS.find((group) => group.title === "Belangrijke Websites");
  const FLOATING_LINKS = Object.freeze([
    LEAVE_REQUEST,
    ...(FLOATING_GROUP?.links || [])
  ]);
  const app = document.getElementById("app");
  if (!app) return;

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function linkHtml(link) {
    const warning = link.warning
      ? `<span class="external-site-warning">⚠ ${escapeHtml(link.warning)}</span>`
      : '<span class="external-site-meta">Opent extern ↗</span>';
    return `
      <a class="external-site-link${link.warning ? " is-warning" : ""}"
         href="${escapeHtml(link.url)}"
         target="_blank"
         rel="noopener noreferrer">
        <strong>${escapeHtml(link.label)}</strong>
        ${warning}
      </a>`;
  }

  function setFloatingStatus(message, isError = false) {
    const status = document.getElementById("externalFloatingStatus");
    if (!status) return;
    status.textContent = message;
    status.classList.toggle("is-error", isError);
  }

  function floatingWindowStyles() {
    return `
      * { box-sizing: border-box; }
      html, body { margin: 0; min-height: 100%; }
      body {
        padding: 14px;
        background: #f3f5f8;
        color: #172033;
        font-family: Arial, Helvetica, sans-serif;
      }
      .floating-sites-wrap { display: grid; gap: 10px; }
      .floating-sites-head { padding: 2px 2px 6px; }
      .floating-sites-head h1 { margin: 0; font-size: 20px; }
      .floating-sites-head p { margin: 5px 0 0; color: #64748b; font-size: 12.5px; line-height: 1.35; }
      .floating-site-button {
        width: 100%;
        min-height: 50px;
        padding: 11px 12px;
        border: 1px solid #cfc4ce;
        border-radius: 11px;
        background: #fff;
        color: #542450;
        text-align: left;
        font: inherit;
        font-size: 14px;
        font-weight: 800;
        cursor: pointer;
        box-shadow: 0 2px 7px rgba(15, 23, 42, .06);
      }
      .floating-site-button:hover { background: #f4edf3; border-color: #bca9ba; }
      .floating-site-button:focus-visible { outline: 3px solid rgba(123, 47, 115, .22); outline-offset: 2px; }
      .floating-site-button span { float: right; color: #64748b; font-size: 12px; font-weight: 700; }
      @media (prefers-color-scheme: dark) {
        body { background: #151b22; color: #f2f4f7; }
        .floating-sites-head p { color: #aeb8c4; }
        .floating-site-button { background: #1c2530; color: #f0b5e8; border-color: #46515f; }
        .floating-site-button:hover { background: #2b202c; border-color: #665168; }
        .floating-site-button span { color: #aeb8c4; }
      }
    `;
  }

  async function openFloatingSites() {
    if (!FLOATING_LINKS.length) return;

    if (!("documentPictureInPicture" in window)) {
      setFloatingStatus("Deze Edge-versie ondersteunt de zwevende websites niet.", true);
      return;
    }

    const existing = window.documentPictureInPicture.window;
    if (existing && !existing.closed) {
      existing.focus();
      setFloatingStatus("De zwevende websites staan al open.");
      return;
    }

    try {
      const pipWindow = await window.documentPictureInPicture.requestWindow({
        width: 340,
        height: 620,
        preferInitialWindowPlacement: false
      });

      pipWindow.document.title = "Belangrijke Websites";
      pipWindow.document.documentElement.lang = "nl";

      const style = pipWindow.document.createElement("style");
      style.textContent = floatingWindowStyles();
      pipWindow.document.head.appendChild(style);

      pipWindow.document.body.innerHTML = `
        <main class="floating-sites-wrap">
          <div class="floating-sites-head">
            <h1>Belangrijke Websites</h1>
            <p>Dit venster blijft op de voorgrond. Kies een website om die in Edge te openen.</p>
          </div>
          ${FLOATING_LINKS.map((link, index) => `
            <button class="floating-site-button" type="button" data-floating-site="${index}">
              ${escapeHtml(link.label)} <span>↗</span>
            </button>`).join("")}
        </main>`;

      pipWindow.document.querySelectorAll("[data-floating-site]").forEach((button) => {
        button.addEventListener("click", () => {
          const index = Number(button.dataset.floatingSite);
          const link = FLOATING_LINKS[index];
          if (!link?.url) return;
          window.open(link.url, "_blank", "noopener,noreferrer");
        });
      });

      pipWindow.addEventListener("pagehide", () => {
        setFloatingStatus("");
      }, { once: true });

      setFloatingStatus("Zwevende websites geopend.");
    } catch (_) {
      setFloatingStatus("De zwevende overlay is door Edge of het bedrijfsbeleid geblokkeerd.", true);
    }
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
          <h1>Externe websites</h1>
          <p>Handige werklocaties. Iedere knop opent in een nieuw tabblad.</p>
        </div>
        <button id="floatingSitesButton" class="today-workers-button external-floating-button" type="button">Zwevende websites</button>
      </div>
      <div id="externalFloatingStatus" class="external-floating-status" aria-live="polite"></div>
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
    section.querySelector("#floatingSitesButton")?.addEventListener("click", openFloatingSites);
    return section;
  }

  window.addEventListener("rooster-unlocked", ensureSection);
  if (!app.hidden) ensureSection();
})();
