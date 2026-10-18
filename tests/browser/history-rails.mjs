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
   if(size[0]<=1000) {
    const panel=page.locator(`.team-side.${team} .team-panel`);
    assert(await panel.isVisible());
    const footer=await page.locator('.decision-bar').boundingBox();
    await rail.locator('.history-toggle').click();
    assert(!await panel.isVisible());
    await page.waitForTimeout(200);

    for(let game=0;game<6;game++) {
     const portraits=rail.locator('.history-game[data-current="true"] .portrait');
     assert.equal(await portraits.count(),5);
     for(const box of await portraits.evaluateAll(es=>es.map(e=>{const r=e.getBoundingClientRect();return {w:r.width,h:r.height}})))
      assert(box.w>=28 && box.h>=28,`history portrait too small ${JSON.stringify(box)}`);
     if(game<5)await rail.getByRole('button',{name:'次の試合の選択済み'}).click();
    }
    const after=await page.locator('.decision-bar').boundingBox();
    assert(Math.abs(footer.y-after.y)<1,'footer moved on expansion');
    await rail.locator('.history-toggle').click();
    assert(await panel.isVisible(),'close must restore team');
    await rail.locator('.history-toggle').click();
   }
   assert(await rail.locator('.history-scroll').evaluate(e=>e.scrollHeight<=e.clientHeight+1),'history must not scroll');
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
  const end=await expanded.locator('.portrait:visible').last().boundingBox(), viewport=await expanded.boundingBox();
  assert(end.y+end.height<=viewport.y+viewport.height+1,'200% last portrait unreachable');
  console.log(`${engine} ${rule} ${size}: both 30-item rails PASS`);
  await page.close();
 }
 await browser.close();
}
