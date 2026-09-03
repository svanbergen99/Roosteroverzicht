(() => {
  "use strict";

  const SECTION_ID = "videoLibraryPlayerSection";
  const STORAGE_KEY = "roosteroverzicht.documentPipSize.v1";
  const BUTTON_ATTR = "data-video-document-pip";
  const STYLE_ID = "videoDocumentPipButtonStyle";
  const MIN_WIDTH = 320;
  const MIN_HEIGHT = 220;
  const MAX_WIDTH = 1200;
  const MAX_HEIGHT = 900;
  const DEFAULT_WIDTH = 560;
  const DEFAULT_HEIGHT = 360;

  let activePipWindow = null;
  let activePipVideo = null;
  let activeMainVideo = null;
  let activeSection = null;
  let closingBecauseFinished = false;
  let resizeSaveTimer = 0;

  function supported() {
    return Boolean(
      window.documentPictureInPicture &&
      typeof window.documentPictureInPicture.requestWindow === "function"
    );
  }

  function clamp(value, min, max, fallback) {
    const number = Number(value);
    return Math.min(max, Math.max(min, Number.isFinite(number) ? number : fallback));
  }

  function readSavedSize() {
    try {
      const value = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
      return {
        width: clamp(value?.width, MIN_WIDTH, MAX_WIDTH, DEFAULT_WIDTH),
        height: clamp(value?.height, MIN_HEIGHT, MAX_HEIGHT, DEFAULT_HEIGHT)
      };
    } catch (_) {
      return { width: DEFAULT_WIDTH, height: DEFAULT_HEIGHT };
    }
  }

  function saveSize(win) {
    if (!win || win.closed) return;
    const width = clamp(win.innerWidth || win.outerWidth, MIN_WIDTH, MAX_WIDTH, DEFAULT_WIDTH);
    const height = clamp(win.innerHeight || win.outerHeight, MIN_HEIGHT, MAX_HEIGHT, DEFAULT_HEIGHT);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        width: Math.round(width),
        height: Math.round(height)
      }));
    } catch (_) {}
  }

  function scheduleSaveSize(win) {
    window.clearTimeout(resizeSaveTimer);
    resizeSaveTimer = window.setTimeout(() => saveSize(win), 120);
  }

  function ensureButtonStyle() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
      #${SECTION_ID} .video-library-document-pip {
        display: inline-grid;
        place-items: center;
        width: 42px;
        height: 36px;
        padding: 0;
        border: 1px solid var(--line);
        border-radius: 10px;
        background: #fff;
        color: var(--accent-dark);
        font: inherit;
        font-size: 11px;
        font-weight: 900;
        letter-spacing: -.2px;
        cursor: pointer !important;
      }
      #${SECTION_ID} .video-library-document-pip:hover,
      #${SECTION_ID} .video-library-document-pip.is-active {
        background: var(--soft-accent);
        border-color: #bca9ba;
      }
      #${SECTION_ID} .video-library-document-pip:disabled {
        opacity: .5;
        cursor: wait !important;
      }
      html[data-theme="dark"] #${SECTION_ID} .video-library-document-pip {
        border-color: #465263;
        background: #1f2937;
        color: #f0b5e8;
      }
      html[data-theme="dark"] #${SECTION_ID} .video-library-document-pip:hover,
      html[data-theme="dark"] #${SECTION_ID} .video-library-document-pip.is-active {
        background: #302633;
      }
    `;
    document.head.appendChild(style);
  }

  function trimEndFor(section, video) {
    const end = Number(section?.querySelector("#videoLibraryEnd")?.value);
    if (Number.isFinite(end) && end > 0) return end;
    return Number.isFinite(video?.duration) ? video.duration : Infinity;
  }

  function sourceFor(video) {
    return video?.currentSrc || video?.src || "";
  }

  function updateButtonState(section, active) {
    const button = section?.querySelector(`[${BUTTON_ATTR}]`);
    if (!button) return;
    button.classList.toggle("is-active", Boolean(active));
    button.textContent = active ? "PiP✓" : "PiP";
    button.title = active
      ? "Beeld-in-beeld is actief"
      : "Beeld-in-beeld openen · formaat wordt automatisch onthouden";
  }

  function closeActivePip() {
    try { activePipWindow?.close?.(); } catch (_) {}
  }

  function stylePipDocument(doc) {
    doc.documentElement.style.cssText = "width:100%;height:100%;margin:0;background:#050505;overflow:hidden;";
    doc.body.style.cssText = "width:100%;height:100%;margin:0;background:#050505;overflow:hidden;display:grid;place-items:center;";
    const style = doc.createElement("style");
    style.textContent = `
      html, body { width: 100%; height: 100%; margin: 0; overflow: hidden; background: #050505; }
      video { width: 100%; height: 100%; display: block; object-fit: contain; background: #050505; }
    `;
    doc.head.appendChild(style);
  }

  async function openDocumentPip(section, mainVideo, button) {
    if (!supported() || !section || !mainVideo || !sourceFor(mainVideo)) return;

    if (activePipWindow && !activePipWindow.closed) {
      closeActivePip();
      return;
    }

    const saved = readSavedSize();
    button.disabled = true;
    closingBecauseFinished = false;

    let pipWindow;
    try {
      pipWindow = await window.documentPictureInPicture.requestWindow({
        width: Math.round(saved.width),
        height: Math.round(saved.height)
      });
    } catch (error) {
      console.warn("Document Picture-in-Picture kon niet worden geopend.", error);
      button.disabled = false;
      button.title = "Beeld-in-beeld kon niet worden geopend";
      return;
    }

    button.disabled = false;
    activePipWindow = pipWindow;
    activeMainVideo = mainVideo;
    activeSection = section;
    const source = sourceFor(mainVideo);
    const startTime = Number(mainVideo.currentTime) || 0;
    const shouldContinuePlaying = !mainVideo.paused && !mainVideo.ended;
    const trimEnd = trimEndFor(section, mainVideo);

    updateButtonState(section, true);
    saveSize(pipWindow);
    mainVideo.pause();

    stylePipDocument(pipWindow.document);

    const pipVideo = pipWindow.document.createElement("video");
    activePipVideo = pipVideo;
    pipVideo.controls = true;
    pipVideo.autoplay = shouldContinuePlaying;
    pipVideo.playsInline = true;
    pipVideo.preload = "auto";
    pipVideo.src = source;
    pipVideo.volume = mainVideo.volume;
    pipVideo.muted = mainVideo.muted;
    pipVideo.playbackRate = mainVideo.playbackRate;
    pipWindow.document.body.appendChild(pipVideo);

    let finished = false;

    function finishPlayback() {
      if (finished) return;
      finished = true;
      closingBecauseFinished = true;
      try { pipVideo.pause(); } catch (_) {}
      try {
        if (Number.isFinite(trimEnd)) pipVideo.currentTime = Math.min(trimEnd, pipVideo.duration || trimEnd);
      } catch (_) {}
      saveSize(pipWindow);
      try { pipWindow.close(); } catch (_) {}
    }

    pipVideo.addEventListener("loadedmetadata", () => {
      try {
        pipVideo.currentTime = Math.min(startTime, Math.max(0, (pipVideo.duration || startTime) - 0.01));
      } catch (_) {}
      if (shouldContinuePlaying) pipVideo.play().catch(() => {});
    }, { once: true });

    pipVideo.addEventListener("volumechange", () => {
      if (!activeMainVideo) return;
      activeMainVideo.volume = pipVideo.volume;
      activeMainVideo.muted = pipVideo.muted;
    });

    pipVideo.addEventListener("ratechange", () => {
      if (activeMainVideo) activeMainVideo.playbackRate = pipVideo.playbackRate;
    });

    pipVideo.addEventListener("timeupdate", () => {
      if (Number.isFinite(trimEnd) && pipVideo.currentTime >= trimEnd - 0.06) finishPlayback();
    });

    pipVideo.addEventListener("ended", finishPlayback, { once: true });
    pipWindow.addEventListener("resize", () => scheduleSaveSize(pipWindow));

    pipWindow.addEventListener("pagehide", () => {
      window.clearTimeout(resizeSaveTimer);
      saveSize(pipWindow);

      const time = Number(pipVideo.currentTime) || 0;
      const wasPlayingWhenClosed = !pipVideo.paused && !pipVideo.ended;
      try {
        if (activeMainVideo && sourceFor(activeMainVideo) === source) {
          activeMainVideo.currentTime = time;
        }
      } catch (_) {}

      const sectionToUpdate = activeSection;
      const mainToResume = activeMainVideo;
      const finishedAtClose = closingBecauseFinished || finished;

      activePipWindow = null;
      activePipVideo = null;
      activeMainVideo = null;
      activeSection = null;
      closingBecauseFinished = false;
      updateButtonState(sectionToUpdate, false);

      if (finishedAtClose) {
        const closeButton = sectionToUpdate?.querySelector("[data-video-close]");
        window.setTimeout(() => closeButton?.click(), 0);
      } else if (wasPlayingWhenClosed && mainToResume && !sectionToUpdate?.hidden) {
        mainToResume.play().catch(() => {});
      }
    }, { once: true });
  }

  function install(section) {
    if (!section || section.dataset.documentPipReady === "true") return;
    if (!supported()) return;

    const mainVideo = section.querySelector(".video-library-player");
    const head = section.querySelector(".video-library-player-head");
    const close = head?.querySelector("[data-video-close]");
    if (!mainVideo || !head || !close) return;

    section.dataset.documentPipReady = "true";
    ensureButtonStyle();

    try { mainVideo.disablePictureInPicture = true; } catch (_) {}

    let actions = head.querySelector(".video-library-window-actions");
    if (!actions) {
      actions = document.createElement("div");
      actions.className = "video-library-window-actions";
      close.before(actions);
      actions.appendChild(close);
    }

    let button = actions.querySelector(`[${BUTTON_ATTR}]`);
    if (!button) {
      button = document.createElement("button");
      button.type = "button";
      button.className = "video-library-document-pip";
      button.setAttribute(BUTTON_ATTR, "true");
      button.setAttribute("aria-label", "Beeld-in-beeld openen");
      button.title = "Beeld-in-beeld openen · formaat wordt automatisch onthouden";
      button.textContent = "PiP";

      const sizeSave = actions.querySelector("[data-video-window-save]");
      actions.insertBefore(button, sizeSave || close);
      button.addEventListener("click", () => openDocumentPip(section, mainVideo, button));
    }

    const hiddenObserver = new MutationObserver(() => {
      if (section.hidden && activeSection === section) closeActivePip();
    });
    hiddenObserver.observe(section, { attributes: true, attributeFilter: ["hidden"] });

    mainVideo.addEventListener("loadstart", () => {
      if (activeMainVideo === mainVideo && activePipWindow && !activePipWindow.closed) closeActivePip();
    });
  }

  function findAndInstall() {
    const section = document.getElementById(SECTION_ID);
    if (section) install(section);
  }

  findAndInstall();
  const observer = new MutationObserver(findAndInstall);
  observer.observe(document.documentElement, { childList: true, subtree: true });
})();