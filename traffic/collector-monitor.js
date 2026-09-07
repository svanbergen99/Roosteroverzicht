(() => {
  "use strict";

  const PAGE_SOURCE = "roosteroverzicht-traffic-page";
  const EXT_SOURCE = "roosteroverzicht-traffic-extension";
  let lastState = null;
  let extensionSeenAt = 0;

  const $ = (id) => document.getElementById(id);

  function fmtTime(value) {
    if (!value) return "—";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "—";
    return new Intl.DateTimeFormat("nl-NL", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit"
    }).format(date);
  }

  function yesNo(id, value, warn = false) {
    const el = $(id);
    if (!el) return;
    el.textContent = value ? "Ja" : "Nee";
    el.dataset.yes = value ? "true" : "false";
    el.dataset.warn = warn && value ? "true" : "false";
  }

  function setFlow(id, state) {
    const el = $(id);
    if (el) el.dataset.state = state || "waiting";
  }

  function stateLabel(value) {
    return ({
      idle: "Idle",
      starting: "Starten",
      waiting: "Wachten op data",
      active: "Actief",
      stopped: "Gestopt",
      error: "Fout"
    })[value] || value || "Onbekend";
  }

  function renderTimeline(events) {
    const root = $("timeline");
    if (!root) return;
    if (!Array.isArray(events) || !events.length) {
      root.innerHTML = '<div class="empty">Wachten op Collector-events…</div>';
      return;
    }

    root.innerHTML = events.slice().reverse().map((event) => `
      <div class="event" data-status="${escapeHtml(event.status || "")}">
        <div class="event-time">${fmtTime(event.at)}</div>
        <div class="event-dot"></div>
        <div>
          <strong>${escapeHtml(event.step || "collector")}</strong>
          <p>${escapeHtml(event.message || "")}${event.reason ? `<br><span>Reden: ${escapeHtml(event.reason)}</span>` : ""}</p>
        </div>
      </div>
    `).join("");
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function render(state) {
    if (!state || typeof state !== "object") return;
    lastState = state;

    const summary = state.snapshotSummary || {};
    const counts = summary.panelCounts || {};
    const totalRows = Number(summary.totalRows) || 0;

    $("collectorState").textContent = stateLabel(state.collectorState);
    $("collectorStarted").textContent = state.startedAt ? `Gestart ${fmtTime(state.startedAt)}` : "Nog niet gestart";
    $("sourceState").textContent = state.sourceConnectedAt ? "Verbonden" : "Niet verbonden";
    $("sourceTime").textContent = state.sourceConnectedAt ? fmtTime(state.sourceConnectedAt) : "—";
    $("snapshotRows").textContent = `${totalRows} regels`;
    $("snapshotTime").textContent = state.lastSnapshotAt ? fmtTime(state.lastSnapshotAt) : "—";

    const receiver = state.receiver || "Nog geen";
    const receiverEl = $("actualReceiver");
    receiverEl.textContent = receiver === "Fake" ? "Fake KCD Chat Box" : receiver === "ChatBox" ? "KCD Chat Box" : receiver;
    receiverEl.dataset.fake = receiver === "Fake" ? "true" : receiver === "ChatBox" ? "false" : "";
    $("deliveryTime").textContent = state.lastDeliveryAt ? fmtTime(state.lastDeliveryAt) : "—";

    $("countTelefonie").textContent = counts.telefonie ?? 0;
    $("countWebMessaging").textContent = counts.webMessaging ?? 0;
    $("countWebMessagingVandaag").textContent = counts.webMessagingVandaag ?? 0;
    $("countQueueStatus").textContent = counts.queueStatus ?? 0;
    $("countEmail").textContent = counts.email ?? 0;
    $("trafficHeader").textContent = summary.trafficHeader || "—";
    $("snapshotBadge").textContent = state.lastSnapshotAt ? `Snapshot ${fmtTime(state.lastSnapshotAt)}` : "Geen snapshot";

    yesNo("chatBoxConfigured", Boolean(state.chatBoxConfigured));
    yesNo("chatBoxAttempted", Boolean(state.chatBoxAttempted));
    yesNo("fakeFallbackUsed", Boolean(state.fakeFallbackUsed), true);

    setFlow("flowSource", state.sourceConnectedAt ? "ok" : state.startedAt ? "active" : "waiting");
    $("sourceFlowText").textContent = state.sourceConnectedAt ? `Verbonden ${fmtTime(state.sourceConnectedAt)}` : state.startedAt ? "Bron wordt geopend" : "Wachten op verbinding";

    setFlow("flowCollect", state.lastSnapshotAt ? "ok" : state.sourceConnectedAt ? "active" : "waiting");
    $("collectFlowText").textContent = state.lastSnapshotAt ? `${totalRows} regels verzameld` : state.sourceConnectedAt ? "Wachten op snapshot" : "Nog niets verzameld";

    if (receiver === "Fake") {
      setFlow("flowReceiver", "fallback");
      $("receiverFlowText").textContent = "Ontvangen <Fake>";
      $("fakeUrlTag").hidden = false;
    } else if (receiver === "ChatBox") {
      setFlow("flowReceiver", "ok");
      $("receiverFlowText").textContent = "Ontvangen <ChatBox>";
      $("fakeUrlTag").hidden = true;
    } else if (state.chatBoxAttempted) {
      setFlow("flowReceiver", "active");
      $("receiverFlowText").textContent = "Verzending bezig";
    } else {
      setFlow("flowReceiver", "waiting");
      $("receiverFlowText").textContent = "Wachten op verzending";
      $("fakeUrlTag").hidden = false;
    }

    if (state.lastDeliveryAt) {
      setFlow("flowAck", "ok");
      $("ackFlowText").textContent = `ACK ontvangen ${fmtTime(state.lastDeliveryAt)}`;
    } else {
      setFlow("flowAck", "waiting");
      $("ackFlowText").textContent = "Nog geen ACK";
    }

    renderTimeline(state.events);
    $("rawSnapshot").textContent = state.latestSnapshot
      ? JSON.stringify(state.latestSnapshot, null, 2)
      : "Nog geen snapshot ontvangen.";
  }

  function requestMonitor() {
    const requestId = crypto.randomUUID?.() || `${Date.now()}-${Math.random()}`;
    window.postMessage({
      source: PAGE_SOURCE,
      type: "collector-monitor-request",
      requestId
    }, window.location.origin);
  }

  function markExtensionOnline() {
    extensionSeenAt = Date.now();
    const box = $("extensionConnection");
    box.dataset.state = "online";
    $("extensionConnectionText").textContent = "Collector-extensie verbonden";
  }

  function monitorExtensionHeartbeat() {
    const age = Date.now() - extensionSeenAt;
    if (!extensionSeenAt || age > 7000) {
      const box = $("extensionConnection");
      box.dataset.state = "error";
      $("extensionConnectionText").textContent = "Extensie niet verbonden / herladen";
    }
  }

  window.addEventListener("message", (event) => {
    if (event.source !== window || event.origin !== window.location.origin) return;
    const message = event.data;
    if (!message || message.source !== EXT_SOURCE) return;

    if (["collector-ready", "collector-monitor-response", "collector-monitor-state", "collector-status"].includes(message.type)) {
      markExtensionOnline();
    }

    if (message.type === "collector-monitor-response" && message.ok && message.state) {
      render(message.state);
    }

    if (message.type === "collector-monitor-state" && message.state) {
      render(message.state);
    }
  });

  $("refreshButton")?.addEventListener("click", requestMonitor);
  $("copyRawButton")?.addEventListener("click", async () => {
    const raw = lastState?.latestSnapshot ? JSON.stringify(lastState.latestSnapshot, null, 2) : "";
    if (!raw) return;
    try {
      await navigator.clipboard.writeText(raw);
      $("copyRawButton").textContent = "Gekopieerd ✓";
      window.setTimeout(() => { $("copyRawButton").textContent = "Kopieer JSON"; }, 1400);
    } catch (_) {}
  });

  requestMonitor();
  window.setTimeout(requestMonitor, 500);
  window.setInterval(requestMonitor, 2500);
  window.setInterval(monitorExtensionHeartbeat, 2500);
})();
