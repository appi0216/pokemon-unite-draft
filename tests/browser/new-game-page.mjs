import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
const {chromium,webkit}=createRequire(import.meta.url)('playwright');
for(const [name,engine] of Object.entries({chromium,webkit})) {
 const browser=await engine.launch();
 const page=await browser.newPage({viewport:{width:390,height:844}});
 await page.goto(process.env.AUDIT_URL || 'http://127.0.0.1:5174/pokemon-unite-draft/');
 const first=async()=>page.locator('.first-prompt-options button').first().click();
 const last=async()=>{
   const next=page.getByRole('button',{name:'次のページ',exact:true});
   while(!await next.isDisabled())await next.click();
   assert.notEqual((await page.locator('.roster-pagination b').innerText()).split('/')[0].trim(),'1');
 };
 const check=async()=>assert.equal((await page.locator('.roster-pagination b').innerText()).split('/')[0].trim(),'1');
 await page.locator('.setup-start').click(); await first();
 for(let i=0;i<16;i++){
   await page.locator('.pokemon-card:not(:disabled)').first().click();
   await page.locator('.decision-bar .confirm-button').click();
 }
 await last();
 await page.locator('.completion-next').click(); await first(); await check();
 await last();
 await page.getByRole('button',{name:'ホームに戻る',exact:true}).click();
 await page.locator('.setup-start').click();
 await page.locator('dialog[open]').getByRole('button',{name:'新しく開始',exact:true}).click();
 await first(); await check();
 console.log(`${name}: next/new games reset the last page to page 1`);
 await browser.close();
}
