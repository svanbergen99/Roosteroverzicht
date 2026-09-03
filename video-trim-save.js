(() => {
  "use strict";

  const STYLE_ID = "videoTrimSaveStyle";
  const ACTIONS_ID = "videoTrimSaveActions";
  const FFMPEG_VERSION = "0.12.15";
  const FFMPEG_UTIL_VERSION = "0.12.2";
  const FFMPEG_CORE_VERSION = "0.12.10";
  const MODULE_BASE = "https://cdn.jsdelivr.net/npm";

  let ffmpeg = null;
  let ffmpegLoading = null;
  let ffmpegFetchFile = null;
  let ffmpegToBlobURL = null;
  let progressSink = null;
  let previewing = false;
  let installedSection = null;

  function ensureStyle() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
      .video-trim-save-actions {
        display: grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        gap: 8px;
        margin-top: 13px;
      }
      .video-trim-save-actions button {
        min-height: 40px;
        padding: 9px 12px;
        border: 1px solid #cfc4ce;
        border-radius: 10px;
        background: rgba(255,255,255,.96);
        color: var(--accent-dark, #542450);
        box-shadow: 0 2px 7px rgba(15,23,42,.06);
        font: inherit;
        font-size: 13px;
        font-weight: 800;
        cursor: pointer;
      }
      .video-trim-save-actions button:hover:not(:disabled) {
        background: var(--soft-accent, #f4edf3);
        border-color: #bca9ba;
      }
      .video-trim-save-actions button:disabled {
        opacity: .55;
        cursor: wait;
      }
      .video-trim-save-button {
        background: var(--accent, #7b2f73) !important;
        border-color: var(--accent, #7b2f73) !important;
        color: #fff !important;
      }
      .video-trim-save-button:hover:not(:disabled) {
        background: var(--accent-dark, #542450) !important;
      }
      .video-trim-save-status {
        grid-column: 1 / -1;
        min-height: 18px;
        margin-top: 1px;
        color: var(--muted, #64748b);
        font-size: 12px;
        font-weight: 700;
        line-height: 1.35;
      }
      .video-trim-save-status.is-error { color: #b42336; }
      .video-trim-save-status.is-success { color: #187449; }
      html[data-theme="dark"] .video-trim-save-actions button:not(.video-trim-save-button) {
        border-color: #465263;
        background: rgba(23,30,41,.96);
        color: #f0b5e8;
      }
      @media (max-width: 620px) {
        .video-trim-save-actions { grid-template-columns: 1fr; }
        .video-trim-save-status { grid-column: 1; }
      }
    `;
    document.head.appendChild(style);
  }

  function secondsLabel(value) {
    const seconds = Math.max(0, Number(value) || 0);
    const minutes = Math.floor(seconds / 60);
    const rest = seconds - minutes * 60;
    return `${minutes}:${rest.toFixed(1).padStart(4, "0")}`;
  }

  function selectedRange(section) {
    const startInput = section.querySelector("#videoLibraryStart");
    const endInput = section.querySelector("#videoLibraryEnd");
    const player = section.querySelector("video");
    const total = Number(player?.duration) || Number(endInput?.max) || 0;
    let start = Number(startInput?.value) || 0;
    let end = Number(endInput?.value) || total;
    start = Math.max(0, Math.min(total, start));
    end = Math.max(start, Math.min(total, end));
    return { start, end, duration: Math.max(0, end - start), total };
  }

  function status(section, message, kind = "") {
    const node = section.querySelector(".video-trim-save-status");
    if (!node) return;
    node.textContent = message || "";
    node.classList.toggle("is-error", kind === "error");
    node.classList.toggle("is-success", kind === "success");
  }

  function setBusy(section, busy) {
    section.querySelectorAll("#videoTrimSaveActions button").forEach((button) => {
      button.disabled = Boolean(busy);
    });
  }

  function stopPreview(section, resetButton = true) {
    previewing = false;
    const player = section.querySelector("video");
    player?.pause();
    if (resetButton) {
      const button = section.querySelector("[data-video-trim-preview]");
      if (button) button.textContent = "▶ Voorbeeld selectie";
    }
  }

  async function previewSelection(section) {
    const player = section.querySelector("video");
    const button = section.querySelector("[data-video-trim-preview]");
    if (!player || !button) return;

    if (previewing) {
      stopPreview(section);
      status(section, "Voorbeeld gestopt.");
      return;
    }

    const { start, end, duration } = selectedRange(section);
    if (duration < 0.1) {
      status(section, "Selecteer eerst een langer fragment.", "error");
      return;
    }

    try {
      player.pause();
      player.currentTime = start;
      previewing = true;
      button.textContent = "■ Stop voorbeeld";
      status(section, `Voorbeeld: ${secondsLabel(start)} → ${secondsLabel(end)}`);
      await player.play();
    } catch (error) {
      previewing = false;
      button.textContent = "▶ Voorbeeld selectie";
      status(section, "Het voorbeeld kon niet worden gestart.", "error");
    }
  }

  function setTwelveSeconds(section) {
    const player = section.querySelector("video");
    const startInput = section.querySelector("#videoLibraryStart");
    const endInput = section.querySelector("#videoLibraryEnd");
    if (!player || !startInput || !endInput) return;

    const total = Number(player.duration) || Number(endInput.max) || 0;
    if (!total) {
      status(section, "De videolengte is nog niet geladen.", "error");
      return;
    }

    let start = Math.max(0, Number(startInput.value) || 0);
    let end = Math.min(total, start + 12);
    if (end - start < 12 && total >= 12) {
      start = total - 12;
      end = total;
    }

    startInput.value = String(start);
    endInput.value = String(end);
    startInput.dispatchEvent(new Event("input", { bubbles: true }));
    endInput.dispatchEvent(new Event("input", { bubbles: true }));
    status(section, total < 12
      ? `Deze video is korter dan 12 seconden; de volledige ${secondsLabel(total)} is geselecteerd.`
      : `Precies 12 seconden geselecteerd: ${secondsLabel(start)} → ${secondsLabel(end)}.`);
  }

  async function loadFfmpeg(section) {
    if (ffmpeg) return ffmpeg;
    if (ffmpegLoading) return ffmpegLoading;

    ffmpegLoading = (async () => {
      status(section, "Videobewerker wordt geladen… Dit hoeft alleen de eerste keer.");

      const ffmpegModule = await import(`${MODULE_BASE}/@ffmpeg/ffmpeg@${FFMPEG_VERSION}/dist/esm/index.js`);
      const utilModule = await import(`${MODULE_BASE}/@ffmpeg/util@${FFMPEG_UTIL_VERSION}/dist/esm/index.js`);
      const instance = new ffmpegModule.FFmpeg();
      ffmpegFetchFile = utilModule.fetchFile;
      ffmpegToBlobURL = utilModule.toBlobURL;

      instance.on("progress", ({ progress }) => {
        if (typeof progressSink !== "function") return;
        const pct = Math.max(0, Math.min(100, Math.round((Number(progress) || 0) * 100)));
        progressSink(pct);
      });

      const coreBase = `${MODULE_BASE}/@ffmpeg/core@${FFMPEG_CORE_VERSION}/dist/umd`;
      await instance.load({
        coreURL: await ffmpegToBlobURL(`${coreBase}/ffmpeg-core.js`, "text/javascript"),
        wasmURL: await ffmpegToBlobURL(`${coreBase}/ffmpeg-core.wasm`, "application/wasm")
      });

      ffmpeg = instance;
      return instance;
    })();

    try {
      return await ffmpegLoading;
    } catch (error) {
      ffmpegLoading = null;
      throw error;
    }
  }

  function outputFilename(player, start, end) {
    try {
      const url = new URL(player.currentSrc || player.src, window.location.href);
      const raw = decodeURIComponent(url.pathname.split("/").pop() || "video.mp4");
      const stem = raw.replace(/\.mp4$/i, "") || "video";
      const from = String(start.toFixed(1)).replace(".", "-");
      const to = String(end.toFixed(1)).replace(".", "-");
      return `${stem}_fragment_${from}-${to}.mp4`;
    } catch (_) {
      return "video_fragment.mp4";
    }
  }

  async function removeVirtualFile(instance, name) {
    try { await instance.deleteFile(name); } catch (_) {}
  }

  async function saveSelection(section) {
    const player = section.querySelector("video");
    if (!player) return;

    const sourceUrl = player.currentSrc || player.src;
    const { start, end, duration } = selectedRange(section);
    if (!sourceUrl || duration < 0.1) {
      status(section, "Selecteer eerst een geldig videofragment.", "error");
      return;
    }

    stopPreview(section);
    setBusy(section, true);
    let instance = null;
    const inputName = `input-${Date.now()}.mp4`;
    const outputName = `output-${Date.now()}.mp4`;

    try {
      instance = await loadFfmpeg(section);
      progressSink = (pct) => status(section, `MP4 maken… ${pct}%`);
      status(section, "Video wordt ingelezen…");
      await instance.writeFile(inputName, await ffmpegFetchFile(sourceUrl));

      const startText = start.toFixed(3);
      const durationText = duration.toFixed(3);
      let exitCode = await instance.exec([
        "-ss", startText,
        "-i", inputName,
        "-t", durationText,
        "-c:v", "libx264",
        "-preset", "ultrafast",
        "-crf", "22",
        "-c:a", "aac",
        "-b:a", "128k",
        "-movflags", "+faststart",
        outputName
      ]);

      if (exitCode !== 0) {
        await removeVirtualFile(instance, outputName);
        status(section, "Snelle MP4-methode wordt geprobeerd…");
        exitCode = await instance.exec([
          "-ss", startText,
          "-i", inputName,
          "-t", durationText,
          "-map", "0:v:0",
          "-map", "0:a?",
          "-c", "copy",
          "-avoid_negative_ts", "make_zero",
          "-movflags", "+faststart",
          outputName
        ]);
      }

      if (exitCode !== 0) throw new Error(`FFmpeg stopte met code ${exitCode}`);

      const data = await instance.readFile(outputName);
      const blob = new Blob([data.buffer], { type: "video/mp4" });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = outputFilename(player, start, end);
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 30000);

      status(section, `Klaar. ${secondsLabel(duration)} is als nieuwe MP4 opgeslagen.`, "success");
    } catch (error) {
      console.error("Video opslaan mislukt.", error);
      status(section, "Opslaan is mislukt. Controleer je internetverbinding en probeer het opnieuw.", "error");
    } finally {
      progressSink = null;
      if (instance) {
        await removeVirtualFile(instance, inputName);
        await removeVirtualFile(instance, outputName);
      }
      setBusy(section, false);
    }
  }

  function install(section) {
    if (!section || installedSection === section || section.querySelector(`#${ACTIONS_ID}`)) return;
    const trimControl = section.querySelector(".video-library-trim-control");
    const player = section.querySelector("video");
    if (!trimControl || !player) return;

    ensureStyle();
    const actions = document.createElement("div");
    actions.id = ACTIONS_ID;
    actions.className = "video-trim-save-actions";
    actions.innerHTML = `
      <button type="button" data-video-trim-preview>▶ Voorbeeld selectie</button>
      <button type="button" data-video-trim-twelve>⏱ Precies 12 sec</button>
      <button type="button" class="video-trim-save-button" data-video-trim-save>💾 Opslaan als MP4</button>
      <div class="video-trim-save-status" aria-live="polite">Kies met de sliders het begin en einde. De originele video blijft ongewijzigd.</div>`;
    trimControl.appendChild(actions);

    actions.querySelector("[data-video-trim-preview]")?.addEventListener("click", () => previewSelection(section));
    actions.querySelector("[data-video-trim-twelve]")?.addEventListener("click", () => setTwelveSeconds(section));
    actions.querySelector("[data-video-trim-save]")?.addEventListener("click", () => saveSelection(section));

    player.addEventListener("timeupdate", () => {
      if (!previewing) return;
      const { end } = selectedRange(section);
      if (player.currentTime >= end - 0.035) {
        stopPreview(section);
        try { player.currentTime = end; } catch (_) {}
        status(section, "Voorbeeld van de selectie is klaar.");
      }
    });
    player.addEventListener("ended", () => {
      if (previewing) stopPreview(section);
    });

    installedSection = section;
  }

  function findAndInstall() {
    install(document.getElementById("videoLibraryPlayerSection"));
  }

  const observer = new MutationObserver(findAndInstall);
  observer.observe(document.documentElement, { childList: true, subtree: true });
  window.addEventListener("rooster-unlocked", () => requestAnimationFrame(findAndInstall));

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", findAndInstall, { once: true });
  } else {
    findAndInstall();
  }
})();