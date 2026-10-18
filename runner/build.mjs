import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
const root = fileURLToPath(new URL("../", import.meta.url));
const files = ["model", "adapters", "export", "streams"];
const body = files
  .map((f) =>
    readFileSync(root + "src/" + f + ".js", "utf8")
      .replace(/^import[\s\S]*?from ['"][^'"]+['"];\s*/gm, "")
      .replace(/^export\s+/gm, ""),
  )
  .join("\n");
const generated = `/* Built from src/ by runner/build.mjs. */\n(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.CiteParser=factory();})(typeof globalThis!=='undefined'?globalThis:this,function(){'use strict';\n${body}\nreturn {PROVIDERS,canonicalUrl,snapshotOf,normalizeRun,metrics,detect,parseOne,parseInput,parseText,parseConversation,parseStream,workspaceJson,sourcesCsv};\n});\n`;

if (process.argv.includes("--check")) {
  if (readFileSync(root + "site/parser.js", "utf8") !== generated) {
    console.error("site/parser.js is stale. Run npm run build and commit the result.");
    process.exitCode = 1;
  }
} else writeFileSync(root + "site/parser.js", generated);
