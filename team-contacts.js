(() => {
  "use strict";

  const TIME_ZONE = "Europe/Amsterdam";
  const REFRESH_MS = 60000;
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();

  const app = document.getElementById("app");
  const searchCard = document.querySelector(".search-card");
  const unlockForm = document.getElementById("unlockForm");
  if (!app || !searchCard) return;

  let refreshTimer = null;
  let capturedId = "";
  let capturedPassword = "";
  let contactsLoading = null;
  let contacts = [];
  let emailDomain = "";

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function base64ToBytes(value) {
    const binary = atob(String(value || ""));
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
    return bytes;
  }

  function nameSignature(value) {
    return String(value || "")
      .toLocaleLowerCase("nl-NL")
      .normalize("NFD")
      .replace(/\p{M}/gu, "")
      .replace(/[^\p{L}\p{N}]+/gu, " ")
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .sort((a, b) => a.localeCompare(b, "nl"))
      .join("|");
  }

  function emailFromName(name) {
    const localPart = String(name || "")
      .trim()
      .toLocaleLowerCase("nl-NL")
      .normalize("NFD")
      .replace(/\p{M}/gu, "")
      .replace(/[^a-z0-9-]+/g, ".")
      .replace(/^\.+|\.+$/g, "")
      .replace(/\.{2,}/g, ".");
    return localPart && emailDomain ? `${localPart}@${emailDomain}` : "";
  }

  function amsterdamToday() {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: TIME_ZONE,
      year: "numeric",
      month: "2-digit",
      day: "2-digit"
    }).formatToParts(new Date());
    const get = (type) => parts.find((part) => part.type === type)?.value || "";
    return `${get("year")}-${get("month")}-${get("day")}`;
  }

  function formatTime(value) {
    const text = String(value || "").trim();
    const match = text.match(/(?:T|\s|^)(\d{1,2}):(\d{2})/);
    return match ? `${match[1].padStart(2, "0")}:${match[2]}` : "";
  }

  function secureContactsFromIndex(index) {
    return Array.isArray(index?.teamContacts) ? index.teamContacts
      .map((contact) => ({
        medal: String(contact?.medal || ""),
        role: String(contact?.role || ""),
        name: String(contact?.name || ""),
        showRoster: Boolean(contact?.showRoster)
      }))
      .filter((contact) => contact.role && contact.name) : [];
  }

  async function loadSecureContacts(year) {
    if (contacts.length) return contacts;
    if (contactsLoading) return contactsLoading;
    if (!capturedId || !capturedPassword || !window.crypto?.subtle) return [];

    contactsLoading = (async () => {
      try {
        const response = await fetch(`Roosterindex_${year}.json?v=${Date.now()}`, { cache: "no-store" });
        if (!response.ok) return [];
        const secured = await response.json();
        if (secured?.kind !== "roosterhulp-encrypted-index" || secured?.encrypted !== true || !secured.crypto || !secured.payload) return [];

        const secret = encoder.encode(`${capturedId}\u0000${capturedPassword}`);
        const keyMaterial = await crypto.subtle.importKey("raw", secret, "PBKDF2", false, ["deriveKey"]);
        const key = await crypto.subtle.deriveKey({
          name: "PBKDF2",
          hash: secured.crypto.hash || "SHA-256",
          salt: base64ToBytes(secured.crypto.salt),
          iterations: Number(secured.crypto.iterations) || 250000
        }, keyMaterial, {
          name: "AES-GCM",
          length: Number(secured.crypto.keyLength) || 256
        }, false, ["decrypt"]);

        const plaintext = await crypto.subtle.decrypt({
          name: "AES-GCM",
          iv: base64ToBytes(secured.crypto.iv)
        }, key, base64ToBytes(secured.payload));
        const parsed = JSON.parse(decoder.decode(plaintext));
        if (parsed?.kind !== "roosterhulp-index" || !Array.isArray(parsed.employees)) return [];

        const privateConfig = parsed.privateConfig && typeof parsed.privateConfig === "object" && !Array.isArray(parsed.privateConfig)
          ? parsed.privateConfig
          : {};
        emailDomain = String(privateConfig.organization?.emailDomain || privateConfig.emailDomain || "").trim();
        contacts = secureContactsFromIndex(parsed);
        return contacts;
      } catch (_) {
        return [];
      } finally {
        capturedId = "";
        capturedPassword = "";
      }
    })();

    try {
      return await contactsLoading;
    } finally {
      contactsLoading = null;
    }
  }

  function todayRosterStatus(contact) {
    if (!contact.showRoster) return "";

    const today = amsterdamToday();
    const roster = window.RoosterMonthBridge?.getRoster?.(today.slice(0, 7));
    if (!roster) return "Rooster wordt geladen…";

    const signature = nameSignature(contact.name);
    const employee = (roster.employees || []).find((item) => nameSignature(item?.name) === signature);
    if (!employee) return "Rooster niet gevonden";

    const ranges = (employee.schedules || [])
      .filter((schedule) => String(schedule?.date || "").slice(0, 10) === today)
      .map((schedule) => ({ start: formatTime(schedule.start), end: formatTime(schedule.end) }))
      .filter((schedule) => schedule.start && schedule.end)
      .sort((a, b) => a.start.localeCompare(b.start) || a.end.localeCompare(b.end));

    if (!ranges.length) return "Vandaag niet aanwezig";
    return ranges.map((schedule) => `${schedule.start}–${schedule.end}`).join(", ");
  }

  function contactHtml(contact) {
    const status = todayRosterStatus(contact);
    return `
      <div class="team-contact-row">
        <div class="team-contact-person">
          <span class="team-contact-medal" aria-hidden="true">${escapeHtml(contact.medal)}</span>
          <span class="team-contact-person-text"><strong>${escapeHtml(contact.role)}:</strong> ${escapeHtml(contact.name)}${status ? ` <span class="team-contact-presence">· ${escapeHtml(status)}</span>` : ""}</span>
        </div>
        <div class="team-contact-actions">
          <button class="team-contact-button" type="button" data-contact-action="chat" data-contact-name="${escapeHtml(contact.name)}" title="Open chat in de Teams-app">Stuur Chat</button>
          <button class="team-contact-button" type="button" data-contact-action="email" data-contact-name="${escapeHtml(contact.name)}">Stuur E-Mail</button>
        </div>
      </div>`;
  }

  function bindButtons(bar) {
    bar.querySelectorAll(".team-contact-button").forEach((button) => {
      const email = emailFromName(button.dataset.contactName);
      if (!email) {
        button.disabled = true;
        button.title = "E-mailadres kon niet uit de naam worden opgebouwd.";
        return;
      }

      button.addEventListener("click", () => {
        if (button.dataset.contactAction === "chat") {
          window.location.href = `msteams://teams.microsoft.com/l/chat/0/0?users=${encodeURIComponent(email)}`;
          return;
        }
        window.location.href = `mailto:${email}`;
      });
    });
  }

  function ensureBar() {
    let bar = document.getElementById("teamContactsBar");
    if (!contacts.length) {
      if (bar) bar.hidden = true;
      return bar;
    }

    if (!bar) {
      bar = document.createElement("section");
      bar.id = "teamContactsBar";
      bar.className = "team-contacts-bar";
      bar.setAttribute("aria-label", "Teamleider en seniors");
    }

    bar.innerHTML = contacts.map(contactHtml).join("");
    bindButtons(bar);

    const nextShiftBar = document.getElementById("nextShiftBar");
    const salaryBar = document.getElementById("nextSalaryPaymentBar");
    if (nextShiftBar) nextShiftBar.after(bar);
    else if (salaryBar) salaryBar.after(bar);
    else if (!bar.isConnected) {
      const titleRow = searchCard.querySelector(".roster-title-row");
      const title = searchCard.querySelector(":scope > h1");
      (titleRow || title || searchCard.firstElementChild)?.before(bar);
    }

    return bar;
  }

  function render() {
    if (app.hidden) return;
    const bar = ensureBar();
    if (bar && contacts.length) bar.hidden = false;
  }

  async function start(event) {
    const monthKey = event?.detail?.monthKey || window.RoosterMonthBridge?.getState?.()?.activeMonthKey || amsterdamToday().slice(0, 7);
    const year = Number(String(monthKey).slice(0, 4)) || Number(amsterdamToday().slice(0, 4));
    await loadSecureContacts(year);
    render();
    if (refreshTimer !== null) return;
    refreshTimer = window.setInterval(render, REFRESH_MS);
  }

  document.addEventListener("submit", (event) => {
    if (event.target !== unlockForm) return;
    capturedId = document.getElementById("rosterId")?.value?.trim() || "";
    capturedPassword = document.getElementById("rosterPassword")?.value || "";
  }, true);

  window.addEventListener("rooster-unlocked", start);
  window.addEventListener("rooster-months-updated", render);
  window.addEventListener("rooster-month-changed", render);
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden && !app.hidden) render();
  });
})();
