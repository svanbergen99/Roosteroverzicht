(() => {
  "use strict";

  const PAGE_SOURCE = "roosteroverzicht-traffic-page";
  const EXT_SOURCE = "roosteroverzicht-traffic-extension";
  let extensionSeen = false;
  let monitorSeen = false;

  const $ = (id) => document.getElementById(id);
  const steps = {
    source: $("stepSource"),
    collected: $("stepCollected"),
    sending: $("stepSending"),
    received: $("stepReceived")
  };

  function fmt(value) {
    if (!value) return "—";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return String(value);
    return new Intl.DateTimeFormat("nl-NL", {
      timeZone: "Europe/Amsterdam",
      day: "2-digit", month: "2-digit", year: "numeric",
      hour: "2-digit", minute: "2-digit", second: "2-digit"
    }).format(date);
  }

  function timeOnly(value) {
    const date = value ? new Date(value) : new Date();
    if (Number.isNaN(date.getTime())) return "--:--:--";
    return new Intl.DateTimeFormat("nl-NL", {
      timeZone:"Europe/Amsterdam", hour:"2-digit", minute:"2-digit", second:"2-digit"
    }).format(date);
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function setExtension(ok, text) {
    const el = $("extensionState");
    el.classList.toggle("online", Boolean(ok));
    el.classList.toggle("offline", ok === false);
    el.querySelector("span:last-child").textContent = text;
  }

  function latestEvent(state) {
    const events = Array.isArray(state?.events) ? state.events : [];
    return events.at(-1) || null;
  }

  function findEvent(state, step) {
    const events = Array.isArray(state?.events) ? state.events : [];
    return [...events].reverse().find((event) => event?.step === step) || null;
  }

  function setStep(step, mode) {
    step.classList.remove("current", "done", "error");
    if (mode) step.classList.add(mode);
  }

  function renderPipeline(state) {
    const collectorState = String(state?.collectorState || "idle");
    const error = ["error", "stopped"].includes(collectorState);
    const sourceReady = Boolean(state?.sourceConnectedAt);
    const collected = Boolean(state?.lastSnapshotAt);
    const sending = Boolean(state?.chatBoxAttempted || state?.fakeFallbackUsed || state?.receiver);
    const received = Boolean(state?.lastDeliveryAt);

    if (error) {
      Object.values(steps).forEach((step) => setStep(step, "error"));
    } else {
      setStep(steps.source, sourceReady ? "done" : (collectorState === "starting" || collectorState === "waiting" ? "current" : null));
      setStep(steps.collected, collected ? (sending ? "done" : "current") : null);
      setStep(steps.sending, sending ? (received ? "done" : "current") : null);
      setStep(steps.received, received ? "done" : null);
    }

    const event = latestEvent(state);
    $("statusCopy").textContent = event?.message || `Collectorstatus: ${collectorState}`;

    const summary = state?.snapshotSummary;
    $("collectedText").textContent = summary
      ? `${summary.totalRows ?? 0} regels over ${Object.keys(summary.panelCounts || {}).length} panelgroepen.`
      : "Nog geen snapshot gezien.";

    const fake = state?.receiver === "Fake";
    $("receiverLabel").innerHTML = `KCD Chat Box${fake ? '<span class="fake-tag">(Fake)</span>' : ''}`;
    $("routeValue").innerHTML = state?.receiver
      ? `KCD Chat Box${fake ? '<span class="fake-tag">(Fake)</span>' : ''}`
      : "Nog niet bekend";

    $("receivedText").textContent = received
      ? "Collector kreeg de gewone ontvangstbevestiging."
      : "Wachten op ACK.";
    const ack = $("ackState");
    ack.classList.toggle("off", !received);
    ack.textContent = received ? "ACK: Ontvangen" : "ACK: wachten";
  }

  function metricCard(label, value, small="") {
    return `<div class="metric"><span>${label}</span><strong>${Number(value || 0).toLocaleString("nl-NL")}</strong>${small ? `<small>${escapeHtml(small)}</small>` : ""}</div>`;
  }

  function renderSummary(state) {
    const summary = state?.snapshotSummary;
    const panels = summary?.panelCounts || {};
    const el = $("summary");
    if (!summary) {
      el.innerHTML = metricCard("Totaal", 0, "wachten op data");
    } else {
      el.innerHTML = [
        metricCard("Totaal", summary.totalRows),
        metricCard("Telefonie", panels.telefonie),
        metricCard("Web msg", panels.webMessaging),
        metricCard("Web vandaag", panels.webMessagingVandaag),
        metricCard("Queue status", panels.queueStatus),
        metricCard("E-mail", panels.email)
      ].join("");
    }

    const sendEvent = findEvent(state, "send-chatbox") || findEvent(state, "chatbox-intercept") || findEvent(state, "fake-box");
    $("trafficHeader").textContent = summary?.trafficHeader || "—";
    $("capturedAt").textContent = fmt(summary?.capturedAt);
    $("collectedAt").textContent = fmt(state?.lastSnapshotAt);
    $("sendingAt").textContent = fmt(sendEvent?.at);
    $("receivedAt").textContent = fmt(state?.lastDeliveryAt);
  }

  function renderTables(snapshot) {
    const root = $("tables");
    const panels = snapshot?.panels;
    if (!panels || typeof panels !== "object") {
      root.innerHTML = '<div class="empty">Zodra de collector een snapshot verzamelt verschijnt de inhoud hier.</div>';
      return;
    }

    const cards = [];
    for (const [name, rows] of Object.entries(panels)) {
      if (!Array.isArray(rows)) continue;
      const keys = [...new Set(rows.flatMap((row) => row && typeof row === "object" ? Object.keys(row) : []))];
      const header = keys.length ? keys.map((key) => `<th>${escapeHtml(key)}</th>`).join("") : "<th>waarde</th>";
      const body = rows.length
        ? rows.map((row) => `<tr>${keys.map((key) => `<td>${escapeHtml(row?.[key])}</td>`).join("")}</tr>`).join("")
        : `<tr><td colspan="${Math.max(1,keys.length)}">Geen regels</td></tr>`;
      cards.push(`<section class="table-card"><h3>${escapeHtml(name)} · ${rows.length} regels</h3><div class="table-wrap"><table><thead><tr>${header}</tr></thead><tbody>${body}</tbody></table></div></section>`);
    }
    root.innerHTML = cards.length ? cards.join("") : '<div class="empty">Snapshot bevat geen paneelregels.</div>';
  }

  function eventClass(event) {
    if (event?.status === "error") return "error";
    if (event?.status === "fallback") return "routing";
    if (event?.step === "snapshot-collected") return "collected";
    if (["send-chatbox", "chatbox-intercept"].includes(event?.step)) return "sending";
    if (["fake-box", "chatbox-ack", "delivery-complete"].includes(event?.step)) return "received";
    if (event?.status === "stopped") return "stopped";
    return "status";
  }

  function renderEvents(state) {
    const root = $("events");
    const events = Array.isArray(state?.events) ? [...state.events].reverse() : [];
    if (!events.length) {
      root.innerHTML = '<div class="empty">Nog geen gebeurtenissen ontvangen.</div>';
      return;
    }
    root.innerHTML = events.slice(0, 100).map((event) => {
      const fake = event?.step === "fake-box" || /<Fake>|Fake KCD Chat Box/i.test(String(event?.message || ""));
      const reason = event?.reason ? `<span>Reden: ${escapeHtml(event.reason)}</span>` : `<span>${escapeHtml(event?.step || "status")}</span>`;
      return `<div class="event ${eventClass(event)}"><time>${timeOnly(event?.at)}</time><i></i><div><b>${escapeHtml(event?.message || event?.step || "Gebeurtenis")}${fake ? '<span class="fake-tag"> &lt;Fake&gt;</span>' : ''}</b>${reason}</div></div>`;
    }).join("");
  }

  function applyState(state) {
    if (!state || typeof state !== "object") return;
    monitorSeen = true;
    extensionSeen = true;
    setExtension(true, "Collector-monitor verbonden");
    renderPipeline(state);
    renderSummary(state);
    renderTables(state.latestSnapshot);
    renderEvents(state);
  }

  function requestMonitor() {
    const requestId = `monitor-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    window.postMessage({ source: PAGE_SOURCE, type: "collector-monitor-request", requestId }, window.location.origin);
  }

  window.addEventListener("message", (event) => {
    if (event.source !== window || event.origin !== window.location.origin) return;
    const message = event.data;
    if (!message || message.source !== EXT_SOURCE) return;

    if (message.type === "collector-ready") {
      extensionSeen = true;
      setExtension(true, "Collector-extensie verbonden");
      requestMonitor();
      return;
    }

    if (message.type === "collector-monitor-state") {
      applyState(message.state);
      return;
    }

    if (message.type === "collector-monitor-response" && String(message.requestId || "").startsWith("monitor-")) {
      if (message.ok && message.state) applyState(message.state);
      return;
    }
  });

  renderSummary(null);
  renderPipeline({ collectorState:"idle" });
  window.setTimeout(() => {
    if (!extensionSeen) setExtension(false, "Collector-extensie niet gevonden");
    else if (!monitorSeen) setExtension(false, "Extensie gevonden, monitorfunctie nog niet actief — herlaad extensie v0.1.3");
  }, 2500);

  requestMonitor();
  window.setInterval(requestMonitor, 2000);
})();
