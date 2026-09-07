import http from "node:http";
import {
  createCipheriv,
  createDecipheriv,
  pbkdf2Sync,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";

const PORT = Number(process.env.PORT || 8080);
const ALLOWED_ORIGIN = String(process.env.ALLOWED_ORIGIN || "https://svanbergen99.github.io").trim();
const GITHUB_REPO = String(process.env.GITHUB_REPO || "svanbergen99/Roosteroverzicht").trim();
const GITHUB_BRANCH = String(process.env.GITHUB_BRANCH || "main").trim();
const MAX_BODY_BYTES = 512 * 1024;
const MONTH_NAMES = [
  "Januari", "Februari", "Maart", "April", "Mei", "Juni",
  "Juli", "Augustus", "September", "Oktober", "November", "December",
];

function readEnv(name) {
  return String(process.env[name] || "").trim();
}

function appError(message, code = "BAD_REQUEST", status = 400) {
  const error = new Error(message);
  error.code = code;
  error.status = status;
  return error;
}

function safeEqual(a, b) {
  const left = Buffer.from(String(a || ""));
  const right = Buffer.from(String(b || ""));
  return left.length > 0 && left.length === right.length && timingSafeEqual(left, right);
}

function sendJson(res, status, body, origin = "") {
  const headers = {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "x-content-type-options": "nosniff",
    "referrer-policy": "no-referrer",
  };
  if (origin === ALLOWED_ORIGIN) {
    headers["access-control-allow-origin"] = origin;
    headers.vary = "Origin";
  }
  res.writeHead(status, headers);
  res.end(JSON.stringify(body));
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        reject(appError("Roosterscan is te groot.", "PAYLOAD_TOO_LARGE", 413));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => {
      try {
        const text = Buffer.concat(chunks).toString("utf8");
        resolve(JSON.parse(text || "{}"));
      } catch {
        reject(appError("Aanvraag bevat geen geldige JSON.", "INVALID_JSON", 400));
      }
    });
    req.on("error", reject);
  });
}

function githubHeaders() {
  const token = readEnv("GITHUB_TOKEN");
  if (!token) throw appError("GITHUB_TOKEN ontbreekt op Railway.", "NOT_CONFIGURED", 503);
  return {
    Accept: "application/vnd.github+json",
    Authorization: `Bearer ${token}`,
    "X-GitHub-Api-Version": "2022-11-28",
    "Content-Type": "application/json",
    "User-Agent": "roosteroverzicht-rooster-bridge",
  };
}

async function github(path, init = {}) {
  const response = await fetch(`https://api.github.com/repos/${GITHUB_REPO}${path}`, {
    ...init,
    headers: { ...githubHeaders(), ...(init.headers || {}) },
    signal: AbortSignal.timeout(15000),
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
    const data = await github(`/contents/${encoded}?ref=${encodeURIComponent(GITHUB_BRANCH)}`);
    const text = Buffer.from(String(data?.content || "").replace(/\s+/g, ""), "base64").toString("utf8");
    return { sha: data.sha, text };
  } catch (error) {
    if (error?.githubStatus === 404) return null;
    throw error;
  }
}

async function commitFiles(files, message) {
  const ref = await github(`/git/ref/heads/${encodeURIComponent(GITHUB_BRANCH)}`);
  const head = ref?.object?.sha;
  if (!head) throw appError("GitHub branch-head ontbreekt.", "GITHUB_ERROR", 502);

  const headCommit = await github(`/git/commits/${head}`);
  const baseTree = headCommit?.tree?.sha;
  if (!baseTree) throw appError("GitHub basis-tree ontbreekt.", "GITHUB_ERROR", 502);

  const treeItems = [];
  for (const file of files) {
    const blob = await github("/git/blobs", {
      method: "POST",
      body: JSON.stringify({ content: file.content, encoding: "utf-8" }),
    });
    treeItems.push({ path: file.path, mode: "100644", type: "blob", sha: blob.sha });
  }

  const tree = await github("/git/trees", {
    method: "POST",
    body: JSON.stringify({ base_tree: baseTree, tree: treeItems }),
  });
  const commit = await github("/git/commits", {
    method: "POST",
    body: JSON.stringify({ message, tree: tree.sha, parents: [head] }),
  });
  await github(`/git/refs/heads/${encodeURIComponent(GITHUB_BRANCH)}`, {
    method: "PATCH",
    body: JSON.stringify({ sha: commit.sha, force: false }),
  });
  return commit.sha;
}

function validDate(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(value || ""));
}

function normalizedSchedules(payload) {
  return (Array.isArray(payload?.schedules) ? payload.schedules : [])
    .map((schedule) => ({
      date: String(schedule?.date || "").slice(0, 10),
      start: String(schedule?.start || ""),
      end: String(schedule?.end || ""),
      activities: (Array.isArray(schedule?.activities) ? schedule.activities : []).map((activity) => ({
        start: String(activity?.start || ""),
        end: String(activity?.end || ""),
        ...(Number(activity?.minutes) ? { minutes: Number(activity.minutes) } : {}),
        type: String(activity?.type || ""),
        name: String(activity?.name || ""),
        raw: String(activity?.raw || ""),
        rgb: String(activity?.rgb || ""),
        color: String(activity?.color || ""),
      })),
    }))
    .filter((schedule) => validDate(schedule.date))
    .sort((a, b) => a.date.localeCompare(b.date) || a.start.localeCompare(b.start));
}

function targetFor(payload) {
  const schedules = normalizedSchedules(payload);
  if (!schedules.length) throw appError("De scan bevat geen geldige roosterregels.", "INVALID_SCAN", 400);

  const counts = new Map();
  for (const schedule of schedules) {
    const key = schedule.date.slice(0, 7);
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  const monthKey = [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0];
  if (!monthKey) throw appError("De dominante scanmaand kon niet worden bepaald.", "INVALID_SCAN", 400);

  const year = Number(monthKey.slice(0, 4));
  const month = Number(monthKey.slice(5, 7));
  if (!Number.isInteger(year) || month < 1 || month > 12) {
    throw appError("Ongeldige scanmaand.", "INVALID_SCAN", 400);
  }

  return {
    schedules,
    monthKey,
    year,
    month,
    start: schedules[0].date,
    end: schedules.at(-1).date,
    file: `Roosterindex_${MONTH_NAMES[month - 1]}_${year}.json`,
    annual: `Roosterindex_${year}.json`,
  };
}

function signature(value) {
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

function findEmployee(index, name) {
  const sig = signature(name);
  return (index?.employees || []).find((employee) => signature(employee?.name) === sig) || null;
}

function employeeNames(annual, monthly) {
  const names = new Map();
  for (const employee of [...(annual?.employees || []), ...(monthly?.employees || [])]) {
    const name = String(employee?.name || "").trim();
    if (name) names.set(signature(name), name);
  }
  return [...names.values()].sort((a, b) => a.localeCompare(b, "nl-NL"));
}

function upsertEmployee(index, name, templateEmployee, schedules) {
  let employee = findEmployee(index, name);
  if (!employee) {
    employee = { ...(templateEmployee || {}), name, schedules: [] };
    index.employees.push(employee);
  }
  employee.schedules = schedules;
  return employee;
}

function mergeCurrentSchedules(existing, scan, start, end) {
  const keep = (Array.isArray(existing) ? existing : []).filter((schedule) => {
    const date = String(schedule?.date || "").slice(0, 10);
    return !validDate(date) || date < start || date > end;
  });
  return [...keep, ...scan].sort(
    (a, b) => String(a.date || "").localeCompare(String(b.date || ""))
      || String(a.start || "").localeCompare(String(b.start || "")),
  );
}

function todayAmsterdam() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Amsterdam",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const get = (type) => parts.find((part) => part.type === type)?.value || "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

function archivePast(annual, monthlyEmployee, templateEmployee, year) {
  const today = todayAmsterdam();
  const past = (monthlyEmployee?.schedules || []).filter((schedule) => {
    const date = String(schedule?.date || "").slice(0, 10);
    return date.startsWith(`${year}-`) && date <= today;
  });
  if (!past.length) return;

  let annualEmployee = findEmployee(annual, monthlyEmployee.name);
  if (!annualEmployee) {
    annualEmployee = { ...(templateEmployee || monthlyEmployee), schedules: [] };
    annual.employees.push(annualEmployee);
  }
  const replaceDates = new Set(past.map((schedule) => String(schedule.date).slice(0, 10)));
  annualEmployee.schedules = [
    ...(annualEmployee.schedules || []).filter(
      (schedule) => !replaceDates.has(String(schedule?.date || "").slice(0, 10)),
    ),
    ...past,
  ].sort(
    (a, b) => String(a.date || "").localeCompare(String(b.date || ""))
      || String(a.start || "").localeCompare(String(b.start || "")),
  );
}

function prepareMonthly(existing, annual, employeeName, target, payload) {
  const monthName = MONTH_NAMES[target.month - 1];
  const base = existing || { kind: "roosterhulp-index", period: {}, display: {}, employees: [], source: {} };
  if (!Array.isArray(base.employees)) base.employees = [];

  const annualEmployee = findEmployee(annual, employeeName);
  const oldEmployee = findEmployee(base, employeeName);
  if (!annualEmployee && !oldEmployee) {
    throw appError("De gekozen roosternaam bestaat niet in de beveiligde roosterbestanden.", "EMPLOYEE_NOT_FOUND", 400);
  }

  const merged = mergeCurrentSchedules(oldEmployee?.schedules, target.schedules, target.start, target.end);
  const employee = upsertEmployee(base, annualEmployee?.name || employeeName, oldEmployee || annualEmployee, merged);
  base.kind = "roosterhulp-index";
  base.period = {
    ...(base.period || {}),
    start: target.start,
    end: target.end,
    month: target.monthKey,
    label: `${target.start} t/m ${target.end}`,
  };
  base.display = {
    ...(base.display || {}),
    calendarName: `Rooster : ${monthName}`,
    appointmentName: base.display?.appointmentName || annual.display?.appointmentName || "Werkrooster",
  };
  base.source = {
    ...(base.source || {}),
    latestWfmScan: {
      scannedAt: payload?.scannedAt || new Date().toISOString(),
      rangeStart: target.start,
      rangeEnd: target.end,
      dominantMonth: target.monthKey,
      method: "secure-roster-scan-railway-bridge",
    },
  };
  return { monthly: base, employee, annualEmployee };
}

function cryptoParams(envelope) {
  if (envelope?.kind !== "roosterhulp-encrypted-index" || envelope?.encrypted !== true) {
    throw appError("Onverwacht beveiligd bestandsformaat.", "INVALID_ENCRYPTED_FILE", 500);
  }
  const crypto = envelope.crypto || {};
  const algorithm = String(crypto.algorithm || "AES-GCM").toUpperCase();
  const kdf = String(crypto.kdf || "PBKDF2").toUpperCase();
  const hash = String(crypto.hash || "SHA-256").toUpperCase();
  const iterations = Number(crypto.iterations || 250000);
  const keyLength = Number(crypto.keyLength || 256);
  if (algorithm !== "AES-GCM" || kdf !== "PBKDF2" || hash !== "SHA-256") {
    throw appError("Niet-ondersteunde versleutelingsinstellingen.", "INVALID_ENCRYPTED_FILE", 500);
  }
  if (!Number.isInteger(iterations) || iterations < 10000 || ![128, 192, 256].includes(keyLength)) {
    throw appError("Ongeldige versleutelingsinstellingen.", "INVALID_ENCRYPTED_FILE", 500);
  }
  return { iterations, keyLength };
}

function deriveKey(envelope, team, password) {
  const { iterations, keyLength } = cryptoParams(envelope);
  const salt = Buffer.from(String(envelope.crypto?.salt || ""), "base64");
  if (salt.length < 8) throw appError("Ongeldige salt in roosterbestand.", "INVALID_ENCRYPTED_FILE", 500);
  return pbkdf2Sync(Buffer.from(`${team}\0${password}`, "utf8"), salt, iterations, keyLength / 8, "sha256");
}

function decryptEnvelope(envelope, team, password) {
  try {
    const key = deriveKey(envelope, team, password);
    const iv = Buffer.from(String(envelope.crypto?.iv || ""), "base64");
    const combined = Buffer.from(String(envelope.payload || ""), "base64");
    if (iv.length !== 12 || combined.length <= 16) throw new Error("invalid encrypted data");
    const cipherText = combined.subarray(0, combined.length - 16);
    const authTag = combined.subarray(combined.length - 16);
    const decipher = createDecipheriv(`aes-${key.length * 8}-gcm`, key, iv);
    decipher.setAuthTag(authTag);
    const plain = Buffer.concat([decipher.update(cipherText), decipher.final()]).toString("utf8");
    const parsed = JSON.parse(plain);
    if (parsed?.kind !== "roosterhulp-index" || !Array.isArray(parsed.employees)) {
      throw new Error("invalid decrypted structure");
    }
    return parsed;
  } catch (error) {
    if (error?.code && error?.status) throw error;
    throw appError("Team-ID of Team Wachtwoord is onjuist, of het roosterbestand kan niet worden ontsleuteld.", "INVALID_TEAM_CREDENTIALS", 401);
  }
}

function newEnvelope(template) {
  const out = structuredClone(template);
  out.kind = "roosterhulp-encrypted-index";
  out.encrypted = true;
  out.payload = "";
  out.crypto = {
    ...(out.crypto || {}),
    algorithm: "AES-GCM",
    kdf: "PBKDF2",
    hash: out.crypto?.hash || "SHA-256",
    iterations: Number(out.crypto?.iterations) || 250000,
    keyLength: Number(out.crypto?.keyLength) || 256,
    salt: randomBytes(16).toString("base64"),
    iv: randomBytes(12).toString("base64"),
  };
  return out;
}

function encryptEnvelope(envelope, parsed, team, password) {
  const next = structuredClone(envelope);
  next.crypto = { ...(next.crypto || {}), iv: randomBytes(12).toString("base64") };
  const key = deriveKey(next, team, password);
  const iv = Buffer.from(next.crypto.iv, "base64");
  const cipher = createCipheriv(`aes-${key.length * 8}-gcm`, key, iv);
  const cipherText = Buffer.concat([
    cipher.update(Buffer.from(JSON.stringify(parsed), "utf8")),
    cipher.final(),
  ]);
  const combined = Buffer.concat([cipherText, cipher.getAuthTag()]);
  next.payload = combined.toString("base64");
  next.updatedAt = new Date().toISOString();
  return `${JSON.stringify(next, null, 2)}\n`;
}

async function loadForScan(team, password, target) {
  const annualFile = await getRepoFile(target.annual);
  if (!annualFile) throw appError(`${target.annual} bestaat niet.`, "ANNUAL_NOT_FOUND", 404);

  let annualSec;
  try { annualSec = JSON.parse(annualFile.text); }
  catch { throw appError(`${target.annual} bevat ongeldige JSON.`, "INVALID_ENCRYPTED_FILE", 500); }
  const annual = decryptEnvelope(annualSec, team, password);

  const monthlyFile = await getRepoFile(target.file);
  let monthlySec = null;
  let monthly = null;
  if (monthlyFile) {
    try { monthlySec = JSON.parse(monthlyFile.text); }
    catch { throw appError(`${target.file} bevat ongeldige JSON.`, "INVALID_ENCRYPTED_FILE", 500); }
    monthly = decryptEnvelope(monthlySec, team, password);
  }
  return { annualSec, annual, monthlySec, monthly };
}

function credentialsFromBody(body) {
  const team = String(body?.team || "").trim();
  const password = String(body?.password || "");
  if (!team || !password || team.length > 200 || password.length > 500) {
    throw appError("Team-ID en Team Wachtwoord zijn verplicht.", "MISSING_CREDENTIALS", 400);
  }
  return { team, password };
}

async function handlePrepare(body) {
  const { team, password } = credentialsFromBody(body);
  const target = targetFor(body?.payload);
  const loaded = await loadForScan(team, password, target);
  const names = employeeNames(loaded.annual, loaded.monthly);
  if (!names.length) throw appError("Er zijn geen roosternamen gevonden.", "NO_EMPLOYEES", 404);
  return {
    ok: true,
    target: { year: target.year, monthKey: target.monthKey, file: target.file, annual: target.annual },
    employees: names,
  };
}

async function handleStore(body) {
  const { team, password } = credentialsFromBody(body);
  const employeeName = String(body?.employee || "").trim();
  if (!employeeName || employeeName.length > 200) {
    throw appError("Kies een geldige roosternaam.", "MISSING_EMPLOYEE", 400);
  }

  const target = targetFor(body?.payload);
  const loaded = await loadForScan(team, password, target);
  const allowedNames = employeeNames(loaded.annual, loaded.monthly);
  const canonicalName = allowedNames.find((name) => signature(name) === signature(employeeName));
  if (!canonicalName) {
    throw appError("De gekozen roosternaam bestaat niet in de beveiligde bestanden.", "EMPLOYEE_NOT_FOUND", 400);
  }

  const prepared = prepareMonthly(loaded.monthly, loaded.annual, canonicalName, target, body.payload);
  archivePast(loaded.annual, prepared.employee, prepared.annualEmployee, target.year);
  loaded.annual.source = {
    ...(loaded.annual.source || {}),
    annualArchiveUpdatedAt: new Date().toISOString(),
    annualArchiveMethod: "secure-roster-scan-railway-bridge",
  };

  const monthlyEnvelope = loaded.monthlySec || newEnvelope(loaded.annualSec);
  const monthlyContent = encryptEnvelope(monthlyEnvelope, prepared.monthly, team, password);
  const annualContent = encryptEnvelope(loaded.annualSec, loaded.annual, team, password);
  const commit = await commitFiles(
    [
      { path: target.annual, content: annualContent },
      { path: target.file, content: monthlyContent },
    ],
    `Store encrypted WFM scan for ${target.monthKey}`,
  );

  return {
    ok: true,
    commit,
    file: target.file,
    annual: target.annual,
    employee: canonicalName,
    rangeStart: target.start,
    rangeEnd: target.end,
    storedAt: new Date().toISOString(),
  };
}

const server = http.createServer(async (req, res) => {
  const origin = String(req.headers.origin || "");
  const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);

  if (req.method === "OPTIONS") {
    if (origin !== ALLOWED_ORIGIN || !["/api/rooster/prepare", "/api/rooster/store"].includes(url.pathname)) {
      res.writeHead(403);
      res.end();
      return;
    }
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

  if (req.method === "GET" && url.pathname === "/api/health") {
    sendJson(res, 200, {
      ok: true,
      githubConfigured: Boolean(readEnv("GITHUB_TOKEN")),
      repo: GITHUB_REPO,
      branch: GITHUB_BRANCH,
      service: "roosteroverzicht-rooster-bridge",
    }, origin);
    return;
  }

  if (origin !== ALLOWED_ORIGIN) {
    sendJson(res, 403, { ok: false, code: "ORIGIN_DENIED", message: "Deze origin wordt niet geaccepteerd." }, origin);
    return;
  }

  try {
    if (req.method === "POST" && url.pathname === "/api/rooster/prepare") {
      const body = await readJsonBody(req);
      sendJson(res, 200, await handlePrepare(body), origin);
      return;
    }
    if (req.method === "POST" && url.pathname === "/api/rooster/store") {
      const body = await readJsonBody(req);
      sendJson(res, 200, await handleStore(body), origin);
      return;
    }
    sendJson(res, 404, { ok: false, code: "NOT_FOUND", message: "Route niet gevonden." }, origin);
  } catch (error) {
    const status = Number(error?.status) || 500;
    sendJson(res, status, {
      ok: false,
      code: error?.code || "INTERNAL_ERROR",
      message: error?.message || "Onbekende serverfout.",
    }, origin);
  }
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`Rooster bridge luistert op poort ${PORT}`);
});
