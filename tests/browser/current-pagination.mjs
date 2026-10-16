import { createRequire } from "node:module";
import fs from "node:fs/promises";
import path from "node:path";
const { chromium, webkit } = createRequire(import.meta.url)("playwright");
const out = path.resolve(
  process.env.AUDIT_OUT || ".artifacts/current-pagination",
);
await fs.mkdir(out, { recursive: true });
const results = [];
const assert = (value, message) => {
  if (!value) throw Error(message);
};
for (const [name, engine] of Object.entries({ chromium, webkit })) {
  const browser = await engine.launch();
  const page = await browser.newPage({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    reducedMotion: "reduce",
  });
  const result = { engine: name, checks: [], errors: [] };
  results.push(result);
  page.on("pageerror", (e) => result.errors.push(e.message));
  try {
    await page.goto(
      process.env.AUDIT_URL || "http://127.0.0.1:5174/pokemon-unite-draft/",
      { waitUntil: "networkidle" },
    );
    await page.locator(".setup-start").click();
    await page.locator(".first-prompt-options button").first().click();
    await page.waitForTimeout(200);
    const ids = [];
    const next = page.getByRole("button", { name: "次のページ", exact: true });
    do {
      ids.push(
        ...(await page
          .locator(".pokemon-card")
          .evaluateAll((cards) =>
            cards.map((c) => c.getAttribute("aria-label")),
          )),
      );
      if (await next.isDisabled()) break;
      await next.click();
    } while (ids.length < 150);
    assert(
      ids.length === 102 && new Set(ids).size === 102,
      `Expected 102 unique cards, got ${ids.length}/${new Set(ids).size}`,
    );
    result.checks.push("all-102-once");
    await page.getByRole("searchbox").fill("ピカチュウ");
    assert(
      (await page.locator(".pokemon-card").count()) === 1,
      "Search did not reset page",
    );
    assert(
      await page
        .getByRole("button", { name: "前のページ", exact: true })
        .isDisabled(),
      "Search page did not reset",
    );
    await page
      .getByRole("button", { name: "検索をクリア", exact: true })
      .click();
    await page.locator(".pokemon-card").first().focus();
    const firstLabel = await page
      .locator(".pokemon-card")
      .first()
      .getAttribute("aria-label");
    await page.keyboard.press("PageDown");
    assert(
      (await page.locator(".pokemon-card:focus").count()) === 1,
      "PageDown lost card focus",
    );
    assert(
      (await page
        .locator(".pokemon-card")
        .first()
        .getAttribute("aria-label")) !== firstLabel,
      "PageDown unchanged",
    );
    await page.keyboard.press("PageUp");
    assert(
      (await page.locator(".pokemon-card:focus").count()) === 1,
      "PageUp lost card focus",
    );
    assert(
      (await page
        .locator(".pokemon-card")
        .first()
        .getAttribute("aria-label")) === firstLabel,
      "PageUp did not return",
    );
    result.checks.push("search-reset-keyboard-paging");
    const layouts = [];
    for (const [width, height] of [
      [320, 568],
      [390, 844],
      [667, 375],
      [844, 390],
      [768, 1024],
      [1024, 768],
      [1440, 900],
    ]) {
      await page.setViewportSize({ width, height });
      await page.waitForTimeout(100);
      await page.waitForFunction(() =>
        [...document.images].every((i) => i.complete),
      );
      const state = await page.evaluate(() => {
        const grid = document.querySelector(".pokemon-grid"),
          bar = document.querySelector(".decision-bar");
        const cards = [...document.querySelectorAll(".pokemon-card")];
        return {
          width: innerWidth,
          height: innerHeight,
          bodyHeight: document.documentElement.scrollHeight,
          bodyWidth: document.documentElement.scrollWidth,
          gridHeight: grid.clientHeight,
          gridScroll: grid.scrollHeight,
          barBottom: bar.getBoundingClientRect().bottom,
          cards: cards.length,
          clipped: cards.some((c) => c.scrollHeight > c.clientHeight + 2),
          pager: document.querySelector(".roster-pagination").textContent,
        };
      });
      layouts.push(state);
      assert(
        state.bodyWidth <= width + 1,
        `Horizontal overflow ${width}x${height}`,
      );
      assert(
        state.bodyHeight <= height + 1,
        `Body scroll ${width}x${height}: ${state.bodyHeight}`,
      );
      assert(
        state.gridScroll <= state.gridHeight + 1,
        `Roster scroll ${width}x${height}: ${state.gridScroll}/${state.gridHeight}`,
      );
      assert(!state.clipped, `Card clipping ${width}x${height}`);
      assert(state.cards > 0, `No cards after resize ${width}x${height}`);
      await page.screenshot({
        path: path.join(out, `${name}-${width}x${height}.png`),
      });
    }
    result.layouts = layouts;
    result.checks.push("no-scroll-live-resize");
    while (await next.isEnabled()) await next.click();
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(100);
    assert(
      (await page.locator(".pokemon-card").count()) > 0,
      "Last page empty after resize",
    );
    result.checks.push("last-page-resize-clamp");
    await page.evaluate(
      () => (document.documentElement.style.fontSize = "32px"),
    );
    await page.waitForTimeout(100);
    assert(
      (await page.locator(".pokemon-card").count()) > 0,
      "No cards at 200%",
    );
    await page.locator(".pokemon-card:not(:disabled)").first().click();
    await page.locator(".decision-main > .confirm-button").click();
    assert(
      (await page.evaluate(
        () =>
          JSON.parse(localStorage.getItem("unite-draft.v1")).draft.actions
            .length,
      )) === 1,
      "Enlarged text selection failed",
    );
    result.checks.push("text-200-selection");
  } catch (e) {
    result.failure = e.message;
    await page.screenshot({
      path: path.join(out, `${name}-failure.png`),
      fullPage: true,
    });
  }
  console.log(JSON.stringify(result));
  await browser.close();
}
await fs.writeFile(
  path.join(out, "results.json"),
  JSON.stringify(results, null, 2),
);
if (results.some((r) => r.failure || r.errors.length)) process.exitCode = 1;
