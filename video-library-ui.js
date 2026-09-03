(() => {
  "use strict";

  const TREE_URL = "https://api.github.com/repos/svanbergen99/Roosteroverzicht/git/trees/main?recursive=1";
  const REFRESH_AFTER_MS = 120000;
  const MIN_CLIP_SECONDS = 0.5;

  let wrap = null;
  let button = null;
  let menu = null;
  let list = null;
  let playerSection = null;
  let player = null;
  let title = null;
  let startInput = null;
  let endInput = null;
  let startOutput = null;
  let endOutput = null;
  let selectionOutput = null;
  let trimFill = null;
  let currentPath = "";
  let lastLoadedAt = 0;
  let loading = false;

  const trimRanges = new Map();

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function categoryFor(path) {
    const key = String(path || "").toLocaleLowerCase("nl-NL");
    if (/halloween|witch|spooky|creepy/.test(key)) return "Halloween";
    if (/kerst|christmas|xmas/.test(key)) return "Kerst";
    if (/nieuwjaar|new[-_ ]?year/.test(key)) return "Nieuwjaar";
    if (/oudjaar|new[-_ ]?years?[-_ ]?eve/.test(key)) return "Oudjaar";
    if (/verjaardag|birthday/.test(key)) return "Verjaardag";
    if (/moederdag|mother.?s?[-_ ]?day/.test(key)) return "Moederdag";
    if (/vaderdag|father.?s?[-_ ]?day/.test(key)) return "Vaderdag";
    if (/valentijn|valentine|romantic|love/.test(key)) return "Valentijn";
    if (/pasen|easter|bunny/.test(key)) return "Pasen";
    if (/koningsdag|king.?s?[-_ ]?day|oranje/.test(key)) return "Koningsdag";
    if (/sinterklaas|sint[-_ ]?nicolaas|st[-_ ]?nicholas/.test(key)) return "Sinterklaas";
    if (/suikerfeest|eid|ramadan/.test(key)) return "Suikerfeest / Eid";
    if (/payday|salaris|coin|coins|cash|money/.test(key)) return "Payday";
    return "Overig";
  }

  function categoryIcon(category) {
    if (category === "Halloween") return "🎃";
    if (category === "Kerst") return "🎄";
    if (category === "Nieuwjaar" || category === "Oudjaar") return "🎆";
    if (category === "Verjaardag") return "🎂";
    if (category === "Moederdag") return "🌷";
    if (category === "Vaderdag") return "👔";
    if (category === "Valentijn") return "❤";
    if (category === "Pasen") return "🐣";
    if (category === "Koningsdag") return "🧡";
    if (category === "Sinterklaas") return "🎁";
    if (category === "Suikerfeest / Eid") return "🌙";
    if (category === "Payday") return "💶";
    return "🎬";
  }

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

  function formatDuration(seconds) {
    const safe = Math.max(0, Number(seconds) || 0);
    const minutes = Math.floor(safe / 60);
    const wholeSeconds = Math.floor(safe % 60);
    const tenths = Math.round((safe - Math.floor(safe)) * 10) % 10;
    const base = `${minutes}:${String(wholeSeconds).padStart(2, "0")}`;
    return tenths ? `${base}.${tenths}` : base;
  }

  function renderVideos(paths) {
    if (!list) return;
    if (!paths.length) {
      list.innerHTML = '<div class="video-library-empty">Nog geen MP4-bestanden gevonden in de repository.</div>';
      return;
    }

    const groups = new Map();
    for (const path of paths) {
      const category = categoryFor(path);
      if (!groups.has(category)) groups.set(category, []);
      groups.get(category).push(path);
    }

    const preferredOrder = [
      "Payday", "Halloween", "Kerst", "Nieuwjaar", "Oudjaar", "Verjaardag",
      "Moederdag", "Vaderdag", "Valentijn", "Pasen", "Koningsdag",
      "Sinterklaas", "Suikerfeest / Eid", "Overig"
    ];
    const orderIndex = new Map(preferredOrder.map((name, index) => [name, index]));
    const entries = [...groups.entries()].sort((a, b) => {
      const ai = orderIndex.has(a[0]) ? orderIndex.get(a[0]) : 999;
      const bi = orderIndex.has(b[0]) ? orderIndex.get(b[0]) : 999;
      return ai - bi || a[0].localeCompare(b[0], "nl");
    });

    list.innerHTML = entries.map(([category, items]) => `
      <section class="video-library-group">
        <div class="video-library-category">${categoryIcon(category)} ${escapeHtml(category)}</div>
        ${items.sort((a, b) => a.localeCompare(b, "nl")).map((path) => `
          <button class="video-library-item" type="button" data-video-path="${escapeHtml(path)}">
            <span class="video-library-play" aria-hidden="true">▶</span>
            <span class="video-library-copy">
              <strong>${escapeHtml(friendlyLabel(path))}</strong>
              <small>${escapeHtml(path)}</small>
            </span>
          </button>`).join("")}
      </section>`).join("");
  }

  async function loadVideos(force = false) {
    if (!list || loading) return;
    const now = Date.now();
    if (!force && lastLoadedAt && now - lastLoadedAt < REFRESH_AFTER_MS) return;

    loading = true;
    list.innerHTML = '<div class="video-library-empty">MP4-bestanden zoeken…</div>';
    try {
      const response = await fetch(`${TREE_URL}&t=${Date.now()}`, {
        cache: "no-store",
        headers: { Accept: "application/vnd.github+json" }
      });
      if (!response.ok) throw new Error(`GitHub HTTP ${response.status}`);
      const data = await response.json();
      const paths = Array.isArray(data?.tree)
        ? data.tree
            .filter((item) => item?.type === "blob" && /\.mp4$/i.test(String(item.path || "")))
            .map((item) => item.path)
        : [];
      lastLoadedAt = Date.now();
      renderVideos(paths);
    } catch (error) {
      console.warn("Videobibliotheek kon de repository niet uitlezen.", error);
      list.innerHTML = `
        <div class="video-library-empty">
          Video's konden nu niet automatisch worden opgehaald.
          <button type="button" class="video-library-refresh" data-video-refresh>Opnieuw proberen</button>
        </div>`;
    } finally {
      loading = false;
    }
  }

  function closeMenu() {
    if (!menu || !button) return;
    menu.hidden = true;
    button.setAttribute("aria-expanded", "false");
  }

  function toggleMenu() {
    if (!menu || !button) return;
    const open = menu.hidden;
    menu.hidden = !open;
    button.setAttribute("aria-expanded", String(open));
    if (open) loadVideos(false);
  }

  function totalDuration() {
    return Number.isFinite(player?.duration) && player.duration > 0 ? player.duration : 0;
  }

  function currentTrim() {
    const total = totalDuration();
    if (!total || !startInput || !endInput) return { start: 0, end: total };
    const start = Math.max(0, Math.min(total, Number(startInput.value) || 0));
    const end = Math.max(start, Math.min(total, Number(endInput.value) || total));
    return { start, end };
  }

  function requestPlayerFullscreen() {
    if (!player) return;
    try {
      if (typeof player.requestFullscreen === "function") {
        const request = player.requestFullscreen({ navigationUI: "hide" });
        request?.catch?.(() => {
          try { player.webkitEnterFullscreen?.(); } catch (_) {}
        });
        return;
      }
      player.webkitEnterFullscreen?.();
    } catch (_) {
      try { player.webkitEnterFullscreen?.(); } catch (_) {}
    }
  }

  function exitPlayerFullscreen() {
    try {
      if (player?.webkitDisplayingFullscreen) player.webkitExitFullscreen?.();
    } catch (_) {}
    try {
      if (document.fullscreenElement) {
        const exit = document.exitFullscreen?.();
        exit?.catch?.(() => {});
      } else if (document.webkitFullscreenElement) {
        document.webkitExitFullscreen?.();
      }
    } catch (_) {}
  }

  function updateTrimVisuals() {
    const total = totalDuration();
    if (!total || !startInput || !endInput) return;
    const { start, end } = currentTrim();

    if (startOutput) startOutput.textContent = formatDuration(start);
    if (endOutput) endOutput.textContent = formatDuration(end);
    if (selectionOutput) selectionOutput.textContent = `${formatDuration(start)} → ${formatDuration(end)} · ${formatDuration(end - start)} geselecteerd`;

    if (trimFill) {
      const left = Math.max(0, Math.min(100, (start / total) * 100));
      const right = Math.max(0, Math.min(100, (end / total) * 100));
      trimFill.style.left = `${left}%`;
      trimFill.style.width = `${Math.max(0, right - left)}%`;
    }
  }

  function updateTrimControl() {
    if (!player || !startInput || !endInput || !currentPath) return;
    const total = totalDuration();
    if (!total) return;

    const saved = trimRanges.get(currentPath);
    let start = Number.isFinite(saved?.start) ? saved.start : 0;
    let end = Number.isFinite(saved?.end) ? saved.end : total;
    start = Math.max(0, Math.min(total - Math.min(MIN_CLIP_SECONDS, total), start));
    end = Math.max(start + Math.min(MIN_CLIP_SECONDS, total), Math.min(total, end));

    for (const input of [startInput, endInput]) {
      input.min = "0";
      input.max = String(total);
      input.step = "0.1";
      input.disabled = false;
    }
    startInput.value = String(start);
    endInput.value = String(end);
    trimRanges.set(currentPath, { start, end });
    updateTrimVisuals();

    if (Math.abs(player.currentTime - start) > 0.05) {
      try { player.currentTime = start; } catch (_) {}
    }
  }

  function handleStartInput() {
    const total = totalDuration();
    if (!total || !currentPath || !startInput || !endInput) return;
    const gap = Math.min(MIN_CLIP_SECONDS, total);
    let start = Number(startInput.value) || 0;
    const end = Number(endInput.value) || total;
    start = Math.max(0, Math.min(end - gap, start));
    startInput.value = String(start);
    trimRanges.set(currentPath, { start, end });
    updateTrimVisuals();
    try { player.currentTime = start; } catch (_) {}
  }

  function handleEndInput() {
    const total = totalDuration();
    if (!total || !currentPath || !startInput || !endInput) return;
    const gap = Math.min(MIN_CLIP_SECONDS, total);
    const start = Number(startInput.value) || 0;
    let end = Number(endInput.value) || total;
    end = Math.min(total, Math.max(start + gap, end));
    endInput.value = String(end);
    trimRanges.set(currentPath, { start, end });
    updateTrimVisuals();
    if (player.currentTime > end) {
      player.pause();
      try { player.currentTime = end; } catch (_) {}
    }
  }

  function ensurePlayerSection() {
    if (playerSection) return;
    const app = document.getElementById("app");
    if (!app) return;

    playerSection = document.createElement("section");
    playerSection.id = "videoLibraryPlayerSection";
    playerSection.className = "video-library-inline-player";
    playerSection.hidden = true;
    playerSection.innerHTML = `
      <div class="video-library-player-head">
        <div class="video-library-player-title-wrap">
          <span>Video</span>
          <strong id="videoLibraryTitle">Video</strong>
        </div>
        <button class="video-library-close" type="button" data-video-close aria-label="Video sluiten">×</button>
      </div>
      <video class="video-library-player" controls playsinline preload="metadata"></video>
      <div class="video-library-trim-control">
        <div class="video-library-trim-head">
          <strong>Begin en einde</strong>
          <output id="videoLibrarySelectionOutput">Fragment laden…</output>
        </div>
        <div class="video-library-trim-track" aria-label="Begin en einde van het videofragment">
          <div class="video-library-trim-rail"></div>
          <div class="video-library-trim-fill"></div>
          <input id="videoLibraryStart" class="video-library-trim-range video-library-trim-start" type="range" min="0" max="1" step="0.1" value="0" disabled aria-label="Begin van het videofragment">
          <input id="videoLibraryEnd" class="video-library-trim-range video-library-trim-end" type="range" min="0" max="1" step="0.1" value="1" disabled aria-label="Einde van het videofragment">
        </div>
        <div class="video-library-trim-values">
          <span><b>Begin</b><output id="videoLibraryStartOutput">0:00</output></span>
          <span><b>Einde</b><output id="videoLibraryEndOutput">0:00</output></span>
        </div>
        <small>Schuif het linker handvat naar het gewenste begin en het rechter handvat naar het gewenste einde.</small>
      </div>`;

    const primary = document.getElementById("publicPrimaryActions");
    if (primary?.parentElement === app) primary.after(playerSection);
    else app.prepend(playerSection);

    player = playerSection.querySelector("video");
    title = playerSection.querySelector("#videoLibraryTitle");
    startInput = playerSection.querySelector("#videoLibraryStart");
    endInput = playerSection.querySelector("#videoLibraryEnd");
    startOutput = playerSection.querySelector("#videoLibraryStartOutput");
    endOutput = playerSection.querySelector("#videoLibraryEndOutput");
    selectionOutput = playerSection.querySelector("#videoLibrarySelectionOutput");
    trimFill = playerSection.querySelector(".video-library-trim-fill");

    playerSection.querySelector("[data-video-close]")?.addEventListener("click", closeVideo);
    player?.addEventListener("loadedmetadata", updateTrimControl);
    player?.addEventListener("durationchange", updateTrimControl);
    player?.addEventListener("ended", closeVideo);

    player?.addEventListener("play", () => {
      const { start, end } = currentTrim();
      if (player.currentTime < start - 0.05 || player.currentTime >= end - 0.05) {
        try { player.currentTime = start; } catch (_) {}
      }
    });

    player?.addEventListener("seeking", () => {
      const { start, end } = currentTrim();
      if (!Number.isFinite(start) || !Number.isFinite(end)) return;
      if (player.currentTime < start) {
        try { player.currentTime = start; } catch (_) {}
      } else if (player.currentTime > end) {
        try { player.currentTime = end; } catch (_) {}
      }
    });

    player?.addEventListener("timeupdate", () => {
      const { end } = currentTrim();
      if (!end || player.currentTime < end) return;
      player.pause();
      try { player.currentTime = end; } catch (_) {}
    });

    startInput?.addEventListener("input", handleStartInput);
    endInput?.addEventListener("input", handleEndInput);
  }

  function openVideo(path) {
    ensurePlayerSection();
    closeMenu();
    if (!playerSection || !player || !path) return;

    try { window.RoosterAudioLibrary?.stop?.(); } catch (_) {}
    try { window.RoosterPaydaySoundPreview?.stop?.(); } catch (_) {}
    try { window.RoosterPaydayAudio?.stop?.(); } catch (_) {}

    currentPath = path;
    if (title) title.textContent = friendlyLabel(path) || "Video";
    for (const input of [startInput, endInput]) {
      if (!input) continue;
      input.disabled = true;
      input.max = "1";
    }
    if (startInput) startInput.value = "0";
    if (endInput) endInput.value = "1";
    if (startOutput) startOutput.textContent = "0:00";
    if (endOutput) endOutput.textContent = "0:00";
    if (selectionOutput) selectionOutput.textContent = "Fragment laden…";
    if (trimFill) {
      trimFill.style.left = "0%";
      trimFill.style.width = "100%";
    }

    player.pause();
    player.src = mediaUrl(path);
    player.load();
    playerSection.hidden = false;
    requestPlayerFullscreen();

    requestAnimationFrame(() => {
      playerSection.scrollIntoView({ behavior: "smooth", block: "start" });
      player.play().catch(() => {});
    });
  }

  function closeVideo() {
    if (!playerSection || !player) return;
    exitPlayerFullscreen();
    try {
      player.pause();
      player.removeAttribute("src");
      player.load();
    } catch (_) {}
    currentPath = "";
    playerSection.hidden = true;
  }

  function ensureInterface() {
    if (document.getElementById("videoLibraryWrap")) return true;
    const shell = document.getElementById("backgroundBrightnessBar");
    if (!shell) return false;

    const audioWrap = document.getElementById("paydayPreviewWrap");
    const effectsWrap = shell.querySelector(".brightness-effects-wrap");
    const anchor = audioWrap || effectsWrap;
    if (!anchor) return false;

    wrap = document.createElement("div");
    wrap.id = "videoLibraryWrap";
    wrap.className = "video-library-wrap";
    wrap.innerHTML = `
      <button id="videoLibraryButton" class="video-library-button" type="button" aria-haspopup="menu" aria-expanded="false" aria-controls="videoLibraryMenu">
        Video <span aria-hidden="true">▾</span>
      </button>
      <div id="videoLibraryMenu" class="video-library-menu" role="menu" hidden>
        <div class="video-library-heading-row">
          <div class="video-library-heading">MP4-bibliotheek</div>
          <button type="button" class="video-library-refresh" data-video-refresh title="Videolijst vernieuwen">↻</button>
        </div>
        <div id="videoLibraryList" class="video-library-list">
          <div class="video-library-empty">Open Video om MP4-bestanden te zoeken.</div>
        </div>
      </div>`;
    anchor.after(wrap);

    button = wrap.querySelector("#videoLibraryButton");
    menu = wrap.querySelector("#videoLibraryMenu");
    list = wrap.querySelector("#videoLibraryList");

    button.addEventListener("click", (event) => {
      event.stopPropagation();
      toggleMenu();
    });

    menu.addEventListener("click", (event) => {
      event.stopPropagation();
      const refresh = event.target.closest?.("[data-video-refresh]");
      if (refresh) {
        loadVideos(true);
        return;
      }
      const item = event.target.closest?.("[data-video-path]");
      if (item) openVideo(item.dataset.videoPath || "");
    });

    document.addEventListener("click", (event) => {
      if (!event.target.closest?.("#videoLibraryWrap")) closeMenu();
    });

    document.addEventListener("keydown", (event) => {
      if (event.key !== "Escape") return;
      if (menu && !menu.hidden) {
        closeMenu();
        button?.focus();
      }
    });

    return true;
  }

  function start() {
    if (ensureInterface()) return;
    let attempts = 0;
    const timer = window.setInterval(() => {
      attempts += 1;
      if (ensureInterface() || attempts >= 100) window.clearInterval(timer);
    }, 100);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start, { once: true });
  else start();

  window.RoosterVideoLibrary = Object.freeze({
    refresh: () => loadVideos(true),
    close: closeVideo,
    ranges: () => Object.fromEntries(trimRanges)
  });
})();