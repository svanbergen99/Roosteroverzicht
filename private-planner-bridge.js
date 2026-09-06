(() => {
  "use strict";

  const plannerWindows = new Set();

  function plannerConfig() {
    const config = window.RoosterPrivateConfig?.asesPlanner;
    return config && typeof config === "object" ? config : null;
  }

  function isPlannerLink(anchor) {
    if (!(anchor instanceof HTMLAnchorElement)) return false;
    try {
      const url = new URL(anchor.href, window.location.href);
      return url.origin === window.location.origin && /\/roosterplanner\.html$/i.test(url.pathname);
    } catch (_) {
      return false;
    }
  }

  document.addEventListener("click", (event) => {
    if (event.defaultPrevented || event.button !== 0) return;
    const anchor = event.target?.closest?.("a[href]");
    if (!isPlannerLink(anchor)) return;

    const config = plannerConfig();
    if (!config) {
      event.preventDefault();
      return;
    }

    event.preventDefault();
    const popup = window.open(anchor.href, "roosteroverzichtPrivatePlanner");
    if (!popup) return;
    plannerWindows.add(popup);
    try { popup.focus(); } catch (_) {}
  }, true);

  window.addEventListener("message", (event) => {
    if (event.origin !== window.location.origin) return;
    if (!event.data || event.data.type !== "rooster-private-planner-request") return;
    if (!plannerWindows.has(event.source)) return;

    const config = plannerConfig();
    if (!config) return;
    try {
      event.source.postMessage({
        type: "rooster-private-planner-config",
        config
      }, window.location.origin);
    } catch (_) {}
  });

  window.addEventListener("beforeunload", () => plannerWindows.clear());
})();
