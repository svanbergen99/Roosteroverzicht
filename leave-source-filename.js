(() => {
  "use strict";

  if (window.__leaveSourceFilenameCompat) return;

  const previousFetch = window.fetch.bind(window);
  const EXPECTED_NAME = "verlofaanvraag.PNG";

  window.fetch = function leaveSourceFilenameFetch(input, init) {
    const url = typeof input === "string" ? input : input?.url || "";
    if (!/Verlofaanvraag\.PNG(?:[?#]|$)/.test(url)) {
      return previousFetch(input, init);
    }

    const correctedUrl = String(url).replace(/Verlofaanvraag\.PNG/, EXPECTED_NAME);
    return previousFetch(correctedUrl, init);
  };

  window.__leaveSourceFilenameCompat = true;
})();
