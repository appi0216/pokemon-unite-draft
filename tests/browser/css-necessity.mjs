import {createRequire} from 'node:module';
import fs from 'node:fs';
import assert from 'node:assert/strict';
const {chromium,webkit}=createRequire(import.meta.url)('playwright');
const results=[];
for(const engine of [chromium,webkit]) {
 const browser=await engine.launch();
 try {
  const page=await browser.newPage({viewport:{width:390,height:844},hasTouch:true});
  await page.goto(process.env.AUDIT_URL||'https://appi0216.github.io/pokemon-unite-draft/');
  await page.locator('.setup-start').click();
  await page.locator('.first-prompt-options button').first().click();
  const result=await page.evaluate(()=>{
   const element=document.querySelector('.sort-trigger');
   const measure=()=>({height:element.getBoundingClientRect().height,token:getComputedStyle(document.querySelector('.app')).getPropertyValue('--ui-control-size').trim()});
   const found=[];
   function visit(rules,condition='') { for(const r of rules) {
    if(r.selectorText==='.app' && r.style?.getPropertyValue('--ui-control-size').trim()==='44px' && condition.includes('coarse'))found.push(r);
    if(r.styleSheet)visit(r.styleSheet.cssRules,condition);
    if(r.cssRules)visit(r.cssRules,condition+' '+(r.conditionText||''));
   }}
   for(const sheet of document.styleSheets)visit(sheet.cssRules);
   if(found.length!==1)throw Error(`Expected one coarse-pointer token rule, got ${found.length}`);
   const before=measure();const rule=found[0];
   const value=rule.style.getPropertyValue('--ui-control-size');
   const priority=rule.style.getPropertyPriority('--ui-control-size');
   let removed;
   try {rule.style.removeProperty('--ui-control-size');removed=measure();}
   finally {rule.style.setProperty('--ui-control-size',value,priority);}
   return {coarse:matchMedia('(pointer:coarse)').matches,before,removed,restored:measure()};
  });
  assert(result.coarse);assert.equal(result.before.height,44);
  assert(result.removed.height<44);assert.deepEqual(result.before,result.restored);
  results.push({engine:engine.name(),status:'PASS',rule:'src/ui-tokens.css @media(pointer:coarse) .app',decision:'retain: removal changes a reachable touch-target height',...result});
 }finally{await browser.close();}
}
fs.mkdirSync('.artifacts/css-necessity',{recursive:true});
fs.writeFileSync('.artifacts/css-necessity/results.json',JSON.stringify(results,null,2));
console.log(results);
