(() => {
  "use strict";

  const RAILWAY_API = "https://roosteroverzicht-rooster-bridge-production.up.railway.app";
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();
  const permissions = [];
  window.RoosterAccessPermissions = permissions;
  window.RoosterPrivateConfig = null;

  let bypassNextPasswordSubmit = false;
  let permissionsLoading = null;
  let privateConfigLoaded = false;
  let activeTeam = "";
  let activePassword = "";

  function base64ToBytes(value) {
    const binary = atob(String(value || ""));
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
    return bytes;
  }

  function currentAmsterdamYear() {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Europe/Amsterdam",
      year: "numeric"
    }).formatToParts(new Date());
    return parts.find((part) => part.type === "year")?.value || String(new Date().getFullYear());
  }

  function normalizePermissions(value) {
    if (!Array.isArray(value)) return [];
    const isHash = (input) => /^[a-f0-9]{64}$/i.test(String(input || ""));
    return value.map((permission) => {
      const next = {};
      if (isHash(permission?.loginHash)) next.loginHash = String(permission.loginHash);
      if (isHash(permission?.rosterHash)) next.rosterHash = String(permission.rosterHash);
      if (permission?.scope === "all") next.scope = "all";
      return next;
    }).filter((permission) => permission.loginHash || permission.rosterHash);
  }

  function publishPrivateConfig(value) {
    const config = value && typeof value === "object" && !Array.isArray(value) ? value : {};
    window.RoosterPrivateConfig = config;
    privateConfigLoaded = true;
    window.dispatchEvent(new CustomEvent("rooster-private-config-ready", {
      detail: { config }
    }));
  }

  async function loadEncryptedPermissions(team, password) {
    const year = currentAmsterdamYear();
    const response = await fetch(`Roosterindex_${year}.json?v=${Date.now()}`, { cache: "no-store" });
    if (!response.ok) throw new Error(`Roosterindex_${year}.json kon niet worden geladen.`);

    const secured = await response.json();
    if (secured?.kind !== "roosterhulp-encrypted-index" || secured?.encrypted !== true || !secured.crypto || !secured.payload) {
      throw new Error("Het beveiligde roosterbestand heeft niet het verwachte formaat.");
    }

    const secret = encoder.encode(`${team}\u0000${password}`);
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
    if (parsed?.kind !== "roosterhulp-index" || !Array.isArray(parsed.employees)) {
      throw new Error("De ontsleutelde roosterinhoud is ongeldig.");
    }

    publishPrivateConfig(parsed.privateConfig);
    const next = normalizePermissions(parsed.accessPermissions);
    permissions.splice(0, permissions.length, ...next);
    return permissions;
  }

  async function ensurePermissions(team, password) {
    if (privateConfigLoaded) return permissions;
    if (permissionsLoading) return permissionsLoading;
    permissionsLoading = loadEncryptedPermissions(team, password);
    try {
      return await permissionsLoading;
    } finally {
      permissionsLoading = null;
    }
  }

  async function createPersonalScanJob(bindingId) {
    const id = String(bindingId || "").trim();
    if (!/^[A-Za-z0-9_-]{32,160}$/.test(id)) throw new Error("Deze browser is nog niet aan WFM gekoppeld.");

    const body = { bindingId: id };
    if (activeTeam && activePassword) {
      body.team = activeTeam;
      body.password = activePassword;
    }

    const response = await fetch(`${RAILWAY_API}/api/personal-roster/start`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(30000)
    });
    const data = await response.json().catch(() => null);
    if (!response.ok) throw new Error(data?.message || `Railway HTTP ${response.status}`);
    if (!data?.scanToken) throw new Error("Railway gaf geen persoonlijke scanopdracht terug.");
    return data;
  }

  window.RoosterAccessSession = Object.freeze({
    createPersonalScanJob,
    hasCredentials: () => Boolean(activeTeam && activePassword)
  });

  document.addEventListener("submit", async (event) => {
    const form = event.target;
    if (!(form instanceof HTMLFormElement) || form.id !== "permissionPasswordForm") return;

    if (bypassNextPasswordSubmit) {
      bypassNextPasswordSubmit = false;
      return;
    }

    const passwordInput = form.querySelector("#permissionPasswordInput");
    const submitButton = form.querySelector("#permissionUnlockButton");
    const authError = form.querySelector("#permissionAuthError");
    const team = form.querySelector("strong")?.textContent?.trim() || "";
    const password = passwordInput?.value || "";
    if (!team || !password) return;

    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    if (submitButton) submitButton.disabled = true;
    if (authError) authError.textContent = "";

    try {
      await ensurePermissions(team, password);
      activeTeam = team;
      activePassword = password;
      bypassNextPasswordSubmit = true;
      form.requestSubmit();
    } catch (_) {
      activeTeam = "";
      activePassword = "";
      if (submitButton) submitButton.disabled = false;
      if (authError) authError.textContent = "Het Team Wachtwoord is niet juist voor het geselecteerde team.";
      if (passwordInput) {
        passwordInput.value = "";
        passwordInput.focus();
      }
    }
  }, true);
})();