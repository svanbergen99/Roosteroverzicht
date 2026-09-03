(() => {
  "use strict";

  const SOURCE = "Verlofaanvraag-handmatig.json";
  const VACATION_KEYS = Object.freeze([
    ["may", "meivakantie", "Meivakantie (incl Koningsdag)"],
    ["summer", "zomervakantie", "Zomervakantie"],
    ["christmas", "kerstvakantie", "Kerstvakantie"]
  ]);
  let dataPromise = null;
  let observerBusy = false;

  const esc = (value) => String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

  function sourceUrl() {
    const url = new URL(SOURCE, document.baseURI);
    url.searchParams.set("v", String(Date.now()));
    return url.href;
  }

  async function loadData() {
    if (!dataPromise) {
      dataPromise = fetch(sourceUrl(), { cache: "no-store" })
        .then((response) => {
          if (!response.ok) throw new Error("Handmatige verlofgegevens zijn niet beschikbaar.");
          return response.json();
        })
        .catch((error) => {
          dataPromise = null;
          throw error;
        });
    }
    return dataPromise;
  }

  function prettyDate(value) {
    const raw = String(value || "");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
    return new Intl.DateTimeFormat("nl-NL", {
      timeZone: "Europe/Amsterdam",
      day: "numeric",
      month: "long",
      year: "numeric"
    }).format(new Date(`${raw}T12:00:00Z`));
  }

  function vacationRows(data) {
    const root = data?.vakantie || {};
    return VACATION_KEYS.map(([key, jsonKey, label]) => {
      const row = root[jsonKey];
      if (!row || !row.startdatum || !row.eindedatum || !row.weeknummer || !row.inleverDeadline || !row.terugkoppelingWFM) return null;
      return {
        key,
        label,
        startDate: prettyDate(row.startdatum),
        endDate: prettyDate(row.eindedatum),
        weekNumber: String(row.weeknummer),
        deadline: prettyDate(row.inleverDeadline),
        feedback: prettyDate(row.terugkoppelingWFM)
      };
    }).filter(Boolean);
  }

  function closedRows(data) {
    const root = data?.officieelGesloten || {};
    return Object.entries(root).map(([key, value]) => {
      if (!value || value === false) return null;
      const dates = Array.isArray(value.datums) ? value.datums : value.datum ? [value.datum] : [];
      if (!dates.length) return null;
      return {
        key,
        label: String(value.naam || key),
        dates: dates.map(prettyDate)
      };
    }).filter(Boolean);
  }

  function setStatus(shell, message = "") {
    const status = shell?.querySelector(".vacation-leave-status");
    if (!status) return;
    status.textContent = message;
    status.hidden = !message;
  }

  function renderVacation(shell, rows) {
    const content = shell.querySelector(".vacation-leave-content");
    if (!content) return;
    content.innerHTML = rows.map((row) => `
      <section class="vacation-leave-item" data-vacation="${esc(row.key)}">
        <h3>${esc(row.label)}</h3>
        <div class="vacation-leave-fields">
          <div><span>Startdatum</span><strong>${esc(row.startDate)}</strong></div>
          <div><span>Eindedatum</span><strong>${esc(row.endDate)}</strong></div>
          <div><span>Weeknummer</span><strong>${esc(row.weekNumber)}</strong></div>
          <div><span>Inlever Deadline</span><strong>${esc(row.deadline)}</strong></div>
          <div><span>Terugkoppeling WFM</span><strong>${esc(row.feedback)}</strong></div>
        </div>
      </section>`).join("");
    setStatus(shell, "");
  }

  function renderClosed(shell, rows) {
    const content = shell.querySelector(".vacation-leave-content");
    if (!content) return;
    content.innerHTML = rows.map((row) => `
      <section class="vacation-leave-item" data-closed="${esc(row.key)}">
        <h3>${esc(row.label)}</h3>
        <div>${row.dates.map((date) => `<strong>${esc(date)}</strong>`).join("<br>")}</div>
      </section>`).join("");
    setStatus(shell, "");
  }

  async function enableButtons() {
    if (observerBusy) return;
    observerBusy = true;
    try {
      const data = await loadData();
      const vacation = vacationRows(data);
      const closed = closedRows(data);
      const vacationButton = document.getElementById("vacationLeaveButton");
      const closedButton = document.getElementById("officialClosedButton");
      if (vacationButton && vacation.length === VACATION_KEYS.length) vacationButton.disabled = false;
      if (closedButton && closed.length) closedButton.disabled = false;
    } catch (_) {
      // Bestaande screenshot/OCR-logica blijft fallback wanneer de JSON ontbreekt.
    } finally {
      observerBusy = false;
    }
  }

  document.addEventListener("click", async (event) => {
    const button = event.target.closest?.("#vacationLeaveButton, #officialClosedButton");
    if (!button || button.disabled) return;

    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();

    const shell = button.closest(".external-site-dropdown");
    const panel = shell?.querySelector(".vacation-leave-panel");
    if (!shell || !panel) return;

    const opening = panel.hidden;
    panel.hidden = !opening;
    button.setAttribute("aria-expanded", String(opening));
    shell.classList.toggle("is-open", opening);
    if (!opening) return;

    setStatus(shell, "Gegevens worden geladen…");
    try {
      const data = await loadData();
      if (button.id === "vacationLeaveButton") {
        const rows = vacationRows(data);
        if (rows.length !== VACATION_KEYS.length) throw new Error("De handmatige vakantiegegevens zijn niet compleet.");
        renderVacation(shell, rows);
      } else {
        const rows = closedRows(data);
        if (!rows.length) throw new Error("De handmatige gesloten-dagengegevens zijn niet compleet.");
        renderClosed(shell, rows);
      }
    } catch (error) {
      const content = shell.querySelector(".vacation-leave-content");
      if (content) content.innerHTML = "";
      setStatus(shell, error?.message || "De gegevens konden niet worden geladen.");
    }
  }, true);

  const observer = new MutationObserver(() => enableButtons());
  if (document.documentElement) {
    observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["disabled"]
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", enableButtons, { once: true });
  } else {
    enableButtons();
  }
})();
