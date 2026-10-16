import { createRequire } from "node:module";
import fs from "node:fs/promises";
import path from "node:path";
const { chromium, webkit } = createRequire(import.meta.url)("playwright");
const out = path.resolve(
  process.env.AUDIT_OUT || ".artifacts/studio-pagination",
);
await fs.mkdir(out, { recursive: true });
const results = [];
const assert = (value, message) => {
  if (!value) throw Error(message);
};
for (const engine of (process.env.AUDIT_ENGINES || "chromium,webkit").split(
  ",",
)) {
  const browser = await { chromium, webkit }[engine].launch();
  for (const [width, height] of JSON.parse(
    process.env.AUDIT_SIZES || "[[320,568],[667,375],[1280,800]]",
  )) {
    const page = await browser.newPage({
      viewport: { width, height },
      reducedMotion: "reduce",
    });
    const result = { engine, width, height, states: [], errors: [] };
    results.push(result);
    page.on("pageerror", (error) => result.errors.push(error.message));
    const settle = async () => {
      await page.evaluate(
        () =>
          new Promise((resolve) =>
            requestAnimationFrame(() => requestAnimationFrame(resolve)),
          ),
      );
      await page.waitForFunction(() =>
        [...document.images].every((image) => image.complete),
      );
      await page.waitForFunction(() => {
        const grid = document.querySelector(".collection-grid");
        if (!grid || !grid.clientWidth) return true;
        const probe = document.querySelector(".collection-measure");
        const style = getComputedStyle(grid);
        return (
          Number(grid.dataset.columns) ===
            style.gridTemplateColumns.split(" ").length &&
          Math.ceil(probe.getBoundingClientRect().height) ===
            parseInt(style.getPropertyValue("--card-height"))
        );
      });
    };
    const metric = async (state, enlarged = false) => {
      await settle();
      const value = await page.evaluate(() => {
        const grid = document.querySelector(".collection-grid");
        const card = document.querySelector(".creature");
        const bar = document.querySelector(".command-bar");
        return {
          viewport: [innerWidth, innerHeight],
          scroll: [
            document.documentElement.scrollWidth,
            document.documentElement.scrollHeight,
          ],
          grid: grid && [grid.clientHeight, grid.scrollHeight],
          count: document.querySelectorAll(".creature").length,
          card: card && [card.clientWidth, card.clientHeight],
          bar: bar?.getBoundingClientRect().bottom,
          pager: document.querySelector(".collection-pages")?.textContent,
          clipped: [
            ...document.querySelectorAll(".creature-name,.selection-summary"),
          ]
            .filter(
              (element) =>
                getComputedStyle(element).visibility !== "hidden" &&
                element.getBoundingClientRect().width &&
                (element.scrollHeight > element.clientHeight + 2 ||
                  element.scrollWidth > element.clientWidth + 2),
            )
            .map((element) => element.className),
        };
      });
      result.states.push({ state, ...value });
      await page.screenshot({
        path: path.join(out, `${engine}-${width}x${height}-${state}.png`),
        fullPage: true,
      });
      assert(
        value.scroll[0] <= value.viewport[0] + 1,
        `${state} horizontal overflow`,
      );
      assert(!value.clipped.length, `${state} clipped labels`);
      if (!enlarged) {
        assert(
          value.scroll[1] <= value.viewport[1] + 1,
          `${state} page scroll ${value.scroll[1]}`,
        );
        if (value.grid)
          assert(
            value.grid[1] <= value.grid[0] + 1,
            `${state} roster scroll ${value.grid}`,
          );
        if (value.bar)
          assert(value.bar <= value.viewport[1] + 1, `${state} hidden actions`);
      }
      if (value.card)
        assert(
          value.card[0] >= 44 && value.card[1] >= 44,
          `${state} touch target`,
        );
    };
    try {
      await page.goto(
        process.env.AUDIT_URL ||
          "http://127.0.0.1:5174/pokemon-unite-draft/v2/",
        { waitUntil: "networkidle" },
      );
      await metric("home");
      await page.locator(".begin").click();
      await page.locator(".first-choice button").first().click();
      await metric("draft");
      const seen = [];
      for (let i = 0; i < 103; i++) {
        await settle();
        seen.push(
          ...(await page
            .locator(".creature")
            .evaluateAll((cards) => cards.map((card) => card.dataset.id))),
        );
        const next = page.getByRole("button", {
          name: "次のページ",
          exact: true,
        });
        if (await next.isDisabled()) break;
        await next.click();
      }
      assert(
        seen.length === 102 && new Set(seen).size === 102,
        `All 102 exactly once: ${seen.length}/${new Set(seen).size}`,
      );
      await metric("last");
      await page.locator(".creature").first().click();
      await page.getByRole("searchbox").fill("ピカチュウ");
      await settle();
      assert(
        await page.locator(".commit").isDisabled(),
        "Search must clear a hidden previous selection",
      );
      assert(
        (await page.locator(".creature").count()) === 1,
        "Search clamps page",
      );
      assert(
        await page
          .getByRole("button", { name: "次のページ", exact: true })
          .isDisabled(),
        "Single search page",
      );
      await page
        .getByRole("button", { name: "検索をクリア", exact: true })
        .click();
      await settle();
      await page.locator(".creature").first().focus();
      await page.keyboard.press("PageDown");
      await settle();
      assert(
        await page
          .locator(".creature")
          .first()
          .evaluate(
            (card) =>
              card === document.activeElement &&
              card.getAttribute("aria-pressed") === "true",
          ),
        "PageDown focus and selection",
      );
      await page.keyboard.press("PageUp");
      await settle();
      assert(
        await page
          .locator(".creature")
          .last()
          .evaluate((card) => card === document.activeElement),
        "PageUp focus",
      );
      await page.evaluate(
        () => (document.documentElement.style.fontSize = "32px"),
      );
      await metric("text-200", true);
      await page.locator(".creature").first().click();
      await page.locator(".commit").click();
      await page.evaluate(() => (document.documentElement.style.fontSize = ""));
      await settle();
      await page
        .getByRole("button", { name: "次のページ", exact: true })
        .click();
      await page.setViewportSize({ width: 1440, height: 900 });
      await metric("resize-desktop");
      await page.setViewportSize({ width, height });
      await metric("resize-back");
      result.passed = true;
    } catch (error) {
      result.failure = error.message;
    }
    console.log(
      JSON.stringify({
        engine,
        width,
        height,
        passed: result.passed,
        failure: result.failure,
        errors: result.errors,
      }),
    );
    await fs.writeFile(
      path.join(out, "results.json"),
      JSON.stringify(results, null, 2),
    );
    await page.close();
  }
  await browser.close();
}
if (results.some((result) => result.failure || result.errors.length))
  process.exitCode = 1;
