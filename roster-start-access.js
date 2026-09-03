(() => {
  "use strict";

  const VERSION = "20260903-75";
  const app = document.getElementById("app");
  const searchCard = document.querySelector(".search-card");
  const detachedAuthTrigger = document.getElementById("continueButton");
  if (!app || !detachedAuthTrigger) return;

  const KCD_LINKS = Object.freeze([
    Object.freeze({
      label: "Hoofd Pagina",
      href: "https://wijzijnkcd.sharepoint.com/"
    }),
    Object.freeze({
      label: "Nieuws",
      href: "https://wijzijnkcd.sharepoint.com/_layouts/15/news.aspx?title=Nieuws&newsSource=3&instanceId=9cfbacd7-8861-4d94-b593-4268b36a165b&webPartId=8c88f208-6c77-4bdb-86a0-0c47b4316588&serverRelativeUrl=%2FSitePages%2FHome.aspx&pagesListId=5d923cc9-9536-49ed-9383-bebf20d98b42&locale=nl-nl"
    }),
    Object.freeze({
      label: "Salaris, declaraties & vergoedingen",
      href: "https://wijzijnkcd.sharepoint.com/sites/team-hr/SitePages/Salaris,-declaraties-%26-vergoedingen.aspx?locale=nl-nl#uitleg-salarisstrook"
    }),
    Object.freeze({
      label: "Ziek en beter melden",
      href: "https://wijzijnkcd.sharepoint.com/sites/formulieren/?locale=nl-nl#ziek-en-beter-melden"
    }),
    Object.freeze({
      label: "Help, ik heb een storing",
      href: "https://wijzijnkcd.sharepoint.com/sites/storing-melden?locale=nl-nl"
    }),
    Object.freeze({
      label: "Langer doorgewerkt ?",
      href: "https://wijzijnkcd.sharepoint.com/sites/formulieren/SitePages/Langer-Doorgewerkt.aspx"
    })
  ]);

  const PRIVATE_STYLES = [
    "roster-extras.css",
    "team-contacts.css",
    "traffic-schedule.css",
    "break-calculator.css",
    "personal-month.css"
  ];

  const PRIVATE_SCRIPTS = [
    "roster-controller.js",
    "annual-bootstrap.js",
    "month-access-fix.js",
    "annual-archive.js",
    "timezone-background.js",
    "agenda-export-core.js",
    "agenda-timezone.js",
    "sunday-dayoff.js",
    "workers-view.js",
    "traffic-schedule.js",
    "next-shift.js",
    "team-contacts.js",
    "break-calculator.js",
    "screenshot-theme.js",
    "personal-month.js"
  ];

  let privateModulesPromise = null;
  let authInProgress = false;
  let rosterButton = null;

  function hasAsset(selector, baseName, attribute) {
    return [...document.querySelectorAll(selector)].some((element) => {
      const value = element.getAttribute(attribute) || "";
      return value === baseName || value.startsWith(`${baseName}?`);
    });
  }

  function loadStyle(href) {
    if (hasAsset('link[rel="stylesheet"]', href, "href")) return;
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = `${href}?v=${VERSION}`;
    link.dataset.roosterPrivateAsset = "true";
    document.head.appendChild(link);
  }

  function loadScript(src) {
    if (hasAsset("script[src]", src, "src")) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = `${src}?v=${VERSION}`;
      script.async = false;
      script.dataset.roosterPrivateAsset = "true";
      script.addEventListener("load", resolve, { once: true });
      script.addEventListener("error", () => reject(new Error(`Kon ${src} niet laden.`)), { once: true });
      document.body.appendChild(script);
    });
  }

  function loadPrivateModules() {
    if (privateModulesPromise) return privateModulesPromise;
    privateModulesPromise = (async () => {
      PRIVATE_STYLES.forEach(loadStyle);
      for (const src of PRIVATE_SCRIPTS) await loadScript(src);
    })();
    return privateModulesPromise;
  }

  function closeKcdIntranet(section) {
    const button = section?.querySelector("#kcdIntranetButton");
    const panel = section?.querySelector("#kcdIntranetPanel");
    if (!button || !panel) return;
    panel.hidden = true;
    button.setAttribute("aria-expanded", "false");
    section.classList.remove("is-open");
  }

  function ensureKcdIntranetSection() {
    let section = document.getElementById("kcdIntranetSection");
    if (section) return section;

    section = document.createElement("section");
    section.id = "kcdIntranetSection";
    section.className = "kcd-intranet-section roster-only-start";
    section.setAttribute("aria-labelledby", "kcdIntranetTitle");

    const title = document.createElement("h2");
    title.id = "kcdIntranetTitle";
    title.className = "kcd-intranet-title";
    title.textContent = "Wij Zijn KCD";

    const button = document.createElement("button");
    button.id = "kcdIntranetButton";
    button.className = "today-workers-button public-roster-button kcd-intranet-button";
    button.type = "button";
    button.setAttribute("aria-expanded", "false");
    button.setAttribute("aria-controls", "kcdIntranetPanel");
    button.innerHTML = `
      <span class="public-roster-button-main">
        <span class="public-roster-button-icon kcd-intranet-icon" aria-hidden="true">⌂</span>
        <span class="public-roster-button-copy"><strong>KCD Intranet</strong></span>
      </span>
      <span class="public-roster-arrow kcd-intranet-arrow" aria-hidden="true">⌄</span>`;

    const panel = document.createElement("div");
    panel.id = "kcdIntranetPanel";
    panel.className = "kcd-intranet-panel";
    panel.hidden = true;

    for (const item of KCD_LINKS) {
      const row = document.createElement("div");
      row.className = "kcd-intranet-item";

      const link = document.createElement("a");
      link.className = "kcd-intranet-link";
      link.href = item.href;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      link.textContent = item.label;
      link.setAttribute("aria-label", `${item.label} openen in nieuw tabblad`);

      const arrow = document.createElement("span");
      arrow.className = "kcd-intranet-link-arrow";
      arrow.setAttribute("aria-hidden", "true");
      arrow.textContent = "↗";
      link.appendChild(arrow);

      row.appendChild(link);
      panel.appendChild(row);
    }

    section.append(title, button, panel);

    button.addEventListener("click", () => {
      const open = panel.hidden;
      panel.hidden = !open;
      button.setAttribute("aria-expanded", String(open));
      section.classList.toggle("is-open", open);
    });

    document.addEventListener("click", (event) => {
      if (!section.contains(event.target)) closeKcdIntranet(section);
    });

    document.addEventListener("keydown", (event) => {
      if (event.key !== "Escape" || panel.hidden) return;
      closeKcdIntranet(section);
      button.focus();
    });

    return section;
  }

  function positionPublicStartSections(row) {
    const salary = document.getElementById("publicSalarySection");
    const kcd = ensureKcdIntranetSection();

    if (salary?.parentElement === app) {
      salary.after(kcd);
      kcd.after(row);
      return;
    }

    if (!row.isConnected) {
      if (searchCard?.parentElement === app) searchCard.before(row);
      else app.prepend(row);
    }
    row.before(kcd);
  }

  function ensureQuickActions() {
    let row = document.getElementById("publicPortalQuickActions");
    if (!row) {
      row = document.createElement("section");
      row.id = "publicPortalQuickActions";
      row.className = "public-portal-quick-actions roster-only-start";
    } else {
      row.classList.add("roster-only-start");
    }

    rosterButton = document.getElementById("publicRosterButton");
    if (!rosterButton) {
      rosterButton = document.createElement("button");
      rosterButton.id = "publicRosterButton";
      rosterButton.className = "today-workers-button public-roster-button";
      rosterButton.type = "button";
      rosterButton.setAttribute("aria-label", "Rooster openen");
      rosterButton.innerHTML = `
        <span class="public-roster-button-main">
          <span class="public-roster-button-icon" aria-hidden="true">▦</span>
          <span class="public-roster-button-copy">
            <strong>Rooster</strong>
          </span>
        </span>
        <span class="public-roster-arrow" aria-hidden="true">›</span>`;
      row.appendChild(rosterButton);
      rosterButton.addEventListener("click", openRosterAccess);
    }

    positionPublicStartSections(row);
    return row;
  }

  async function openRosterAccess() {
    if (document.body.classList.contains("roster-access-active")) {
      searchCard?.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }
    if (authInProgress) return;

    authInProgress = true;
    if (rosterButton) rosterButton.disabled = true;

    // Het openbare portaal verdwijnt tijdelijk achter de beveiligde login.
    // Hierdoor kan roster-controller pas een echte unlock zien na succesvolle decryptie.
    app.hidden = true;

    try {
      await loadPrivateModules();
      detachedAuthTrigger.click();
    } catch (error) {
      console.error(error);
      authInProgress = false;
      app.hidden = false;
      if (rosterButton) rosterButton.disabled = false;
    }
  }

  function activateRosterArea(event) {
    if (event?.detail?.publicPortal) {
      ensureQuickActions();
      return;
    }
    if (!authInProgress) return;

    authInProgress = false;
    document.body.classList.remove("public-portal-mode");
    document.body.classList.add("roster-access-active");
    app.hidden = false;
    if (rosterButton) rosterButton.disabled = false;

    requestAnimationFrame(() => {
      searchCard?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }

  window.addEventListener("rooster-unlocked", activateRosterArea);

  if (!app.hidden) ensureQuickActions();
})();
