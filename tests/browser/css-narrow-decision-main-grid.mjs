import { createRequire } from 'node:module';
import assert from 'node:assert/strict';
const { chromium, webkit } = createRequire(import.meta.url)('playwright');
const sizes = [[320,568],[390,844],[600,800],[600,320],[601,800],[800,600],[1000,800]];
const results = [];

for (const engine of [chromium, webkit]) {
  const browser = await engine.launch();
  try {
    for (const [width, height] of sizes) {
      const page = await browser.newPage({ viewport: { width, height }, reducedMotion: 'reduce' });
      await page.goto(process.env.AUDIT_URL || 'http://127.0.0.1:4180/pokemon-unite-draft/');
      await page.locator('.setup-start').waitFor();
      await page.locator('.setup-start').click();
      await page.locator('.first-prompt-options button').first().click();
      for (const selected of [false, true]) {
        if (selected) await page.locator('.pokemon-grid .pokemon-card:not(:disabled)').first().click();
        const comparison = await page.evaluate(() => {
          function visit(rules, ancestors = [], container = null, found = []) {
            for (let index = 0; index < rules.length; index++) {
              const rule = rules[index];
              if (rule.selectorText) found.push({ rule, parent: rules, container, index, ancestors });
              if (rule.cssRules) visit(rule.cssRules, [...ancestors, rule], rule, found);
            }
            return found;
          }
          const entries = [...document.styleSheets].flatMap(sheet => {
            try { return visit(sheet.cssRules); } catch { return []; }
          });
          const narrowMatches = entry => {
            const media = entry.ancestors.filter(rule => rule.type === 4).map(rule =>
              rule.conditionText.replace(/\s/g, ''));
            return media.length === 1 && media[0] === '(max-width:600px)';
          };
          const candidates = entries.filter(({ rule, ancestors }) =>
            rule.selectorText === '.decision-main' && narrowMatches({ ancestors })
            && rule.style.getPropertyValue('grid-column') === '2'
            && rule.style.getPropertyValue('grid-row') === '1 / 3'
            && !rule.style.getPropertyValue('grid-area'));
          let target;
          let injected = false;
          if (candidates.length === 1) {
            target = candidates[0].rule;
          } else {
            if (candidates.length !== 0) throw new Error(`Expected at most one historical rule, found ${candidates.length}`);
            const anchors = entries.filter(({ rule, ancestors }) =>
              rule.selectorText === '.decision-extra' && narrowMatches({ ancestors })
              && rule.style.getPropertyValue('grid-column') === '1'
              && rule.style.getPropertyValue('grid-row') === '2');
            if (anchors.length !== 1) throw new Error(`Expected one historical insertion anchor, found ${anchors.length}`);
            const anchor = anchors[0];
            anchor.container.insertRule('.decision-main { grid-column: 2; grid-row: 1 / 3; }', anchor.index);
            target = anchor.parent[anchor.index];
            injected = true;
          }
          const decision = document.querySelector('.decision-main');
          if (!decision) throw new Error('Draft decision area was not rendered');
          const snapshot = () => ({
            geometry: [...document.querySelectorAll('.app, .app *')].map(element => {
              const rect = element.getBoundingClientRect();
              return [rect.x, rect.y, rect.width, rect.height];
            }),
            decision: ['gridColumn', 'gridRow', 'gridArea'].map(name => getComputedStyle(decision)[name]),
          });
          const before = snapshot();
          const column = target.style.getPropertyValue('grid-column');
          const columnPriority = target.style.getPropertyPriority('grid-column');
          const row = target.style.getPropertyValue('grid-row');
          const rowPriority = target.style.getPropertyPriority('grid-row');
          target.style.removeProperty('grid-column');
          target.style.removeProperty('grid-row');
          const removed = snapshot();
          target.style.setProperty('grid-column', column, columnPriority);
          target.style.setProperty('grid-row', row, rowPriority);
          const restored = snapshot();
          return {
            unchanged: JSON.stringify(before) === JSON.stringify(removed),
            restored: JSON.stringify(before) === JSON.stringify(restored),
            active: matchMedia('(max-width: 600px)').matches,
            injected,
          };
        });
        assert(comparison.unchanged, `${engine.name()} ${width}x${height} selected=${selected}: historical grid placement changed rendering`);
        assert(comparison.restored, `${engine.name()} ${width}x${height} selected=${selected}: restoration mismatch`);
        assert.equal(comparison.active, width <= 600, `${engine.name()} ${width}px: unexpected narrow media state`);
        assert(comparison.injected, `${engine.name()} ${width}px: historical source declaration was not reintroduced at its original cascade position`);
        results.push({ engine: engine.name(), width, height, selected, ...comparison });
      }
      await page.close();
    }
  } finally { await browser.close(); }
}

assert.equal(results.length, 28);
const active = results.filter(result => result.active);
assert.equal(active.length, 16);
console.log(`PASS ${active.length} active narrow-breakpoint and ${results.length - active.length} boundary grid-placement comparisons`);
