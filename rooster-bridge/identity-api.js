import http from "node:http";
import { createDecipheriv, createHash, createHmac } from "node:crypto";

const originalCreateServer = http.createServer.bind(http);
const REPO = String(process.env.GITHUB_REPO || "svanbergen99/Roosteroverzicht").trim();
const BRANCH = String(process.env.GITHUB_BRANCH || "main").trim();
const BINDINGS_PATH = "wfm-identity-bindings.json";
const WFM_ORIGIN = "https://genesyswfm.hosting.corp";
const PUBLIC_ORIGIN = "https://svanbergen99.github.io";
const MAX_BODY = 1024 * 1024;

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

function sessionKey() {
  return createHash("sha256").update(secret(), "utf8").digest();
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
    const data = JSON.parse(Buffer.concat([decipher.update(cipherText), decipher.final()]).toString("utf8"));
    if (data?.v !== 1 || !data?.team || !data?.password || Number(data?.exp) <= Date.now()) throw new Error("expired token");
    return data;
  } catch (error) {
    if (error?.code && error?.status) throw error;
    throw appError("De beveiligde Railway-koppeling is verlopen of ongeldig.", "SESSION_INVALID", 401);
  }
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

function sha256(value) {
  return createHash("sha256").update(String(value || ""), "utf8").digest("hex");
}

function opaqueHash(kind, value) {
  return createHmac("sha256", secret()).update(`${kind}:${String(value || "")}`, "utf8").digest("hex");
}

function validateBindingId(value) {
  const id = String(value || "").trim();
  if (!/^[A-Za-z0-9_-]{32,160}$/.test(id)) throw appError("Browserkoppeling is ongeldig.", "INVALID_BINDING", 400);
  return id;
}

function githubHeaders() {
  const token = String(process.env.GITHUB_TOKEN || "").trim();
  if (!token) throw appError("GITHUB_TOKEN ontbreekt op Railway.", "NOT_CONFIGURED", 503);
  return {
    Accept: "application/vnd.github+json",
    Authorization: `Bearer ${token}`,
    "X-GitHub-Api-Version": "2022-11-28",
    "Content-Type": "application/json",
    "User-Agent": "roosteroverzicht-wfm-identity",
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
    const text = Buffer.from(String(meta?.content || "").replace(/\s+/g, ""), "base64").toString("utf8");
    const parsed = JSON.parse(text || "{}");
    return { sha: meta.sha, data: { version: 1, bindings: Array.isArray(parsed?.bindings) ? parsed.bindings : [] } };
  } catch (error) {
    if (error?.githubStatus === 404) return { sha: null, data: { version: 1, bindings: [] } };
    throw error;
  }
}

async function putBindingsFile(data, sha = null) {
  const encoded = encodeURIComponent(BINDINGS_PATH);
  return gh(`/contents/${encoded}`, {
    method: "PUT",
    body: JSON.stringify({
      message: "Update WFM identity browser binding",
      content: Buffer.from(`${JSON.stringify(data, null, 2)}\n`, "utf8").toString("base64"),
      branch: BRANCH,
      ...(sha ? { sha } : {}),
    }),
  });
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on("data", chunk => {
      size += chunk.length;
      if (size > MAX_BODY) { reject(appError("Aanvraag is te groot.", "PAYLOAD_TOO_LARGE", 413)); req.destroy(); return; }
      chunks.push(chunk);
    });
    req.on("end", () => {
      try { resolve(JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}")); }
      catch { reject(appError("Aanvraag bevat geen geldige JSON.", "INVALID_JSON", 400)); }
    });
    req.on("error", reject);
  });
}

function sendJson(res, status, body, origin) {
  const headers = { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", "x-content-type-options": "nosniff" };
  if (origin === WFM_ORIGIN || origin === PUBLIC_ORIGIN) { headers["access-control-allow-origin"] = origin; headers.vary = "Origin"; }
  res.writeHead(status, headers);
  res.end(JSON.stringify(body));
}

async function bindIdentity(body) {
  const auth = openSession(body?.sessionToken);
  const bindingId = validateBindingId(body?.bindingId);
  const wfmName = String(body?.wfmName || "").trim();
  if (!wfmName || wfmName.length > 160) throw appError("WFM-naam ontbreekt of is ongeldig.", "INVALID_WFM_NAME", 400);

  const employeeNames = Array.isArray(body?.employeeNames) ? body.employeeNames.map(v => String(v || "").trim()).filter(Boolean).slice(0, 1000) : [];
  const rosterHash = sha256(nameSignature(wfmName));
  if (!rosterHash || !employeeNames.some(name => sha256(nameSignature(name)) === rosterHash)) {
    throw appError("De WFM-naam komt niet overeen met een naam in de gescande roosterlijst.", "WFM_NAME_NOT_IN_ROSTER", 400);
  }

  const bindingHash = opaqueHash("binding", bindingId);
  const teamHash = opaqueHash("team", String(auth.team).trim().toLocaleLowerCase("nl-NL"));
  const file = await getBindingsFile();
  const now = new Date().toISOString();
  const bindings = file.data.bindings.filter(item => !(item?.bindingHash === bindingHash && item?.teamHash === teamHash));
  bindings.push({ bindingHash, teamHash, rosterHash, updatedAt: now });
  const compact = bindings.sort((a, b) => String(b.updatedAt || "").localeCompare(String(a.updatedAt || ""))).slice(0, 5000);
  const result = await putBindingsFile({ version: 1, bindings: compact }, file.sha);
  return { ok: true, rosterHash, commit: result?.commit?.sha || null };
}

async function resolveIdentity(body) {
  const bindingId = validateBindingId(body?.bindingId);
  const team = String(body?.team || "").trim();
  if (!team || team.length > 200) throw appError("Team-ID ontbreekt.", "MISSING_TEAM", 400);
  const bindingHash = opaqueHash("binding", bindingId);
  const teamHash = opaqueHash("team", team.toLocaleLowerCase("nl-NL"));
  const file = await getBindingsFile();
  const match = file.data.bindings.find(item => item?.bindingHash === bindingHash && item?.teamHash === teamHash);
  if (!match?.rosterHash) throw appError("Voor deze browser is nog geen WFM-naam gekoppeld.", "IDENTITY_NOT_BOUND", 404);
  return { ok: true, rosterHash: match.rosterHash };
}

http.createServer = function patchedCreateServer(listener) {
  return originalCreateServer(async (req, res) => {
    const origin = String(req.headers.origin || "");
    const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
    const isBind = url.pathname === "/api/team-rooster/identity-bind";
    const isResolve = url.pathname === "/api/team-rooster/identity-resolve";
    if (!isBind && !isResolve) return listener(req, res);

    const allowedOrigin = isBind ? WFM_ORIGIN : PUBLIC_ORIGIN;
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
    if (origin !== allowedOrigin) { sendJson(res, 403, { ok:false, code:"ORIGIN_DENIED", message:"Deze origin wordt niet geaccepteerd." }, origin); return; }
    if (req.method !== "POST") { sendJson(res, 405, { ok:false, code:"METHOD_NOT_ALLOWED", message:"Alleen POST is toegestaan." }, origin); return; }

    try {
      const body = await readJson(req);
      sendJson(res, 200, isBind ? await bindIdentity(body) : await resolveIdentity(body), origin);
    } catch (error) {
      sendJson(res, Number(error?.status) || 500, { ok:false, code:error?.code || "INTERNAL_ERROR", message:error?.message || "Onbekende serverfout." }, origin);
    }
  });
};
