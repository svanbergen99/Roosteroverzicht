(() => {
  "use strict";

  let overlay = null;
  let freshData = null;

  const app = document.getElementById("app");
  const searchCard = document.querySelector(".search-card");
  const nameForm = document.getElementById("nameForm");
  const rosterResult = document.getElementById("rosterResult");
  const searchMessage = document.getElementById("searchMessage");
  const whoWorksTodayButton = document.getElementById("whoWorksTodayButton");
  if (!app || !searchCard || !rosterResult) return;

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function displayEmployeeName(value) {
    const parts = String(value || "").trim().split(/\s+/).filter(Boolean);
    if (parts.length < 2) return parts.join(" ");
    return `${parts.at(-1)} ${parts.slice(0, -1).join(" ")}`.trim();
  }

  function formatDate(value) {
    if (!value) return "Datum onbekend";
    const date = new Date(`${String(value).slice(0, 10)}T12:00:00`);
    if (Number.isNaN(date.getTime())) return String(value);
    return new Intl.DateTimeFormat("nl-NL", {
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric"
    }).format(date);
  }

  function formatTime(value) {
    if (!value) return "";
    const text = String(value);
    const simple = text.match(/(?:T|^)(\d{2}):(\d{2})/);
    if (simple) return `${simple[1]}:${simple[2]}`;
    const plain = text.match(/^(\d{1,2}):(\d{2})$/);
    if (plain) return `${plain[1].padStart(2, "0")}:${plain[2]}`;
    return text;
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

  function todayKey() {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Europe/Amsterdam",
      year: "numeric",
      month: "2-digit",
      day: "2-digit"
    }).formatToParts(new Date());
    const get = type => parts.find(part => part.type === type)?.value || "";
    return `${get("year")}-${get("month")}-${get("day")}`;
  }

  function formatStamp(value) {
    const date = value ? new Date(value) : new Date();
    return new Intl.DateTimeFormat("nl-NL", {
      timeZone: "Europe/Amsterdam",
      day: "numeric",
      month: "long",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit"
    }).format(date);
  }

  function ensureOverlay() {
    if (overlay?.isConnected) return overlay;
    overlay = document.createElement("div");
    overlay.id = "freshPersonalNameOverlay";
    overlay.className = "overlay";
    overlay.setAttribute("role", "dialog");
    overlay.setAttribute("aria-modal", "true");
    document.body.appendChild(overlay);
    return overlay;
  }

  function showLoading(message) {
    const target = ensureOverlay();
    target.innerHTML = `
      <div class="unlock-card permission-auth-card">
        <h1>Verse scan laden…</h1>
        <p>${escapeHtml(message)}</p>
      </div>`;
    target.hidden = false;
  }

  function showError(message) {
    const target = ensureOverlay();
    target.innerHTML = `
      <div class="unlock-card permission-auth-card">
        <h1>Verse scan kon niet worden geopend</h1>
        <p>${escapeHtml(message)}</p>
        <button id="freshPersonalClose" class="permission-auth-back" type="button">Sluiten</button>
      </div>`;
    target.hidden = false;
    target.querySelector("#freshPersonalClose")?.addEventListener("click", () => {
      target.remove();
      overlay = null;
    });
  }

  function showNameChoice(employee, storedAt) {
    const target = ensureOverlay();
    const displayName = displayEmployeeName(employee?.name);
    target.innerHTML = `
      <div class="unlock-card permission-auth-card">
        <h1>Wie ben je?</h1>
        <p>Verse WFM-scan bevestigd ✓<br>${escapeHtml(formatStamp(storedAt))}</p>
        <p>Deze browser is aan één persoon gekoppeld. Andere namen zijn niet beschikbaar.</p>
        <button id="freshPersonalChoose" class="full-button" type="button">${escapeHtml(displayName)}</button>
      </div>`;
    target.hidden = false;
    target.querySelector("#freshPersonalChoose")?.addEventListener("click", () => {
      target.remove();
      overlay = null;
      renderFreshRoster();
    });
  }

  function renderFreshRoster() {
    const employee = freshData?.employee;
    const index = freshData?.index;
    if (!employee || !index) return;

    document.body.classList.remove("public-portal-mode", "locked");
    document.body.classList.add("roster-access-active", "roster-person-selected");
    app.hidden = false;
    if (nameForm) nameForm.hidden = true;
    if (searchMessage) searchMessage.textContent = "";
    if (whoWorksTodayButton) whoWorksTodayButton.hidden = true;
    document.getElementById("allColleaguesButton")?.remove();

    const title = searchCard.querySelector(":scope > h1, .roster-title-row h1");
    if (title) title.textContent = "Mijn rooster";
    const intro = searchCard.querySelector(".search-intro");
    if (intro) intro.textContent = `Verse WFM-scan: ${formatStamp(freshData.storedAt)}`;

    const schedules = Array.isArray(employee.schedules) ? [...employee.schedules] : [];
    schedules.sort((a, b) => String(a.date || "").localeCompare(String(b.date || "")) || String(a.start || "").localeCompare(String(b.start || "")));
    const today = todayKey();
    const upcoming = schedules.filter(schedule => String(schedule?.date || "").slice(0, 10) >= today);
    const periodLabel = index?.period?.label && index.period.label !== "unknown" ? index.period.label : "";

    const scheduleHtml = upcoming.map(schedule => {
      const dateKey = String(schedule?.date || "").slice(0, 10);
      const activities = Array.isArray(schedule?.activities) ? schedule.activities : [];
      const activityHtml = activities.length
        ? activities.map(activity => `
            <div class="activity" style="--activity-color:${safeColor(activity?.color)}">
              <span class="activity-name">${escapeHtml(activity?.name || activity?.type || "Activiteit")}</span>
              <span class="activity-time">${escapeHtml(timeRange(activity?.start, activity?.end))}</span>
            </div>`).join("")
        : '<div class="no-activities">Geen roosteronderdelen beschikbaar.</div>';
      return `
        <article class="schedule-card${dateKey === today ? " today" : ""}">
          <header class="schedule-head">
            <div class="schedule-date-wrap">
              <span class="schedule-date">${escapeHtml(formatDate(schedule?.date))}</span>
              ${dateKey === today ? '<span class="today-badge">Vandaag</span>' : ""}
            </div>
            <span class="schedule-time">${escapeHtml(timeRange(schedule?.start, schedule?.end))}</span>
          </header>
          <div class="activities">${activityHtml}</div>
        </article>`;
    }).join("");

    rosterResult.innerHTML = `
      <div class="employee-head">
        <h2 class="employee-name">${escapeHtml(displayEmployeeName(employee.name))}</h2>
        ${employee.team ? `<span class="employee-team">${escapeHtml(employee.team)}</span>` : ""}
      </div>
      <p class="period">${periodLabel ? `Periode: ${escapeHtml(periodLabel)}` : "6 weken uit My Schedule"}</p>
      <p class="today-workers-date">Verse scan bevestigd: ${escapeHtml(formatStamp(freshData.storedAt))}</p>
      <div class="schedule-list">${scheduleHtml || '<div class="no-activities">Geen roosterregels vanaf vandaag gevonden.</div>'}</div>`;
    rosterResult.hidden = false;
    searchCard.classList.add("has-roster");
    window.scrollTo({ top: 0, behavior: "auto" });
    searchCard.scrollIntoView({ behavior: "smooth", block: "start" });

    window.dispatchEvent(new CustomEvent("rooster-user-selected", {
      detail: {
        name: employee.name,
        firstName: displayEmployeeName(employee.name).split(/\s+/)[0] || "Collega",
        personalFresh: true,
        storedAt: freshData.storedAt
      }
    }));
  }

  async function handleFresh(detail) {
    try {
      showLoading("Het zojuist bijgewerkte versleutelde roosterbestand wordt opnieuw geladen.");
      const access = window.RoosterAccessSession;
      if (!access?.loadFreshPersonalRoster) throw new Error("De huidige beveiligde Team-sessie is niet beschikbaar.");
      const loaded = await access.loadFreshPersonalRoster(detail?.file, detail?.employee);
      freshData = {
        ...loaded,
        storedAt: detail?.storedAt || new Date().toISOString()
      };
      showNameChoice(freshData.employee, freshData.storedAt);
    } catch (error) {
      showError(error?.message || String(error));
    }
  }

  window.addEventListener("rooster-personal-fresh-ready", event => handleFresh(event?.detail || {}));
  window.RoosterFreshPersonalView = Object.freeze({ handleFresh });
})();