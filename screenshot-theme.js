(() => {
  "use strict";

  const bridge = window.RoosterAgendaBridge;
  if (!bridge) return;

  const TIME_ZONE = "Europe/Amsterdam";
  const weekdays = ["ma", "di", "wo", "do", "vr", "za", "zo"];
  const monthNames = ["januari", "februari", "maart", "april", "mei", "juni", "juli", "augustus", "september", "oktober", "november", "december"];
  let imageTheme = "light";

  const style = document.createElement("style");
  style.textContent = `
    .screenshot-image-theme { display:flex; align-items:center; gap:8px; flex-wrap:wrap; margin:0 0 14px; }
    .screenshot-image-theme-label { color:var(--muted); font-size:13px; font-weight:800; margin-right:2px; }
    .screenshot-image-theme button { min-height:36px; padding:8px 12px; font-size:13px; background:#fff; color:var(--accent-dark); border:1px solid #cfc4ce; }
    .screenshot-image-theme button[aria-pressed="true"] { background:var(--accent); color:#fff; border-color:var(--accent); }
    .screenshot-calendar-overlay[data-image-theme="dark"] .screenshot-calendar-sheet { border-color:#394454; background:#111821; color:#edf2f7; }
    .screenshot-calendar-overlay[data-image-theme="dark"] .screenshot-calendar-heading { border-color:#394454; background:#141b25; }
    .screenshot-calendar-overlay[data-image-theme="dark"] .screenshot-calendar-weekday { border-color:#394454; background:#171e29; color:#edf2f7; }
    .screenshot-calendar-overlay[data-image-theme="dark"] .screenshot-calendar-day { border-color:#394454; background:#111821; color:#edf2f7; }
    .screenshot-calendar-overlay[data-image-theme="dark"] .screenshot-calendar-day.empty { background:#0d131c; }
    .screenshot-calendar-overlay[data-image-theme="dark"] .screenshot-calendar-day.today { background:#2b202c; }
    .screenshot-calendar-overlay[data-image-theme="dark"] .screenshot-shift { background:#c76fbe; color:#fff; }
    html[data-theme="dark"] .screenshot-image-theme button { background:#171e29; color:#e9b0e2; border-color:#465263; }
    html[data-theme="dark"] .screenshot-image-theme button[aria-pressed="true"] { background:#c76fbe; color:#10151d; border-color:#c76fbe; }
    @media (max-width:760px) { .screenshot-image-theme { display:grid; grid-template-columns:1fr 1fr; } .screenshot-image-theme-label { grid-column:1/-1; } }
  `;
  document.head.appendChild(style);

  function amsterdamDateKey(date = new Date()) {
    const parts = new Intl.DateTimeFormat("en-CA", { timeZone: TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(date);
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

  function monthModel(data) {
    const monthKey = data?.monthKey || String(data?.schedules?.[0]?.date || "").slice(0, 7) || amsterdamDateKey().slice(0, 7);
    const [yearText, monthText] = monthKey.split("-");
    const year = Number(yearText);
    const monthIndex = Number(monthText) - 1;
    const daysInMonth = new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
    const firstJsDay = new Date(Date.UTC(year, monthIndex, 1, 12)).getUTCDay();
    const mondayOffset = (firstJsDay + 6) % 7;
    const totalCells = mondayOffset + daysInMonth <= 35 ? 35 : 42;
    const shifts = new Map();
    for (const schedule of data.schedules || []) {
      const date = String(schedule?.date || "").slice(0, 10);
      if (!date.startsWith(`${monthKey}-`)) continue;
      const start = formatTime(schedule?.start);
      const end = formatTime(schedule?.end);
      if (!start || !end) continue;
      if (!shifts.has(date)) shifts.set(date, []);
      shifts.get(date).push(`${start} – ${end}`);
    }
    return { monthKey, year, monthIndex, daysInMonth, mondayOffset, totalCells, rows: totalCells / 7, shifts };
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

  function drawCentered(ctx, text, x, y, width) { ctx.textAlign = "center"; ctx.fillText(text, x + width / 2, y); }

  function palette(theme) {
    return theme === "dark" ? {
      page: "#111821", header: "#141b25", weekday: "#171e29", empty: "#0d131c", today: "#2b202c",
      text: "#edf2f7", line: "#394454", pill: "#c76fbe", pillText: "#ffffff"
    } : {
      page: "#ffffff", header: "#ffffff", weekday: "#ffffff", empty: "#fbfcfd", today: "#fbf6fa",
      text: "#172033", line: "#d9e0e8", pill: "#7b2f73", pillText: "#ffffff"
    };
  }

  function setImageTheme(theme) {
    imageTheme = theme === "dark" ? "dark" : "light";
    const overlay = document.querySelector(".screenshot-calendar-overlay");
    if (!overlay) return;
    overlay.dataset.imageTheme = imageTheme;
    overlay.querySelectorAll("[data-screenshot-theme]").forEach((button) => button.setAttribute("aria-pressed", String(button.dataset.screenshotTheme === imageTheme)));
  }

  function correctTodayHighlight() {
    const overlay = document.querySelector(".screenshot-calendar-overlay");
    if (!overlay || overlay.hidden) return;
    const data = bridge.getCalendarData();
    const model = monthModel(data);
    const today = amsterdamDateKey();
    const days = [...overlay.querySelectorAll(".screenshot-calendar-day")];
    days.forEach((day) => day.classList.remove("today"));
    if (!today.startsWith(`${model.monthKey}-`)) return;
    const dayNumber = Number(today.slice(8, 10));
    const index = model.mondayOffset + dayNumber - 1;
    days[index]?.classList.add("today");
  }

  function ensureControls(resetToPageTheme = false) {
    const overlay = document.querySelector(".screenshot-calendar-overlay");
    const stage = overlay?.querySelector(".screenshot-calendar-stage");
    if (!overlay || !stage) return;
    let controls = overlay.querySelector(".screenshot-image-theme");
    if (!controls) {
      controls = document.createElement("div");
      controls.className = "screenshot-image-theme";
      controls.innerHTML = `<span class="screenshot-image-theme-label">Afbeelding opslaan als:</span><button type="button" data-screenshot-theme="light">Lichte afbeelding</button><button type="button" data-screenshot-theme="dark">Donkere afbeelding</button>`;
      stage.before(controls);
      controls.addEventListener("click", (event) => {
        const button = event.target.closest("[data-screenshot-theme]");
        if (button) setImageTheme(button.dataset.screenshotTheme);
      });
    }
    if (resetToPageTheme) setImageTheme(document.documentElement.dataset.theme === "dark" ? "dark" : "light");
    else setImageTheme(imageTheme);
    correctTodayHighlight();
  }

  function saveImage(theme) {
    const data = bridge.getCalendarData();
    if (!data?.name) return;
    const model = monthModel(data);
    const colors = palette(theme);
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

    ctx.fillStyle = colors.page; ctx.fillRect(0, 0, width, height);
    ctx.fillStyle = colors.header; ctx.fillRect(0, 0, width, headerHeight);
    ctx.fillStyle = colors.text; ctx.font = "700 38px Arial";
    drawCentered(ctx, `${monthNames[model.monthIndex]} ${model.year}`, 0, 67, width);
    ctx.strokeStyle = colors.line; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(0, headerHeight); ctx.lineTo(width, headerHeight); ctx.stroke();
    ctx.fillStyle = colors.weekday; ctx.fillRect(0, headerHeight, width, weekdaysHeight);
    ctx.font = "700 24px Arial"; ctx.fillStyle = colors.text;
    weekdays.forEach((day, index) => drawCentered(ctx, day, index * cellWidth, headerHeight + 44, cellWidth));

    const gridTop = headerHeight + weekdaysHeight;
    const today = amsterdamDateKey();
    for (let index = 0; index < model.totalCells; index += 1) {
      const col = index % 7, row = Math.floor(index / 7), x = col * cellWidth, y = gridTop + row * rowHeight;
      const day = index - model.mondayOffset + 1;
      const valid = day >= 1 && day <= model.daysInMonth;
      let fill = colors.page, date = "";
      if (!valid) fill = colors.empty;
      else {
        date = `${model.year}-${String(model.monthIndex + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
        if (date === today) fill = colors.today;
      }
      ctx.fillStyle = fill; ctx.fillRect(x, y, cellWidth, rowHeight);
      if (valid) {
        ctx.fillStyle = colors.text; ctx.font = "700 23px Arial"; ctx.textAlign = "left"; ctx.fillText(String(day), x + 12, y + 30);
        const shifts = model.shifts.get(date) || [];
        shifts.slice(0, 3).forEach((shift, shiftIndex) => {
          const pillX = x + 9, pillY = y + 43 + shiftIndex * 34, pillW = cellWidth - 18, pillH = 27;
          ctx.fillStyle = colors.pill; roundedRect(ctx, pillX, pillY, pillW, pillH, 7); ctx.fill();
          ctx.fillStyle = colors.pillText; ctx.font = "700 18px Arial"; drawCentered(ctx, shift, pillX, pillY + 20, pillW);
        });
      }
      ctx.strokeStyle = colors.line; ctx.lineWidth = 1; ctx.strokeRect(x, y, cellWidth, rowHeight);
    }

    const link = document.createElement("a");
    link.href = canvas.toDataURL("image/png");
    link.download = `Werkrooster_${model.monthKey}_${theme === "dark" ? "donker" : "licht"}.png`;
    document.body.appendChild(link); link.click(); link.remove();
  }

  const observer = new MutationObserver(() => ensureControls(false));
  observer.observe(document.body, { childList: true, subtree: true });
  document.addEventListener("click", (event) => { if (event.target.closest(".screenshot-roster-button")) setTimeout(() => ensureControls(true), 0); });
  document.addEventListener("click", (event) => {
    const saveButton = event.target.closest("[data-save-image]");
    const overlay = saveButton?.closest(".screenshot-calendar-overlay");
    if (!saveButton || !overlay || overlay.hidden) return;
    event.preventDefault(); event.stopImmediatePropagation(); saveImage(imageTheme);
  }, true);
})();
