(() => {
  "use strict";

  const body = document.body;
  const welcome = document.getElementById("welcomeOverlay");
  const app = document.getElementById("app");
  const originalButton = document.getElementById("continueButton");
  if (!body || !welcome || !app || !originalButton) return;

  body.classList.add("public-portal-mode");
  document.title = "Roosteroverzicht";

  const button = originalButton.cloneNode(true);
  originalButton.replaceWith(button);

  button.addEventListener("click", () => {
    welcome.hidden = true;
    app.hidden = false;
    body.classList.remove("locked");
    requestAnimationFrame(() => {
      window.dispatchEvent(new CustomEvent("rooster-unlocked", { detail: { publicPortal: true } }));
    });
  });
})();