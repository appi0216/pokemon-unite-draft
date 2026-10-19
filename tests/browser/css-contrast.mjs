import {createRequire} from 'node:module';
import fs from 'node:fs';
import assert from 'node:assert/strict';
const {chromium,webkit}=createRequire(import.meta.url)('playwright');
const results=[];
for(const engine of [chromium,webkit]) {
 const browser=await engine.launch();
 try {
  for(const [width,height] of [[320,568],[667,375],[1440,900]]) {
  const page=await browser.newPage({contrast:'more',viewport:{width,height}});
  await page.goto(process.env.AUDIT_URL||'https://appi0216.github.io/pokemon-unite-draft/');
  await page.locator('.setup-start').click();
  await page.locator('.first-prompt-options button').first().click();
  await page.locator('.pokemon-card').first().waitFor();
  for(const state of ['initial','hover','selected','keyboard']) {
  const card=page.locator('.pokemon-card:not(.skip-card)').first();
  if(state==='hover')await card.hover();
  if(state==='selected')await card.click();
  if(state==='keyboard'){await page.keyboard.press('Tab');await card.focus();}
  await page.waitForTimeout(300);
  results.push(...await page.evaluate(async()=>{
   if(!matchMedia('(prefers-contrast:more)').matches)return [{status:'UNSUPPORTED',condition:'prefers-contrast'}];
   const found=[];
   function visit(list,condition=''){for(const r of list){
    if(r.selectorText && condition.includes('prefers-contrast'))found.push(r);
    if(r.styleSheet)visit(r.styleSheet.cssRules,condition);
    if(r.cssRules)visit(r.cssRules,condition+' '+(r.conditionText||''));
   }}
   for(const sheet of document.styleSheets)visit(sheet.cssRules);
   const output=[];
   for(const rule of found){
    const elements=[...document.querySelectorAll(rule.selectorText)];
    const measure=()=>elements.map(el=>{const s=getComputedStyle(el);return {border:s.borderColor,surface:s.getPropertyValue('--surface-border'),secondary:s.getPropertyValue('--text-secondary')};});
    const css=rule.style.cssText,before=measure();let removed;
    try{rule.style.cssText='';await new Promise(r=>setTimeout(r,300));removed=measure();}finally{rule.style.cssText=css;}
    await new Promise(r=>setTimeout(r,300));
    output.push({selector:rule.selectorText,matched:elements.length,before,removed,restored:measure(),status:JSON.stringify(before)!==JSON.stringify(removed)?'OBSERVED_EFFECT':'NO_OBSERVED_EFFECT_RETAIN'});
   }
   return output;
  }).then(rows=>rows.map(row=>({engine:engine.name(),width,height,state,...row}))));
  }
  await page.close();
  }
 }finally{await browser.close();}
}
for(const result of results)if(result.restored)assert.deepEqual(result.before,result.restored);
assert.equal(results.length,48,'Both engines must complete all 24 state comparisons for both rules');
assert(results.every(r=>r.status==='OBSERVED_EFFECT' && r.matched>0),'Every reported rule must have a reachable effect');
fs.mkdirSync('.artifacts/css-contrast',{recursive:true});
fs.writeFileSync('.artifacts/css-contrast/results.json',JSON.stringify(results,null,2));
console.log(results.map(({engine,selector,status,matched})=>({engine,selector,status,matched})));
