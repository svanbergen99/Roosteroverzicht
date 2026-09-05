(() => {
  "use strict";

  const VERSION = "20260905-141";
  const FILE_MONTHS = ["Januari","Februari","Maart","April","Mei","Juni","Juli","Augustus","September","Oktober","November","December"];
  const MONTH_FILE_RE = /^Roosterindex_(Januari|Februari|Maart|Mei|Juni|Juli|Augustus|September|Oktober|November|December|April)\.json$/i;

  function currentAmsterdamMonth() {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Europe/Amsterdam",
      year: "numeric",
      month: "2-digit"
    }).formatToParts(new Date());
    const year = parts.find((part) => part.type === "year")?.value || "";
    const month = parts.find((part) => part.type === "month")?.value || "";
    return `${year}-${month}`;
  }

  function currentAmsterdamYear() {
    return currentAmsterdamMonth().slice(0, 4);
  }

  function shiftMonth(monthKey, amount) {
    const [year, month] = monthKey.split("-").map(Number);
    const date = new Date(Date.UTC(year, month - 1 + amount, 1));
    return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
  }

  function monthFile(monthKey) {
    const month = Number(monthKey.slice(5, 7));
    return `Roosterindex_${FILE_MONTHS[month - 1]}.json`;
  }

  function yearSuffixedMonthUrl(inputUrl) {
    try {
      const parsed = new URL(String(inputUrl), window.location.href);
      const parts = parsed.pathname.split("/");
      const basename = parts.at(-1) || "";
      const match = basename.match(MONTH_FILE_RE);
      if (!match) return "";
      parts[parts.length - 1] = `Roosterindex_${match[1]}_${currentAmsterdamYear()}.json`;
      parsed.pathname = parts.join("/");
      return parsed.href;
    } catch (_) {
      return "";
    }
  }

  if (!window.__roosterRawFetch) window.__roosterRawFetch = window.fetch.bind(window);

  if (!window.__roosterYearFilenameCompat) {
    const rawFetch = window.__roosterRawFetch;
    window.__roosterNativeFetch = async function compatibleRosterFetch(input, init) {
      const url = typeof input === "string" ? input : input?.url || "";
      const yearUrl = yearSuffixedMonthUrl(url);
      if (!yearUrl) return rawFetch(input, init);
      const response = await rawFetch(yearUrl, init);
      if (response.status !== 404) return response;
      return rawFetch(input, init);
    };
    window.__roosterYearFilenameCompat = true;
  }

  if (!window.__roosterAutoFetchPatched) {
    const nativeFetch = window.__roosterNativeFetch;
    window.fetch = async function autoMonthFetch(input, init) {
      const url = typeof input === "string" ? input : input?.url || "";
      if (!/Roosterindex_September\.json(?:[?#]|$)/i.test(url)) return nativeFetch(input, init);
      const current = currentAmsterdamMonth();
      const candidates = [current, shiftMonth(current, -1), shiftMonth(current, 1)];
      for (const monthKey of candidates) {
        const target = String(url).replace(/Roosterindex_September\.json/i, monthFile(monthKey));
        const response = await nativeFetch(target, init);
        if (response.status === 404) continue;
        return response;
      }
      return nativeFetch(String(url).replace(/Roosterindex_September\.json/i, monthFile(current)), init);
    };
    window.__roosterAutoFetchPatched = true;
  }

  function hasAsset(selector, baseName, attribute) {
    return [...document.querySelectorAll(selector)].some((element) => {
      const value = element.getAttribute(attribute) || "";
      return value === baseName || value.startsWith(`${baseName}?`);
    });
  }

  function loadStyle(href) {
    if (hasAsset("link[rel=\"stylesheet\"]", href, "href")) return;
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = `${href}?v=${VERSION}`;
    document.head.appendChild(link);
  }

  function loadScript(src) {
    if (hasAsset("script[src]", src, "src")) return;
    const script = document.createElement("script");
    script.src = `${src}?v=${VERSION}`;
    script.async = false;
    document.body.appendChild(script);
  }

  loadStyle("theme.css");
  loadStyle("theme-customizer.css");
  loadStyle("theme-customizer-colors.css");
  loadStyle("theme-quick-choices.css");
  loadStyle("background-contrast.css");
  loadStyle("background-brightness.css");
  loadStyle("external-sites.css");
  loadStyle("traffic-live.css");
  loadStyle("public-salary-payments.css");
  loadStyle("effects.css");
  loadStyle("effect-combinations.css");
  loadStyle("holiday-scenes.css");
  loadStyle("visual-audio-controls.css");
  loadStyle("video-library.css");
  loadStyle("permission-auth.css");
  loadStyle("roster-start-access.css");
  loadStyle("roster-action-row.css");
  loadStyle("public-portal.css");
  loadStyle("start-weather.css");
  loadStyle("start-weather-layout-fix.css");
  loadStyle("occasion-auto.css");

  loadScript("access-permissions.js");
  loadScript("permission-auth.js");
  loadScript("wfm-login-bridge.js");
  loadScript("theme.js");
  loadScript("theme-customizer.js");
  loadScript("theme-background-color.js");
  loadScript("external-theme-buttons.js");
  loadScript("theme-quick-choices.js");
  loadScript("background-brightness.js");
  loadScript("public-salary-payments.js");
  loadScript("external-sites.js");
  loadScript("wallboard-window.js");
  loadScript("traffic-live.js");
  loadScript("leave-source-filename.js");
  loadScript("external-sites-tweaks.js");
  loadScript("leave-overview-extra.js");
  loadScript("leave-manual-primary.js");
  loadScript("video-effect-performance.js");
  loadScript("effects.js");
  loadScript("effect-combinations.js");
  loadScript("holiday-effect-auto.js");
  loadScript("holiday-scenes.js");
  loadScript("birthday-scene.js");
  loadScript("payday-effect.js");
  loadScript("payday-static-scene.js");
  loadScript("payday-manual-guard.js");
  loadScript("visual-audio-controls.js");
  loadScript("video-section-fullscreen-guard.js");
  loadScript("video-library-ui.js");
  loadScript("video-popup-size.js");
  loadScript("video-fullscreen-effects.js");
  loadScript("video-effect-sync.js");
  loadScript("occasion-auto.js");
  loadScript("birthday-effect-guard.js");
  loadScript("holiday-video-auto.js");
  loadScript("video-auto-close.js");
  loadScript("roster-start-access.js");
  loadScript("public-portal.js");
  loadScript("start-weather.js");
  loadScript("weather-display-cleanup.js");
  loadScript("start-weather-layout-fix.js");
  loadScript("roster-home-button.js");
})();