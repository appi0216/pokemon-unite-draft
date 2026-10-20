import { createRequire } from 'node:module';
import assert from 'node:assert/strict';
const { chromium, webkit } = createRequire(import.meta.url)('playwright');
const sizes = [[320,568],[390,844],[600,800],[700,800],[701,800],[900,600],[1000,800]];
const results = [];
const expectReintroduced = process.env.EXPECT_NARROW_GAP_REINTRODUCED !== '0';

for (const engine of [chromium, webkit]) {
  const browser = await engine.launch();
  try {
    for (const [width, height] of sizes) {
      const page = await browser.newPage({ viewport: { width, height }, reducedMotion: 'reduce' });
      await page.goto(process.env.AUDIT_URL || 'http://127.0.0.1:4181/pokemon-unite-draft/');
      await page.locator('.setup-main.setup-refresh').waitFor();
      const comparison = await page.evaluate(() => {
        function visit(rules, ancestors = [], found = []) {
          for (let index = 0; index < rules.length; index++) {
            const rule = rules[index];
            if (rule.selectorText) found.push({ rule, ancestors });
            if (rule.cssRules) visit(rule.cssRules, [...ancestors, rule], found);
          }
          return found;
        }
        const entries = [...document.styleSheets].flatMap(sheet => {
          try { return visit(sheet.cssRules); } catch { return []; }
        });
        const exactNarrow = ancestors => {
          const media = ancestors.filter(rule => rule.type === 4)
            .map(rule => rule.conditionText.replace(/\s/g, ''));
          return media.length === 1 && media[0] === '(max-width:700px)';
        };
        const targets = entries.filter(({ rule, ancestors }) =>
          rule.selectorText === '.app .setup-main' && exactNarrow(ancestors)
          && rule.style.getPropertyValue('max-width') === '520px'
          && rule.style.getPropertyValue('padding') === '28px 18px');
        if (targets.length !== 1) throw new Error(`Expected one source setup rule, found ${targets.length}`);
        const target = targets[0].rule;
        const original = target.style.getPropertyValue('gap');
        const priority = target.style.getPropertyPriority('gap');
        if (original && original !== '28px') throw new Error(`Unexpected historical gap value ${original}`);
        const injected = !original;
        if (injected) target.style.setProperty('gap', '28px');
        const setup = document.querySelector('.app .setup-main');
        if (!setup) throw new Error('Setup screen layout was not rendered');
        const snapshot = () => ({
          geometry: [...document.querySelectorAll('.app, .app *')].map(element => {
            const rect = element.getBoundingClientRect();
            return [rect.x, rect.y, rect.width, rect.height];
          }),
          gap: getComputedStyle(setup).gap,
        });
        const before = snapshot();
        target.style.removeProperty('gap');
        const removed = snapshot();
        if (injected) target.style.setProperty('gap', '28px');
        else target.style.setProperty('gap', original, priority);
        const restored = snapshot();
        return {
          unchanged: JSON.stringify(before) === JSON.stringify(removed),
          restored: JSON.stringify(before) === JSON.stringify(restored),
          active: matchMedia('(max-width: 700px)').matches,
          injected,
          gap: before.gap,
        };
      });
      assert(comparison.unchanged, `${engine.name()} ${width}x${height}: removing legacy gap changed setup geometry`);
      assert(comparison.restored, `${engine.name()} ${width}x${height}: restoration mismatch`);
      assert.equal(comparison.active, width <= 700);
      results.push({ engine: engine.name(), width, height, ...comparison });
      await page.close();
    }
  } finally { await browser.close(); }
}
assert.equal(results.length, 14);
assert.equal(results.filter(result => result.active).length, 8);
assert(results.every(result => result.injected === expectReintroduced),
  expectReintroduced ? 'Reintroduce the removed legacy declaration before testing' : 'The baseline declaration unexpectedly required reinsertion');
console.log('PASS 8 active narrow setup-gap and 6 boundary comparisons; removal/restoration matched');
