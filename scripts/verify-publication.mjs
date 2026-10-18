import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
const base=process.env.PUBLIC_URL||'https://appi0216.github.io/pokemon-unite-draft/';
const html=await fs.readFile('dist/index.html','utf8');
const assets=[...html.matchAll(/(?:src|href)="([^"]+\/assets\/[^"?#]+)"/g)].map(m=>m[1]);
const hash=b=>createHash('sha256').update(b).digest('hex');
let last;
for(let attempt=0;attempt<6;attempt++) {
 try {
  for(const file of ['index.html','sw.js',...assets.map(a=>a.slice(a.indexOf('/assets/')+1))]) {
   const response=await fetch(new URL(file,base),{cache:'no-store',signal:AbortSignal.timeout(15000)});
   if(!response.ok)throw Error(`${file}: HTTP ${response.status}`);
   if(hash(Buffer.from(await response.arrayBuffer()))!==hash(await fs.readFile(`dist/${file}`)))throw Error(`${file}: published content differs`);
  }
  console.log('PASS: published HTML, application assets and service worker match this build');
  process.exit(0);
 } catch(error) {last=error; if(attempt<5)await new Promise(resolve=>setTimeout(resolve,10000));}
}
throw last;
