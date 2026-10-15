import { createRequire } from "node:module";
import fs from "node:fs/promises";
import path from "node:path";
const { chromium, webkit } = createRequire(import.meta.url)("playwright");
const out = path.resolve(process.env.AUDIT_OUT || ".artifacts/workspace");
await fs.mkdir(out, { recursive: true });
const results = [];
const sizes = JSON.parse(
  process.env.AUDIT_SIZES ||
    "[[320,568],[375,667],[390,844],[430,932],[600,800],[640,450],[667,375],[844,390],[768,1024],[820,1180],[1000,700],[1024,768],[1280,720],[1440,900],[1920,1080]]",
);
for (const engineName of (process.env.AUDIT_ENGINES || "chromium,webkit").split(
  ",",
)) {
  const browser = await { chromium, webkit }[engineName].launch();
  for (const [width, height] of sizes) {
    const context = await browser.newContext({
      viewport: { width, height },
      hasTouch: width < 1000,
      reducedMotion: "reduce",
    });
    const page = await context.newPage();
    page.setDefaultTimeout(10000);
    const run = { engine: engineName, width, height, states: [], errors: [] };
    results.push(run);
    page.on("pageerror", (e) => run.errors.push(e.message));
    const measure = async (state) => {
      const m = await page.evaluate(() => {
        const rect = (s) => {
          let e = document.querySelector(s);
          if (!e) return null;
          let r = e.getBoundingClientRect();
          return r.width && r.height ? r.toJSON() : null;
        };
        const overlaps = [];
        for (const selectors of [
          [".app-header", ".draft-main"],
          [".brand", ".header-center", ".header-actions"],
          [
            ".progress-disclosure",
            ".compact-view-tabs",
            ".draft-arena",
            ".decision-bar",
          ],
          [".search-field", ".sort-select", ".filter-toggle"],
          [".utility-actions", ".decision-main", ".decision-extra"],
          [".pokemon-grid", ".selection-footer"],
          [".team-side.purple", ".selection-panel", ".team-side.orange"],
        ]) {
          const boxes = selectors.map((s) => [s, rect(s)]).filter((x) => x[1]);
          for (let i = 0; i < boxes.length; i++)
            for (let j = i + 1; j < boxes.length; j++) {
              const [a, r] = boxes[i],
                [b, q] = boxes[j];
              if (
                Math.min(r.right, q.right) - Math.max(r.left, q.left) > 1 &&
                Math.min(r.bottom, q.bottom) - Math.max(r.top, q.top) > 1
              )
                overlaps.push([a, b]);
            }
        }
        const arena = rect(".draft-arena"),
          bar = rect(".decision-bar"),
          grid = rect(".pokemon-grid");
        const dialog = rect("dialog[open]");
        const blankBelow = bar ? innerHeight - bar.bottom : 0;
        const scrollBottomGap = bar
          ? document.documentElement.scrollHeight - (bar.bottom + scrollY)
          : 0;
        const broken = [...document.images]
          .filter((i) => i.complete && !i.naturalWidth)
          .map((i) => i.src);
        const clippedText = [
          ...document.querySelectorAll(
            ".pokemon-name,.selected-description,.selection-footer",
          ),
        ]
          .filter(
            (e) =>
              e.getBoundingClientRect().width &&
              (e.scrollHeight > e.clientHeight + 2 ||
                e.scrollWidth > e.clientWidth + 2),
          )
          .map((e) => e.className);
        const panel = rect(".selection-panel");
        const outsidePanel = panel
          ? [
              ".search-field",
              ".sort-select",
              ".filter-toggle",
              ".pokemon-grid",
              ".selection-footer",
            ].filter((s) => {
              const r = rect(s);
              return (
                r &&
                (r.bottom > panel.bottom + 1 ||
                  r.top < panel.top - 1 ||
                  r.left < panel.left - 1 ||
                  r.right > panel.right + 1)
              );
            })
          : [];
        return {
          overlaps,
          width: innerWidth,
          scrollWidth: document.documentElement.scrollWidth,
          height: innerHeight,
          scrollHeight: document.documentElement.scrollHeight,
          arena,
          bar,
          grid,
          dialog,
          blankBelow,
          scrollBottomGap,
          broken,
          clippedText,
          outsidePanel,
        };
      });
      m.state = state;
      m.failures = [];
      if (m.overlaps.length) m.failures.push("overlap");
      if (m.scrollWidth > m.width + 1) m.failures.push("horizontal-overflow");
      if (m.blankBelow > 32 || m.scrollBottomGap > 32)
        m.failures.push("unused-space-below-actions");
      if (m.broken.length) m.failures.push("broken-image");
      if (m.clippedText.length) m.failures.push("clipped-text");
      if (m.outsidePanel.length) m.failures.push("panel-clipping");
      if (
        m.dialog &&
        (m.dialog.left < 0 ||
          m.dialog.top < 0 ||
          m.dialog.right > width + 1 ||
          m.dialog.bottom > height + 1)
      )
        m.failures.push("dialog-outside-viewport");
      if (m.grid && m.grid.height < 100) m.failures.push("roster-too-small");
      if (!state.startsWith("text-200") && m.bar && m.bar.bottom > height + 1)
        m.failures.push("actions-outside-viewport");
      run.states.push(m);
      await page.screenshot({
        path: path.join(out, `${engineName}-${width}x${height}-${state}.png`),
        fullPage: true,
      });
    };
    try {
      await page.goto(
        process.env.AUDIT_URL || "http://127.0.0.1:5174/pokemon-unite-draft/",
        { waitUntil: "networkidle" },
      );
      const names = page
        .locator("details")
        .filter({
          has: page.locator("summary", { hasText: "チーム・プレイヤー名" }),
        });
      await names.locator("summary").click();
      await names
        .locator("input")
        .first()
        .fill("長いチーム名を使った表示確認テスト");
      await names.locator("summary").click();
      await page.getByRole("switch").click();
      await page.locator(".setup-start").click();
      await page.locator(".first-prompt-options button").first().click();
      await page.getByRole("button", { name: "タイマーを停止" }).click();
      await measure("roster");
      await page.getByRole("button", { name: "絞り込み", exact: true }).click();
      await measure("filters");
      await page.locator(".filter-dialog .modal-primary").click();
      if (await page.locator(".compact-view-tabs button.purple").isVisible()) {
        await page.locator(".compact-view-tabs button.purple").click();
        await measure("team");
        await page.locator(".compact-view-tabs button.roster").click();
      }
      await page.locator(".pokemon-card:not(:disabled)").first().click();
      await measure("selected");
      await page.locator(".decision-main > .confirm-button").click();
      await page.evaluate(
        () => (document.documentElement.style.fontSize = "32px"),
      );
      await measure("text-200");
      await page.getByRole("button", { name: "絞り込み", exact: true }).click();
      await measure("text-200-filters");
      await page.locator(".filter-dialog .modal-primary").click();
      await page.locator(".pokemon-card:not(:disabled)").first().click();
      await page.locator(".decision-main > .confirm-button").click();
      if (
        (await page.evaluate(
          () =>
            JSON.parse(localStorage.getItem("unite-draft.v1")).draft.actions
              .length,
        )) !== 2
      )
        throw Error("Confirmation failed at enlarged text");
    } catch (e) {
      run.failure = e.message;
    }
    console.log(
      JSON.stringify({
        engine: engineName,
        width,
        height,
        failed: run.states
          .filter((s) => s.failures.length)
          .map((s) => ({
            state: s.state,
            failures: s.failures,
            overlaps: s.overlaps,
          })),
        failure: run.failure,
        errors: run.errors,
      }),
    );
    await context.close();
  }
  await browser.close();
}
await fs.writeFile(
  path.join(out, "results.json"),
  JSON.stringify(results, null, 2),
);
if (
  results.some(
    (r) =>
      r.failure || r.errors.length || r.states.some((s) => s.failures.length),
  )
)
  process.exitCode = 1;
