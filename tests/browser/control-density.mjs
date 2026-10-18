import { createRequire } from 'node:module';
import assert from 'node:assert/strict';
const { chromium, webkit } = createRequire(import.meta.url)('playwright');
for (const [engine, launcher] of Object.entries({ chromium, webkit })) {
  const browser = await launcher.launch();
  const page = await browser.newPage({ hasTouch: true });
  await page.goto(process.env.AUDIT_URL || 'http://127.0.0.1:5174/pokemon-unite-draft/');
  await page.locator('.setup-start').click();
  await page.locator('.first-prompt-options button').first().click();
  const samples = [];
  for (const [width, height] of [[320,568],[503,727],[667,375],[1523,800]]) {
    await page.setViewportSize({width,height});
    await page.waitForTimeout(250);
    const metrics = await page.evaluate(() => {
      return ['.search-field','.filter-toggle','.sort-trigger','.roster-pagination button','.confirm-button'].map(selector => {
        const element = document.querySelector(selector);
        const box = element.getBoundingClientRect();
        const face = getComputedStyle(element,'::before');
        const svg = element.querySelector('svg');
        const label = element.querySelector('span');
        const labelBox = label?.getBoundingClientRect();
        const labelFits = !labelBox?.width || (labelBox.left >= box.left && labelBox.right <= box.right && labelBox.top >= box.top && labelBox.bottom <= box.bottom);
        return {selector, labelFits, target:box.height, face:parseFloat(face.height) + parseFloat(face.borderTopWidth) + parseFloat(face.borderBottomWidth), icon:svg?.getBoundingClientRect().height};
      });
    });
    for (const item of metrics) {
      assert(item.labelFits, `${engine} ${width}: label outside control`);
      assert(item.target >= 43.9 && item.target <= 52, `${engine} ${width} ${item.selector}: target too small`);
      assert(item.face >= 28 && item.face <= item.target, `${engine} ${width}: invalid visible size ${JSON.stringify(item)}`);
    }
    samples.push({width,metrics});
  }
  for (let i=0;i<samples[0].metrics.length;i++) {
    assert(samples[0].metrics[i].face < samples[3].metrics[i].face - 8, `${engine}: mobile face failed to shrink`);
    assert(samples[2].metrics[i].face < samples[3].metrics[i].face - 6, `${engine}: short landscape face failed to shrink`);
    assert(samples[0].metrics[i].icon < samples[3].metrics[i].icon, `${engine}: icon failed to shrink`);
  }
  console.log(JSON.stringify({engine,samples}));
  await browser.close();
}
