(() => {
  "use strict";

  const TIME_ZONE = "Europe/Amsterdam";
  const BIRTHDAY_PREFIX = "roosteroverzicht.birthday.v1.";
  const BIRTHDAY_PLAY_PREFIX = "roosteroverzicht.birthday.played.v1.";
  const PAYDAY_PLAY_PREFIX = "roosteroverzicht.payday.played.v1.";
  const DIALOG_ID = "birthdayProfileDialog";
  const CONTROL_CLASS = "birthday-profile-control";
  const AUTO_VIDEO_ATTR = "data-auto-only-video";

  let birthdayVideoAllowedUntil = 0;
  let activeEmployeeName = "";

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

  function readBirthday(name) {
    if (!name) return "";
    try {
      const value = localStorage.getItem(birthdayKey(name)) || "";
      return /^(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(value) ? value : "";
    } catch (_) {
      return "";
    }
  }

  function writeBirthday(name, monthDay) {
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
    const match = String(monthDay || "").match(/^(\d{2})-(\d{2})$/);
    if (!match) return "";
    const date = new Date(Date.UTC(2000, Number(match[1]) - 1, Number(match[2]), 12));
    if (date.getUTCMonth() + 1 !== Number(match[1]) || date.getUTCDate() !== Number(match[2])) return "";
    return new Intl.DateTimeFormat("nl-NL", { day: "numeric", month: "long", timeZone: "UTC" }).format(date);
  }

  function isBirthdayVideoPath(path) {
    return /(?:^|\/)(?:verjaardag|[^/]*birthday[^/]*)\.mp4(?:[?#]|$)/i.test(String(path || ""));
  }

  function isPaydayVideoPath(path) {
    return /(?:^|\/)payday\.mp4(?:[?#]|$)/i.test(String(path || ""));
  }

  function protectManualBirthdayControls() {
    document.querySelectorAll('[data-effect="birthday"]').forEach((item) => item.remove());

    document.querySelectorAll("[data-video-path]").forEach((item) => {
      if (!isBirthdayVideoPath(item.dataset.videoPath)) return;
      item.setAttribute(AUTO_VIDEO_ATTR, "birthday");
      const group = item.closest(".video-library-group");
      if (group) {
        const visibleItems = [...group.querySelectorAll("[data-video-path]")].filter((button) => !button.hasAttribute(AUTO_VIDEO_ATTR));
        group.classList.toggle("is-auto-only-video-group", visibleItems.length === 0);
      }
    });
  }

  async function findVideoButton(matcher, timeoutMs = 6500) {
    const started = Date.now();
    let refreshed = false;

    while (Date.now() - started < timeoutMs) {
      protectManualBirthdayControls();
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

  async function playAutomaticVideo(matcher, kind) {
    const button = await findVideoButton(matcher);
    if (!button) return false;

    if (kind === "birthday") birthdayVideoAllowedUntil = performance.now() + 1800;
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
        <p>Deze datum wordt alleen op dit apparaat onthouden en wordt gebruikt voor jouw verjaardagvideo.</p>
        <div class="birthday-profile-fields">
          <label>Dag<select data-birthday-day>${dayOptions}</select></label>
          <label>Maand<select data-birthday-month>${monthOptions}</select></label>
        </div>
        <div class="birthday-profile-error" data-birthday-error aria-live="polite"></div>
        <div class="birthday-profile-actions">
          <button type="button" class="secondary" data-birthday-remove>Verwijderen</button>
          <button type="button" class="secondary" data-birthday-cancel>Annuleren</button>
          <button type="button" data-birthday-save>Opslaan</button>
        </div>
      </section>`;

    document.body.appendChild(dialog);

    const close = () => { dialog.hidden = true; };
    dialog.querySelector("[data-birthday-cancel]")?.addEventListener("click", close);
    dialog.addEventListener("click", (event) => { if (event.target === dialog) close(); });

    dialog.querySelector("[data-birthday-save]")?.addEventListener("click", () => {
      const month = dialog.querySelector("[data-birthday-month]")?.value || "";
      const day = dialog.querySelector("[data-birthday-day]")?.value || "";
      const error = dialog.querySelector("[data-birthday-error]");
      const test = new Date(Date.UTC(2000, Number(month) - 1, Number(day), 12));
      const valid = test.getUTCMonth() + 1 === Number(month) && test.getUTCDate() === Number(day);
      if (!valid) {
        if (error) error.textContent = "Kies een geldige datum.";
        return;
      }
      writeBirthday(activeEmployeeName, `${month}-${day}`);
      close();
      renderBirthdayControl(activeEmployeeName);
      maybePlayBirthday(activeEmployeeName);
    });

    dialog.querySelector("[data-birthday-remove]")?.addEventListener("click", () => {
      writeBirthday(activeEmployeeName, "");
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
    if (monthSelect) monthSelect.value = month;
    if (daySelect) daySelect.value = day;
    if (error) error.textContent = "";
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

    const stored = readBirthday(name);
    const formatted = formatBirthday(stored);
    button.textContent = formatted ? `🎂 Verjaardag: ${formatted}` : "🎂 Verjaardag instellen";
    button.title = formatted ? "Verjaardag wijzigen" : "Verjaardag instellen";
  }

  async function maybePlayBirthday(name) {
    if (!name) return;
    const birthday = readBirthday(name);
    if (!birthday || birthday !== todayMonthDay()) return;

    const today = amsterdamDateKey();
    const playedKey = `${BIRTHDAY_PLAY_PREFIX}${today}.${nameHash(name)}`;
    try { if (sessionStorage.getItem(playedKey) === "1") return; } catch (_) {}

    const played = await playAutomaticVideo(isBirthdayVideoPath, "birthday");
    if (played) {
      try { sessionStorage.setItem(playedKey, "1"); } catch (_) {}
    }
  }

  function handleEmployeeSelected() {
    const name = selectedEmployeeName();
    if (!name) return;
    activeEmployeeName = name;
    renderBirthdayControl(name);
    maybePlayBirthday(name);
  }

  async function maybePlayPayday() {
    const salary = window.RoosterSalaryPayments;
    if (!salary?.isPaymentDate?.()) return;

    const today = salary.today?.() || amsterdamDateKey();
    const playedKey = `${PAYDAY_PLAY_PREFIX}${today}`;
    try { if (sessionStorage.getItem(playedKey) === "1") return; } catch (_) {}

    const played = await playAutomaticVideo(isPaydayVideoPath, "payday");
    if (played) {
      try { sessionStorage.setItem(playedKey, "1"); } catch (_) {}
    }
  }

  // Verjaardag mag nooit handmatig via het Effecten-menu of de videobibliotheek
  // gestart worden. Alleen maybePlayBirthday krijgt kort toestemming om de
  // verborgen verjaardagvideo programmatisch te openen.
  document.addEventListener("click", (event) => {
    const effect = event.target.closest?.('[data-effect="birthday"]');
    if (effect) {
      event.preventDefault();
      event.stopImmediatePropagation();
      return;
    }

    const video = event.target.closest?.(`[${AUTO_VIDEO_ATTR}="birthday"]`);
    if (video && performance.now() > birthdayVideoAllowedUntil) {
      event.preventDefault();
      event.stopImmediatePropagation();
    }
  }, true);

  const controlObserver = new MutationObserver(protectManualBirthdayControls);
  controlObserver.observe(document.documentElement, { childList: true, subtree: true });
  protectManualBirthdayControls();

  window.addEventListener("rooster-employee-selected", () => requestAnimationFrame(handleEmployeeSelected));
  window.addEventListener("salary-payments-ready", () => window.setTimeout(maybePlayPayday, 250));
  window.addEventListener("rooster-unlocked", (event) => {
    if (event?.detail?.publicPortal) window.setTimeout(maybePlayPayday, 350);
  });

  // Als de openbare startpagina al actief is bij het laden, controleer Payday ook meteen.
  if (document.body.classList.contains("public-portal-mode") && !document.getElementById("app")?.hidden) {
    window.setTimeout(maybePlayPayday, 450);
  }
})();
