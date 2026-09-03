(() => {
  "use strict";

  const LEAVE_WARNING = "⚠️ Alleen als Traffic dit op Teams aangeeft";
  const VACATION_SOURCE = "Verlofaanvraag.PNG";
  const VACATION_CACHE_PREFIX = "rooster-vacation-leave-ocr-v1:";
  const OCR_SCRIPT_SOURCES = Object.freeze([
    "https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js",
    "https://unpkg.com/tesseract.js@5/dist/tesseract.min.js"
  ]);
  const VACATION_ROWS = Object.freeze([
    Object.freeze({ key: "may", label: "Meivakantie (incl Koningsdag)", pattern: /mei\s*vakantie/i }),
    Object.freeze({ key: "summer", label: "Zomervakantie", pattern: /zomer\s*vakantie/i }),
    Object.freeze({ key: "christmas", label: "Kerstvakantie", pattern: /kerst\s*vakantie/i })
  ]);
  const MONTHS = Object.freeze({
    jan: [1, "jan"], januari: [1, "jan"],
    feb: [2, "feb"], februari: [2, "feb"],
    mrt: [3, "mrt"], maart: [3, "mrt"], mar: [3, "mrt"],
    apr: [4, "apr"], april: [4, "apr"],
    mei: [5, "mei"],
    jun: [6, "jun"], juni: [6, "jun"],
    jul: [7, "jul"], juli: [7, "jul"],
    aug: [8, "aug"], augustus: [8, "aug"],
    sep: [9, "sep"], sept: [9, "sep"], september: [9, "sep"],
    okt: [10, "okt"], oktober: [10, "okt"], oct: [10, "okt"], october: [10, "okt"],
    nov: [11, "nov"], november: [11, "nov"],
    dec: [12, "dec"], december: [12, "dec"]
  });

  let ocrLoaderPromise = null;
  let vacationLoadPromise = null;

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function vacationSourceUrl(cacheBust = true) {
    const url = new URL(VACATION_SOURCE, document.baseURI);
    if (cacheBust) url.searchParams.set("v", `${Date.now()}`);
    return url.href;
  }

  async function probeVacationSource() {
    const url = vacationSourceUrl();
    try {
      const response = await fetch(url, { method: "HEAD", cache: "no-store" });
      if (response.ok) return true;
      if (response.status !== 405 && response.status !== 501) return false;
    } catch (_) {}

    try {
      const response = await fetch(url, { cache: "no-store" });
      if (!response.ok) return false;
      try { await response.body?.cancel(); } catch (_) {}
      return true;
    } catch (_) {
      return false;
    }
  }

  function ensureVacationDropdown(section, leaveLink) {
    let shell = section.querySelector("#vacationLeaveDropdown");
    if (shell) return shell;

    shell = document.createElement("div");
    shell.id = "vacationLeaveDropdown";
    shell.className = "external-site-dropdown vacation-leave-dropdown";
    shell.innerHTML = `
      <button id="vacationLeaveButton" class="external-site-link external-site-dropdown-trigger" type="button" aria-expanded="false" aria-controls="vacationLeavePanel" disabled>
        <strong>Vakantie Verlof Aanvragen</strong>
        <span class="vacation-leave-toggle" aria-hidden="true">▾</span>
      </button>
      <div id="vacationLeavePanel" class="vacation-leave-panel" hidden>
        <div id="vacationLeaveStatus" class="vacation-leave-status" aria-live="polite" hidden></div>
        <div id="vacationLeaveContent" class="vacation-leave-content"></div>
      </div>`;

    leaveLink.after(shell);

    const button = shell.querySelector("#vacationLeaveButton");
    const panel = shell.querySelector("#vacationLeavePanel");
    button?.addEventListener("click", async () => {
      if (button.disabled) return;
      const willOpen = panel.hidden;
      panel.hidden = !willOpen;
      button.setAttribute("aria-expanded", String(willOpen));
      shell.classList.toggle("is-open", willOpen);
      if (!willOpen) return;
      await loadVacationData(shell);
    });

    probeVacationSource().then((available) => {
      if (button) button.disabled = !available;
      shell.dataset.sourceAvailable = available ? "true" : "false";
    });

    return shell;
  }

  function setVacationStatus(shell, message = "") {
    const status = shell.querySelector("#vacationLeaveStatus");
    if (!status) return;
    status.textContent = message;
    status.hidden = !message;
  }

  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const existing = [...document.scripts].find((script) => script.src === src);
      if (existing) {
        if (window.Tesseract?.recognize) resolve();
        else existing.addEventListener("load", resolve, { once: true });
        return;
      }
      const script = document.createElement("script");
      script.src = src;
      script.async = true;
      script.crossOrigin = "anonymous";
      script.addEventListener("load", resolve, { once: true });
      script.addEventListener("error", () => {
        script.remove();
        reject(new Error(`OCR-module kon niet worden geladen: ${src}`));
      }, { once: true });
      document.head.appendChild(script);
    });
  }

  async function loadOcrEngine() {
    if (window.Tesseract?.recognize) return window.Tesseract;
    if (ocrLoaderPromise) return ocrLoaderPromise;

    ocrLoaderPromise = (async () => {
      let lastError = null;
      for (const src of OCR_SCRIPT_SOURCES) {
        try {
          await loadScript(src);
          if (window.Tesseract?.recognize) return window.Tesseract;
        } catch (error) {
          lastError = error;
        }
      }
      throw lastError || new Error("OCR-module is niet beschikbaar.");
    })();

    try {
      return await ocrLoaderPromise;
    } catch (error) {
      ocrLoaderPromise = null;
      throw error;
    }
  }

  async function sha256Hex(buffer) {
    if (!window.crypto?.subtle) return `size-${buffer.byteLength}`;
    const digest = await crypto.subtle.digest("SHA-256", buffer);
    return [...new Uint8Array(digest)]
      .map((byte) => byte.toString(16).padStart(2, "0"))
      .join("");
  }

  function normalizeOcrText(value) {
    return String(value || "")
      .replace(/\r/g, "\n")
      .replace(/[–—−]/g, "-")
      .replace(/[|]/g, " ")
      .replace(/[ \t]+/g, " ")
      .replace(/\n{2,}/g, "\n")
      .trim();
  }

  function dateMatches(text) {
    const monthNames = "jan(?:uari)?|feb(?:ruari)?|mrt|maart|mar|apr(?:il)?|mei|jun(?:i)?|jul(?:i)?|aug(?:ustus)?|sep(?:t(?:ember)?)?|okt(?:ober)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?";
    const regex = new RegExp(`\\b([0-3]?\\d)\\s*(?:[-/.]|\\s)\\s*(${monthNames})\\s*(?:[-/.]|\\s)\\s*(\\d{2,4})\\b`, "gi");
    const matches = [];
    let match;
    while ((match = regex.exec(text))) {
      const monthKey = String(match[2] || "").toLocaleLowerCase("nl-NL");
      const month = MONTHS[monthKey];
      if (!month) continue;
      let year = Number(match[3]);
      if (year < 100) year += 2000;
      const day = Number(match[1]);
      if (!(day >= 1 && day <= 31) || !(year >= 2000 && year <= 2099)) continue;
      matches.push({
        index: match.index,
        end: regex.lastIndex,
        display: `${day} ${month[1]} ${year}`,
        iso: `${year}-${String(month[0]).padStart(2, "0")}-${String(day).padStart(2, "0")}`
      });
    }
    return matches;
  }

  function blockForPattern(text, pattern, endIndex) {
    pattern.lastIndex = 0;
    const match = pattern.exec(text);
    if (!match) return null;
    return {
      start: match.index,
      body: text.slice(match.index, endIndex > match.index ? endIndex : text.length)
    };
  }

  function parseVacationRows(rawText) {
    const text = normalizeOcrText(rawText);
    const located = VACATION_ROWS.map((row) => {
      row.pattern.lastIndex = 0;
      const match = row.pattern.exec(text);
      return { ...row, index: match?.index ?? -1 };
    });
    if (located.some((row) => row.index < 0)) return null;

    located.sort((a, b) => a.index - b.index);
    const parsedByKey = new Map();

    for (let index = 0; index < located.length; index += 1) {
      const row = located[index];
      const nextIndex = located[index + 1]?.index ?? text.length;
      const block = blockForPattern(text, row.pattern, nextIndex);
      if (!block) return null;

      const dates = dateMatches(block.body);
      if (dates.length < 4) return null;

      let withoutDates = block.body;
      for (const date of [...dates].sort((a, b) => b.index - a.index)) {
        withoutDates = withoutDates.slice(0, date.index) + " ".repeat(Math.max(1, date.end - date.index)) + withoutDates.slice(date.end);
      }
      const weekMatch = withoutDates.match(/\b(\d{1,2})\s*-\s*(\d{1,2})\b/);
      if (!weekMatch) return null;

      parsedByKey.set(row.key, {
        key: row.key,
        label: row.label,
        startDate: dates[0].display,
        startIso: dates[0].iso,
        endDate: dates[1].display,
        endIso: dates[1].iso,
        weekNumber: `${Number(weekMatch[1])}-${Number(weekMatch[2])}`,
        deadline: dates[2].display,
        deadlineIso: dates[2].iso,
        feedback: dates[3].display,
        feedbackIso: dates[3].iso
      });
    }

    const ordered = VACATION_ROWS.map((row) => parsedByKey.get(row.key)).filter(Boolean);
    return ordered.length === VACATION_ROWS.length ? ordered : null;
  }

  function renderVacationRows(shell, rows) {
    const content = shell.querySelector("#vacationLeaveContent");
    if (!content) return;
    content.innerHTML = rows.map((row) => `
      <section class="vacation-leave-item" data-vacation="${escapeHtml(row.key)}">
        <h3>${escapeHtml(row.label)}</h3>
        <div class="vacation-leave-fields">
          <div><span>Startdatum</span><strong>${escapeHtml(row.startDate)}</strong></div>
          <div><span>Eindedatum</span><strong>${escapeHtml(row.endDate)}</strong></div>
          <div><span>Weeknummer</span><strong>${escapeHtml(row.weekNumber)}</strong></div>
          <div><span>Inlever Deadline</span><strong>${escapeHtml(row.deadline)}</strong></div>
          <div><span>Terugkoppeling WFM</span><strong>${escapeHtml(row.feedback)}</strong></div>
        </div>
      </section>`).join("");
  }

  function readCachedRows(hash) {
    try {
      const raw = localStorage.getItem(`${VACATION_CACHE_PREFIX}${hash}`);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed?.rows) && parsed.rows.length === VACATION_ROWS.length ? parsed.rows : null;
    } catch (_) {
      return null;
    }
  }

  function cacheRows(hash, rows) {
    try {
      localStorage.setItem(`${VACATION_CACHE_PREFIX}${hash}`, JSON.stringify({ rows, savedAt: Date.now() }));
    } catch (_) {}
  }

  async function fetchVacationImage() {
    const response = await fetch(vacationSourceUrl(), { cache: "no-store" });
    if (!response.ok) throw new Error("Geen verlofoverzicht beschikbaar.");
    const buffer = await response.arrayBuffer();
    return {
      buffer,
      type: response.headers.get("content-type") || "image/png"
    };
  }

  async function loadVacationData(shell) {
    if (vacationLoadPromise) return vacationLoadPromise;
    const content = shell.querySelector("#vacationLeaveContent");
    if (!content) return;

    vacationLoadPromise = (async () => {
      content.innerHTML = "";
      setVacationStatus(shell, "Verlofoverzicht wordt gelezen…");

      const image = await fetchVacationImage();
      const hash = await sha256Hex(image.buffer);
      const cachedRows = readCachedRows(hash);
      if (cachedRows) {
        renderVacationRows(shell, cachedRows);
        setVacationStatus(shell, "");
        return;
      }

      const Tesseract = await loadOcrEngine();
      const blob = new Blob([image.buffer], { type: image.type });
      let lastProgress = -1;
      const result = await Tesseract.recognize(blob, "nld", {
        logger(message) {
          if (message?.status !== "recognizing text") return;
          const progress = Math.max(0, Math.min(100, Math.round(Number(message.progress || 0) * 100)));
          if (progress === lastProgress) return;
          lastProgress = progress;
          setVacationStatus(shell, `Verlofoverzicht wordt gelezen… ${progress}%`);
        }
      });

      const rows = parseVacationRows(result?.data?.text || "");
      if (!rows) throw new Error("De screenshot is gevonden, maar de drie vakantieperioden konden niet betrouwbaar worden uitgelezen.");

      cacheRows(hash, rows);
      renderVacationRows(shell, rows);
      setVacationStatus(shell, "");
    })();

    try {
      await vacationLoadPromise;
    } catch (error) {
      content.innerHTML = "";
      setVacationStatus(shell, error?.message || "Het verlofoverzicht kon niet worden gelezen.");
    } finally {
      vacationLoadPromise = null;
    }
  }

  function applyTweaks(attempt = 0) {
    const section = document.getElementById("externalSitesSection");
    if (!section) {
      if (attempt < 30) window.setTimeout(() => applyTweaks(attempt + 1), 100);
      return;
    }

    section.querySelectorAll(".external-site-meta").forEach((meta) => meta.remove());

    const leaveLink = [...section.querySelectorAll(".external-site-link")].find((link) =>
      link.querySelector("strong")?.textContent?.trim() === "Verlof aanvragen"
    );
    if (!leaveLink) return;

    leaveLink.classList.add("is-warning");
    let warning = leaveLink.querySelector(".external-site-warning");
    if (!warning) {
      warning = document.createElement("span");
      warning.className = "external-site-warning";
      leaveLink.appendChild(warning);
    }
    warning.textContent = LEAVE_WARNING;

    ensureVacationDropdown(section, leaveLink);
  }

  window.addEventListener("rooster-unlocked", () => applyTweaks());
  if (!document.getElementById("app")?.hidden) applyTweaks();
})();
