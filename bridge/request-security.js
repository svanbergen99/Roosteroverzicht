// Parse only HTTP origin-form targets. Host is validated but never used for routing.
export function requestUrl(req) {
  const target = req.url || "/";
  if (target.length > 4096 || !target.startsWith("/") || target.startsWith("//") || /[\\\u0000-\u0020\u007f]/u.test(target)) {
    throw new Error("INVALID_REQUEST_TARGET");
  }
  const host = req.headers.host;
  if (typeof host !== "string" || !host || /[\s/@?#\\]/u.test(host)) throw new Error("INVALID_HOST");
  const parsedHost = new URL(`http://${host}`);
  if (!parsedHost.hostname || parsedHost.username || parsedHost.password || parsedHost.pathname !== "/") throw new Error("INVALID_HOST");
  const url = new URL(target, "http://example.invalid");
  const decoded = decodeURIComponent(url.pathname);
  if (/[\\\u0000-\u001f\u007f]/u.test(decoded)) throw new Error("INVALID_REQUEST_TARGET");
  return url;
}

export const serverLimits = Object.freeze({
  maxHeaderSize: 16384,
  headersTimeout: 10000,
  requestTimeout: 15000,
  keepAliveTimeout: 5000,
  connectionsCheckingInterval: 1000
});

export function limitConnections(server) {
  server.maxHeadersCount = 64;
  server.maxRequestsPerSocket = 100;
  server.maxConnections = 256;
  server.setTimeout(20000, (socket) => socket.destroy());
}
