import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
const {chromium,webkit}=createRequire(import.meta.url)('playwright');
for(const engine of [chromium,webkit]) {
 const browser=await engine.launch();
 for(const [width,height] of [[320,568],[390,844],[667,375],[1440,900]]) {
  const page=await browser.newPage({viewport:{width,height}});
  await page.goto(process.env.AUDIT_URL||'http://127.0.0.1:5174/pokemon-unite-draft/');
  assert.equal(await page.locator('.setup-portrait:visible').count(),3);
  assert.equal(await page.getByText('使用禁止 3匹 · 選択 5匹',{exact:true}).count(),0);
  await page.screenshot({path:".artifacts/home-view-"+engine.name()+"-"+width+".png",fullPage:true});
  assert.equal(await page.getByText('使用禁止 3匹 / 選択 5匹',{exact:true}).count(),0);
  for(const font of ['16px','32px']) {
   await page.evaluate(f=>document.documentElement.style.fontSize=f,font);
   assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'home horizontal overflow');
   await page.locator('.setup-start').scrollIntoViewIfNeeded();
   assert(await page.locator('.setup-start').isVisible());
  }
  await page.getByRole('button',{name:'その他の設定：プリセット・大会制限',exact:true}).click();
  assert.equal(await page.getByText('バックアップ',{exact:false}).count(),0);
  await page.screenshot({path:`.artifacts/home-${engine.name()}-${width}.png`});
  await page.close();
  console.log(engine.name(),width,height,'home PASS');
 }
 await browser.close();
}


