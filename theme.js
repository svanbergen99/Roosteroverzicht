(() => {
  "use strict";

  const STORAGE_KEY = "rooster-theme";
  const app = document.getElementById("app");
  if (!app) return;

  function storedTheme() {
    try {
      const value = localStorage.getItem(STORAGE_KEY);
      return value === "dark" || value === "light" ? value : null;
    } catch (_) {
      return null;
    }
  }

  function preferredTheme() {
    return window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }

  function saveTheme(theme) {
    try { localStorage.setItem(STORAGE_KEY, theme); } catch (_) {}
  }

  const button = document.createElement("button");
  button.type = "button";
  button.className = "theme-toggle";
  button.setAttribute("aria-label", "Wissel tussen lichte en donkere modus");
  app.appendChild(button);

  function applyTheme(theme, persist = false) {
    document.documentElement.dataset.theme = theme;
    button.textContent = theme === "dark" ? "Lichte modus" : "Donkere modus";
    button.setAttribute("aria-pressed", String(theme === "dark"));
    if (persist) saveTheme(theme);
  }

  applyTheme(storedTheme() || preferredTheme());

  button.addEventListener("click", () => {
    const next = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
    applyTheme(next, true);
  });

  const media = window.matchMedia?.("(prefers-color-scheme: dark)");
  media?.addEventListener?.("change", (event) => {
    if (!storedTheme()) applyTheme(event.matches ? "dark" : "light");
  });
})();
