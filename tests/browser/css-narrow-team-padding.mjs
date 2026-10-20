import { createRequire } from 'node:module';
import assert from 'node:assert/strict';
const { chromium, webkit } = createRequire(import.meta.url)('playwright');
const sizes = [[320,568],[390,844],[600,800],[601,800],[800,600],[1000,800],[1001,800]];
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
      const duplicate = await page.addStyleTag({ content: '@media (max-width: 600px) { .team-panel { padding: 10px; } }' });
      for (const selected of [false, true]) {
        if (selected) await page.locator('.pokemon-grid .pokemon-card:not(:disabled)').first().click();
        const result = await page.evaluate(styleElement => {
          const rule = styleElement.sheet.cssRules[0].cssRules[0];
          const value = rule.style.getPropertyValue('padding');
          const priority = rule.style.getPropertyPriority('padding');
          const targets = [...document.querySelectorAll('.team-panel')];
          if (targets.length !== 2) throw new Error(`Expected two team panels, found ${targets.length}`);
          const snapshot = () => ({
            geometry: [...document.querySelectorAll('.app, .app *')].map(element => {
              const rect = element.getBoundingClientRect();
              return [rect.x, rect.y, rect.width, rect.height];
            }),
            panelPadding: targets.map(target => getComputedStyle(target).padding),
          });
          const before = snapshot();
          rule.style.removeProperty('padding');
          const removed = snapshot();
          rule.style.setProperty('padding', value, priority);
          const restored = snapshot();
          return {
            unchanged: JSON.stringify(before) === JSON.stringify(removed),
            restored: JSON.stringify(before) === JSON.stringify(restored),
            active: matchMedia('(max-width: 600px)').matches,
          };
        }, duplicate);
        assert(result.unchanged, `${engine.name()} ${width}px selected=${selected}: narrow padding changed rendering`);
        assert(result.restored, `${engine.name()} ${width}px selected=${selected}: restoration mismatch`);
        results.push({ engine: engine.name(), width, height, selected, ...result });
      }
      await duplicate.evaluate(element => element.remove());
      await page.close();
    }
  } finally { await browser.close(); }
}
assert.equal(results.length, 28);
console.log(`PASS ${results.length} narrower-breakpoint padding removal comparisons`);
