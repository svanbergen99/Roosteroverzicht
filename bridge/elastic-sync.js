import "./server.js";

const PORT = Number(process.env.PORT || 8787);
const POLL_MS = 5000;
const INDEX_NAME = "traffic-live";
const LOCAL_LIVE_URL = `http://127.0.0.1:${PORT}/api/traffic-live`;

const endpoint = String(process.env.ELASTICSEARCH_ENDPOINT || "").trim().replace(/\/$/, "");
const apiKey = String(process.env.ELASTICSEARCH_API_KEY || "").trim();
const readKey = String(process.env.TRAFFIC_READ_KEY || "").trim();

let prepared = false;
let preparePromise = null;
let lastReceivedAt = "";
let previousDocumentIds = new Set();

function number(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function reachability(item) {
  const answered = number(item?.answeredTime);
  const abandoned = number(item?.abandonedTime);
  if (answered === null || abandoned === null) return null;
  const total = answered + abandoned;
  return total > 0 ? (answered / total) * 100 : null;
}

function asaSeconds(item) {
  const answered = number(item?.answered) ?? number(item?.answeredTime);
  const speedAnswered = number(item?.speedAnswered) ?? 0;
  const speedFlowOut = number(item?.speedFlowOut) ?? 0;
  if (!answered || answered <= 0) return null;
  return (speedAnswered + speedFlowOut) / answered;
}

function compact(object) {
  return Object.fromEntries(
    Object.entries(object).filter(([, value]) => value !== null && value !== undefined)
  );
}

function makeDocumentId(channel, queue) {
  return `live-${Buffer.from(`${channel}\u0000${queue}`, "utf8").toString("base64url")}`;
}

function addRows(documents, channel, rows, capturedAt, mapper) {
  if (!Array.isArray(rows)) return;

  for (const row of rows) {
    const queue = String(row?.queue || "").trim();
    if (!queue) continue;

    documents.push({
      id: makeDocumentId(channel, queue),
      source: compact({
        "@timestamp": capturedAt,
        channel,
        queue,
        source: "browser-collector",
        ...mapper(row)
      })
    });
  }
}

function snapshotDocuments(snapshot) {
  const capturedAt = new Date(snapshot?.capturedAt || snapshot?.receivedAt || Date.now()).toISOString();
  const panels = snapshot?.panels || {};
  const documents = [];

  addRows(documents, "Telefonie", panels.telefonie, capturedAt, (row) => ({
    offered: number(row?.aangeboden),
    answered: number(row?.answered),
    waiting: number(row?.wachtenden),
    longest_wait_seconds: number(row?.langsteWachttijd),
    asa_seconds: asaSeconds(row),
    reachability: reachability(row)
  }));

  addRows(documents, "Web Messaging - nu", panels.webMessaging, capturedAt, (row) => ({
    waiting: number(row?.wachtenden),
    longest_wait_seconds: number(row?.langsteWachttijd)
  }));

  addRows(documents, "Web Messaging - vandaag", panels.webMessagingVandaag, capturedAt, (row) => ({
    offered: number(row?.aangeboden),
    answered: number(row?.beantwoord),
    waiting: number(row?.wachtenden),
    longest_wait_seconds: number(row?.langsteWachttijd),
    reachability: reachability(row)
  }));

  addRows(documents, "Queue Status", panels.queueStatus, capturedAt, (row) => ({
    available: number(row?.beschikbaar),
    logged_in: number(row?.ingelogd),
    pause: number(row?.pauze)
  }));

  addRows(documents, "E-mail", panels.email, capturedAt, (row) => ({
    open_stock: number(row?.voorraad),
    longest_wait_seconds: number(row?.langsteWachttijd)
  }));

  return documents;
}

async function elasticRequest(path, options = {}) {
  if (!endpoint || !apiKey) {
    throw new Error("ELASTICSEARCH_ENDPOINT of ELASTICSEARCH_API_KEY ontbreekt.");
  }

  const headers = {
    authorization: `ApiKey ${apiKey}`,
    ...(options.headers || {})
  };

  return fetch(`${endpoint}${path}`, {
    ...options,
    headers,
    signal: AbortSignal.timeout(10000)
  });
}

async function prepareIndex() {
  if (prepared) return;
  if (preparePromise) return preparePromise;

  preparePromise = (async () => {
    const response = await elasticRequest(`/${encodeURIComponent(INDEX_NAME)}/_delete_by_query?conflicts=proceed&refresh=true`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ query: { match_all: {} } })
    });

    if (!response.ok && response.status !== 404) {
      const text = await response.text().catch(() => "");
      throw new Error(`traffic-live opschonen gaf HTTP ${response.status}${text ? `: ${text.slice(0, 300)}` : ""}`);
    }

    previousDocumentIds = new Set();
    prepared = true;
    console.log("[elastic-sync] traffic-live is klaar voor live data.");
  })();

  try {
    await preparePromise;
  } finally {
    preparePromise = null;
  }
}

async function writeSnapshot(snapshot) {
  const documents = snapshotDocuments(snapshot);
  if (!documents.length) return;

  await prepareIndex();

  const currentIds = new Set(documents.map((document) => document.id));
  const lines = [];

  for (const id of previousDocumentIds) {
    if (!currentIds.has(id)) {
      lines.push(JSON.stringify({ delete: { _index: INDEX_NAME, _id: id } }));
    }
  }

  for (const document of documents) {
    lines.push(JSON.stringify({ index: { _index: INDEX_NAME, _id: document.id } }));
    lines.push(JSON.stringify(document.source));
  }

  const response = await elasticRequest("/_bulk", {
    method: "POST",
    headers: { "content-type": "application/x-ndjson" },
    body: `${lines.join("\n")}\n`
  });

  const result = await response.json().catch(() => null);
  if (!response.ok || result?.errors) {
    const failed = Array.isArray(result?.items)
      ? result.items.find((item) => item?.index?.error || item?.delete?.error)
      : null;
    throw new Error(`Elasticsearch bulk-write mislukt${failed ? `: ${JSON.stringify(failed).slice(0, 500)}` : ` (HTTP ${response.status})`}`);
  }

  previousDocumentIds = currentIds;
  console.log(`[elastic-sync] ${documents.length} live regels bijgewerkt (${snapshot.receivedAt || snapshot.capturedAt || "onbekend"}).`);
}

async function pollOnce() {
  if (!endpoint || !apiKey || !readKey) return;

  const response = await fetch(LOCAL_LIVE_URL, {
    headers: { "x-traffic-read-key": readKey },
    signal: AbortSignal.timeout(5000)
  });

  if (response.status === 503) return;
  if (!response.ok) throw new Error(`Lokale Traffic Live gaf HTTP ${response.status}.`);

  const snapshot = await response.json();
  const receivedAt = String(snapshot?.receivedAt || "");
  if (!receivedAt || receivedAt === lastReceivedAt) return;

  await writeSnapshot(snapshot);
  lastReceivedAt = receivedAt;
}

async function loop() {
  try {
    await pollOnce();
  } catch (error) {
    console.error("[elastic-sync]", error?.message || error);
  } finally {
    setTimeout(loop, POLL_MS).unref();
  }
}

setTimeout(loop, 1500).unref();
