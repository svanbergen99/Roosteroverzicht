import assert from "node:assert/strict";
import http from "node:http";
import { fork } from "node:child_process";
import { randomBytes } from "node:crypto";
import { once } from "node:events";
import { fileURLToPath } from "node:url";

const origin = "https://svanbergen99.github.io";
if (process.argv[2] === "fixture") {
  // Import only the HTTP entry point. Synchronizers must never run in tests.
  let calls = 0;
  globalThis.fetch = async () => {
    calls += 1;
    process.send?.({ calls });
    return new Response(JSON.stringify({ result: { result: { item: { attributes: {
      panels: [{ panelIndex: "test-panel", panelConfig: { savedVis: { params: { markdown: "# Synthetic header" } } } }]
    } } } } }), { headers: { "content-type": "application/json" } });
  };
  const listen = http.Server.prototype.listen;
  http.Server.prototype.listen = function () {
    this.on("listening", () => process.send?.({ port: this.address().port }));
    return listen.call(this, 0, "127.0.0.1");
  };
  await import(process.argv[3] === "handoff" ? "./handoff-proxy.js" : "./server.js");
} else {
  const readKey = randomBytes(32).toString("hex");
  const pushKey = randomBytes(32).toString("hex");
  let checks = 0;
  for (const kind of ["bridge", "unconfigured", "handoff"]) {
    const child = fork(fileURLToPath(import.meta.url), ["fixture", kind], {
      env: {
        PATH: process.env.PATH,
        ALLOWED_ORIGIN: origin,
        TRAFFIC_READ_KEY: kind === "unconfigured" ? "" : readKey,
        TRAFFIC_PUSH_KEY: pushKey,
        KIBANA_AUTHORIZATION: "ApiKey synthetic",
        KIBANA_CONFIG: JSON.stringify({ origin: "https://example.invalid", space: "/s/test", dashboardId: "test-dashboard", dashboardVersion: 1, trafficPanelId: "test-panel" })
      },
      stdio: ["ignore", "ignore", "pipe", "ipc"]
    });
    let upstreamCalls = 0;
    let errors = "";
    child.stderr.on("data", (chunk) => { errors += chunk; });
    child.on("message", (msg) => { if (msg.calls) upstreamCalls = msg.calls; });
    try {
      const port = await new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error("fixture start timeout")), 5000);
        child.on("message", (msg) => { if (msg.port) { clearTimeout(timer); resolve(msg.port); } });
        child.once("exit", (code) => { clearTimeout(timer); reject(new Error(`fixture exited ${code}: ${errors}`)); });
      });
      const request = (path, headers = {}, method = "GET", body) => new Promise((resolve, reject) => {
        const req = http.request({ hostname: "127.0.0.1", port, path, method, headers }, (res) => {
          let text = "";
          res.on("data", (chunk) => { text += chunk; });
          res.on("end", () => resolve({ status: res.statusCode, headers: res.headers, text }));
        });
        req.setTimeout(2000, () => req.destroy(new Error("probe timeout")));
        req.on("error", reject);
        req.end(body);
      });
      const expect = async (expected, ...args) => {
        const response = await request(...args);
        assert.equal(response.status, expected, `${kind}: ${args[0]} must return ${expected}`);
        checks += 1;
        return response;
      };
      for (const host of ["[", "example.invalid@other", "example.invalid/path"]) await expect(400, "/api/health", { Host: host });
      for (const path of ["//example.invalid/api/health", "/%00", "/%", "http://example.invalid/api/health"]) await expect(400, path);
      assert.equal(child.exitCode, null, "malformed requests must not terminate the service");
      if (kind === "handoff") {
        await expect(405, "/api/open-tab");
        continue;
      }
      await expect(200, "/api/health");
      for (const path of ["/api/traffic-live", "/api/traffic-header"]) {
        if (kind === "unconfigured") {
          await expect(503, path, { Origin: origin });
          continue;
        }
        await expect(401, path);
        await expect(401, path, { Origin: origin });
        await expect(401, path, { Origin: origin, "x-traffic-read-key": "wrong" });
        await expect(403, path, { Origin: "https://example.invalid", "x-traffic-read-key": readKey });
        const preflight = await expect(204, path, { Origin: origin, "access-control-request-method": "GET", "access-control-request-headers": "x-traffic-read-key" }, "OPTIONS");
        assert.match(preflight.headers["access-control-allow-headers"], /x-traffic-read-key/);
      }
      assert.equal(upstreamCalls, 0, "denied reads must not contact upstream");
      if (kind === "unconfigured") continue;
      await expect(503, "/api/traffic-live", { "x-traffic-read-key": readKey });
      await expect(401, "/api/traffic-push", {}, "POST", "{}");
      await expect(202, "/api/traffic-push", { "content-type": "application/json", "x-traffic-push-key": pushKey }, "POST", JSON.stringify({ trafficHeader: "Synthetic snapshot" }));
      for (const headers of [{ "x-traffic-read-key": readKey }, { Origin: origin, "x-traffic-read-key": readKey }]) {
        const live = await expect(200, "/api/traffic-live", headers);
        assert.equal(JSON.parse(live.text).trafficHeader, "Synthetic snapshot");
        assert.equal(live.headers["cache-control"], "no-store");
        const header = await expect(200, "/api/traffic-header", headers);
        assert.match(header.text, /Synthetic header/);
      }
      await expect(200, "/api/health");
    } finally {
      if (child.exitCode === null) { child.kill(); await once(child, "exit"); }
    }
  }
  console.log(`Bridge security: ${checks} HTTP checks passed; external network mocked.`);
}
