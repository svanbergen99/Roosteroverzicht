(() => {
  "use strict";

  const WALLBOARD_HOST = "achmea-production-1-a3srealtime-eu-west-1-prod.kb.eu-west-1.aws.found.io";
  const WALLBOARD_DASHBOARD_ID = "731a7b2c-c25f-4ff6-a032-5f62ef6d2272";
  const WINDOW_NAME = "roosteroverzichtWallboard";

  function isWallboardLink(anchor) {
    if (!(anchor instanceof HTMLAnchorElement)) return false;
    try {
      const url = new URL(anchor.href, window.location.href);
      return url.hostname === WALLBOARD_HOST && url.href.includes(WALLBOARD_DASHBOARD_ID);
    } catch (_) {
      return false;
    }
  }

  function openWallboardWindow(url) {
    const width = Math.min(560, Math.max(420, Math.round(screen.availWidth * 0.38)));
    const height = Math.min(760, Math.max(560, Math.round(screen.availHeight * 0.82)));
    const left = Math.max(0, screen.availWidth - width - 24);
    const top = Math.max(0, Math.round((screen.availHeight - height) / 2));
    const features = [
      "popup=yes",
      `width=${width}`,
      `height=${height}`,
      `left=${left}`,
      `top=${top}`,
      "resizable=yes",
      "scrollbars=yes"
    ].join(",");

    const wallboard = window.open(url, WINDOW_NAME, features);
    if (!wallboard) return false;

    try { wallboard.focus(); } catch (_) {}
    return true;
  }

  document.addEventListener("click", (event) => {
    if (event.defaultPrevented || event.button !== 0) return;
    const anchor = event.target?.closest?.("a[href]");
    if (!isWallboardLink(anchor)) return;

    event.preventDefault();
    const opened = openWallboardWindow(anchor.href);
    if (!opened) window.open(anchor.href, "_blank", "noopener,noreferrer");
  }, true);

  window.RoosterWallboardWindow = Object.freeze({
    open: (url) => openWallboardWindow(url)
  });
})();