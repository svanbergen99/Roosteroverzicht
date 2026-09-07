const nativeFetch = globalThis.fetch.bind(globalThis);

function requestUrl(input) {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.href;
  return String(input?.url || "");
}

async function reportGitHubAccess() {
  const token = String(process.env.GITHUB_TOKEN || "").trim();
  const repo = String(process.env.GITHUB_REPO || "svanbergen99/Roosteroverzicht").trim();
  if (!token || !repo) {
    console.log("GitHub repo access: not configured");
    return;
  }

  try {
    const response = await nativeFetch(`https://api.github.com/repos/${repo}`, {
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${token}`,
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": "roosteroverzicht-rooster-bridge",
      },
      signal: AbortSignal.timeout(15000),
    });
    const data = await response.json().catch(() => ({}));
    console.log(`GitHub repo access: status=${response.status} pull=${Boolean(data?.permissions?.pull)} push=${Boolean(data?.permissions?.push)} admin=${Boolean(data?.permissions?.admin)}`);
  } catch (error) {
    console.log(`GitHub repo access check failed: ${error?.message || error}`);
  }
}

globalThis.fetch = async function rosterBridgeFetch(input, init = {}) {
  const url = requestUrl(input);
  const response = await nativeFetch(input, init);

  if (!response.ok || !url.startsWith("https://api.github.com/repos/") || !url.includes("/contents/")) {
    return response;
  }

  let metadata;
  try {
    metadata = await response.clone().json();
  } catch {
    return response;
  }

  if (!metadata || Array.isArray(metadata) || metadata.type !== "file" || metadata.content || !metadata.sha) {
    return response;
  }

  const parsed = new URL(url);
  const contentsMarker = "/contents/";
  const markerIndex = parsed.pathname.indexOf(contentsMarker);
  if (markerIndex < 0) return response;

  const repositoryPath = parsed.pathname.slice(0, markerIndex);
  const blobUrl = `${parsed.origin}${repositoryPath}/git/blobs/${encodeURIComponent(metadata.sha)}`;
  const blobResponse = await nativeFetch(blobUrl, {
    method: "GET",
    headers: init?.headers,
    signal: init?.signal,
  });

  if (!blobResponse.ok) return blobResponse;

  let blob;
  try {
    blob = await blobResponse.json();
  } catch {
    return response;
  }

  if (!blob?.content || String(blob?.encoding || "base64").toLowerCase() !== "base64") {
    return response;
  }

  const hydrated = {
    ...metadata,
    content: blob.content,
    encoding: "base64",
    size: blob.size ?? metadata.size,
  };

  const headers = new Headers(response.headers);
  headers.set("content-type", "application/json; charset=utf-8");
  headers.delete("content-length");

  return new Response(JSON.stringify(hydrated), {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
};

await reportGitHubAccess();
await import("./team-api.js");
await import("./server.js");
