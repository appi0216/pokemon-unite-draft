import {createRequire} from 'node:module';
import fs from 'node:fs';
import assert from 'node:assert/strict';
const {chromium,webkit}=createRequire(import.meta.url)('playwright');
const results=[];
for(const engine of [chromium,webkit]) {
 const browser=await engine.launch();
 try {
  const page=await browser.newPage({forcedColors:'active'});
  await page.goto(process.env.AUDIT_URL||'https://appi0216.github.io/pokemon-unite-draft/');
  await page.locator('.setup-mode-choice').first().waitFor();
  results.push(...await page.evaluate(()=>{
   if(!matchMedia('(forced-colors:active)').matches)return [{status:'UNSUPPORTED',condition:'forced-colors'}];
   const found=[];
   function visit(list,condition=''){for(const r of list){
    if(r.selectorText && condition.includes('forced-colors'))found.push(r);
    if(r.styleSheet)visit(r.styleSheet.cssRules,condition);
    if(r.cssRules)visit(r.cssRules,condition+' '+(r.conditionText||''));
   }}
   for(const sheet of document.styleSheets)visit(sheet.cssRules);
   return found.map(rule=>{
    const elements=[...document.querySelectorAll(rule.selectorText)];
    const measure=()=>elements.map(el=>{const s=getComputedStyle(el);return {width:s.outlineWidth,style:s.outlineStyle,color:s.outlineColor,offset:s.outlineOffset};});
    const css=rule.style.cssText,before=measure();let removed;
    try{rule.style.cssText='';removed=measure();}finally{rule.style.cssText=css;}
    return {selector:rule.selectorText,matched:elements.length,before,removed,restored:measure(),status:JSON.stringify(before)!==JSON.stringify(removed)?'OBSERVED_EFFECT':'NO_OBSERVED_EFFECT_RETAIN'};
   });
  }).then(rows=>rows.map(row=>({engine:engine.name(),...row}))));
 }finally{await browser.close();}
}
for(const result of results)if(result.restored)assert.deepEqual(result.before,result.restored);
assert(results.some(r=>r.status==='OBSERVED_EFFECT'));
fs.mkdirSync('.artifacts/css-forced-colors',{recursive:true});
fs.writeFileSync('.artifacts/css-forced-colors/results.json',JSON.stringify(results,null,2));
console.log(results.map(({engine,selector,status,matched})=>({engine,selector,status,matched})));
