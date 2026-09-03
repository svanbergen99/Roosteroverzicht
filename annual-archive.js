(() => {
  "use strict";

  const bridge = window.RoosterMonthBridge;
  const agendaBridge = window.RoosterAgendaBridge;
  if (!bridge || !agendaBridge) return;

  const nativeFetch = window.__roosterNativeFetch || window.fetch.bind(window);
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  const annualCache = new Map();
  const annualMonthCache = new Map();
  const annualLoading = new Map();

  const originalGetState = bridge.getState.bind(bridge);
  const originalGetRoster = bridge.getRoster.bind(bridge);
  const originalGetEmployeeData = bridge.getEmployeeData.bind(bridge);
  const originalGetEmployeeSchedules = bridge.getEmployeeSchedules.bind(bridge);
  const originalSwitchMonth = bridge.switchMonth.bind(bridge);
  const originalGetCalendarData = agendaBridge.getCalendarData.bind(agendaBridge);

  let sessionId = "";
  let sessionPassword = "";
  let activeAnnualMonth = "";

  function yearFromMonthKey(monthKey) {
    const match = String(monthKey || "").match(/^(\d{4})-(\d{2})$/);
    return match ? Number(match[1]) : 0;
  }

  function currentAmsterdamYear() {
    const value = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Europe/Amsterdam",
      year: "numeric"
    }).format(new Date());
    return Number(value) || new Date().getFullYear();
  }

  function activeRosterYear() {
    const state = originalGetState() || {};
    return yearFromMonthKey(state.activeMonthKey || state.coreMonthKey || state.currentMonthKey) || currentAmsterdamYear();
  }

  function annualFile(year) {
    return `Roosterindex_${year}.json`;
  }

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
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .sort((a, b) => a.localeCompare(b, "nl"))
      .join("|");
  }

  function getEmployee(index, name) {
    const signature = nameSignature(name);
    if (!signature || !index) return null;
    return (index.employees || []).find((employee) => nameSignature(employee.name) === signature) || null;
  }

  function mapSchedules(employee) {
    return Array.isArray(employee?.schedules) ? employee.schedules.map((schedule) => ({
      date: schedule.date,
      start: schedule.start,
      end: schedule.end,
      activities: Array.isArray(schedule.activities) ? schedule.activities.map((activity) => ({
        start: activity.start,
        end: activity.end,
        type: activity.type,
        name: activity.name,
        color: activity.color
      })) : []
    })) : [];
  }

  function monthKeysInIndex(index, year) {
    const months = new Set();
    for (const employee of index?.employees || []) {
      for (const schedule of employee?.schedules || []) {
        const monthKey = String(schedule?.date || "").slice(0, 7);
        if (monthKey.startsWith(`${year}-`)) months.add(monthKey);
      }
    }
    return [...months].sort();
  }

  function sliceAnnualMonth(index, monthKey) {
    if (!index || !monthKey) return null;
    if (annualMonthCache.has(monthKey)) return annualMonthCache.get(monthKey);

    const employees = [];
    const dates = [];
    for (const employee of index.employees || []) {
      const schedules = (employee.schedules || []).filter((schedule) => {
        const match = String(schedule?.date || "").slice(0, 7) === monthKey;
        if (match) dates.push(String(schedule.date));
        return match;
      });
      if (schedules.length) employees.push({ ...employee, schedules });
    }

    if (!employees.length) return null;
    dates.sort();
    const start = dates[0] || null;
    const end = dates.at(-1) || null;
    const monthIndex = Number(monthKey.slice(5, 7)) - 1;
    const monthNames = ["Januari","Februari","Maart","April","Mei","Juni","Juli","Augustus","September","Oktober","November","December"];
    const monthName = monthNames[monthIndex] || monthKey;

    const sliced = {
      ...index,
      period: {
        ...(index.period || {}),
        start,
        end,
        month: monthKey,
        label: start && end ? `${start} t/m ${end}` : `${monthName} ${monthKey.slice(0, 4)}`
      },
      display: {
        ...(index.display || {}),
        calendarName: `Rooster : ${monthName}`
      },
      employees,
      source: {
        ...(index.source || {}),
        annualArchive: true,
        annualArchiveFile: annualFile(Number(monthKey.slice(0, 4)))
      }
    };

    annualMonthCache.set(monthKey, sliced);
    return sliced;
  }

  async function decryptAnnual(year) {
    if (annualCache.has(year)) return annualCache.get(year);
    if (annualLoading.has(year)) return annualLoading.get(year);
    if (!sessionId || !sessionPassword || !window.crypto?.subtle) return null;

    const promise = (async () => {
      let response;
      try {
        response = await nativeFetch(`${annualFile(year)}?v=${Date.now()}`, { cache: "no-store" });
      } catch (_) {
        return null;
      }
      if (!response.ok) return null;

      let secured;
      try {
        secured = await response.json();
      } catch (_) {
        return null;
      }

      if (secured?.kind !== "roosterhulp-encrypted-index" || secured?.encrypted !== true || !secured.crypto || !secured.payload) return null;

      try {
        const secret = encoder.encode(`${sessionId}\u0000${sessionPassword}`);
        const keyMaterial = await crypto.subtle.importKey("raw", secret, "PBKDF2", false, ["deriveKey"]);
        const key = await crypto.subtle.deriveKey({
          name: "PBKDF2",
          hash: secured.crypto.hash || "SHA-256",
          salt: base64ToBytes(secured.crypto.salt),
          iterations: Number(secured.crypto.iterations) || 250000
        }, keyMaterial, {
          name: "AES-GCM",
          length: Number(secured.crypto.keyLength) || 256
        }, false, ["decrypt"]);

        const plaintext = await crypto.subtle.decrypt({
          name: "AES-GCM",
          iv: base64ToBytes(secured.crypto.iv)
        }, key, base64ToBytes(secured.payload));

        const parsed = JSON.parse(decoder.decode(plaintext));
        if (parsed?.kind !== "roosterhulp-index" || !Array.isArray(parsed.employees)) return null;

        annualCache.set(year, parsed);
        const months = monthKeysInIndex(parsed, year);
        for (const monthKey of months) sliceAnnualMonth(parsed, monthKey);

        window.dispatchEvent(new CustomEvent("rooster-months-updated", {
          detail: { annualArchive: true, year, months }
        }));
        return parsed;
      } catch (_) {
        return null;
      }
    })();

    annualLoading.set(year, promise);
    try {
      return await promise;
    } finally {
      annualLoading.delete(year);
    }
  }

  async function annualMonth(monthKey) {
    if (annualMonthCache.has(monthKey)) return annualMonthCache.get(monthKey);
    const year = yearFromMonthKey(monthKey);
    if (!year) return null;
    const index = annualCache.get(year) || await decryptAnnual(year);
    return index ? sliceAnnualMonth(index, monthKey) : null;
  }

  function selectedEmployeeName() {
    return document.querySelector("#rosterResult .employee-name")?.textContent?.trim()
      || document.getElementById("employeeName")?.value?.trim()
      || "";
  }

  function mergeAnnualSchedules(name, monthKey, primarySchedules) {
    const primary = (Array.isArray(primarySchedules) ? primarySchedules : [])
      .filter((schedule) => String(schedule?.date || "").slice(0, 7) === monthKey);
    const annual = annualMonthCache.get(monthKey);
    const employee = getEmployee(annual, name);
    if (!employee) return primary;

    const result = [...primary];
    const filledDates = new Set(primary.map((schedule) => String(schedule?.date || "").slice(0, 10)).filter(Boolean));
    const byDate = new Map();

    for (const schedule of mapSchedules(employee)) {
      const date = String(schedule?.date || "").slice(0, 10);
      if (!date.startsWith(`${monthKey}-`) || filledDates.has(date)) continue;
      if (!byDate.has(date)) byDate.set(date, []);
      byDate.get(date).push(schedule);
    }

    for (const [date, schedules] of byDate.entries()) {
      if (filledDates.has(date)) continue;
      result.push(...schedules);
      filledDates.add(date);
    }

    return result.sort((a, b) =>
      String(a.date || "").localeCompare(String(b.date || "")) ||
      String(a.start || "").localeCompare(String(b.start || ""))
    );
  }

  function removeMonthLoadError() {
    document.querySelector("#rosterResult .personal-month-load-error")?.remove();
  }

  bridge.getState = function annualAwareGetState() {
    const state = originalGetState() || {};
    const months = new Set(state.availableMonths || []);
    for (const monthKey of annualMonthCache.keys()) months.add(monthKey);
    return {
      ...state,
      activeMonthKey: activeAnnualMonth || state.activeMonthKey,
      availableMonths: [...months].sort()
    };
  };

  bridge.getRoster = function annualAwareGetRoster(monthKey) {
    return originalGetRoster(monthKey) || annualMonthCache.get(monthKey) || null;
  };

  bridge.getEmployeeData = function annualAwareGetEmployeeData(name, monthKey) {
    const original = originalGetEmployeeData(name, monthKey);
    if (original) return original;
    const target = monthKey || activeAnnualMonth || originalGetState()?.activeMonthKey || "";
    const index = annualMonthCache.get(target);
    const employee = getEmployee(index, name);
    return employee ? { monthKey: target, index, employee } : null;
  };

  bridge.getEmployeeSchedules = function annualAwareEmployeeSchedules(name) {
    const combined = [...(originalGetEmployeeSchedules(name) || [])];

    for (const [year, index] of annualCache.entries()) {
      const employee = getEmployee(index, name);
      if (!employee) continue;
      for (const schedule of employee.schedules || []) {
        const date = String(schedule?.date || "");
        if (!date.startsWith(`${year}-`)) continue;
        combined.push({
          monthKey: date.slice(0, 7),
          date: schedule.date,
          start: schedule.start,
          end: schedule.end
        });
      }
    }

    const seen = new Set();
    return combined
      .filter((schedule) => {
        const key = `${schedule.date || ""}|${schedule.start || ""}|${schedule.end || ""}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .sort((a, b) =>
        String(a.date || "").localeCompare(String(b.date || "")) ||
        String(a.start || "").localeCompare(String(b.start || ""))
      );
  };

  bridge.switchMonth = async function annualAwareSwitchMonth(monthKey) {
    const monthlyResult = await originalSwitchMonth(monthKey);
    if (monthlyResult) {
      activeAnnualMonth = "";
      return true;
    }

    const index = await annualMonth(monthKey);
    if (!index) return false;

    activeAnnualMonth = monthKey;
    removeMonthLoadError();
    window.dispatchEvent(new CustomEvent("rooster-month-changed", {
      detail: { monthKey, annualArchive: true }
    }));
    return true;
  };

  agendaBridge.getCalendarData = function annualAwareCalendarData() {
    const base = originalGetCalendarData() || {};
    const state = bridge.getState() || {};
    const monthKey = activeAnnualMonth || base.monthKey || state.activeMonthKey || "";
    if (!monthKey) return base;

    const name = selectedEmployeeName() || base.name || "";
    const annual = annualMonthCache.get(monthKey);

    if (activeAnnualMonth && annual) {
      const employee = getEmployee(annual, name);
      return {
        ...base,
        name: employee?.name || name,
        monthKey,
        periodLabel: annual?.period?.label || base.periodLabel || "",
        appointmentName: annual?.display?.appointmentName || base.appointmentName || "Werkrooster",
        schedules: employee ? mapSchedules(employee) : []
      };
    }

    return {
      ...base,
      monthKey,
      schedules: mergeAnnualSchedules(name, monthKey, base.schedules || [])
    };
  };

  document.addEventListener("submit", (event) => {
    if (event.target !== document.getElementById("unlockForm")) return;
    sessionId = document.getElementById("rosterId")?.value?.trim() || "";
    sessionPassword = document.getElementById("rosterPassword")?.value || "";
  }, true);

  window.addEventListener("rooster-unlocked", (event) => {
    const monthKey = event.detail?.monthKey || originalGetState()?.activeMonthKey || "";
    const year = yearFromMonthKey(monthKey) || activeRosterYear();
    decryptAnnual(year);
  });

  window.addEventListener("rooster-employee-selected", () => {
    activeAnnualMonth = "";
  });
})();
