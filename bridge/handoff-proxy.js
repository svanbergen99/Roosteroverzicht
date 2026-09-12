import http from "node:http";
import { requestUrl, serverLimits, limitConnections } from "./request-security.js";
import { spawn } from "node:child_process";
import { timingSafeEqual } from "node:crypto";

const PORT = Number(process.env.HANDOFF_PROXY_PORT || 8787);
const UPSTREAM_HOST = "127.0.0.1";
const UPSTREAM_PORT = Number(process.env.TRAFFIC_BRIDGE_UPSTREAM_PORT || 8786);
const TAB_KEY_ENV = "TRAFFIC_TAB_HANDOFF_KEY";
const ALLOWED_ORIGIN = String(
  process.env.TRAFFIC_TAB_ALLOWED_ORIGIN ||
    "https://achmea-production-1-a3srealtime-eu-west-1-prod.kb.eu-west-1.aws.found.io"
).trim();
const MAX_BODY_BYTES = 8 * 1024;

function readEnv(name) {
  return String(process.env[name] || "").trim();
}

function safeEqual(expected, supplied) {
  const left = Buffer.from(String(expected || ""));
  const right = Buffer.from(String(supplied || ""));
  return left.length > 0 && left.length === right.length && timingSafeEqual(left, right);
}

function corsHeaders(origin) {
  if (origin !== ALLOWED_ORIGIN) return {};
  return {
    "access-control-allow-origin": origin,
    vary: "Origin"
  };
}

function json(res, status, body, origin = "") {
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "x-content-type-options": "nosniff",
    "referrer-policy": "no-referrer",
    ...corsHeaders(origin)
  });
  res.end(JSON.stringify(body));
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;

    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        reject(new Error("BODY_TOO_LARGE"));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });

    req.on("end", () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}"));
      } catch {
        reject(new Error("INVALID_JSON"));
      }
    });

    req.on("error", reject);
  });
}

function validateTarget(rawUrl) {
  let target;
  try {
    target = new URL(String(rawUrl || "").trim());
  } catch {
    throw new Error("INVALID_URL");
  }

  if (target.protocol !== "https:" || target.origin !== ALLOWED_ORIGIN) {
    throw new Error("URL_NOT_ALLOWED");
  }

  return target.toString();
}

function openInCloudEdge(targetUrl) {
  const child = spawn(
    "microsoft-edge-stable",
    [
      "--no-sandbox",
      "--no-first-run",
      "--disable-gpu",
      "--disable-dev-shm-usage",
      "--new-tab",
      targetUrl
    ],
    {
      env: {
        ...process.env,
        DISPLAY: ":1",
        XAUTHORITY: "/home/node/.Xauthority"
      },
      detached: true,
      stdio: "ignore"
    }
  );
  child.unref();
}

function proxyToTrafficBridge(req, res) {
  const upstream = http.request(
    {
      hostname: UPSTREAM_HOST,
      port: UPSTREAM_PORT,
      path: req.url,
      method: req.method,
      headers: {
        ...req.headers,
        host: `${UPSTREAM_HOST}:${UPSTREAM_PORT}`
      }
    },
    (upstreamRes) => {
      res.writeHead(upstreamRes.statusCode || 502, upstreamRes.headers);
      upstreamRes.pipe(res);
    }
  );

  upstream.on("error", () => {
    if (!res.headersSent) {
      json(res, 502, { ok: false, status: "bridge-unavailable" });
    } else {
      res.end();
    }
  });

  req.pipe(upstream);
}

const server = http.createServer(serverLimits, async (req, res) => {
  const origin = String(req.headers.origin || "");
  let url;
  try {
    url = requestUrl(req);
  } catch {
    json(res, 400, { ok: false, status: "invalid-request" }, origin);
    return;
  }

  if (url.pathname !== "/api/open-tab") {
    proxyToTrafficBridge(req, res);
    return;
  }

  if (req.method === "OPTIONS") {
    if (origin !== ALLOWED_ORIGIN) {
      res.writeHead(403);
      res.end();
      return;
    }

    res.writeHead(204, {
      ...corsHeaders(origin),
      "access-control-allow-methods": "POST, OPTIONS",
      "access-control-allow-headers": "content-type, x-traffic-tab-key",
      "access-control-max-age": "600"
    });
    res.end();
    return;
  }

  if (req.method !== "POST") {
    json(res, 405, { ok: false, status: "method-not-allowed" }, origin);
    return;
  }

  if (origin !== ALLOWED_ORIGIN) {
    json(res, 403, { ok: false, status: "origin-denied" }, origin);
    return;
  }

  const expectedKey = readEnv(TAB_KEY_ENV);
  if (!expectedKey) {
    json(res, 503, { ok: false, status: "handoff-not-configured" }, origin);
    return;
  }

  if (!safeEqual(expectedKey, req.headers["x-traffic-tab-key"])) {
    json(res, 401, { ok: false, status: "invalid-handoff-key" }, origin);
    return;
  }

  try {
    const body = await readJsonBody(req);
    const targetUrl = validateTarget(body?.url);
    openInCloudEdge(targetUrl);
    json(res, 200, { ok: true, status: "opened" }, origin);
  } catch (error) {
    const code = error?.message || "HANDOFF_ERROR";
    const status = code === "BODY_TOO_LARGE" ? 413 : code === "URL_NOT_ALLOWED" ? 403 : 400;
    json(res, status, { ok: false, status: code.toLowerCase() }, origin);
  }
});

limitConnections(server);
server.listen(PORT, "0.0.0.0", () => {
  console.log(`Traffic handoff proxy luistert op poort ${PORT}; bridge upstream ${UPSTREAM_PORT}`);
});
