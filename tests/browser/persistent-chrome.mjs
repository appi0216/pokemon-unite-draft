import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
const {chromium,webkit}=createRequire(import.meta.url)('playwright');
for(const engine of [chromium,webkit]) {
 const browser=await engine.launch();
 for(const [width,height] of [[320,568],[390,844],[667,375],[844,390],[1440,900]]) {
  const page=await browser.newPage({viewport:{width,height}});
  await page.goto(process.env.AUDIT_URL||'http://127.0.0.1:5174/pokemon-unite-draft/');
  const check=async()=>{
   for(const selector of ['.app-header','.app-footer']) {
    const box=await page.locator(selector).boundingBox();
    assert(box && box.height>0 && box.y>=-1 && box.y+box.height<=height+1,`${selector} outside ${width}x${height}: ${JSON.stringify(box)}`);
   }
  };
  await check();
  assert.equal(await page.locator('.setup-portrait').first().evaluate(e=>getComputedStyle(e).borderTopWidth),'0px');
  await page.locator('.setup-start').scrollIntoViewIfNeeded();
  await check();
  await page.locator('.setup-start').click();
  await page.locator('.first-prompt-options button').first().click();
  await check();
  const decision=await page.locator('.decision-bar').boundingBox();
  const footer=await page.locator('.app-footer').boundingBox();
  assert(decision.y+decision.height<=footer.y+1,'decision overlaps footer');
  await page.screenshot({path:`.artifacts/chrome-${engine.name()}-${width}.png`});
  await page.close();
  console.log(engine.name(),width,height,'chrome PASS');
 }
 await browser.close();
}
