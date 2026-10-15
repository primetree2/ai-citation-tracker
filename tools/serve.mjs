import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
const root = resolve(import.meta.dirname, '..');
const port = Number(process.env.PORT || 4173);
const types = {'.html':'text/html','.css':'text/css','.js':'text/javascript','.mjs':'text/javascript','.json':'application/json','.svg':'image/svg+xml','.md':'text/plain','.png':'image/png'};
createServer(async (req,res) => {
  try {
    const path = decodeURIComponent(new URL(req.url,'http://localhost').pathname);
    if (path.split('/').some(s => s.startsWith('.') && s !== '.')) throw new Error();
    let filename = resolve(root,'.'+path);
    if (!filename.startsWith(root+sep) && filename!==root) throw new Error();
    if ((await stat(filename)).isDirectory()) filename = resolve(filename,'index.html');
    res.writeHead(200,{'Content-Type':(types[extname(filename)]||'application/octet-stream')+'; charset=utf-8','X-Content-Type-Options':'nosniff','Cache-Control':'no-store'});
    res.end(await readFile(filename));
  } catch { res.writeHead(404,{'Content-Type':'text/plain'});res.end('File not found.'); }
}).listen(port,'127.0.0.1',()=>console.log(`Workspace available at http://localhost:${port}`));
