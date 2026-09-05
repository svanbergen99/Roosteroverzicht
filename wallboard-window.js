(() => {
  "use strict";

  const WALLBOARD_HOST = "achmea-production-1-a3srealtime-eu-west-1-prod.kb.eu-west-1.aws.found.io";
  const WALLBOARD_DASHBOARD_ID = "731a7b2c-c25f-4ff6-a032-5f62ef6d2272";
  const EMBED_URL = "https://achmea-production-1-a3srealtime-eu-west-1-prod.kb.eu-west-1.aws.found.io/s/centraal-beheer/app/dashboards#/view/731a7b2c-c25f-4ff6-a032-5f62ef6d2272?embed=true&_g=()&show-top-menu=true&show-query-input=true&show-time-filter=true";
  const STYLE_ID = "roosterWallboardEmbedStyle";
  const DIALOG_ID = "roosterWallboardEmbed";

  function isWallboardLink(anchor) {
    if (!(anchor instanceof HTMLAnchorElement)) return false;
    try {
      const url = new URL(anchor.href, window.location.href);
      return url.hostname === WALLBOARD_HOST && url.href.includes(WALLBOARD_DASHBOARD_ID);
    } catch (_) {
      return false;
    }
  }

  function ensureStyle() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
      #${DIALOG_ID} {
        position: fixed;
        inset: 0;
        z-index: 2147482500;
        display: grid;
        place-items: center;
        padding: 20px;
        background: rgba(15, 23, 42, .58);
        backdrop-filter: blur(3px);
      }
      #${DIALOG_ID}[hidden] { display: none !important; }
      #${DIALOG_ID} .wallboard-embed-shell {
        width: min(1500px, 96vw);
        height: min(900px, 92vh);
        display: grid;
        grid-template-rows: auto 1fr;
        overflow: hidden;
        border: 1px solid rgba(255,255,255,.18);
        border-radius: 16px;
        background: #111827;
        box-shadow: 0 26px 70px rgba(0,0,0,.42);
      }
      #${DIALOG_ID} .wallboard-embed-head {
        min-height: 52px;
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        padding: 10px 12px 10px 16px;
        background: #111827;
        color: #f8fafc;
        font: 700 14px/1.2 "Segoe UI", Arial, sans-serif;
      }
      #${DIALOG_ID} .wallboard-embed-head small {
        margin-left: 8px;
        color: #94a3b8;
        font-weight: 600;
      }
      #${DIALOG_ID} .wallboard-embed-close {
        width: 34px;
        height: 34px;
        border: 0;
        border-radius: 9px;
        background: rgba(255,255,255,.1);
        color: #fff;
        font-size: 24px;
        line-height: 1;
        cursor: pointer;
      }
      #${DIALOG_ID} .wallboard-embed-close:hover { background: rgba(255,255,255,.18); }
      #${DIALOG_ID} iframe {
        width: 100%;
        height: 100%;
        border: 0;
        background: #fff;
      }
      @media (max-width: 700px) {
        #${DIALOG_ID} { padding: 8px; }
        #${DIALOG_ID} .wallboard-embed-shell { width: 100%; height: 94vh; border-radius: 12px; }
      }
    `;
    document.head.appendChild(style);
  }

  function closeWallboard() {
    const dialog = document.getElementById(DIALOG_ID);
    if (!dialog) return;
    dialog.hidden = true;
    const iframe = dialog.querySelector("iframe");
    if (iframe) iframe.src = "about:blank";
  }

  function ensureDialog() {
    ensureStyle();
    let dialog = document.getElementById(DIALOG_ID);
    if (dialog) return dialog;

    dialog = document.createElement("div");
    dialog.id = DIALOG_ID;
    dialog.hidden = true;
    dialog.setAttribute("role", "dialog");
    dialog.setAttribute("aria-modal", "true");
    dialog.setAttribute("aria-label", "Wall board");
    dialog.innerHTML = `
      <section class="wallboard-embed-shell">
        <header class="wallboard-embed-head">
          <div>Wall board <small>Kibana embed-test</small></div>
          <button class="wallboard-embed-close" type="button" aria-label="Wall board sluiten">×</button>
        </header>
        <iframe title="Kibana Wall board" allow="fullscreen"></iframe>
      </section>
    `;

    dialog.querySelector(".wallboard-embed-close")?.addEventListener("click", closeWallboard);
    dialog.addEventListener("click", (event) => {
      if (event.target === dialog) closeWallboard();
    });
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && !dialog.hidden) closeWallboard();
    });

    document.body.appendChild(dialog);
    return dialog;
  }

  function openWallboardEmbed() {
    const dialog = ensureDialog();
    const iframe = dialog.querySelector("iframe");
    if (!iframe) return false;
    iframe.src = EMBED_URL;
    dialog.hidden = false;
    dialog.querySelector(".wallboard-embed-close")?.focus();
    return true;
  }

  document.addEventListener("click", (event) => {
    if (event.defaultPrevented || event.button !== 0) return;
    const anchor = event.target?.closest?.("a[href]");
    if (!isWallboardLink(anchor)) return;

    event.preventDefault();
    openWallboardEmbed();
  }, true);

  window.RoosterWallboardWindow = Object.freeze({
    open: openWallboardEmbed,
    close: closeWallboard,
    getEmbedUrl: () => EMBED_URL
  });
})();