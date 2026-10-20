import {createRequire} from 'node:module';
import fs from 'node:fs';
import assert from 'node:assert/strict';
const {chromium,webkit}=createRequire(import.meta.url)('playwright');
const results=[];
for(const engine of [chromium,webkit]) {
 const browser=await engine.launch();
 try {
  const context=await browser.newContext();
  const page=await context.newPage();
  await page.goto(process.env.AUDIT_URL||'https://appi0216.github.io/pokemon-unite-draft/');
  await page.getByRole('button',{name:'使い方・ルール',exact:true}).click();
  const button=page.getByRole('button',{name:'更新を確認',exact:true});
  await button.waitFor();
  await page.keyboard.press('Tab');
  await button.focus();
  await page.waitForFunction(()=>document.querySelector('.pwa-panel button:focus-visible'));
  assert(await button.evaluate(el=>el.matches(':focus-visible')));
  const result=await button.evaluate(el=>{
   const rules=[];
   function visit(list){for(const r of list){if(r.selectorText==='.pwa-panel button:focus-visible')rules.push(r);if(r.styleSheet)visit(r.styleSheet.cssRules);if(r.cssRules)visit(r.cssRules);}}
   for(const sheet of document.styleSheets)visit(sheet.cssRules);
   if(rules.length!==1)throw Error(`Expected one focus rule, got ${rules.length}`);
   const measure=()=>({outline:getComputedStyle(el).outline,offset:getComputedStyle(el).outlineOffset});
   const rule=rules[0],css=rule.style.cssText,before=measure();let removed;
   try{rule.style.cssText='';removed=measure();}finally{rule.style.cssText=css;}
   return {before,removed,restored:measure()};
  });
  assert.notDeepEqual(result.before,result.removed);
  assert.deepEqual(result.before,result.restored);


  results.push({engine:engine.name(),status:'PASS',rule:'.pwa-panel button:focus-visible',scope:'Keyboard focus visible; effect witness, not every declaration essential',...result});
 }finally{await browser.close();}
}
fs.mkdirSync('.artifacts/css-pwa-focus',{recursive:true});
fs.writeFileSync('.artifacts/css-pwa-focus/results.json',JSON.stringify(results,null,2));
console.log(results);

