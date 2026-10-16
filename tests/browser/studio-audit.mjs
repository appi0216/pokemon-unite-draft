import { createRequire } from "node:module";
import fs from "node:fs/promises";
import path from "node:path";
const { chromium, webkit } = createRequire(import.meta.url)("playwright");
const out = path.resolve(process.env.AUDIT_OUT || ".artifacts/studio");
await fs.mkdir(out, { recursive: true });
const results = [];
const sizes = JSON.parse(
  process.env.AUDIT_SIZES ||
    "[[320,568],[390,844],[430,932],[667,375],[844,390],[768,1024],[1024,768],[1440,900]]",
);
for (const engine of (process.env.AUDIT_ENGINES || "chromium,webkit").split(
  ",",
)) {
  const browser = await { chromium, webkit }[engine].launch();
  for (const [width, height] of sizes) {
    const context = await browser.newContext({
      viewport: { width, height },
      colorScheme: "light",
      reducedMotion: "reduce",
      hasTouch: width < 1000,
    });
    const page = await context.newPage();
    page.setDefaultTimeout(10000);
    const result = {
      engine,
      width,
      height,
      checks: [],
      states: [],
      errors: [],
    };
    results.push(result);
    page.on("pageerror", (e) => result.errors.push(e.message));
    const assert = (v, m) => {
      if (!v) throw Error(m);
    };
    const metric = async (state) => {
      // Newly mounted roster images can still be downloading after navigation.
      await page.waitForFunction(() =>
        [...document.images].every((image) => image.complete),
      );
      const m = await page.evaluate(() => {
        const rect = (s) => {
          let e = document.querySelector(s);
          let r = e?.getBoundingClientRect();
          return r?.width && r?.height ? r.toJSON() : null;
        };
        const overlap = [];
        for (const group of [
          [".appbar", ".workspace", ".command-bar"],
          [".wordmark", ".turn", ".appbar-actions"],
          [".collection", ".lineups"],
          [".edit-actions", ".selection-summary", ".commit"],
          [".pane-tabs", ".collection"],
          [".pane-tabs", ".lineups"],
        ]) {
          const r = group.map((s) => [s, rect(s)]).filter((a) => a[1]);
          for (let i = 0; i < r.length; i++)
            for (let j = i + 1; j < r.length; j++) {
              const a = r[i][1],
                b = r[j][1];
              if (
                Math.min(a.right, b.right) - Math.max(a.left, b.left) > 1 &&
                Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 1
              )
                overlap.push([r[i][0], r[j][0]]);
            }
        }
        const clipped = [
          ...document.querySelectorAll(".creature-name,.selection-summary"),
        ]
          .filter(
            (e) =>
              e.getBoundingClientRect().width &&
              (e.scrollHeight > e.clientHeight + 2 ||
                e.scrollWidth > e.clientWidth + 2),
          )
          .map((e) => e.className);
        const broken = [...document.images].filter(
          (i) => i.complete && !i.naturalWidth,
        ).length;
        return {
          overlap,
          clipped,
          broken,
          width: innerWidth,
          scrollWidth: document.documentElement.scrollWidth,
          bar: rect(".command-bar"),
          height: innerHeight,
          dialog: rect("dialog[open]"),
        };
      });
      result.states.push({ state, ...m });
      await page.screenshot({
        path: path.join(out, `${engine}-${width}x${height}-${state}.png`),
        fullPage: true,
      });
      assert(
        !m.overlap.length,
        `${state} overlap ${JSON.stringify(m.overlap)}`,
      );
      assert(m.scrollWidth <= m.width + 1, `${state} overflow`);
      assert(!m.clipped.length, `${state} clipped text`);
      assert(!m.broken, `${state} broken images`);
      if (m.bar && !state.startsWith("text"))
        assert(m.bar.bottom <= height + 1, `${state} action below viewport`);
    };
    const read = () =>
      page.evaluate(
        () => JSON.parse(localStorage.getItem("unite-draft.studio.v2")).draft,
      );
    const pick = async () => {
      const tab = page.getByRole("button", { name: "ポケモン", exact: true });
      if (await tab.isVisible()) await tab.click();
      await page.locator(".creature:not(:disabled)").first().click();
      await page.locator(".commit").click();
    };
    try {
      await page.goto(
        process.env.AUDIT_URL ||
          "http://127.0.0.1:5174/pokemon-unite-draft/v2/",
        { waitUntil: "networkidle" },
      );
      await metric("home");
      const mode =
        width === 320 ? "オールスター" : width === 667 ? "フィアレス" : "通常";
      await page.getByRole("button", { name: new RegExp("^" + mode) }).click();
      await page.getByRole("button", { name: "チーム名", exact: true }).click();
      await page
        .locator(".name-fields input")
        .first()
        .fill("長いチーム名を使った表示確認テスト");
      await page.getByRole("button", { name: "完了", exact: true }).click();
      await page
        .getByRole("button", { name: "対戦を準備", exact: true })
        .click();
      await page.locator(".first-choice button").first().click();
      assert(
        (await page.locator(".collection").getAttribute("data-total")) ===
          "102",
        "Roster count",
      );
      await metric("draft");
      await page.getByRole("searchbox").fill("ピカチュウ");
      assert((await page.locator(".creature").count()) === 1, "Search");
      await page.getByRole("button", { name: "検索をクリア" }).click();
      await page.getByRole("button", { name: "絞り込みと並び順" }).click();
      await metric("filters");
      await page.locator(".role-picker button").nth(1).click();
      assert((await page.locator(".creature").count()) < 102, "Role");
      await page.locator(".role-picker button").first().click();
      await page.getByRole("button", { name: "102匹を表示" }).click();
      result.checks.push("filters-search");
      await page.evaluate(
        () => (document.documentElement.style.fontSize = "32px"),
      );
      await metric("text-200");
      await pick();
      await page.evaluate(() => (document.documentElement.style.fontSize = ""));
      await page.getByRole("button", { name: "1つ戻す" }).click();
      assert((await read()).actions.length === 0, "Undo");
      await page.getByRole("button", { name: "その他の操作" }).click();
      await page
        .locator(".action-list")
        .getByRole("button", { name: "1つ進む" })
        .click();
      assert((await read()).actions.length === 1, "Redo");
      for (let i = 1; i < 16; i++) await pick();
      assert((await read()).actions.length === 16, "Full draft");
      result.checks.push("full16-undo-redo");
      const teamsTab = page.locator(".pane-tabs button").nth(1);
      if (await teamsTab.isVisible()) await teamsTab.click();
      await metric("completed");
      await page.locator(".team-card.purple .pick-slot").first().click();
      await page.locator(".team-card.purple .pick-slot").nth(1).click();
      await page.locator(".commit").click();
      await page.locator(".first-choice button").last().click();
      assert((await read()).game === 2, "Next game");
      if (mode === "オールスター")
        assert(
          (await page.locator(".collection").getAttribute("data-total")) ===
            "92",
          "All-Star restriction",
        );
      await page.emulateMedia({ colorScheme: "dark" });
      await metric("dark-next-game");
      await page.reload({ waitUntil: "networkidle" });
      assert((await read()).game === 2, "Restore");
      result.checks.push("swap-next-restrictions-dark-reload");
      assert(
        (await page.evaluate(() => localStorage.getItem("unite-draft.v1"))) ===
          null,
        "Storage isolation",
      );
    } catch (e) {
      result.failure = e.message;
    }
    console.log(
      JSON.stringify({
        engine,
        width,
        height,
        failure: result.failure,
        checks: result.checks,
        errors: result.errors,
      }),
    );
    await fs.writeFile(
      path.join(out, "results.json"),
      JSON.stringify(results, null, 2),
    );
    await context.close();
  }
  await browser.close();
}
if (results.some((r) => r.failure || r.errors.length)) process.exitCode = 1;
