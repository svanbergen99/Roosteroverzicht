(() => {
"use strict";
const bridge = window.RoosterAgendaBridge;
const rosterResult = document.getElementById("rosterResult");
if (!bridge || !rosterResult) return;

let overlay = null;
const weekdays = ["ma", "di", "wo", "do", "vr", "za", "zo"];
const monthNames = ["januari", "februari", "maart", "april", "mei", "juni", "juli", "augustus", "september", "oktober", "november", "december"];

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
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
function localDateKey(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
function monthKeyFromSchedule(schedule) {
  const key = String(schedule?.date || "").slice(0, 7);
  return /^\d{4}-\d{2}$/.test(key) ? key : "";
}
function dominantMonth(data) {
  const counts = new Map();
  for (const schedule of data.schedules || []) {
    const key = monthKeyFromSchedule(schedule);
    if (key) counts.set(key, (counts.get(key) || 0) + 1);
  }
  const winner = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0];
  if (winner) return winner;
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}
function shiftText(schedule) {
  const start = formatTime(schedule?.start);
  const end = formatTime(schedule?.end);
  return start && end ? `${start} – ${end}` : "";
}
function schedulesByDate(data, monthKey) {
  const result = new Map();
  for (const schedule of data.schedules || []) {
    const date = String(schedule?.date || "").slice(0, 10);
    if (!date.startsWith(`${monthKey}-`)) continue;
    const text = shiftText(schedule);
    if (!text) continue;
    if (!result.has(date)) result.set(date, []);
    result.get(date).push(text);
  }
  return result;
}
function monthModel(data) {
  const monthKey = dominantMonth(data);
  const [yearText, monthText] = monthKey.split("-");
  const year = Number(yearText);
  const monthIndex = Number(monthText) - 1;
  const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();
  const firstJsDay = new Date(year, monthIndex, 1, 12).getDay();
  const mondayOffset = (firstJsDay + 6) % 7;
  const totalCells = mondayOffset + daysInMonth <= 35 ? 35 : 42;
  return {
    monthKey,
    year,
    monthIndex,
    daysInMonth,
    mondayOffset,
    totalCells,
    rows: totalCells / 7,
    shifts: schedulesByDate(data, monthKey)
  };
}
function buildCalendarHtml(data) {
  const model = monthModel(data);
  const today = localDateKey();
  const cells = [];
  for (let index = 0; index < model.totalCells; index += 1) {
    const day = index - model.mondayOffset + 1;
    const lastRow = index >= model.totalCells - 7 ? " last-row" : "";
    if (day < 1 || day > model.daysInMonth) {
      cells.push(`<div class="screenshot-calendar-day empty${lastRow}"></div>`);
      continue;
    }
    const date = `${model.year}-${String(model.monthIndex + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    const isToday = date === today;
    const shifts = model.shifts.get(date) || [];
    cells.push(`<div class="screenshot-calendar-day${isToday ? " today" : ""}${lastRow}"><span class="screenshot-day-number">${day}</span><div class="screenshot-shifts">${shifts.map((shift) => `<span class="screenshot-shift">${escapeHtml(shift)}</span>`).join("")}</div></div>`);
  }
  return {
    model,
    html: `<div class="screenshot-calendar-sheet" data-calendar-sheet><div class="screenshot-calendar-heading"><strong>${monthNames[model.monthIndex]} ${model.year}</strong></div><div class="screenshot-calendar-weekdays">${weekdays.map((day) => `<div class="screenshot-calendar-weekday">${day}</div>`).join("")}</div><div class="screenshot-calendar-grid">${cells.join("")}</div></div>`
  };
}
function ensureOverlay() {
  if (overlay) return overlay;
  overlay = document.createElement("div");
  overlay.className = "screenshot-calendar-overlay";
  overlay.hidden = true;
  overlay.setAttribute("role", "dialog");
  overlay.setAttribute("aria-modal", "true");
  overlay.innerHTML = `<section class="screenshot-calendar-card"><div class="screenshot-calendar-topbar"><div><h2>Screenshot van rooster</h2><p>Maak een screenshot van de maandweergave of sla hem direct als afbeelding op.</p></div><div class="screenshot-calendar-actions"><button type="button" class="secondary" data-save-image>Afbeelding opslaan</button><button type="button" data-close-screenshot>Sluiten</button></div></div><div class="screenshot-calendar-stage" data-calendar-stage></div><p class="screenshot-calendar-note">Alleen de begin- en eindtijd van de dienst worden getoond. Activiteiten zoals pauze, training, coaching en overleg worden niet meegenomen.</p></section>`;
  document.body.appendChild(overlay);
  overlay.querySelector("[data-close-screenshot]").addEventListener("click", closeOverlay);
  overlay.querySelector("[data-save-image]").addEventListener("click", saveImage);
  overlay.addEventListener("click", (event) => { if (event.target === overlay) closeOverlay(); });
  return overlay;
}
function closeOverlay() {
  if (!overlay) return;
  overlay.hidden = true;
  document.body.classList.remove("screenshot-calendar-open");
}
function showOverlay() {
  const data = bridge.getCalendarData();
  if (!data?.name || !Array.isArray(data.schedules) || !data.schedules.length) return;
  const popup = ensureOverlay();
  popup.querySelector("[data-calendar-stage]").innerHTML = buildCalendarHtml(data).html;
  popup.hidden = false;
  document.body.classList.add("screenshot-calendar-open");
  requestAnimationFrame(() => popup.querySelector("[data-close-screenshot]").focus());
}
function roundedRect(ctx, x, y, width, height, radius) {
  const r = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + width, y, x + width, y + height, r);
  ctx.arcTo(x + width, y + height, x, y + height, r);
  ctx.arcTo(x, y + height, x, y, r);
  ctx.arcTo(x, y, x + width, y, r);
  ctx.closePath();
}
function drawCentered(ctx, text, x, y, width) {
  ctx.textAlign = "center";
  ctx.fillText(text, x + width / 2, y);
}
function saveImage() {
  const data = bridge.getCalendarData();
  if (!data?.name) return;
  const model = monthModel(data);
  const width = 1400;
  const headerHeight = 112;
  const weekdaysHeight = 72;
  const rowHeight = model.rows === 5 ? 146 : 132;
  const height = headerHeight + weekdaysHeight + model.rows * rowHeight + 2;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  const cellWidth = width / 7;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = "#172033";
  ctx.font = "700 38px Arial";
  drawCentered(ctx, `${monthNames[model.monthIndex]} ${model.year}`, 0, 67, width);
  ctx.strokeStyle = "#d9e0e8";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, headerHeight);
  ctx.lineTo(width, headerHeight);
  ctx.stroke();
  ctx.font = "700 24px Arial";
  ctx.fillStyle = "#172033";
  weekdays.forEach((day, index) => drawCentered(ctx, day, index * cellWidth, headerHeight + 44, cellWidth));
  const gridTop = headerHeight + weekdaysHeight;
  const today = localDateKey();
  for (let index = 0; index < model.totalCells; index += 1) {
    const col = index % 7;
    const row = Math.floor(index / 7);
    const x = col * cellWidth;
    const y = gridTop + row * rowHeight;
    const day = index - model.mondayOffset + 1;
    const valid = day >= 1 && day <= model.daysInMonth;
    if (!valid) {
      ctx.fillStyle = "#fbfcfd";
      ctx.fillRect(x, y, cellWidth, rowHeight);
    } else {
      const date = `${model.year}-${String(model.monthIndex + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
      if (date === today) {
        ctx.fillStyle = "#fbf6fa";
        ctx.fillRect(x, y, cellWidth, rowHeight);
      }
      ctx.fillStyle = "#172033";
      ctx.font = "700 23px Arial";
      ctx.textAlign = "left";
      ctx.fillText(String(day), x + 12, y + 30);
      const shifts = model.shifts.get(date) || [];
      shifts.slice(0, 3).forEach((shift, shiftIndex) => {
        const pillX = x + 9;
        const pillY = y + 43 + shiftIndex * 34;
        const pillW = cellWidth - 18;
        const pillH = 27;
        ctx.fillStyle = "#7b2f73";
        roundedRect(ctx, pillX, pillY, pillW, pillH, 7);
        ctx.fill();
        ctx.fillStyle = "#ffffff";
        ctx.font = "700 18px Arial";
        drawCentered(ctx, shift, pillX, pillY + 20, pillW);
      });
    }
    ctx.strokeStyle = "#d9e0e8";
    ctx.lineWidth = 1;
    ctx.strokeRect(x, y, cellWidth, rowHeight);
  }
  const link = document.createElement("a");
  link.href = canvas.toDataURL("image/png");
  link.download = `Werkrooster_${model.monthKey}.png`;
  document.body.appendChild(link);
  link.click();
  link.remove();
}
function createButton() {
  const data = bridge.getCalendarData();
  if (!data?.name || rosterResult.hidden || rosterResult.querySelector(".screenshot-roster-button")) return;
  const hasValidShift = (data.schedules || []).some((schedule) => shiftText(schedule));
  if (!hasValidShift) return;
  let tools = rosterResult.querySelector(".roster-tools");
  if (!tools) {
    tools = document.createElement("div");
    tools.className = "roster-tools";
    const scheduleList = rosterResult.querySelector(".schedule-list");
    if (!scheduleList) return;
    scheduleList.before(tools);
  }
  const button = document.createElement("button");
  button.type = "button";
  button.className = "screenshot-roster-button";
  button.textContent = "Screenshot rooster";
  button.addEventListener("click", showOverlay);
  const agenda = tools.querySelector(".agenda-export");
  if (agenda) agenda.after(button); else tools.prepend(button);
}
const observer = new MutationObserver(createButton);
observer.observe(rosterResult, { childList: true, subtree: false });
createButton();
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && overlay && !overlay.hidden) closeOverlay();
});
})();