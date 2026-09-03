(() => {
  "use strict";

  const TIME_ZONE = "Europe/Amsterdam";
  const monthBridge = window.RoosterMonthBridge;
  const rosterResult = document.getElementById("rosterResult");
  const searchCard = document.querySelector(".search-card");
  const todayButton = document.getElementById("whoWorksTodayButton");
  const action = todayButton?.closest(".today-workers-action");
  if (!monthBridge || !rosterResult || !searchCard || !todayButton || !action) return;

  let nowButton = document.getElementById("whoWorksNowButton");
  if (!nowButton) {
    nowButton = document.createElement("button");
    nowButton.id = "whoWorksNowButton";
    nowButton.className = "today-workers-button";
    nowButton.type = "button";
    nowButton.textContent = "Wie werkt nu";
    action.appendChild(nowButton);
  }

  function escapeHtml(value) {
    return String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");
  }

  function amsterdamParts(date = new Date()) {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23"
    }).formatToParts(date);
    const get = (type) => parts.find((part) => part.type === type)?.value || "";
    return { year: Number(get("year")), month: Number(get("month")), day: Number(get("day")), hour: Number(get("hour")), minute: Number(get("minute")) };
  }

  function todayKey() {
    const p = amsterdamParts();
    return `${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`;
  }

  function previousDateKey(dateKey) {
    const match = String(dateKey).match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!match) return "";
    const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]) - 1));
    return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
  }

  function formatTime(value) {
    const text = String(value || "").trim();
    const match = text.match(/(?:T|\s|^)(\d{1,2}):(\d{2})/);
    return match ? `${match[1].padStart(2, "0")}:${match[2]}` : "";
  }

  function minutesOf(value) {
    const time = formatTime(value);
    if (!time) return null;
    return Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5));
  }

  function formatDate(dateKey) {
    const date = new Date(`${dateKey}T12:00:00Z`);
    return new Intl.DateTimeFormat("nl-NL", { timeZone: TIME_ZONE, weekday: "long", day: "numeric", month: "long", year: "numeric" }).format(date);
  }

  async function getCurrentRoster() {
    const key = todayKey().slice(0, 7);
    for (let attempt = 0; attempt < 50; attempt += 1) {
      const roster = monthBridge.getRoster?.(key);
      if (roster) return roster;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    return null;
  }

  function isWorkSchedule(schedule) {
    return String(schedule?.status || "").trim().toLowerCase() === "work";
  }

  function timeWindowIsActive(date, start, end, today, yesterday, nowMinutes) {
    const startMinutes = minutesOf(start);
    const endMinutes = minutesOf(end);
    if (startMinutes === null || endMinutes === null) return false;
    const overnight = endMinutes <= startMinutes;
    return date === today
      ? (overnight ? nowMinutes >= startMinutes : nowMinutes >= startMinutes && nowMinutes < endMinutes)
      : (date === yesterday && overnight && nowMinutes < endMinutes);
  }

  function isTimeOffActivity(activity) {
    const type = String(activity?.type || "").trim().toLowerCase();
    const name = String(activity?.name || activity?.label || "").trim().toLowerCase();
    return type === "time_off" || type === "day_off" || /^(?:verlof|afwezig)\b/.test(name);
  }

  function hasActiveTimeOff(schedule, today, yesterday, nowMinutes) {
    const date = String(schedule?.date || "").slice(0, 10);
    return (schedule?.activities || []).some((activity) => {
      if (!isTimeOffActivity(activity)) return false;
      const start = formatTime(activity?.start);
      const end = formatTime(activity?.end);
      if (!start || !end) return date === today;
      return timeWindowIsActive(date, start, end, today, yesterday, nowMinutes);
    });
  }

  function collectToday(roster, today) {
    const workers = [];
    for (const employee of roster?.employees || []) {
      const schedules = (employee.schedules || [])
        .filter((schedule) => String(schedule?.date || "").slice(0, 10) === today && isWorkSchedule(schedule))
        .map((schedule) => ({ start: formatTime(schedule.start), end: formatTime(schedule.end) }))
        .filter((schedule) => schedule.start && schedule.end);
      if (!schedules.length) continue;
      schedules.sort((a, b) => a.start.localeCompare(b.start) || a.end.localeCompare(b.end));
      workers.push({ name: employee.name, schedules });
    }
    workers.sort((a, b) => a.schedules[0].start.localeCompare(b.schedules[0].start) || String(a.name).localeCompare(String(b.name), "nl-NL"));
    return workers;
  }

  function collectNow(roster, today) {
    const yesterday = previousDateKey(today);
    const p = amsterdamParts();
    const nowMinutes = p.hour * 60 + p.minute;
    const workers = [];
    for (const employee of roster?.employees || []) {
      const active = (employee.schedules || []).map((schedule) => {
        if (!isWorkSchedule(schedule)) return null;
        const date = String(schedule?.date || "").slice(0, 10);
        const start = formatTime(schedule.start);
        const end = formatTime(schedule.end);
        if (!start || !end) return null;
        if (!timeWindowIsActive(date, start, end, today, yesterday, nowMinutes)) return null;
        if (hasActiveTimeOff(schedule, today, yesterday, nowMinutes)) return null;
        return { start, end };
      }).filter(Boolean);
      if (!active.length) continue;
      workers.push({ name: employee.name, schedules: active });
    }
    workers.sort((a, b) => String(a.name).localeCompare(String(b.name), "nl-NL"));
    return workers;
  }

  function activeOverviewTitle() {
    if (rosterResult.hidden) return "";
    return rosterResult.querySelector(".today-workers-head h2")?.textContent?.trim() || "";
  }

  function closeOverview() {
    rosterResult.hidden = true;
    rosterResult.innerHTML = "";
    searchCard.classList.remove("has-roster", "has-month-roster");
  }

  function render(title, today, workers, emptyText) {
    const rows = workers.map((worker) => {
      const ranges = worker.schedules.map((schedule) => `${schedule.start} – ${schedule.end}`).join(", ");
      return `<div class="today-worker-row"><span class="today-worker-name">${escapeHtml(worker.name)}</span><span class="today-worker-time">${escapeHtml(ranges)}</span></div>`;
    }).join("");
    rosterResult.innerHTML = `<div class="today-workers-head"><div><h2>${escapeHtml(title)}</h2><p class="today-workers-date">${escapeHtml(formatDate(today))}</p></div><span class="today-workers-count">${workers.length} collega${workers.length === 1 ? "" : "'s"}</span></div><div class="today-workers-list">${rows || `<div class="no-activities">${escapeHtml(emptyText)}</div>`}</div>`;
    rosterResult.hidden = false;
    searchCard.classList.add("has-roster");
    searchCard.classList.remove("has-month-roster");
  }

  async function showToday() {
    const today = todayKey();
    const roster = await getCurrentRoster();
    if (!roster) return render("Wie werkt vandaag", today, [], "Roostergegevens konden nog niet worden geladen.");
    render("Wie werkt vandaag", today, collectToday(roster, today), "Er zijn vandaag geen collega's met een werkdienst gevonden.");
  }

  async function showNow() {
    const today = todayKey();
    const roster = await getCurrentRoster();
    if (!roster) return render("Wie werkt nu", today, [], "Roostergegevens konden nog niet worden geladen.");
    render("Wie werkt nu", today, collectNow(roster, today), "Er zijn op dit moment geen collega's met een actieve werkdienst gevonden.");
  }

  document.addEventListener("click", (event) => {
    const button = event.target.closest("#whoWorksTodayButton, #whoWorksNowButton");
    if (!button) return;
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();

    const title = button.id === "whoWorksNowButton" ? "Wie werkt nu" : "Wie werkt vandaag";
    if (activeOverviewTitle() === title) {
      closeOverview();
      return;
    }

    if (button.id === "whoWorksNowButton") showNow();
    else showToday();
  }, true);
})();
