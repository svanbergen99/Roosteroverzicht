(() => {
  "use strict";

  let currentAudio = null;
  let libraryLoaded = false;
  let observer = null;

  function stopLibraryAudio() {
    if (!currentAudio) return;
    try {
      currentAudio.pause();
      currentAudio.currentTime = 0;
    } catch (_) {}
    currentAudio = null;
  }

  function playFile(file) {
    stopLibraryAudio();
    try { window.RoosterPaydaySoundPreview?.stop?.(); } catch (_) {}
    const audio = new Audio(file);
    audio.preload = "auto";
    currentAudio = audio;
    audio.addEventListener("ended", () => {
      if (currentAudio === audio) currentAudio = null;
    }, { once: true });
    audio.play().catch(() => {});
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function categoryIcon(category) {
    const key = String(category || "").toLocaleLowerCase("nl-NL");
    if (/payday|salaris|geld/.test(key)) return "💶";
    if (/kerst/.test(key)) return "🎄";
    if (/sinterklaas/.test(key)) return "🎁";
    if (/halloween/.test(key)) return "🎃";
    if (/pasen/.test(key)) return "🐣";
    if (/nieuwjaar|oudjaar/.test(key)) return "🎆";
    if (/verjaardag/.test(key)) return "🎂";
    if (/koningsdag|oranje/.test(key)) return "🧡";
    if (/valentijn/.test(key)) return "❤";
    if (/suikerfeest|eid/.test(key)) return "🌙";
    return "🔊";
  }

  function makeLibraryHtml(files) {
    const groups = new Map();
    for (const item of files || []) {
      if (!item?.file) continue;
      const category = String(item.category || "Overig").trim() || "Overig";
      if (!groups.has(category)) groups.set(category, []);
      groups.get(category).push(item);
    }

    return [...groups.entries()].map(([category, items]) => `
      <section class="audio-library-group">
        <div class="audio-library-category">${categoryIcon(category)} ${escapeHtml(category)}</div>
        ${items.map((item) => `
          <button class="payday-preview-item audio-library-item" type="button" role="menuitem" data-audio-library-file="${escapeHtml(item.file)}">
            <span class="payday-preview-icon" aria-hidden="true">▶</span>
            <span class="payday-preview-copy">
              <strong>${escapeHtml(item.label || item.file)}</strong>
              <small>${escapeHtml(item.file)}</small>
            </span>
            <span class="payday-preview-play" aria-hidden="true">♫</span>
          </button>`).join("")}
      </section>`).join("");
  }

  async function loadLibrary() {
    if (libraryLoaded) return;
    const menu = document.getElementById("paydayPreviewMenu");
    if (!menu) return;

    libraryLoaded = true;
    try {
      const response = await fetch("audio-library.json", { cache: "no-store" });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      const files = Array.isArray(data?.files) ? data.files : [];
      if (!files.length) return;

      let library = document.getElementById("audioLibrarySection");
      if (!library) {
        library = document.createElement("div");
        library.id = "audioLibrarySection";
        library.className = "audio-library-section";
        const separator = menu.querySelector(".payday-preview-separator");
        if (separator) menu.insertBefore(library, separator);
        else menu.appendChild(library);
      }
      library.innerHTML = `
        <div class="audio-library-heading">MP3-bibliotheek</div>
        ${makeLibraryHtml(files)}`;
    } catch (error) {
      libraryLoaded = false;
      console.warn("Audiobibliotheek kon niet worden geladen.", error);
    }
  }

  function setTextIfNeeded(element, value) {
    if (element && element.textContent !== value) element.textContent = value;
  }

  function relabelInterface() {
    const button = document.getElementById("paydayPreviewButton");
    const heading = document.querySelector("#paydayPreviewMenu .payday-preview-heading");

    if (button && button.dataset.audioLibraryRelabeled !== "1") {
      button.innerHTML = `Audio <span aria-hidden="true">▾</span>`;
      button.dataset.audioLibraryRelabeled = "1";
    }
    setTextIfNeeded(heading, "Beluister audiofragmenten");

    const mixkit = document.querySelector('[data-payday-preview="mixkit"]');
    if (mixkit) {
      setTextIfNeeded(mixkit.querySelector("strong"), "Payday - beide MP3's tegelijk");
      setTextIfNeeded(mixkit.querySelector("small"), "Magical Coin Win + Clinking Coins");
    }
  }

  function ensureInterface() {
    const menu = document.getElementById("paydayPreviewMenu");
    if (!menu) return false;

    // De preview-interface wordt maar één keer opgebouwd. Daarna is observeren
    // niet meer nodig en voorkomen we een MutationObserver die zijn eigen
    // DOM-wijzigingen opnieuw blijft verwerken.
    observer?.disconnect();
    observer = null;
    relabelInterface();
    loadLibrary();
    return true;
  }

  document.addEventListener("click", (event) => {
    const fileButton = event.target.closest?.("[data-audio-library-file]");
    if (fileButton) {
      event.preventDefault();
      event.stopPropagation();
      playFile(fileButton.dataset.audioLibraryFile || "");
      return;
    }

    if (event.target.closest?.("[data-payday-preview]")) stopLibraryAudio();
  }, true);

  observer = new MutationObserver(() => ensureInterface());
  observer.observe(document.documentElement, { childList: true, subtree: true });

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", ensureInterface, { once: true });
  } else {
    ensureInterface();
  }

  window.RoosterAudioLibrary = Object.freeze({
    stop: stopLibraryAudio,
    play: playFile
  });
})();
