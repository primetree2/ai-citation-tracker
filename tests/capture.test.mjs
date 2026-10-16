import http from "node:http";
import { spawn } from "node:child_process";
import { mkdtempSync, readFileSync, mkdirSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { createRequire } from "node:module";
const root = resolve(import.meta.dirname, ".."),
  require = createRequire(import.meta.url),
  P = require("../site/parser.js");
const fixture = readFileSync(
  join(root, "sample-data/streams/chatgpt-synthetic.sse"),
  "utf8",
);
const server = http.createServer((req, res) => {
  if (req.url === "/") {
    res.end(`<script>fetch('/stream').then(r=>r.text())</script>`);
  } else if (req.url === "/stream") {
    res.writeHead(200, { "Content-Type": "text/event-stream" });
    const [first, ...rest] = fixture.split("\n\n");
    res.write(first + "\n\n");
    setTimeout(() => res.end(rest.join("\n\n")), 200);
  } else {
    res.writeHead(404);
    res.end();
  }
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const dir = mkdtempSync(join(tmpdir(), "citation-capture-test-")),
  out = join(dir, "capture.json");
try {
  const chrome =
    process.env.BROWSER ||
    (process.platform === "win32"
      ? "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe"
      : "chromium");
  const child = spawn(
    process.execPath,
    [
      "runner/capture.mjs",
      "--provider",
      "chatgpt",
      "--chrome",
      chrome,
      "--headless",
      "--test-url",
      `http://127.0.0.1:${server.address().port}/`,
      "--duration",
      "2",
      "--profile",
      join(dir, "profile"),
      "--out",
      out,
    ],
    { cwd: root, stdio: "inherit" },
  );
  const code = await new Promise((r, j) => {
    child.on("error", j);
    child.on("exit", r);
  });
  if (code !== 0) throw Error("Capture runner failed");
  const text = readFileSync(out, "utf8"),
    bundle = JSON.parse(text),
    runs = P.parseText(text);
  if (
    bundle.records.length !== 1 ||
    runs[0].retrieved !== 1 ||
    runs[0].cited !== 1 ||
    runs[0].queries[0] !== "n8n tutorials" ||
    !runs[0].capture.complete
  )
    throw Error("Unexpected local capture result");
  console.log(
    "PASS local synthetic SSE → CDP recorder → shared parser: 1 retrieved, 1 cited, 1 query. No live provider was tested.",
  );
} finally {
  server.close();
  try {
    rmSync(dir, { recursive: true, force: true });
  } catch {}
}
