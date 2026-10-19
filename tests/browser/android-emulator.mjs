import {createRequire} from 'node:module';
import {execFileSync} from 'node:child_process';
import fs from 'node:fs';
import assert from 'node:assert/strict';
const {chromium}=createRequire(import.meta.url)('playwright');
const adb=process.env.ADB_PATH||'C:/Users/arsen/Documents/Codex/android-tools/sdk/platform-tools/adb.exe';
const serial=process.env.ANDROID_SERIAL||'emulator-5554';
assert(serial.startsWith('emulator-'),'This test is restricted to a disposable emulator');
const run=(...args)=>execFileSync(adb,['-s',serial,...args],{encoding:'utf8',timeout:30000}).trim();
const out='.artifacts/android-emulator';fs.mkdirSync(out,{recursive:true});
let browser=await chromium.connectOverCDP('http://127.0.0.1:9223');
let page=browser.contexts()[0].pages().find(p=>p.url().includes('pokemon-unite-draft'));
const results=[];
const connections=[browser];
const original={font:run('shell','settings','get','system','font_scale'),rotate:run('shell','settings','get','system','accelerometer_rotation'),rotation:run('shell','settings','get','system','user_rotation')};
try {
 await page.bringToFront();await page.locator('.setup-start,.pokemon-grid').first().waitFor();
 for(const rotation of ['0','1'])for(const font of ['1.0','2.0']) {
  run('shell','settings','put','system','accelerometer_rotation','0');
  run('shell','settings','put','system','user_rotation',rotation);
  run('shell','settings','put','system','font_scale',font);
  await new Promise(r=>setTimeout(r,1500));
  browser=await chromium.connectOverCDP('http://127.0.0.1:9223');
  connections.push(browser);
  page=browser.contexts()[0].pages().find(p=>p.url().includes('pokemon-unite-draft'));
  await page.bringToFront();await page.locator('.setup-start,.pokemon-grid').first().waitFor();
  const m=await page.evaluate(()=>({width:innerWidth,height:innerHeight,scroll:document.documentElement.scrollWidth,dpr:devicePixelRatio}));
  assert(m.scroll<=m.width,'horizontal overflow');
  assert(rotation==='0'?m.height>m.width:m.width>m.height,'OS orientation did not propagate');
  if(await page.locator('.setup-start').isVisible())await page.locator('.setup-start').scrollIntoViewIfNeeded();
  await page.screenshot({path:`${out}/rotation-${rotation}-font-${font}.png`});
  results.push({rotation,font,metrics:m,status:'PASS',scope:'OS setting accepted, current screen no horizontal overflow; not proof all web text doubles'});
 }
 if(await page.locator('.setup-start').isVisible()) {
  await page.locator('.setup-start').click();await page.locator('.first-prompt-options button').first().click();
 }
 const saved=await page.evaluate(()=>localStorage.getItem('unite-draft.v1'));
 await page.getByRole('button',{name:'使い方・ルール',exact:true}).click();
 await page.getByText('オフラインで利用できます',{exact:true}).waitFor({timeout:60000});
 run('shell','svc','wifi','disable');run('shell','svc','data','disable');
 await page.waitForFunction(()=>!navigator.onLine);
 await page.reload();await page.locator('.pokemon-grid').waitFor();
 assert.equal(await page.evaluate(()=>localStorage.getItem('unite-draft.v1')),saved);
 await page.screenshot({path:`${out}/offline-draft.png`});
 results.push({scope:'OS wifi/data disabled: reload and draft persistence',status:'PASS'});
 run('shell','svc','wifi','enable');run('shell','svc','data','enable');
 await page.waitForFunction(()=>navigator.onLine);
 results.push({scope:'OS network restoration',status:'PASS'});
}catch(error){results.push({status:'FAIL',error:String(error)});process.exitCode=1;}
finally {
 run('shell','svc','wifi','enable');run('shell','svc','data','enable');
 for(const [key,val] of [['font_scale',original.font],['accelerometer_rotation',original.rotate],['user_rotation',original.rotation]])run('shell','settings','put','system',key,val);
 fs.writeFileSync(`${out}/results.json`,JSON.stringify({android:run('shell','getprop','ro.build.version.release'),physicalDevice:false,results},null,2));
 await Promise.allSettled(connections.map(connection=>connection.close()));
}
console.log(results);
