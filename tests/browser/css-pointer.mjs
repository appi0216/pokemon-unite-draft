import {createRequire} from 'node:module';
import fs from 'node:fs';import assert from 'node:assert/strict';
const {chromium,webkit}=createRequire(import.meta.url)('playwright');const results=[];
for(const engine of [chromium,webkit]){const browser=await engine.launch();try{
 for(const hasTouch of [false,true]){const page=await browser.newPage({viewport:{width:667,height:375},hasTouch});await page.goto(process.env.AUDIT_URL||'https://appi0216.github.io/pokemon-unite-draft/');await page.locator('.setup-start').waitFor();
 for(const state of ['home','draft']){if(state==='draft'){await page.locator('.setup-start').click();await page.locator('.first-prompt-options button').first().click();}
 results.push(...await page.evaluate(()=>{const found=[];function visit(list,condition=''){for(const r of list){if(r.selectorText==='.app'&&r.style?.getPropertyValue('--control-size')&&condition.includes('pointer:')&&matchMedia(condition).matches)found.push(r);if(r.styleSheet)visit(r.styleSheet.cssRules,condition);if(r.cssRules)visit(r.cssRules,r.conditionText||condition);}}for(const sheet of document.styleSheets)visit(sheet.cssRules);
 return found.map(rule=>{const el=document.querySelector('.app'),measure=()=>getComputedStyle(el).getPropertyValue('--control-size').trim(),css=rule.style.cssText,before=measure();let removed;try{rule.style.cssText='';removed=measure();}finally{rule.style.cssText=css;}return {before,removed,restored:measure(),status:before===removed?'NO_TOKEN_EFFECT_RETAIN':'TOKEN_EFFECT_RETAIN'};});}).then(rows=>rows.map(r=>({engine:engine.name(),hasTouch,state,...r}))));
 }await page.close();}
 }finally{await browser.close();}}
assert.equal(results.length,8);for(const r of results)assert.equal(r.before,r.restored);fs.mkdirSync('.artifacts/css-pointer',{recursive:true});fs.writeFileSync('.artifacts/css-pointer/results.json',JSON.stringify(results,null,2));console.log(results);
