(() => {
  "use strict";

  const VERSION = "20260906-77";
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

  function privateConfig() {
    return window.RoosterPrivateConfig && typeof window.RoosterPrivateConfig === "object"
      ? window.RoosterPrivateConfig
      : null;
  }

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
    link.dataset.rosterPrivateAsset = "true";
    document.head.appendChild(link);
  }

  function loadScript(src) {
    if (hasAsset("script[src]", src, "src")) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = `${src}?v=${VERSION}`;
      script.async = false;
      script.dataset.rosterPrivateAsset = "true";
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

  function closeIntranet(section) {
    const button = section?.querySelector("#intranetButton");
    const panel = section?.querySelector("#intranetPanel");
    if (!button || !panel) return;
    panel.hidden = true;
    button.setAttribute("aria-expanded", "false");
    section.classList.remove("is-open");
  }

  function ensureIntranetSection() {
    const config = privateConfig();
    const links = Array.isArray(config?.intranetLinks) ? config.intranetLinks : [];
    if (!links.length) {
      document.getElementById("intranetSection")?.remove();
      return null;
    }

    const organization = config.organization || {};
    const title = String(organization.intranetTitle || "Intranet").trim();
    const subtitle = String(organization.intranetSubtitle || "").trim();
    let section = document.getElementById("intranetSection");
    if (section) return section;

    section = document.createElement("section");
    section.id = "intranetSection";
    section.className = "intranet-section roster-only-start";
    section.setAttribute("aria-label", subtitle || title);

    const button = document.createElement("button");
    button.id = "intranetButton";
    button.className = "today-workers-button public-roster-button intranet-button";
    button.type = "button";
    button.setAttribute("aria-expanded", "false");
    button.setAttribute("aria-controls", "intranetPanel");
    button.innerHTML = `
      <span class="public-roster-button-main">
        <span class="public-roster-button-icon intranet-icon" aria-hidden="true">⌂</span>
        <span class="public-roster-button-copy">
          <strong>${title}</strong>
          ${subtitle ? `<small>${subtitle}</small>` : ""}
        </span>
      </span>
      <span class="public-roster-arrow intranet-arrow" aria-hidden="true">⌄</span>`;

    const panel = document.createElement("div");
    panel.id = "intranetPanel";
    panel.className = "intranet-panel";
    panel.hidden = true;

    for (const item of links) {
      const href = String(item?.href || "").trim();
      const label = String(item?.label || "").trim();
      if (!href || !label) continue;
      const row = document.createElement("div");
      row.className = "intranet-item";
      const link = document.createElement("a");
      link.className = "intranet-link";
      link.href = href;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      link.textContent = label;
      link.setAttribute("aria-label", `${label} openen in nieuw tabblad`);
      const arrow = document.createElement("span");
      arrow.className = "intranet-link-arrow";
      arrow.setAttribute("aria-hidden", "true");
      arrow.textContent = "↗";
      link.appendChild(arrow);
      row.appendChild(link);
      panel.appendChild(row);
    }

    section.append(button, panel);
    button.addEventListener("click", () => {
      const open = panel.hidden;
      panel.hidden = !open;
      button.setAttribute("aria-expanded", String(open));
      section.classList.toggle("is-open", open);
    });
    document.addEventListener("click", (event) => {
      if (!section.contains(event.target)) closeIntranet(section);
    });
    document.addEventListener("keydown", (event) => {
      if (event.key !== "Escape" || panel.hidden) return;
      closeIntranet(section);
      button.focus();
    });
    return section;
  }

  function ensurePrimaryActionsRow() {
    let primary = document.getElementById("publicPrimaryActions");
    if (!primary) {
      primary = document.createElement("section");
      primary.id = "publicPrimaryActions";
      primary.className = "public-primary-actions roster-only-start";
      if (searchCard?.parentElement === app) searchCard.before(primary);
      else app.prepend(primary);
    }
    return primary;
  }

  function positionPublicStartSections(row, attempt = 0) {
    const primary = ensurePrimaryActionsRow();
    const salary = document.getElementById("publicSalarySection");
    const intranet = ensureIntranetSection();
    if (salary) primary.appendChild(salary);
    if (intranet) primary.appendChild(intranet);
    primary.appendChild(row);
    if (!salary && attempt < 20) setTimeout(() => positionPublicStartSections(row, attempt + 1), 100);
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
          <span class="public-roster-button-copy"><strong>Rooster</strong></span>
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
    requestAnimationFrame(() => searchCard?.scrollIntoView({ behavior: "smooth", block: "start" }));
  }

  window.addEventListener("rooster-private-config-ready", () => ensureQuickActions());
  window.addEventListener("rooster-unlocked", activateRosterArea);
  if (!app.hidden) ensureQuickActions();
})();