import {
  readFileSync,
  writeFileSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
} from "node:fs";
import { spawn } from "node:child_process";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import http from "node:http";
const root = resolve(import.meta.dirname, ".."),
  output = join(root, "test-results"),
  serveRoot = process.env.SITE_ROOT ? resolve(process.env.SITE_ROOT) : root,
  prefix = process.env.PAGES_PREFIX || "";
mkdirSync(output, { recursive: true });
const mime = {
  ".svg": "image/svg+xml",
  ".html": "text/html",
  ".js": "text/javascript",
  ".css": "text/css",
  ".json": "application/json",
};
const server = http.createServer((req, res) => {
  try {
    const requestPath = decodeURIComponent(
      new URL(req.url, "http://localhost").pathname,
    );
    if (!requestPath.startsWith(prefix + "/")) throw Error("prefix");
    const pathname = requestPath.slice(prefix.length);
    const file = resolve(
      serveRoot,
      "." + (pathname.endsWith("/") ? pathname + "index.html" : pathname),
    );
    if (!file.startsWith(serveRoot + "/")) throw Error("path");
    const data = readFileSync(file);
    res.setHeader(
      "Content-Type",
      mime[file.slice(file.lastIndexOf("."))] || "text/plain",
    );
    res.end(data);
  } catch {
    res.writeHead(404);
    res.end();
  }
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const url = `http://127.0.0.1:${server.address().port}${prefix}`;
const profile = mkdtempSync(join(tmpdir(), "citation-ui-test-"));
const browser =
  process.env.BROWSER ||
  (process.platform === "win32"
    ? "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe"
    : "chromium");
const chrome = spawn(
  browser,
  [
    "--headless",
    "--no-sandbox",
    "--disable-dev-shm-usage",
    "--remote-debugging-port=0",
    "--user-data-dir=" + profile,
    "about:blank",
  ],
  { stdio: "ignore" },
);
let launchError;
chrome.on("error", (e) => (launchError = e));
let ws;
const pause = (ms) => new Promise((r) => setTimeout(r, ms || 250));
try {
  let port;
  for (let i = 0; i < 100; i++) {
    if (launchError) throw launchError;
    try {
      port = readFileSync(join(profile, "DevToolsActivePort"), "utf8").split(
        "\n",
      )[0];
      if ((await fetch(`http://127.0.0.1:${port}/json/list`)).ok) break;
    } catch {}
    await pause(100);
  }
  const tabs = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
  ws = new WebSocket(tabs.find((t) => t.type === "page").webSocketDebuggerUrl);
  await new Promise((r) => ws.addEventListener("open", r, { once: true }));
  let id = 0;
  const pending = new Map(),
    errors = [];
  ws.addEventListener("message", (event) => {
    const m = JSON.parse(event.data);
    if (m.id) {
      const p = pending.get(m.id);
      if (!p) return;
      clearTimeout(p.timer);
      pending.delete(m.id);
      m.error ? p.reject(Error(m.error.message)) : p.resolve(m.result);
    } else if (m.method === "Runtime.exceptionThrown")
      errors.push(
        m.params.exceptionDetails.exception?.description ||
          m.params.exceptionDetails.text,
      );
  });
  const call = (method, params = {}) =>
    new Promise((resolve, reject) => {
      const n = ++id,
        timer = setTimeout(() => {
          pending.delete(n);
          reject(Error(method + " timeout"));
        }, 5000);
      pending.set(n, { resolve, reject, timer });
      ws.send(JSON.stringify({ id: n, method, params }));
    });
  const evaluate = async (expression) => {
    const r = await call("Runtime.evaluate", {
      expression,
      awaitPromise: true,
      returnByValue: true,
    });
    if (r.exceptionDetails)
      throw Error(
        r.exceptionDetails.exception?.description || r.exceptionDetails.text,
      );
    return r.result.value;
  };
  const check = async (expression, label) => {
    if (!(await evaluate(expression))) throw Error("FAIL " + label);
    console.log("PASS " + label);
  };
  const click = async (selector) => {
    await evaluate(
      `document.querySelector(${JSON.stringify(selector)}).click()`,
    );
    await pause();
  };
  const state = async (name) => {
    await evaluate(`document.querySelector('#toast').classList.add('hidden')`);
    const css = readFileSync(join(root, "site/styles.css"), "utf8");
    const html = await evaluate(
      `(()=>{const d=document.documentElement.cloneNode(true);d.querySelectorAll('script').forEach(s=>s.remove());d.querySelector('link[rel="stylesheet"]').outerHTML='<style>'+${JSON.stringify(css)}+'</style>';return '<!doctype html>'+d.outerHTML;})()`,
    );
    writeFileSync(join(output, name + ".html"), html);
    const image = await call("Page.captureScreenshot", {
      format: "png",
      captureBeyondViewport: false,
    });
    writeFileSync(
      join(output, name + ".png"),
      Buffer.from(image.data, "base64"),
    );
  };
  await call("Runtime.enable");
  await call("Page.enable");
  await call("Emulation.setDeviceMetricsOverride", {
    width: 1440,
    height: 1000,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await call("Page.navigate", { url: url + "/" });
  for (let i = 0; i < 60; i++) {
    if (
      await evaluate(
        "typeof window.CiteApp === 'object' && document.querySelectorAll('#kpis .card').length===4",
      )
    )
      break;
    await pause(100);
  }
  await check(
    `document.querySelectorAll('#tabs button').length===4 && document.querySelector('[data-collection="personal"]').getAttribute('aria-pressed')==='true' && document.querySelectorAll('#runs-table [data-run]').length===0`,
    "Four tabs open on My data, not preloaded sample totals",
  );
  await check(
    `document.querySelector('.logo').complete && document.querySelector('.logo').naturalWidth>0 && document.title.includes('Source Trail')`,
    "Custom SVG identity loads at the current deployment prefix",
  );
  await state("desktop-overview");
  await click('[data-sample="all"]');
  await pause(500);
  await check(
    `document.querySelectorAll('#runs-table [data-run]').length===2`,
    "Original samples parse into two runs",
  );
  await click('[data-tab="overview"]');
  await evaluate(
    "document.querySelector('#kpis').scrollIntoView({block:'start'})",
  );
  await pause();
  await state("desktop-ledger");
  await click("#runs-table [data-run]");
  await check(
    `document.querySelector('#run-detail').innerText.includes('Source details')`,
    "Inline source snapshots",
  );
  await evaluate(
    `document.querySelector('#run-detail details:not(.notice)').open=true`,
  );
  await state("desktop-detail");
  await click('[data-tab="add"]');
  await evaluate("scrollTo(0,0)");
  await state("desktop-add");
  await evaluate(
    `document.querySelector('#paste').value='{';document.querySelector('#paste-btn').click()`,
  );
  await check(
    `document.querySelector('#import-feedback').innerText.includes('complete JSON')`,
    "Actionable malformed import error",
  );
  await evaluate(
    "document.querySelector('#import-feedback').scrollIntoView({block:'center'})",
  );
  await pause();
  await state("desktop-error");
  await evaluate(`document.querySelector('#sample-provider').value='grok'`);
  await click("#other-sample");
  await check(
    `document.querySelector('#run-detail').innerText.includes('Cited; retrieval not visible') && document.querySelector('#run-detail').innerText.includes('—')`,
    "Grok citation-only fixture has no fake rate",
  );
  await click('[data-f="citation-only"]');
  await check(
    `document.querySelectorAll('#run-detail tbody tr').length===2`,
    "Citation-only filter",
  );
  await evaluate(
    `document.querySelector('#run-detail .sources details').open=true`,
  );
  await state("desktop-citation-only");
  await click("#dl-run");
  await click("#export-json");
  await click("#export-csv");
  await check(
    `document.querySelector('#run-detail').innerText.includes('synthetic') || document.querySelector('#run-detail').innerText.includes('Synthetic')`,
    "Synthetic provenance remains visible",
  );
  await evaluate("location.reload()");
  await pause(400);
  await check(
    `document.querySelectorAll('#runs-table [data-run]').length===3`,
    "Reload preserves imports",
  );
  await click('[data-tab="how"]');
  await evaluate("scrollTo(0,0)");
  await state("desktop-how");
  await evaluate(
    "document.querySelector('.technical-details').open=true;document.querySelector('.technical-details').scrollIntoView({block:'start'})",
  );
  await pause();
  await state("desktop-technical");
  await evaluate("document.querySelector('.technical-details').open=false");
  await call("Emulation.setDeviceMetricsOverride", {
    width: 390,
    height: 1000,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await click('[data-tab="overview"]');
  await evaluate("scrollTo(0,0)");
  await state("mobile-overview");
  await evaluate(
    "document.querySelector('.trail-figure').scrollIntoView({block:'start'})",
  );
  await pause();
  await state("mobile-source-diagram");

  await check(
    `document.documentElement.scrollWidth<=innerWidth`,
    "Mobile overview contains page width",
  );
  await click('[data-tab="add"]');
  await evaluate("scrollTo(0,0)");
  await state("mobile-add");
  await check(
    `document.documentElement.scrollWidth<=innerWidth`,
    "Mobile import contains page width",
  );
  await click('[data-tab="runs"]');
  await click("#runs-table [data-run]");
  await evaluate(
    `document.querySelector('#run-detail .sources details').open=true`,
  );
  await state("mobile-detail");
  await evaluate(
    `document.querySelector('#run-detail .sources').scrollIntoView()`,
  );
  await pause();
  await state("mobile-source-snapshot");
  await check(
    `document.documentElement.scrollWidth<=innerWidth`,
    "Mobile table scroll stays inside panel",
  );
  // New onboarding and collection regression coverage.
  await call("Emulation.setDeviceMetricsOverride", {
    width: 1440,
    height: 1000,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await click('[data-tab="how"]');
  await click('[data-walkthrough="inspect"]');
  await pause(300);
  await check(
    `document.querySelector('#run-detail').innerText.includes('42 observed URL variants') && document.querySelector('#source-search')`,
    "Interactive walkthrough opens auditable ChatGPT evidence",
  );
  await evaluate(
    `document.querySelector('#source-search').value='youtube.com';document.querySelector('#source-search').dispatchEvent(new Event('input'))`,
  );
  await check(
    `document.querySelectorAll('#source-rows tr').length===2 && document.activeElement.id==='source-search'`,
    "Search filters sources without losing focus",
  );
  await click('[data-f="cited"]');
  await check(
    `document.querySelectorAll('#source-rows tr').length===2 && document.querySelector('#source-search').value==='youtube.com'`,
    "Search combines with cited filter",
  );
  await evaluate(
    `(()=>{const native=URL.createObjectURL;window.__downloads=[];URL.createObjectURL=function(blob){blob.text().then(text=>window.__downloads.push(text));return native.call(this,blob)};})()`,
  );
  await click("#export-visible");
  await check(
    `window.__downloads.at(-1).includes('youtube.com') && !window.__downloads.at(-1).includes('classcentral.com') && window.__downloads.at(-1).includes('observed_urls_json')`,
    "Filtered CSV contains only visible sources and preserves URL variants",
  );
  await evaluate(
    `document.querySelector('#source-search').value='no-such-source-qa';document.querySelector('#source-search').dispatchEvent(new Event('input'))`,
  );
  await check(
    `document.querySelectorAll('#source-rows tr').length===0 && document.querySelector('#export-visible').disabled && !document.querySelector('#source-empty').classList.contains('hidden')`,
    "Empty search is explained and disables export",
  );
  await state("desktop-search-empty");
  await evaluate(
    `document.querySelector('#source-search').value='youtube.com';document.querySelector('#source-search').dispatchEvent(new Event('input'));document.querySelector('#source-search').scrollIntoView({block:'center'})`,
  );
  await pause();
  await state("desktop-search");
  await click('[data-tab="how"]');
  await click('[data-walkthrough="export"]');
  await check(
    `window.__downloads.at(-1).includes('classcentral.com') && document.querySelector('#tab-how').classList.contains('active')`,
    "Walkthrough exports full example without changing current tab",
  );
  await click("#show-file-guide");
  await evaluate(
    `document.querySelector('#guide-provider').value='claude';document.querySelector('#guide-provider').dispatchEvent(new Event('change'));document.querySelector('#file-guide').scrollIntoView({block:'start'})`,
  );
  await pause();
  await check(
    `document.querySelector('#file-guide').open && document.querySelector('#guide-command').innerText.endsWith('--provider claude') && document.querySelector('#guide-filename').innerText==='claude_raw.json'`,
    "File guide adapts to chosen provider",
  );
  await state("desktop-file-guide");
  await click("#open-capture-guide");
  await check(
    `document.querySelector('#capture-guide').open && document.querySelector('#capture-command').innerText.endsWith('--provider claude')`,
    "Advanced guide opens from beginner instructions",
  );
  await state("desktop-capture-guide");
  await evaluate(
    `CiteApp.addRaw({schemaVersion:3,id:'personal-qa',platform:'custom',prompt:'My private research',createdAt:'2026-10-18T00:00:00Z',sources:[{url:'https://private-example.test/one',title:'Personal QA source',retrieved:true,cited:true}]});CiteApp.showTab('overview');scrollTo(0,0)`,
  );
  await check(
    `document.querySelector('[data-collection="personal"]').getAttribute('aria-pressed')==='true' && document.querySelectorAll('#runs-table [data-run]').length===1 && !document.querySelector('#latest-runs').innerText.includes('n8n')`,
    "Personal import automatically opens isolated My data",
  );
  await state("desktop-personal");
  await click("#export-csv");
  await check(
    `window.__downloads.at(-1).includes('My private research') && !window.__downloads.at(-1).includes('n8n')`,
    "Collection export excludes sample evidence",
  );
  await click('[data-collection="samples"]');
  await check(
    `document.querySelectorAll('#runs-table [data-run]').length===3 && !document.querySelector('#latest-runs').innerText.includes('My private research')`,
    "Samples are separate and personal import did not delete them",
  );
  await click('[data-sample="chatgpt"]');
  await click('[data-collection="personal"]');
  await check(
    `document.querySelectorAll('#runs-table [data-run]').length===1`,
    "Loading a sample preserves personal data",
  );
  await evaluate("location.reload()");
  await pause(500);
  await check(
    `document.querySelector('[data-collection="personal"]').getAttribute('aria-pressed')==='true' && document.querySelectorAll('#runs-table [data-run]').length===1`,
    "Collection selection and membership persist after reload",
  );
  await click('[data-collection="samples"]');
  await call("Emulation.setEmulatedMedia", {
    features: [{ name: "prefers-color-scheme", value: "dark" }],
  });
  await click('[data-tab="overview"]');
  await evaluate("scrollTo(0,0)");
  await state("desktop-dark");
  await call("Emulation.setEmulatedMedia", {
    features: [{ name: "prefers-color-scheme", value: "light" }],
  });
  await call("Emulation.setDeviceMetricsOverride", {
    width: 390,
    height: 1000,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await click('[data-tab="how"]');
  await evaluate("scrollTo(0,0)");
  await check(
    `document.documentElement.scrollWidth<=innerWidth`,
    "Interactive walkthrough fits mobile",
  );
  await state("mobile-how");
  await click("#show-file-guide");
  await evaluate(
    `document.querySelector('#file-guide').scrollIntoView({block:'start'})`,
  );
  await pause();
  await check(
    `document.documentElement.scrollWidth<=innerWidth`,
    "Expanded file guide fits mobile",
  );
  await state("mobile-file-guide");
  await click('[data-tab="how"]');
  await click('[data-walkthrough="inspect"]');
  await evaluate(
    `document.querySelector('#source-search').value='youtube.com';document.querySelector('#source-search').dispatchEvent(new Event('input'));document.querySelector('#source-search').scrollIntoView({block:'start'})`,
  );
  await pause();
  await check(
    `document.documentElement.scrollWidth<=innerWidth && document.querySelectorAll('#source-rows tr').length===2`,
    "Search controls and filtered sources fit mobile",
  );
  await state("mobile-search");
  await evaluate(
    `window.confirm=()=>true;document.querySelector('#clear-all').click();location.reload()`,
  );
  await pause(400);
  await check(
    `document.querySelectorAll('#runs-table [data-run]').length===0`,
    "Clear stays empty after reload",
  );
  await click('[data-tab="runs"]');
  await evaluate("scrollTo(0,0)");
  await state("mobile-empty");
  await click('[data-collection="personal"]');
  await check(
    `document.querySelectorAll('#runs-table [data-run]').length===1`,
    "Clearing Sample data preserves My data",
  );
  await click("#runs-table [data-run]");
  await evaluate("window.confirm=()=>true");
  await click("#del-run");
  await check(
    `document.querySelectorAll('#runs-table [data-run]').length===0`,
    "Individual analysis deletion updates collection",
  );
  if (errors.length) throw Error(errors.join("\n"));
  console.log(
    "PASS no uncaught browser exceptions; expanded desktop/mobile states recorded.",
  );
} finally {
  ws?.close();
  chrome.kill();
  server.close();
  await pause(200);
  try {
    rmSync(profile, { recursive: true, force: true });
  } catch {}
}
