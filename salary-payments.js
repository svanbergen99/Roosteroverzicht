(() => {
  "use strict";

  const TIME_ZONE = "Europe/Amsterdam";
  const app = document.getElementById("app");
  const searchCard = document.querySelector(".search-card");
  const rosterResult = document.getElementById("rosterResult");
  const action = document.querySelector(".today-workers-action");
  if (!app || !searchCard || !rosterResult || !action) return;

  let showAllPayments = false;
  let salaryButton = null;

  function payments() {
    const value = window.RoosterPrivateConfig?.salaryPayments;
    if (!Array.isArray(value)) return [];
    return value.map((payment) => ({
      month: String(payment?.month || "").trim(),
      date: String(payment?.date || "").trim()
    })).filter((payment) => payment.month && /^\d{4}-\d{2}-\d{2}$/.test(payment.date));
  }

  function ensureSalaryButton() {
    if (!payments().length) {
      document.getElementById("salaryPaymentButton")?.remove();
      salaryButton = null;
      return null;
    }

    salaryButton = document.getElementById("salaryPaymentButton");
    if (!salaryButton) {
      salaryButton = document.createElement("button");
      salaryButton.id = "salaryPaymentButton";
      salaryButton.className = "today-workers-button";
      salaryButton.type = "button";
      salaryButton.textContent = "Salaris uitbetaling";
      action.appendChild(salaryButton);
      salaryButton.addEventListener("click", handleSalaryClick);
    }
    return salaryButton;
  }

  function amsterdamDateKey(date = new Date()) {
    const parts = new Intl.DateTimeFormat("en-CA", { timeZone: TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(date);
    const get = (type) => parts.find((part) => part.type === type)?.value || "";
    return `${get("year")}-${get("month")}-${get("day")}`;
  }

  function currentMonthKey() {
    return amsterdamDateKey().slice(0, 7);
  }

  function formatDate(dateKey, includeWeekday = true) {
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

  function visiblePayments() {
    const list = payments();
    if (showAllPayments) return list;
    const monthKey = currentMonthKey();
    return list.filter((payment) => payment.date.slice(0, 7) >= monthKey);
  }

  function ensureNextPaymentBar() {
    if (!payments().length) {
      document.getElementById("nextSalaryPaymentBar")?.remove();
      return;
    }

    let bar = document.getElementById("nextSalaryPaymentBar");
    if (!bar) {
      bar = document.createElement("div");
      bar.id = "nextSalaryPaymentBar";
      bar.className = "next-salary-payment-bar";
      const titleRow = searchCard.querySelector(".roster-title-row");
      const title = searchCard.querySelector(":scope > h1");
      (titleRow || title || searchCard.firstElementChild)?.before(bar);
    }
    const upcoming = nextPayment();
    bar.innerHTML = upcoming
      ? `<span>Volgende salaris uitbetaling:</span><strong>${formatDate(upcoming.date, false)}</strong>`
      : `<span>Volgende salaris uitbetaling:</span><strong>Nog niet bekend</strong>`;
    bar.hidden = false;
  }

  function escapeHtml(value) {
    return String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");
  }

  function activeOverviewTitle() {
    if (rosterResult.hidden) return "";
    return rosterResult.querySelector(".today-workers-head h2")?.textContent?.trim() || "";
  }

  function closeOverview() {
    showAllPayments = false;
    rosterResult.hidden = true;
    rosterResult.innerHTML = "";
    searchCard.classList.remove("has-roster", "has-month-roster");
  }

  function renderPayments() {
    const today = amsterdamDateKey();
    const upcoming = nextPayment(today);
    const visible = visiblePayments();
    const rows = visible.map((payment) => {
      const isNext = upcoming?.date === payment.date;
      const classes = ["today-worker-row", "salary-payment-row"];
      if (isNext) classes.push("salary-payment-next");
      return `<div class="${classes.join(" ")}"><span class="today-worker-name">${escapeHtml(payment.month)}</span><span class="today-worker-time">${escapeHtml(formatDate(payment.date, false))}</span></div>`;
    }).join("");

    rosterResult.innerHTML = `
      <div class="today-workers-head salary-payments-head">
        <div>
          <h2>Salaris uitbetaling</h2>
          <p class="today-workers-date">${showAllPayments ? "Alle bekende uitbetalingsdata" : "Huidige en komende maanden"}</p>
        </div>
        <span class="today-workers-count">${visible.length} betaal${visible.length === 1 ? "datum" : "data"}</span>
      </div>
      <button type="button" class="today-workers-button salary-history-toggle" aria-pressed="${showAllPayments}">Laat alles zien</button>
      <div class="today-workers-list salary-payment-list">${rows || `<div class="no-activities">Er zijn geen huidige of komende uitbetalingsdata bekend.</div>`}</div>`;
    rosterResult.hidden = false;
    searchCard.classList.add("has-roster");
    searchCard.classList.remove("has-month-roster");
  }

  function handleSalaryClick(event) {
    event.preventDefault();
    if (!payments().length) return;
    if (activeOverviewTitle() === "Salaris uitbetaling") {
      closeOverview();
      return;
    }
    showAllPayments = false;
    renderPayments();
  }

  rosterResult.addEventListener("click", (event) => {
    const button = event.target.closest(".salary-history-toggle");
    if (!button || activeOverviewTitle() !== "Salaris uitbetaling") return;
    event.preventDefault();
    showAllPayments = !showAllPayments;
    renderPayments();
  });

  function enableSalaryUi() {
    ensureSalaryButton();
    ensureNextPaymentBar();
  }

  window.addEventListener("rooster-private-config-ready", enableSalaryUi);
  window.addEventListener("rooster-unlocked", enableSalaryUi);
  if (window.RoosterPrivateConfig) enableSalaryUi();
})();
