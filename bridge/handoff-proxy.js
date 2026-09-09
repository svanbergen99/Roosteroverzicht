import http from "node:http";
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
const REQUEST_WINDOW_MS = 60 * 1000;
const MAX_REQUESTS_PER_WINDOW = 30;
const requestWindows = new Map();

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

function securityHeaders() {
  return {
    "cache-control": "no-store",
    "content-security-policy": "default-src 'none'; base-uri 'none'; frame-ancestors 'none'",
    "cross-origin-resource-policy": "same-origin",
    "referrer-policy": "no-referrer",
    "x-content-type-options": "nosniff",
    "x-frame-options": "DENY"
  };
}

function json(res, status, body, origin = "") {
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    ...securityHeaders(),
    ...corsHeaders(origin)
  });
  res.end(JSON.stringify(body));
}

function isJsonContentType(req) {
  const contentType = String(req.headers["content-type"] || "").toLowerCase();
  return contentType === "application/json" || contentType.startsWith("application/json;");
}

function allowRequest(req) {
  const forwarded = String(req.headers["x-forwarded-for"] || "").split(",")[0].trim();
  const key = forwarded || String(req.socket.remoteAddress || "unknown");
  const now = Date.now();
  const current = requestWindows.get(key);
  const active = current && now - current.startedAt < REQUEST_WINDOW_MS
    ? current
    : { startedAt: now, count: 0 };
  active.count += 1;
  requestWindows.set(key, active);
  if (requestWindows.size > 500) {
    for (const [entryKey, entry] of requestWindows) {
      if (now - entry.startedAt >= REQUEST_WINDOW_MS) requestWindows.delete(entryKey);
    }
  }
  return active.count <= MAX_REQUESTS_PER_WINDOW;
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

const server = http.createServer(async (req, res) => {
  const origin = String(req.headers.origin || "");
  const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);

  if (!allowRequest(req)) {
    json(res, 429, { ok: false, status: "rate-limited" }, origin);
    return;
  }

  if (url.pathname !== "/api/open-tab") {
    proxyToTrafficBridge(req, res);
    return;
  }

  if (req.method === "OPTIONS") {
    if (origin !== ALLOWED_ORIGIN) {
      res.writeHead(403, securityHeaders());
      res.end();
      return;
    }

    res.writeHead(204, {
      ...securityHeaders(),
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

  if (!isJsonContentType(req)) {
    json(res, 415, { ok: false, status: "content-type-required" }, origin);
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

server.listen(PORT, "0.0.0.0", () => {
  console.log(`Traffic handoff proxy luistert op poort ${PORT}; bridge upstream ${UPSTREAM_PORT}`);
});
