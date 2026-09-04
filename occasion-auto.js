(() => {
  "use strict";

  const TIME_ZONE = "Europe/Amsterdam";
  const EMPLOYEE_FILE = "Medewerkerbestand.json";
  const BIRTHDAY_PREFIX = "roosteroverzicht.birthday.v1.";
  const BIRTHDAY_PLAY_PREFIX = "roosteroverzicht.birthday.played.v1.";
  const PAYDAY_PLAY_PREFIX = "roosteroverzicht.payday.played.v1.";
  const DIALOG_ID = "birthdayProfileDialog";
  const CONTROL_CLASS = "birthday-profile-control";

  let activeEmployeeName = "";
  let centralBirthdayPromise = null;
  let centralBirthdays = new Map();

  const rosterResult = document.getElementById("rosterResult");

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

  function todayMonthDay() {
    return amsterdamDateKey().slice(5);
  }

  function normalizeName(value) {
    return String(value || "")
      .toLocaleLowerCase("nl-NL")
      .normalize("NFD")
      .replace(/\p{M}/gu, "")
      .replace(/[^\p{L}\p{N}]+/gu, " ")
      .trim()
      .replace(/\s+/g, " ");
  }

  function nameHash(name) {
    const text = normalizeName(name);
    let hash = 2166136261;
    for (let index = 0; index < text.length; index += 1) {
      hash ^= text.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0).toString(36);
  }

  function birthdayKey(name) {
    return `${BIRTHDAY_PREFIX}${nameHash(name)}`;
  }

  function validMonthDay(value) {
    if (!/^(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(String(value || ""))) return "";
    const [month, day] = String(value).split("-").map(Number);
    const date = new Date(Date.UTC(2000, month - 1, day, 12));
    return date.getUTCMonth() + 1 === month && date.getUTCDate() === day ? String(value) : "";
  }

  async function loadCentralBirthdays(force = false) {
    if (centralBirthdayPromise && !force) return centralBirthdayPromise;
    centralBirthdayPromise = (async () => {
      try {
        const response = await fetch(`${EMPLOYEE_FILE}?v=${Date.now()}`, { cache: "no-store" });
        if (!response.ok) return centralBirthdays;
        const data = await response.json();
        const next = new Map();
        for (const employee of Array.isArray(data?.medewerkers) ? data.medewerkers : []) {
          const name = normalizeName(employee?.naam);
          const birthday = validMonthDay(employee?.verjaardag);
          if (name && birthday) next.set(name, birthday);
        }
        centralBirthdays = next;
      } catch (error) {
        console.warn("Medewerkerbestand.json kon niet worden gelezen.", error);
      }
      return centralBirthdays;
    })();
    return centralBirthdayPromise;
  }

  function readLocalBirthday(name) {
    if (!name) return "";
    try {
      return validMonthDay(localStorage.getItem(birthdayKey(name)) || "");
    } catch (_) {
      return "";
    }
  }

  function readBirthday(name) {
    return readLocalBirthday(name) || centralBirthdays.get(normalizeName(name)) || "";
  }

  function writeBirthdayLocal(name, monthDay) {
    if (!name) return;
    try {
      if (monthDay) localStorage.setItem(birthdayKey(name), monthDay);
      else localStorage.removeItem(birthdayKey(name));
    } catch (_) {}
  }

  function selectedEmployeeName() {
    return rosterResult?.querySelector(".employee-name")?.textContent?.trim() || "";
  }

  function formatBirthday(monthDay) {
    const valid = validMonthDay(monthDay);
    if (!valid) return "";
    const [month, day] = valid.split("-").map(Number);
    const date = new Date(Date.UTC(2000, month - 1, day, 12));
    return new Intl.DateTimeFormat("nl-NL", {
      day: "numeric",
      month: "long",
      timeZone: "UTC"
    }).format(date);
  }

  function isBirthdayVideoPath(path) {
    return /(?:^|\/)(?:verjaardag|[^/]*birthday[^/]*)\.mp4(?:[?#]|$)/i.test(String(path || ""));
  }

  function isPaydayVideoPath(path) {
    return /(?:^|\/)payday\.mp4(?:[?#]|$)/i.test(String(path || ""));
  }

  function removeManualBirthdayEffectButton() {
    document.querySelectorAll('[data-effect="birthday"]').forEach((item) => item.remove());
  }

  async function findVideoButton(matcher, timeoutMs = 6500) {
    const started = Date.now();
    let refreshed = false;
    while (Date.now() - started < timeoutMs) {
      removeManualBirthdayEffectButton();
      const button = [...document.querySelectorAll("[data-video-path]")]
        .find((item) => matcher(item.dataset.videoPath || ""));
      if (button) return button;
      if (!refreshed) {
        refreshed = true;
        try { window.RoosterVideoLibrary?.refresh?.(); } catch (_) {}
      }
      await new Promise((resolve) => window.setTimeout(resolve, 120));
    }
    return null;
  }

  async function playAutomaticVideo(matcher) {
    const button = await findVideoButton(matcher);
    if (!button) return false;
    button.click();
    return true;
  }

  function ensureBirthdayDialog() {
    let dialog = document.getElementById(DIALOG_ID);
    if (dialog) return dialog;

    dialog = document.createElement("div");
    dialog.id = DIALOG_ID;
    dialog.className = "birthday-profile-dialog";
    dialog.hidden = true;
    dialog.setAttribute("role", "dialog");
    dialog.setAttribute("aria-modal", "true");
    dialog.setAttribute("aria-labelledby", "birthdayProfileTitle");

    const monthOptions = [
      "Januari", "Februari", "Maart", "April", "Mei", "Juni",
      "Juli", "Augustus", "September", "Oktober", "November", "December"
    ].map((label, index) => `<option value="${String(index + 1).padStart(2, "0")}">${label}</option>`).join("");

    const dayOptions = Array.from({ length: 31 }, (_, index) => {
      const value = String(index + 1).padStart(2, "0");
      return `<option value="${value}">${index + 1}</option>`;
    }).join("");

    dialog.innerHTML = `
      <section class="birthday-profile-card">
        <h2 id="birthdayProfileTitle">Verjaardag instellen</h2>
        <p>De datum wordt aan de geselecteerde collega gekoppeld. De pagina leest centraal opgeslagen verjaardagen uit ${EMPLOYEE_FILE}.</p>
        <div class="birthday-profile-fields">
          <label>Dag<select data-birthday-day>${dayOptions}</select></label>
          <label>Maand<select data-birthday-month>${monthOptions}</select></label>
        </div>
        <div class="birthday-profile-error" data-birthday-error aria-live="polite"></div>
        <div class="birthday-profile-storage-note" data-birthday-storage-note></div>
        <div class="birthday-profile-actions">
          <button type="button" class="secondary" data-birthday-remove>Verwijderen</button>
          <button type="button" class="secondary" data-birthday-cancel>Annuleren</button>
          <button type="button" data-birthday-save>Opslaan</button>
        </div>
      </section>`;

    document.body.appendChild(dialog);
    const close = () => { dialog.hidden = true; };
    dialog.querySelector("[data-birthday-cancel]")?.addEventListener("click", close);
    dialog.addEventListener("click", (event) => {
      if (event.target === dialog) close();
    });

    dialog.querySelector("[data-birthday-save]")?.addEventListener("click", () => {
      const month = dialog.querySelector("[data-birthday-month]")?.value || "";
      const day = dialog.querySelector("[data-birthday-day]")?.value || "";
      const error = dialog.querySelector("[data-birthday-error]");
      const birthday = validMonthDay(`${month}-${day}`);
      if (!birthday) {
        if (error) error.textContent = "Kies een geldige datum.";
        return;
      }
      writeBirthdayLocal(activeEmployeeName, birthday);
      close();
      renderBirthdayControl(activeEmployeeName);
      maybePlayBirthday(activeEmployeeName);
    });

    dialog.querySelector("[data-birthday-remove]")?.addEventListener("click", () => {
      writeBirthdayLocal(activeEmployeeName, "");
      close();
      renderBirthdayControl(activeEmployeeName);
    });

    return dialog;
  }

  function openBirthdayDialog(name) {
    if (!name) return;
    activeEmployeeName = name;
    const dialog = ensureBirthdayDialog();
    const stored = readBirthday(name);
    const [month, day] = stored ? stored.split("-") : ["01", "01"];
    const monthSelect = dialog.querySelector("[data-birthday-month]");
    const daySelect = dialog.querySelector("[data-birthday-day]");
    const error = dialog.querySelector("[data-birthday-error]");
    const note = dialog.querySelector("[data-birthday-storage-note]");
    if (monthSelect) monthSelect.value = month;
    if (daySelect) daySelect.value = day;
    if (error) error.textContent = "";
    if (note) note.textContent = "Invoer wordt voorlopig lokaal onthouden; centraal schrijven vereist nog een beveiligde schrijfservice.";
    dialog.hidden = false;
  }

  function renderBirthdayControl(name) {
    if (!rosterResult || !name) return;
    let tools = rosterResult.querySelector(".roster-tools");
    if (!tools) {
      const schedule = rosterResult.querySelector(".schedule-list");
      if (!schedule) return;
      tools = document.createElement("div");
      tools.className = "roster-tools";
      schedule.before(tools);
    }

    let button = tools.querySelector(`.${CONTROL_CLASS}`);
    if (!button) {
      button = document.createElement("button");
      button.type = "button";
      button.className = `today-workers-button ${CONTROL_CLASS}`;
      tools.prepend(button);
      button.addEventListener("click", () => openBirthdayDialog(selectedEmployeeName()));
    }

    const formatted = formatBirthday(readBirthday(name));
    button.textContent = formatted ? `🎂 Verjaardag: ${formatted}` : "🎂 Verjaardag instellen";
    button.title = formatted ? "Verjaardag wijzigen" : "Verjaardag instellen";
  }

  async function maybePlayBirthday(name) {
    if (!name) return;
    await loadCentralBirthdays();
    const birthday = readBirthday(name);
    if (!birthday || birthday !== todayMonthDay()) return;

    const today = amsterdamDateKey();
    const playedKey = `${BIRTHDAY_PLAY_PREFIX}${today}.${nameHash(name)}`;
    try {
      if (sessionStorage.getItem(playedKey) === "1") return;
    } catch (_) {}

    const played = await playAutomaticVideo(isBirthdayVideoPath);
    if (played) {
      try { sessionStorage.setItem(playedKey, "1"); } catch (_) {}
    }
  }

  async function handleEmployeeSelected() {
    const name = selectedEmployeeName();
    if (!name) return;
    activeEmployeeName = name;
    await loadCentralBirthdays();
    renderBirthdayControl(name);
    maybePlayBirthday(name);
  }

  async function maybePlayPayday() {
    const salary = window.RoosterSalaryPayments;
    if (!salary?.isPaymentDate?.()) return;
    const today = salary.today?.() || amsterdamDateKey();
    const playedKey = `${PAYDAY_PLAY_PREFIX}${today}`;
    try {
      if (sessionStorage.getItem(playedKey) === "1") return;
    } catch (_) {}

    const played = await playAutomaticVideo(isPaydayVideoPath);
    if (played) {
      try { sessionStorage.setItem(playedKey, "1"); } catch (_) {}
    }
  }

  document.addEventListener("click", (event) => {
    const effect = event.target.closest?.('[data-effect="birthday"]');
    if (!effect) return;
    event.preventDefault();
    event.stopImmediatePropagation();
  }, true);

  const observer = new MutationObserver(removeManualBirthdayEffectButton);
  observer.observe(document.documentElement, { childList: true, subtree: true });
  removeManualBirthdayEffectButton();
  loadCentralBirthdays();

  window.addEventListener("rooster-employee-selected", () => requestAnimationFrame(handleEmployeeSelected));
  window.addEventListener("salary-payments-ready", () => window.setTimeout(maybePlayPayday, 250));
  window.addEventListener("rooster-unlocked", (event) => {
    if (event?.detail?.publicPortal) window.setTimeout(maybePlayPayday, 350);
  });

  if (document.body.classList.contains("public-portal-mode") && !document.getElementById("app")?.hidden) {
    window.setTimeout(maybePlayPayday, 450);
  }
})();
