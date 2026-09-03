(() => {
  "use strict";

  const bridge = window.RoosterAgendaBridge;
  const rosterResult = document.getElementById("rosterResult");
  if (!bridge || !rosterResult) return;

  const TIME_ZONE = "Europe/Amsterdam";
  let lastExport = null;
  let helpOverlay = null;

  function todayKey() {
    const parts = new Intl.DateTimeFormat("en-CA", { timeZone: TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
    const get = (type) => parts.find((part) => part.type === type)?.value || "";
    return `${get("year")}-${get("month")}-${get("day")}`;
  }

  function formatTime(value) {
    if (!value) return "";
    const text = String(value).trim();
    const embedded = text.match(/(?:T|\s|^)(\d{1,2}):(\d{2})/);
    return embedded ? `${embedded[1].padStart(2, "0")}:${embedded[2]}` : "";
  }

  function filePart(value) {
    return String(value || "Rooster").normalize("NFD").replace(/\p{M}/gu, "").replace(/[^\p{L}\p{N}]+/gu, "_").replace(/^_+|_+$/g, "").slice(0, 70) || "Rooster";
  }

  function addDay(dateKey) {
    const match = String(dateKey || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!match) return dateKey;
    const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
    date.setUTCDate(date.getUTCDate() + 1);
    return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
  }

  function eventTiming(schedule) {
    const rawStart = String(schedule?.start || "").trim(), rawEnd = String(schedule?.end || "").trim();
    const startDate = rawStart.match(/^(\d{4}-\d{2}-\d{2})[T ]/)?.[1] || String(schedule?.date || "").slice(0, 10);
    let endDate = rawEnd.match(/^(\d{4}-\d{2}-\d{2})[T ]/)?.[1] || String(schedule?.date || "").slice(0, 10);
    const startTime = formatTime(rawStart), endTime = formatTime(rawEnd);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(endDate) || !startTime || !endTime) return null;
    if (!rawEnd.match(/^\d{4}-\d{2}-\d{2}[T ]/) && endDate === startDate && endTime <= startTime) endDate = addDay(endDate);
    return { start: { date: startDate, time: startTime }, end: { date: endDate, time: endTime } };
  }

  function compact(parts) { return `${parts.date.replaceAll("-", "")}T${parts.time.replace(":", "")}00`; }
  function icsText(value) { return String(value ?? "").replaceAll("\\", "\\\\").replaceAll(";", "\\;").replaceAll(",", "\\,").replace(/\r?\n/g, "\\n"); }

  function exportSchedules(data) {
    const schedules = Array.isArray(data?.schedules) ? [...data.schedules] : [];
    schedules.sort((a, b) => String(a.date || "").localeCompare(String(b.date || "")) || String(a.start || "").localeCompare(String(b.start || "")));
    return data.showFullRoster ? schedules : schedules.filter((schedule) => String(schedule.date || "").slice(0, 10) >= todayKey());
  }

  function buildIcs(data) {
    const schedules = exportSchedules(data), events = schedules.map(eventTiming).filter(Boolean);
    const periodLabel = data.periodLabel || "", calendarName = periodLabel ? `Rooster ${periodLabel}` : "Werkrooster", eventName = data.appointmentName || "Werkrooster";
    const dtstamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z"), uidName = filePart(data.name || "medewerker").toLowerCase();
    const lines = ["BEGIN:VCALENDAR","VERSION:2.0","PRODID:-//Roosterhulp//Werkrooster//NL","CALSCALE:GREGORIAN","METHOD:PUBLISH",`X-WR-CALNAME:${icsText(calendarName)}`,"X-WR-TIMEZONE:Europe/Amsterdam","BEGIN:VTIMEZONE","TZID:Europe/Amsterdam","X-LIC-LOCATION:Europe/Amsterdam","BEGIN:DAYLIGHT","TZOFFSETFROM:+0100","TZOFFSETTO:+0200","TZNAME:CEST","DTSTART:19700329T020000","RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU","END:DAYLIGHT","BEGIN:STANDARD","TZOFFSETFROM:+0200","TZOFFSETTO:+0100","TZNAME:CET","DTSTART:19701025T030000","RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU","END:STANDARD","END:VTIMEZONE"];
    events.forEach((timing) => {
      const start = compact(timing.start), end = compact(timing.end);
      lines.push("BEGIN:VEVENT", `UID:${uidName}-${start.toLowerCase()}@roosterhulp`, `DTSTAMP:${dtstamp}`, `DTSTART;TZID=Europe/Amsterdam:${start}`, `DTEND;TZID=Europe/Amsterdam:${end}`, `SUMMARY:${icsText(eventName)}`, "STATUS:CONFIRMED", "TRANSP:OPAQUE", "END:VEVENT");
    });
    lines.push("END:VCALENDAR");
    const suffix = periodLabel ? `_${filePart(periodLabel)}` : "";
    return { content: `${lines.join("\r\n")}\r\n`, filename: `Werkrooster_${filePart(data.name)}${suffix}.ics`, count: events.length, skipped: schedules.length - events.length, scope: data.showFullRoster ? "volledige rooster" : "rooster vanaf vandaag" };
  }

  function download(exportData) {
    const blob = new Blob([exportData.content], { type: "text/calendar;charset=utf-8" });
    const url = URL.createObjectURL(blob), link = document.createElement("a");
    link.href = url; link.download = exportData.filename; document.body.appendChild(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 30000);
  }

  function ensureHelp() {
    if (helpOverlay) return helpOverlay;
    helpOverlay = document.createElement("div"); helpOverlay.className = "agenda-help-overlay"; helpOverlay.hidden = true; helpOverlay.setAttribute("role", "dialog"); helpOverlay.setAttribute("aria-modal", "true");
    helpOverlay.innerHTML = `<section class="agenda-help-card"><h2 data-title>Rooster in agenda plaatsen</h2><p class="agenda-help-summary" data-summary></p><div data-steps></div><div class="agenda-help-note" data-note></div><div class="agenda-help-actions"><button class="secondary" type="button" data-redownload>Agenda-bestand opnieuw opslaan</button><button type="button" data-close>Sluiten</button></div></section>`;
    document.body.appendChild(helpOverlay);
    helpOverlay.querySelector("[data-close]").addEventListener("click", () => { helpOverlay.hidden = true; document.body.classList.remove("agenda-help-open"); });
    helpOverlay.querySelector("[data-redownload]").addEventListener("click", () => { if (lastExport) download(lastExport); });
    helpOverlay.addEventListener("click", (event) => { if (event.target === helpOverlay) helpOverlay.querySelector("[data-close]").click(); });
    return helpOverlay;
  }

  function showHelp(exportData) {
    const overlay = ensureHelp();
    overlay.querySelector("[data-redownload]").hidden = !exportData.count;
    overlay.querySelector("[data-title]").textContent = exportData.count ? "Rooster in agenda plaatsen" : "Geen werkdagen om te exporteren";
    overlay.querySelector("[data-summary]").textContent = exportData.count ? `Het bestand ${exportData.filename} is opgeslagen. Het bevat ${exportData.count} werkdag${exportData.count === 1 ? "" : "en"} uit het ${exportData.scope}.` : `Er zijn geen werkdagen met een geldige begin- en eindtijd in het ${exportData.scope}.`;
    overlay.querySelector("[data-steps]").innerHTML = exportData.count ? `<ol><li>Open het gedownloade .ics-bestand.</li><li>Kies je agenda-app en bevestig het toevoegen.</li><li>Wordt je agenda-app niet aangeboden? Gebruik daar de functie ICS importeren of Agenda importeren.</li></ol>` : "";
    overlay.querySelector("[data-note]").textContent = `Tijden en dagselectie worden bepaald volgens Europe/Amsterdam. Alleen begin- en eindtijd van de dienst worden geëxporteerd.${exportData.skipped ? ` ${exportData.skipped} roosterregel(s) zijn overgeslagen.` : ""}`;
    overlay.hidden = false; document.body.classList.add("agenda-help-open");
  }

  async function exportCalendar() {
    const data = bridge.getCalendarData(); if (!data?.name) return;
    const exportData = buildIcs(data); lastExport = exportData; if (!exportData.count) return showHelp(exportData);
    if (typeof File === "function" && typeof navigator.share === "function" && typeof navigator.canShare === "function") {
      const file = new File([exportData.content], exportData.filename, { type: "text/calendar;charset=utf-8" }); let canShare = false;
      try { canShare = navigator.canShare({ files: [file] }); } catch (_) {}
      if (canShare) { try { await navigator.share({ files: [file], title: "Werkrooster" }); return; } catch (error) { if (error?.name === "AbortError") return; } }
    }
    download(exportData); showHelp(exportData);
  }

  function fixButtonAvailability() {
    const button = rosterResult.querySelector(".agenda-trigger"); if (!button) return;
    const data = bridge.getCalendarData(); button.disabled = !exportSchedules(data).some((schedule) => eventTiming(schedule));
  }

  document.addEventListener("click", (event) => {
    const button = event.target.closest(".agenda-trigger"); if (!button || button.disabled) return;
    event.preventDefault(); event.stopPropagation(); event.stopImmediatePropagation(); exportCalendar();
  }, true);
  const observer = new MutationObserver(() => setTimeout(fixButtonAvailability, 0));
  observer.observe(rosterResult, { childList: true, subtree: true }); fixButtonAvailability();
})();
