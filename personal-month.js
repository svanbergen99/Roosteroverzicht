(() => {
  "use strict";

  const bridge = window.RoosterAgendaBridge;
  const monthBridge = window.RoosterMonthBridge;
  const rosterResult = document.getElementById("rosterResult");
  const searchCard = document.querySelector(".search-card");
  if (!bridge || !rosterResult || !searchCard) return;

  const TIME_ZONE = "Europe/Amsterdam";
  const weekdays = ["ma", "di", "wo", "do", "vr", "za", "zo"];
  const monthNames = ["januari", "februari", "maart", "april", "mei", "juni", "juli", "augustus", "september", "oktober", "november", "december"];
  let resizeTimer = null;
  let renderTimer = null;

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function amsterdamDateKey(date = new Date()) {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: TIME_ZONE,
      year: "numeric",
      month: "2-digit",
      day: "2-digit"
    }).formatToParts(date);
    const get = (type) => parts.find((part) => part.type === type)?.value || "";
    return `${get("year")}-${get("month")}-${get("day")}`;
  }

  function formatTime(value) {
    if (!value) return "";
    const text = String(value).trim();
    const embedded = text.match(/(?:T|\s)(\d{1,2}):(\d{2})/);
    if (embedded) return `${embedded[1].padStart(2, "0")}:${embedded[2]}`;
    const plain = text.match(/^(\d{1,2}):(\d{2})$/);
    if (plain) return `${plain[1].padStart(2, "0")}:${plain[2]}`;
    return "";
  }

  function timeRange(start, end) {
    const from = formatTime(start);
    const to = formatTime(end);
    if (from && to) return `${from} – ${to}`;
    return from || to || "";
  }

  function safeColor(value) {
    const color = String(value || "").trim();
    return /^#[0-9a-f]{3}([0-9a-f]{3})?$/i.test(color) ? color : "#dbe2ea";
  }

  function formatShortDate(dateKey) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(dateKey || ""))) return String(dateKey || "");
    const date = new Date(`${dateKey}T12:00:00Z`);
    return new Intl.DateTimeFormat("nl-NL", {
      timeZone: TIME_ZONE,
      weekday: "long",
      day: "numeric",
      month: "long"
    }).format(date);
  }

  function entriesFromData(data) {
    const entries = (Array.isArray(data?.schedules) ? data.schedules : []).map((schedule) => ({
      date: String(schedule?.date || "").slice(0, 10),
      start: schedule?.start,
      end: schedule?.end,
      shiftTime: timeRange(schedule?.start, schedule?.end),
      activities: (Array.isArray(schedule?.activities) ? schedule.activities : []).map((activity) => ({
        name: activity?.name || activity?.type || "Activiteit",
        time: timeRange(activity?.start, activity?.end),
        color: safeColor(activity?.color)
      }))
    }));
    entries.sort((a, b) => a.date.localeCompare(b.date) || String(a.start || "").localeCompare(String(b.start || "")));
    return entries;
  }

  function monthModel(data, entries) {
    const state = monthBridge?.getState?.() || {};
    const monthKey = data?.monthKey || state.activeMonthKey || entries[0]?.date?.slice(0, 7) || amsterdamDateKey().slice(0, 7);
    const [yearText, monthText] = monthKey.split("-");
    const year = Number(yearText);
    const monthIndex = Number(monthText) - 1;
    const daysInMonth = new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
    const firstJsDay = new Date(Date.UTC(year, monthIndex, 1, 12)).getUTCDay();
    const mondayOffset = (firstJsDay + 6) % 7;
    const totalCells = mondayOffset + daysInMonth <= 35 ? 35 : 42;
    const byDate = new Map();

    for (const entry of entries) {
      if (!entry.date.startsWith(`${monthKey}-`)) continue;
      if (!byDate.has(entry.date)) byDate.set(entry.date, []);
      byDate.get(entry.date).push(entry);
    }

    return { monthKey, year, monthIndex, daysInMonth, mondayOffset, totalCells, byDate };
  }

  function activityHtml(activity) {
    return `<div class="personal-month-activity" style="--activity-color:${safeColor(activity?.color)}"><span class="personal-month-activity-name">${escapeHtml(activity?.name || "Activiteit")}</span>${activity?.time ? `<span class="personal-month-activity-time">${escapeHtml(activity.time)}</span>` : ""}</div>`;
  }

  function scheduleHtml(entry) {
    const activities = Array.isArray(entry?.activities) ? entry.activities : [];
    return `<div class="personal-month-shift">${entry?.shiftTime ? `<div class="personal-month-shift-time">${escapeHtml(entry.shiftTime)}</div>` : ""}<div class="personal-month-activities">${activities.length ? activities.map(activityHtml).join("") : '<div class="personal-month-no-activities">Geen roosteronderdelen beschikbaar.</div>'}</div></div>`;
  }

  function employeeSummary(data) {
    const today = amsterdamDateKey();
    const schedules = monthBridge?.getEmployeeSchedules?.(data?.name) || (data?.schedules || []);
    const normalized = schedules
      .map((schedule) => ({ date: String(schedule?.date || "").slice(0, 10), range: timeRange(schedule?.start, schedule?.end) }))
      .filter((schedule) => /^\d{4}-\d{2}-\d{2}$/.test(schedule.date) && schedule.range)
      .sort((a, b) => a.date.localeCompare(b.date) || a.range.localeCompare(b.range));

    const todayRanges = normalized.filter((schedule) => schedule.date === today).map((schedule) => schedule.range);
    const nextDate = normalized.find((schedule) => schedule.date > today)?.date || "";
    const nextRanges = nextDate ? normalized.filter((schedule) => schedule.date === nextDate).map((schedule) => schedule.range) : [];

    return {
      todayText: todayRanges.length ? todayRanges.join(", ") : "Geen dienst",
      nextText: nextDate ? `${formatShortDate(nextDate)} · ${nextRanges.join(", ")}` : "Geen volgende dienst gevonden"
    };
  }

  function navigationHtml(model) {
    const state = monthBridge?.getState?.() || {};
    const months = Array.isArray(state.availableMonths) ? [...state.availableMonths].sort() : [];
    const activeIndex = months.indexOf(model.monthKey);
    const previous = activeIndex > 0 ? months[activeIndex - 1] : "";
    const next = activeIndex >= 0 && activeIndex < months.length - 1 ? months[activeIndex + 1] : "";
    return `<div class="personal-month-nav"><button type="button" class="personal-month-nav-button" data-month-target="${previous}" ${previous ? "" : "disabled"}>‹ Vorige maand</button><h3>${monthNames[model.monthIndex]} ${model.year}</h3><button type="button" class="personal-month-nav-button" data-month-target="${next}" ${next ? "" : "disabled"}>Volgende maand ›</button></div>`;
  }

  function buildMonthHtml(data) {
    const entries = entriesFromData(data);
    const model = monthModel(data, entries);
    const today = amsterdamDateKey();
    const summary = employeeSummary(data);
    const cells = [];

    for (let index = 0; index < model.totalCells; index += 1) {
      const day = index - model.mondayOffset + 1;
      if (day < 1 || day > model.daysInMonth) {
        cells.push('<div class="personal-month-day outside-month" aria-hidden="true"></div>');
        continue;
      }

      const date = `${model.year}-${String(model.monthIndex + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
      const schedules = model.byDate.get(date) || [];
      const state = date < today ? "past" : date === today ? "today" : "future";
      const workClass = schedules.length ? " has-work" : " no-work";
      cells.push(`<article class="personal-month-day ${state}${workClass}" data-date="${date}"><header class="personal-month-day-head"><span class="personal-month-day-number">${day}</span>${state === "today" ? '<span class="personal-month-today-badge">Vandaag</span>' : ""}</header><div class="personal-month-day-body">${schedules.length ? schedules.map(scheduleHtml).join("") : '<div class="personal-month-free">Geen dienst</div>'}</div></article>`);
    }

    return `<section class="personal-month-view" data-personal-month="${model.monthKey}"><div class="personal-month-summary"><div><span>Vandaag</span><strong>${escapeHtml(summary.todayText)}</strong></div><div><span>Volgende dienst</span><strong>${escapeHtml(summary.nextText)}</strong></div></div><div class="personal-month-title">${navigationHtml(model)}<span class="personal-month-caption">Volledig maandrooster</span></div><div class="personal-month-stage"><div class="personal-month-calendar"><div class="personal-month-weekdays">${weekdays.map((day) => `<div>${day}</div>`).join("")}</div><div class="personal-month-grid">${cells.join("")}</div></div></div></section>`;
  }

  function equalizeDayHeights() {
    const view = rosterResult.querySelector(".personal-month-view");
    if (!view) return;
    const cells = [...view.querySelectorAll(".personal-month-day")];
    if (!cells.length) return;

    view.style.removeProperty("--personal-month-day-height");
    cells.forEach((cell) => { cell.style.height = "auto"; });

    requestAnimationFrame(() => {
      let tallest = 160;
      cells.forEach((cell) => {
        tallest = Math.max(tallest, Math.ceil(cell.scrollHeight));
      });
      view.style.setProperty("--personal-month-day-height", `${tallest}px`);
      cells.forEach((cell) => { cell.style.height = ""; });
    });
  }

  function renderMonthView(force = false) {
    clearTimeout(renderTimer);
    renderTimer = setTimeout(() => {
      const isEmployeeRoster = !rosterResult.hidden && Boolean(rosterResult.querySelector(".employee-head")) && !rosterResult.querySelector(".today-workers-head");
      if (!isEmployeeRoster) {
        searchCard.classList.remove("has-month-roster");
        return;
      }

      const data = bridge.getCalendarData();
      if (!data?.name || !Array.isArray(data.schedules)) return;
      const existing = rosterResult.querySelector(".personal-month-view");
      if (existing && !force && existing.dataset.personalMonth === (data.monthKey || "")) {
        searchCard.classList.add("has-month-roster");
        equalizeDayHeights();
        return;
      }
      existing?.remove();

      const scheduleList = rosterResult.querySelector(".schedule-list");
      if (!scheduleList) return;
      scheduleList.hidden = true;
      scheduleList.insertAdjacentHTML("afterend", buildMonthHtml(data));
      const oldToggle = rosterResult.querySelector('[data-action="toggle-full-roster"]');
      if (oldToggle) oldToggle.hidden = true;
      searchCard.classList.add("has-month-roster");
      equalizeDayHeights();
    }, 0);
  }

  rosterResult.addEventListener("click", (event) => {
    const button = event.target.closest("[data-month-target]");
    if (!button || button.disabled) return;
    const target = button.dataset.monthTarget;
    if (target) monthBridge?.switchMonth?.(target);
  });

  const observer = new MutationObserver(() => renderMonthView(false));
  observer.observe(rosterResult, { childList: true, subtree: false, attributes: true, attributeFilter: ["hidden"] });
  renderMonthView(false);

  window.addEventListener("rooster-months-updated", () => renderMonthView(true));
  window.addEventListener("rooster-month-changed", () => renderMonthView(true));
  window.addEventListener("resize", () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(equalizeDayHeights, 120);
  });
})();
