(() => {
  "use strict";

  const TIME_ZONE = "Europe/Amsterdam";
  const REFRESH_MS = 60000;
  const encoder = new TextEncoder();
  const app = document.getElementById("app");
  const searchCard = document.querySelector(".search-card");
  if (!app || !searchCard) return;

  let loginName = "";
  let refreshTimer = null;

  function nameSignature(value) {
    return String(value || "")
      .toLocaleLowerCase("nl-NL")
      .normalize("NFD")
      .replace(/\p{M}/gu, "")
      .replace(/[^\p{L}\p{N}]+/gu, " ")
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .sort((a, b) => a.localeCompare(b, "nl"))
      .join("|");
  }

  async function hashName(value) {
    const signature = nameSignature(value);
    if (!signature) return "";
    const digest = await crypto.subtle.digest("SHA-256", encoder.encode(signature));
    return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  }

  function firstNameFromInput(value) {
    const parts = String(value || "").trim().split(/\s+/).filter(Boolean);
    if (!parts.length) return "";
    const prefixes = new Set(["van", "de", "der", "den", "het", "'t", "ten", "ter", "von"]);
    const candidate = prefixes.has(parts[0].toLocaleLowerCase("nl-NL")) && parts.length > 1 ? parts.at(-1) : parts[0];
    return `${candidate.charAt(0).toLocaleUpperCase("nl-NL")}${candidate.slice(1)}`;
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
    return new Intl.DateTimeFormat("nl-NL", {
      timeZone: TIME_ZONE,
      weekday: "long",
      day: "numeric",
      month: "long"
    }).format(date);
  }

  function availableMonthKeys() {
    const state = window.RoosterMonthBridge?.getState?.() || {};
    return [...new Set([
      state.activeMonthKey,
      state.currentMonthKey,
      state.coreMonthKey,
      ...(state.availableMonths || [])
    ].filter((value) => /^\d{4}-\d{2}$/.test(String(value || ""))))].sort();
  }

  async function permissionForLogin() {
    const firstName = firstNameFromInput(loginName);
    if (!firstName) return null;
    const loginHash = await hashName(firstName);
    const permissions = Array.isArray(window.RoosterAccessPermissions) ? window.RoosterAccessPermissions : [];
    return permissions.find((permission) => permission?.loginHash === loginHash) || null;
  }

  async function findEmployee(permission) {
    if (!permission?.rosterHash || permission?.scope === "all") return null;
    const monthBridge = window.RoosterMonthBridge;
    if (!monthBridge) return null;

    for (const monthKey of availableMonthKeys()) {
      const roster = monthBridge.getRoster?.(monthKey);
      for (const employee of roster?.employees || []) {
        const name = String(employee?.name || "").trim();
        if (name && await hashName(name) === permission.rosterHash) return name;
      }
    }
    return null;
  }

  function nextScheduleForEmployee(employeeName) {
    const monthBridge = window.RoosterMonthBridge;
    if (!monthBridge || !employeeName) return null;
    const now = amsterdamNow();
    const candidates = [];

    for (const monthKey of availableMonthKeys()) {
      const roster = monthBridge.getRoster?.(monthKey);
      const employee = (roster?.employees || []).find((item) => String(item?.name || "").trim() === employeeName);
      if (!employee) continue;

      for (const schedule of employee.schedules || []) {
        if (String(schedule?.status || "").trim().toLowerCase() !== "work") continue;
        const date = String(schedule?.date || "").slice(0, 10);
        const start = formatTime(schedule?.start);
        const end = formatTime(schedule?.end);
        const startMinutes = minutesOf(start);
        if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !start || !end || startMinutes === null) continue;
        if (date < now.dateKey) continue;
        if (date === now.dateKey && startMinutes < now.minutes) continue;
        candidates.push({ date, start, end });
      }
    }

    candidates.sort((a, b) => a.date.localeCompare(b.date) || a.start.localeCompare(b.start) || a.end.localeCompare(b.end));
    return candidates[0] || null;
  }

  function ensureBar() {
    let bar = document.getElementById("nextShiftBar");
    if (bar) return bar;
    bar = document.createElement("div");
    bar.id = "nextShiftBar";
    bar.className = "next-salary-payment-bar next-shift-bar";
    const salaryBar = document.getElementById("nextSalaryPaymentBar");
    if (salaryBar) salaryBar.after(bar);
    else {
      const titleRow = searchCard.querySelector(".roster-title-row");
      const title = searchCard.querySelector(":scope > h1");
      (titleRow || title || searchCard.firstElementChild)?.before(bar);
    }
    return bar;
  }

  async function render(attempt = 0) {
    if (app.hidden) return;
    const permission = await permissionForLogin();
    const existing = document.getElementById("nextShiftBar");

    if (!permission || permission.scope === "all" || !permission.rosterHash) {
      if (existing) existing.hidden = true;
      return;
    }

    const employeeName = await findEmployee(permission);
    if (!employeeName) {
      if (attempt < 30) window.setTimeout(() => render(attempt + 1), 100);
      return;
    }

    const bar = ensureBar();
    const next = nextScheduleForEmployee(employeeName);
    bar.innerHTML = next
      ? `<span>Volgende dienst:</span><strong>${formatDate(next.date)} · ${next.start}–${next.end}</strong>`
      : `<span>Volgende dienst:</span><strong>Nog niet bekend</strong>`;
    bar.hidden = false;
  }

  document.addEventListener("submit", (event) => {
    const form = event.target;
    if (!(form instanceof HTMLFormElement) || form.id !== "permissionNameForm") return;
    loginName = form.querySelector("#permissionNameInput")?.value?.trim() || "";
  }, true);

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
