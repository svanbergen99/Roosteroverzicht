(() => {
  "use strict";

  const VERSION = "20260903-69";
  const app = document.getElementById("app");
  const searchCard = document.querySelector(".search-card");
  const detachedAuthTrigger = document.getElementById("continueButton");
  if (!app || !detachedAuthTrigger) return;

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

  function ensureQuickActions() {
    let row = document.getElementById("publicPortalQuickActions");
    if (!row) {
      row = document.createElement("section");
      row.id = "publicPortalQuickActions";
      row.className = "public-portal-quick-actions roster-only-start";

      const salary = document.getElementById("publicSalarySection");
      if (salary?.parentElement === app) salary.before(row);
      else if (searchCard?.parentElement === app) searchCard.before(row);
      else app.prepend(row);
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
