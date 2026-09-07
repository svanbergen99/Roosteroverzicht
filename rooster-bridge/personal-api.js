import http from "node:http";
import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes } from "node:crypto";

const originalCreateServer = http.createServer.bind(http);
const PORT = Number(process.env.PORT || 8080);
const REPO = String(process.env.GITHUB_REPO || "svanbergen99/Roosteroverzicht").trim();
const BRANCH = String(process.env.GITHUB_BRANCH || "main").trim();
const BINDINGS_PATH = "wfm-identity-bindings.json";
const PUBLIC_ORIGIN = "https://svanbergen99.github.io";
const WFM_ORIGIN = "https://genesyswfm.hosting.corp";
const MAX_BODY = 2 * 1024 * 1024;
const TOKEN_MINUTES = 20;

function appError(message, code = "BAD_REQUEST", status = 400) {
  const error = new Error(message);
  error.code = code;
  error.status = status;
  return error;
}

function secret() {
  const value = String(process.env.TEAM_SESSION_SECRET || "").trim();
  if (value.length < 32) throw appError("TEAM_SESSION_SECRET ontbreekt op Railway.", "NOT_CONFIGURED", 503);
  return value;
}

function key() {
  return createHash("sha256").update(secret(), "utf8").digest();
}

function opaqueHash(kind, value) {
  return createHmac("sha256", secret()).update(`${kind}:${String(value || "")}`, "utf8").digest("hex");
}

function sha256(value) {
  return createHash("sha256").update(String(value || ""), "utf8").digest("hex");
}

function nameSignature(value) {
  return String(value || "")
    .toLocaleLowerCase("nl-NL")
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b, "nl"))
    .join("|");
}

function validateBindingId(value) {
  const id = String(value || "").trim();
  if (!/^[A-Za-z0-9_-]{32,160}$/.test(id)) throw appError("Browserkoppeling is ongeldig.", "INVALID_BINDING", 400);
  return id;
}

function sealObject(value) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const encrypted = Buffer.concat([cipher.update(Buffer.from(JSON.stringify(value), "utf8")), cipher.final()]);
  return Buffer.concat([iv, encrypted, cipher.getAuthTag()]).toString("base64url");
}

function openObject(token, code = "SCAN_TOKEN_INVALID") {
  try {
    const raw = Buffer.from(String(token || ""), "base64url");
    if (raw.length <= 28) throw new Error("invalid token");
    const iv = raw.subarray(0, 12);
    const tag = raw.subarray(raw.length - 16);
    const encrypted = raw.subarray(12, raw.length - 16);
    const decipher = createDecipheriv("aes-256-gcm", key(), iv);
    decipher.setAuthTag(tag);
    return JSON.parse(Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf8"));
  } catch (error) {
    if (error?.code && error?.status) throw error;
    throw appError("Beveiligde Railway-koppeling is ongeldig of verlopen.", code, 401);
  }
}

function openTeamSession(token) {
  const data = openObject(token, "SESSION_INVALID");
  if (data?.v !== 1 || !data?.team || !data?.password || Number(data?.exp) <= Date.now()) {
    throw appError("De beveiligde Railway-koppeling is verlopen of ongeldig.", "SESSION_INVALID", 401);
  }
  return data;
}

function createScanToken(binding, team, password) {
  const now = Date.now();
  return sealObject({
    v: 1,
    purpose: "personal-roster-scan",
    team,
    password,
    bindingHash: binding.bindingHash,
    teamHash: binding.teamHash,
    rosterHash: binding.rosterHash,
    iat: now,
    exp: now + TOKEN_MINUTES * 60 * 1000,
  });
}

function openScanToken(token) {
  const data = openObject(token);
  if (data?.v !== 1 || data?.purpose !== "personal-roster-scan" || !data?.team || !data?.password ||
      !/^[a-f0-9]{64}$/i.test(String(data?.bindingHash || "")) ||
      !/^[a-f0-9]{64}$/i.test(String(data?.teamHash || "")) ||
      !/^[a-f0-9]{64}$/i.test(String(data?.rosterHash || "")) ||
      Number(data?.exp) <= Date.now()) {
    throw appError("De persoonlijke WFM-scanopdracht is ongeldig of verlopen.", "SCAN_TOKEN_INVALID", 401);
  }
  return data;
}

function githubHeaders() {
  const token = String(process.env.GITHUB_TOKEN || "").trim();
  if (!token) throw appError("GITHUB_TOKEN ontbreekt op Railway.", "NOT_CONFIGURED", 503);
  return {
    Accept: "application/vnd.github+json",
    Authorization: `Bearer ${token}`,
    "X-GitHub-Api-Version": "2022-11-28",
    "Content-Type": "application/json",
    "User-Agent": "roosteroverzicht-personal-wfm",
  };
}

async function gh(path, init = {}) {
  const response = await fetch(`https://api.github.com/repos/${REPO}${path}`, {
    ...init,
    headers: { ...githubHeaders(), ...(init.headers || {}) },
    signal: AbortSignal.timeout(30000),
  });
  const text = await response.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { }
  if (!response.ok) {
    const error = appError(data?.message || `GitHub HTTP ${response.status}`, "GITHUB_ERROR", 502);
    error.githubStatus = response.status;
    throw error;
  }
  return data;
}

async function getBindingsFile() {
  const encoded = encodeURIComponent(BINDINGS_PATH);
  try {
    const meta = await gh(`/contents/${encoded}?ref=${encodeURIComponent(BRANCH)}`);
    const parsed = JSON.parse(Buffer.from(String(meta?.content || "").replace(/\s+/g, ""), "base64").toString("utf8") || "{}");
    return { sha: meta.sha, data: { version: 1, bindings: Array.isArray(parsed?.bindings) ? parsed.bindings : [] } };
  } catch (error) {
    if (error?.githubStatus === 404) return { sha: null, data: { version: 1, bindings: [] } };
    throw error;
  }
}

async function putBindingsFile(data, sha) {
  return gh(`/contents/${encodeURIComponent(BINDINGS_PATH)}`, {
    method: "PUT",
    body: JSON.stringify({
      message: "Update secure WFM browser binding",
      content: Buffer.from(`${JSON.stringify(data, null, 2)}\n`, "utf8").toString("base64"),
      branch: BRANCH,
      ...(sha ? { sha } : {}),
    }),
  });
}

function sendJson(res, status, body, origin) {
  const headers = {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "x-content-type-options": "nosniff",
    "referrer-policy": "no-referrer",
  };
  if (origin === PUBLIC_ORIGIN || origin === WFM_ORIGIN) {
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

async function internalPost(path, origin, body) {
  const response = await fetch(`http://127.0.0.1:${PORT}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", origin },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(60000),
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) throw appError(data?.message || `Interne Railway-fout ${response.status}`, data?.code || "INTERNAL_ERROR", response.status);
  return data;
}

function todayAmsterdam() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Amsterdam",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const get = type => parts.find(part => part.type === type)?.value || "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

function canonicalName(names, rosterHash) {
  return (Array.isArray(names) ? names : []).find(name => sha256(nameSignature(name)) === rosterHash) || "";
}

async function findBinding(bindingId, team = "") {
  const bindingHash = opaqueHash("binding", validateBindingId(bindingId));
  const file = await getBindingsFile();
  let matches = file.data.bindings.filter(item => item?.bindingHash === bindingHash && item?.rosterHash);
  if (team) {
    const teamHash = opaqueHash("team", String(team).trim().toLocaleLowerCase("nl-NL"));
    matches = matches.filter(item => item?.teamHash === teamHash);
  }
  matches.sort((a, b) => String(b?.updatedAt || b?.accessUpdatedAt || "").localeCompare(String(a?.updatedAt || a?.accessUpdatedAt || "")));
  const binding = matches[0];
  if (!binding?.rosterHash) throw appError("Voor deze browser is nog geen WFM-persoon gekoppeld.", "IDENTITY_NOT_BOUND", 404);
  return { file, binding };
}

async function bindTeamAccess(body) {
  const bindingId = validateBindingId(body?.bindingId);
  const auth = openTeamSession(body?.sessionToken);
  const { file, binding } = await findBinding(bindingId, auth.team);
  const index = file.data.bindings.findIndex(item => item?.bindingHash === binding.bindingHash && item?.teamHash === binding.teamHash);
  if (index < 0) throw appError("De browserkoppeling is niet meer geldig.", "IDENTITY_NOT_BOUND", 404);
  file.data.bindings[index] = {
    ...file.data.bindings[index],
    accessCipher: sealObject({ v: 1, purpose: "team-access", team: auth.team, password: auth.password }),
    accessUpdatedAt: new Date().toISOString(),
  };
  const result = await putBindingsFile(file.data, file.sha);
  return { ok: true, commit: result?.commit?.sha || null };
}

async function startPersonalScan(body) {
  const bindingId = validateBindingId(body?.bindingId);
  let team = String(body?.team || "").trim();
  let password = String(body?.password || "");
  let binding;

  if (team && password) {
    ({ binding } = await findBinding(bindingId, team));
  } else {
    ({ binding } = await findBinding(bindingId));
    if (!binding?.accessCipher) {
      throw appError("Deze browser heeft nog geen beveiligde Team-roostertoegang. Voer de Team Scanner nog één keer uit om de koppeling af te ronden.", "ACCESS_NOT_PAIRED", 409);
    }
    const access = openObject(binding.accessCipher, "ACCESS_NOT_PAIRED");
    if (access?.v !== 1 || access?.purpose !== "team-access" || !access?.team || !access?.password) {
      throw appError("De beveiligde Team-roostertoegang is ongeldig.", "ACCESS_NOT_PAIRED", 409);
    }
    team = String(access.team).trim();
    password = String(access.password);
    if (opaqueHash("team", team.toLocaleLowerCase("nl-NL")) !== binding.teamHash) {
      throw appError("De Team-koppeling hoort niet bij deze browser.", "ACCESS_NOT_PAIRED", 409);
    }
  }

  const prepared = await internalPost("/api/rooster/prepare", PUBLIC_ORIGIN, {
    team,
    password,
    payload: { schedules: [{ date: todayAmsterdam(), start: "00:00", end: "00:00", activities: [] }] },
  });
  const employee = canonicalName(prepared?.employees, binding.rosterHash);
  if (!employee) throw appError("De gekoppelde WFM-persoon staat niet in het beveiligde roosterbestand.", "IDENTITY_EMPLOYEE_NOT_FOUND", 409);

  return {
    ok: true,
    scanToken: createScanToken(binding, team, password),
    expiresInMinutes: TOKEN_MINUTES,
  };
}

async function bootstrapPersonalScan(body) {
  const auth = openScanToken(body?.scanToken);
  const file = await getBindingsFile();
  const binding = file.data.bindings.find(item => item?.bindingHash === auth.bindingHash && item?.teamHash === auth.teamHash);
  if (!binding?.rosterHash || binding.rosterHash !== auth.rosterHash) {
    throw appError("De browserkoppeling is gewijzigd of niet meer geldig.", "IDENTITY_NOT_BOUND", 404);
  }
  let aa = "";
  if (binding.aaCipher) {
    try {
      const decoded = openObject(binding.aaCipher, "AA_DATA_INVALID");
      if (decoded?.v === 1 && decoded?.purpose === "wfm-aa" && typeof decoded?.aa === "string") aa = decoded.aa;
    } catch (_) { aa = ""; }
  }
  return { ok: true, aa };
}

async function bindAa(body) {
  const auth = openScanToken(body?.scanToken);
  const aa = String(body?.aa || "").trim();
  if (!/^[A-Za-z0-9._@-]{2,80}$/.test(aa)) throw appError("AA-nummer heeft geen geldig formaat.", "INVALID_AA", 400);

  const file = await getBindingsFile();
  const index = file.data.bindings.findIndex(item => item?.bindingHash === auth.bindingHash && item?.teamHash === auth.teamHash && item?.rosterHash === auth.rosterHash);
  if (index < 0) throw appError("De browserkoppeling is niet meer geldig.", "IDENTITY_NOT_BOUND", 404);

  file.data.bindings[index] = {
    ...file.data.bindings[index],
    aaHash: opaqueHash("aa", aa.toLocaleLowerCase("nl-NL")),
    aaCipher: sealObject({ v: 1, purpose: "wfm-aa", aa }),
    aaUpdatedAt: new Date().toISOString(),
  };
  const result = await putBindingsFile(file.data, file.sha);
  return { ok: true, commit: result?.commit?.sha || null };
}

async function storePersonalScan(body) {
  const auth = openScanToken(body?.scanToken);
  const payload = body?.payload;
  const prepared = await internalPost("/api/rooster/prepare", PUBLIC_ORIGIN, {
    team: auth.team,
    password: auth.password,
    payload,
  });
  const employee = canonicalName(prepared?.employees, auth.rosterHash);
  if (!employee) throw appError("De gekoppelde persoon staat niet meer in het beveiligde roosterbestand.", "IDENTITY_EMPLOYEE_NOT_FOUND", 409);

  const stored = await internalPost("/api/rooster/store", PUBLIC_ORIGIN, {
    team: auth.team,
    password: auth.password,
    employee,
    payload,
  });
  return { ...stored, ok: true };
}

http.createServer = function patchedCreateServer(listener) {
  return originalCreateServer(async (req, res) => {
    const origin = String(req.headers.origin || "");
    const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
    const routes = new Map([
      ["/api/personal-roster/start", PUBLIC_ORIGIN],
      ["/api/personal-roster/access-bind", WFM_ORIGIN],
      ["/api/personal-roster/bootstrap", WFM_ORIGIN],
      ["/api/personal-roster/aa-bind", WFM_ORIGIN],
      ["/api/personal-roster/store", WFM_ORIGIN],
    ]);
    const allowedOrigin = routes.get(url.pathname);
    if (!allowedOrigin) return listener(req, res);

    if (req.method === "OPTIONS") {
      if (origin !== allowedOrigin) { res.writeHead(403); res.end(); return; }
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
    if (origin !== allowedOrigin) {
      sendJson(res, 403, { ok: false, code: "ORIGIN_DENIED", message: "Deze origin wordt niet geaccepteerd." }, origin);
      return;
    }
    if (req.method !== "POST") {
      sendJson(res, 405, { ok: false, code: "METHOD_NOT_ALLOWED", message: "Alleen POST is toegestaan." }, origin);
      return;
    }

    try {
      const body = await readJson(req);
      let result;
      if (url.pathname === "/api/personal-roster/start") result = await startPersonalScan(body);
      else if (url.pathname === "/api/personal-roster/access-bind") result = await bindTeamAccess(body);
      else if (url.pathname === "/api/personal-roster/bootstrap") result = await bootstrapPersonalScan(body);
      else if (url.pathname === "/api/personal-roster/aa-bind") result = await bindAa(body);
      else result = await storePersonalScan(body);
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
