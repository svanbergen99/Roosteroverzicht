(() => {
  "use strict";

  const TIME_ZONE = "Europe/Amsterdam";
  const FILE_MONTHS = ["Januari","Februari","Maart","April","Mei","Juni","Juli","Augustus","September","Oktober","November","December"];
  const REPO = "svanbergen99/Roosteroverzicht";
  const CORE_FILE_RE = /Roosterindex_September\.json(?:[?#]|$)/i;
  const SKIP_WELCOME_KEY = "rooster-skip-welcome-once";
  const nativeFetch = window.__roosterNativeFetch || window.fetch.bind(window);
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  const rosterCache = new Map();
  const fileMeta = new Map();

  let coreMonthKey = "";
  let activeMonthKey = "";
  let capturedId = "";
  let capturedPassword = "";
  let preloadPromise = null;
  let lastEmployeeSignature = "";

  const app = document.getElementById("app");
  const unlockForm = document.getElementById("unlockForm");
  const rosterId = document.getElementById("rosterId");
  const rosterPassword = document.getElementById("rosterPassword");
  const continueButton = document.getElementById("continueButton");
  const searchCard = document.querySelector(".search-card");
  const rosterResult = document.getElementById("rosterResult");
  const employeeName = document.getElementById("employeeName");
  const agendaBridge = window.RoosterAgendaBridge;

  function amsterdamParts(date = new Date()) {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: TIME_ZONE,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23"
    }).formatToParts(date);
    const get = (type) => parts.find((part) => part.type === type)?.value || "";
    return {
      year: Number(get("year")), month: Number(get("month")), day: Number(get("day")),
      hour: Number(get("hour")), minute: Number(get("minute"))
    };
  }

  function amsterdamDateKey(date = new Date()) {
    const p = amsterdamParts(date);
    return `${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`;
  }

  function currentMonthKey() { return amsterdamDateKey().slice(0, 7); }

  function shiftMonthKey(monthKey, amount) {
    const match = String(monthKey || "").match(/^(\d{4})-(\d{2})$/);
    if (!match) return currentMonthKey();
    const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1 + amount, 1));
    return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
  }

  function fileForMonth(monthKey) {
    const month = Number(String(monthKey).slice(5, 7));
    if (!(month >= 1 && month <= 12)) return "";
    return `Roosterindex_${FILE_MONTHS[month - 1]}.json`;
  }

  function replaceCoreFile(url, filename) {
    return String(url).replace(/Roosterindex_September\.json/i, filename);
  }

  async function fetchCoreRoster(input, init) {
    const originalUrl = typeof input === "string" ? input : input?.url || "";
    const preferred = currentMonthKey();
    const candidates = [preferred, shiftMonthKey(preferred, -1), shiftMonthKey(preferred, 1)];
    for (const monthKey of candidates) {
      const file = fileForMonth(monthKey);
      if (!file) continue;
      const target = replaceCoreFile(originalUrl, file);
      const response = await nativeFetch(target, init);
      if (response.status === 404) continue;
      if (response.ok) {
        coreMonthKey = monthKey;
        activeMonthKey = monthKey;
        fileMeta.set(monthKey, { file, lastModified: response.headers.get("Last-Modified") || "" });
      }
      return response;
    }
    return nativeFetch(replaceCoreFile(originalUrl, fileForMonth(preferred)), init);
  }

  window.fetch = function patchedFetch(input, init) {
    const url = typeof input === "string" ? input : input?.url || "";
    if (CORE_FILE_RE.test(url)) return fetchCoreRoster(input, init);
    return nativeFetch(input, init);
  };

  function base64ToBytes(value) {
    const binary = atob(value);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
    return bytes;
  }

  function nameSignature(value) {
    return String(value || "")
      .toLocaleLowerCase("nl-NL")
      .normalize("NFD")
      .replace(/\p{M}/gu, "")
      .replace(/[^\p{L}\p{N}]+/gu, " ")
      .trim().split(/\s+/).filter(Boolean).sort((a, b) => a.localeCompare(b, "nl")).join("|");
  }

  function dominantMonth(index) {
    const counts = new Map();
    for (const employee of index?.employees || []) {
      for (const schedule of employee?.schedules || []) {
        const key = String(schedule?.date || "").slice(0, 7);
        if (/^\d{4}-\d{2}$/.test(key)) counts.set(key, (counts.get(key) || 0) + 1);
      }
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0] || "";
  }

  async function loadAndDecrypt(monthKey, id, password) {
    if (rosterCache.has(monthKey)) return rosterCache.get(monthKey);
    const file = fileForMonth(monthKey);
    if (!file) return null;
    const response = await nativeFetch(`${file}?v=${Date.now()}`, { cache: "no-store" });
    if (response.status === 404) return null;
    if (!response.ok) return null;
    fileMeta.set(monthKey, { file, lastModified: response.headers.get("Last-Modified") || "" });
    const secured = await response.json();
    if (secured?.kind !== "roosterhulp-encrypted-index" || secured?.encrypted !== true || !secured.crypto || !secured.payload) return null;
    try {
      const secret = encoder.encode(`${id}\u0000${password}`);
      const keyMaterial = await crypto.subtle.importKey("raw", secret, "PBKDF2", false, ["deriveKey"]);
      const key = await crypto.subtle.deriveKey({
        name: "PBKDF2",
        hash: secured.crypto.hash || "SHA-256",
        salt: base64ToBytes(secured.crypto.salt),
        iterations: Number(secured.crypto.iterations) || 250000
      }, keyMaterial, { name: "AES-GCM", length: Number(secured.crypto.keyLength) || 256 }, false, ["decrypt"]);
      const plaintext = await crypto.subtle.decrypt({ name: "AES-GCM", iv: base64ToBytes(secured.crypto.iv) }, key, base64ToBytes(secured.payload));
      const parsed = JSON.parse(decoder.decode(plaintext));
      if (parsed?.kind !== "roosterhulp-index" || !Array.isArray(parsed.employees)) return null;
      const actualMonth = dominantMonth(parsed);
      if (actualMonth && actualMonth !== monthKey) return null;
      rosterCache.set(monthKey, parsed);
      return parsed;
    } catch (_) {
      return null;
    }
  }

  async function preloadMonths(id, password) {
    if (!id || !password || !window.crypto?.subtle) return;
    const center = coreMonthKey || currentMonthKey();
    const year = Number(center.slice(0, 4));
    const preferred = [center, shiftMonthKey(center, -1), shiftMonthKey(center, 1)];
    const rest = Array.from({ length: 12 }, (_, index) => `${year}-${String(index + 1).padStart(2, "0")}`);
    const keys = [...new Set([...preferred, ...rest])];
    for (const key of keys) {
      const loaded = await loadAndDecrypt(key, id, password);
      if (loaded) window.dispatchEvent(new CustomEvent("rooster-months-updated", { detail: { monthKey: key } }));
    }
  }

  function getEmployee(index, name) {
    const signature = nameSignature(name);
    if (!signature || !index) return null;
    return index.employees.find((employee) => nameSignature(employee.name) === signature) || null;
  }

  function mapSchedules(employee) {
    return Array.isArray(employee?.schedules) ? employee.schedules.map((schedule) => ({
      date: schedule.date,
      start: schedule.start,
      end: schedule.end,
      activities: Array.isArray(schedule.activities) ? schedule.activities.map((activity) => ({
        start: activity.start, end: activity.end, type: activity.type, name: activity.name, color: activity.color
      })) : []
    })) : [];
  }

  function selectedEmployeeName() {
    return rosterResult?.querySelector(".employee-name")?.textContent?.trim() || employeeName?.value?.trim() || "";
  }

  const originalGetCalendarData = agendaBridge?.getCalendarData?.bind(agendaBridge);
  if (agendaBridge && originalGetCalendarData) {
    agendaBridge.getCalendarData = function enhancedCalendarData() {
      const base = originalGetCalendarData() || {};
      const monthKey = activeMonthKey || coreMonthKey || currentMonthKey();
      const index = rosterCache.get(monthKey);
      const name = selectedEmployeeName() || base.name || "";
      const employee = getEmployee(index, name);
      if (!index) return { ...base, monthKey };
      const periodLabel = index?.period?.label && index.period.label !== "unknown" ? index.period.label : "";
      if (!employee) {
        return {
          ...base,
          name,
          monthKey,
          periodLabel,
          appointmentName: index?.display?.appointmentName || base.appointmentName || "Werkrooster",
          schedules: []
        };
      }
      return {
        ...base,
        name: employee.name,
        monthKey,
        periodLabel,
        appointmentName: index?.display?.appointmentName || base.appointmentName || "Werkrooster",
        schedules: mapSchedules(employee)
      };
    };
  }

  function ensureTitleRow() {
    if (!searchCard) return null;
    let stamp = document.getElementById("rosterUpdateStamp");
    if (stamp) return stamp;
    const title = searchCard.querySelector(":scope > h1");
    if (!title) return null;
    const row = document.createElement("div");
    row.className = "roster-title-row";
    title.before(row);
    row.appendChild(title);
    stamp = document.createElement("span");
    stamp.id = "rosterUpdateStamp";
    stamp.className = "roster-update-stamp";
    stamp.textContent = "Update: laden…";
    row.appendChild(stamp);
    return stamp;
  }

  function formatUpdateDate(value) {
    const date = value ? new Date(value) : null;
    if (!date || Number.isNaN(date.getTime())) return "";
    return new Intl.DateTimeFormat("nl-NL", {
      timeZone: TIME_ZONE, day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit"
    }).format(date).replace(",", "");
  }

  async function updateStamp(monthKey = activeMonthKey || coreMonthKey) {
    const stamp = ensureTitleRow();
    if (!stamp || !monthKey) return;
    stamp.textContent = "Update: laden…";
    const meta = fileMeta.get(monthKey) || { file: fileForMonth(monthKey), lastModified: "" };
    let updatedAt = "";
    try {
      const response = await nativeFetch(`https://api.github.com/repos/${REPO}/commits?path=${encodeURIComponent(meta.file)}&per_page=1`, {
        cache: "no-store", headers: { Accept: "application/vnd.github+json" }
      });
      if (response.ok) {
        const commits = await response.json();
        updatedAt = commits?.[0]?.commit?.committer?.date || commits?.[0]?.commit?.author?.date || "";
      }
    } catch (_) {}
    if (!updatedAt) updatedAt = meta.lastModified || "";
    const formatted = formatUpdateDate(updatedAt);
    stamp.textContent = formatted ? `Update: ${formatted}` : "Update: tijd onbekend";
  }

  function updatePeriodText(monthKey) {
    const index = rosterCache.get(monthKey);
    const period = rosterResult?.querySelector(".period");
    if (!period || !index) return;
    const label = index?.period?.label && index.period.label !== "unknown" ? index.period.label : "";
    period.textContent = label ? `Periode: ${label}` : "";
    period.hidden = !label;
  }

  window.RoosterMonthBridge = {
    getState() {
      return {
        activeMonthKey: activeMonthKey || coreMonthKey,
        coreMonthKey,
        currentMonthKey: currentMonthKey(),
        availableMonths: [...rosterCache.keys()].sort()
      };
    },
    getEmployeeData(name, monthKey = activeMonthKey || coreMonthKey) {
      const index = rosterCache.get(monthKey);
      const employee = getEmployee(index, name);
      return employee ? { monthKey, index, employee } : null;
    },
    getEmployeeSchedules(name) {
      const schedules = [];
      for (const [monthKey, index] of rosterCache.entries()) {
        const employee = getEmployee(index, name);
        if (!employee) continue;
        for (const schedule of employee.schedules || []) schedules.push({ monthKey, date: schedule.date, start: schedule.start, end: schedule.end });
      }
      return schedules.sort((a, b) => String(a.date || "").localeCompare(String(b.date || "")) || String(a.start || "").localeCompare(String(b.start || "")));
    },
    getRoster(monthKey = currentMonthKey()) { return rosterCache.get(monthKey) || null; },
    switchMonth(monthKey) {
      if (!rosterCache.has(monthKey)) return false;
      activeMonthKey = monthKey;
      updatePeriodText(monthKey);
      updateStamp(monthKey);
      window.dispatchEvent(new CustomEvent("rooster-month-changed", { detail: { monthKey } }));
      return true;
    },
    resetToCoreMonth() {
      activeMonthKey = coreMonthKey || currentMonthKey();
      updateStamp(activeMonthKey);
      window.dispatchEvent(new CustomEvent("rooster-month-changed", { detail: { monthKey: activeMonthKey } }));
    }
  };

  window.RoosterSessionBridge = {
    isUnlocked() { return Boolean(app && !app.hidden); },
    relock() {
      try { sessionStorage.setItem(SKIP_WELCOME_KEY, "1"); } catch (_) {}
      location.reload();
    }
  };

  document.addEventListener("submit", (event) => {
    if (event.target !== unlockForm) return;
    capturedId = rosterId?.value?.trim() || "";
    capturedPassword = rosterPassword?.value || "";
  }, true);

  function handleUnlocked() {
    activeMonthKey = coreMonthKey || currentMonthKey();
    ensureTitleRow();
    updateStamp(activeMonthKey);
    window.dispatchEvent(new CustomEvent("rooster-unlocked", { detail: { monthKey: activeMonthKey } }));
    if (capturedId && capturedPassword && !preloadPromise) {
      preloadPromise = preloadMonths(capturedId, capturedPassword).finally(() => {
        capturedId = "";
        capturedPassword = "";
        preloadPromise = null;
      });
    }
  }

  if (app) {
    const appObserver = new MutationObserver(() => { if (!app.hidden) handleUnlocked(); });
    appObserver.observe(app, { attributes: true, attributeFilter: ["hidden"] });
    if (!app.hidden) handleUnlocked();
  }

  if (rosterResult) {
    const rosterObserver = new MutationObserver(() => {
      const employeeHeader = rosterResult.querySelector(".employee-head");
      if (!employeeHeader) {
        lastEmployeeSignature = "";
        return;
      }

      const employee = employeeHeader.querySelector(".employee-name")?.textContent?.trim() || employeeName?.value?.trim() || "";
      const signature = nameSignature(employee);
      if (!signature || signature === lastEmployeeSignature) return;

      lastEmployeeSignature = signature;
      activeMonthKey = coreMonthKey || currentMonthKey();
      updateStamp(activeMonthKey);
      window.dispatchEvent(new CustomEvent("rooster-employee-selected", { detail: { monthKey: activeMonthKey } }));
    });
    rosterObserver.observe(rosterResult, { childList: true, subtree: false });
  }

  ensureTitleRow();

  try {
    if (sessionStorage.getItem(SKIP_WELCOME_KEY) === "1") {
      sessionStorage.removeItem(SKIP_WELCOME_KEY);
      setTimeout(() => continueButton?.click(), 0);
    }
  } catch (_) {}
})();
