import { createRequire } from 'node:module';
import assert from 'node:assert/strict';
const { chromium, webkit } = createRequire(import.meta.url)('playwright');
const sizes = [[320,568],[390,844],[600,800],[600,320],[601,800],[680,800],[681,800],[800,600],[1000,800]];
const modes = ['normal', 'all-star'];
const old = {
  'grid-template-rows': '36px 14px 49px 15px minmax(0, 1fr) 18px',
  gap: '7px',
  padding: '10px 7px',
};
const results = [];
const expectReintroduced = process.env.EXPECT_LEGACY_680_REINTRODUCED !== '0';

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
        const comparison = await page.evaluate(old => {
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
          const targetEntries = entries.filter(({ rule, ancestors }) =>
            rule.selectorText === '.team-panel' && rule.style.getPropertyValue('border-radius') === '13px'
            && ancestors.some(ancestor => ancestor.type === 4
              && ancestor.conditionText.replace(/\s/g, '') === '(max-width:680px)'));
          if (targetEntries.length !== 1) throw new Error(`Expected one max-width:680px rule, found ${targetEntries.length}`);
          const target = targetEntries[0].rule;
          const original = Object.fromEntries(Object.keys(old).map(property => [
            property,
            { value: target.style.getPropertyValue(property), priority: target.style.getPropertyPriority(property) },
          ]));
          const injected = Object.values(original).some(entry => !entry.value);
          const normalize = value => value.replace(/\s/g, '').replace(/0px/g, '0');
          for (const [property, entry] of Object.entries(original)) {
            if (entry.value && normalize(entry.value) !== normalize(old[property]))
              throw new Error(`Unexpected historical ${property}: ${entry.value}`);
            if (!entry.value) target.style.setProperty(property, old[property]);
          }
          const teamPanels = [...document.querySelectorAll('.team-panel')];
          const snapshot = () => ({
            geometry: [...document.querySelectorAll('.app, .app *')].map(element => {
              const rect = element.getBoundingClientRect();
              return [rect.x, rect.y, rect.width, rect.height];
            }),
            layout: teamPanels.map(panel => {
              const style = getComputedStyle(panel);
              return [style.gridTemplateRows, style.gap, style.padding, style.borderRadius];
            }),
          });
          const before = snapshot();
          for (const property of Object.keys(old)) target.style.removeProperty(property);
          const removed = snapshot();
          for (const [property, entry] of Object.entries(original)) {
            if (entry.value) target.style.setProperty(property, entry.value, entry.priority);
            else target.style.removeProperty(property);
          }
          const restored = snapshot();
          return {
            unchanged: JSON.stringify(before) === JSON.stringify(removed),
            restored: JSON.stringify(before) === JSON.stringify(restored),
            active: matchMedia('(max-width: 680px)').matches,
            injected,
          };
        }, old);
        assert(comparison.unchanged, `${engine.name()} ${width}px ${mode} selected=${selected}: old narrow layout affected rendering`);
        assert(comparison.restored, `${engine.name()} ${width}px ${mode}: restoration mismatch`);
        assert.equal(comparison.active, width <= 680);
        results.push({ engine: engine.name(), width, height, mode, selected, ...comparison });
      }
      await page.close();
    }
  } finally { await browser.close(); }
}
assert.equal(results.length, 72);
assert.equal(results.filter(result => result.active).length, 48);
assert(results.every(result => result.injected === expectReintroduced),
  expectReintroduced ? 'Reintroduce the removed legacy declarations before testing' : 'The baseline declarations unexpectedly required reinsertion');
console.log('PASS 48 active and 24 boundary team-panel row/gap/padding comparisons across both draft modes; removal/restoration matched');
