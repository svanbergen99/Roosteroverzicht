import http from "node:http";

const PORT = Number(process.env.PORT || 8787);
const ALLOWED_ORIGIN = String(process.env.ALLOWED_ORIGIN || "https://svanbergen99.github.io").trim();

const REQUIRED_KIBANA_ENV = Object.freeze([
  "KIBANA_ORIGIN",
  "KIBANA_SPACE",
  "KIBANA_DASHBOARD_ID",
  "KIBANA_DASHBOARD_VERSION",
  "KIBANA_TRAFFIC_PANEL_ID",
  "KIBANA_AUTHORIZATION"
]);

function readEnv(name) {
  return String(process.env[name] || "").trim();
}

function missingKibanaConfig() {
  return REQUIRED_KIBANA_ENV.filter((name) => !readEnv(name));
}

function getKibanaConfig() {
  const missing = missingKibanaConfig();
  if (missing.length) {
    const error = new Error("Bridge is nog niet gekoppeld aan de officiële databron.");
    error.code = "NOT_CONFIGURED";
    throw error;
  }

  const origin = readEnv("KIBANA_ORIGIN");
  const space = readEnv("KIBANA_SPACE");
  const dashboardId = readEnv("KIBANA_DASHBOARD_ID");
  const dashboardVersion = Number(readEnv("KIBANA_DASHBOARD_VERSION"));
  const trafficPanelId = readEnv("KIBANA_TRAFFIC_PANEL_ID");
  const authorization = readEnv("KIBANA_AUTHORIZATION");

  let parsedOrigin;
  try {
    parsedOrigin = new URL(origin);
  } catch {
    const error = new Error("KIBANA_ORIGIN is ongeldig geconfigureerd.");
    error.code = "INVALID_CONFIG";
    throw error;
  }

  if (parsedOrigin.protocol !== "https:" || parsedOrigin.pathname !== "/") {
    const error = new Error("KIBANA_ORIGIN moet een HTTPS-origin zonder pad zijn.");
    error.code = "INVALID_CONFIG";
    throw error;
  }

  if (!space.startsWith("/")) {
    const error = new Error("KIBANA_SPACE is ongeldig geconfigureerd.");
    error.code = "INVALID_CONFIG";
    throw error;
  }

  if (!Number.isInteger(dashboardVersion) || dashboardVersion < 1) {
    const error = new Error("KIBANA_DASHBOARD_VERSION is ongeldig geconfigureerd.");
    error.code = "INVALID_CONFIG";
    throw error;
  }

  // Alleen expliciet goedgekeurde service-authenticatie ondersteunen.
  // Browsercookies (waaronder sid) worden bewust niet geaccepteerd.
  if (!/^ApiKey\s+\S+/i.test(authorization) && !/^Bearer\s+\S+/i.test(authorization)) {
    const error = new Error("KIBANA_AUTHORIZATION moet een goedgekeurde ApiKey- of Bearer-header zijn.");
    error.code = "INVALID_CONFIG";
    throw error;
  }

  return Object.freeze({
    origin: parsedOrigin.origin,
    space,
    dashboardId,
    dashboardVersion,
    trafficPanelId,
    authorization
  });
}

function json(res, status, body, origin) {
  const headers = {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "x-content-type-options": "nosniff",
    "referrer-policy": "no-referrer"
  };

  if (origin && origin === ALLOWED_ORIGIN) {
    headers["access-control-allow-origin"] = origin;
    headers.vary = "Origin";
  }

  res.writeHead(status, headers);
  res.end(JSON.stringify(body));
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

const server = http.createServer(async (req, res) => {
  const origin = req.headers.origin || "";
  const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);

  if (req.method === "OPTIONS") {
    if (origin !== ALLOWED_ORIGIN) {
      res.writeHead(403);
      res.end();
      return;
    }

    res.writeHead(204, {
      "access-control-allow-origin": origin,
      "access-control-allow-methods": "GET, OPTIONS",
      "access-control-allow-headers": "content-type",
      "access-control-max-age": "600",
      vary: "Origin"
    });
    res.end();
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/health") {
    json(res, 200, {
      ok: true,
      configured: missingKibanaConfig().length === 0,
      service: "roosteroverzicht-traffic-bridge"
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
