import { readFile, writeFile } from 'node:fs/promises';
import { parseText } from '../src/core/adapters.js';
import { sourcesCsv, workspaceJson } from '../src/core/export.js';
const args = process.argv.slice(2);
if (!args.length || args.includes('--help')) {
  console.log('Parse saved JSON locally.\n\nnode tools/parse.mjs my-response.json [more.json] --out my-workspace.json\nnode tools/parse.mjs my-response.json --csv my-sources.csv\n\nAn output path is required. Input files are never modified.');
  process.exit(args.length ? 0 : 1);
}
let output, csv; const files = [];
for(let i=0;i<args.length;i++) {
  if(args[i]==='--out') output=args[++i];
  else if(args[i]==='--csv') csv=args[++i];
  else if(args[i].startsWith('--')) {console.error('Unrecognized option: '+args[i]);process.exit(1);}
  else files.push(args[i]);
}
if(!files.length || (!output&&!csv)) {console.error('Provide input files and --out or --csv.');process.exit(1);}
try {
  const { resolve } = await import('node:path');
  for(const target of [output,csv].filter(Boolean)) if(files.some(f=>resolve(f)===resolve(target))) throw new Error('Output paths must not overwrite input files.');
  if(output && csv && resolve(output)===resolve(csv)) throw new Error('JSON and CSV output paths must be different.');
  const runs=[];
  for(const file of files) runs.push(...parseText(await readFile(file,'utf8'),file));
  if(output) await writeFile(output,workspaceJson(runs));
  if(csv) await writeFile(csv,sourcesCsv(runs));
  console.log(`Parsed ${runs.length} run(s). Requested output files written.`);
} catch(e) {console.error(e.message);process.exit(1);}
