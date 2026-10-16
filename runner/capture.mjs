import { spawn } from "node:child_process";
import { readFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { createInterface } from "node:readline";

const args = process.argv.slice(2),
  opt = (key, fallback) => {
    const i = args.indexOf("--" + key);
    return i < 0 ? fallback : args[i + 1];
  };
if (args.includes("--help")) {
  console.log(
    "Usage: node runner/capture.mjs --provider chatgpt|claude|gemini|perplexity|grok [--chrome PATH] [--out FILE]\nLog in manually in the dedicated browser, enable web search, send one prompt, wait for completion, then press Enter here. Output contains private response bodies, not authentication headers.",
  );
  process.exit(0);
}
const provider = opt("provider", "chatgpt");
const urls = {
  chatgpt: "https://chatgpt.com",
  claude: "https://claude.ai",
  gemini: "https://gemini.google.com",
  perplexity: "https://www.perplexity.ai",
  grok: "https://grok.com",
};
if (!urls[provider]) throw new Error("Choose a documented browser provider.");
const defaultChrome =
  process.platform === "win32"
    ? "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe"
    : process.platform === "darwin"
      ? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
      : "chromium";
const chrome = opt("chrome", process.env.CHROME_PATH || defaultChrome),
  port = opt("port", "0");
const profile = resolve(opt("profile", "runner/.capture-profile"));
mkdirSync(profile, { recursive: true });
const testUrl = opt("test-url", "");
if (testUrl && !/^http:\/\/(127\.0\.0\.1|localhost):\d+\//.test(testUrl))
  throw new Error("Test URL must be a loopback HTTP URL.");
const browser = spawn(
  chrome,
  [
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${profile}`,
    "--no-first-run",
    ...(args.includes("--headless") ? ["--headless", "--no-sandbox"] : []),
    "about:blank",
  ],
  { stdio: "ignore" },
);
let browserError;
browser.on("error", (e) => {
  browserError = e;
});
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
let actualPort = port;
for (let i = 0; i < 100; i++) {
  if (browserError)
    throw new Error(
      `Could not start Chrome: ${browserError.message}. Use --chrome with its full path.`,
    );
  if (port === "0" && existsSync(join(profile, "DevToolsActivePort")))
    actualPort = readFileSync(
      join(profile, "DevToolsActivePort"),
      "utf8",
    ).split("\n")[0];
  try {
    if (
      actualPort !== "0" &&
      (await fetch(`http://127.0.0.1:${actualPort}/json/list`)).ok
    )
      break;
  } catch {}
  await wait(100);
}
let socket;
try {
  const tabs = await (
      await fetch(`http://127.0.0.1:${actualPort}/json/list`)
    ).json(),
    tab = tabs.find((t) => t.type === "page");
  if (!tab) throw new Error("No browser tab is available.");
  socket = new WebSocket(tab.webSocketDebuggerUrl);
  await new Promise((r, j) => {
    socket.onopen = r;
    socket.onerror = j;
  });
  let seq = 0;
  const pending = new Map(),
    requests = new Map(),
    records = [],
    jobs = new Set(),
    chunks = new Map();
  function call(method, params = {}) {
    return new Promise((resolve, reject) => {
      const id = ++seq;
      const timer = setTimeout(() => {
        pending.delete(id);
        reject(new Error(method + " timed out"));
      }, 5000);
      pending.set(id, { resolve, reject, timer });
      socket.send(JSON.stringify({ id, method, params }));
    });
  }
  const matches = (url) => {
    if (testUrl && url.startsWith(testUrl))
      return new URL(url).pathname === "/stream";
    try {
      const u = new URL(url),
        h = u.hostname,
        p = u.pathname;
      return (
        (provider === "chatgpt" &&
          h === "chatgpt.com" &&
          /\/backend-api\/(f\/)?conversation$/.test(p)) ||
        (provider === "claude" &&
          h === "claude.ai" &&
          /\/completion$/.test(p)) ||
        (provider === "gemini" &&
          h === "gemini.google.com" &&
          /StreamGenerate/.test(p)) ||
        (provider === "perplexity" &&
          /(^|\.)perplexity\.ai$/.test(h) &&
          /perplexity_ask/.test(p)) ||
        (provider === "grok" &&
          /(^|\.)grok\.com$/.test(h) &&
          /\/conversations\/(new|[^/]+\/responses)$/.test(p))
      );
    } catch {
      return false;
    }
  };
  const task = (p) => {
    jobs.add(p);
    p.finally(() => jobs.delete(p));
  };
  socket.onmessage = (event) => {
    const m = JSON.parse(event.data);
    if (m.id) {
      const p = pending.get(m.id);
      if (p) {
        clearTimeout(p.timer);
        pending.delete(m.id);
        m.error ? p.reject(new Error(m.error.message)) : p.resolve(m.result);
      }
      return;
    }
    const p = m.params || {},
      id = p.requestId;
    if (m.method === "Network.responseReceived" && matches(p.response.url)) {
      const u = new URL(p.response.url);
      const record = {
        provider,
        url: u.origin + u.pathname,
        status: p.response.status,
        mimeType: p.response.mimeType,
        transport: "CDP response body",
        body: "",
        complete: false,
      };
      requests.set(id, record);
      records.push(record);
      chunks.set(id, []);
      task(
        call("Network.streamResourceContent", { requestId: id })
          .then((r) => {
            chunks.get(id).unshift(Buffer.from(r.bufferedData || "", "base64"));
          })
          .catch(() => {
            record.streamBufferUnavailable = true;
          }),
      );
    }
    if (m.method === "Network.dataReceived" && requests.has(id) && p.data)
      chunks.get(id).push(Buffer.from(p.data, "base64"));
    if (m.method === "Network.loadingFinished" && requests.has(id)) {
      const record = requests.get(id);
      record.complete = true;
      task(
        call("Network.getResponseBody", { requestId: id })
          .then((r) => {
            record.body = r.base64Encoded
              ? Buffer.from(r.body, "base64").toString("utf8")
              : r.body;
          })
          .catch(() => {
            record.warning =
              "Final body unavailable; buffered data may be partial.";
            record.complete = false;
          }),
      );
    }
    if (m.method === "Network.loadingFailed" && requests.has(id)) {
      requests.get(id).error = p.errorText;
      requests.get(id).complete = false;
    }
  };
  await call("Network.enable", {
    maxTotalBufferSize: 100 * 1024 * 1024,
    maxResourceBufferSize: 20 * 1024 * 1024,
  });
  await call("Page.enable");
  await call("Page.navigate", { url: testUrl || urls[provider] });
  console.log(
    `Capture started for ${provider}. Use this browser tab to log in, enable web search, and send one prompt. After the answer finishes, press Enter here. Do not use a normal browser profile.`,
  );
  if (opt("duration", "")) await wait(Number(opt("duration")) * 1000);
  else
    await new Promise((r) => {
      const rl = createInterface({
        input: process.stdin,
        output: process.stdout,
      });
      rl.question("Press Enter to save and close: ", () => {
        rl.close();
        r();
      });
    });
  await Promise.allSettled([...jobs]);
  const out = resolve(
    opt("out", `runner/out/${provider}-capture-${Date.now()}.json`),
  );
  mkdirSync(resolve(out, ".."), { recursive: true });
  for (const [id, record] of requests)
    if (!record.body)
      record.body = Buffer.concat(chunks.get(id) || []).toString("utf8");
  const content = {
    format: "citation-tracker-capture-v1",
    provider,
    capturedAt: new Date().toISOString(),
    records,
  };
  writeFileSync(out, JSON.stringify(content, null, 2));
  console.log(
    `Saved ${records.length} response(s) to ${out}. Inspect this private file before sharing it. Empty or unsupported captures are not successful evidence extraction.`,
  );
} finally {
  socket?.close();
  browser.kill();
}
