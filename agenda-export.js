(() => {
  "use strict";

  const VERSION = "20260910-public";

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
    document.head.appendChild(link);
  }

  function loadScript(src) {
    if (hasAsset("script[src]", src, "src")) return;
    const script = document.createElement("script");
    script.src = `${src}?v=${VERSION}`;
    script.async = false;
    document.body.appendChild(script);
  }

  // Alleen openbare, niet-roostergebonden onderdelen worden nog geladen.
  loadStyle("theme.css");
  loadStyle("theme-customizer.css");
  loadStyle("theme-customizer-colors.css");
  loadStyle("theme-quick-choices.css");
  loadStyle("background-contrast.css");
  loadStyle("background-brightness.css");
  loadStyle("external-sites.css");
  loadStyle("effects.css");
  loadStyle("effect-combinations.css");
  loadStyle("holiday-scenes.css");
  loadStyle("visual-audio-controls.css");
  loadStyle("video-library.css");
  loadStyle("public-portal.css");
  loadStyle("start-weather.css");
  loadStyle("start-weather-layout-fix.css");
  loadStyle("occasion-auto.css");
  loadStyle("adaptive-layout.css");

  loadScript("theme.js");
  loadScript("theme-customizer.js");
  loadScript("theme-background-color.js");
  loadScript("external-theme-buttons.js");
  loadScript("theme-quick-choices.js");
  loadScript("background-brightness.js");
  loadScript("external-sites.js");
  loadScript("wallboard-window.js");
  loadScript("external-sites-tweaks.js");
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
  loadScript("video-library-ui.js");
  loadScript("video-popup-size.js");
  loadScript("video-effect-sync.js");
  loadScript("video-iframe-test.js");
  loadScript("occasion-auto.js");
  loadScript("birthday-effect-guard.js");
  loadScript("holiday-video-auto.js");
  loadScript("video-auto-close.js");
  loadScript("public-portal.js");
  loadScript("start-weather.js");
  loadScript("weather-display-cleanup.js");
  loadScript("start-weather-layout-fix.js");
})();
