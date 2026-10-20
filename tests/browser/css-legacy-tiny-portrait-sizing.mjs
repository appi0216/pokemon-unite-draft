import { createRequire } from 'node:module';
import assert from 'node:assert/strict';
const { chromium, webkit } = createRequire(import.meta.url)('playwright');
const sizes = [[320,568],[360,800],[370,800],[370,320],[371,800],[390,844],[600,800],[600,320],[601,800],[800,600]];
const modes = ['normal', 'all-star'];
const results = [];
const expectReintroduced = process.env.EXPECT_TINY_PORTRAIT_REINTRODUCED !== '0';

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
      await page.locator('.team-panel .player-portrait').first().waitFor({ state: 'attached' });
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
          const hasSelector = (rule, selector) => rule.selectorText.split(',').map(value => value.trim()).includes(selector);
          const originalFlex = entries.filter(({ rule, ancestors }) => hasSelector(rule, '.player-portrait')
            && ancestors.some(isMax370) && rule.style.getPropertyValue('flex-basis') === '34px');
          const originalImage = entries.filter(({ rule, ancestors }) => rule.selectorText === '.player-portrait > .portrait'
            && ancestors.some(isMax370) && rule.style.getPropertyValue('width') === '43px'
            && rule.style.getPropertyValue('height') === '43px');
          if (originalFlex.length > 1 || originalImage.length > 1) throw new Error('Duplicate historical portrait sizing rules found');
          const originals = [originalFlex[0]?.rule, originalImage[0]?.rule];
          const createdRules = [];
          if (originals.some(rule => !rule)) {
            const anchors = entries.filter(({ rule, ancestors }) => hasSelector(rule, '.player-name')
              && ancestors.some(isMax370) && ancestors.some(ancestor => ancestor.name === 'legacy'));
            if (anchors.length !== 1) throw new Error(`Expected one legacy tiny-screen insertion anchor, found ${anchors.length}`);
            const media = [...anchors[0].ancestors].reverse().find(isMax370);
            const index = [...media.cssRules].findIndex(rule => hasSelector(rule, '.player-name'));
            media.insertRule('.player-portrait, .player-portrait.has-pokemon { flex-basis: 34px; }', index);
            createdRules.push(media.cssRules[index]);
            media.insertRule('.player-portrait > .portrait { width: 43px; height: 43px; }', index + 1);
            createdRules.push(media.cssRules[index + 1]);
          }
          const targets = [originals[0] || createdRules[0], originals[1] || createdRules[1]];
          const old = [
            { property: 'flex-basis', value: '34px' },
            { property: 'width', value: '43px' },
            { property: 'height', value: '43px' },
          ];
          const saved = targets.flatMap((rule, index) => (index === 0 ? [old[0]] : old.slice(1))
            .map(({ property }) => ({ rule, property, value: rule.style.getPropertyValue(property), priority: rule.style.getPropertyPriority(property) })));
          const injected = createdRules.length > 0;
          for (const entry of saved) if (!entry.value) entry.rule.style.setProperty(entry.property, old.find(item => item.property === entry.property).value);
          const portraits = [...document.querySelectorAll('.team-panel .player-portrait')];
          const images = [...document.querySelectorAll('.team-panel .player-portrait > .portrait')];
          const snapshot = () => ({
            geometry: [...document.querySelectorAll('.app, .app *')].map(element => {
              const rect = element.getBoundingClientRect();
              return [rect.x, rect.y, rect.width, rect.height];
            }),
            sizing: [
              portraits.map(element => getComputedStyle(element).flexBasis),
              images.map(element => [getComputedStyle(element).width, getComputedStyle(element).height]),
            ],
          });
          const before = snapshot();
          for (const entry of saved) entry.rule.style.removeProperty(entry.property);
          const removed = snapshot();
          for (const entry of saved) if (entry.value) entry.rule.style.setProperty(entry.property, entry.value, entry.priority);
          const restored = snapshot();
          for (const rule of [...createdRules].reverse()) rule.parentRule.deleteRule([...rule.parentRule.cssRules].indexOf(rule));
          return {
            unchanged: JSON.stringify(before) === JSON.stringify(removed),
            restored: JSON.stringify(before) === JSON.stringify(restored),
            active: matchMedia('(max-width: 370px)').matches,
            injected,
          };
        });
        assert(comparison.unchanged, `${engine.name()} ${width}px ${mode} selected=${selected}: old portrait sizes affected rendering`);
        assert(comparison.restored, `${engine.name()} ${width}px ${mode}: restoration mismatch`);
        assert.equal(comparison.active, width <= 370);
        results.push({ engine: engine.name(), width, height, mode, selected, ...comparison });
      }
      await page.close();
    }
  } finally { await browser.close(); }
}
assert.equal(results.length, 80);
assert.equal(results.filter(result => result.active).length, 32);
assert(results.every(result => result.injected === expectReintroduced),
  expectReintroduced ? 'Reintroduce the removed legacy declarations before testing' : 'The baseline declarations unexpectedly required reinsertion');
console.log('PASS 32 active and 48 boundary tiny-portrait sizing comparisons; removal/restoration matched');
