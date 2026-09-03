(() => {
  "use strict";

  let libraryLoaded = false;
  let observer = null;
  let libraryData = { files: [], mixes: [] };
  const activeAudios = new Map();
  const volumeState = new Map();

  function clampVolume(value, fallback = 100) {
    const number = Number(value);
    if (!Number.isFinite(number)) return fallback;
    return Math.max(0, Math.min(100, Math.round(number)));
  }

  function trackKey(mixId, file) {
    return `${mixId}::${file}`;
  }

  function getVolume(key, fallback = 100) {
    if (!volumeState.has(key)) volumeState.set(key, clampVolume(fallback));
    return volumeState.get(key);
  }

  function stopLibraryAudio() {
    for (const audio of activeAudios.values()) {
      try {
        audio.pause();
        audio.currentTime = 0;
      } catch (_) {}
    }
    activeAudios.clear();
  }

  function stopCompetingAudio() {
    stopLibraryAudio();
    try { window.RoosterPaydaySoundPreview?.stop?.(); } catch (_) {}
    try { window.RoosterPaydayAudio?.stop?.(); } catch (_) {}
  }

  function fileInfo(file) {
    return libraryData.files.find((item) => item?.file === file) || { file, label: file, category: "Overig" };
  }

  function registerAudio(key, audio) {
    activeAudios.set(key, audio);
    audio.addEventListener("ended", () => {
      if (activeAudios.get(key) === audio) activeAudios.delete(key);
    }, { once: true });
  }

  function playSolo(file, key, fallbackVolume = 100) {
    stopCompetingAudio();
    if (!file) return;
    const audio = new Audio(file);
    audio.preload = "auto";
    audio.volume = getVolume(key, fallbackVolume) / 100;
    registerAudio(key, audio);
    audio.play().catch(() => {});
  }

  function playMix(mixId) {
    const mix = libraryData.mixes.find((item) => item?.id === mixId);
    if (!mix || !Array.isArray(mix.tracks) || !mix.tracks.length) return;

    stopCompetingAudio();
    const prepared = [];
    for (const track of mix.tracks) {
      if (!track?.file) continue;
      const key = trackKey(mix.id, track.file);
      const audio = new Audio(track.file);
      audio.preload = "auto";
      audio.currentTime = 0;
      audio.volume = getVolume(key, track.volume) / 100;
      registerAudio(key, audio);
      prepared.push(audio);
    }

    // Start de tracks in dezelfde event-loop zodat ze praktisch gelijktijdig beginnen.
    for (const audio of prepared) audio.play().catch(() => {});
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
    if (/moederdag/.test(key)) return "🌷";
    if (/vaderdag/.test(key)) return "👔";
    if (/koningsdag|oranje/.test(key)) return "🧡";
    if (/valentijn/.test(key)) return "❤";
    if (/suikerfeest|eid/.test(key)) return "🌙";
    return "🔊";
  }

  function volumeHtml(key, value) {
    const safeKey = escapeHtml(key);
    const safeValue = clampVolume(value);
    return `
      <div class="audio-track-volume">
        <span>Volume</span>
        <input type="range" min="0" max="100" step="1" value="${safeValue}" data-audio-volume="${safeKey}" aria-label="Volume ${safeValue} procent">
        <output data-audio-volume-output="${safeKey}">${safeValue}%</output>
      </div>`;
  }

  function mixHtml(mix) {
    const tracks = Array.isArray(mix.tracks) ? mix.tracks : [];
    return `
      <div class="audio-mix-card">
        <button class="audio-mix-play" type="button" data-audio-mix="${escapeHtml(mix.id)}">
          <span aria-hidden="true">▶</span>
          <span><strong>${escapeHtml(mix.label || `${mix.category} combinatie`)}</strong><small>Speel gekoppelde bestanden tegelijk</small></span>
        </button>
        <div class="audio-mix-tracks">
          ${tracks.map((track) => {
            const info = fileInfo(track.file);
            const key = trackKey(mix.id, track.file);
            const volume = getVolume(key, track.volume);
            return `
              <div class="audio-mix-track">
                <div class="audio-track-head">
                  <button class="audio-track-solo" type="button" data-audio-solo-file="${escapeHtml(track.file)}" data-audio-solo-key="${escapeHtml(key)}" data-audio-solo-volume="${volume}" title="Alleen dit bestand afspelen">▶</button>
                  <span class="audio-track-copy"><strong>${escapeHtml(info.label || track.file)}</strong><small>${escapeHtml(track.file)}</small></span>
                </div>
                ${volumeHtml(key, volume)}
              </div>`;
          }).join("")}
        </div>
      </div>`;
  }

  function singleHtml(item) {
    const key = trackKey("single", item.file);
    const volume = getVolume(key, item.volume ?? 100);
    return `
      <div class="audio-single-card">
        <div class="audio-track-head">
          <button class="audio-track-solo" type="button" data-audio-solo-file="${escapeHtml(item.file)}" data-audio-solo-key="${escapeHtml(key)}" data-audio-solo-volume="${volume}">▶</button>
          <span class="audio-track-copy"><strong>${escapeHtml(item.label || item.file)}</strong><small>${escapeHtml(item.file)}</small></span>
        </div>
        ${volumeHtml(key, volume)}
      </div>`;
  }

  function makeLibraryHtml() {
    const groups = new Map();
    const mixedFiles = new Set();

    for (const mix of libraryData.mixes) {
      const category = String(mix?.category || "Overig").trim() || "Overig";
      if (!groups.has(category)) groups.set(category, { mixes: [], singles: [] });
      groups.get(category).mixes.push(mix);
      for (const track of mix?.tracks || []) if (track?.file) mixedFiles.add(track.file);
    }

    for (const item of libraryData.files) {
      if (!item?.file || mixedFiles.has(item.file)) continue;
      const category = String(item.category || "Overig").trim() || "Overig";
      if (!groups.has(category)) groups.set(category, { mixes: [], singles: [] });
      groups.get(category).singles.push(item);
    }

    const preferred = ["Payday", "Halloween", "Kerst", "Nieuwjaar", "Verjaardag", "Moederdag", "Vaderdag", "Valentijn", "Pasen", "Koningsdag", "Sinterklaas", "Suikerfeest / Eid", "Overig"];
    const order = new Map(preferred.map((name, index) => [name, index]));

    return [...groups.entries()]
      .sort((a, b) => (order.get(a[0]) ?? 999) - (order.get(b[0]) ?? 999) || a[0].localeCompare(b[0], "nl"))
      .map(([category, group]) => `
        <section class="audio-library-group">
          <div class="audio-library-category">${categoryIcon(category)} ${escapeHtml(category)}</div>
          ${group.mixes.map(mixHtml).join("")}
          ${group.singles.map(singleHtml).join("")}
        </section>`).join("");
  }

  async function loadLibrary() {
    if (libraryLoaded) return;
    const menu = document.getElementById("paydayPreviewMenu");
    if (!menu) return;

    libraryLoaded = true;
    try {
      const response = await fetch(`audio-library.json?t=${Date.now()}`, { cache: "no-store" });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      libraryData = {
        files: Array.isArray(data?.files) ? data.files : [],
        mixes: Array.isArray(data?.mixes) ? data.mixes : []
      };
      if (!libraryData.files.length && !libraryData.mixes.length) return;

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
        <div class="audio-library-heading">MP3-bibliotheek · combinaties + live volume</div>
        ${makeLibraryHtml()}`;
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
  }

  function ensureInterface() {
    const menu = document.getElementById("paydayPreviewMenu");
    if (!menu) return false;
    observer?.disconnect();
    observer = null;
    relabelInterface();
    loadLibrary();
    return true;
  }

  document.addEventListener("click", (event) => {
    const mixButton = event.target.closest?.("[data-audio-mix]");
    if (mixButton) {
      event.preventDefault();
      event.stopPropagation();
      playMix(mixButton.dataset.audioMix || "");
      return;
    }

    const soloButton = event.target.closest?.("[data-audio-solo-file]");
    if (soloButton) {
      event.preventDefault();
      event.stopPropagation();
      playSolo(
        soloButton.dataset.audioSoloFile || "",
        soloButton.dataset.audioSoloKey || trackKey("single", soloButton.dataset.audioSoloFile || ""),
        clampVolume(soloButton.dataset.audioSoloVolume, 100)
      );
      return;
    }

    if (event.target.closest?.("[data-payday-preview]")) stopLibraryAudio();
  }, true);

  document.addEventListener("input", (event) => {
    const slider = event.target.closest?.("[data-audio-volume]");
    if (!slider) return;
    const key = slider.dataset.audioVolume || "";
    const value = clampVolume(slider.value);
    volumeState.set(key, value);
    slider.setAttribute("aria-label", `Volume ${value} procent`);
    const output = document.querySelector(`[data-audio-volume-output="${CSS.escape(key)}"]`);
    if (output) output.textContent = `${value}%`;
    const audio = activeAudios.get(key);
    if (audio) audio.volume = value / 100;
  }, true);

  observer = new MutationObserver(() => ensureInterface());
  observer.observe(document.documentElement, { childList: true, subtree: true });

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", ensureInterface, { once: true });
  else ensureInterface();

  window.RoosterAudioLibrary = Object.freeze({
    stop: stopLibraryAudio,
    playMix,
    play: (file) => playSolo(file, trackKey("single", file), 100),
    volumes: () => Object.fromEntries(volumeState)
  });
})();
