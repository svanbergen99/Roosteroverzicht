import http from "node:http";
import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

const originalCreateServer = http.createServer.bind(http);
const REPO = String(process.env.GITHUB_REPO || "svanbergen99/Roosteroverzicht").trim();
const BRANCH = String(process.env.GITHUB_BRANCH || "main").trim();
const PROFILES_PATH = "colleague-profiles-secure.json";
const PUBLIC_ORIGIN = "https://svanbergen99.github.io";
const MAX_BODY = 256 * 1024;
const MAX_PROFILES = 5000;

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

function encryptionKey() {
  return createHash("sha256").update(secret(), "utf8").digest();
}

function opaqueHash(kind, value) {
  return createHmac("sha256", secret()).update(`${kind}:${String(value || "")}`, "utf8").digest("hex");
}

function sealObject(value) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(Buffer.from(JSON.stringify(value), "utf8")), cipher.final()]);
  return Buffer.concat([iv, encrypted, cipher.getAuthTag()]).toString("base64url");
}

function openObject(token) {
  try {
    const raw = Buffer.from(String(token || ""), "base64url");
    if (raw.length <= 28) throw new Error("invalid cipher");
    const iv = raw.subarray(0, 12);
    const tag = raw.subarray(raw.length - 16);
    const encrypted = raw.subarray(12, raw.length - 16);
    const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), iv);
    decipher.setAuthTag(tag);
    return JSON.parse(Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf8"));
  } catch {
    throw appError("Het opgeslagen collega-profiel kan niet worden geopend.", "PROFILE_DATA_INVALID", 500);
  }
}

function validateBrowserId(value) {
  const id = String(value || "").trim();
  if (!/^[A-Za-z0-9_-]{32,160}$/.test(id)) throw appError("Browsercode is ongeldig.", "INVALID_BROWSER_ID", 400);
  return id;
}

function validateAa(value) {
  const aa = String(value || "").trim();
  if (!/^[A-Za-z0-9._@-]{2,80}$/.test(aa)) throw appError("AA-nummer heeft geen geldig formaat.", "INVALID_AA", 400);
  return aa;
}

function validateText(value, label, max = 120) {
  const text = String(value || "").trim().replace(/\s+/g, " ");
  if (text.length < 2 || text.length > max) throw appError(`${label} ontbreekt of is ongeldig.`, `INVALID_${label.toUpperCase().replace(/[^A-Z0-9]+/g, "_")}`, 400);
  return text;
}

function birthdayFromDate(value) {
  const input = String(value || "").trim();
  const match = input.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) throw appError("Geboortedatum is ongeldig.", "INVALID_BIRTH_DATE", 400);
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (year < 1900 || year > new Date().getUTCFullYear() || date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
    throw appError("Geboortedatum is ongeldig.", "INVALID_BIRTH_DATE", 400);
  }
  return `${match[2]}-${match[3]}`;
}

function normalizeUnlockType(value, legacyPin = "") {
  const raw = String(value || (legacyPin ? "pin" : "none")).trim().toLowerCase();
  if (["none", "pin", "password"].includes(raw)) return raw;
  throw appError("Persoonlijke ontgrendeling is ongeldig.", "INVALID_UNLOCK_TYPE", 400);
}

function credentialVerifier(type, credential) {
  const kind = normalizeUnlockType(type);
  if (kind === "none") return null;

  const raw = String(credential ?? "");
  let value = raw;
  if (kind === "pin") {
    value = raw.trim();
    if (!/^\d{4,6}$/.test(value)) throw appError("Persoonlijke pincode moet uit 4 t/m 6 cijfers bestaan.", "INVALID_PIN", 400);
  } else if (value.length < 6 || value.length > 72) {
    throw appError("Persoonlijk wachtwoord moet uit 6 t/m 72 tekens bestaan.", "INVALID_PERSONAL_PASSWORD", 400);
  }

  const salt = randomBytes(16);
  const hash = scryptSync(value, salt, 32);
  return {
    type: kind,
    salt: salt.toString("base64url"),
    hash: hash.toString("base64url"),
  };
}

function storedVerifier(decoded) {
  const next = decoded?.unlockVerifier;
  if (next?.salt && next?.hash && ["pin", "password"].includes(String(next.type || ""))) {
    return { type: String(next.type), salt: String(next.salt), hash: String(next.hash) };
  }
  const legacy = decoded?.pinVerifier;
  if (legacy?.salt && legacy?.hash) return { type: "pin", salt: String(legacy.salt), hash: String(legacy.hash) };
  return null;
}

function verifyCredential(credential, verifier) {
  if (!verifier?.salt || !verifier?.hash) return true;
  const type = verifier.type === "password" ? "password" : "pin";
  const raw = String(credential ?? "");
  const value = type === "pin" ? raw.trim() : raw;
  if (type === "pin" && !/^\d{4,6}$/.test(value)) return false;
  if (type === "password" && (value.length < 6 || value.length > 72)) return false;
  try {
    const salt = Buffer.from(verifier.salt, "base64url");
    const expected = Buffer.from(verifier.hash, "base64url");
    const actual = scryptSync(value, salt, expected.length);
    return expected.length === actual.length && timingSafeEqual(expected, actual);
  } catch {
    return false;
  }
}

function githubHeaders() {
  const token = String(process.env.GITHUB_TOKEN || "").trim();
  if (!token) throw appError("GITHUB_TOKEN ontbreekt op Railway.", "NOT_CONFIGURED", 503);
  return {
    Accept: "application/vnd.github+json",
    Authorization: `Bearer ${token}`,
    "X-GitHub-Api-Version": "2022-11-28",
    "Content-Type": "application/json",
    "User-Agent": "roosteroverzicht-colleague-profile",
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

async function getProfilesFile() {
  try {
    const meta = await gh(`/contents/${encodeURIComponent(PROFILES_PATH)}?ref=${encodeURIComponent(BRANCH)}`);
    const parsed = JSON.parse(Buffer.from(String(meta?.content || "").replace(/\s+/g, ""), "base64").toString("utf8") || "{}");
    return {
      sha: meta.sha,
      data: {
        version: 1,
        profiles: Array.isArray(parsed?.profiles) ? parsed.profiles : [],
      },
    };
  } catch (error) {
    if (error?.githubStatus === 404) return { sha: null, data: { version: 1, profiles: [] } };
    throw error;
  }
}

async function putProfilesFile(data, sha) {
  return gh(`/contents/${encodeURIComponent(PROFILES_PATH)}`, {
    method: "PUT",
    body: JSON.stringify({
      message: "Update encrypted colleague profiles",
      content: Buffer.from(`${JSON.stringify(data, null, 2)}\n`, "utf8").toString("base64"),
      branch: BRANCH,
      ...(sha ? { sha } : {}),
    }),
  });
}

async function mutateProfiles(mutator) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const file = await getProfilesFile();
    const next = await mutator(file.data);
    try {
      const result = await putProfilesFile(next, file.sha);
      return { data: next, commit: result?.commit?.sha || null };
    } catch (error) {
      if (error?.githubStatus !== 409 || attempt === 2) throw error;
    }
  }
  throw appError("Profiel kon niet worden opgeslagen door een gelijktijdige wijziging.", "PROFILE_CONFLICT", 409);
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

function sendJson(res, status, body, origin) {
  const headers = {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "x-content-type-options": "nosniff",
    "referrer-policy": "no-referrer",
  };
  if (origin === PUBLIC_ORIGIN) {
    headers["access-control-allow-origin"] = origin;
    headers.vary = "Origin";
  }
  res.writeHead(status, headers);
  res.end(JSON.stringify(body));
}

function decodeEntry(entry) {
  const decoded = openObject(entry?.profileCipher);
  if (decoded?.v !== 1 || decoded?.purpose !== "colleague-profile") throw appError("Collega-profiel is ongeldig.", "PROFILE_DATA_INVALID", 500);
  return decoded;
}

function publicProfile(decoded) {
  const verifier = storedVerifier(decoded);
  return {
    name: String(decoded.name || ""),
    location: String(decoded.location || ""),
    birthday: String(decoded.birthday || ""),
    hasUnlock: Boolean(verifier),
    unlockType: verifier?.type || "none",
    hasPin: verifier?.type === "pin",
  };
}

function findProfileEntry(file, browserHash) {
  return file.data.profiles
    .filter(item => item?.browserHash === browserHash && item?.profileCipher)
    .sort((a, b) => String(b?.updatedAt || "").localeCompare(String(a?.updatedAt || "")))[0] || null;
}

async function resolveProfile(body) {
  const browserId = validateBrowserId(body?.browserId);
  const browserHash = opaqueHash("profile-browser", browserId);
  const file = await getProfilesFile();
  const match = findProfileEntry(file, browserHash);
  if (!match) throw appError("Voor deze browser is nog geen collega-profiel opgeslagen.", "PROFILE_NOT_FOUND", 404);
  const decoded = decodeEntry(match);
  const verifier = storedVerifier(decoded);
  if (verifier) return { ok: true, locked: true, unlockType: verifier.type };
  return { ok: true, locked: false, profile: publicProfile(decoded) };
}

async function saveProfile(body) {
  const browserId = validateBrowserId(body?.browserId);
  const aa = validateAa(body?.aa);
  const name = validateText(body?.name, "Naam", 120);
  const location = validateText(body?.location, "Locatie", 120);
  const birthday = birthdayFromDate(body?.birthDate);
  const unlockType = normalizeUnlockType(body?.unlockType, body?.pin);
  const credential = body?.credential ?? body?.pin ?? "";
  const verifier = credentialVerifier(unlockType, credential);
  const browserHash = opaqueHash("profile-browser", browserId);
  const aaHash = opaqueHash("profile-aa", aa.toLocaleLowerCase("nl-NL"));
  const now = new Date().toISOString();
  const profileCipher = sealObject({
    v: 1,
    purpose: "colleague-profile",
    name,
    location,
    birthday,
    unlockVerifier: verifier,
  });

  const result = await mutateProfiles((data) => {
    const profiles = (Array.isArray(data?.profiles) ? data.profiles : [])
      .filter(item => item?.browserHash !== browserHash);
    profiles.push({ browserHash, aaHash, profileCipher, updatedAt: now });
    profiles.sort((a, b) => String(b?.updatedAt || "").localeCompare(String(a?.updatedAt || "")));
    return { version: 1, profiles: profiles.slice(0, MAX_PROFILES) };
  });

  return {
    ok: true,
    profile: { name, location, birthday, hasUnlock: Boolean(verifier), unlockType: verifier?.type || "none", hasPin: verifier?.type === "pin" },
    commit: result.commit,
  };
}

async function verifyProfileUnlock(body, legacyPinRoute = false) {
  const browserId = validateBrowserId(body?.browserId);
  const browserHash = opaqueHash("profile-browser", browserId);
  const file = await getProfilesFile();
  const match = findProfileEntry(file, browserHash);
  if (!match) throw appError("Voor deze browser is nog geen collega-profiel opgeslagen.", "PROFILE_NOT_FOUND", 404);
  const decoded = decodeEntry(match);
  const verifier = storedVerifier(decoded);
  const supplied = legacyPinRoute ? body?.pin : body?.credential;
  if (verifier && !verifyCredential(supplied, verifier)) {
    const message = verifier.type === "password" ? "Persoonlijk wachtwoord is niet juist." : "Persoonlijke pincode is niet juist.";
    throw appError(message, "PROFILE_UNLOCK_INCORRECT", 401);
  }
  return { ok: true, profile: publicProfile(decoded) };
}

http.createServer = function patchedCreateServer(listener) {
  return originalCreateServer(async (req, res) => {
    const origin = String(req.headers.origin || "");
    const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
    const route = url.pathname;
    const isProfileRoute = route === "/api/colleague-profile/resolve" ||
      route === "/api/colleague-profile/save" ||
      route === "/api/colleague-profile/verify-unlock" ||
      route === "/api/colleague-profile/verify-pin";
    if (!isProfileRoute) return listener(req, res);

    if (req.method === "OPTIONS") {
      if (origin !== PUBLIC_ORIGIN) { res.writeHead(403); res.end(); return; }
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

    if (origin !== PUBLIC_ORIGIN) {
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
      if (route.endsWith("/save")) result = await saveProfile(body);
      else if (route.endsWith("/verify-unlock")) result = await verifyProfileUnlock(body, false);
      else if (route.endsWith("/verify-pin")) result = await verifyProfileUnlock(body, true);
      else result = await resolveProfile(body);
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
