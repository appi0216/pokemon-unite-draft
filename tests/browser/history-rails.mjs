import {createRequire} from 'node:module';
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {createDraft,choose,nextGame,currentStep,unavailable} from '../../src/domain/draft.ts';
const {chromium,webkit}=createRequire(import.meta.url)('playwright');
const roster=JSON.parse(await fs.readFile('src/data/pokemon.json','utf8'));
const ids=roster.map(p=>p.id);
const out=process.env.AUDIT_OUT||'.artifacts/history-rail-check';
await fs.mkdir(out,{recursive:true});
for(const [engine,launcher] of Object.entries({chromium,webkit})) {
 const browser=await launcher.launch();
 for(const rule of ['all-star','fearless']) for(const size of [[320,568],[390,844],[667,375],[1523,800]]) {
  let draft=createDraft('purple',true,7,rule);
  for(let game=0;game<6;game++) {
   while(currentStep(draft)) {
    const p=roster.find(p=>!unavailable(draft,p.id,currentStep(draft).team));
    draft=choose(draft,p.id,ids);
   }
   draft=nextGame(draft,'purple');
  }
  const page=await browser.newPage({viewport:{width:size[0],height:size[1]},hasTouch:true});
  await page.addInitScript(d=>localStorage.setItem('unite-draft.v1',JSON.stringify({draft:d,started:true})),draft);
  await page.goto(process.env.AUDIT_URL||'http://127.0.0.1:5174/pokemon-unite-draft/');
  if(await page.locator('.setup-resume').isVisible()) await page.locator('.setup-resume').click();
  for(const team of ['purple','orange']) {
   const tab=page.locator(`.compact-view-tabs .${team}`);
   if(await tab.isVisible())await tab.click();
   const rail=page.locator(`.team-history.${team}`);
   await rail.waitFor({state:'visible'});
   assert.equal(await rail.locator('.portrait').count(),30);
   const r=await rail.boundingBox(),panel=await page.locator(`.team-side.${team} .team-panel`).boundingBox();
   assert(Math.abs(r.y-panel.y)<3,'rail must align with panel top');
   assert(team==='purple'?r.x+r.width<=panel.x+1:panel.x+panel.width<=r.x+1,'rail must be outside team');
   const boxes=await rail.locator('.history-pokemon-item').evaluateAll(es=>es.map(e=>{const r=e.getBoundingClientRect();return {x:r.x,y:r.y,bottom:r.bottom}}));
   assert(await rail.locator('.history-scroll').evaluate(e=>e.scrollHeight<=e.clientHeight+1 && e.scrollWidth<=e.clientWidth+1),'history must not scroll');
   await rail.locator('.history-scroll').evaluate(e=>e.scrollTop=e.scrollHeight);
   await page.waitForTimeout(250);
   const last=await rail.locator('.portrait').last().boundingBox();
   assert(last.y>=r.y && last.y+last.height<=r.y+r.height+1,'last history item must be reachable');
   await page.screenshot({path:`${out}/${engine}-${rule}-${size.join('x')}-${team}.png`});
  }
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'horizontal overflow');
  assert(await page.locator('.decision-bar').evaluate(e=>e.getBoundingClientRect().bottom<=innerHeight+1),'footer outside viewport');
  await page.evaluate(()=>document.documentElement.style.fontSize='32px');
  await page.waitForTimeout(100);
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'200% horizontal overflow');
  const expanded=page.locator('.team-history.orange .history-scroll');
  await expanded.evaluate(e=>e.scrollTop=e.scrollHeight);
  await page.waitForTimeout(100);
  const end=await expanded.locator('.portrait').last().boundingBox(), viewport=await expanded.boundingBox();
  assert(end.y+end.height<=viewport.y+viewport.height+1,'200% last portrait unreachable');
  console.log(`${engine} ${rule} ${size}: both 30-item rails PASS`);
  await page.close();
 }
 await browser.close();
}
