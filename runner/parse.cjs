const fs = require("node:fs"),
  P = require("../site/parser.js");
const args = process.argv.slice(2),
  file = args[0];
if (!file) {
  console.error("Usage: node runner/parse.cjs FILE [--provider NAME] [--csv]");
  process.exit(1);
}
try {
  const index = args.indexOf("--provider"),
    provider = index >= 0 ? args[index + 1] : "";
  const text =
    file === "-" ? fs.readFileSync(0, "utf8") : fs.readFileSync(file, "utf8");
  const runs = P.parseText(text, file, provider);
  process.stdout.write(
    args.includes("--csv") ? P.sourcesCsv(runs) : P.workspaceJson(runs),
  );
} catch (e) {
  console.error(e.message);
  process.exit(1);
}
