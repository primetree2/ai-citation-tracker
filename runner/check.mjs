import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { join, relative } from "node:path";
const root = fileURLToPath(new URL("../", import.meta.url));
function run(args) {
  const r = spawnSync(process.execPath, args, { cwd: root, stdio: "inherit" });
  if (r.status !== 0) process.exit(r.status || 1);
}
function walk(dir) {
  for (const name of readdirSync(dir)) {
    const file = join(dir, name);
    if (statSync(file).isDirectory()) {
      if (
        ![
          "__pycache__",
          "node_modules",
          "out",
          ".capture-profile",
          "browser-profile",
        ].includes(name)
      )
        walk(file);
    } else if (/\.(?:js|cjs|mjs)$/.test(name)) run(["--check", file]);
  }
}
for (const dir of ["site", "src", "runner", "tests"]) walk(join(root, dir));
for (const file of [
  "index.html",
  ".nojekyll",
  "site/index.html",
  "site/mark.svg",
  "site/styles.css",
  "site/parser.js",
  "site/app.js",
  "site/chat-watcher.js",
  "site/live-sync.js",
  "site/demo-data.js",
  "sample-data/chatgpt_raw.json",
  "sample-data/claude_raw.json",
])
  if (!existsSync(join(root, file)))
    throw Error("Missing deployment file: " + file);
const html = readFileSync(join(root, "site/index.html"), "utf8");
for (const [, url] of html.matchAll(/(?:src|href)="([^"#]+)"/g)) {
  if (
    /^(?:https?:|data:|javascript:)/.test(url) ||
    !/\.(?:js|css|svg)(?:\?.*)?$/.test(url)
  )
    continue;
  if (url.startsWith("/"))
    throw Error("Asset must be relative for project Pages: " + url);
  if (!existsSync(join(root, "site", url.split("?")[0])))
    throw Error("Missing asset: " + url);
}
run(["runner/build.mjs", "--check"]);
console.log(
  "PASS syntax, static assets, project-relative paths, and generated parser",
);
