import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
const {chromium,webkit}=createRequire(import.meta.url)('playwright');
for(const engine of [chromium,webkit]) {
 const browser=await engine.launch();
 const page=await browser.newPage({viewport:{width:700,height:398}});
 await page.goto(process.env.AUDIT_URL||'http://127.0.0.1:5174/pokemon-unite-draft/');
 assert.equal(await page.getByText('オールスタードラフト',{exact:true}).count(),0);
 await page.screenshot({path:`.artifacts/home-compact-${engine.name()}.png`});
 await page.locator('.setup-start').click();
 await page.locator('.first-prompt-options button').first().click();
 assert.equal(await page.locator('.sort-trigger').innerText(),'');
 assert.equal(await page.locator('.decision-extra button').count(),0);
 assert(await page.locator('.pokemon-grid > button').first().evaluate(e=>e.classList.contains('skip-card')));
 const labels=[];
 while(true) {
  labels.push(...await page.locator('.pokemon-card:not(.skip-card)').evaluateAll(es=>es.map(e=>e.getAttribute('aria-label'))));
  const next=page.getByRole('button',{name:'次のページ',exact:true});
  if(await next.isDisabled())break;
  await next.click();
 }
 assert.equal(labels.length,102); assert.equal(new Set(labels).size,102);
 while(!await page.getByRole('button',{name:'前のページ',exact:true}).isDisabled())await page.getByRole('button',{name:'前のページ',exact:true}).click();
 const count=()=>page.evaluate(()=>JSON.parse(localStorage.getItem('unite-draft.v1')).draft.actions.length);
 await page.locator('.skip-card').click();
 assert.equal(await count(),0,'skip selection must not commit');
 await page.keyboard.press('Escape');
 assert.equal(await page.locator('.is-selected.skip-card').count(),0);
 await page.locator('.skip-card').focus();
 await page.keyboard.press('Enter');
 assert.equal(await count(),1,'keyboard confirm must commit once');
 await page.getByRole('button',{name:'1つ戻す',exact:true}).click();
 assert.equal(await count(),0,'skip can be undone');
 for(let i=0;i<6;i++) { await page.locator('.skip-card').click(); await page.getByRole('button',{name:'使用禁止のスキップを決定',exact:true}).click(); }
 assert.equal(await page.locator('.skip-card').count(),0);
 console.log(engine.name(),'102 cards, first skip, six bans to picks PASS');
 await browser.close();
}


