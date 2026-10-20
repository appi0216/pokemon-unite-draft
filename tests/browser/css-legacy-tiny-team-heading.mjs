import { createRequire } from 'node:module';
import assert from 'node:assert/strict';
const { chromium, webkit } = createRequire(import.meta.url)('playwright');
const sizes = [[320,568],[360,800],[370,800],[371,800],[390,844],[600,800],[600,320],[601,800],[800,600],[1000,800]];
const modes = ['normal', 'all-star'];
const results = [];
const expectReintroduced = process.env.EXPECT_TINY_TEAM_HEADING_REINTRODUCED !== '0';
for (const engine of [chromium, webkit]) {
  const browser = await engine.launch();
  try {
    for (const [width, height] of sizes) for (const mode of modes) {
      const page = await browser.newPage({ viewport: { width, height }, reducedMotion: 'reduce' });
      await page.goto(process.env.AUDIT_URL || 'http://127.0.0.1:4181/pokemon-unite-draft/');
      await page.locator('.setup-start').waitFor();
      if (mode === 'all-star') await page.getByRole('button', { name: /^オールスター/ }).click();
      await page.locator('.setup-start').click();
      await page.locator('.first-prompt-options button').first().click();
      await page.locator('.team-heading h2').first().waitFor({ state: 'attached' });
      for (const selected of [false, true]) {
        if (selected) {
          await page.locator('.filter-toggle').click();
          await page.locator('.modal-primary').click();
          await page.locator('.pokemon-grid .pokemon-card:not(:disabled)').first().click();
        }
        const comparison = await page.evaluate(() => {
          function visit(rules, ancestors = [], found = []) {
            for (const rule of rules) {
              if (rule.selectorText) found.push({ rule, ancestors });
              if (rule.cssRules) visit(rule.cssRules, [...ancestors, rule], found);
            }
            return found;
          }
          const entries = [...document.styleSheets].flatMap(sheet => {
            try { return visit(sheet.cssRules); } catch { return []; }
          });
          const isMax370 = rule => rule.type === 4 && rule.conditionText.replace(/\s/g, '') === '(max-width:370px)';
          const isLegacyNarrow = ancestors => ancestors.some(isMax370) && ancestors.some(ancestor => ancestor.name === 'legacy');
          const originals = entries.filter(({ rule, ancestors }) => rule.selectorText === '.team-heading h2'
            && isLegacyNarrow(ancestors) && rule.style.getPropertyValue('font-size') === '10px');
          if (originals.length > 1) throw new Error('Duplicate legacy tiny heading declarations found');
          let oldRule = originals[0]?.rule;
          let createdRule;
          if (!oldRule) {
            const anchors = entries.filter(({ rule, ancestors }) => rule.selectorText === '.app .setup-main' && isLegacyNarrow(ancestors));
            if (anchors.length !== 1) throw new Error(`Expected one legacy tiny setup anchor, found ${anchors.length}`);
            const media = [...anchors[0].ancestors].reverse().find(isMax370);
            const index = [...media.cssRules].findIndex(rule => rule.selectorText === '.app .setup-main');
            media.insertRule('.team-heading h2 { font-size: 10px; }', index);
            oldRule = media.cssRules[index];
            createdRule = oldRule;
          }
          const headings = [...document.querySelectorAll('.team-heading h2')];
          if (headings.length !== 2) throw new Error(`Expected two team headings, found ${headings.length}`);
          const snapshot = () => ({
            app: [...document.querySelectorAll('.app, .app *')].map(element => {
              const rect = element.getBoundingClientRect();
              return [rect.x, rect.y, rect.width, rect.height];
            }),
            headings: headings.map(element => {
              const style = getComputedStyle(element);
              const rect = element.getBoundingClientRect();
              return [style.fontSize, style.lineHeight, rect.x, rect.y, rect.width, rect.height];
            }),
          });
          const before = snapshot();
          oldRule.style.removeProperty('font-size');
          const removed = snapshot();
          oldRule.style.setProperty('font-size', '10px');
          const restored = snapshot();
          if (createdRule) createdRule.parentRule.deleteRule([...createdRule.parentRule.cssRules].indexOf(createdRule));
          return { unchanged: JSON.stringify(before) === JSON.stringify(removed), restored: JSON.stringify(before) === JSON.stringify(restored), active: matchMedia('(max-width:370px)').matches, injected: Boolean(createdRule) };
        });
        assert(comparison.unchanged, `${engine.name()} ${width}px ${mode} selected=${selected}: legacy heading font affected rendering`);
        assert(comparison.restored, `${engine.name()} ${width}px ${mode}: restoration mismatch`);
        assert.equal(comparison.active, width <= 370);
        results.push({ engine: engine.name(), width, height, mode, selected, ...comparison });
      }
      await page.close();
    }
  } finally { await browser.close(); }
}
assert.equal(results.length, 80);
assert.equal(results.filter(result => result.active).length, 24);
assert(results.every(result => result.injected === expectReintroduced),
  expectReintroduced ? 'Reintroduce the removed legacy declaration before testing' : 'The baseline declaration unexpectedly required reinsertion');
console.log('PASS 24 active and 56 boundary team-heading comparisons; removal/restoration matched');
