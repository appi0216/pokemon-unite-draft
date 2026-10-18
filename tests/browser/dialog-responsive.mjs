import {createRequire} from 'node:module';
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {createDraft,choose,nextGame,currentStep,unavailable} from '../../src/domain/draft.ts';
const {chromium,webkit}=createRequire(import.meta.url)('playwright');
const roster=JSON.parse(await fs.readFile('src/data/pokemon.json','utf8')),ids=roster.map(p=>p.id);
for(const engine of [chromium,webkit]) {
 const browser=await engine.launch();
 for(const [width,height] of [[320,568],[667,375],[1440,900]]) {
  const page=await browser.newPage({viewport:{width,height}});
  let draft=createDraft('purple',true,3,'all-star');
  while(currentStep(draft))draft=choose(draft,roster.find(p=>!unavailable(draft,p.id,currentStep(draft).team)).id,ids);
  draft=nextGame(draft,'purple');
  await page.addInitScript(d=>localStorage.setItem('unite-draft.v1',JSON.stringify({draft:d,started:true})),draft);
  await page.goto(process.env.AUDIT_URL||'http://127.0.0.1:5174/pokemon-unite-draft/');
  const cards=page.locator('.pokemon-card');
  await cards.nth(1).focus();
  await page.keyboard.press('ArrowLeft');
  assert.equal(await page.locator('.pokemon-card.is-selected:not(.skip-card)').count(),0);
  assert.equal(await cards.first().evaluate(e=>getComputedStyle(e).outlineOffset),'-3px');
  await page.getByRole('button',{name:'試合履歴・画像保存',exact:true}).click();
  for(const font of ['16px','32px']) {
   await page.evaluate(f=>document.documentElement.style.fontSize=f,font);
   const dialog=page.locator('dialog[open]');
   const teams=await page.locator(".past-game-review").first().locator(":scope > section").evaluateAll(es=>es.map(e=>{const r=e.getBoundingClientRect();return {x:r.x,y:r.y,w:r.width}}));
   assert(Math.abs(teams[0].y-teams[1].y)<1 && teams[1].x>=teams[0].x+teams[0].w,"teams must stay side by side");
   const box=await dialog.boundingBox();
   assert(box.x>=0 && box.y>=0 && box.x+box.width<=width+1 && box.y+box.height<=height+1,'dialog outside viewport');
   assert(await dialog.evaluate(e=>e.scrollWidth<=e.clientWidth+1),'horizontal overflow');
   const close=dialog.getByRole('button',{name:'閉じる',exact:true});
   assert(await close.isVisible());
  }
  await page.screenshot({path:`.artifacts/review-responsive-${engine.name()}-${width}.png`});
  await page.close();
  console.log(engine.name(),width,'history and focus PASS');
 }
 await browser.close();
}


