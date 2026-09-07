(() => {
  "use strict";

  const PAGE_SOURCE = "roosteroverzicht-traffic-page";
  const EXT_SOURCE = "roosteroverzicht-traffic-extension";
  const phaseOrder = ["idle", "source-starting", "source-waiting", "source-connected", "collected", "sending", "routing", "received"];
  const eventKeys = new Set();
  let extensionSeen = false;

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
    if (!value) return new Intl.DateTimeFormat("nl-NL", { hour:"2-digit", minute:"2-digit", second:"2-digit" }).format(new Date());
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "--:--:--";
    return new Intl.DateTimeFormat("nl-NL", { timeZone:"Europe/Amsterdam", hour:"2-digit", minute:"2-digit", second:"2-digit" }).format(date);
  }

  function setExtension(ok, text) {
    const el = $("extensionState");
    el.classList.toggle("online", Boolean(ok));
    el.classList.toggle("offline", ok === false);
    el.querySelector("span:last-child").textContent = text;
  }

  function phaseIndex(phase) {
    const index = phaseOrder.indexOf(phase);
    return index < 0 ? 0 : index;
  }

  function renderPipeline(status) {
    const phase = String(status?.phase || "idle");
    const idx = phaseIndex(phase);
    const error = status?.status === "error" || phase === "error" || phase === "stopped";

    Object.values(steps).forEach((step) => step.classList.remove("current", "done", "error"));
    if (error) {
      Object.values(steps).forEach((step) => step.classList.add("error"));
    } else {
      if (idx >= phaseIndex("source-starting")) steps.source.classList.add(idx > phaseIndex("source-connected") ? "done" : "current");
      if (idx >= phaseIndex("collected")) steps.collected.classList.add(idx > phaseIndex("collected") ? "done" : "current");
      if (idx >= phaseIndex("sending")) steps.sending.classList.add(idx > phaseIndex("routing") ? "done" : "current");
      if (idx >= phaseIndex("received")) steps.received.classList.add("done");
    }

    $("statusCopy").textContent = status?.message || "Wachten op collectorstatus…";
    const summary = status?.snapshotSummary;
    $("collectedText").textContent = summary
      ? `${summary.totalRecords ?? 0} regels in ${Object.keys(summary.panels || {}).length} datadelen.`
      : "Nog geen snapshot gezien.";

    const fake = status?.receiver === "Fake";
    $("receiverLabel").innerHTML = `KCD Chat Box${fake ? '<span class="fake-tag">(Fake)</span>' : ''}`;
    $("routeValue").innerHTML = status?.receiver
      ? `KCD Chat Box${fake ? '<span class="fake-tag">(Fake)</span>' : ''}`
      : "Nog niet bekend";

    const received = phase === "received" && status?.ok !== false;
    $("receivedText").textContent = received ? "Collector kreeg ontvangstbevestiging." : "Wachten op ACK.";
    const ack = $("ackState");
    ack.classList.toggle("off", !received);
    ack.textContent = received ? "ACK: Ontvangen" : "ACK: wachten";
  }

  function metricCard(label, value, small="") {
    return `<div class="metric"><span>${label}</span><strong>${Number(value || 0).toLocaleString("nl-NL")}</strong>${small ? `<small>${small}</small>` : ""}</div>`;
  }

  function renderSummary(status) {
    const summary = status?.snapshotSummary;
    const panels = summary?.panels || {};
    const el = $("summary");
    if (!summary) {
      el.innerHTML = metricCard("Totaal", 0, "wachten op data");
    } else {
      el.innerHTML = [
        metricCard("Totaal", summary.totalRecords),
        metricCard("Telefonie", panels.telefonie),
        metricCard("Web msg", panels.webMessaging),
        metricCard("Web vandaag", panels.webMessagingVandaag),
        metricCard("Queue status", panels.queueStatus),
        metricCard("E-mail", panels.email)
      ].join("");
    }
    $("trafficHeader").textContent = summary?.trafficHeader || "—";
    $("capturedAt").textContent = fmt(summary?.capturedAt);
    $("collectedAt").textContent = fmt(status?.collectedAt);
    $("sendingAt").textContent = fmt(status?.sendingAt);
    $("receivedAt").textContent = fmt(status?.receivedAt || status?.lastPushAt);
  }

  function escapeHtml(value) {
    return String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");
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
      const body = rows.length
        ? rows.map((row) => `<tr>${keys.map((key) => `<td>${escapeHtml(row?.[key])}</td>`).join("")}</tr>`).join("")
        : `<tr><td colspan="${Math.max(1,keys.length)}">Geen regels</td></tr>`;
      cards.push(`<section class="table-card"><h3>${escapeHtml(name)} · ${rows.length} regels</h3><div class="table-wrap"><table><thead><tr>${keys.map((key) => `<th>${escapeHtml(key)}</th>`).join("")}</tr></thead><tbody>${body}</tbody></table></div></section>`);
    }
    root.innerHTML = cards.length ? cards.join("") : '<div class="empty">Snapshot bevat geen paneelregels.</div>';
  }

  function eventTimestamp(status) {
    const phase = status?.phase;
    if (phase === "received") return status?.receivedAt || status?.lastPushAt;
    if (phase === "sending" || phase === "routing") return status?.sendingAt;
    if (phase === "collected") return status?.collectedAt || status?.snapshotSummary?.capturedAt;
    return null;
  }

  function addEvent(status) {
    const phase = String(status?.phase || status?.status || "status");
    const stamp = eventTimestamp(status) || new Date().toISOString();
    const key = `${phase}|${stamp}|${status?.message || ""}|${status?.receiver || ""}`;
    if (eventKeys.has(key)) return;
    eventKeys.add(key);
    if (eventKeys.size > 150) eventKeys.delete(eventKeys.values().next().value);

    const events = $("events");
    events.querySelector(".empty")?.remove();
    const div = document.createElement("div");
    div.className = `event ${phase}`;
    const fake = status?.receiver === "Fake";
    div.innerHTML = `<time>${timeOnly(stamp)}</time><i></i><div><b>${escapeHtml(status?.message || phase)}${fake ? '<span class="fake-tag"> &lt;Fake&gt;</span>' : ''}</b><span>${escapeHtml(phase)}</span></div>`;
    events.prepend(div);
    while (events.children.length > 100) events.lastElementChild?.remove();
  }

  function applyStatus(status, addToLog=true) {
    if (!status || typeof status !== "object") return;
    extensionSeen = true;
    setExtension(true, "Collector-extensie verbonden");
    renderPipeline(status);
    renderSummary(status);
    renderTables(status.latestSnapshot);
    if (addToLog) addEvent(status);
  }

  function requestStatus() {
    const requestId = `monitor-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    window.postMessage({ source: PAGE_SOURCE, type: "collector-status-request", requestId }, window.location.origin);
  }

  window.addEventListener("message", (event) => {
    if (event.source !== window || event.origin !== window.location.origin) return;
    const message = event.data;
    if (!message || message.source !== EXT_SOURCE) return;
    if (message.type === "collector-ready") {
      extensionSeen = true;
      setExtension(true, "Collector-extensie verbonden");
      requestStatus();
      return;
    }
    if (message.type === "collector-status") {
      applyStatus(message, true);
      return;
    }
    if (message.type === "collector-response" && String(message.requestId || "").startsWith("monitor-")) {
      applyStatus(message, false);
    }
  });

  renderSummary(null);
  renderPipeline({ phase:"idle", message:"Wachten op collectorstatus…" });
  window.setTimeout(() => {
    if (!extensionSeen) setExtension(false, "Collector-extensie niet gevonden");
  }, 2200);
  requestStatus();
  window.setInterval(requestStatus, 2000);
})();
