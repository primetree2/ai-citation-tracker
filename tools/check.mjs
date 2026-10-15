import { readdirSync,readFileSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
const files=[];
function walk(path) {for(const entry of readdirSync(path,{withFileTypes:true})){const full=join(path,entry.name);if(entry.isDirectory())walk(full);else if(/\.m?js$/.test(full))files.push(full);}}
walk('src');walk('tools');walk('tests');
for(const file of files){const result=spawnSync(process.execPath,['--check',file],{encoding:'utf8'});if(result.status!==0){console.error(result.stderr);process.exit(1);}}
const html=readFileSync('index.html','utf8');
for(const match of html.matchAll(/(?:src|href)="((?:src|public)\/[^"?#]+)"/g))readFileSync(match[1]);
console.log(`Checked ${files.length} JavaScript modules and entry-page assets.`);
