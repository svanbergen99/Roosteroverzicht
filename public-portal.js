(() => {
  "use strict";

  const body = document.body;
  const welcome = document.getElementById("welcomeOverlay");
  const app = document.getElementById("app");
  const originalButton = document.getElementById("continueButton");

  if (!body || !welcome || !app || !originalButton) return;

  body.classList.add("public-portal-mode");
  document.title = "Roosteroverzicht";

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

  // Vervang de knop zodat eventuele oude handlers nooit kunnen blijven hangen.
  const button = originalButton.cloneNode(true);
  originalButton.replaceWith(button);
  button.textContent = "Verder";

  function openPublicPortal() {
    welcome.hidden = true;
    app.hidden = false;
    body.classList.remove("locked", "roster-access-active", "roster-person-selected", "roster-login-active");
    body.classList.add("public-portal-mode");

    window.dispatchEvent(new CustomEvent("public-portal-ready", {
      detail: { publicPortal: true }
    }));

    // Tijdelijke compatibiliteit voor bestaande openbare modules die nog op
    // dit oude start-event luisteren. Dit voert geen login of ontsleuteling uit.
    window.dispatchEvent(new CustomEvent("rooster-unlocked", {
      detail: { publicPortal: true, noAuthentication: true }
    }));
  }

  button.addEventListener("click", (event) => {
    event.preventDefault();
    openPublicPortal();
  });
})();
