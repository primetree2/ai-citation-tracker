const test = require("node:test"),
  assert = require("node:assert/strict"),
  vm = require("node:vm"),
  fs = require("node:fs"),
  path = require("node:path");
const code = fs.readFileSync(
  path.join(__dirname, "../site/chat-watcher.js"),
  "utf8",
);
function environment({
  hostname = "chatgpt.com",
  pathname = "/",
  blocked = false,
} = {}) {
  let now = 100000,
    id = 0,
    calls = [],
    messages = [],
    alerts = [],
    nodes = new Map(),
    listeners = new Map(),
    timers = new Map(),
    responseStatus = 200,
    retryAfter = null;
  const el = () => ({
    style: {},
    setAttribute() {},
    appendChild() {},
    textContent: "",
    disabled: false,
    onclick: null,
    remove() {
      this.removed = true;
    },
    scrollIntoView() {},
    click() {
      this.onclick?.();
    },
    attachShadow() {
      return {
        innerHTML: "",
        appendChild() {},
        querySelector(q) {
          if (!nodes.has(q)) nodes.set(q, el());
          return nodes.get(q);
        },
      };
    },
  });
  const dashboard = {
    closed: false,
    postMessage(m, origin) {
      messages.push({ m, origin });
    },
  };
  const window = {
    open: () => (blocked ? null : dashboard),
    addEventListener(t, f) {
      if (!listeners.has(t)) listeners.set(t, new Set());
      listeners.get(t).add(f);
    },
    removeEventListener(t, f) {
      listeners.get(t)?.delete(f);
    },
  };
  const FakeDate = class extends Date {
    constructor(...a) {
      super(...(a.length ? a : [now]));
    }
    static now() {
      return now;
    }
  };
  const context = vm.createContext({
    module: { exports: {} },
    window,
    location: { hostname, pathname },
    document: {
      createElement: el,
      body: { appendChild() {} },
      documentElement: { appendChild() {} },
      cookie: "",
    },
    crypto: require("node:crypto").webcrypto,
    URL,
    Blob,
    AbortController,
    Uint32Array,
    Date: FakeDate,
    alert: (m) => alerts.push(m),
    setTimeout(fn, ms) {
      timers.set(++id, { fn, at: now + ms });
      return id;
    },
    clearTimeout(i) {
      timers.delete(i);
    },
    setInterval(fn, ms) {
      timers.set(++id, { fn, at: now + ms, interval: ms });
      return id;
    },
    clearInterval(i) {
      timers.delete(i);
    },
    fetch: async (p, options) => {
      calls.push({ p, options });
      const status = p === "/api/auth/session" ? 200 : responseStatus;
      return {
        ok: status === 200,
        status,
        headers: { get: () => retryAfter },
        json: async () =>
          p === "/api/auth/session"
            ? { accessToken: "fake-token" }
            : p === "/api/organizations"
              ? [{ uuid: "org-test" }]
              : { conversation_id: context.location.pathname, revision: now },
      };
    },
  });
  vm.runInContext(code, context);
  vm.runInContext(
    "module.exports.installWatcher('http://127.0.0.1:8000/site/')",
    context,
  );
  const flush = () => new Promise((r) => setImmediate(r));
  const channel = () =>
    messages.find((x) => x.m.type === "citetracker-watch-hello")?.m.channel;
  const emit = (data, origin = "http://127.0.0.1:8000", source = dashboard) => {
    for (const f of listeners.get("message") || [])
      f({ data: { channel: channel(), ...data }, origin, source });
  };
  const ack = () => {
    const m = messages.findLast(
      (x) => x.m.type === "citetracker-watch-snapshot",
    )?.m;
    if (m)
      emit({
        type: "citetracker-watch-ack",
        revision: m.revision,
        observedAt: new FakeDate().toISOString(),
      });
  };
  return {
    context,
    window,
    dashboard,
    calls,
    messages,
    alerts,
    nodes,
    timers,
    emit,
    ack,
    flush,
    ready: async () => {
      emit({ type: "citetracker-watch-ready" });
      await flush();
    },
    setStatus: (n) => (responseStatus = n),
    setRetryAfter: (value) => {
      retryAfter = value;
    },
    async advance(ms) {
      const end = now + ms;
      for (let i = 0; i < 1000; i++) {
        const a = [...timers]
          .filter(([, v]) => v.at <= end)
          .sort((a, b) => a[1].at - b[1].at)[0];
        if (!a) break;
        now = a[1].at;
        if (a[1].interval) a[1].at += a[1].interval;
        else timers.delete(a[0]);
        a[1].fn();
        await flush();
      }
      now = end;
      await flush();
    },
  };
}
test("Bookmark only starts on the two explicitly supported sites", () => {
  const e = environment({ hostname: "example.test" });
  assert.equal(e.alerts.length, 1);
  assert.equal(e.calls.length, 0);
  assert.equal(e.window.__citationTrackerWatcher, undefined);
});
test("Blocked popup is reported without starting polling", () => {
  const e = environment({ blocked: true });
  assert.match(e.alerts[0], /blocked/);
  assert.equal(e.timers.size, 0);
});
test("New-chat page connects before a conversation ID exists", async () => {
  const e = environment();
  await e.ready();
  assert.equal(e.calls.length, 0);
  assert.equal(e.messages.at(-1).m.state, "waiting");
  e.window.__citationTrackerWatcher.stop();
  assert.equal(e.timers.size, 0);
});
test("Wrong origin, source, or token cannot activate a watcher", async () => {
  const e = environment({ pathname: "/c/test" });
  e.emit({ type: "citetracker-watch-ready" }, "https://evil.test");
  e.emit({ type: "citetracker-watch-ready" }, undefined, {});
  e.emit({ type: "citetracker-watch-ready", channel: "wrong" });
  await e.flush();
  assert.equal(e.calls.length, 0);
  e.window.__citationTrackerWatcher.stop();
});
test("Route creation syncs new evidence, keeps auth local, and follows a second chat", async () => {
  const e = environment();
  await e.ready();
  e.context.location.pathname = "/c/one";
  await e.advance(5000);
  assert.equal(e.calls.length, 2);
  const snapshot = e.messages.findLast(
    (x) => x.m.type === "citetracker-watch-snapshot",
  ).m;
  assert.equal(snapshot.raw.conversation_id, "/c/one");
  assert.ok(!JSON.stringify(snapshot).includes("fake-token"));
  e.ack();
  e.context.location.pathname = "/c/two";
  await e.advance(15000);
  assert.equal(e.calls.at(-1).p, "/backend-api/conversation/two");
  e.window.__citationTrackerWatcher.stop();
});
test("Pause prevents polling and manual sync; stop removes timers", async () => {
  const e = environment({ pathname: "/c/test" });
  await e.ready();
  e.ack();
  e.emit({ type: "citetracker-watch-command", command: "pause" });
  const n = e.calls.length;
  await e.advance(60000);
  e.window.__citationTrackerWatcher.sync();
  await e.flush();
  assert.equal(e.calls.length, n);
  e.window.__citationTrackerWatcher.stop();
  assert.equal(e.timers.size, 0);
});
test("Access denial disables automatic retries", async () => {
  const e = environment({ pathname: "/c/test" });
  e.setStatus(403);
  await e.ready();
  const n = e.calls.length;
  await e.advance(60000);
  assert.equal(e.calls.length, n);
  assert.equal(e.nodes.get("#sync").disabled, true);
  assert.equal(e.messages.at(-1).m.state, "error");
  e.window.__citationTrackerWatcher.stop();
});
test("Rate limit backoff also blocks manual refresh", async () => {
  const e = environment({ pathname: "/c/test" });
  e.setStatus(429);
  await e.ready();
  const n = e.calls.length;
  await e.advance(10000);
  e.window.__citationTrackerWatcher.sync();
  await e.flush();
  assert.equal(e.calls.length, n);
  e.setStatus(200);
  await e.advance(50000);
  assert.ok(e.calls.length > n);
  e.window.__citationTrackerWatcher.stop();
});
test("Repeated import failures pause instead of claiming successful sync", async () => {
  const e = environment({ pathname: "/c/test" });
  await e.ready();
  e.emit({ type: "citetracker-watch-rejected", error: "unsupported response" });
  const n = e.calls.length;
  await e.advance(60000);
  assert.equal(e.calls.length, n);
  assert.equal(e.messages.at(-1).m.state, "paused");
  e.window.__citationTrackerWatcher.stop();
});
test("Lost connection acknowledgement pauses instead of discarding evidence", async () => {
  const e = environment({ pathname: "/c/test" });
  await e.ready();
  await e.advance(30000);
  assert.match(e.nodes.get("#status").textContent, /acknowledge/);
  assert.equal(e.nodes.get("#export").disabled, false);
  e.window.__citationTrackerWatcher.stop();
});

test("Claude saved-chat sync resolves organization and never requests ChatGPT auth", async () => {
  const e = environment({ hostname: "claude.ai", pathname: "/chat/test" });
  await e.ready();
  assert.ok(e.calls.some((c) => c.p === "/api/organizations"));
  assert.ok(
    e.calls.some((c) =>
      c.p.includes("/api/organizations/org-test/chat_conversations/test"),
    ),
  );
  assert.ok(!e.calls.some((c) => c.p === "/api/auth/session"));
  e.window.__citationTrackerWatcher.stop();
});
test("Three transient failures pause with no endless retry loop", async () => {
  const e = environment({ pathname: "/c/test" });
  e.setStatus(500);
  await e.ready();
  await e.advance(60000);
  assert.equal(e.messages.at(-1).m.state, "paused");
  const n = e.calls.length;
  await e.advance(60000);
  assert.equal(e.calls.length, n);
  e.window.__citationTrackerWatcher.stop();
});

test("Explicit Save snapshot can read a chat without a dashboard handshake", async () => {
  const e = environment({ pathname: "/c/test" });
  e.nodes.get("#export").onclick();
  await e.flush();
  assert.equal(e.calls.length, 2);
  assert.ok(!e.messages.some((x) => x.m.type === "citetracker-watch-snapshot"));
  assert.match(e.nodes.get("#status").textContent, /downloaded/);
  e.window.__citationTrackerWatcher.stop();
});

test("Long Retry-After is honored rather than shortened to five minutes", async () => {
  const e = environment({ pathname: "/c/test" });
  e.setStatus(429);
  e.setRetryAfter("3600");
  await e.ready();
  const n = e.calls.length;
  await e.advance(300000);
  e.window.__citationTrackerWatcher.sync();
  await e.flush();
  assert.equal(e.calls.length, n);
  e.setStatus(200);
  await e.advance(3300000);
  assert.ok(e.calls.length > n);
  e.window.__citationTrackerWatcher.stop();
});
