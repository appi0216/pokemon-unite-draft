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
  for(let game=0;game<5;game++) {
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
   await page.waitForTimeout(150);
   const head=await page.locator('.header-center').boundingBox();
   assert(Math.abs(head.x+head.width/2-size[0]/2)<3,'header must be centered');
   const seen=[]; let firstHeight;
   for(let n=0;n<6;n++) {
    const games=rail.locator('.history-game');
    const height=(await games.first().boundingBox()).height;
    firstHeight ??= height;
    assert(Math.abs(height-firstHeight)<1,'partial page must retain full-page game height');
    for(let i=0;i<await games.count();i++) {
     assert.equal(await games.nth(i).locator('.portrait').count(),5);
     seen.push(await games.nth(i).getAttribute('aria-label'));
    }
    assert(await rail.locator('.history-scroll').evaluate(e=>e.scrollHeight<=e.clientHeight+1),'page must not scroll');
    const next=rail.getByRole('button',{name:'選択済の次のページ'});
    if(await next.isDisabled())break;
    await rail.locator('.history-scroll').evaluate(el=>{
      const touchEvent=(name,props)=>Object.assign(new Event(name,{bubbles:true}),{touches:props.touches,changedTouches:props.changedTouches||[]});
      const touch=(x)=>({identifier:1,target:el,clientX:x,clientY:150});
      el.dispatchEvent(touchEvent('touchstart',{bubbles:true,touches:[touch(100)]}));
      el.dispatchEvent(touchEvent('touchend',{bubbles:true,touches:[],changedTouches:[touch(40)]}));
    });
    await page.waitForTimeout(50);
   }
   assert.equal(seen.length,5);
   assert.equal(new Set(seen).size,5);
   assert(await page.locator(`.team-side.${team} .team-panel`).isVisible());
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
  console.log(`${engine} ${rule} ${size}: both 25-item rails with stable page heights PASS`);
  await page.close();
 }
 await browser.close();
}




