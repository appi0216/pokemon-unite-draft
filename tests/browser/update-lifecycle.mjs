import {createRequire} from 'node:module';
import fs from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createOfflineBundle} from '../../scripts/build-offline.mjs';
const {chromium,webkit}=createRequire(import.meta.url)('playwright');
const root=path.resolve('.artifacts/update-lifecycle');
await fs.mkdir(root,{recursive:true});
// Two controlled releases of the production app isolate worker lifecycle
// behavior. This is not an OS install or a historical schema migration test.
for(const version of ['A','B']) {
 const dir=path.join(root,version);
 await fs.cp('dist',dir,{recursive:true});
 const html=await fs.readFile(path.join(dir,'index.html'),'utf8');
 await fs.writeFile(path.join(dir,'index.html'),html.replace('<head>',`<head><meta name="test-release" content="${version}">`));
 await fs.writeFile(path.join(dir,'sw.js'),(await createOfflineBundle(dir)).source);
}
let version='A', unavailable=false;
const server=http.createServer(async(req,res)=>{
 if(unavailable){req.socket.destroy();return;}
 try {
  const pathname=new URL(req.url,'http://localhost').pathname;
  let file=pathname.replace(/^\/pokemon-unite-draft\//,'');
  if(!file)file='index.html';
  if(file.includes('..'))throw Error('path');
  const data=await fs.readFile(path.join(root,version,file));
  const types={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.webmanifest':'application/manifest+json','.webp':'image/webp','.png':'image/png'};
  res.writeHead(200,{'Content-Type':types[path.extname(file)]||'application/octet-stream','Cache-Control':'no-store'});res.end(data);
 }catch{res.writeHead(404);res.end();}
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const url=`http://127.0.0.1:${server.address().port}/pokemon-unite-draft/`;
const results=[];
for(const engine of [chromium,webkit]) {
 version='A';unavailable=false;
 const browser=await engine.launch();
 const context=await browser.newContext();
 try {
  let page=await context.newPage();
  await page.goto(url);
  await page.waitForFunction(()=>!!navigator.serviceWorker.controller);
  await page.locator('.setup-start').click();
  await page.locator('.first-prompt-options button').first().click();
  const saved=await page.evaluate(()=>localStorage.getItem('unite-draft.v1'));
  const other=await context.newPage();await other.goto(url);
  version='B';
  await page.evaluate(async()=>{const r=await navigator.serviceWorker.getRegistration();await r.update();});
  await page.waitForFunction(async()=>!!(await navigator.serviceWorker.getRegistration()).waiting);
  await page.reload();
  assert.equal(await page.locator('meta[name="test-release"]').getAttribute('content'),'A','do not replace active draft');
  await page.close();await other.close();
  page=await context.newPage();
  // Wait for activation without relying on a fixed sleep: repeated navigations
  // check the version that the actual controlling worker serves.
  for(let i=0;i<30;i++) {
   await page.goto(url);
   if(await page.locator('meta[name="test-release"]').getAttribute('content')==='B')break;
   await page.goto('about:blank');await new Promise(r=>setTimeout(r,100));
  }
  assert.equal(await page.locator('meta[name="test-release"]').getAttribute('content'),'B');
  assert.equal(await page.evaluate(()=>localStorage.getItem('unite-draft.v1')),saved);
  // Drop all server connections rather than WebKit's offline automation flag.
  unavailable=true;
  await page.reload();
  await page.locator('.pokemon-grid').waitFor();
  assert.equal(await page.locator('meta[name="test-release"]').getAttribute('content'),'B');
  assert.equal(await page.evaluate(()=>localStorage.getItem('unite-draft.v1')),saved);
  unavailable=false;
  await page.evaluate(async()=>{await (await navigator.serviceWorker.getRegistration()).update();});
  results.push({engine:engine.name(),status:'PASS',checks:['two-tab update waits','new release after both tabs close','draft preserved','server-unreachable reload','network recovery']});
 }catch(error){results.push({engine:engine.name(),status:'FAIL',error:String(error)});}
 await browser.close();
}
server.closeAllConnections();await new Promise(r=>server.close(r));
await fs.writeFile(path.join(root,'results.json'),JSON.stringify(results,null,2));
console.log(results);if(results.some(r=>r.status==='FAIL'))process.exitCode=1;
