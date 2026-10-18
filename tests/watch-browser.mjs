// All provider-origin traffic is intercepted and fulfilled locally. No AI account is contacted.
import http from "node:http";
import { spawn } from "node:child_process";
import {
  readFileSync,
  writeFileSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
} from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { createRequire } from "node:module";
const root = resolve(import.meta.dirname, ".."),
  require = createRequire(import.meta.url);
const W = require("../site/chat-watcher.js");
const output = join(root, "test-results");
mkdirSync(output, { recursive: true });
const pause = (ms) => new Promise((r) => setTimeout(r, ms));
let reads = 0,
  stage = 1,
  denied = false;
const raw = JSON.parse(
  readFileSync(join(root, "sample-data/chatgpt_raw.json"), "utf8"),
);
raw.title = "Synthetic chat-sync browser test";
function snapshot() {
  const r = structuredClone(raw);
  if (stage >= 2) {
    r.mapping["sync-test-extra"] = {
      parent: r.current_node,
      message: {
        id: "sync-test-extra",
        author: { role: "tool", name: "web.run" },
        content: { parts: [""] },
        metadata: {
          search_result_groups: [
            {
              entries: [
                {
                  url: "https://example.test/follow-up",
                  title: "Synthetic follow-up source",
                },
              ],
            },
          ],
        },
      },
    };
    r.current_node = "sync-test-extra";
  }
  return r;
}
const mime = {
  html: "text/html",
  js: "text/javascript",
  css: "text/css",
  json: "application/json",
};
const server = http.createServer((req, res) => {
  try {
    const path = new URL(req.url, "http://localhost").pathname;
    const f = resolve(
      root,
      "." + (path.endsWith("/") ? path + "index.html" : path),
    );
    if (!f.startsWith(root + "/")) throw Error();
    res.setHeader("Content-Type", mime[f.split(".").at(-1)] || "text/plain");
    res.end(readFileSync(f));
  } catch {
    res.writeHead(404).end();
  }
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const dashboardUrl = `http://127.0.0.1:${server.address().port}/site/`;
const dir = mkdtempSync(join(tmpdir(), "citation-watch-"));
const browser = spawn(
  process.env.BROWSER || "chromium",
  [
    "--headless",
    "--no-sandbox",
    "--disable-dev-shm-usage",
    "--disable-background-networking",
    "--remote-debugging-port=0",
    "--user-data-dir=" + dir,
    "about:blank",
  ],
  { stdio: "ignore" },
);
const clients = [];
const errors = [];
async function connect(tab) {
  const ws = new WebSocket(tab.webSocketDebuggerUrl);
  await new Promise((r, j) => {
    ws.onopen = r;
    ws.onerror = j;
  });
  let sequence = 0;
  const pending = new Map();
  const client = {
    ws,
    onEvent: null,
    call(method, params = {}) {
      return new Promise((resolve, reject) => {
        const id = ++sequence;
        const timer = setTimeout(() => {
          pending.delete(id);
          reject(Error(method + " timeout"));
        }, 10000);
        pending.set(id, { resolve, reject, timer });
        ws.send(JSON.stringify({ id, method, params }));
      });
    },
    async eval(expression, userGesture = false) {
      const r = await this.call("Runtime.evaluate", {
        expression,
        awaitPromise: true,
        returnByValue: true,
        userGesture,
      });
      if (r.exceptionDetails)
        throw Error(
          r.exceptionDetails.exception?.description || r.exceptionDetails.text,
        );
      return r.result.value;
    },
  };
  ws.onmessage = (e) => {
    const m = JSON.parse(e.data);
    if (m.id) {
      const p = pending.get(m.id);
      if (p) {
        clearTimeout(p.timer);
        pending.delete(m.id);
        m.error ? p.reject(Error(m.error.message)) : p.resolve(m.result);
      }
    } else {
      if (m.method === "Runtime.exceptionThrown")
        errors.push(
          m.params.exceptionDetails.exception?.description ||
            m.params.exceptionDetails.text,
        );
      client.onEvent?.(m);
    }
  };
  clients.push(client);
  await client.call("Runtime.enable");
  await client.call("Page.enable");
  return client;
}
function assert(value, label) {
  if (!value) throw Error("FAIL " + label);
  console.log("PASS " + label);
}
async function until(fn, label) {
  for (let i = 0; i < 70; i++) {
    if (await fn()) return;
    await pause(150);
  }
  throw Error("Timed out: " + label);
}
try {
  let port;
  await until(async () => {
    try {
      port = readFileSync(join(dir, "DevToolsActivePort"), "utf8").split(
        "\n",
      )[0];
      return (await fetch(`http://127.0.0.1:${port}/json/list`)).ok;
    } catch {
      return false;
    }
  }, "Chrome start");
  const tabs = () =>
    fetch(`http://127.0.0.1:${port}/json/list`).then((r) => r.json());
  const ai = await connect((await tabs()).find((t) => t.type === "page"));
  ai.onEvent = async (m) => {
    if (m.method !== "Fetch.requestPaused") return;
    const p = m.params,
      u = new URL(p.request.url);
    let body = "",
      status = 200,
      type = "application/json";
    if (u.hostname !== "chatgpt.com") {
      await ai.call("Fetch.failRequest", {
        requestId: p.requestId,
        errorReason: "BlockedByClient",
      });
      return;
    }
    if (p.resourceType === "Document") {
      type = "text/html";
      body =
        "<title>Synthetic AI tab</title><h1>Synthetic AI tab - no provider contacted</h1><p>This page is served by the local test harness.</p>";
    } else if (u.pathname === "/api/auth/session")
      body = JSON.stringify({
        accessToken: "synthetic-session-not-a-real-token",
      });
    else if (u.pathname.startsWith("/backend-api/conversation/")) {
      reads++;
      status = denied ? 403 : 200;
      body = denied ? "{}" : JSON.stringify(snapshot());
    } else {
      status = 404;
      body = "{}";
    }
    await ai.call("Fetch.fulfillRequest", {
      requestId: p.requestId,
      responseCode: status,
      responseHeaders: [{ name: "Content-Type", value: type }],
      body: Buffer.from(body).toString("base64"),
    });
  };
  await ai.call("Fetch.enable", { patterns: [{ urlPattern: "*" }] });
  await ai.call("Page.navigate", { url: "https://chatgpt.com/" });
  await pause(300);
  await ai.eval(W.bookmarkletCode(dashboardUrl), true);
  let dashTab;
  await until(async () => {
    dashTab = (await tabs()).find((t) => t.url.startsWith(dashboardUrl));
    return !!dashTab;
  }, "tracker popup");
  const dash = await connect(dashTab);
  await dash.call("Emulation.setDeviceMetricsOverride", {
    width: 1440,
    height: 1000,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await until(
    () =>
      dash.eval(
        "document.querySelector('#chat-connection')?.dataset.state==='waiting'",
      ),
    "new chat handshake",
  );
  assert(
    reads === 0,
    "Connect before first prompt makes no conversation request",
  );
  assert(
    await ai.eval("!!document.querySelector('#citation-tracker-watcher')"),
    "AI tab displays explicit watcher controls",
  );
  await ai.eval(
    "history.pushState({},'', '/c/synthetic-chat');window.__citationTrackerWatcher.sync()",
  );
  await until(
    () =>
      dash.eval(
        "document.querySelectorAll('#runs-table [data-run]').length===1",
      ),
    "first snapshot",
  );
  assert(
    await dash.eval(
      "document.querySelector('#run-detail').innerText.includes('Chat sync · saved snapshot') && document.querySelector('[data-collection=\"personal\"]').getAttribute('aria-pressed')==='true'",
    ),
    "Fresh chat evidence arrives automatically in My data",
  );
  const capture = async (name, client = dash) => {
    await client.eval(
      "document.querySelector('#toast')?.classList.add('hidden')",
    );
    const png = await client.call("Page.captureScreenshot", { format: "png" });
    writeFileSync(join(output, name + ".png"), Buffer.from(png.data, "base64"));
  };
  await dash.eval("scrollTo(0,0)");
  await capture("watch-connected");
  await ai.call("Emulation.setDeviceMetricsOverride", {
    width: 1100,
    height: 750,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await capture("watch-ai-panel", ai);
  await dash.eval(
    "document.querySelector('#source-search').value='youtube.com';document.querySelector('#source-search').dispatchEvent(new Event('input'));document.querySelector('#source-search').focus()",
  );
  stage = 2;
  await pause(5200);
  await ai.eval("window.__citationTrackerWatcher.sync()");
  await until(
    () =>
      dash.eval(
        "document.querySelector('#run-detail').innerText.includes('30 normalized source URLs')",
      ),
    "updated follow-up",
  );
  assert(
    await dash.eval(
      "document.querySelectorAll('#runs-table [data-run]').length===1 && document.querySelector('#source-search').value==='youtube.com' && document.activeElement.id==='source-search'",
    ),
    "Follow-up updates same analysis and preserves source-search focus",
  );
  await dash.eval("document.querySelector('#chat-pause').click()");
  await until(
    () =>
      dash.eval(
        "document.querySelector('#chat-connection').dataset.state==='paused'",
      ),
    "pause command",
  );
  const before = reads;
  await ai.eval("window.__citationTrackerWatcher.sync()");
  await pause(300);
  assert(reads === before, "Pause prevents manual and automatic chat reads");
  await dash.eval("scrollTo(0,0)");
  await capture("watch-paused");
  // Token/source validation: an unrelated same-origin-to-provider message must not change state.
  await ai.eval(
    "(()=>{const w=window.open('', 'unrelated-test');if(w)w.close();})()",
    true,
  );
  await dash.eval(
    "window.dispatchEvent(new MessageEvent('message',{origin:'https://chatgpt.com',source:window.opener,data:{type:'citetracker-watch-status',channel:'wrong-token',state:'stopped',detail:'spoof'}}))",
  );
  assert(
    await dash.eval(
      "document.querySelector('#chat-connection').dataset.state==='paused'",
    ),
    "Wrong channel cannot control dashboard state",
  );
  denied = true;
  await pause(5200);
  await dash.eval("document.querySelector('#chat-pause').click()");
  await until(
    () =>
      dash.eval(
        "document.querySelector('#chat-connection').dataset.state==='error'",
      ),
    "access-denial status",
  );
  assert(await dash.eval("document.querySelector('#chat-sync-now').disabled && document.querySelector('#chat-pause').disabled"), "Dashboard access-denial controls require reconnecting");
  assert(
    await ai.eval(
      "document.querySelector('#citation-tracker-watcher').shadowRoot.querySelector('#sync').disabled",
    ),
    "Access denial stops polling and disables immediate retries",
  );
  await dash.call("Emulation.setDeviceMetricsOverride", {
    width: 390,
    height: 1000,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await dash.eval("scrollTo(0,0)");
  await capture("watch-error-mobile");
  assert(
    await dash.eval("document.documentElement.scrollWidth<=innerWidth"),
    "Connection error and controls fit mobile",
  );
  await dash.eval("document.querySelector('#chat-stop').click()");
  await pause(200);
  assert(
    await ai.eval("!window.__citationTrackerWatcher"),
    "Stop removes watcher and prevents further capture",
  );
  assert(
    errors.length === 0,
    "No uncaught browser exceptions in connected-chat flow",
  );
  console.log(
    "Synthetic cross-origin saved-chat sync verified. No authenticated provider was tested.",
  );
} finally {
  clients.forEach((c) => c.ws.close());
  browser.kill();
  server.close();
  await pause(200);
  try {
    rmSync(dir, { recursive: true, force: true });
  } catch {}
}
