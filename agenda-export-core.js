(() => {
"use strict";
const bridge = window.RoosterAgendaBridge;
const rosterResult = document.getElementById("rosterResult");
if (!bridge || !rosterResult) return;
let lastCalendarExport = null;
let helpOverlay = null;

function todayKey() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}
function formatTime(value) {
  if (!value) return "";
  const text = String(value);
  const simple = text.match(/(?:T|^)(\d{2}):(\d{2})/);
  if (simple) return `${simple[1]}:${simple[2]}`;
  const plain = text.match(/^(\d{1,2}):(\d{2})$/);
  if (plain) return `${plain[1].padStart(2, "0")}:${plain[2]}`;
  return "";
}
function filePart(value) {
  return String(value || "Rooster")
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/[^\p{L}\p{N}]+/gu, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 70) || "Rooster";
}
function addDay(dateKey) {
  const match = String(dateKey || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return dateKey;
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  date.setUTCDate(date.getUTCDate() + 1);
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
}
function dateTimeParts(schedule, field) {
  const raw = String(schedule?.[field] || "").trim();
  const embeddedDate = raw.match(/^(\d{4}-\d{2}-\d{2})[T ]/i)?.[1] || "";
  const date = embeddedDate || String(schedule?.date || "").slice(0, 10);
  const time = formatTime(raw);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(time)) return null;
  return { date, time, embedded: Boolean(embeddedDate) };
}
function eventTiming(schedule) {
  const start = dateTimeParts(schedule, "start");
  const end = dateTimeParts(schedule, "end");
  if (!start || !end) return null;
  if (!end.embedded && end.date === start.date && end.time <= start.time) end.date = addDay(end.date);
  return { start, end };
}
function compact(parts) {
  return `${parts.date.replaceAll("-", "")}T${parts.time.replace(":", "")}00`;
}
function icsText(value) {
  return String(value ?? "")
    .replaceAll("\\", "\\\\")
    .replaceAll(";", "\\;")
    .replaceAll(",", "\\,")
    .replace(/\r?\n/g, "\\n");
}
function exportSchedules(data) {
  const schedules = Array.isArray(data?.schedules) ? [...data.schedules] : [];
  schedules.sort((a, b) => String(a.date || "").localeCompare(String(b.date || "")) || String(a.start || "").localeCompare(String(b.start || "")));
  return data.showFullRoster ? schedules : schedules.filter((schedule) => String(schedule.date || "").slice(0, 10) >= todayKey());
}
function buildIcs(data) {
  const schedules = exportSchedules(data);
  const events = schedules.map((schedule) => eventTiming(schedule)).filter(Boolean);
  const periodLabel = data.periodLabel || "";
  const calendarName = periodLabel ? `Rooster ${periodLabel}` : "Werkrooster";
  const eventName = data.appointmentName || "Werkrooster";
  const dtstamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
  const uidName = filePart(data.name || "medewerker").toLowerCase();
  const lines = [
    "BEGIN:VCALENDAR","VERSION:2.0","PRODID:-//Roosterhulp//Werkrooster//NL","CALSCALE:GREGORIAN","METHOD:PUBLISH",
    `X-WR-CALNAME:${icsText(calendarName)}`,"X-WR-TIMEZONE:Europe/Amsterdam",
    "BEGIN:VTIMEZONE","TZID:Europe/Amsterdam","X-LIC-LOCATION:Europe/Amsterdam",
    "BEGIN:DAYLIGHT","TZOFFSETFROM:+0100","TZOFFSETTO:+0200","TZNAME:CEST","DTSTART:19700329T020000","RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU","END:DAYLIGHT",
    "BEGIN:STANDARD","TZOFFSETFROM:+0200","TZOFFSETTO:+0100","TZNAME:CET","DTSTART:19701025T030000","RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU","END:STANDARD","END:VTIMEZONE"
  ];
  events.forEach((timing) => {
    const start = compact(timing.start);
    const end = compact(timing.end);
    lines.push(
      "BEGIN:VEVENT",
      `UID:${uidName}-${start.toLowerCase()}@roosterhulp`,
      `DTSTAMP:${dtstamp}`,
      `DTSTART;TZID=Europe/Amsterdam:${start}`,
      `DTEND;TZID=Europe/Amsterdam:${end}`,
      `SUMMARY:${icsText(eventName)}`,
      "STATUS:CONFIRMED",
      "TRANSP:OPAQUE",
      "END:VEVENT"
    );
  });
  lines.push("END:VCALENDAR");
  const suffix = periodLabel ? `_${filePart(periodLabel)}` : "";
  return {
    content: `${lines.join("\r\n")}\r\n`,
    filename: `Werkrooster_${filePart(data.name)}${suffix}.ics`,
    count: events.length,
    skipped: schedules.length - events.length,
    scope: data.showFullRoster ? "volledige rooster" : "rooster vanaf vandaag"
  };
}
function download(exportData) {
  const blob = new Blob([exportData.content], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = exportData.filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}
function ensureHelpOverlay() {
  if (helpOverlay) return helpOverlay;
  helpOverlay = document.createElement("div");
  helpOverlay.className = "agenda-help-overlay";
  helpOverlay.hidden = true;
  helpOverlay.setAttribute("role", "dialog");
  helpOverlay.setAttribute("aria-modal", "true");
  helpOverlay.innerHTML = `<section class="agenda-help-card"><h2 data-help-title>Rooster in agenda plaatsen</h2><p class="agenda-help-summary" data-help-summary></p><div data-help-steps></div><div class="agenda-help-note" data-help-note></div><div class="agenda-help-actions"><button class="secondary" type="button" data-help-download>Agenda-bestand opnieuw opslaan</button><button type="button" data-help-close>Sluiten</button></div></section>`;
  document.body.appendChild(helpOverlay);
  helpOverlay.querySelector("[data-help-close]").addEventListener("click", closeHelp);
  helpOverlay.querySelector("[data-help-download]").addEventListener("click", () => { if (lastCalendarExport?.content) download(lastCalendarExport); });
  helpOverlay.addEventListener("click", (event) => { if (event.target === helpOverlay) closeHelp(); });
  return helpOverlay;
}
function closeHelp() {
  if (!helpOverlay) return;
  helpOverlay.hidden = true;
  document.body.classList.remove("agenda-help-open");
}
function showDownloadHelp(exportData) {
  const overlay = ensureHelpOverlay();
  overlay.querySelector("[data-help-download]").hidden = false;
  overlay.querySelector("[data-help-title]").textContent = "Rooster in agenda plaatsen";
  overlay.querySelector("[data-help-summary]").textContent = `Het bestand ${exportData.filename} is opgeslagen. Het bevat ${exportData.count} werkdag${exportData.count === 1 ? "" : "en"} uit het ${exportData.scope}.`;
  overlay.querySelector("[data-help-steps]").innerHTML = `<ol><li>Open het gedownloade .ics-bestand.</li><li>Kies de agenda-app waarmee je het bestand wilt openen en bevestig het toevoegen van de afspraken.</li><li>Wordt je agenda-app niet aangeboden? Gebruik in die agenda de functie Importeren, ICS importeren of Agenda importeren en selecteer het bestand.</li></ol>`;
  overlay.querySelector("[data-help-note]").textContent = `Alleen de begintijd en eindtijd van iedere werkdag worden geëxporteerd. Pauzes, trainingen en andere activiteiten binnen de dienst worden niet meegenomen.${exportData.skipped ? ` ${exportData.skipped} roosterregel(s) zonder geldige begin- of eindtijd zijn overgeslagen.` : ""}`;
  overlay.hidden = false;
  document.body.classList.add("agenda-help-open");
  requestAnimationFrame(() => overlay.querySelector("[data-help-close]").focus());
}
function showEmpty(exportData) {
  const overlay = ensureHelpOverlay();
  overlay.querySelector("[data-help-download]").hidden = true;
  overlay.querySelector("[data-help-title]").textContent = "Geen werkdagen om te exporteren";
  overlay.querySelector("[data-help-summary]").textContent = `Er zijn geen werkdagen met een geldige begin- en eindtijd in het ${exportData.scope}.`;
  overlay.querySelector("[data-help-steps]").innerHTML = "";
  overlay.querySelector("[data-help-note]").textContent = exportData.scope === "volledige rooster" ? "Controleer het rooster." : "Gebruik eventueel eerst Toon volledig rooster als je ook eerdere werkdagen wilt meenemen.";
  overlay.hidden = false;
  document.body.classList.add("agenda-help-open");
}
async function exportCalendar() {
  const data = bridge.getCalendarData();
  if (!data?.name) return;
  const exportData = buildIcs(data);
  lastCalendarExport = exportData;
  if (!exportData.count) return showEmpty(exportData);

  if (typeof File === "function" && typeof navigator.share === "function" && typeof navigator.canShare === "function") {
    const file = new File([exportData.content], exportData.filename, { type: "text/calendar;charset=utf-8" });
    let canShare = false;
    try { canShare = navigator.canShare({ files: [file] }); } catch (_) {}
    if (canShare) {
      try {
        await navigator.share({ files: [file], title: "Werkrooster" });
        return;
      } catch (error) {
        if (error?.name === "AbortError") return;
      }
    }
  }

  download(exportData);
  showDownloadHelp(exportData);
}
function createControls() {
  const data = bridge.getCalendarData();
  if (!data?.name || rosterResult.hidden || rosterResult.querySelector(".agenda-export")) return;
  let tools = rosterResult.querySelector(".roster-tools");
  if (!tools) {
    tools = document.createElement("div");
    tools.className = "roster-tools";
    const scheduleList = rosterResult.querySelector(".schedule-list");
    if (!scheduleList) return;
    scheduleList.before(tools);
  }
  const available = exportSchedules(data).some((schedule) => eventTiming(schedule));
  const wrap = document.createElement("div");
  wrap.className = "agenda-export";
  wrap.innerHTML = `<button class="agenda-trigger" type="button" ${available ? "" : "disabled"}>In Agenda plaatsen</button>`;
  tools.prepend(wrap);
  wrap.querySelector(".agenda-trigger").addEventListener("click", exportCalendar);
}
const observer = new MutationObserver(createControls);
observer.observe(rosterResult, { childList: true, subtree: false });
createControls();
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && helpOverlay && !helpOverlay.hidden) closeHelp();
});
})();

(() => {
  if (!document.querySelector('link[href="screenshot-export.css"]')) {
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = "screenshot-export.css";
    document.head.appendChild(link);
  }
  if (!document.querySelector('script[src="screenshot-export.js"]')) {
    const script = document.createElement("script");
    script.src = "screenshot-export.js";
    script.defer = true;
    document.body.appendChild(script);
  }
})();