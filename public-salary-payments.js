(() => {
  "use strict";

  const TIME_ZONE = "Europe/Amsterdam";
  const app = document.getElementById("app");
  if (!app) return;

  let showAllPayments = false;

  function payments() {
    const value = window.RoosterPrivateConfig?.salaryPayments;
    if (!Array.isArray(value)) return [];
    return value.map((payment) => ({
      month: String(payment?.month || "").trim(),
      date: String(payment?.date || "").trim()
    })).filter((payment) => payment.month && /^\d{4}-\d{2}-\d{2}$/.test(payment.date));
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

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

  function currentMonthKey() {
    return amsterdamDateKey().slice(0, 7);
  }

  function formatDate(dateKey, includeWeekday = false) {
    const date = new Date(`${dateKey}T12:00:00Z`);
    return new Intl.DateTimeFormat("nl-NL", {
      timeZone: TIME_ZONE,
      ...(includeWeekday ? { weekday: "long" } : {}),
      day: "numeric",
      month: "long",
      year: "numeric"
    }).format(date);
  }

  function nextPayment(today = amsterdamDateKey()) {
    return payments().find((payment) => payment.date >= today) || null;
  }

  function isPaymentDate(dateKey = amsterdamDateKey()) {
    return payments().some((payment) => payment.date === dateKey);
  }

  function visiblePayments() {
    const list = payments();
    if (showAllPayments) return list;
    const monthKey = currentMonthKey();
    return list.filter((payment) => payment.date.slice(0, 7) >= monthKey);
  }

  function renderPanel(section) {
    const list = section.querySelector("#publicSalaryList");
    const historyButton = section.querySelector("#publicSalaryHistoryButton");
    const subtitle = section.querySelector("#publicSalarySubtitle");
    if (!list || !historyButton || !subtitle) return;

    const upcoming = nextPayment();
    const visible = visiblePayments();
    subtitle.textContent = showAllPayments ? "Alle bekende uitbetalingsdata" : "Huidige en komende maanden";
    historyButton.textContent = showAllPayments ? "Alleen komende data" : "Laat alles zien";
    historyButton.setAttribute("aria-pressed", String(showAllPayments));

    list.innerHTML = visible.map((payment) => {
      const isNext = upcoming?.date === payment.date;
      return `
        <div class="public-salary-row${isNext ? " is-next" : ""}" data-salary-date="${escapeHtml(payment.date)}">
          <span class="public-salary-month">${escapeHtml(payment.month)}${isNext ? '<span class="public-salary-next-label">Volgende</span>' : ""}</span>
          <strong>${escapeHtml(formatDate(payment.date))}</strong>
        </div>`;
    }).join("") || '<div class="public-salary-empty">Er zijn geen komende uitbetalingsdata bekend.</div>';
  }

  function ensureSection() {
    const available = payments();
    let section = document.getElementById("publicSalarySection");

    if (!available.length) {
      section?.remove();
      return null;
    }

    if (section) {
      const upcoming = nextPayment();
      const summary = section.querySelector("#publicSalaryButton small");
      if (summary) summary.textContent = upcoming ? `Volgende: ${formatDate(upcoming.date)}` : "Volgende datum nog niet bekend";
      return section;
    }

    const upcoming = nextPayment();
    section = document.createElement("section");
    section.id = "publicSalarySection";
    section.className = "public-salary-section";
    section.innerHTML = `
      <button id="publicSalaryButton" class="today-workers-button public-salary-button" type="button" aria-expanded="false" aria-controls="publicSalaryPanel">
        <span class="public-salary-button-main">
          <span class="public-salary-button-icon" aria-hidden="true">€</span>
          <span>
            <strong>Salaris uitbetaling</strong>
            <small>${upcoming ? `Volgende: ${escapeHtml(formatDate(upcoming.date))}` : "Volgende datum nog niet bekend"}</small>
          </span>
        </span>
        <span class="public-salary-caret" aria-hidden="true">▾</span>
      </button>
      <div id="publicSalaryPanel" class="public-salary-panel" hidden>
        <div class="public-salary-head">
          <div>
            <h2>Salaris uitbetaling</h2>
            <p id="publicSalarySubtitle">Huidige en komende maanden</p>
          </div>
          <button id="publicSalaryHistoryButton" class="today-workers-button public-salary-history" type="button" aria-pressed="false">Laat alles zien</button>
        </div>
        <div id="publicSalaryList" class="public-salary-list"></div>
      </div>`;

    const external = document.getElementById("externalSitesSection");
    if (external) app.insertBefore(section, external);
    else app.prepend(section);

    const button = section.querySelector("#publicSalaryButton");
    const panel = section.querySelector("#publicSalaryPanel");
    const history = section.querySelector("#publicSalaryHistoryButton");

    button?.addEventListener("click", () => {
      const opening = panel.hidden;
      panel.hidden = !opening;
      button.setAttribute("aria-expanded", String(opening));
      if (opening) renderPanel(section);
    });

    history?.addEventListener("click", () => {
      showAllPayments = !showAllPayments;
      renderPanel(section);
    });

    return section;
  }

  function publishReady() {
    if (!payments().length) return;
    ensureSection();
    window.dispatchEvent(new CustomEvent("salary-payments-ready", {
      detail: { today: amsterdamDateKey(), isPaymentDate: isPaymentDate() }
    }));
  }

  window.RoosterSalaryPayments = Object.freeze({
    today: () => amsterdamDateKey(),
    isPaymentDate,
    next: () => nextPayment(),
    all: () => payments().map((payment) => ({ ...payment }))
  });

  window.addEventListener("rooster-private-config-ready", publishReady);
  window.addEventListener("rooster-unlocked", publishReady);
  if (window.RoosterPrivateConfig) publishReady();
})();
