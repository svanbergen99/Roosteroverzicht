(() => {
  "use strict";

  const STANDARD_THEME_NAME = "Standaard";
  const CUSTOM_STYLE_ID = "roosterCustomThemeOverrides";
  const CUSTOM_PROPERTY_PREFIX = "--rooster-theme-";
  const PALETTE = Object.freeze([
    "#FFFFFF", "#E5E7EB", "#9CA3AF", "#374151", "#111827", "#EF4444",
    "#F97316", "#F59E0B", "#EAB308", "#84CC16", "#22C55E", "#10B981",
    "#14B8A6", "#06B6D4", "#0EA5E9", "#3B82F6", "#6366F1", "#8B5CF6",
    "#A855F7", "#D946EF", "#EC4899", "#F43F5E", "#7B2F73", "#C76FBE"
  ]);
  const COLOR_CONTROLS = Object.freeze([
    Object.freeze({ key: "accent", label: "Accentkleur", id: "themeCustomizerAccent" }),
    Object.freeze({ key: "buttons", label: "Knoppen", id: "themeCustomizerButtons" }),
    Object.freeze({ key: "bars", label: "Balken", id: "themeCustomizerBars" }),
    Object.freeze({ key: "text", label: "Tekst", id: "themeCustomizerText" })
  ]);
  const state = { accent: "", buttons: "", bars: "", text: "" };
  const app = document.getElementById("app");
  if (!app) return;

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function emptyDropdown(label, id) {
    return `
      <details class="theme-customizer-dropdown" data-theme-dropdown>
        <summary>${escapeHtml(label)}</summary>
        <div class="theme-customizer-dropdown-body" id="${escapeHtml(id)}" aria-live="polite"></div>
      </details>`;
  }

  function normalizeHex(value) {
    let text = String(value || "").trim().toUpperCase();
    if (!text) return "";
    if (!text.startsWith("#")) text = `#${text}`;
    if (/^#[0-9A-F]{3}$/.test(text)) {
      text = `#${text[1]}${text[1]}${text[2]}${text[2]}${text[3]}${text[3]}`;
    }
    return /^#[0-9A-F]{6}$/.test(text) ? text : "";
  }

  function setStatus(message = "") {
    const status = document.getElementById("themeCustomizerStatus");
    if (status) status.textContent = message;
  }

  function setCurrentTheme(name) {
    const value = String(name || STANDARD_THEME_NAME).trim() || STANDARD_THEME_NAME;
    const current = document.getElementById("themeCustomizerCurrent");
    if (current) current.textContent = value;
  }

  function hasCustomColors() {
    return COLOR_CONTROLS.some(({ key }) => Boolean(state[key]));
  }

  function customStyleText() {
    const chunks = [];
    if (state.accent) {
      chunks.push(`
:root[data-rooster-custom-theme="true"] {
  --accent: ${state.accent} !important;
  --accent-dark: ${state.accent} !important;
  --soft-accent: color-mix(in srgb, ${state.accent} 18%, transparent) !important;
}
:root[data-rooster-custom-theme="true"] input[type="range"] { accent-color: ${state.accent}; }
:root[data-rooster-custom-theme="true"] .schedule-card.today { border-color: ${state.accent} !important; }
:root[data-rooster-custom-theme="true"] .schedule-card.today .schedule-head { background: color-mix(in srgb, ${state.accent} 18%, transparent) !important; }`);
    }
    if (state.buttons) {
      chunks.push(`
:root[data-rooster-custom-theme="true"] .roster-tools button,
:root[data-rooster-custom-theme="true"] .today-workers-button,
:root[data-rooster-custom-theme="true"] .agenda-trigger,
:root[data-rooster-custom-theme="true"] .screenshot-roster-button,
:root[data-rooster-custom-theme="true"] .team-contact-button,
:root[data-rooster-custom-theme="true"] .agenda-help-actions button,
:root[data-rooster-custom-theme="true"] .screenshot-calendar-actions button,
:root[data-rooster-custom-theme="true"] #breakCalculatorForm button {
  background: ${state.buttons} !important;
  border-color: ${state.buttons} !important;
}
:root[data-rooster-custom-theme="true"] .roster-tools button:hover,
:root[data-rooster-custom-theme="true"] .today-workers-button:hover,
:root[data-rooster-custom-theme="true"] .agenda-trigger:hover,
:root[data-rooster-custom-theme="true"] .screenshot-roster-button:hover,
:root[data-rooster-custom-theme="true"] .team-contact-button:hover,
:root[data-rooster-custom-theme="true"] .agenda-help-actions button:hover,
:root[data-rooster-custom-theme="true"] .screenshot-calendar-actions button:hover,
:root[data-rooster-custom-theme="true"] #breakCalculatorForm button:hover {
  background: color-mix(in srgb, ${state.buttons} 86%, black) !important;
}`);
    }
    if (state.bars) {
      chunks.push(`
:root[data-rooster-custom-theme="true"] .next-salary-payment-bar,
:root[data-rooster-custom-theme="true"] .team-contacts-bar,
:root[data-rooster-custom-theme="true"] .traffic-today-bar {
  background: ${state.bars} !important;
  border-color: ${state.bars} !important;
}`);
    }
    if (state.text) {
      chunks.push(`
:root[data-rooster-custom-theme="true"] #app {
  --ink: ${state.text} !important;
  --muted: ${state.text} !important;
  color: ${state.text} !important;
}
:root[data-rooster-custom-theme="true"] .search-card,
:root[data-rooster-custom-theme="true"] .schedule-card,
:root[data-rooster-custom-theme="true"] .schedule-head,
:root[data-rooster-custom-theme="true"] .activity,
:root[data-rooster-custom-theme="true"] .today-worker-row,
:root[data-rooster-custom-theme="true"] .next-salary-payment-bar,
:root[data-rooster-custom-theme="true"] .team-contacts-bar,
:root[data-rooster-custom-theme="true"] .traffic-today-bar,
:root[data-rooster-custom-theme="true"] .external-sites-card,
:root[data-rooster-custom-theme="true"] .external-site-link,
:root[data-rooster-custom-theme="true"] .roster-tools button,
:root[data-rooster-custom-theme="true"] .today-workers-button,
:root[data-rooster-custom-theme="true"] .agenda-trigger,
:root[data-rooster-custom-theme="true"] .screenshot-roster-button,
:root[data-rooster-custom-theme="true"] .team-contact-button,
:root[data-rooster-custom-theme="true"] .agenda-help-actions button,
:root[data-rooster-custom-theme="true"] .screenshot-calendar-actions button,
:root[data-rooster-custom-theme="true"] #breakCalculatorForm button {
  color: ${state.text} !important;
}`);
    }
    return chunks.join("\n");
  }

  function applyCustomColors() {
    let style = document.getElementById(CUSTOM_STYLE_ID);
    if (!hasCustomColors()) {
      style?.remove();
      document.documentElement.removeAttribute("data-rooster-custom-theme");
      setCurrentTheme(STANDARD_THEME_NAME);
      updateReadabilityWarning();
      return;
    }
    if (!style) {
      style = document.createElement("style");
      style.id = CUSTOM_STYLE_ID;
      document.head.appendChild(style);
    }
    style.textContent = customStyleText();
    document.documentElement.dataset.roosterCustomTheme = "true";
    setCurrentTheme("Aangepast");
    updateReadabilityWarning();
  }

  function rgbFromCssColor(value) {
    const probe = document.createElement("span");
    probe.style.color = value;
    probe.style.position = "fixed";
    probe.style.opacity = "0";
    probe.style.pointerEvents = "none";
    document.body.appendChild(probe);
    const color = getComputedStyle(probe).color;
    probe.remove();
    const match = color.match(/rgba?\((\d+(?:\.\d+)?)[,\s]+(\d+(?:\.\d+)?)[,\s]+(\d+(?:\.\d+)?)/i);
    if (!match) return null;
    return [Number(match[1]), Number(match[2]), Number(match[3])];
  }

  function relativeLuminance(rgb) {
    const channels = rgb.map((value) => {
      const x = value / 255;
      return x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
  }

  function contrastRatio(foreground, background) {
    const a = rgbFromCssColor(foreground);
    const b = rgbFromCssColor(background);
    if (!a || !b) return null;
    const l1 = relativeLuminance(a);
    const l2 = relativeLuminance(b);
    const lighter = Math.max(l1, l2);
    const darker = Math.min(l1, l2);
    return (lighter + 0.05) / (darker + 0.05);
  }

  function standardTextColor() {
    const value = getComputedStyle(app).color;
    return value || (document.documentElement.dataset.theme === "dark" ? "#EDF2F7" : "#172033");
  }

  function standardForeground(selector, fallback) {
    const element = document.querySelector(selector);
    return element ? getComputedStyle(element).color || fallback : fallback;
  }

  function standardBackground(selector, fallback) {
    const element = document.querySelector(selector);
    return element ? getComputedStyle(element).backgroundColor || fallback : fallback;
  }

  function updateReadabilityWarning() {
    const warning = document.getElementById("themeCustomizerReadability");
    if (!warning) return;

    const fallbackText = standardTextColor();
    const buttonText = state.text || state.accent || standardForeground(".today-workers-button", fallbackText);
    const barText = state.text || state.accent || standardForeground(".next-salary-payment-bar", fallbackText);
    const buttonBackground = state.buttons || standardBackground(".today-workers-button", document.documentElement.dataset.theme === "dark" ? "#171E29" : "#FFFFFF");
    const barBackground = state.bars || standardBackground(".next-salary-payment-bar", document.documentElement.dataset.theme === "dark" ? "#302633" : "#F4EDF3");
    const buttonRatio = contrastRatio(buttonText, buttonBackground);
    const barRatio = contrastRatio(barText, barBackground);
    const problems = [];
    if (buttonRatio !== null && buttonRatio < 4.5) problems.push("tekst op knoppen");
    if (barRatio !== null && barRatio < 4.5) problems.push("tekst op balken");

    if (!problems.length) {
      warning.hidden = true;
      warning.textContent = "";
      return;
    }
    warning.textContent = `⚠️ Lage leesbaarheid: ${problems.join(" en ")}`;
    warning.hidden = false;
  }

  function updatePickerUI(key) {
    const body = document.querySelector(`[data-color-key="${key}"]`);
    if (!body) return;
    const selected = state[key];
    body.querySelectorAll("[data-theme-color]").forEach((button) => {
      button.classList.toggle("is-selected", normalizeHex(button.dataset.themeColor) === selected);
    });
    const current = body.querySelector("[data-color-current]");
    if (current) current.textContent = selected || "Standaard";
    const hex = body.querySelector("[data-color-hex]");
    if (hex) hex.value = selected;
    const picker = body.querySelector("[data-color-picker]");
    if (picker && selected) picker.value = selected.toLowerCase();
  }

  function setColor(key, value) {
    const color = normalizeHex(value);
    if (!color) return false;
    state[key] = color;
    updatePickerUI(key);
    applyCustomColors();
    return true;
  }

  function colorPickerHtml(key) {
    return `
      <div class="theme-color-picker" data-color-key="${escapeHtml(key)}">
        <div class="theme-color-picker-top">
          <span>Huidige kleur</span>
          <strong data-color-current>Standaard</strong>
        </div>
        <div class="theme-color-swatches" aria-label="Snelle kleuren">
          ${PALETTE.map((color) => `<button class="theme-color-swatch" type="button" data-theme-color="${color}" title="${color}" aria-label="Kies ${color}" style="--swatch:${color}"></button>`).join("")}
        </div>
        <div class="theme-color-custom">
          <label class="theme-color-native">
            <span>🎨 Kies zelf een kleur</span>
            <input type="color" data-color-picker value="#7b2f73" aria-label="Kies zelf een kleur">
          </label>
          <label class="theme-color-hex-label">
            <span>HEX</span>
            <input class="theme-color-hex" type="text" data-color-hex inputmode="text" maxlength="7" placeholder="#RRGGBB" aria-label="HEX kleurcode">
          </label>
        </div>
      </div>`;
  }

  function populateColorControls(shell) {
    COLOR_CONTROLS.forEach(({ key, id }) => {
      const body = shell.querySelector(`#${id}`);
      if (!body) return;
      body.innerHTML = colorPickerHtml(key);

      body.querySelectorAll("[data-theme-color]").forEach((button) => {
        button.addEventListener("click", () => setColor(key, button.dataset.themeColor));
      });
      body.querySelector("[data-color-picker]")?.addEventListener("input", (event) => {
        setColor(key, event.currentTarget.value);
      });
      const hex = body.querySelector("[data-color-hex]");
      const applyHex = () => {
        const color = normalizeHex(hex?.value);
        if (!color) {
          hex?.classList.add("is-invalid");
          return;
        }
        hex.classList.remove("is-invalid");
        setColor(key, color);
      };
      hex?.addEventListener("change", applyHex);
      hex?.addEventListener("keydown", (event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          applyHex();
        }
      });
    });
  }

  function resetPickerUI() {
    COLOR_CONTROLS.forEach(({ key }) => updatePickerUI(key));
  }

  function resetToStandard() {
    Object.keys(state).forEach((key) => { state[key] = ""; });
    const root = document.documentElement;
    [...root.style]
      .filter((property) => property.startsWith(CUSTOM_PROPERTY_PREFIX))
      .forEach((property) => root.style.removeProperty(property));
    document.getElementById(CUSTOM_STYLE_ID)?.remove();
    root.removeAttribute("data-rooster-custom-theme");
    resetPickerUI();
    setCurrentTheme(STANDARD_THEME_NAME);
    setStatus("Standaardthema hersteld.");
    updateReadabilityWarning();
    window.dispatchEvent(new CustomEvent("rooster-theme-standard-restored"));
  }

  function closePanel() {
    const panel = document.getElementById("themeCustomizerPanel");
    const button = document.getElementById("themeCustomizerButton");
    if (!panel || !button) return;
    panel.hidden = true;
    button.setAttribute("aria-expanded", "false");
  }

  function togglePanel() {
    const panel = document.getElementById("themeCustomizerPanel");
    const button = document.getElementById("themeCustomizerButton");
    if (!panel || !button) return;
    const open = panel.hidden;
    panel.hidden = !open;
    button.setAttribute("aria-expanded", String(open));
    if (open) {
      setStatus("");
      updateReadabilityWarning();
    }
  }

  function ensureCustomizer() {
    let shell = document.getElementById("themeCustomizerShell");
    if (shell) return shell;

    shell = document.createElement("div");
    shell.id = "themeCustomizerShell";
    shell.className = "theme-customizer-shell";
    shell.innerHTML = `
      <button class="theme-customizer-button" id="themeCustomizerButton" type="button" aria-expanded="false" aria-controls="themeCustomizerPanel">Thema Kiezen</button>
      <section class="theme-customizer-panel" id="themeCustomizerPanel" aria-label="Thema kiezen" hidden>
        <div class="theme-customizer-head">
          <div>
            <strong>Thema kiezen</strong>
            <span>Huidig thema: <b id="themeCustomizerCurrent">${STANDARD_THEME_NAME}</b></span>
          </div>
          <button class="theme-customizer-close" id="themeCustomizerClose" type="button" aria-label="Thema menu sluiten">×</button>
        </div>

        <button class="theme-customizer-reset" id="themeCustomizerReset" type="button">Terug naar standaard</button>
        <p class="theme-readability-warning" id="themeCustomizerReadability" hidden></p>

        <div class="theme-customizer-options">
          ${emptyDropdown("Favorieten", "themeCustomizerFavorites")}
          ${emptyDropdown("Snel keuze", "themeCustomizerQuickChoices")}
          ${COLOR_CONTROLS.map(({ label, id }) => emptyDropdown(label, id)).join("")}
        </div>

        <div class="theme-customizer-save">
          <label for="themeCustomizerName">Naam van je thema</label>
          <div class="theme-customizer-save-row">
            <input id="themeCustomizerName" type="text" autocomplete="off" placeholder="Bijv. Mijn paarse thema">
            <button id="themeCustomizerSave" type="button" disabled title="Gedeeld opslaan wordt in een volgende stap gekoppeld.">Sla op in favorieten</button>
          </div>
        </div>
        <p class="theme-customizer-status" id="themeCustomizerStatus" aria-live="polite"></p>
      </section>`;

    app.appendChild(shell);
    populateColorControls(shell);

    shell.querySelector("#themeCustomizerButton")?.addEventListener("click", togglePanel);
    shell.querySelector("#themeCustomizerClose")?.addEventListener("click", closePanel);
    shell.querySelector("#themeCustomizerReset")?.addEventListener("click", resetToStandard);

    shell.querySelectorAll("[data-theme-dropdown]").forEach((details) => {
      details.addEventListener("toggle", () => {
        if (!details.open) return;
        shell.querySelectorAll("[data-theme-dropdown]").forEach((other) => {
          if (other !== details) other.open = false;
        });
      });
    });

    document.addEventListener("click", (event) => {
      if (!shell.contains(event.target)) closePanel();
    });
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape") closePanel();
    });

    return shell;
  }

  window.RoosterThemeCustomizer = Object.freeze({
    standardThemeName: STANDARD_THEME_NAME,
    resetToStandard,
    setCurrentTheme,
    setColor
  });

  ensureCustomizer();
  new MutationObserver(() => updateReadabilityWarning())
    .observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
})();
