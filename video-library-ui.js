(() => {
  "use strict";

  const TREE_URL = "https://api.github.com/repos/svanbergen99/Roosteroverzicht/git/trees/main?recursive=1";
  const REFRESH_AFTER_MS = 120000;

  let wrap = null;
  let button = null;
  let menu = null;
  let list = null;
  let overlay = null;
  let player = null;
  let title = null;
  let lastLoadedAt = 0;
  let loading = false;

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

  function ensureOverlay() {
    if (overlay) return;
    overlay = document.createElement("div");
    overlay.id = "videoLibraryOverlay";
    overlay.className = "video-library-overlay";
    overlay.hidden = true;
    overlay.innerHTML = `
      <section class="video-library-player-card" role="dialog" aria-modal="true" aria-labelledby="videoLibraryTitle">
        <div class="video-library-player-head">
          <strong id="videoLibraryTitle">Video</strong>
          <button class="video-library-close" type="button" data-video-close aria-label="Video sluiten">×</button>
        </div>
        <video class="video-library-player" controls playsinline preload="metadata"></video>
      </section>`;
    document.body.appendChild(overlay);
    player = overlay.querySelector("video");
    title = overlay.querySelector("#videoLibraryTitle");

    overlay.addEventListener("click", (event) => {
      if (event.target === overlay || event.target.closest?.("[data-video-close]")) closeVideo();
    });
  }

  function openVideo(path) {
    ensureOverlay();
    closeMenu();
    if (!overlay || !player) return;
    if (title) title.textContent = friendlyLabel(path) || "Video";
    player.src = mediaUrl(path);
    overlay.hidden = false;
    document.body.classList.add("video-library-open");
    player.play().catch(() => {});
  }

  function closeVideo() {
    if (!overlay || !player) return;
    try {
      player.pause();
      player.removeAttribute("src");
      player.load();
    } catch (_) {}
    overlay.hidden = true;
    document.body.classList.remove("video-library-open");
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
      if (overlay && !overlay.hidden) closeVideo();
      else if (menu && !menu.hidden) {
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
    close: closeVideo
  });
})();
