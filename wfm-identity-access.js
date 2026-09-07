(() => {
  "use strict";

  const API = "https://roosteroverzicht-rooster-bridge-production.up.railway.app";
  const BINDING_KEY = "rhWfmIdentityBindingV1";
  const encoder = new TextEncoder();
  let activeForm = null;
  let allowedSignature = "";
  let suggestionObserver = null;
  let setupToken = 0;

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

  async function hashName(value) {
    const signature = nameSignature(value);
    if (!signature) return "";
    const digest = await crypto.subtle.digest("SHA-256", encoder.encode(signature));
    return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, "0")).join("");
  }

  function displayEmployeeName(value) {
    const parts = String(value || "").trim().split(/\s+/).filter(Boolean);
    if (parts.length < 2) return parts.join(" ");
    return `${parts.at(-1)} ${parts.slice(0, -1).join(" ")}`.trim();
  }

  function availableMonthKeys() {
    const state = window.RoosterMonthBridge?.getState?.() || {};
    return [...new Set([
      state.activeMonthKey,
      state.currentMonthKey,
      state.coreMonthKey,
      ...(state.availableMonths || [])
    ].filter(value => /^\d{4}-\d{2}$/.test(String(value || ""))))];
  }

  async function findRosterName(rosterHash) {
    for (let attempt = 0; attempt < 50; attempt += 1) {
      for (const monthKey of availableMonthKeys()) {
        const roster = window.RoosterMonthBridge?.getRoster?.(monthKey);
        for (const employee of roster?.employees || []) {
          const name = String(employee?.name || "").trim();
          if (name && await hashName(name) === rosterHash) return name;
        }
      }
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    return "";
  }

  async function resolveIdentity(bindingId, team) {
    const response = await fetch(`${API}/api/team-rooster/identity-resolve`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ bindingId, team }),
      signal: AbortSignal.timeout(20000)
    });
    const data = await response.json().catch(() => null);
    if (response.status === 404) return null;
    if (!response.ok) throw new Error(data?.message || `Railway HTTP ${response.status}`);
    return data;
  }

  function filterSuggestions(form) {
    if (!allowedSignature) return;
    const suggestions = form.querySelector("#permissionNameSuggestions");
    if (!suggestions) return;
    for (const button of suggestions.querySelectorAll(".permission-auth-name-option")) {
      const allowed = nameSignature(button.textContent) === allowedSignature;
      button.hidden = !allowed;
      button.style.display = allowed ? "" : "none";
    }
    const visible = [...suggestions.querySelectorAll(".permission-auth-name-option")].some(button => !button.hidden);
    if (!visible) suggestions.hidden = true;
  }

  async function setupForm(form) {
    const token = ++setupToken;
    activeForm = form;
    allowedSignature = "";
    suggestionObserver?.disconnect();
    suggestionObserver = null;

    let bindingId = "";
    try { bindingId = localStorage.getItem(BINDING_KEY) || ""; } catch (_) {}
    if (!bindingId) return;

    const team = String(document.getElementById("rosterId")?.value || "").trim();
    if (!team) return;

    const error = form.querySelector("#permissionNameError");
    const intro = form.querySelector("p");
    if (error) error.textContent = "WFM-browserkoppeling controleren…";

    try {
      const identity = await resolveIdentity(bindingId, team);
      if (token !== setupToken || !identity?.rosterHash) return;
      const rawName = await findRosterName(identity.rosterHash);
      if (token !== setupToken) return;
      if (!rawName) {
        if (error) error.textContent = "Je gekoppelde WFM-naam staat niet in het huidige roosterbestand.";
        return;
      }

      allowedSignature = nameSignature(rawName);
      if (intro) intro.textContent = "WFM-koppeling gevonden. Alleen jouw eigen roosternaam is beschikbaar.";

      const input = form.querySelector("#permissionNameInput");
      for (let attempt = 0; attempt < 60 && input?.disabled; attempt += 1) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      if (token !== setupToken || !input) return;

      input.value = displayEmployeeName(rawName);
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.focus();
      if (error) error.textContent = "Alleen jouw gekoppelde WFM-naam wordt hieronder getoond.";

      const suggestions = form.querySelector("#permissionNameSuggestions");
      if (suggestions) {
        suggestionObserver = new MutationObserver(() => filterSuggestions(form));
        suggestionObserver.observe(suggestions, { childList: true, subtree: true });
        filterSuggestions(form);
      }
    } catch (err) {
      if (token !== setupToken) return;
      if (error) error.textContent = `WFM-koppeling kon niet worden gecontroleerd: ${err?.message || err}`;
    }
  }

  document.addEventListener("submit", event => {
    const form = event.target;
    if (!(form instanceof HTMLFormElement) || form.id !== "permissionNameForm" || form !== activeForm || !allowedSignature) return;
    const input = form.querySelector("#permissionNameInput");
    if (nameSignature(input?.value) === allowedSignature) return;
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    const error = form.querySelector("#permissionNameError");
    if (error) error.textContent = "Je kunt alleen de naam gebruiken die bij deze WFM-browser is gekoppeld.";
  }, true);

  const observer = new MutationObserver(() => {
    const form = document.getElementById("permissionNameForm");
    if (form && form !== activeForm) setupForm(form);
  });
  observer.observe(document.body, { childList: true, subtree: true });

  const current = document.getElementById("permissionNameForm");
  if (current) setupForm(current);
})();
