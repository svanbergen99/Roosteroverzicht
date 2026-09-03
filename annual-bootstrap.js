(() => {
  "use strict";

  const previousFetch = window.fetch.bind(window);
  const nativeFetch = window.__roosterNativeFetch || previousFetch;
  const CORE_FILE_RE = /Roosterindex_September\.json(?:[?#]|$)/i;

  function currentAmsterdamYear() {
    const value = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Europe/Amsterdam",
      year: "numeric"
    }).format(new Date());
    return Number(value) || new Date().getFullYear();
  }

  window.fetch = async function annualBootstrapFetch(input, init) {
    const url = typeof input === "string" ? input : input?.url || "";
    if (!CORE_FILE_RE.test(url)) return previousFetch(input, init);

    const response = await previousFetch(input, init);
    if (response.status !== 404) return response;

    const year = currentAmsterdamYear();
    const annualUrl = String(url).replace(/Roosterindex_September\.json/i, `Roosterindex_${year}.json`);
    return nativeFetch(annualUrl, init);
  };
})();
