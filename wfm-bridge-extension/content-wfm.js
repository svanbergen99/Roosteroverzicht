(() => {
  "use strict";

  const script = document.createElement("script");
  script.src = chrome.runtime.getURL("page-hook.js");
  script.async = false;
  (document.documentElement || document.head).appendChild(script);
  script.addEventListener("load", () => script.remove(), { once: true });

  window.addEventListener("message", (event) => {
    if (event.source !== window || event.origin !== window.location.origin) return;
    const data = event.data;
    if (!data || data.source !== "rooster-wfm-page" || data.type !== "schedule-response") return;
    if (typeof data.responseText !== "string" || !data.responseText.startsWith("//OK[")) return;

    chrome.runtime.sendMessage({
      type: "wfm-schedule-response",
      requestUrl: data.requestUrl || "",
      capturedAt: data.capturedAt || new Date().toISOString(),
      responseText: data.responseText
    }).catch(() => {});
  });
})();
