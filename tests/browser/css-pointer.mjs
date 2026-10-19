import {createRequire} from 'node:module';
import fs from 'node:fs';import assert from 'node:assert/strict';
const {chromium,webkit}=createRequire(import.meta.url)('playwright');const results=[];
for(const engine of [chromium,webkit]){const browser=await engine.launch();try{
 for(const hasTouch of [false,true]){const page=await browser.newPage({viewport:{width:667,height:375},hasTouch});await page.goto(process.env.AUDIT_URL||'https://appi0216.github.io/pokemon-unite-draft/');await page.locator('.setup-start').waitFor();
 for(const state of ['home','draft']){if(state==='draft'){await page.locator('.setup-start').click();await page.locator('.first-prompt-options button').first().click();}
 results.push(...await page.evaluate(()=>{const found=[];function visit(list,condition=''){for(const r of list){if(r.selectorText==='.app'&&r.style?.getPropertyValue('--control-size')&&condition.includes('pointer:')&&matchMedia(condition).matches)found.push(r);if(r.styleSheet)visit(r.styleSheet.cssRules,condition);if(r.cssRules)visit(r.cssRules,r.conditionText||condition);}}for(const sheet of document.styleSheets)visit(sheet.cssRules);
 return found.map(rule=>{const el=document.querySelector('.app'),measure=()=>({token:getComputedStyle(el).getPropertyValue('--control-size').trim(),headers:[...document.querySelectorAll('.app-header .icon-button')].map(e=>{const r=e.getBoundingClientRect();return {width:r.width,height:r.height};})}),css=rule.style.cssText,before=measure();let removed;try{rule.style.cssText='';removed=measure();}finally{rule.style.cssText=css;}return {before,removed,restored:measure(),status:JSON.stringify(before)===JSON.stringify(removed)?'NO_OBSERVED_EFFECT_RETAIN':'OBSERVED_DIFFERENCE_RETAIN'};});}).then(rows=>rows.map(r=>({engine:engine.name(),hasTouch,state,...r}))));
 }await page.close();}
 }finally{await browser.close();}}
const fineHome=results.filter(r=>!r.hasTouch&&r.state==='home');assert.equal(fineHome.length,2);for(const r of fineHome){assert(r.before.headers.length>0);assert(r.before.headers.every(e=>e.width===36&&e.height===36));assert(r.removed.headers.every(e=>e.width===44&&e.height===44));}
assert.equal(results.length,8);for(const r of results)assert.deepEqual(r.before,r.restored);fs.mkdirSync('.artifacts/css-pointer',{recursive:true});fs.writeFileSync('.artifacts/css-pointer/results.json',JSON.stringify(results,null,2));console.log(results);
