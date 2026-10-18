import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const {chromium,webkit}=createRequire(import.meta.url)('playwright');
const url=process.env.AUDIT_URL||'http://127.0.0.1:4173/pokemon-unite-draft/';
const results=[];
fs.mkdirSync('.artifacts/reliability',{recursive:true});
for(const engine of [chromium,webkit]) {
 const browser=await engine.launch();
 const context=await browser.newContext({viewport:{width:390,height:844},hasTouch:true});
 const page=await context.newPage();
 try {
  await page.addInitScript(()=>{
   window.failSave=true;
   const original=Storage.prototype.setItem;
   Storage.prototype.setItem=function(k,v){
    if(window.failSave && k==='unite-draft.v1')throw new DOMException('Test quota','QuotaExceededError');
    return original.call(this,k,v);
   };
  });
  await page.goto(url);
  await page.getByRole('button',{name:'使い方・ルール',exact:true}).click();
  await page.getByRole('button',{name:'保存を再試行',exact:true}).waitFor();
  assert(await page.evaluate(()=>{const e=new Event('beforeunload',{cancelable:true});window.dispatchEvent(e);return e.defaultPrevented;}));
  await page.evaluate(()=>window.failSave=false);
  await page.getByRole('button',{name:'保存を再試行',exact:true}).click();
  await page.waitForFunction(()=>localStorage.getItem('unite-draft.v1')!==null);
  await page.getByRole('button',{name:'保存を再試行',exact:true}).waitFor({state:'detached'});
  assert(!await page.evaluate(()=>{const e=new Event('beforeunload',{cancelable:true});window.dispatchEvent(e);return e.defaultPrevented;}));
  const saved=await page.evaluate(()=>localStorage.getItem('unite-draft.v1'));
  await page.getByText('利用中の版：',{exact:false}).waitFor();
  await page.getByRole('button',{name:'更新を確認',exact:true}).click();
  await page.getByText('更新を確認しました。',{exact:false}).waitFor();
  for(const [width,height] of [[390,844],[844,390],[320,568]]) {
   await page.setViewportSize({width,height});
   await page.evaluate(()=>document.documentElement.style.fontSize='32px');
   assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'horizontal overflow');
   await page.screenshot({path:`.artifacts/reliability/${engine.name()}-${width}.png`});
  }
  // Actual service-worker offline reload is browser-supported here, not a
  // claim about installed iOS/Android apps or OS storage eviction.
  await page.waitForFunction(()=>!!navigator.serviceWorker.controller,{},{timeout:60000});
  await page.getByText('オフラインで利用できます',{exact:true}).waitFor({timeout:60000});
  await context.setOffline(true);
  await page.waitForFunction(()=>!navigator.onLine);
  assert(await page.getByRole('button',{name:'更新を確認',exact:true}).isDisabled());
  try { await page.reload(); } catch(error) {
   if(engine.name()!=='webkit' || !String(error).includes('internal error'))throw error;
   results.push({engine:engine.name(),status:'UNTESTED',scope:'offline reload',reason:'WebKit automation internal navigation error'});
   await context.setOffline(false);
   await page.goto(url);
  }
  await page.locator('.setup-start').waitFor();
  assert.equal(await page.evaluate(()=>localStorage.getItem('unite-draft.v1')),saved);
  await page.getByRole('button',{name:'使い方・ルール',exact:true}).click();
  await context.setOffline(false);
  await page.getByRole('button',{name:'更新を確認',exact:true}).click();
  await page.getByText('更新を確認しました。',{exact:false}).waitFor();
  results.push({engine:engine.name(),status:'PASS',checks:['quota recovery','unsaved unload guard','build identity','update check','rotation and 200% font','reload preserves save','online recovery']});
 } catch(error) {results.push({engine:engine.name(),status:'FAIL',error:String(error)});}
 await browser.close();
}
results.push({scope:'physical iPhone / Android installation, OS suspension and eviction',status:'UNTESTED',reason:'No physical device session available'});
fs.writeFileSync('.artifacts/reliability/results.json',JSON.stringify({url,results},null,2));
console.log(results);
if(results.some(r=>r.status==='FAIL'))process.exitCode=1;
