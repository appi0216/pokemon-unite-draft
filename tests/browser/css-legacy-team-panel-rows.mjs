import { createRequire } from 'node:module';
import assert from 'node:assert/strict';
const { chromium, webkit } = createRequire(import.meta.url)('playwright');
const sizes = [[320,568],[390,844],[600,800],[601,800],[800,600],[900,800],[901,800],[1000,800]];
const modes = ['normal', 'all-star'];
const results = [];
const expectReintroduced = process.env.EXPECT_LEGACY_ROWS_REINTRODUCED !== '0';

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
      const panels = page.locator('.team-panel');
      await panels.first().waitFor({ state: 'attached' });
      assert.equal(await panels.count(), 2, `${engine.name()} ${width}px ${mode}: expected two team panels`);
      for (const selected of [false, true]) {
        if (selected) await page.locator('.pokemon-grid .pokemon-card:not(:disabled)').first().click();
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
          const media = ancestors => {
            const values = ancestors.filter(rule => rule.type === 4)
              .map(rule => rule.conditionText.replace(/\s/g, ''));
            return values.length === 1 && values[0] === '(max-width:900px)';
          };
          const targets = entries.filter(({ rule, ancestors }) =>
            rule.selectorText === '.team-panel' && media(ancestors)
            && rule.style.getPropertyValue('padding') === '10px 7px');
          if (targets.length !== 1) throw new Error(`Expected one legacy narrow team-panel rule, found ${targets.length}`);
          const target = targets[0].rule;
          const original = target.style.getPropertyValue('grid-template-rows');
          const priority = target.style.getPropertyPriority('grid-template-rows');
          const oldRows = '41px 15px 51px 18px minmax(0, 1fr) 18px';
          const normalizeRows = value => value.replace(/\s/g, '').replace(/0px/g, '0');
          if (original && normalizeRows(original) !== normalizeRows(oldRows))
            throw new Error(`Unexpected historical rows ${original}`);
          const injected = !original;
          if (injected) target.style.setProperty('grid-template-rows', oldRows);
          const teamPanels = [...document.querySelectorAll('.team-panel')];
          if (teamPanels.length !== 2) throw new Error(`Expected two team panels, got ${teamPanels.length}`);
          const snapshot = () => ({
            geometry: [...document.querySelectorAll('.app, .app *')].map(element => {
              const rect = element.getBoundingClientRect();
              return [rect.x, rect.y, rect.width, rect.height];
            }),
            rows: teamPanels.map(panel => getComputedStyle(panel).gridTemplateRows),
          });
          const before = snapshot();
          target.style.removeProperty('grid-template-rows');
          const removed = snapshot();
          if (injected) target.style.setProperty('grid-template-rows', oldRows);
          else target.style.setProperty('grid-template-rows', original, priority);
          const restored = snapshot();
          if (injected) target.style.removeProperty('grid-template-rows');
          return {
            unchanged: JSON.stringify(before) === JSON.stringify(removed),
            restored: JSON.stringify(before) === JSON.stringify(restored),
            active: matchMedia('(max-width: 900px)').matches,
            injected,
          };
        });
        assert(comparison.unchanged, `${engine.name()} ${width}px ${mode} selected=${selected}: layered rows affected rendering`);
        assert(comparison.restored, `${engine.name()} ${width}px ${mode}: restoration mismatch`);
        assert.equal(comparison.active, width <= 900);
        results.push({ engine: engine.name(), width, height, mode, selected, ...comparison });
      }
      await page.close();
    }
  } finally { await browser.close(); }
}
assert.equal(results.length, 64);
assert.equal(results.filter(result => result.active).length, 48);
assert(results.every(result => result.injected === expectReintroduced),
  expectReintroduced ? 'Reintroduce the removed legacy declaration before testing' : 'The baseline declaration unexpectedly required reinsertion');
console.log('PASS 48 active team-panel row and 16 boundary comparisons across both draft modes; removal/restoration matched');
