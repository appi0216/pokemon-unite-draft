import { createRequire } from 'node:module';
import assert from 'node:assert/strict';
const { chromium, webkit } = createRequire(import.meta.url)('playwright');
const sizes = [[320,568],[360,800],[370,800],[371,800],[390,844],[600,800],[600,320],[601,800],[800,600],[1000,800]];
const modes = ['normal', 'all-star'];
const results = [];
const expectReintroduced = process.env.EXPECT_TINY_FILTERS_REINTRODUCED !== '0';

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
      await page.locator('.filter-toggle').click();
      await page.locator('.role-tabs button').first().waitFor({ state: 'attached' });
      await page.locator('.hide-used').first().waitFor({ state: 'attached' });
      for (const selected of [false, true]) {
        if (selected) {
          await page.locator('.modal-primary').click();
          await page.locator('.pokemon-grid .pokemon-card:not(:disabled)').first().click();
          await page.locator('.filter-toggle').click();
          await page.locator('.role-tabs button').first().waitFor({ state: 'attached' });
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
          const isMax370 = rule => rule.type === 4
            && rule.conditionText.replace(/\s/g, '') === '(max-width:370px)';
          const isLegacyNarrow = ancestors => ancestors.some(isMax370)
            && ancestors.some(ancestor => ancestor.name === 'legacy');
          const roleOriginal = entries.filter(({ rule, ancestors }) => rule.selectorText === '.role-tabs button'
            && isLegacyNarrow(ancestors) && rule.style.getPropertyValue('font-size') === '8px');
          const hideOriginal = entries.filter(({ rule, ancestors }) => rule.selectorText === '.hide-used'
            && isLegacyNarrow(ancestors) && rule.style.getPropertyValue('font-size') === '8px');
          if (roleOriginal.length > 1 || hideOriginal.length > 1) throw new Error('Duplicate legacy filter declarations found');
          let roleRule = roleOriginal[0]?.rule;
          let hideRule = hideOriginal[0]?.rule;
          const createdRules = [];
          if (!roleRule || !hideRule) {
            const anchors = entries.filter(({ rule, ancestors }) => rule.selectorText === '.app .setup-main'
              && isLegacyNarrow(ancestors));
            if (anchors.length !== 1) throw new Error(`Expected one legacy narrow setup anchor, found ${anchors.length}`);
            const media = [...anchors[0].ancestors].reverse().find(isMax370);
            const index = [...media.cssRules].findIndex(rule => rule.selectorText === '.app .setup-main');
            if (!roleRule) {
              media.insertRule('.role-tabs button { font-size: 8px; padding: 5px 2px; }', index);
              roleRule = media.cssRules[index];
              createdRules.push(roleRule);
            }
            if (!hideRule) {
              const hideIndex = [...media.cssRules].findIndex(rule => rule.selectorText === '.app .setup-main');
              media.insertRule('.hide-used { font-size: 8px; }', hideIndex);
              hideRule = media.cssRules[hideIndex];
              createdRules.push(hideRule);
            }
          }
          const original = [
            { rule: roleRule, property: 'font-size' },
            { rule: roleRule, property: 'padding' },
            { rule: hideRule, property: 'font-size' },
          ].map(entry => ({ ...entry, value: entry.rule.style.getPropertyValue(entry.property), priority: entry.rule.style.getPropertyPriority(entry.property) }));
          const injected = createdRules.length > 0;
          if (!original[0].value) roleRule.style.setProperty('font-size', '8px');
          if (!original[1].value) roleRule.style.setProperty('padding', '5px 2px');
          if (!original[2].value) hideRule.style.setProperty('font-size', '8px');
          const roleButtons = [...document.querySelectorAll('.role-tabs button')];
          const hideUsed = document.querySelector('.hide-used');
          const snapshot = () => ({
            geometry: [...document.querySelectorAll('.app, .app *')].map(element => {
              const rect = element.getBoundingClientRect();
              return [rect.x, rect.y, rect.width, rect.height];
            }),
            roles: roleButtons.map(button => {
              const style = getComputedStyle(button);
              const rect = button.getBoundingClientRect();
              return [style.fontSize, style.padding, rect.x, rect.y, rect.width, rect.height];
            }),
            hideUsed: (() => {
              const style = getComputedStyle(hideUsed);
              const rect = hideUsed.getBoundingClientRect();
              return [style.fontSize, rect.x, rect.y, rect.width, rect.height];
            })(),
          });
          const before = snapshot();
          for (const entry of original) entry.rule.style.removeProperty(entry.property);
          const removed = snapshot();
          for (const entry of original) {
            if (entry.value) entry.rule.style.setProperty(entry.property, entry.value, entry.priority);
            else entry.rule.style.setProperty(entry.property,
              entry.rule === roleRule && entry.property === 'padding' ? '5px 2px' : '8px');
          }
          const restored = snapshot();
          for (const rule of [...createdRules].reverse()) rule.parentRule.deleteRule([...rule.parentRule.cssRules].indexOf(rule));
          return {
            unchanged: JSON.stringify(before) === JSON.stringify(removed),
            restored: JSON.stringify(before) === JSON.stringify(restored),
            active: matchMedia('(max-width: 370px)').matches,
            injected,
          };
        });
        assert(comparison.unchanged, `${engine.name()} ${width}px ${mode} selected=${selected}: old filter sizing affected rendering`);
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
  expectReintroduced ? 'Reintroduce the removed legacy declarations before testing' : 'The baseline declarations unexpectedly required reinsertion');
console.log('PASS 24 active and 56 boundary filter-control sizing comparisons; removal/restoration matched');
