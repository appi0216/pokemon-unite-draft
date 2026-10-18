import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
const {chromium,webkit}=createRequire(import.meta.url)('playwright');
for(const engine of [chromium,webkit]) {
 const browser=await engine.launch();
 const page=await browser.newPage({viewport:{width:390,height:844},hasTouch:true});
 await page.goto(process.env.AUDIT_URL||'http://127.0.0.1:5174/pokemon-unite-draft/');
 await page.locator('.setup-start').click();
 await page.locator('.first-prompt-options button').first().click();
 const first=()=>page.locator('.pokemon-card').first().getAttribute('aria-label');
 const initial=await first();
 const swipe=async(dx,dy=0)=>{
  await page.locator('.pokemon-grid').evaluate((el,{dx,dy})=>{
   const touchEvent=(name,props)=>Object.assign(new Event(name,{bubbles:true}),{touches:props.touches,changedTouches:props.changedTouches||[]});
   const t=(x,y)=>({identifier:1,target:el,clientX:x,clientY:y});
   el.dispatchEvent(touchEvent('touchstart',{bubbles:true,touches:[t(200,200)]}));
   el.dispatchEvent(touchEvent('touchend',{bubbles:true,touches:[],changedTouches:[t(200+dx,200+dy)]}));
  },{dx,dy});
  await page.waitForTimeout(80);
 };
 await swipe(-100);
 assert.notEqual(await first(),initial);
 await page.locator('.pokemon-card').first().dispatchEvent('click');
 assert.equal(await page.locator('.pokemon-card.is-selected').count(),0,'swipe must not select');
 await swipe(100);
 assert.equal(await first(),initial);
 await swipe(10,100);
 assert.equal(await first(),initial,'vertical movement must not page');
 await swipe(100);
 assert.equal(await first(),initial,'first boundary must not wrap');
 await page.waitForTimeout(550);
 await page.locator('.pokemon-card').first().click();
 assert.equal(await page.locator('.pokemon-card.is-selected').count(),1,'normal tap must work');
 await browser.close();
 console.log(engine.name()+': roster swipe forward/back, vertical, boundary, click suppression PASS');
}

