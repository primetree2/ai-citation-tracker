import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
for(const args of [['runner/prepare-pages.mjs'],['tests/browser-smoke.mjs']]){
 const r=spawnSync(process.execPath,args,{cwd:root,stdio:'inherit',env:{...process.env,SITE_ROOT:root+'_site',PAGES_PREFIX:'/ai-citation-tracker'}});
 if(r.status!==0)process.exit(r.status||1);
}
console.log('PASS staged Pages artifact works under /ai-citation-tracker/, including samples, search, and exports.');
