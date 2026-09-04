(() => {
  "use strict";

  const TARGET = "/wfm/agents/WFMScheduleService852";
  const SOURCE = "rooster-wfm-page";

  function isTarget(url) {
    return String(url || "").includes(TARGET);
  }

  function emit(responseText, requestUrl) {
    const text = String(responseText || "");
    if (!text.startsWith("//OK[")) return;
    window.postMessage({
      source: SOURCE,
      type: "schedule-response",
      requestUrl: String(requestUrl || ""),
      capturedAt: new Date().toISOString(),
      responseText: text
    }, window.location.origin);
  }

  const originalOpen = XMLHttpRequest.prototype.open;
  const originalSend = XMLHttpRequest.prototype.send;

  XMLHttpRequest.prototype.open = function(method, url, ...rest) {
    this.__roosterWfmUrl = String(url || "");
    return originalOpen.call(this, method, url, ...rest);
  };

  XMLHttpRequest.prototype.send = function(body) {
    if (isTarget(this.__roosterWfmUrl) && !this.__roosterWfmHooked) {
      this.__roosterWfmHooked = true;
      this.addEventListener("load", () => {
        try {
          if (this.status >= 200 && this.status < 300) emit(this.responseText, this.__roosterWfmUrl);
        } catch (_) {}
      });
    }
    return originalSend.call(this, body);
  };

  if (typeof window.fetch === "function") {
    const originalFetch = window.fetch.bind(window);
    window.fetch = async function(input, init) {
      const response = await originalFetch(input, init);
      const url = typeof input === "string" ? input : input?.url || response.url || "";
      if (isTarget(url)) {
        try {
          const clone = response.clone();
          const text = await clone.text();
          emit(text, url);
        } catch (_) {}
      }
      return response;
    };
  }
})();
