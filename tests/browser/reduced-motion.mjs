import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
const {chromium,webkit}=createRequire(import.meta.url)('playwright');
for(const engine of [chromium,webkit]){
 const browser=await engine.launch();
 try{
  const page=await browser.newPage({reducedMotion:'reduce'});
  await page.goto(process.env.AUDIT_URL||'http://127.0.0.1:4180/pokemon-unite-draft/');
  await page.locator('.setup-start').waitFor();
  for(const state of ['home','draft']){
   if(state==='draft'){await page.locator('.setup-start').click();await page.locator('.first-prompt-options button').first().click();}
   const violations=await page.evaluate(()=>{
    if(!matchMedia('(prefers-reduced-motion:reduce)').matches)throw Error('Reduced motion condition missing');
    return [...document.querySelectorAll('*')].flatMap(el=>[null,'::before','::after'].flatMap(p=>{
     const s=getComputedStyle(el,p);
     return s.animationName!=='none'||s.transitionProperty!=='none'?[{tag:el.tagName,p,animation:s.animationName,transition:s.transitionProperty}]:[];
    }));
   });
   assert.deepEqual(violations,[]);
   console.log(engine.name(),state,'reduced-motion PASS');
  }
 }finally{await browser.close();}
}
