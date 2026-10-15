import { createRequire } from "node:module";
import fs from "node:fs/promises";

const require = createRequire(import.meta.url);
const { chromium, webkit } = require("playwright");
await fs.mkdir(".artifacts", { recursive: true });
const results = [];
const url =
  process.env.AUDIT_URL || "http://127.0.0.1:5174/pokemon-unite-draft/";
function assert(value, message) {
  if (!value) throw Error(message);
}
for (const [engineName, engine] of Object.entries({ chromium, webkit })) {
  const browser = await engine.launch({ headless: true });
  for (const mode of ["通常ドラフト", "オールスター", "フィアレス"]) {
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
      hasTouch: true,
      isMobile: true,
      reducedMotion: "reduce",
    });
    const page = await context.newPage();
    page.setDefaultTimeout(10000);
    const result = { engine: engineName, mode, checks: [], errors: [] };
    results.push(result);
    page.on("pageerror", (e) => result.errors.push(e.message));
    const read = () =>
      page.evaluate(() => JSON.parse(localStorage.getItem("unite-draft.v1")));
    const pick = async () => {
      const tab = page.locator(".compact-view-tabs button.roster");
      if (await tab.isVisible()) await tab.click();
      await page.locator(".pokemon-card:not(:disabled)").first().click();
      await page.locator(".decision-main > .confirm-button").click();
    };
    try {
      await page.goto(url, { waitUntil: "networkidle" });
      await page.getByRole("button", { name: mode, exact: true }).click();
      if (mode !== "通常ドラフト")
        await page
          .getByRole("button", { name: "BO3、3試合", exact: true })
          .click();
      await page.locator(".setup-start").click();
      await page.locator(".first-prompt-options .purple").click();
      const saved = await read();
      assert(
        saved.draft.allStar === (mode !== "通常ドラフト"),
        "Draft format allStar mismatch",
      );
      if (mode !== "通常ドラフト")
        assert(
          saved.draft.seriesRule ===
            (mode === "オールスター" ? "all-star" : "fearless"),
          "Draft format seriesRule mismatch",
        );
      result.checks.push("format");
      await page
        .getByRole("searchbox", { name: "ポケモンを検索", exact: true })
        .fill("ピカチュウ");
      assert(
        (await page.locator(".pokemon-card").count()) === 1,
        "Search did not yield one Pikachu",
      );
      await page
        .getByRole("button", { name: "検索をクリア", exact: true })
        .click();
      result.checks.push("search-and-clear");
      await page.getByRole("button", { name: "絞り込み", exact: true }).click();
      await page.locator(".role-tabs button").nth(1).click();
      assert(
        (await page.locator(".pokemon-card").count()) > 0,
        "Role filter empty",
      );
      await page.locator(".role-tabs button").first().click();
      await page.locator(".filter-dialog .modal-primary").click();
      result.checks.push("role-filters");
      const firstCard = page.locator(".pokemon-card:not(:disabled)").first();
      await firstCard.focus();
      await page.keyboard.press("ArrowRight");
      await page.keyboard.press("Enter");
      assert(
        (await read()).draft.actions.length === 1,
        "Keyboard selection failed",
      );
      result.checks.push("keyboard-arrow-enter");
      await page.getByRole("button", { name: "1つ戻す", exact: true }).click();
      assert((await read()).draft.actions.length === 0, "Undo failed");
      await page.getByRole("button", { name: "1つ進む", exact: true }).click();
      assert((await read()).draft.actions.length === 1, "Redo failed");
      result.checks.push("undo-redo");
      await page.locator(".pokemon-card:not(:disabled)").first().click();
      const beforeDisclosure = (await read()).draft.actions.length;
      await page.locator(".progress-disclosure > summary").focus();
      await page.keyboard.press("Enter");
      assert(
        (await read()).draft.actions.length === beforeDisclosure,
        "Summary Enter confirmed a Pokemon",
      );
      assert(
        (await page.locator(".progress-disclosure[open]").count()) === 1,
        "Summary did not open",
      );
      await page.keyboard.press("Enter");
      result.checks.push("summary-enter-does-not-confirm");
      for (const [width, height] of [
        [320, 568],
        [667, 375],
        [1024, 768],
        [1440, 900],
        [390, 844],
      ]) {
        await page.setViewportSize({ width, height });
        await pick();
        const dimensions = await page.evaluate(() => ({
          width: innerWidth,
          scrollWidth: document.documentElement.scrollWidth,
        }));
        assert(
          dimensions.scrollWidth <= dimensions.width + 1,
          "Horizontal overflow after resize",
        );
      }
      result.checks.push("live-resize-and-select");
      while ((await read()).draft.actions.length < 16) await pick();
      assert(
        (await page.locator(".app.draft-complete").count()) === 1,
        "Completion absent",
      );
      result.checks.push("draft-completed");
      await page.getByRole("button", { name: "1つ戻す", exact: true }).click();
      await pick();
      assert(
        (await page.locator(".app.draft-complete").count()) === 1,
        "Cannot revise last pick",
      );
      result.checks.push("undo-final-reselect");
      await page.locator(".compact-view-tabs button.purple").click();
      await page.locator(".team-side.purple .player-slot").first().click();
      await page.locator(".team-side.purple .player-slot").nth(1).click();
      result.checks.push("completed-swap");
      await page.locator(".decision-main > .confirm-button").click();
      await page.locator(".first-prompt-options .orange").click();
      const next = await read();
      assert(next.draft.game === 2, "Next game failed");
      assert(next.draft.actions.length === 0, "Next game action reset failed");
      result.checks.push("next-game");
      await pick();
      await page.reload({ waitUntil: "networkidle" });
      assert((await read()).draft.actions.length === 1, "Reload state missing");
      result.checks.push("saved-state-reload");
    } catch (e) {
      result.failure = e.message;
      await page.screenshot({
        path: `.artifacts/interaction-${engineName}-${mode}.png`,
        fullPage: true,
      });
    }
    console.log(JSON.stringify(result));
    await context.close();
  }
  await browser.close();
}
await fs.writeFile(
  ".artifacts/interaction-results.json",
  JSON.stringify(results, null, 2),
);
if (results.some((r) => r.failure || r.errors.length)) process.exitCode = 1;
