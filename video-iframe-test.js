(() => {
  "use strict";

  if (window.__roosterVideoIframeTestInstalled) return;
  window.__roosterVideoIframeTestInstalled = true;

  const SECTION_ID = "videoLibraryPlayerSection";
  const STYLE_ID = "videoIframeTestStyle";
  const PLAYER_PAGE = "video-iframe-player.html";

  let section = null;
  let frame = null;
  let title = null;
  let currentPath = "";
  let effectStartedFor = "";

  function basename(path) {
    const parts = String(path || "").split("/");
    return parts[parts.length - 1] || path;
  }

  function friendlyLabel(path) {
    return basename(path)
      .replace(/\.mp4$/i, "")
      .replace(/[_-]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function mediaUrl(path) {
    const encodedPath = String(path || "")
      .split("/")
      .map((part) => encodeURIComponent(part))
      .join("/");
    return new URL(encodedPath, window.location.href).href;
  }

  function ensureStyle() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
      #${SECTION_ID}.video-library-iframe-test > iframe.video-library-player {
        width: 100%;
        height: min(66vw, 70vh);
        min-height: 320px;
        border: 0;
        background: #000;
      }
      @media (max-width: 620px) {
        #${SECTION_ID}.video-library-iframe-test > iframe.video-library-player {
          min-height: 220px;
          height: 56vw;
        }
      }
    `;
    document.head.appendChild(style);
  }

  function closeLibraryMenu() {
    const menu = document.getElementById("videoLibraryMenu");
    const button = document.getElementById("videoLibraryButton");
    if (menu) menu.hidden = true;
    button?.setAttribute("aria-expanded", "false");
  }

  function ensureSection() {
    if (section?.isConnected) return section;

    const existing = document.getElementById(SECTION_ID);
    if (existing) existing.remove();

    const app = document.getElementById("app");
    if (!app) return null;

    ensureStyle();
    section = document.createElement("section");
    section.id = SECTION_ID;
    section.className = "video-library-inline-player video-library-iframe-test";
    section.hidden = true;
    section.innerHTML = `
      <div class="video-library-player-head">
        <div class="video-library-player-title-wrap">
          <span>Video · iframe test</span>
          <strong id="videoLibraryTitle">Video</strong>
        </div>
        <button class="video-library-close" type="button" data-video-close aria-label="Video sluiten">×</button>
      </div>
      <iframe class="video-library-player"
              title="MP4 iframe-player"
              allow="autoplay; fullscreen; picture-in-picture"
              allowfullscreen
              referrerpolicy="same-origin"></iframe>`;

    const primary = document.getElementById("publicPrimaryActions");
    if (primary?.parentElement === app) primary.after(section);
    else app.prepend(section);

    frame = section.querySelector("iframe.video-library-player");
    title = section.querySelector("#videoLibraryTitle");
    section.querySelector("[data-video-close]")?.addEventListener("click", closeVideo);
    return section;
  }

  function startLinkedEffects(source) {
    if (!source || effectStartedFor === source) return;
    effectStartedFor = source;

    try { window.RoosterVideoEffectPerformance?.begin?.(); } catch (_) {}
    try {
      const sync = window.RoosterVideoEffectSync;
      const effect = sync?.effectForSource?.(source) || "";
      sync?.playLinkedEffect?.(effect);
    } catch (_) {}
  }

  function openVideo(path) {
    const target = ensureSection();
    if (!target || !frame || !path) return;

    closeLibraryMenu();
    try { window.RoosterAudioLibrary?.stop?.(); } catch (_) {}
    try { window.RoosterPaydaySoundPreview?.stop?.(); } catch (_) {}
    try { window.RoosterPaydayAudio?.stop?.(); } catch (_) {}

    currentPath = String(path);
    effectStartedFor = "";
    if (title) title.textContent = friendlyLabel(currentPath) || "Video";

    const source = mediaUrl(currentPath);
    const playerUrl = new URL(PLAYER_PAGE, window.location.href);
    playerUrl.searchParams.set("src", source);
    playerUrl.searchParams.set("v", String(Date.now()));

    frame.src = playerUrl.href;
    target.hidden = false;

    requestAnimationFrame(() => {
      target.scrollIntoView({ behavior: "smooth", block: "start" });
      try { window.RoosterVideoEffectFullscreen?.enter?.(); } catch (_) {}
    });
  }

  function closeVideo() {
    if (!section || !frame) return;
    try { window.RoosterVideoEffectFullscreen?.exit?.(); } catch (_) {}
    frame.src = "about:blank";
    section.hidden = true;
    currentPath = "";
    effectStartedFor = "";
  }

  document.addEventListener("click", (event) => {
    const item = event.target.closest?.("#videoLibraryList [data-video-path]");
    if (!item) return;

    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    openVideo(item.dataset.videoPath || "");
  }, true);

  window.addEventListener("message", (event) => {
    if (event.origin !== location.origin || !frame || event.source !== frame.contentWindow) return;
    const data = event.data;
    if (!data || data.type !== "rooster-video-iframe") return;

    if (data.event === "play") {
      startLinkedEffects(String(data.source || mediaUrl(currentPath)));
      try { window.RoosterVideoEffectFullscreen?.enter?.(); } catch (_) {}
      return;
    }

    if (data.event === "ended") {
      window.setTimeout(closeVideo, 0);
      return;
    }

    if (data.event === "error") {
      console.warn("Iframe-videoplayer kon de video niet afspelen.", data.message || "");
    }
  });

  window.RoosterVideoIframeTest = Object.freeze({
    open: openVideo,
    close: closeVideo,
    active: () => Boolean(section && !section.hidden),
    path: () => currentPath
  });
})();
