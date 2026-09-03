(() => {
  "use strict";

  const SYSTEM_KEY = "collega-portal-system-theme";
  const PRESET_STYLE_ID = "quickThemePresetOverrides";

  const p = (name, background, buttons, bars, text, buttonText = text) =>
    Object.freeze({ name, background, buttons, bars, text, buttonText });

  const GROUPS = Object.freeze([
    Object.freeze({
      id: "mono",
      label: "Monochroom",
      description: "Eén basiskleur in lichte en donkere tinten.",
      presets: Object.freeze([
        p("Leisteen", "#F1F5F9", "#94A3B8", "#475569", "#0F172A"),
        p("Oceaanblauw", "#EFF6FF", "#93C5FD", "#2563EB", "#172554"),
        p("Bosgroen", "#F0FDF4", "#86EFAC", "#16A34A", "#14532D"),
        p("Koningspaars", "#FAF5FF", "#D8B4FE", "#9333EA", "#3B0764"),
        p("Rozenrood", "#FFF1F2", "#FDA4AF", "#E11D48", "#4C0519"),
        p("Warm oranje", "#FFF7ED", "#FDBA74", "#EA580C", "#431407"),
        p("Helder cyaan", "#ECFEFF", "#67E8F9", "#0891B2", "#164E63"),
        p("Diep teal", "#F0FDFA", "#5EEAD4", "#0D9488", "#134E4A"),
        p("Aards bruin", "#FAF7F2", "#D6BFA8", "#8B5E3C", "#3F2A1D"),
        p("Grafiet", "#F4F4F5", "#A1A1AA", "#3F3F46", "#18181B")
      ])
    }),
    Object.freeze({
      id: "analogous",
      label: "Analoog",
      description: "Kleuren die naast elkaar liggen op de kleurencirkel.",
      presets: Object.freeze([
        p("Blauw · Cyaan · Teal", "#ECFEFF", "#67E8F9", "#0D9488", "#164E63"),
        p("Indigo · Blauw · Cyaan", "#EEF2FF", "#93C5FD", "#4F46E5", "#1E1B4B"),
        p("Paars · Indigo · Blauw", "#F5F3FF", "#C4B5FD", "#6366F1", "#312E81"),
        p("Roze · Paars · Indigo", "#FDF4FF", "#F0ABFC", "#8B5CF6", "#4A044E"),
        p("Rood · Roze · Paars", "#FFF1F2", "#FDA4AF", "#C026D3", "#500724"),
        p("Oranje · Rood · Roze", "#FFF7ED", "#FDBA74", "#F43F5E", "#4C0519"),
        p("Geel · Oranje · Rood", "#FFFBEB", "#FCD34D", "#F97316", "#451A03"),
        p("Lime · Geel · Oranje", "#F7FEE7", "#BEF264", "#EAB308", "#365314"),
        p("Groen · Lime · Geel", "#F0FDF4", "#86EFAC", "#84CC16", "#14532D"),
        p("Teal · Groen · Lime", "#F0FDFA", "#5EEAD4", "#22C55E", "#134E4A")
      ])
    }),
    Object.freeze({
      id: "complementary",
      label: "Complementair",
      description: "Tegenovergestelde kleuren voor maximaal contrast.",
      presets: Object.freeze([
        p("Blauw ↔ Oranje", "#EFF6FF", "#FDBA74", "#2563EB", "#172554"),
        p("Paars ↔ Geel", "#FAF5FF", "#FDE68A", "#9333EA", "#3B0764"),
        p("Rood ↔ Cyaan", "#FFF1F2", "#67E8F9", "#E11D48", "#4C0519"),
        p("Groen ↔ Magenta", "#F0FDF4", "#F0ABFC", "#16A34A", "#14532D"),
        p("Teal ↔ Koraal", "#F0FDFA", "#FDA4AF", "#0D9488", "#134E4A"),
        p("Marine ↔ Goud", "#F8FAFC", "#FCD34D", "#1E3A8A", "#172554"),
        p("Indigo ↔ Amber", "#EEF2FF", "#FBBF24", "#4F46E5", "#312E81"),
        p("Cyaan ↔ Vermiljoen", "#ECFEFF", "#FDBA74", "#0891B2", "#164E63"),
        p("Lime ↔ Violet", "#F7FEE7", "#D8B4FE", "#65A30D", "#365314"),
        p("Roze ↔ Smaragd", "#FDF2F8", "#6EE7B7", "#DB2777", "#500724")
      ])
    }),
    Object.freeze({
      id: "triadic",
      label: "Triadisch",
      description: "Drie kleuren op gelijke afstand van elkaar.",
      presets: Object.freeze([
        p("Rood · Geel · Blauw", "#FEF2F2", "#FDE047", "#2563EB", "#450A0A"),
        p("Oranje · Groen · Paars", "#FFF7ED", "#86EFAC", "#9333EA", "#431407"),
        p("Cyaan · Magenta · Geel", "#ECFEFF", "#F0ABFC", "#EAB308", "#164E63"),
        p("Koraal · Teal · Violet", "#FFF1F2", "#5EEAD4", "#8B5CF6", "#4C0519"),
        p("Amber · Smaragd · Indigo", "#FFFBEB", "#6EE7B7", "#4F46E5", "#451A03"),
        p("Roze · Lime · Blauw", "#FDF2F8", "#BEF264", "#3B82F6", "#500724"),
        p("Terracotta · Salie · Lavendel", "#FFF7ED", "#A7F3D0", "#A78BFA", "#442B1E"),
        p("Bordeaux · Goud · Petrol", "#FFF1F2", "#FCD34D", "#0F766E", "#4C0519"),
        p("Perzik · Mint · Lila", "#FFF7ED", "#A7F3D0", "#C4B5FD", "#431407"),
        p("Kersen · Turquoise · Citroen", "#FFF1F2", "#5EEAD4", "#FDE047", "#4C0519")
      ])
    }),
    Object.freeze({
      id: "pastel",
      label: "Pastel / Zacht",
      description: "Gedempte, lichte kleuren voor rust en wellness.",
      presets: Object.freeze([
        p("Poederroze", "#FFF7FA", "#FBCFE8", "#F9A8D4", "#4A2438"),
        p("Babyblauw", "#F5FAFF", "#BFDBFE", "#93C5FD", "#243B53"),
        p("Mint", "#F3FFF9", "#BBF7D0", "#86EFAC", "#244734"),
        p("Lavendel", "#FBF8FF", "#DDD6FE", "#C4B5FD", "#40345F"),
        p("Perzik", "#FFF9F4", "#FED7AA", "#FDBA74", "#55351F"),
        p("Botergeel", "#FFFDF4", "#FEF3C7", "#FDE68A", "#51461F"),
        p("Salie", "#F7FAF7", "#D1E7D3", "#A7C7A9", "#31443A"),
        p("Zacht aqua", "#F2FCFC", "#CFFAFE", "#A5F3FC", "#234750"),
        p("Roze · Lila", "#FFF7FC", "#FBCFE8", "#DDD6FE", "#51334B"),
        p("Wellness mix", "#FBFAF7", "#DDE7DC", "#D8CFC4", "#3F423D")
      ])
    })
  ]);

  const DIRECT = Object.freeze([
    p("Klassiek & Betrouwbaar", "#FFFFFF", "#FDBA74", "#1E3A8A", "#172033"),
    p("Clean Professional", "#FFFFFF", "#BFDBFE", "#2563EB", "#172033"),
    p("Corporate", "#FAF7F0", "#E5C36A", "#14532D", "#18362A"),
    p("Modern", "#F7F5F2", "#D6C3A5", "#292524", "#292524"),
    p("Cyberpunk", "#080B0F", "#B6FF3B", "#00A8FF", "#F8FAFC", "#07110A"),
    p("Focal Accent", "#F4F4F5", "#FDE047", "#EF4444", "#18181B"),
    p("Biologisch", "#FFF9ED", "#E9B38C", "#6B7B3D", "#40372B"),
    p("Rustgevende Beauty", "#FFF8FA", "#F8C8D8", "#A8BFA3", "#3E4A42"),
    p("Wellness", "#FAF8F4", "#D6CEC4", "#6F9D8C", "#39433E"),
    p("Energiek", "#FFF7FB", "#FB7185", "#6D28D9", "#351047", "#FFFFFF"),
    p("Industrieel", "#F8FAFC", "#FDE047", "#27272A", "#18181B"),
    p("Zomers", "#F5FEFF", "#FDBA74", "#14B8A6", "#164E63"),
    p("WhatsApp-stijl", "#F5F7F8", "#D9FDD3", "#25D366", "#1F2C34"),
    p("Discord-stijl", "#1E1F22", "#5865F2", "#2B2D31", "#F2F3F5", "#FFFFFF"),
    p("Intercom-stijl", "#FFFFFF", "#BFDBFE", "#286EFA", "#1F2937"),
    p("Messenger-stijl", "#F7F7F8", "#D4D4D8", "#18181B", "#18181B"),
    p("Instagram-stijl", "#FFF9FC", "#F0ABFC", "#EC4899", "#3F1739")
  ]);

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function swatches(preset) {
    return `<span class="quick-theme-swatches" aria-hidden="true">
      <i style="--quick-swatch:${preset.background}"></i>
      <i style="--quick-swatch:${preset.buttons}"></i>
      <i style="--quick-swatch:${preset.bars}"></i>
    </span>`;
  }

  function setThemeLabel(name) {
    const current = document.getElementById("themeCustomizerCurrent");
    if (current) current.textContent = name;
  }

  function setStatus(message) {
    const status = document.getElementById("themeCustomizerStatus");
    if (status) status.textContent = message;
  }

  function setControl(key, color) {
    const input = document.querySelector(`[data-color-key="${key}"] [data-color-hex]`);
    if (!input) return false;
    input.value = color;
    input.dispatchEvent(new Event("change", { bubbles: true }));
    return true;
  }

  function applyButtonContrast(preset) {
    let style = document.getElementById(PRESET_STYLE_ID);
    if (!style) {
      style = document.createElement("style");
      style.id = PRESET_STYLE_ID;
      document.head.appendChild(style);
    }
    style.textContent = `
:root[data-rooster-custom-theme="true"] .external-site-link,
:root[data-rooster-custom-theme="true"] .public-salary-button,
:root[data-rooster-custom-theme="true"] .public-salary-history {
  color: ${preset.buttonText} !important;
}
:root[data-rooster-custom-theme="true"] .public-salary-button small {
  color: color-mix(in srgb, ${preset.buttonText} 74%, transparent) !important;
}`;
  }

  function disableSystemMode() {
    try { localStorage.removeItem(SYSTEM_KEY); } catch (_) {}
  }

  function applyPreset(preset) {
    disableSystemMode();
    setControl("accent", preset.background);
    setControl("buttons", preset.buttons);
    setControl("bars", preset.bars);
    setControl("text", preset.text);
    applyButtonContrast(preset);
    setThemeLabel(preset.name);
    setStatus(`Snelkeuze toegepast: ${preset.name}.`);
  }

  function preferredMode() {
    return window.matchMedia?.("(prefers-color-scheme: dark)")?.matches ? "dark" : "light";
  }

  function syncSystemMode() {
    const mode = preferredMode();
    document.documentElement.dataset.theme = mode;
    const toggle = document.querySelector(".theme-toggle");
    if (toggle) {
      toggle.textContent = mode === "dark" ? "Lichte modus" : "Donkere modus";
      toggle.setAttribute("aria-pressed", String(mode === "dark"));
    }
    setThemeLabel("Systeem-afhankelijk");
  }

  function enableSystemMode() {
    document.getElementById("themeCustomizerReset")?.click();
    document.getElementById(PRESET_STYLE_ID)?.remove();
    try {
      localStorage.removeItem("rooster-theme");
      localStorage.setItem(SYSTEM_KEY, "true");
    } catch (_) {}
    syncSystemMode();
    setStatus("Systeem-afhankelijk thema actief.");
  }

  function groupHtml(group) {
    return `
      <div class="quick-theme-group" data-quick-theme-group="${escapeHtml(group.id)}">
        <div class="quick-theme-group-copy">
          <strong>${escapeHtml(group.label)}</strong>
          <span>${escapeHtml(group.description)}</span>
        </div>
        <select class="quick-theme-select" data-quick-theme-select="${escapeHtml(group.id)}" aria-label="${escapeHtml(group.label)} snelkeuze">
          <option value="">Kies uit 10 combinaties…</option>
          ${group.presets.map((preset, index) => `<option value="${index}">${escapeHtml(preset.name)}</option>`).join("")}
        </select>
        <div class="quick-theme-preview" data-quick-theme-preview="${escapeHtml(group.id)}" hidden></div>
      </div>`;
  }

  function directHtml(preset, index) {
    return `<button class="quick-theme-preset" type="button" data-quick-direct="${index}">
      <span>${escapeHtml(preset.name)}</span>
      ${swatches(preset)}
    </button>`;
  }

  function render(root) {
    root.innerHTML = `
      <div class="quick-theme-library">
        <button class="quick-theme-system" type="button" data-quick-system>
          <span><strong>Systeem-afhankelijk thema</strong><small>Schakelt automatisch mee met de instellingen van je apparaat.</small></span>
          <span aria-hidden="true">◐</span>
        </button>

        <div class="quick-theme-theory">
          ${GROUPS.map(groupHtml).join("")}
        </div>

        <div class="quick-theme-direct-head">
          <strong>Vooraf samengestelde stijlen</strong>
          <span>Direct toepassen met één klik.</span>
        </div>
        <div class="quick-theme-direct-list">
          ${DIRECT.map(directHtml).join("")}
        </div>
      </div>`;

    root.querySelector("[data-quick-system]")?.addEventListener("click", enableSystemMode);

    GROUPS.forEach((group) => {
      const select = root.querySelector(`[data-quick-theme-select="${group.id}"]`);
      const preview = root.querySelector(`[data-quick-theme-preview="${group.id}"]`);
      select?.addEventListener("change", () => {
        const index = Number(select.value);
        const preset = Number.isInteger(index) && select.value !== "" ? group.presets[index] : null;
        if (!preset) {
          if (preview) preview.hidden = true;
          return;
        }
        if (preview) {
          preview.hidden = false;
          preview.innerHTML = `<span>${escapeHtml(preset.name)}</span>${swatches(preset)}`;
        }
        applyPreset(preset);
      });
    });

    root.querySelectorAll("[data-quick-direct]").forEach((button) => {
      button.addEventListener("click", () => {
        const preset = DIRECT[Number(button.dataset.quickDirect)];
        if (preset) applyPreset(preset);
      });
    });
  }

  function init() {
    const root = document.getElementById("themeCustomizerQuickChoices");
    if (!root) return false;
    if (root.dataset.quickThemesReady === "true") return true;
    root.dataset.quickThemesReady = "true";
    render(root);

    document.querySelector(".theme-toggle")?.addEventListener("click", disableSystemMode, true);
    document.getElementById("themeCustomizerReset")?.addEventListener("click", () => {
      document.getElementById(PRESET_STYLE_ID)?.remove();
    });

    try {
      if (localStorage.getItem(SYSTEM_KEY) === "true") syncSystemMode();
    } catch (_) {}
    return true;
  }

  const media = window.matchMedia?.("(prefers-color-scheme: dark)");
  media?.addEventListener?.("change", () => {
    try {
      if (localStorage.getItem(SYSTEM_KEY) === "true") syncSystemMode();
    } catch (_) {}
  });

  if (!init()) {
    let attempts = 0;
    const timer = window.setInterval(() => {
      attempts += 1;
      if (init() || attempts >= 50) window.clearInterval(timer);
    }, 80);
  }
})();
