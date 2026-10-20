import { createRequire } from 'node:module';
import assert from 'node:assert/strict';
const { chromium, webkit } = createRequire(import.meta.url)('playwright');
const sizes = [[320,568],[360,800],[370,800],[371,800],[390,844],[600,800],[600,320],[601,800],[800,600],[1000,800]];
const modes = ['normal', 'all-star'];
const results = [];
const expectReintroduced = process.env.EXPECT_LEGACY_370_REINTRODUCED !== '0';

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
          const isMax370 = rule => rule.type === 4
            && rule.conditionText.replace(/\s/g, '') === '(max-width:370px)';
          const originalTargets = entries.filter(({ rule, ancestors }) =>
            rule.selectorText === '.team-panel' && ancestors.some(isMax370)
            && rule.style.getPropertyValue('padding') === '8px 5px');
          if (originalTargets.length > 1) throw new Error(`Expected at most one legacy narrow padding rule, found ${originalTargets.length}`);
          let target = originalTargets[0]?.rule;
          let createdRule = false;
          if (!target) {
            const anchors = entries.filter(({ rule, ancestors }) => rule.selectorText === '.team-heading h2'
              && ancestors.some(isMax370) && ancestors.some(ancestor => ancestor.name === 'legacy'));
            if (!anchors.length) throw new Error('Could not locate the original legacy max-width:370px insertion point');
            const media = [...anchors[0].ancestors].reverse().find(isMax370);
            const index = [...media.cssRules].findIndex(rule => rule.selectorText === '.team-heading h2');
            media.insertRule('.team-panel {}', index);
            target = media.cssRules[index];
            createdRule = true;
          }
          const original = target.style.getPropertyValue('padding');
          const priority = target.style.getPropertyPriority('padding');
          if (original && original.replace(/\s/g, '') !== '8px5px')
            throw new Error(`Unexpected historical padding ${original}`);
          const injected = !original;
          if (injected) target.style.setProperty('padding', '8px 5px');
          const teamPanels = [...document.querySelectorAll('.team-panel')];
          const snapshot = () => ({
            geometry: [...document.querySelectorAll('.app, .app *')].map(element => {
              const rect = element.getBoundingClientRect();
              return [rect.x, rect.y, rect.width, rect.height];
            }),
            padding: teamPanels.map(panel => getComputedStyle(panel).padding),
          });
          const before = snapshot();
          target.style.removeProperty('padding');
          const removed = snapshot();
          if (original) target.style.setProperty('padding', original, priority);
          const restored = snapshot();
          if (createdRule) target.parentRule.deleteRule([...target.parentRule.cssRules].indexOf(target));
          return {
            unchanged: JSON.stringify(before) === JSON.stringify(removed),
            restored: JSON.stringify(before) === JSON.stringify(restored),
            active: matchMedia('(max-width: 370px)').matches,
            injected,
          };
        });
        assert(comparison.unchanged, `${engine.name()} ${width}px ${mode} selected=${selected}: old narrow padding affected rendering`);
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
console.log('PASS 24 active and 56 boundary narrow-padding comparisons across both draft modes; removal/restoration matched');
