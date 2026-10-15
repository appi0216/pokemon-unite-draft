import { createRequire } from "node:module";
import fs from "node:fs/promises";
import path from "node:path";

const require = createRequire(import.meta.url);
const { chromium, webkit } = require("playwright");
const url =
  process.env.AUDIT_URL || "http://127.0.0.1:5174/pokemon-unite-draft/";
const destination = path.resolve(
  process.env.AUDIT_OUT || ".artifacts/layout-audit",
);
await fs.mkdir(destination, { recursive: true });
const engines = (process.env.AUDIT_ENGINES || "chromium,webkit").split(",");
const sizes = process.env.AUDIT_SIZES
  ? JSON.parse(process.env.AUDIT_SIZES)
  : [
      [320, 568],
      [375, 667],
      [390, 844],
      [430, 932],
      [667, 375],
      [844, 390],
      [768, 1024],
      [820, 1180],
      [1024, 768],
      [1280, 720],
      [1440, 900],
      [1920, 1080],
    ];
const result = [];

async function metric(page, state) {
  return page.evaluate((state) => {
    const visible = (el) => {
      if (el.closest("details:not([open])") && !el.closest("summary"))
        return false;
      const r = el.getBoundingClientRect();
      const s = getComputedStyle(el);
      return (
        r.width > 0 &&
        r.height > 0 &&
        s.visibility !== "hidden" &&
        s.display !== "none" &&
        !el.closest("[inert]")
      );
    };
    const rect = (el) => {
      if (!el || !visible(el)) return null;
      const r = el.getBoundingClientRect();
      return {
        x: Math.round(r.x),
        y: Math.round(r.y),
        width: Math.round(r.width),
        height: Math.round(r.height),
        bottom: Math.round(r.bottom),
        right: Math.round(r.right),
      };
    };
    const controls = Array.from(
      document.querySelectorAll("button,input,select,summary,a[href]"),
    ).filter(visible);
    const label = (el) =>
      el.getAttribute("aria-label") ||
      el.getAttribute("title") ||
      el.textContent?.trim().slice(0, 70) ||
      el.getAttribute("placeholder") ||
      el.tagName;
    return {
      state,
      viewport: { width: innerWidth, height: innerHeight },
      document: {
        width: document.documentElement.scrollWidth,
        height: document.documentElement.scrollHeight,
      },
      horizontalOverflow: document.documentElement.scrollWidth > innerWidth + 1,
      action: rect(document.querySelector(".decision-main > .confirm-button")),
      roster: rect(document.querySelector(".pokemon-grid")),
      dialog: rect(document.querySelector("dialog[open]")),
      imageFailures: Array.from(document.images)
        .filter((i) => i.complete && i.naturalWidth === 0)
        .map((i) => i.src),
      unnamedButtons: controls
        .filter(
          (el) =>
            el.tagName === "BUTTON" &&
            !el.getAttribute("aria-label") &&
            !el.getAttribute("aria-labelledby") &&
            !el.getAttribute("title") &&
            !el.textContent.trim(),
        )
        .map((el) => el.className),
      smallTargets: controls
        .filter((el) => {
          const r = el.getBoundingClientRect();
          return (r.width < 44 || r.height < 44) && !el.disabled;
        })
        .map((el) => ({ label: label(el), ...rect(el) }))
        .slice(0, 30),
      clippedHorizontal: controls
        .filter((el) => {
          const r = el.getBoundingClientRect();
          return r.left < -1 || r.right > innerWidth + 1;
        })
        .map((el) => ({ label: label(el), ...rect(el) }))
        .slice(0, 20),
    };
  }, state);
}

for (const engine of engines) {
  let browser;
  try {
    browser = await { chromium, webkit }[engine].launch({ headless: true });
    for (const [width, height] of sizes) {
      const context = await browser.newContext({
        viewport: { width, height },
        deviceScaleFactor: 1,
        hasTouch: width <= 844,
        isMobile: width <= 430,
        reducedMotion: "reduce",
      });
      const page = await context.newPage();
      const errors = [];
      page.on("pageerror", (e) => errors.push(e.message));
      page.setDefaultTimeout(10000);
      const run = {
        engine,
        version: browser.version(),
        width,
        height,
        errors,
        states: [],
      };
      result.push(run);
      try {
        await page.goto(url, { waitUntil: "networkidle" });
        run.states.push(await metric(page, "setup"));
        await page.screenshot({
          path: path.join(
            destination,
            `${engine}-${width}x${height}-setup.png`,
          ),
          fullPage: true,
        });
        await page.locator(".setup-start, .start-draft-button").click();
        run.states.push(await metric(page, "first-team"));
        await page.locator(".first-prompt-options button").first().click();
        await page.locator(".pokemon-card").first().waitFor();
        await page.evaluate(() => document.fonts.ready);
        run.states.push(await metric(page, "draft"));
        await page.screenshot({
          path: path.join(
            destination,
            `${engine}-${width}x${height}-draft.png`,
          ),
          fullPage: true,
        });
        for (let i = 0; i < 16; i++) {
          const rosterTab = page.locator(".compact-view-tabs button.roster");
          if ((await rosterTab.count()) && (await rosterTab.isVisible()))
            await rosterTab.click();
          await page.locator(".pokemon-card:not(:disabled)").first().click();
          if (i === 0) run.states.push(await metric(page, "selected"));
          await page.locator(".decision-main > .confirm-button").click();
        }
        await page.locator(".app.draft-complete").waitFor();
        run.states.push(await metric(page, "completed"));
        await page.screenshot({
          path: path.join(
            destination,
            `${engine}-${width}x${height}-completed.png`,
          ),
          fullPage: true,
        });
        await page
          .getByRole("button", { name: "1つ戻す", exact: true })
          .click();
        await page.locator(".pokemon-card:not(:disabled)").first().waitFor();
        run.states.push(await metric(page, "undo"));
        await page
          .getByRole("button", { name: "1つ進む", exact: true })
          .click();
        await page.locator(".app.draft-complete").waitFor();
        run.states.push(await metric(page, "redo"));
        await page.locator(".decision-main > .confirm-button").click();
        run.states.push(await metric(page, "next-game-dialog"));
        await page.getByRole("button", { name: "閉じる", exact: true }).click();
        await page
          .getByRole("button", { name: "試合履歴・画像保存", exact: true })
          .click();
        run.states.push(await metric(page, "history-dialog"));
        await page.screenshot({
          path: path.join(
            destination,
            `${engine}-${width}x${height}-history.png`,
          ),
          fullPage: true,
        });
      } catch (e) {
        run.failure = e.message;
      }
      await fs.writeFile(
        path.join(destination, "results.json"),
        JSON.stringify(result, null, 2),
      );
      console.log(
        JSON.stringify({
          engine,
          width,
          height,
          failure: run.failure,
          errors,
          states: run.states.map((s) => ({
            state: s.state,
            overflow: s.horizontalOverflow,
            action: s.action,
            roster: s.roster,
            smallTargets: s.smallTargets.length,
            clippedHorizontal: s.clippedHorizontal.length,
            imageFailures: s.imageFailures.length,
          })),
        }),
      );
      await context.close();
    }
  } catch (e) {
    result.push({ engine, failure: e.message });
    console.error(engine, e.message);
  } finally {
    await browser?.close();
  }
}
await fs.writeFile(
  path.join(destination, "results.json"),
  JSON.stringify(result, null, 2),
);
if (
  result.some(
    (r) =>
      r.failure ||
      r.errors?.length ||
      r.states?.some((s) => s.horizontalOverflow || s.imageFailures.length),
  )
)
  process.exitCode = 1;
