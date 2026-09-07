import http from "node:http";
import { createCipheriv, createDecipheriv, pbkdf2Sync, randomBytes } from "node:crypto";

const originalCreateServer = http.createServer.bind(http);
const REPO = String(process.env.GITHUB_REPO || "svanbergen99/Roosteroverzicht").trim();
const BRANCH = String(process.env.GITHUB_BRANCH || "main").trim();
const ALLOWED_ORIGINS = new Set([
  "https://svanbergen99.github.io",
  "https://genesyswfm.hosting.corp",
]);
const MONTH_NAMES = ["Januari","Februari","Maart","April","Mei","Juni","Juli","Augustus","September","Oktober","November","December"];
const MAX_BODY = 16 * 1024 * 1024;

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
        reject(appError("Teamscan is te groot.", "PAYLOAD_TOO_LARGE", 413));
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

function ghHeaders() {
  const token = String(process.env.GITHUB_TOKEN || "").trim();
  if (!token) throw appError("GITHUB_TOKEN ontbreekt op Railway.", "NOT_CONFIGURED", 503);
  return {
    Accept: "application/vnd.github+json",
    Authorization: `Bearer ${token}`,
    "X-GitHub-Api-Version": "2022-11-28",
    "Content-Type": "application/json",
    "User-Agent": "roosteroverzicht-team-scanner-bridge",
  };
}

async function gh(path, init = {}) {
  const response = await fetch(`https://api.github.com/repos/${REPO}${path}`, {
    ...init,
    headers: { ...ghHeaders(), ...(init.headers || {}) },
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

async function getRepoFile(path) {
  const encoded = encodeURIComponent(path).replace(/%2F/g, "/");
  try {
    const meta = await gh(`/contents/${encoded}?ref=${encodeURIComponent(BRANCH)}`);
    let content = String(meta?.content || "").replace(/\s+/g, "");
    if (!content && meta?.sha) {
      const blob = await gh(`/git/blobs/${encodeURIComponent(meta.sha)}`);
      content = String(blob?.content || "").replace(/\s+/g, "");
    }
    if (!content) throw appError(`${path} kon niet volledig uit GitHub worden gelezen.`, "GITHUB_READ_ERROR", 502);
    return { sha: meta.sha, text: Buffer.from(content, "base64").toString("utf8") };
  } catch (error) {
    if (error?.githubStatus === 404) return null;
    throw error;
  }
}

async function putRepoFile(path, text, sha = null) {
  const encoded = encodeURIComponent(path).replace(/%2F/g, "/");
  return gh(`/contents/${encoded}`, {
    method: "PUT",
    body: JSON.stringify({
      message: `Update ${path} from WFM Team Scanner via Railway`,
      content: Buffer.from(text, "utf8").toString("base64"),
      branch: BRANCH,
      ...(sha ? { sha } : {}),
    }),
  });
}

function targetFor(index) {
  if (index?.kind !== "roosterhulp-index" || !Array.isArray(index?.employees) || !index.employees.length) {
    throw appError("Teamscan heeft een onverwacht formaat.", "INVALID_TEAM_SCAN", 400);
  }
  const dates = index.employees.flatMap(employee =>
    (Array.isArray(employee?.schedules) ? employee.schedules : [])
      .map(schedule => String(schedule?.date || "").slice(0, 10))
      .filter(date => /^\d{4}-\d{2}-\d{2}$/.test(date))
  );
  if (!dates.length) throw appError("Teamscan bevat geen geldige datums.", "INVALID_TEAM_SCAN", 400);
  const counts = new Map();
  for (const date of dates) {
    const key = date.slice(0, 7);
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  const monthKey = [...counts.entries()].sort((a,b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0][0];
  const year = Number(monthKey.slice(0, 4));
  const month = Number(monthKey.slice(5, 7));
  if (!year || month < 1 || month > 12) throw appError("Doelmaand kon niet worden bepaald.", "INVALID_TEAM_SCAN", 400);
  return {
    monthKey,
    file: `Roosterindex_${MONTH_NAMES[month - 1]}_${year}.json`,
    annual: `Roosterindex_${year}.json`,
  };
}

function cryptoParams(envelope) {
  if (envelope?.kind !== "roosterhulp-encrypted-index" || envelope?.encrypted !== true || !envelope?.crypto || !envelope?.payload) {
    throw appError("Bestaand beveiligd roosterbestand heeft een onverwacht formaat.", "INVALID_ENCRYPTED_FILE", 500);
  }
  const iterations = Number(envelope.crypto.iterations || 250000);
  const keyLength = Number(envelope.crypto.keyLength || 256);
  if (!Number.isInteger(iterations) || iterations < 10000 || ![128,192,256].includes(keyLength)) {
    throw appError("Ongeldige versleutelingsinstellingen.", "INVALID_ENCRYPTED_FILE", 500);
  }
  return { iterations, keyLength };
}

function deriveKey(envelope, team, password) {
  const { iterations, keyLength } = cryptoParams(envelope);
  const salt = Buffer.from(String(envelope.crypto.salt || ""), "base64");
  if (salt.length < 8) throw appError("Ongeldige salt in roosterbestand.", "INVALID_ENCRYPTED_FILE", 500);
  return pbkdf2Sync(Buffer.from(`${team}\0${password}`, "utf8"), salt, iterations, keyLength / 8, "sha256");
}

function decryptEnvelope(envelope, team, password) {
  try {
    const key = deriveKey(envelope, team, password);
    const iv = Buffer.from(String(envelope.crypto.iv || ""), "base64");
    const combined = Buffer.from(String(envelope.payload || ""), "base64");
    if (iv.length !== 12 || combined.length <= 16) throw new Error("invalid encrypted data");
    const decipher = createDecipheriv(`aes-${key.length * 8}-gcm`, key, iv);
    decipher.setAuthTag(combined.subarray(combined.length - 16));
    const plain = Buffer.concat([decipher.update(combined.subarray(0, combined.length - 16)), decipher.final()]).toString("utf8");
    const parsed = JSON.parse(plain);
    if (parsed?.kind !== "roosterhulp-index" || !Array.isArray(parsed?.employees)) throw new Error("invalid decrypted structure");
    return parsed;
  } catch (error) {
    if (error?.code && error?.status) throw error;
    throw appError("Team-ID of Team Wachtwoord is niet correct. Bestand is NIET naar de repo gestuurd.", "INVALID_TEAM_CREDENTIALS", 401);
  }
}

function encryptIndex(index, team, password) {
  const salt = randomBytes(16);
  const iv = randomBytes(12);
  const envelope = {
    schemaVersion: 1,
    kind: "roosterhulp-encrypted-index",
    encrypted: true,
    crypto: {
      version: 1,
      kdf: "PBKDF2",
      hash: "SHA-256",
      iterations: 250000,
      salt: salt.toString("base64"),
      cipher: "AES-GCM",
      keyLength: 256,
      iv: iv.toString("base64"),
    },
    payload: "",
    updatedAt: new Date().toISOString(),
  };
  const key = pbkdf2Sync(Buffer.from(`${team}\0${password}`, "utf8"), salt, 250000, 32, "sha256");
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const cipherText = Buffer.concat([cipher.update(Buffer.from(JSON.stringify(index), "utf8")), cipher.final()]);
  envelope.payload = Buffer.concat([cipherText, cipher.getAuthTag()]).toString("base64");
  return `${JSON.stringify(envelope, null, 2)}\n`;
}

async function handleStore(body) {
  const team = String(body?.team || "").trim();
  const password = String(body?.password || "");
  if (!team || !password || team.length > 200 || password.length > 500) {
    throw appError("Team-ID en Team Wachtwoord zijn verplicht.", "MISSING_CREDENTIALS", 400);
  }
  const index = body?.index;
  const target = targetFor(index);
  const existing = await getRepoFile(target.file);
  let verifyFile = existing;
  if (!verifyFile) verifyFile = await getRepoFile(target.annual);
  if (!verifyFile) throw appError(`Geen bestaand ${target.file} of ${target.annual} gevonden om de teambeveiliging te controleren.`, "VERIFY_FILE_NOT_FOUND", 404);
  let secured;
  try { secured = JSON.parse(verifyFile.text); }
  catch { throw appError("Bestaand beveiligd roosterbestand bevat geen geldige JSON.", "INVALID_ENCRYPTED_FILE", 500); }
  decryptEnvelope(secured, team, password);
  const encrypted = encryptIndex(index, team, password);
  const result = await putRepoFile(target.file, encrypted, existing?.sha || null);
  return {
    ok: true,
    file: target.file,
    monthKey: target.monthKey,
    commit: result?.commit?.sha || null,
    storedAt: new Date().toISOString(),
  };
}

http.createServer = function patchedCreateServer(listener) {
  return originalCreateServer(async (req, res) => {
    const origin = String(req.headers.origin || "");
    const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
    const isTeamRoute = url.pathname === "/api/team-rooster/store";
    if (!isTeamRoute) return listener(req, res);

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
      sendJson(res, 200, await handleStore(body), origin);
    } catch (error) {
      sendJson(res, Number(error?.status) || 500, {
        ok: false,
        code: error?.code || "INTERNAL_ERROR",
        message: error?.message || "Onbekende serverfout.",
      }, origin);
    }
  });
};
