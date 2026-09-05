import http from "node:http";

const PORT = Number(process.env.PORT || 8787);
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || "https://svanbergen99.github.io";
const KIBANA_ORIGIN = process.env.KIBANA_ORIGIN || "https://achmea-production-1-a3srealtime-eu-west-1-prod.kb.eu-west-1.aws.found.io";
const KIBANA_SPACE = process.env.KIBANA_SPACE || "/s/centraal-beheer";
const DASHBOARD_ID = process.env.KIBANA_DASHBOARD_ID || "731a7b2c-c25f-4ff6-a032-5f62ef6d2272";
const DASHBOARD_VERSION = Number(process.env.KIBANA_DASHBOARD_VERSION || 3);
const TRAFFIC_PANEL_ID = process.env.KIBANA_TRAFFIC_PANEL_ID || "aeb4840f-bb0e-4ac1-bac1-6e7892075291";

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

function getAuthorizationHeader() {
  const value = String(process.env.KIBANA_AUTHORIZATION || "").trim();
  if (!value) return "";

  // Alleen expliciet geautoriseerde service-authenticatie ondersteunen.
  // Een browser-sid/cookie wordt bewust niet gebruikt of opgeslagen.
  if (!/^ApiKey\s+\S+/i.test(value) && !/^Bearer\s+\S+/i.test(value)) {
    throw new Error("KIBANA_AUTHORIZATION moet een goedgekeurde ApiKey- of Bearer-header zijn.");
  }
  return value;
}

function stripMarkdownHeading(markdown) {
  return String(markdown || "")
    .replace(/^\s*#{1,6}\s*/u, "")
    .trim();
}

function findTrafficPanel(dashboard) {
  const panels = dashboard?.result?.result?.item?.attributes?.panels;
  if (!Array.isArray(panels)) return null;

  return panels.find((panel) => panel?.panelIndex === TRAFFIC_PANEL_ID)
    || panels.find((panel) => {
      const markdown = panel?.panelConfig?.savedVis?.params?.markdown;
      return typeof markdown === "string" && /\bTraffic\b/i.test(markdown);
    })
    || null;
}

async function fetchTrafficHeader() {
  const authorization = getAuthorizationHeader();
  if (!authorization) {
    const error = new Error("Bridge is nog niet gekoppeld: KIBANA_AUTHORIZATION ontbreekt.");
    error.code = "NOT_CONFIGURED";
    throw error;
  }

  const url = `${KIBANA_ORIGIN}${KIBANA_SPACE}/api/content_management/rpc/get`;
  const response = await fetch(url, {
    method: "POST",
    headers: {
      authorization,
      "content-type": "application/json",
      "kbn-xsrf": "roosteroverzicht-traffic-bridge"
    },
    body: JSON.stringify({
      contentTypeId: "dashboard",
      id: DASHBOARD_ID,
      version: DASHBOARD_VERSION
    }),
    signal: AbortSignal.timeout(10000)
  });

  if (!response.ok) {
    const error = new Error(`Kibana gaf HTTP ${response.status}.`);
    error.code = "KIBANA_ERROR";
    error.status = response.status;
    throw error;
  }

  const dashboard = await response.json();
  const panel = findTrafficPanel(dashboard);
  const markdown = panel?.panelConfig?.savedVis?.params?.markdown;

  if (!markdown) {
    const error = new Error("Traffic Markdown-paneel is niet gevonden in het dashboard.");
    error.code = "PANEL_NOT_FOUND";
    throw error;
  }

  return {
    trafficHeader: stripMarkdownHeading(markdown),
    rawMarkdown: markdown,
    dashboardId: DASHBOARD_ID,
    panelId: panel.panelIndex || TRAFFIC_PANEL_ID,
    dashboardUpdatedAt: dashboard?.result?.result?.item?.updatedAt || null,
    fetchedAt: new Date().toISOString(),
    source: "official-kibana-dashboard"
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
      configured: Boolean(String(process.env.KIBANA_AUTHORIZATION || "").trim()),
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
