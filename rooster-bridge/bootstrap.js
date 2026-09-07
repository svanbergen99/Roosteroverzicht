const nativeFetch = globalThis.fetch.bind(globalThis);

function requestUrl(input) {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.href;
  return String(input?.url || "");
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

await import("./server.js");
