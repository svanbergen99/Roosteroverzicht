(() => {
  "use strict";

  if (window.RoosterReady) return;

  const states = new Map();
  const waiters = new Map();

  function keyOf(value) {
    return String(value || "").trim();
  }

  function runSoon(callback, detail) {
    Promise.resolve().then(() => {
      try { callback(detail); } catch (error) { console.error("RoosterReady callback failed", error); }
    });
  }

  function mark(key, detail = null) {
    const name = keyOf(key);
    if (!name) return null;

    const firstReady = !states.has(name);
    states.set(name, Object.freeze({ ready: true, detail, at: Date.now() }));

    if (firstReady) {
      const pending = waiters.get(name);
      waiters.delete(name);
      pending?.forEach(callback => runSoon(callback, detail));
    }
    return detail;
  }

  function is(key) {
    return states.has(keyOf(key));
  }

  function detail(key) {
    return states.get(keyOf(key))?.detail ?? null;
  }

  function when(key, callback) {
    const name = keyOf(key);
    if (!name || typeof callback !== "function") return () => {};

    if (states.has(name)) {
      runSoon(callback, states.get(name).detail);
      return () => {};
    }

    let pending = waiters.get(name);
    if (!pending) {
      pending = new Set();
      waiters.set(name, pending);
    }
    pending.add(callback);
    return () => pending.delete(callback);
  }

  function wait(key) {
    return new Promise(resolve => when(key, resolve));
  }

  function reset(key) {
    const name = keyOf(key);
    if (!name) return;
    states.delete(name);
  }

  function snapshot() {
    return Object.freeze(Object.fromEntries([...states.entries()].map(([key, value]) => [key, value])));
  }

  window.RoosterReady = Object.freeze({ mark, is, detail, when, wait, reset, snapshot });

  const legacyBridges = Object.freeze({
    "rooster-private-config-ready": "privateConfigReady",
    "rooster-unlocked": "teamUnlocked",
    "rooster-start-ready": "startPageReady",
    "external-sites-ready": "externalSitesReady",
  });

  Object.entries(legacyBridges).forEach(([eventName, readyKey]) => {
    window.addEventListener(eventName, event => mark(readyKey, event?.detail ?? null), true);
  });

  if (window.RoosterPrivateConfig) {
    mark("privateConfigReady", { config: window.RoosterPrivateConfig, source: "bootstrap" });
  }
})();
