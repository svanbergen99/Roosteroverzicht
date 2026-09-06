(() => {
  "use strict";

  const WINDOW_NAME = "roosteroverzichtWallboard";

  function wallboardConfig() {
    const value = window.RoosterPrivateConfig?.wallboard;
    return value && typeof value === "object" ? value : {};
  }

  function isWallboardLink(anchor) {
    if (!(anchor instanceof HTMLAnchorElement)) return false;
    const config = wallboardConfig();
    const host = String(config.host || "").trim();
    const dashboardId = String(config.dashboardId || "").trim();
    if (!host || !dashboardId) return false;
    try {
      const url = new URL(anchor.href, window.location.href);
      return url.hostname === host && url.href.includes(dashboardId);
    } catch (_) {
      return false;
    }
  }

  function openWallboardWindow(url) {
    const targetUrl = String(url || wallboardConfig().url || "").trim();
    if (!targetUrl) return false;
    const width = Math.min(1200, Math.max(900, Math.round(screen.availWidth * 0.72)));
    const height = Math.min(900, Math.max(650, Math.round(screen.availHeight * 0.82)));
    const left = Math.max(0, Math.round((screen.availWidth - width) / 2));
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

    const wallboard = window.open(targetUrl, WINDOW_NAME, features);
    if (!wallboard) return false;
    try { wallboard.focus(); } catch (_) {}
    return true;
  }

  document.addEventListener("click", (event) => {
    if (event.defaultPrevented || event.button !== 0) return;
    const anchor = event.target?.closest?.("a[href]");
    if (!isWallboardLink(anchor)) return;
    event.preventDefault();
    openWallboardWindow(anchor.href);
  }, true);

  window.RoosterWallboardWindow = Object.freeze({
    open: openWallboardWindow
  });
})();