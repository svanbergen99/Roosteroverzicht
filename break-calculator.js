(() => {
  "use strict";

  const app = document.getElementById("app");
  const searchCard = document.querySelector(".search-card");
  const rosterResult = document.getElementById("rosterResult");
  const action = document.querySelector(".today-workers-action");
  if (!app || !searchCard || !rosterResult || !action) return;

  let timerId = null;
  let elapsedSeconds = 0;
  let targetSeconds = 0;
  let running = false;

  let button = document.getElementById("breakCalculatorButton");
  if (!button) {
    button = document.createElement("button");
    button.id = "breakCalculatorButton";
    button.className = "today-workers-button";
    button.type = "button";
    button.textContent = "Bereken je pauze";
    action.appendChild(button);
  }

  function parseNumber(value) {
    const number = Number(String(value || "").trim().replace(",", "."));
    return Number.isFinite(number) ? number : NaN;
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function activeOverviewTitle() {
    if (rosterResult.hidden) return "";
    return rosterResult.querySelector(".today-workers-head h2")?.textContent?.trim() || "";
  }

  function stopTimer() {
    running = false;
    if (timerId !== null) clearInterval(timerId);
    timerId = null;
    const startButton = document.getElementById("breakTimerStartButton");
    if (startButton) startButton.textContent = "Start timer";
  }

  function resetTimer() {
    stopTimer();
    elapsedSeconds = 0;
    updateTimerDisplay();
  }

  function closeOverview() {
    stopTimer();
    rosterResult.hidden = true;
    rosterResult.innerHTML = "";
    searchCard.classList.remove("has-roster", "has-month-roster");
  }

  function legalMinimumMinutes(hours) {
    if (hours < 5.5) return 0;
    if (hours < 10) return 30;
    return 45;
  }

  function formatMinutes(minutes) {
    const roundedSeconds = Math.round(minutes * 60);
    const wholeMinutes = Math.floor(roundedSeconds / 60);
    const seconds = roundedSeconds % 60;
    if (!seconds) return `${wholeMinutes} minuten`;
    return `${wholeMinutes} min ${seconds} sec`;
  }

  function formatClock(seconds) {
    const safe = Math.max(0, Math.floor(seconds));
    const hours = Math.floor(safe / 3600);
    const minutes = Math.floor((safe % 3600) / 60);
    const secs = safe % 60;
    return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
  }

  function updateTimerDisplay() {
    const elapsed = document.getElementById("breakTimerElapsed");
    const remaining = document.getElementById("breakTimerRemaining");
    const progress = document.getElementById("breakTimerProgress");
    const status = document.getElementById("breakTimerStatus");
    if (elapsed) elapsed.textContent = formatClock(elapsedSeconds);
    if (remaining) remaining.textContent = targetSeconds > 0 ? formatClock(Math.max(0, targetSeconds - elapsedSeconds)) : "--:--:--";
    if (progress) {
      const percent = targetSeconds > 0 ? Math.min(100, (elapsedSeconds / targetSeconds) * 100) : 0;
      progress.style.width = `${percent}%`;
    }
    if (status && targetSeconds > 0 && elapsedSeconds >= targetSeconds) {
      status.textContent = "Je berekende pauzetijd is bereikt.";
      status.classList.add("is-warning");
    }
  }

  function calculate() {
    const hoursInput = document.getElementById("breakHoursInput");
    const percentageInput = document.getElementById("breakPercentageInput");
    const schadeInput = document.getElementById("breakSchadeInput");
    const result = document.getElementById("breakCalculationResult");
    const status = document.getElementById("breakTimerStatus");
    if (!hoursInput || !percentageInput || !result) return;

    const hours = parseNumber(hoursInput.value);
    const percentage = parseNumber(percentageInput.value);
    if (!(hours > 0 && hours <= 16) || !(percentage >= 0 && percentage <= 100)) {
      result.innerHTML = '<div class="break-error">Vul een geldig aantal uren en pauzepercentage in.</div>';
      targetSeconds = 0;
      resetTimer();
      return;
    }

    const pauseMinutes = hours * 60 * (percentage / 100);
    const legalMinimum = legalMinimumMinutes(hours);
    targetSeconds = Math.round(pauseMinutes * 60);
    resetTimer();

    const belowMinimum = legalMinimum > 0 && pauseMinutes < legalMinimum;
    const schadeNote = schadeInput?.checked
      ? '<div class="break-note">Schadeservices is geselecteerd. De berekening gebruikt het pauzepercentage dat je hierboven zelf hebt ingevuld.</div>'
      : "";

    result.innerHTML = `
      <div class="break-result-grid">
        <div class="break-result-card"><span>Berekende pauzetijd</span><strong>${escapeHtml(formatMinutes(pauseMinutes))}</strong></div>
        <div class="break-result-card"><span>Wettelijk minimum volgens de tabel</span><strong>${legalMinimum ? `${legalMinimum} minuten` : "Geen minimum"}</strong></div>
      </div>
      ${belowMinimum ? '<div class="break-warning">Je berekende pauzetijd ligt onder het minimum uit de wettelijke tabel voor deze werkduur.</div>' : ""}
      ${schadeNote}`;

    if (status) {
      status.textContent = targetSeconds > 0 ? "Timer staat klaar." : "Er is geen pauzetijd om te timen.";
      status.classList.remove("is-warning");
    }
    updateTimerDisplay();
  }

  function toggleTimer() {
    const status = document.getElementById("breakTimerStatus");
    const startButton = document.getElementById("breakTimerStartButton");
    if (targetSeconds <= 0) {
      if (status) status.textContent = "Bereken eerst je pauzetijd.";
      return;
    }
    if (elapsedSeconds >= targetSeconds) {
      elapsedSeconds = 0;
      updateTimerDisplay();
    }
    if (running) {
      stopTimer();
      if (status) status.textContent = "Timer gepauzeerd.";
      return;
    }
    running = true;
    if (startButton) startButton.textContent = "Pauzeer timer";
    if (status) {
      status.textContent = "Timer loopt.";
      status.classList.remove("is-warning");
    }
    timerId = window.setInterval(() => {
      elapsedSeconds += 1;
      updateTimerDisplay();
      if (elapsedSeconds >= targetSeconds) stopTimer();
    }, 1000);
  }

  function renderCalculator() {
    stopTimer();
    elapsedSeconds = 0;
    targetSeconds = 0;

    rosterResult.innerHTML = `
      <div class="today-workers-head break-calculator-head">
        <div>
          <h2>Bereken je pauze</h2>
          <p class="today-workers-date">Bereken je beschikbare pauzetijd en gebruik de pauzetimer.</p>
        </div>
      </div>
      <div class="break-calculator-wrap">
        <form id="breakCalculatorForm" class="break-calculator-form" autocomplete="off">
          <div class="break-fields">
            <label>Aantal uren
              <input id="breakHoursInput" inputmode="decimal" placeholder="Bijv. 8" required>
            </label>
            <label>Percentage pauze
              <input id="breakPercentageInput" inputmode="decimal" placeholder="Bijv. 12" required>
            </label>
          </div>
          <label class="break-checkbox-row">
            <input id="breakSchadeInput" type="checkbox">
            <span>Werk je bij Schadeservices?</span>
          </label>
          <button class="today-workers-button break-calculate-button" type="submit">Bereken pauze</button>
        </form>

        <div id="breakCalculationResult" class="break-calculation-result">
          <div class="break-note">Vul je uren en pauzepercentage in om je pauzetijd te berekenen.</div>
        </div>

        <section class="break-timer-card" aria-label="Pauzetimer">
          <div class="break-timer-title">Resterende pauzetijd</div>
          <div class="break-timer-clock" id="breakTimerRemaining">--:--:--</div>
          <div class="break-timer-meta"><span>Verstreken</span><strong id="breakTimerElapsed">00:00:00</strong></div>
          <div class="break-progress"><span id="breakTimerProgress"></span></div>
          <div id="breakTimerStatus" class="break-timer-status">Bereken eerst je pauzetijd.</div>
          <div class="break-timer-actions">
            <button id="breakTimerStartButton" class="today-workers-button" type="button">Start timer</button>
            <button id="breakTimerResetButton" class="today-workers-button" type="button">Reset timer</button>
          </div>
        </section>

        <details class="break-legal-card">
          <summary>Wettelijke pauzetijden</summary>
          <div class="break-table-wrap">
            <table class="break-table">
              <thead><tr><th>Werkduur</th><th>Minimum pauze</th><th>Opmerking</th></tr></thead>
              <tbody>
                <tr><td>Minder dan 5,5 uur</td><td>Geen</td><td>Geen minimum in deze tabel</td></tr>
                <tr><td>5,5 tot minder dan 10 uur</td><td>30 minuten</td><td>Kan in twee blokken van 15 minuten</td></tr>
                <tr><td>10 uur of meer</td><td>45 minuten</td><td>Pauzes in blokken van minimaal 15 minuten</td></tr>
              </tbody>
            </table>
          </div>
          <p class="break-legal-note">Of een pauze wordt doorbetaald hangt af van cao of arbeidsovereenkomst.</p>
        </details>
      </div>`;

    rosterResult.hidden = false;
    searchCard.classList.add("has-roster");
    searchCard.classList.remove("has-month-roster");

    document.getElementById("breakCalculatorForm")?.addEventListener("submit", (event) => {
      event.preventDefault();
      calculate();
    });
    document.getElementById("breakTimerStartButton")?.addEventListener("click", toggleTimer);
    document.getElementById("breakTimerResetButton")?.addEventListener("click", () => {
      resetTimer();
      const status = document.getElementById("breakTimerStatus");
      if (status) {
        status.textContent = targetSeconds > 0 ? "Timer opnieuw ingesteld." : "Bereken eerst je pauzetijd.";
        status.classList.remove("is-warning");
      }
    });
  }

  button.addEventListener("click", (event) => {
    event.preventDefault();
    if (activeOverviewTitle() === "Bereken je pauze") {
      closeOverview();
      return;
    }
    renderCalculator();
  });

  const observer = new MutationObserver(() => {
    if (!rosterResult.querySelector(".break-calculator-wrap")) stopTimer();
  });
  observer.observe(rosterResult, { childList: true, subtree: false });
})();
