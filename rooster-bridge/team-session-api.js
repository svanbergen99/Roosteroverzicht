import http from "node:http";
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

const originalCreateServer = http.createServer.bind(http);
const PORT = Number(process.env.PORT || 8080);
const MAX_BODY = 16 * 1024 * 1024;
const SESSION_DAYS = 30;
const ALLOWED_ORIGINS = new Set([
  "https://svanbergen99.github.io",
  "https://genesyswfm.hosting.corp",
]);

function appError(message, code = "BAD_REQUEST", status = 400) {
  const error = new Error(message);
  error.code = code;
  error.status = status;
  return error;
}

function sendJson(res, status, body, origin = "") {
  const headers = {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "x-content-type-options": "nosniff",
  };
  if (ALLOWED_ORIGINS.has(origin)) {
    headers["access-control-allow-origin"] = origin;
    headers.vary = "Origin";
  }
  res.writeHead(status, headers);
  res.end(JSON.stringify(body));
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on("data", chunk => {
      size += chunk.length;
      if (size > MAX_BODY) {
        reject(appError("Aanvraag is te groot.", "PAYLOAD_TOO_LARGE", 413));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => {
      try { resolve(JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}")); }
      catch { reject(appError("Aanvraag bevat geen geldige JSON.", "INVALID_JSON", 400)); }
    });
    req.on("error", reject);
  });
}

function sessionKey() {
  const secret = String(process.env.TEAM_SESSION_SECRET || "").trim();
  if (secret.length < 32) throw appError("TEAM_SESSION_SECRET ontbreekt op Railway.", "NOT_CONFIGURED", 503);
  return createHash("sha256").update(secret, "utf8").digest();
}

function sealSession(team, password) {
  const now = Date.now();
  const payload = Buffer.from(JSON.stringify({
    v: 1,
    team,
    password,
    iat: now,
    exp: now + SESSION_DAYS * 24 * 60 * 60 * 1000,
  }), "utf8");
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", sessionKey(), iv);
  const cipherText = Buffer.concat([cipher.update(payload), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, cipherText, tag]).toString("base64url");
}

function openSession(token) {
  try {
    const raw = Buffer.from(String(token || ""), "base64url");
    if (raw.length <= 28) throw new Error("invalid token");
    const iv = raw.subarray(0, 12);
    const tag = raw.subarray(raw.length - 16);
    const cipherText = raw.subarray(12, raw.length - 16);
    const decipher = createDecipheriv("aes-256-gcm", sessionKey(), iv);
    decipher.setAuthTag(tag);
    const plain = Buffer.concat([decipher.update(cipherText), decipher.final()]).toString("utf8");
    const data = JSON.parse(plain);
    if (data?.v !== 1 || !data?.team || !data?.password || Number(data?.exp) <= Date.now()) {
      throw new Error("expired token");
    }
    return data;
  } catch (error) {
    if (error?.code && error?.status) throw error;
    throw appError("De beveiligde Railway-koppeling is verlopen of ongeldig.", "SESSION_INVALID", 401);
  }
}

function firstSchedule(index) {
  for (const employee of Array.isArray(index?.employees) ? index.employees : []) {
    for (const schedule of Array.isArray(employee?.schedules) ? employee.schedules : []) {
      const date = String(schedule?.date || "").slice(0, 10);
      if (/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        return {
          date,
          start: String(schedule?.start || ""),
          end: String(schedule?.end || ""),
          activities: Array.isArray(schedule?.activities) ? schedule.activities : [],
        };
      }
    }
  }
  throw appError("Teamscan bevat geen geldige roosterregel.", "INVALID_TEAM_SCAN", 400);
}

async function internalPost(path, origin, body) {
  const response = await fetch(`http://127.0.0.1:${PORT}${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin,
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(60000),
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    throw appError(data?.message || `Interne Railway-fout ${response.status}`, data?.code || "INTERNAL_ERROR", response.status);
  }
  return data;
}

async function createSession(body) {
  const team = String(body?.team || "").trim();
  const password = String(body?.password || "");
  if (!team || !password || team.length > 200 || password.length > 500) {
    throw appError("Team-ID en Team Wachtwoord zijn verplicht.", "MISSING_CREDENTIALS", 400);
  }
  const schedule = firstSchedule(body?.index);
  await internalPost("/api/rooster/prepare", "https://svanbergen99.github.io", {
    team,
    password,
    payload: { schedules: [schedule] },
  });
  return {
    ok: true,
    sessionToken: sealSession(team, password),
    expiresInDays: SESSION_DAYS,
  };
}

async function storeWithSession(body) {
  const auth = openSession(body?.sessionToken);
  const result = await internalPost("/api/team-rooster/store", "https://genesyswfm.hosting.corp", {
    team: auth.team,
    password: auth.password,
    index: body?.index,
  });
  return {
    ...result,
    sessionToken: sealSession(auth.team, auth.password),
    expiresInDays: SESSION_DAYS,
  };
}

http.createServer = function patchedCreateServer(listener) {
  return originalCreateServer(async (req, res) => {
    const origin = String(req.headers.origin || "");
    const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
    const isSessionRoute = url.pathname === "/api/team-rooster/session";
    const isSessionStoreRoute = url.pathname === "/api/team-rooster/store-session";
    if (!isSessionRoute && !isSessionStoreRoute) return listener(req, res);

    if (req.method === "OPTIONS") {
      if (!ALLOWED_ORIGINS.has(origin)) { res.writeHead(403); res.end(); return; }
      res.writeHead(204, {
        "access-control-allow-origin": origin,
        "access-control-allow-methods": "POST, OPTIONS",
        "access-control-allow-headers": "content-type",
        "access-control-max-age": "600",
        vary: "Origin",
      });
      res.end();
      return;
    }

    if (!ALLOWED_ORIGINS.has(origin)) {
      sendJson(res, 403, { ok:false, code:"ORIGIN_DENIED", message:"Deze origin wordt niet geaccepteerd." }, origin);
      return;
    }
    if (req.method !== "POST") {
      sendJson(res, 405, { ok:false, code:"METHOD_NOT_ALLOWED", message:"Alleen POST is toegestaan." }, origin);
      return;
    }

    try {
      const body = await readJson(req);
      const result = isSessionRoute ? await createSession(body) : await storeWithSession(body);
      sendJson(res, 200, result, origin);
    } catch (error) {
      sendJson(res, Number(error?.status) || 500, {
        ok: false,
        code: error?.code || "INTERNAL_ERROR",
        message: error?.message || "Onbekende serverfout.",
      }, origin);
    }
  });
};
