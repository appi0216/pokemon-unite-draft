import { createRequire } from 'node:module';
import assert from 'node:assert/strict';
const { chromium, webkit } = createRequire(import.meta.url)('playwright');
const sizes = [[320,568],[390,844],[600,800],[601,800],[800,600],[900,800],[901,800],[1000,800]];
const modes = ['normal', 'all-star'];
const results = [];
const expectReintroduced = process.env.EXPECT_LEGACY_PADDING_REINTRODUCED !== '0';

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
          const isMax900 = rule => rule.type === 4
            && rule.conditionText.replace(/\s/g, '') === '(max-width:900px)';
          const originalTargets = entries.filter(({ rule, ancestors }) =>
            rule.selectorText === '.team-panel' && ancestors.some(isMax900)
            && rule.style.getPropertyValue('padding') === '10px 7px');
          if (originalTargets.length > 1) throw new Error(`Expected at most one legacy narrow rule, found ${originalTargets.length}`);
          const original = originalTargets[0]?.rule;
          let target = original;
          let inserted = false;
          if (!target) {
            const anchors = entries.filter(({ rule, ancestors }) =>
              rule.selectorText === '.team-emblem' && ancestors.some(isMax900)
              && ancestors.some(ancestor => ancestor.name === 'legacy'));
            if (!anchors.length) throw new Error('Could not locate the original legacy max-width:900px insertion point');
            const media = [...anchors[0].ancestors].reverse().find(isMax900);
            const index = [...media.cssRules].findIndex(rule => rule.selectorText === '.team-emblem');
            if (index < 0) throw new Error('Could not locate the original team-emblem sibling');
            media.insertRule('.team-panel { padding: 10px 7px; }', index);
            target = media.cssRules[index];
            inserted = true;
          }
          const existing = target.style.getPropertyValue('padding');
          const priority = target.style.getPropertyPriority('padding');
          if (existing && existing.replace(/\s/g, '') !== '10px7px')
            throw new Error(`Unexpected historical padding ${existing}`);
          const injected = !original;
          const teamPanels = [...document.querySelectorAll('.team-panel')];
          if (teamPanels.length !== 2) throw new Error(`Expected two team panels, got ${teamPanels.length}`);
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
          if (existing) target.style.setProperty('padding', existing, priority);
          const restored = snapshot();
          if (inserted) target.parentRule.deleteRule([...target.parentRule.cssRules].indexOf(target));
          return {
            unchanged: JSON.stringify(before) === JSON.stringify(removed),
            restored: JSON.stringify(before) === JSON.stringify(restored),
            active: matchMedia('(max-width: 900px)').matches,
            injected,
          };
        });
        assert(comparison.unchanged, `${engine.name()} ${width}px ${mode} selected=${selected}: legacy padding affected rendering`);
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
console.log('PASS 48 active team-panel padding and 16 boundary comparisons across both draft modes; removal/restoration matched');
