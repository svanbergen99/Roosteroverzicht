(() => {
  "use strict";

  const VERSION = "20260903-61";

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

  /* Openbaar gedeelte: algemene websites, salarisinfo en visuele instellingen. */
  loadStyle("theme.css");
  loadStyle("theme-customizer.css");
  loadStyle("theme-customizer-colors.css");
  loadStyle("theme-quick-choices.css");
  loadStyle("background-contrast.css");
  loadStyle("background-brightness.css");
  loadStyle("external-sites.css");
  loadStyle("public-salary-payments.css");
  loadStyle("effects.css");
  loadStyle("holiday-scenes.css");
  loadStyle("visual-audio-controls.css");
  loadStyle("public-portal.css");

  loadScript("theme.js");
  loadScript("theme-customizer.js");
  loadScript("theme-background-color.js");
  loadScript("external-theme-buttons.js");
  loadScript("theme-quick-choices.js");
  loadScript("background-brightness.js");
  loadScript("public-salary-payments.js");
  loadScript("external-sites.js");
  loadScript("external-sites-tweaks.js");
  loadScript("effects.js");
  loadScript("holiday-scenes.js");
  loadScript("visual-audio-controls.js");
  loadScript("public-portal.js");

  /*
    Het afgeschermde roostergedeelte is bewust uitgeschakeld.
    Modules voor teamkeuze, namen, rooster, Traffic, pauze,
    volgende dienst en teamcontacten worden hier niet geladen.
    Salarisdata staat los van het rooster en is daarom openbaar beschikbaar.
  */
})();
