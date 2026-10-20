import { createRequire } from 'node:module';
import fs from 'node:fs';
import assert from 'node:assert/strict';
const { chromium, webkit } = createRequire(import.meta.url)('playwright');
const results = [];
for (const engine of [chromium, webkit]) {
  const browser = await engine.launch();
  try {
    for (const [width, height] of [[320,568],[390,844],[667,375],[800,600],[1001,700],[1600,900]]) {
      const page = await browser.newPage({ viewport: { width, height }, hasTouch: true, reducedMotion: 'reduce' });
      await page.goto(process.env.AUDIT_URL || 'http://127.0.0.1:4180/pokemon-unite-draft/');
      await page.locator('.setup-start').waitFor();
      for (const state of ['home','draft']) {
        if (state === 'draft') {
          await page.locator('.setup-start').click();
          await page.locator('.first-prompt-options button').first().click();
        }
        const result = await page.evaluate(() => {
          const found = [];
          function visit(rules, condition = '') {
            for (const rule of rules) {
              if (rule.selectorText === '.app' && rule.style?.getPropertyValue('--control-size').includes('max(44px, clamp(') && condition.includes('pointer: coarse')) found.push(rule);
              if (rule.styleSheet) visit(rule.styleSheet.cssRules, condition);
              if (rule.cssRules) visit(rule.cssRules, rule.conditionText || condition);
            }
          }
          for (const sheet of document.styleSheets) visit(sheet.cssRules);
          if (found.length !== 1 || !matchMedia('(pointer: coarse)').matches) throw new Error('Expected one active coarse candidate');
          const properties = ['width','height','min-width','min-height','padding-top','padding-right','padding-bottom','padding-left','gap','font-size','border-radius'];
          const nodes = [...document.querySelectorAll('.app, .app *')];
          const measure = () => nodes.map(node => properties.map(p => getComputedStyle(node).getPropertyValue(p)));
          const rule = found[0], original = rule.style.cssText, before = measure();
          let removed;
          try { rule.style.cssText = ''; removed = measure(); } finally { rule.style.cssText = original; }
          return { nodes: nodes.length, equal: JSON.stringify(before) === JSON.stringify(removed), restored: JSON.stringify(before) === JSON.stringify(measure()) };
        });
        assert(result.nodes > 0); assert(result.equal); assert(result.restored);
        results.push({ engine: engine.name(), width, height, state, ...result });
      }
      await page.close();
    }
  } finally { await browser.close(); }
}
assert.equal(results.length, 24);
fs.mkdirSync('.artifacts/css-coarse-equivalence', {recursive:true});
fs.writeFileSync('.artifacts/css-coarse-equivalence/results.json', JSON.stringify({ scope:'Finite computed geometry comparison; not universal unusedness proof', results },null,2));
console.log(`PASS ${results.length} coarse-pointer comparisons`);
