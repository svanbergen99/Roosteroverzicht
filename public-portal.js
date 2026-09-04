(() => {
  "use strict";

  const body = document.body;
  const welcome = document.getElementById("welcomeOverlay");
  const app = document.getElementById("app");
  const originalButton = document.getElementById("continueButton");
  if (!body || !welcome || !app || !originalButton) return;

  body.classList.add("public-portal-mode");
  document.title = "Roosteroverzicht";

  // Het bestaande KCD/Verder-beeld blijft staan. Kernwaarde.png komt er als
  // tweede kaart direct onder te staan op dezelfde welkomstpagina.
  const welcomeCard = welcome.querySelector(".welcome-card");
  if (welcomeCard) {
    welcome.classList.add("welcome-with-kernwaarde");
    if (!document.getElementById("welcomeKernwaardeImage")) {
      const kernwaarde = document.createElement("img");
      kernwaarde.id = "welcomeKernwaardeImage";
      kernwaarde.className = "welcome-kernwaarde-image";
      kernwaarde.src = "Kernwaarde.png";
      kernwaarde.alt = "Kernwaarden: Plezier, Verbinden en Dynamisch";
      kernwaarde.loading = "eager";
      kernwaarde.decoding = "async";
      welcomeCard.insertAdjacentElement("afterend", kernwaarde);
    }
  }

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