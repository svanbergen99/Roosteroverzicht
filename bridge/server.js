import http from "node:http";
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

const PORT = Number(process.env.PORT || 8787);
const ALLOWED_ORIGIN = String(process.env.ALLOWED_ORIGIN || "https://svanbergen99.github.io").trim();
const MAX_PUSH_BODY_BYTES = 32 * 1024;
const LIVE_STALE_MS = 20 * 1000;
const COLLECTOR_TOKEN_TTL_MS = 8 * 60 * 60 * 1000;

let latestTrafficSnapshot = null;

function readEnv(name) {
  return String(process.env[name] || "").trim();
}

function configError(message, code = "INVALID_CONFIG") {
  const error = new Error(message);
  error.code = code;
  return error;
}

function getKibanaBaseConfig() {
  const rawConfig = readEnv("KIBANA_CONFIG");
  if (!rawConfig) {
    throw configError("KIBANA_CONFIG ontbreekt.", "NOT_CONFIGURED");
  }

  let parsed;
  try {
    parsed = JSON.parse(rawConfig);
  } catch {
    throw configError("KIBANA_CONFIG bevat geen geldige JSON.");
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw configError("KIBANA_CONFIG moet een JSON-object zijn.");
  }

  const origin = String(parsed.origin || "").trim();
  const space = String(parsed.space || "").trim();
  const dashboardId = String(parsed.dashboardId || "").trim();
  const dashboardVersion = Number(parsed.dashboardVersion);
  const trafficPanelId = String(parsed.trafficPanelId || "").trim();

  if (!origin || !space || !dashboardId || !trafficPanelId) {
    throw configError("KIBANA_CONFIG mist een vereiste instelling.");
  }

  let parsedOrigin;
  try {
    parsedOrigin = new URL(origin);
  } catch {
    throw configError("De Kibana-origin in KIBANA_CONFIG is ongeldig.");
  }

  if (parsedOrigin.protocol !== "https:" || parsedOrigin.pathname !== "/") {
    throw configError("De Kibana-origin moet een HTTPS-origin zonder pad zijn.");
  }

  if (!space.startsWith("/")) {
    throw configError("De Kibana-space in KIBANA_CONFIG is ongeldig.");
  }

  if (!Number.isInteger(dashboardVersion) || dashboardVersion < 1) {
    throw configError("De dashboardversie in KIBANA_CONFIG is ongeldig.");
  }

  return Object.freeze({
    origin: parsedOrigin.origin,
    space,
    dashboardId,
    dashboardVersion,
    trafficPanelId
  });
}

function getKibanaConfig() {
  const base = getKibanaBaseConfig();
  const authorization = readEnv("KIBANA_AUTHORIZATION");

  if (!authorization) {
    throw configError("Bridge is nog niet gekoppeld aan server-side Kibana-authenticatie.", "NOT_CONFIGURED");
  }

  // Alleen expliciet goedgekeurde service-authenticatie ondersteunen.
  // Browsercookies (waaronder sid) worden bewust niet geaccepteerd.
  if (!/^ApiKey\s+\S+/i.test(authorization) && !/^Bearer\s+\S+/i.test(authorization)) {
    throw configError("KIBANA_AUTHORIZATION moet een goedgekeurde ApiKey- of Bearer-header zijn.");
  }

  return Object.freeze({ ...base, authorization });
}

function hasServiceAuthConfig() {
  return Boolean(readEnv("KIBANA_CONFIG") && readEnv("KIBANA_AUTHORIZATION"));
}

function hasPushConfig() {
  return Boolean(readEnv("KIBANA_CONFIG") && readEnv("TRAFFIC_PUSH_KEY"));
}

function hasReadConfig() {
  return Boolean(readEnv("TRAFFIC_READ_KEY"));
}

function safeSecretEqual(expected, supplied) {
  const left = Buffer.from(String(expected || ""));
  const right = Buffer.from(String(supplied || ""));
  return left.length > 0 && left.length === right.length && timingSafeEqual(left, right);
}

function allowedCorsOrigin(origin, allowedOrigin) {
  return Boolean(origin && allowedOrigin && origin === allowedOrigin);
}

function isExtensionOrigin(origin) {
  return /^chrome-extension:\/\/[a-z0-9]+$/i.test(String(origin || ""));
}

function json(res, status, body, origin, allowedOrigin = ALLOWED_ORIGIN) {
  const headers = {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "x-content-type-options": "nosniff",
    "referrer-policy": "no-referrer"
  };

  if (allowedCorsOrigin(origin, allowedOrigin)) {
    headers["access-control-allow-origin"] = origin;
    headers.vary = "Origin";
  }

  res.writeHead(status, headers);
  res.end(JSON.stringify(body));
}

function collectorTokenSignature(payloadPart) {
  return createHmac("sha256", readEnv("TRAFFIC_PUSH_KEY"))
    .update(payloadPart)
    .digest("base64url");
}

function issueCollectorToken() {
  if (!hasPushConfig() || !hasReadConfig()) {
    throw configError("Collector-toegang is nog niet geconfigureerd.", "NOT_CONFIGURED");
  }

  const expiresAt = Date.now() + COLLECTOR_TOKEN_TTL_MS;
  const payload = Buffer.from(JSON.stringify({
    v: 1,
    scope: "traffic-push",
    exp: expiresAt,
    nonce: randomBytes(12).toString("base64url")
  }), "utf8").toString("base64url");

  return {
    token: `${payload}.${collectorTokenSignature(payload)}`,
    expiresAt: new Date(expiresAt).toISOString()
  };
}

function verifyCollectorToken(token) {
  const raw = String(token || "").trim();
  if (!raw || raw.length > 4096 || !hasPushConfig()) return false;

  const parts = raw.split(".");
  if (parts.length !== 2) return false;
  const [payloadPart, signature] = parts;
  if (!payloadPart || !signature) return false;

  const expectedSignature = collectorTokenSignature(payloadPart);
  if (!safeSecretEqual(expectedSignature, signature)) return false;

  try {
    const payload = JSON.parse(Buffer.from(payloadPart, "base64url").toString("utf8"));
    const expiresAt = Number(payload?.exp);
    if (payload?.v !== 1 || payload?.scope !== "traffic-push") return false;
    if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) return false;
    if (expiresAt > Date.now() + COLLECTOR_TOKEN_TTL_MS + 60 * 1000) return false;
    return true;
  } catch {
    return false;
  }
}

function stripMarkdownHeading(markdown) {
  return String(markdown || "")
    .replace(/^\s*#{1,6}\s*/u, "")
    .trim();
}

function findTrafficPanel(dashboard, trafficPanelId) {
  const panels = dashboard?.result?.result?.item?.attributes?.panels;
  if (!Array.isArray(panels)) return null;

  return panels.find((panel) => panel?.panelIndex === trafficPanelId)
    || panels.find((panel) => {
      const markdown = panel?.panelConfig?.savedVis?.params?.markdown;
      return typeof markdown === "string" && /\bTraffic\b/i.test(markdown);
    })
    || null;
}

async function fetchTrafficHeader() {
  const config = getKibanaConfig();
  const url = `${config.origin}${config.space}/api/content_management/rpc/get`;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      authorization: config.authorization,
      "content-type": "application/json",
      "kbn-xsrf": "roosteroverzicht-traffic-bridge"
    },
    body: JSON.stringify({
      contentTypeId: "dashboard",
      id: config.dashboardId,
      version: config.dashboardVersion
    }),
    signal: AbortSignal.timeout(10000)
  });

  if (!response.ok) {
    const error = new Error(`Officiële databron gaf HTTP ${response.status}.`);
    error.code = "UPSTREAM_ERROR";
    throw error;
  }

  const dashboard = await response.json();
  const panel = findTrafficPanel(dashboard, config.trafficPanelId);
  const markdown = panel?.panelConfig?.savedVis?.params?.markdown;

  if (!markdown) {
    const error = new Error("Traffic-paneel is niet gevonden in het officiële dashboard.");
    error.code = "PANEL_NOT_FOUND";
    throw error;
  }

  return {
    trafficHeader: stripMarkdownHeading(markdown),
    dashboardUpdatedAt: dashboard?.result?.result?.item?.updatedAt || null,
    fetchedAt: new Date().toISOString(),
    source: "official-dashboard"
  };
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];

    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > MAX_PUSH_BODY_BYTES) {
        const error = new Error("Traffic snapshot is te groot.");
        error.code = "PAYLOAD_TOO_LARGE";
        reject(error);
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });

    req.on("end", () => {
      try {
        const raw = Buffer.concat(chunks).toString("utf8");
        resolve(JSON.parse(raw || "{}"));
      } catch {
        const error = new Error("Traffic snapshot bevat geen geldige JSON.");
        error.code = "INVALID_JSON";
        reject(error);
      }
    });

    req.on("error", reject);
  });
}

function sanitizeJsonValue(value, depth = 0) {
  if (depth > 6) throw configError("Traffic snapshot is te diep genest.", "INVALID_SNAPSHOT");
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw configError("Traffic snapshot bevat een ongeldig getal.", "INVALID_SNAPSHOT");
    return value;
  }
  if (Array.isArray(value)) {
    if (value.length > 250) throw configError("Traffic snapshot bevat te veel waarden.", "INVALID_SNAPSHOT");
    return value.map((item) => sanitizeJsonValue(item, depth + 1));
  }
  if (typeof value === "object") {
    const result = {};
    const entries = Object.entries(value);
    if (entries.length > 100) throw configError("Traffic snapshot bevat te veel velden.", "INVALID_SNAPSHOT");
    for (const [key, item] of entries) {
      if (["__proto__", "prototype", "constructor"].includes(key)) continue;
      result[key] = sanitizeJsonValue(item, depth + 1);
    }
    return result;
  }
  throw configError("Traffic snapshot bevat een niet-ondersteunde waarde.", "INVALID_SNAPSHOT");
}

function normalizeTrafficSnapshot(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw configError("Traffic snapshot moet een JSON-object zijn.", "INVALID_SNAPSHOT");
  }

  const snapshot = {};

  if (body.trafficHeader !== undefined) {
    const header = String(body.trafficHeader || "").trim();
    if (!header || header.length > 500) {
      throw configError("trafficHeader is leeg of te lang.", "INVALID_SNAPSHOT");
    }
    snapshot.trafficHeader = header;
  }

  if (body.panels !== undefined) {
    if (!body.panels || typeof body.panels !== "object" || Array.isArray(body.panels)) {
      throw configError("panels moet een JSON-object zijn.", "INVALID_SNAPSHOT");
    }
    snapshot.panels = sanitizeJsonValue(body.panels);
  }

  if (!snapshot.trafficHeader && !snapshot.panels) {
    throw configError("Traffic snapshot bevat geen Traffic-data.", "INVALID_SNAPSHOT");
  }

  const capturedAt = body.capturedAt ? new Date(body.capturedAt) : new Date();
  if (Number.isNaN(capturedAt.getTime())) {
    throw configError("capturedAt is ongeldig.", "INVALID_SNAPSHOT");
  }

  snapshot.capturedAt = capturedAt.toISOString();
  snapshot.source = "browser-collector";
  return snapshot;
}

function getPushOrigin() {
  try {
    return getKibanaBaseConfig().origin;
  } catch {
    return "";
  }
}

const server = http.createServer(async (req, res) => {
  const origin = req.headers.origin || "";
  const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
  const pushOrigin = getPushOrigin();

  if (req.method === "OPTIONS") {
    const isPush = url.pathname === "/api/traffic-push";
    const isLiveRead = url.pathname === "/api/traffic-live";
    const isCollectorToken = url.pathname === "/api/traffic-collector-token";
    const pushOriginAllowed = isPush && (allowedCorsOrigin(origin, pushOrigin) || isExtensionOrigin(origin));
    const regularOriginAllowed = (isLiveRead || isCollectorToken) && allowedCorsOrigin(origin, ALLOWED_ORIGIN);

    if (!pushOriginAllowed && !regularOriginAllowed) {
      res.writeHead(403);
      res.end();
      return;
    }

    const allowedHeaders = isPush
      ? "content-type, x-traffic-push-key, x-traffic-collector-token"
      : (isLiveRead || isCollectorToken)
        ? "content-type, x-traffic-read-key"
        : "content-type";

    res.writeHead(204, {
      "access-control-allow-origin": origin,
      "access-control-allow-methods": isPush || isCollectorToken ? "POST, OPTIONS" : "GET, OPTIONS",
      "access-control-allow-headers": allowedHeaders,
      "access-control-max-age": "600",
      vary: "Origin"
    });
    res.end();
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/health") {
    const configured = hasServiceAuthConfig() || hasPushConfig();
    json(res, 200, {
      ok: true,
      configured,
      serviceAuthConfigured: hasServiceAuthConfig(),
      pushConfigured: hasPushConfig(),
      readConfigured: hasReadConfig(),
      hasLiveSnapshot: Boolean(latestTrafficSnapshot),
      service: "roosteroverzicht-traffic-bridge"
    }, origin);
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/traffic-collector-token") {
    if (!hasReadConfig() || !hasPushConfig()) {
      json(res, 503, {
        ok: false,
        code: "COLLECTOR_NOT_CONFIGURED",
        message: "Traffic collector-toegang is nog niet geconfigureerd."
      }, origin);
      return;
    }

    if (!allowedCorsOrigin(origin, ALLOWED_ORIGIN)) {
      json(res, 403, {
        ok: false,
        code: "ORIGIN_DENIED",
        message: "Deze origin mag geen collector starten."
      }, origin);
      return;
    }

    const suppliedReadKey = req.headers["x-traffic-read-key"];
    if (!safeSecretEqual(readEnv("TRAFFIC_READ_KEY"), suppliedReadKey)) {
      json(res, 401, {
        ok: false,
        code: "INVALID_READ_KEY",
        message: "Ongeldige Traffic read key."
      }, origin);
      return;
    }

    try {
      const token = issueCollectorToken();
      json(res, 200, { ok: true, ...token }, origin);
    } catch (error) {
      json(res, 503, {
        ok: false,
        code: error?.code || "COLLECTOR_NOT_CONFIGURED",
        message: error?.message || "Collector-toegang kon niet worden uitgegeven."
      }, origin);
    }
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/traffic-push") {
    if (!hasPushConfig()) {
      json(res, 503, {
        ok: false,
        code: "PUSH_NOT_CONFIGURED",
        message: "Traffic push is nog niet geconfigureerd."
      }, origin, pushOrigin);
      return;
    }

    const suppliedKey = req.headers["x-traffic-push-key"];
    const suppliedCollectorToken = req.headers["x-traffic-collector-token"];
    const pushKeyValid = safeSecretEqual(readEnv("TRAFFIC_PUSH_KEY"), suppliedKey);
    const collectorTokenValid = verifyCollectorToken(suppliedCollectorToken);

    if (!pushKeyValid && !collectorTokenValid) {
      json(res, 401, {
        ok: false,
        code: "INVALID_PUSH_AUTH",
        message: "Ongeldige Traffic push-authenticatie."
      }, origin, isExtensionOrigin(origin) ? origin : pushOrigin);
      return;
    }

    if (pushKeyValid && origin && origin !== pushOrigin) {
      json(res, 403, {
        ok: false,
        code: "ORIGIN_DENIED",
        message: "Deze origin mag geen Traffic-data pushen."
      }, origin, pushOrigin);
      return;
    }

    if (collectorTokenValid && origin && origin !== pushOrigin && !isExtensionOrigin(origin)) {
      json(res, 403, {
        ok: false,
        code: "ORIGIN_DENIED",
        message: "Deze collector-origin wordt niet geaccepteerd."
      }, origin);
      return;
    }

    const responseOrigin = collectorTokenValid && isExtensionOrigin(origin) ? origin : pushOrigin;

    try {
      const body = await readJsonBody(req);
      const snapshot = normalizeTrafficSnapshot(body);
      latestTrafficSnapshot = Object.freeze({
        ...snapshot,
        receivedAt: new Date().toISOString()
      });

      json(res, 202, {
        ok: true,
        receivedAt: latestTrafficSnapshot.receivedAt
      }, origin, responseOrigin);
    } catch (error) {
      const status = error?.code === "PAYLOAD_TOO_LARGE" ? 413 : 400;
      json(res, status, {
        ok: false,
        code: error?.code || "INVALID_SNAPSHOT",
        message: error?.message || "Ongeldige Traffic snapshot"
      }, origin, responseOrigin);
    }
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/traffic-live") {
    if (!hasReadConfig()) {
      json(res, 503, {
        ok: false,
        code: "READ_NOT_CONFIGURED",
        message: "Traffic live read is nog niet geconfigureerd."
      }, origin);
      return;
    }

    if (origin && origin !== ALLOWED_ORIGIN) {
      json(res, 403, {
        ok: false,
        code: "ORIGIN_DENIED",
        message: "Deze origin mag Traffic Live niet uitlezen."
      }, origin);
      return;
    }

    const suppliedReadKey = req.headers["x-traffic-read-key"];
    if (!safeSecretEqual(readEnv("TRAFFIC_READ_KEY"), suppliedReadKey)) {
      json(res, 401, {
        ok: false,
        code: "INVALID_READ_KEY",
        message: "Ongeldige Traffic read key."
      }, origin);
      return;
    }

    if (!latestTrafficSnapshot) {
      json(res, 503, {
        ok: false,
        code: "NO_LIVE_DATA",
        message: "Er is nog geen live Traffic snapshot ontvangen."
      }, origin);
      return;
    }

    const ageMs = Math.max(0, Date.now() - new Date(latestTrafficSnapshot.receivedAt).getTime());
    json(res, 200, {
      ok: true,
      ...latestTrafficSnapshot,
      ageMs,
      stale: ageMs > LIVE_STALE_MS
    }, origin);
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/traffic-header") {
    try {
      const data = await fetchTrafficHeader();
      json(res, 200, { ok: true, ...data }, origin);
    } catch (error) {
      const status = error?.code === "NOT_CONFIGURED" ? 503 : 502;
      json(res, status, {
        ok: false,
        code: error?.code || "BRIDGE_ERROR",
        message: error?.message || "Onbekende bridge-fout"
      }, origin);
    }
    return;
  }

  json(res, 404, { ok: false, message: "Niet gevonden" }, origin);
});

server.listen(PORT, () => {
  console.log(`Traffic bridge luistert op poort ${PORT}`);
});
