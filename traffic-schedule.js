(() => {
  "use strict";

  const TIME_ZONE = "Europe/Amsterdam";
  const REFRESH_MS = 15000;
  const LIVE_URL = "https://roosteroverzicht-traffic-bridge-production.up.railway.app/api/traffic-live";
  const MONTHS = Object.freeze({
    januari: 1,
    februari: 2,
    maart: 3,
    april: 4,
    mei: 5,
    juni: 6,
    juli: 7,
    augustus: 8,
    september: 9,
    oktober: 10,
    november: 11,
    december: 12
  });

  const app = document.getElementById("app");
  const searchCard = document.querySelector(".search-card");
  if (!app || !searchCard) return;

  let refreshTimer = null;

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function amsterdamNow(date = new Date()) {
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
    const hour = Number(get("hour"));
    const minute = Number(get("minute"));
    return {
      dateKey: `${get("year")}-${get("month")}-${get("day")}`,
      minutes: (Number.isFinite(hour) ? hour : 0) * 60 + (Number.isFinite(minute) ? minute : 0)
    };
  }

  function formatDate(dateKey) {
    const date = new Date(`${dateKey}T12:00:00Z`);
    return new Intl.DateTimeFormat("nl-NL", {
      timeZone: TIME_ZONE,
      weekday: "long",
      day: "numeric",
      month: "long"
    }).format(date);
  }

  function businessHours(dateKey) {
    const date = new Date(`${dateKey}T12:00:00Z`);
    const weekday = date.getUTCDay();
    if (weekday === 6) return { start: "09:00", close: "16:30" };
    if (weekday >= 1 && weekday <= 5) return { start: "08:00", close: "18:00" };
    return { start: "", close: "" };
  }

  function resolveTime(value, dateKey) {
    const text = String(value || "").trim().toLocaleLowerCase("nl-NL");
    const hours = businessHours(dateKey);
    if (text === "start") return hours.start;
    if (text === "sluit") return hours.close;
    return text;
  }

  function timeToMinutes(value, dateKey) {
    const text = resolveTime(value, dateKey);
    const match = text.match(/^(\d{1,2}):(\d{2})$/);
    if (!match) return NaN;
    return Number(match[1]) * 60 + Number(match[2]);
  }

  function trafficDateKey(day, monthName, explicitYear, nowDateKey) {
    const month = MONTHS[String(monthName || "").toLocaleLowerCase("nl-NL")];
    const dayNumber = Number(day);
    if (!month || !Number.isInteger(dayNumber) || dayNumber < 1 || dayNumber > 31) return "";

    const nowYear = Number(String(nowDateKey || "").slice(0, 4));
    const years = explicitYear
      ? [Number(explicitYear)]
      : [nowYear - 1, nowYear, nowYear + 1];
    const nowTime = new Date(`${nowDateKey}T12:00:00Z`).getTime();

    let best = null;
    for (const year of years) {
      if (!Number.isInteger(year)) continue;
      const date = new Date(Date.UTC(year, month - 1, dayNumber, 12));
      if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== dayNumber) continue;
      const distance = Math.abs(date.getTime() - nowTime);
      if (!best || distance < best.distance) best = { year, distance };
    }

    if (!best) return "";
    return `${best.year}-${String(month).padStart(2, "0")}-${String(dayNumber).padStart(2, "0")}`;
  }

  function parseTrafficShift(segment) {
    const text = String(segment || "")
      .replace(/[–—]/g, "-")
      .replace(/\s+/g, " ")
      .trim();
    if (!text) return null;

    let match = text.match(/^tot\s+(\d{1,2}:\d{2})(?:\s*uur)?\s+(.+)$/i);
    if (match) return { start: "start", end: match[1], name: match[2].trim() };

    match = text.match(/^tot\s+sluit(?:ing)?(?:\s*uur)?\s+(.+)$/i);
    if (match) return { start: "start", end: "sluit", name: match[1].trim() };

    match = text.match(/^start(?:\s*uur)?\s*(?:-|tot)\s*(\d{1,2}:\d{2})(?:\s*uur)?\s+(.+)$/i);
    if (match) return { start: "start", end: match[1], name: match[2].trim() };

    match = text.match(/^start(?:\s*uur)?\s*(?:-|tot)\s*sluit(?:ing)?(?:\s*uur)?\s+(.+)$/i);
    if (match) return { start: "start", end: "sluit", name: match[1].trim() };

    match = text.match(/^(\d{1,2}:\d{2})(?:\s*uur)?\s*(?:-|tot)\s*(\d{1,2}:\d{2})(?:\s*uur)?\s+(.+)$/i);
    if (match) return { start: match[1], end: match[2], name: match[3].trim() };

    match = text.match(/^(\d{1,2}:\d{2})(?:\s*uur)?\s*(?:-|tot)\s*sluit(?:ing)?(?:\s*uur)?\s+(.+)$/i);
    if (match) return { start: match[1], end: "sluit", name: match[2].trim() };

    return null;
  }

  function parseTrafficHeader(header, nowDateKey) {
    const text = String(header || "").replace(/\s+/g, " ").trim();
    if (!text) return null;

    const dateMatch = text.match(/\b(?:maandag|dinsdag|woensdag|donderdag|vrijdag|zaterdag|zondag)\s+(\d{1,2})\s+(januari|februari|maart|april|mei|juni|juli|augustus|september|oktober|november|december)(?:\s+(\d{4}))?\b/i);
    if (!dateMatch) return null;

    const dateKey = trafficDateKey(dateMatch[1], dateMatch[2], dateMatch[3], nowDateKey);
    if (!dateKey) return null;

    const schedule = text
      .split(/\s*\/\/\s*/)
      .slice(1)
      .map(parseTrafficShift)
      .filter(Boolean);

    if (!schedule.length) return null;
    return { dateKey, schedule };
  }

  async function getLiveSchedule(nowDateKey) {
    const response = await fetch(LIVE_URL, {
      method: "GET",
      credentials: "omit",
      cache: "no-store"
    });
    if (!response.ok) return null;

    const data = await response.json();
    return parseTrafficHeader(data?.trafficHeader, nowDateKey);
  }

  function ensureBar() {
    let bar = document.getElementById("trafficTodayBar");
    if (bar) return bar;

    bar = document.createElement("div");
    bar.id = "trafficTodayBar";
    bar.className = "traffic-today-bar";

    const salaryBar = document.getElementById("nextSalaryPaymentBar");
    if (salaryBar) {
      salaryBar.before(bar);
    } else {
      const titleRow = searchCard.querySelector(".roster-title-row");
      const title = searchCard.querySelector(":scope > h1");
      (titleRow || title || searchCard.firstElementChild)?.before(bar);
    }
    return bar;
  }

  async function render() {
    if (app.hidden) return;
    const bar = ensureBar();
    const now = amsterdamNow();
    let schedule = [];
    let scheduleDateKey = now.dateKey;

    try {
      const live = await getLiveSchedule(now.dateKey);
      if (live) {
        schedule = live.schedule;
        scheduleDateKey = live.dateKey;
      }
    } catch (_) {}

    const dateLabel = formatDate(scheduleDateKey);

    if (!schedule.length) {
      bar.innerHTML = `
        <span class="traffic-today-title">🚨 Traffic (${escapeHtml(dateLabel)})</span>
        <strong class="traffic-not-updated">Nog niet bijgewerkt</strong>`;
      bar.hidden = false;
      return;
    }

    const shifts = schedule.map((item) => {
      const startLabel = resolveTime(item.start, scheduleDateKey);
      const endLabel = resolveTime(item.end, scheduleDateKey);
      const start = timeToMinutes(item.start, scheduleDateKey);
      const end = timeToMinutes(item.end, scheduleDateKey);
      const isCurrent = scheduleDateKey === now.dateKey && Number.isFinite(start) && Number.isFinite(end) && now.minutes >= start && now.minutes < end;
      const timeLabel = startLabel && endLabel ? `${startLabel}–${endLabel}` : `${item.start}–${item.end}`;
      return `
        <span class="traffic-shift${isCurrent ? " is-current" : ""}">
          ${isCurrent ? '<span class="traffic-now">Nu</span>' : ""}
          <span class="traffic-time">${escapeHtml(timeLabel)}</span>
          <strong>${escapeHtml(item.name)}</strong>
        </span>`;
    }).join("");

    bar.innerHTML = `
      <span class="traffic-today-title">🚨 Traffic (${escapeHtml(dateLabel)})</span>
      <span class="traffic-today-shifts">${shifts}</span>`;
    bar.hidden = false;
  }

  function start() {
    render();
    if (refreshTimer !== null) return;
    refreshTimer = window.setInterval(render, REFRESH_MS);
  }

  window.addEventListener("rooster-unlocked", start);
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden && !app.hidden) render();
  });
  if (!app.hidden) start();
})();
