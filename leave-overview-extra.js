(() => {
  "use strict";

  const SCREENSHOT = "Verlofaanvraag.PNG";
  const OVERRIDES = "Verlofaanvraag-handmatig.json";
  const CACHE_PREFIX = "rooster-official-closed-ocr-v1:";
  const OCR_SOURCES = [
    "https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js",
    "https://unpkg.com/tesseract.js@5/dist/tesseract.min.js"
  ];
  const MONTHS = {
    jan:1,januari:1,feb:2,februari:2,mrt:3,maart:3,mar:3,apr:4,april:4,mei:5,
    jun:6,juni:6,jul:7,juli:7,aug:8,augustus:8,sep:9,sept:9,september:9,
    okt:10,oktober:10,oct:10,october:10,nov:11,november:11,dec:12,december:12
  };
  const CLOSED = [
    ["nieuwjaarsdag", "Nieuwjaarsdag", /nieuwjaarsdag/i],
    ["pasen", "Pasen (eerste en tweede paasdag)", /pasen/i],
    ["koningsdag", "Koningsdag", /koningsdag/i],
    ["hemelvaartsdag", "Hemelvaartsdag", /hemelvaartsdag/i],
    ["pinksteren", "Pinksteren (eerste en tweede pinksterdag)", /pinksteren/i],
    ["kerstmis", "Kerstmis (eerste en tweede kerstdag)", /kerstmis/i]
  ];
  const VACATION_KEYS = {
    may: ["may", "meivakantie"],
    summer: ["summer", "zomervakantie"],
    christmas: ["christmas", "kerstvakantie"]
  };
  let ocrPromise = null;

  const esc = (v) => String(v ?? "").replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;").replaceAll("'","&#039;");
  const urlFor = (file) => { const u = new URL(file, document.baseURI); u.searchParams.set("v", Date.now()); return u.href; };

  async function exists(file) {
    try {
      let r = await fetch(urlFor(file), { method: "HEAD", cache: "no-store" });
      if (r.ok) return true;
      if (r.status !== 405 && r.status !== 501) return false;
      r = await fetch(urlFor(file), { cache: "no-store" });
      if (!r.ok) return false;
      try { await r.body?.cancel(); } catch (_) {}
      return true;
    } catch (_) { return false; }
  }

  async function overrides() {
    try {
      const r = await fetch(urlFor(OVERRIDES), { cache: "no-store" });
      if (!r.ok) return {};
      const data = await r.json();
      return data && typeof data === "object" ? data : {};
    } catch (_) { return {}; }
  }

  function prettyDate(value) {
    const s = String(value ?? "").trim();
    const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!m) return s;
    return new Intl.DateTimeFormat("nl-NL", { timeZone:"Europe/Amsterdam", day:"numeric", month:"long", year:"numeric" })
      .format(new Date(`${m[1]}-${m[2]}-${m[3]}T12:00:00Z`));
  }

  function pick(obj, keys) {
    for (const key of keys) if (obj && Object.prototype.hasOwnProperty.call(obj, key)) return obj[key];
  }

  async function patchVacationDom(shell) {
    if (!shell) return;
    const data = await overrides();
    const root = data.vakantie || data.vacation || {};
    shell.querySelectorAll("[data-vacation]").forEach((item) => {
      const keys = VACATION_KEYS[item.dataset.vacation] || [];
      const cfg = keys.map((key) => root[key]).find((v) => v && typeof v === "object");
      if (!cfg) return;
      const fields = [...item.querySelectorAll(".vacation-leave-fields > div strong")];
      const values = [
        pick(cfg,["startdatum","startDate","start"]),
        pick(cfg,["eindedatum","endDate","end"]),
        pick(cfg,["weeknummer","weekNumber","week"]),
        pick(cfg,["inleverDeadline","inleverdeadline","deadline"]),
        pick(cfg,["terugkoppelingWFM","terugkoppelingwfm","feedback"])
      ];
      values.forEach((value, index) => { if (value !== undefined && fields[index]) fields[index].textContent = index === 2 ? String(value) : prettyDate(value); });
    });
  }

  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const old = [...document.scripts].find((s) => s.src === src);
      if (old) {
        if (window.Tesseract?.recognize) resolve();
        else old.addEventListener("load", resolve, { once:true });
        return;
      }
      const s = document.createElement("script");
      s.src = src; s.async = true; s.crossOrigin = "anonymous";
      s.addEventListener("load", resolve, { once:true });
      s.addEventListener("error", () => { s.remove(); reject(new Error("OCR-module kon niet worden geladen.")); }, { once:true });
      document.head.appendChild(s);
    });
  }

  async function ocr() {
    if (window.Tesseract?.recognize) return window.Tesseract;
    if (ocrPromise) return ocrPromise;
    ocrPromise = (async () => {
      let error;
      for (const src of OCR_SOURCES) try { await loadScript(src); if (window.Tesseract?.recognize) return window.Tesseract; } catch (e) { error = e; }
      throw error || new Error("OCR-module is niet beschikbaar.");
    })();
    try { return await ocrPromise; } catch (e) { ocrPromise = null; throw e; }
  }

  async function hash(buffer) {
    if (!crypto?.subtle) return `size-${buffer.byteLength}`;
    const d = await crypto.subtle.digest("SHA-256", buffer);
    return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2,"0")).join("");
  }

  function dateTokens(text, fallbackYear) {
    const names = "jan(?:uari)?|feb(?:ruari)?|mrt|maart|mar|apr(?:il)?|mei|jun(?:i)?|jul(?:i)?|aug(?:ustus)?|sep(?:t(?:ember)?)?|okt(?:ober)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?";
    const re = new RegExp(`\\b([0-3]?\\d)\\s*(?:[-/.]|\\s)\\s*(${names})(?:\\s*(?:[-/.]|\\s)\\s*(\\d{2,4}))?\\b`, "gi");
    const out = []; let m;
    while ((m = re.exec(text))) {
      const month = MONTHS[String(m[2]).toLowerCase()]; let year = Number(m[3] || 0); if (year && year < 100) year += 2000;
      if (month && Number(m[1]) >= 1 && Number(m[1]) <= 31) out.push({ day:Number(m[1]), month, year });
    }
    const year = out.find((d) => d.year)?.year || fallbackYear;
    return out.map((d) => `${d.year || year}-${String(d.month).padStart(2,"0")}-${String(d.day).padStart(2,"0")}`).filter((d) => /^20\d{2}-/.test(d));
  }

  function parseClosed(raw) {
    const text = String(raw || "").replace(/\r/g,"\n").replace(/[–—−]/g,"-").replace(/[ \t]+/g," ");
    const header = text.match(/we\s+zijn\s+gesloten[^\n]*feestdagen[^\n]*/i);
    if (!header) return [];
    let section = text.slice(header.index + header[0].length);
    const end = section.search(/feestdagverlofberekening/i); if (end >= 0) section = section.slice(0,end);
    const year = Number((header[0] + " " + section).match(/\b(20\d{2})\b/)?.[1] || 0);
    const found = CLOSED.map(([key,label,re]) => ({ key,label,re,index:section.search(re) })).filter((x) => x.index >= 0).sort((a,b) => a.index-b.index);
    return found.map((row,i) => ({ key:row.key, label:row.label, dates:dateTokens(section.slice(row.index, found[i+1]?.index ?? section.length), year) })).filter((x) => x.dates.length);
  }

  function mergeClosed(rows, data) {
    const root = data.officieelGesloten || data.closedDays || {};
    const used = new Set(); const result = [];
    for (const row of rows) {
      let key = row.key, value = Object.prototype.hasOwnProperty.call(root,key) ? root[key] : undefined;
      if (value === undefined) { result.push(row); continue; }
      used.add(key); if (value === false || value === null) continue;
      const cfg = Array.isArray(value) ? { datums:value } : value;
      const dates = pick(cfg,["datums","dates","datum","date"]); const list = Array.isArray(dates) ? dates : dates ? [dates] : row.dates;
      result.push({ key, label:String(pick(cfg,["naam","label","name"]) || row.label), dates:list.map(String) });
    }
    for (const [key,value] of Object.entries(root)) {
      if (used.has(key) || CLOSED.some(([k]) => k === key) || value === false || value === null) continue;
      const cfg = Array.isArray(value) ? { datums:value } : value; const dates = pick(cfg,["datums","dates","datum","date"]); const list = Array.isArray(dates) ? dates : dates ? [dates] : [];
      if (list.length) result.push({ key, label:String(pick(cfg,["naam","label","name"]) || key), dates:list.map(String) });
    }
    return result;
  }

  async function closedData(status) {
    const r = await fetch(urlFor(SCREENSHOT), { cache:"no-store" });
    if (!r.ok) return [];
    const buffer = await r.arrayBuffer(); const h = await hash(buffer); const cacheKey = CACHE_PREFIX + h;
    let rows;
    try { rows = JSON.parse(localStorage.getItem(cacheKey) || "null"); } catch (_) {}
    if (!Array.isArray(rows)) {
      const T = await ocr(); const blob = new Blob([buffer], { type:r.headers.get("content-type") || "image/png" });
      const result = await T.recognize(blob, "nld", { logger(m) { if (m?.status === "recognizing text") status(`Verlofaanvraag.PNG wordt gelezen… ${Math.round(Number(m.progress || 0)*100)}%`); } });
      rows = parseClosed(result?.data?.text || "");
      try { localStorage.setItem(cacheKey, JSON.stringify(rows)); } catch (_) {}
    }
    return mergeClosed(rows, await overrides());
  }

  function ensureClosed(section, afterNode) {
    let shell = section.querySelector("#officialClosedDropdown");
    if (shell) return shell;
    shell = document.createElement("div"); shell.id = "officialClosedDropdown"; shell.className = "external-site-dropdown vacation-leave-dropdown";
    shell.innerHTML = `<button id="officialClosedButton" class="external-site-link external-site-dropdown-trigger" type="button" disabled aria-expanded="false"><strong>Officieel Gesloten</strong><span class="vacation-leave-toggle" aria-hidden="true">▾</span></button><div class="vacation-leave-panel" hidden><div class="vacation-leave-status" hidden></div><div class="vacation-leave-content"></div></div>`;
    afterNode.after(shell);
    const button = shell.querySelector("button"), panel = shell.querySelector(".vacation-leave-panel"), status = shell.querySelector(".vacation-leave-status"), content = shell.querySelector(".vacation-leave-content");
    const setStatus = (m="") => { status.textContent=m; status.hidden=!m; };
    button.addEventListener("click", async () => {
      const open = panel.hidden; panel.hidden = !open; button.setAttribute("aria-expanded", String(open)); shell.classList.toggle("is-open", open); if (!open) return;
      content.innerHTML = ""; setStatus("Gegevens worden geladen…");
      try {
        const rows = await closedData(setStatus);
        content.innerHTML = rows.map((row) => `<section class="vacation-leave-item"><h3>${esc(row.label)}</h3><div>${row.dates.map((d) => `<strong>${esc(prettyDate(d))}</strong>`).join("<br>")}</div></section>`).join(""); setStatus("");
      } catch (e) { content.innerHTML=""; setStatus(e?.message || "De gesloten dagen konden niet worden gelezen."); }
    });
    exists(SCREENSHOT).then((ok) => { button.disabled = !ok; });
    return shell;
  }

  function setup(attempt=0) {
    const section = document.getElementById("externalSitesSection");
    if (!section) { if (attempt < 40) setTimeout(() => setup(attempt+1),100); return; }
    const vacation = section.querySelector("#vacationLeaveDropdown");
    const leave = [...section.querySelectorAll(".external-site-link")].find((a) => a.querySelector("strong")?.textContent?.trim() === "Verlof aanvragen");
    if (!leave) return;
    const after = vacation || leave; ensureClosed(section, after);
    const content = section.querySelector("#vacationLeaveContent");
    if (content && !content.dataset.overrideObserver) {
      content.dataset.overrideObserver = "true";
      new MutationObserver(() => patchVacationDom(content)).observe(content, { childList:true, subtree:true });
      patchVacationDom(content);
    }
  }

  window.addEventListener("rooster-unlocked", () => setup());
  if (!document.getElementById("app")?.hidden) setup();
})();
