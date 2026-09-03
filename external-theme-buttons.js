(() => {
  "use strict";

  const SOURCE_STYLE_ID = "roosterCustomThemeOverrides";
  const OVERRIDE_STYLE_ID = "externalThemeButtonOverrides";

  function selectedButtonColor() {
    const source = document.getElementById(SOURCE_STYLE_ID);
    const css = source?.textContent || "";
    if (!css) return "";

    const match = css.match(/\.today-workers-button[\s\S]*?\{[\s\S]*?background:\s*(#[0-9a-fA-F]{6})\s*!important/);
    return match?.[1] || "";
  }

  function syncExternalButtons() {
    const color = selectedButtonColor();
    let style = document.getElementById(OVERRIDE_STYLE_ID);

    if (!color || document.documentElement.dataset.roosterCustomTheme !== "true") {
      style?.remove();
      return;
    }

    const desiredCss = `
:root[data-rooster-custom-theme="true"] .external-site-link,
:root[data-rooster-custom-theme="true"] .public-salary-button,
:root[data-rooster-custom-theme="true"] .public-salary-history {
  background: ${color} !important;
  border-color: ${color} !important;
}
:root[data-rooster-custom-theme="true"] .external-site-link:hover,
:root[data-rooster-custom-theme="true"] .public-salary-button:hover,
:root[data-rooster-custom-theme="true"] .public-salary-history:hover {
  background: color-mix(in srgb, ${color} 86%, black) !important;
  border-color: color-mix(in srgb, ${color} 86%, black) !important;
}`;

    if (!style) {
      style = document.createElement("style");
      style.id = OVERRIDE_STYLE_ID;
      style.textContent = desiredCss;
      document.head.appendChild(style);
      return;
    }

    if (style.textContent !== desiredCss) style.textContent = desiredCss;
  }

  const observer = new MutationObserver(syncExternalButtons);
  observer.observe(document.head, { childList: true, subtree: true, characterData: true });

  window.addEventListener("rooster-theme-standard-restored", syncExternalButtons);
  syncExternalButtons();
})();
