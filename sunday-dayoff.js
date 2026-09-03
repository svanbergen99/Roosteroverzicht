(() => {
  "use strict";

  const TIME_ZONE = "Europe/Amsterdam";
  const DAY_OFF_COLOR = "#8ce48b";
  const monthBridge = window.RoosterMonthBridge;
  const agendaBridge = window.RoosterAgendaBridge;
  const rosterResult = document.getElementById("rosterResult");
  if (!monthBridge || !agendaBridge) return;

  const originalGetRoster = monthBridge.getRoster?.bind(monthBridge);
  const originalGetEmployeeSchedules = monthBridge.getEmployeeSchedules?.bind(monthBridge);
  const originalGetCalendarData = agendaBridge.getCalendarData?.bind(agendaBridge);
  if (!originalGetRoster || !originalGetCalendarData) return;

  const rosterCache = new WeakMap();

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

  function isSunday(dateKey) {
    const match = String(dateKey || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!match) return false;
    return new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 12)).getUTCDay() === 0;
  }

  function sundayDates(monthKey) {
    const match = String(monthKey || "").match(/^(\d{4})-(\d{2})$/);
    if (!match) return [];
    const year = Number(match[1]);
    const month = Number(match[2]);
    const days = new Date(Date.UTC(year, month, 0)).getUTCDate();
    const result = [];
    for (let day = 1; day <= days; day += 1) {
      const date = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
      if (isSunday(date)) result.push(date);
    }
    return result;
  }

  function dayOffSchedule(date) {
    return {
      date,
      status: "off",
      allDay: true,
      start: null,
      end: null,
      shiftName: "Day Off",
      activities: [{
        start: null,
        end: null,
        type: "day_off",
        name: "Day Off",
        color: DAY_OFF_COLOR,
        source: "site-sunday-rule"
      }]
    };
  }

  function schedulesWithSundayDayOff(schedules, monthKey) {
    const kept = (Array.isArray(schedules) ? schedules : []).filter((schedule) => {
      const date = String(schedule?.date || "").slice(0, 10);
      return !(date.startsWith(`${monthKey}-`) && isSunday(date));
    });
    kept.push(...sundayDates(monthKey).map(dayOffSchedule));
    return kept.sort((a, b) => String(a?.date || "").localeCompare(String(b?.date || "")) || String(a?.start || "").localeCompare(String(b?.start || "")));
  }

  function normalizedRoster(roster, monthKey) {
    if (!roster || !monthKey) return roster;
    let byMonth = rosterCache.get(roster);
    if (!byMonth) {
      byMonth = new Map();
      rosterCache.set(roster, byMonth);
    }
    if (byMonth.has(monthKey)) return byMonth.get(monthKey);

    const normalized = {
      ...roster,
      employees: (roster.employees || []).map((employee) => ({
        ...employee,
        schedules: schedulesWithSundayDayOff(employee?.schedules, monthKey)
      }))
    };
    byMonth.set(monthKey, normalized);
    return normalized;
  }

  monthBridge.getRoster = function sundaySafeRoster(monthKey) {
    const roster = originalGetRoster(monthKey);
    const targetMonth = String(monthKey || "").match(/^\d{4}-\d{2}$/)?.[0] || amsterdamDateKey().slice(0, 7);
    return normalizedRoster(roster, targetMonth);
  };

  if (originalGetEmployeeSchedules) {
    monthBridge.getEmployeeSchedules = function sundaySafeEmployeeSchedules(name) {
      return (originalGetEmployeeSchedules(name) || []).filter((schedule) => !isSunday(String(schedule?.date || "").slice(0, 10)));
    };
  }

  agendaBridge.getCalendarData = function sundaySafeCalendarData() {
    const data = originalGetCalendarData() || {};
    const state = monthBridge.getState?.() || {};
    const monthKey = data.monthKey || state.activeMonthKey || amsterdamDateKey().slice(0, 7);
    return {
      ...data,
      monthKey,
      schedules: schedulesWithSundayDayOff(data.schedules, monthKey)
    };
  };

  function applySundayTodaySummary() {
    if (!rosterResult || !isSunday(amsterdamDateKey())) return;
    const value = rosterResult.querySelector(".personal-month-summary > div:first-child strong");
    if (value && value.textContent !== "Day Off") value.textContent = "Day Off";
  }

  if (rosterResult) {
    const observer = new MutationObserver(applySundayTodaySummary);
    observer.observe(rosterResult, { childList: true, subtree: true });
    applySundayTodaySummary();
  }
})();
