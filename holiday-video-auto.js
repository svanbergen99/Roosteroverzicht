(() => {
  "use strict";

  const TIME_ZONE = "Europe/Amsterdam";
  const TREE_URL = "https://api.github.com/repos/svanbergen99/Roosteroverzicht/git/trees/main?recursive=1";
  const PLAYED_PREFIX = "roosteroverzicht.autoHolidayVideo.v1.";

  let treePromise = null;
  let running = false;

  function amsterdamParts(date = new Date()) {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: TIME_ZONE,
      year: "numeric",
      month: "2-digit",
      day: "2-digit"
    }).formatToParts(date);
    const get = (type) => parts.find((part) => part.type === type)?.value || "";
    return { year: Number(get("year")), month: Number(get("month")), day: Number(get("day")) };
  }

  function dateKeyFromParts(parts) {
    return `${parts.year}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}`;
  }

  function todayKey() {
    return dateKeyFromParts(amsterdamParts());
  }

  function utcDateKey(year, monthIndex, day) {
    const date = new Date(Date.UTC(year, monthIndex, day, 12));
    return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
  }

  function shiftDateKey(value, amount) {
    const match = String(value || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!match) return "";
    return utcDateKey(Number(match[1]), Number(match[2]) - 1, Number(match[3]) + amount);
  }

  function easter(year) {
    const a = year % 19;
    const b = Math.floor(year / 100);
    const c = year % 100;
    const d = Math.floor(b / 4);
    const e = b % 4;
    const f = Math.floor((b + 8) / 25);
    const g = Math.floor((b - f + 1) / 3);
    const h = (19 * a + b - d - g + 15) % 30;
    const i = Math.floor(c / 4);
    const k = c % 4;
    const l = (32 + 2 * e + 2 * i - h - k) % 7;
    const m = Math.floor((a + 11 * h + 22 * l) / 451);
    const month = Math.floor((h + l - 7 * m + 114) / 31);
    const day = ((h + l - 7 * m + 114) % 31) + 1;
    return utcDateKey(year, month - 1, day);
  }

  function nthSunday(year, monthIndex, n) {
    const first = new Date(Date.UTC(year, monthIndex, 1, 12));
    const offset = (7 - first.getUTCDay()) % 7;
    return utcDateKey(year, monthIndex, 1 + offset + 7 * (n - 1));
  }

  function kingsDay(year) {
    const key = utcDateKey(year, 3, 27);
    const date = new Date(`${key}T12:00:00Z`);
    return date.getUTCDay() === 0 ? utcDateKey(year, 3, 26) : key;
  }

  function eventsForYear(year) {
    const easterSunday = easter(year);
    return [
      {
        id: `oud-en-nieuw-${year}`,
        dates: [utcDateKey(year, 0, 1)],
        fixedDate: true,
        videoPatterns: [/oud.?en.?nieuw/i, /nieuwjaar/i, /new[-_ ]?year/i, /oudjaar/i, /new[-_ ]?years?[-_ ]?eve/i]
      },
      {
        id: `valentijn-${year}`,
        dates: [utcDateKey(year, 1, 14)],
        videoPatterns: [/valentijn/i, /valentine/i]
      },
      {
        id: `pasen-${year}`,
        dates: [easterSunday, shiftDateKey(easterSunday, 1)],
        videoPatterns: [/Happy_Eastern_Fijne_Pasen_Soft\.mp4$/i, /Happy Eastern\.mp4$/i, /easter|pasen|eastern/i]
      },
      {
        id: `koningsdag-${year}`,
        dates: [kingsDay(year)],
        videoPatterns: [/Netherlands koningsdag\.mp4$/i, /koningsdag|king.?s?[-_ ]?day/i]
      },
      {
        id: `moederdag-${year}`,
        dates: [nthSunday(year, 4, 2)],
        videoPatterns: [/Happy Mother's Day\.mp4$/i, /moederdag|mother.?s?[-_ ]?day/i]
      },
      {
        id: `vaderdag-${year}`,
        dates: [nthSunday(year, 5, 3)],
        videoPatterns: [/vaderdag|father.?s?[-_ ]?day/i]
      },
      {
        id: `halloween-${year}`,
        dates: [utcDateKey(year, 9, 31)],
        videoPatterns: [/halloween|spooky|witch/i]
      },
      {
        id: `sinterklaas-${year}`,
        dates: [utcDateKey(year, 11, 5)],
        videoPatterns: [/Sinterklaas\.mp4$/i, /sinterklaas|sint[-_ ]?nicolaas/i]
      },
      {
        id: `kerst-${year}`,
        dates: [utcDateKey(year, 11, 25), utcDateKey(year, 11, 26)],
        videoPatterns: [/Christmas\.mp4$/i, /christmas|kerst|xmas/i]
      }
    ];
  }

  function normalizeText(value) {
    return String(value || "")
      .toLocaleLowerCase("nl-NL")
      .normalize("NFD")
      .replace(/\p{M}/gu, "")
      .replace(/[^a-z0-9]+/g, " ")
      .trim();
  }

  function isOfficialClosedText(value) {
    const text = normalizeText(value);
    return /\b(?:officieel|officeel)\s+gesloten\b/.test(text) || text === "officieel gesloten" || text === "officeel gesloten";
  }

  function containsClosureMarker(node, depth = 0) {
    if (depth > 3 || node == null) return false;
    if (typeof node === "string") return isOfficialClosedText(node);
    if (typeof node !== "object") return false;
    if (Array.isArray(node)) return node.some((item) => containsClosureMarker(item, depth + 1));
    return Object.values(node).some((value) => containsClosureMarker(value, depth + 1));
  }

  function hasOfficialClosedDate(roster, wantedDate) {
    const visit = (node, inheritedClosed = false, depth = 0) => {
      if (depth > 10 || node == null) return false;
      if (Array.isArray(node)) return node.some((item) => visit(item, inheritedClosed, depth + 1));
      if (typeof node !== "object") return false;

      const primitiveValues = Object.values(node).filter((value) => ["string", "number"].includes(typeof value));
      const localClosed = inheritedClosed || primitiveValues.some(isOfficialClosedText);
      const ownDate = [node.date, node.datum, node.day, node.dateKey]
        .map((value) => String(value || "").slice(0, 10))
        .find((value) => /^\d{4}-\d{2}-\d{2}$/.test(value));

      if (ownDate === wantedDate && (localClosed || containsClosureMarker(node))) return true;

      for (const value of Object.values(node)) {
        if (value && typeof value === "object" && visit(value, localClosed, depth + 1)) return true;
      }
      return false;
    };

    return visit(roster, false, 0);
  }

  function triggerDates(event, roster) {
    if (event.fixedDate) return new Set(event.dates);

    const dates = [...event.dates].sort();
    const closed = new Map(dates.map((date) => [date, hasOfficialClosedDate(roster, date)]));
    const triggers = new Set();

    dates.forEach((date, index) => {
      if (!closed.get(date)) {
        triggers.add(date);
        return;
      }

      const previousHoliday = dates[index - 1] || "";
      const sameClosedBlock = previousHoliday && closed.get(previousHoliday) && shiftDateKey(previousHoliday, 1) === date;
      if (!sameClosedBlock) triggers.add(shiftDateKey(date, -1));
    });

    return triggers;
  }

  function candidateToday(event, today) {
    if (event.fixedDate) return event.dates.includes(today);
    return event.dates.some((date) => date === today || shiftDateKey(date, -1) === today);
  }

  async function videoPaths() {
    if (!treePromise) {
      treePromise = fetch(`${TREE_URL}&t=${Date.now()}`, {
        cache: "no-store",
        headers: { Accept: "application/vnd.github+json" }
      }).then(async (response) => {
        if (!response.ok) throw new Error(`GitHub HTTP ${response.status}`);
        const data = await response.json();
        return Array.isArray(data?.tree)
          ? data.tree.filter((item) => item?.type === "blob" && /\.mp4$/i.test(String(item.path || ""))).map((item) => item.path)
          : [];
      }).catch(() => []);
    }
    return treePromise;
  }

  async function matchingVideo(event) {
    const paths = await videoPaths();
    for (const pattern of event.videoPatterns || []) {
      const match = paths.find((path) => pattern.test(path));
      if (match) return match;
    }
    return "";
  }

  async function ensureVideoInterface() {
    for (let attempt = 0; attempt < 50; attempt += 1) {
      if (document.getElementById("videoLibraryButton")) return true;
      await new Promise((resolve) => window.setTimeout(resolve, 100));
    }

    // De oorspronkelijke videobibliotheek wacht beperkt op de welkomstpagina.
    // Als iemand langer op Welkom bleef, laden we de UI eenmaal opnieuw na ontgrendelen.
    if (!document.getElementById("videoLibraryButton")) {
      await new Promise((resolve) => {
        const script = document.createElement("script");
        script.src = `video-library-ui.js?holidayRetry=${Date.now()}`;
        script.onload = script.onerror = resolve;
        document.body.appendChild(script);
      });
    }

    for (let attempt = 0; attempt < 50; attempt += 1) {
      if (document.getElementById("videoLibraryButton")) return true;
      await new Promise((resolve) => window.setTimeout(resolve, 100));
    }
    return false;
  }

  async function openVideo(path) {
    if (!path || !(await ensureVideoInterface())) return false;

    const button = document.getElementById("videoLibraryButton");
    const menu = document.getElementById("videoLibraryMenu");
    if (!button || !menu) return false;

    try { window.RoosterVideoLibrary?.refresh?.(); } catch (_) {}
    if (menu.hidden) button.click();

    for (let attempt = 0; attempt < 80; attempt += 1) {
      const items = [...document.querySelectorAll("#videoLibraryList [data-video-path]")];
      const item = items.find((candidate) => candidate.dataset.videoPath === path);
      if (item) {
        item.click();
        return true;
      }
      await new Promise((resolve) => window.setTimeout(resolve, 100));
    }
    return false;
  }

  function wasPlayed(eventId, today) {
    try { return localStorage.getItem(`${PLAYED_PREFIX}${today}.${eventId}`) === "1"; }
    catch (_) { return false; }
  }

  function markPlayed(eventId, today) {
    try { localStorage.setItem(`${PLAYED_PREFIX}${today}.${eventId}`, "1"); } catch (_) {}
  }

  async function run() {
    if (running || !window.RoosterSessionBridge?.isUnlocked?.()) return;
    running = true;
    try {
      const today = todayKey();
      const year = Number(today.slice(0, 4));
      const events = [...eventsForYear(year), ...eventsForYear(year + 1)];

      for (const event of events) {
        if (!candidateToday(event, today) || wasPlayed(event.id, today)) continue;

        const monthKey = event.dates[0].slice(0, 7);
        const roster = window.RoosterMonthBridge?.getRoster?.(monthKey);
        if (!roster) continue;

        if (!triggerDates(event, roster).has(today)) continue;
        const path = await matchingVideo(event);
        if (!path) continue;

        if (await openVideo(path)) {
          markPlayed(event.id, today);
          break;
        }
      }
    } finally {
      running = false;
    }
  }

  window.addEventListener("rooster-unlocked", () => window.setTimeout(run, 250));
  window.addEventListener("rooster-months-updated", run);
  window.addEventListener("rooster-month-changed", run);

  const app = document.getElementById("app");
  if (app && !app.hidden) window.setTimeout(run, 250);

  // Voor pagina's die rond middernacht open blijven.
  window.setInterval(run, 60000);

  window.RoosterHolidayVideoAuto = Object.freeze({
    run,
    hasOfficialClosedDate,
    triggerDates
  });
})();