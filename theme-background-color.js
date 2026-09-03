(() => {
  "use strict";

  const CUSTOM_STYLE_ID = "roosterCustomThemeOverrides";
  const ADAPTER_STYLE_ID = "roosterBackgroundColorAdapter";
  let syncing = false;

  function relabelControl() {
    const body = document.getElementById("themeCustomizerAccent");
    const summary = body?.closest("details")?.querySelector("summary");
    if (summary && summary.textContent !== "Achtergrond kleur") summary.textContent = "Achtergrond kleur";
  }

  function selectedBackgroundColor() {
    const source = document.getElementById(CUSTOM_STYLE_ID)?.textContent || "";
    const match = source.match(/--accent:\s*(#[0-9a-f]{6})\s*!important/i);
    return match ? match[1].toUpperCase() : "";
  }

  function adapterCss(color) {
    return `
html:root[data-rooster-custom-theme="true"]:not([data-theme="dark"]) {
  --accent: #7b2f73 !important;
  --accent-dark: #542450 !important;
  --soft-accent: #f4edf3 !important;
  --surface: ${color} !important;
}
html:root[data-rooster-custom-theme="true"][data-theme="dark"] {
  --accent: #c76fbe !important;
  --accent-dark: #e29ad9 !important;
  --soft-accent: #302633 !important;
  --surface: ${color} !important;
}
html:root[data-rooster-custom-theme="true"] body #app .search-card,
html:root[data-rooster-custom-theme="true"] body #app .schedule-card,
html:root[data-rooster-custom-theme="true"] body #app .schedule-head,
html:root[data-rooster-custom-theme="true"] body #app .activities,
html:root[data-rooster-custom-theme="true"] body #app .activity,
html:root[data-rooster-custom-theme="true"] body #app .today-worker-row,
html:root[data-rooster-custom-theme="true"] body #app .personal-month-calendar,
html:root[data-rooster-custom-theme="true"] body #app .external-sites-card,
html:root[data-rooster-custom-theme="true"] body #app .public-salary-panel,
html:root[data-rooster-custom-theme="true"] body #app .public-salary-row,
html:root[data-rooster-custom-theme="true"] body .agenda-help-card,
html:root[data-rooster-custom-theme="true"] body .screenshot-calendar-card {
  background: ${color} !important;
}
html:root[data-rooster-custom-theme="true"] body #app .schedule-card.today {
  border-color: var(--accent) !important;
}
html:root[data-rooster-custom-theme="true"] body #app .schedule-card.today .schedule-head {
  background: ${color} !important;
}
html:root[data-rooster-custom-theme="true"] body input[type="range"] {
  accent-color: var(--accent) !important;
}
`;
  }

  function sync() {
    if (syncing) return;
    syncing = true;
    try {
      relabelControl();
      const color = selectedBackgroundColor();
      let style = document.getElementById(ADAPTER_STYLE_ID);
      if (!color) {
        style?.remove();
        return;
      }
      if (!style) {
        style = document.createElement("style");
        style.id = ADAPTER_STYLE_ID;
        document.head.appendChild(style);
      }
      const css = adapterCss(color);
      if (style.textContent !== css) style.textContent = css;
    } finally {
      syncing = false;
    }
  }

  sync();

  const observer = new MutationObserver(() => queueMicrotask(sync));
  observer.observe(document.head, { childList: true, subtree: true, characterData: true });
  observer.observe(document.body, { childList: true, subtree: true });
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme", "data-rooster-custom-theme"] });

  window.addEventListener("rooster-theme-standard-restored", sync);
})();
