(() => {
  "use strict";

  if (window.__leaveSourceFilenameCompat) return;

  const previousFetch = window.fetch.bind(window);
  const SOURCE_RE = /verlofaanvraag\.png(?=[?#]|$)/i;
  const CANDIDATE_NAMES = Object.freeze([
    "verlofaanvraag.PNG",
    "verlofaanvraag.png"
  ]);

  function candidateUrl(url, filename) {
    return String(url).replace(SOURCE_RE, filename);
  }

  function fetchCandidate(url, input, init) {
    if (typeof input === "string") return previousFetch(url, init);
    if (typeof Request !== "undefined" && input instanceof Request) {
      return previousFetch(new Request(url, input), init);
    }
    return previousFetch(url, init);
  }

  window.fetch = async function leaveSourceFilenameFetch(input, init) {
    const url = typeof input === "string" ? input : input?.url || "";
    if (!SOURCE_RE.test(url)) return previousFetch(input, init);

    let lastResponse = null;
    for (const filename of CANDIDATE_NAMES) {
      const response = await fetchCandidate(candidateUrl(url, filename), input, init);
      lastResponse = response;
      if (response.status !== 404) return response;
    }

    return lastResponse;
  };

  window.__leaveSourceFilenameCompat = true;
})();
