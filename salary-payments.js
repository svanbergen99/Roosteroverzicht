(() => {
  "use strict";

  const TIME_ZONE = "Europe/Amsterdam";
  const PAYMENTS = [
    { month: "Januari", date: "2026-01-23" },
    { month: "Februari", date: "2026-02-23" },
    { month: "Maart", date: "2026-03-23" },
    { month: "April", date: "2026-04-23" },
    { month: "Mei", date: "2026-05-22" },
    { month: "Juni", date: "2026-06-23" },
    { month: "Juli", date: "2026-07-23" },
    { month: "Augustus", date: "2026-08-21" },
    { month: "September", date: "2026-09-23" },
    { month: "Oktober", date: "2026-10-23" },
    { month: "November", date: "2026-11-23" },
    { month: "December", date: "2026-12-18" },
    { month: "Januari (2027)", date: "2027-01-22" }
  ];

  const app = document.getElementById("app");
  const searchCard = document.querySelector(".search-card");
  const rosterResult = document.getElementById("rosterResult");
  const action = document.querySelector(".today-workers-action");
  if (!app || !searchCard || !rosterResult || !action) return;

  let showAllPayments = false;
  let salaryButton = document.getElementById("salaryPaymentButton");
  if (!salaryButton) {
    salaryButton = document.createElement("button");
    salaryButton.id = "salaryPaymentButton";
    salaryButton.className = "today-workers-button";
    salaryButton.type = "button";
    salaryButton.textContent = "Salaris uitbetaling";
    action.appendChild(salaryButton);
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
    return PAYMENTS.find((payment) => payment.date >= today) || null;
  }

  function visiblePayments() {
    if (showAllPayments) return PAYMENTS;
    const monthKey = currentMonthKey();
    return PAYMENTS.filter((payment) => payment.date.slice(0, 7) >= monthKey);
  }

  function ensureNextPaymentBar() {
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
    const payments = visiblePayments();
    const rows = payments.map((payment) => {
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
        <span class="today-workers-count">${payments.length} betaal${payments.length === 1 ? "datum" : "data"}</span>
      </div>
      <button type="button" class="today-workers-button salary-history-toggle" aria-pressed="${showAllPayments}">Laat alles zien</button>
      <div class="today-workers-list salary-payment-list">${rows || `<div class="no-activities">Er zijn geen huidige of komende uitbetalingsdata bekend.</div>`}</div>`;
    rosterResult.hidden = false;
    searchCard.classList.add("has-roster");
    searchCard.classList.remove("has-month-roster");
  }

  salaryButton.addEventListener("click", (event) => {
    event.preventDefault();
    if (activeOverviewTitle() === "Salaris uitbetaling") {
      closeOverview();
      return;
    }
    showAllPayments = false;
    renderPayments();
  });

  rosterResult.addEventListener("click", (event) => {
    const button = event.target.closest(".salary-history-toggle");
    if (!button || activeOverviewTitle() !== "Salaris uitbetaling") return;
    event.preventDefault();
    showAllPayments = !showAllPayments;
    renderPayments();
  });

  window.addEventListener("rooster-unlocked", ensureNextPaymentBar);
  if (!app.hidden) ensureNextPaymentBar();
})();
