// Only explicitly reviewed public application assets enter the Actions artifact.
import {mkdirSync,rmSync,copyFileSync,existsSync,lstatSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {join,dirname} from 'node:path';
const root=fileURLToPath(new URL('../',import.meta.url)), output=join(root,'_site');
const files=['index.html','.nojekyll',
 ...['index.html','styles.css','parser.js','app.js','demo-data.js','chat-watcher.js','live-sync.js'].map(p=>'site/'+p),
 'sample-data/chatgpt_raw.json','sample-data/claude_raw.json',
 ...['openai','anthropic','gemini','perplexity','grok','custom'].map(p=>'sample-data/api/'+p+'.json'),
 'sample-data/streams/chatgpt-synthetic.sse'];
if(existsSync(join(root,'CNAME')))files.push('CNAME');
for(const file of files)if(!existsSync(join(root,file))||!lstatSync(join(root,file)).isFile())throw Error('Public asset missing or not a regular file: '+file);
rmSync(output,{recursive:true,force:true});
for(const file of files){mkdirSync(dirname(join(output,file)),{recursive:true});copyFileSync(join(root,file),join(output,file));}
console.log(`Prepared _site/ with ${files.length} public files. Runner code, browser profiles, private captures, and test output are excluded.`);
