import { createRequire } from "node:module";
import fs from "node:fs/promises";
const { chromium, webkit } = createRequire(import.meta.url)("playwright");
const base =
  process.env.AUDIT_URL || "http://127.0.0.1:5174/pokemon-unite-draft/";
const out = process.env.AUDIT_OUT || ".artifacts/recovery";
await fs.mkdir(out, { recursive: true });
const results = [];
for (const [engineName, engine] of Object.entries({ chromium, webkit })) {
  const browser = await engine.launch();
  for (const v2 of [false, true]) {
    const page = await browser.newPage({
      viewport: { width: 320, height: 568 },
      reducedMotion: "reduce",
    });
    const result = {
      engine: engineName,
      version: v2 ? "v2" : "current",
      errors: [],
    };
    results.push(result);
    page.on("pageerror", (e) => result.errors.push(e.message));
    const key = v2 ? "unite-draft.studio.v2" : "unite-draft.v1";
    const read = () =>
      page.evaluate((key) => JSON.parse(localStorage.getItem(key))?.draft, key);
    try {
      await page.goto(base + (v2 ? "v2/" : ""));
      await page.locator(v2 ? ".begin" : ".setup-start").click();
      await page
        .locator(v2 ? ".first-choice button" : ".first-prompt-options button")
        .first()
        .click();
      await page
        .locator(
          v2 ? ".creature:not(:disabled)" : ".pokemon-card:not(:disabled)",
        )
        .first()
        .click();
      await page
        .locator(v2 ? ".commit" : ".decision-bar .confirm-button")
        .click();
      const before = await read();
      if (before.actions.length !== 1) throw Error("first action");
      await page
        .getByRole("button", { name: "ホームに戻る", exact: true })
        .click();
      await page.locator(v2 ? ".begin" : ".setup-start").click();
      await page
        .getByRole("heading", { name: "新しいドラフトを開始" })
        .waitFor();
      if (
        !(await page.evaluate(() =>
          ["キャンセル", "閉じる"].includes(
            document.activeElement.getAttribute("aria-label") ||
              document.activeElement.textContent,
          ),
        ))
      )
        throw Error("Safe initial focus");
      await page
        .getByRole("button", { name: "キャンセル", exact: true })
        .click();
      if (JSON.stringify(await read()) !== JSON.stringify(before))
        throw Error("Cancel changed saved draft");
      await page.locator(v2 ? ".begin" : ".setup-start").click();
      await page
        .getByRole("dialog")
        .getByRole("button", { name: "新しく開始", exact: true })
        .click();
      await page.getByRole("button", { name: "閉じる", exact: true }).click();
      if (JSON.stringify(await read()) !== JSON.stringify(before))
        throw Error("Cancelling team choice lost draft");
      await page.locator(v2 ? ".begin" : ".setup-start").click();
      await page
        .getByRole("dialog")
        .getByRole("button", { name: "新しく開始", exact: true })
        .click();
      await page
        .locator(v2 ? ".first-choice button" : ".first-prompt-options button")
        .last()
        .click();
      if ((await read()).actions.length !== 0)
        throw Error("Confirmed replacement failed");
      await page.evaluate(() => {
        Storage.prototype.setItem = function () {
          throw new DOMException("quota", "QuotaExceededError");
        };
      });
      await page
        .locator(
          v2 ? ".creature:not(:disabled)" : ".pokemon-card:not(:disabled)",
        )
        .first()
        .click();
      await page
        .locator(v2 ? ".commit" : ".decision-bar .confirm-button")
        .click();
      await page
        .locator("header")
        .getByText("未保存", { exact: true })
        .waitFor();
      await page.waitForTimeout(5500);
      if (
        !(await page
          .locator("header")
          .getByText("未保存", { exact: true })
          .isVisible())
      )
        throw Error("Failure disappeared");
      await page
        .getByRole("button", {
          name: v2 ? "使い方" : "使い方・ルール",
          exact: true,
        })
        .click();
      await page
        .getByText("自動保存できていません。", { exact: false })
        .waitFor();
      await page.screenshot({
        path: `${out}/${engineName}-${result.version}-storage.png`,
      });
      result.passed = true;
    } catch (e) {
      result.failure = e.message;
    }
    console.log(JSON.stringify(result));
    await page.close();
  }
  await browser.close();
}
await fs.writeFile(`${out}/results.json`, JSON.stringify(results, null, 2));
if (results.some((r) => r.failure || r.errors.length)) process.exitCode = 1;
