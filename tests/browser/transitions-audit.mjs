import { createRequire } from "node:module";
import fs from "node:fs/promises";
import path from "node:path";
const { chromium, webkit } = createRequire(import.meta.url)("playwright");
const base =
  process.env.AUDIT_URL || "http://127.0.0.1:5174/pokemon-unite-draft/";
const out = process.env.AUDIT_OUT || ".artifacts/transitions";
await fs.mkdir(out, { recursive: true });
const results = [];
for (const name of (process.env.AUDIT_ENGINES || "chromium,webkit").split(
  ",",
)) {
  const browser = await { chromium, webkit }[name].launch();
  for (const [width, height] of JSON.parse(
    process.env.AUDIT_SIZES || "[[320,568],[667,375],[1280,800]]",
  ))
    for (const v2 of (process.env.AUDIT_VERSIONS || "current")
      .split(",")
      .map((v) => v === "v2")) {
      const context = await browser.newContext({
        viewport: { width, height },
        reducedMotion: "reduce",
        hasTouch: width < 1000,
      });
      const page = await context.newPage();
      page.setDefaultTimeout(12000);
      const run = {
        engine: name,
        version: v2 ? "v2" : "current",
        width,
        height,
        states: [],
        errors: [],
      };
      results.push(run);
      page.on("pageerror", (e) => run.errors.push(e.message));
      const key = v2 ? "unite-draft.studio.v2" : "unite-draft.v1";
      const read = () =>
        page.evaluate((k) => JSON.parse(localStorage.getItem(k)), key);
      const capture = async (label) => {
        await page.waitForTimeout(120);
        await page.waitForFunction(() =>
          [...document.images].every((i) => {
            const r = i.getBoundingClientRect();
            return (
              !r.width ||
              !r.height ||
              r.top >= innerHeight ||
              r.bottom <= 0 ||
              i.complete
            );
          }),
        );
        const m = await page.evaluate(() => {
          const root = document.querySelector("dialog[open]") || document;
          const visible = (e) => {
            const r = e.getBoundingClientRect();
            return (
              r.width > 0 &&
              r.height > 0 &&
              getComputedStyle(e).visibility !== "hidden"
            );
          };
          const label = (e) =>
            e.getAttribute("aria-label") || e.textContent.trim().slice(0, 55);
          const icons = [
            ...root.querySelectorAll(
              "button svg,.search-field > svg,.search > svg",
            ),
          ]
            .filter(visible)
            .map((e) => {
              const parent = e.closest("button") || e.parentElement;
              const r = e.getBoundingClientRect(),
                b = parent.getBoundingClientRect();
              return {
                name: label(parent),
                w: r.width,
                h: r.height,
                clipped:
                  r.left < b.left - 1 ||
                  r.right > b.right + 1 ||
                  r.top < b.top - 1 ||
                  r.bottom > b.bottom + 1,
              };
            });
          const buttons = [...root.querySelectorAll("button,.import-backup")]
            .filter(visible)
            .map((e) => {
              const r = e.getBoundingClientRect(),
                c = getComputedStyle(e);
              return {
                name: label(e),
                w: r.width,
                h: r.height,
                background: c.backgroundColor,
                color: c.color,
                clipped: e.scrollWidth > e.clientWidth + 2,
              };
            });
          const d = document.querySelector("dialog[open]");
          const overlap = [];
          if (!d) {
            const bar = document.querySelector(".decision-bar,.command-bar");
            if (bar && visible(bar)) {
              const bounds = bar.getBoundingClientRect();
              for (const button of bar.querySelectorAll("button")) {
                if (!visible(button)) continue;
                const r = button.getBoundingClientRect();
                if (r.top < bounds.top - 2 || r.bottom > bounds.bottom + 2)
                  overlap.push(["control outside action bar", label(button)]);
              }
            }
          }
          if (!d)
            for (const group of [
              [".selection-panel", ".decision-bar"],
              [".collection", ".command-bar"],
              [".appbar", ".workspace"],
            ]) {
              const elements = group.map((s) => document.querySelector(s));
              if (elements.every((e) => e && visible(e))) {
                const [a, b] = elements.map((e) => e.getBoundingClientRect());
                if (
                  Math.min(a.right, b.right) - Math.max(a.left, b.left) > 2 &&
                  Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 2
                )
                  overlap.push(group);
              }
            }
          return {
            overlap,
            overflow: document.documentElement.scrollWidth > innerWidth + 1,
            dialogOverflow: !!d && d.scrollWidth > d.clientWidth + 2,
            bodyHeight: document.documentElement.scrollHeight,
            icons,
            buttons,
            broken: [...root.querySelectorAll("img")].filter(
              (i) => visible(i) && i.complete && !i.naturalWidth,
            ).length,
          };
        });
        run.states.push({ label, ...m });
        await page.screenshot({
          path: path.join(out, `${name}-${run.version}-${width}-${label}.png`),
          fullPage: true,
        });
        const d = page.locator("dialog[open]");
        if (await d.count()) {
          await d.evaluate((e) => (e.scrollTop = e.scrollHeight));
          await page.screenshot({
            path: path.join(
              out,
              `${name}-${run.version}-${width}-${label}-bottom.png`,
            ),
            fullPage: true,
          });
          await d.evaluate((e) => (e.scrollTop = 0));
        }
      };
      const close = async () => {
        await page
          .locator("dialog[open]")
          .getByRole("button", { name: "閉じる", exact: true })
          .click();
      };
      const modal = async (label) => {
        await capture(label);
        if (v2) {
          await page.emulateMedia({ colorScheme: "dark" });
          await capture(label + "-dark");
          await page.emulateMedia({ colorScheme: "light" });
        }
        if (width === 320) {
          await page.evaluate(
            () => (document.documentElement.style.fontSize = "32px"),
          );
          await capture(label + "-text200");
          await page.evaluate(
            () => (document.documentElement.style.fontSize = ""),
          );
        }
      };
      const pick = async () => {
        const tab = page.locator(
          v2 ? ".pane-tabs button:first-child" : ".compact-view-tabs .roster",
        );
        if (await tab.isVisible()) await tab.click();
        await page
          .locator(
            v2 ? ".creature:not(:disabled)" : ".pokemon-card:not(:disabled):not(.skip-card)",
          )
          .first()
          .click();
        await page
          .locator(v2 ? ".commit" : ".decision-bar .confirm-button")
          .click();
      };
      try {
        await page.goto(base + (v2 ? "v2/" : ""), { waitUntil: "networkidle" });
        await capture("setup");
        await page
          .getByRole("button", {
            name: v2 ? "使い方" : "使い方・ルール",
            exact: true,
          })
          .click();
        await modal("help");
        await close();
        if (v2) {
          await page
            .getByRole("button", { name: "チーム名", exact: true })
            .click();
          await modal("names");
          await close();
        } else {
          await page
            .locator(".setup-disclosure")
            .first()
            .locator("summary")
            .click();
          await capture("names");
          await page
            .locator(".setup-disclosure")
            .first()
            .locator("summary")
            .click();
          await page.locator(".setup-rules summary").click();
          await capture("rules");
          await page.locator(".setup-rules summary").click();
          await page
            .getByRole("button", {
              name: "その他の設定：プリセット・大会制限",
            })
            .click();
          await page
            .getByRole("button", { name: "左チームを保存", exact: true })
            .click();
          await modal("tools");
          const restrictionNames = await page.locator('.restriction-list label').allTextContents();
          if (restrictionNames.slice(0, 3).map(s => s.trim()).join(',') !== 'ブースター,サンダース,ストリンダー')
            throw new Error('Tournament restrictions must be newest first');
          await close();
        }
        await page
          .getByRole("button", { name: /^オールスター/ })
          .click();
        await page.locator(v2 ? ".begin" : ".setup-start").click();
        await modal("first-team");
        await page
          .locator(v2 ? ".first-choice button" : ".first-prompt-options button")
          .first()
          .click();
        await capture("draft");
        if (!v2) {
          await page.getByRole("button", { name: "ポケモンの並び順" }).click();
          await capture("sort-menu");
          await page
            .getByRole("option", { name: "名前順", exact: true })
            .click();
        }
        await page
          .getByRole("button", {
            name: v2 ? "絞り込みと並び順" : "絞り込み",
            exact: true,
          })
          .click();
        await modal("filters");
        await close();
        await page.getByRole("searchbox").fill("存在しないポケモン");
        await capture("empty-search");
        const emptyHeight = await page.evaluate(
          () => document.documentElement.scrollHeight,
        );
        await page.waitForTimeout(500);
        if (
          (await page.evaluate(() => document.documentElement.scrollHeight)) >
          emptyHeight + 2
        )
          throw Error("Empty search grows indefinitely");
        if (emptyHeight > height + 2)
          throw Error("Empty search pushes actions outside viewport");
        await page.getByRole("searchbox").fill("");
        await pick();
        if (v2) {
          await page
            .getByRole("button", { name: "その他の操作", exact: true })
            .click();
          await modal("actions");
          await page
            .locator("dialog[open]")
            .getByRole("button", { name: "試合履歴", exact: true })
            .click();
          await modal("empty-history");
          await close();
          await page
            .getByRole("button", { name: "その他の操作", exact: true })
            .click();
          await page
            .getByRole("button", { name: "この試合をリセット", exact: true })
            .click();
          await modal("reset");
          await close();
        } else {
          await page
            .getByRole("button", { name: "リセット", exact: true })
            .click();
          await modal("reset");
          await page
            .getByRole("button", { name: "リセットする", exact: true })
            .click();
          await modal("reset-first-team");
          await close();
          await page.locator(".progress-disclosure > summary").click();
          await capture("progress");
          await page.locator(".timeline-step:not(:disabled)").first().click();
          await modal("rewind");
          await close();
          await page.locator(".progress-disclosure > summary").click();
        }
        for (let i = 1; i < 16; i++) await pick();
        await capture("completed");
        const teamTab = page.locator(
          v2 ? ".pane-tabs button:last-child" : ".compact-view-tabs .purple",
        );
        if (await teamTab.isVisible()) await teamTab.click();
        await capture("teams");
        if (v2)
          await page
            .locator(".lineups")
            .getByRole("button", { name: "試合履歴", exact: true })
            .click();
        else
          await page
            .getByRole("button", { name: "試合履歴・画像保存", exact: true })
            .click();
        await modal("history");
        if (width === 1280) {
          const downloadPromise = page.waitForEvent("download");
          await page
            .locator(
              v2 ? "dialog[open] .secondary.wide" : ".past-game-download",
            )
            .first()
            .click();
          const download = await downloadPromise;
          if (await download.failure()) throw Error("Result download failed");
          await download.saveAs(
            path.join(
              out,
              `${name}-${run.version}-result${v2 ? ".json" : ".png"}`,
            ),
          );
        }
        await close();
        await page.locator(v2 ? ".commit" : ".completion-next").click();
        await modal("next-team");
        await page
          .locator(v2 ? ".first-choice button" : ".first-prompt-options button")
          .last()
          .click();
        await capture("next-game");
        await page.emulateMedia({ colorScheme: "dark" });
        await page
          .getByRole("button", {
            name: v2 ? "使い方" : "使い方・ルール",
            exact: true,
          })
          .click();
        await modal("dark-help");
        await close();
        for (let game = 2; game <= 3; game++) {
          for (let i = 0; i < 16; i++) await pick();
          if (game < 3) {
            await page.locator(v2 ? ".commit" : ".completion-next").click();
            await page
              .locator(
                v2 ? ".first-choice button" : ".first-prompt-options button",
              )
              .first()
              .click();
          }
        }
        await capture("series-completed");
        await page.locator(v2 ? ".commit" : ".completion-next").click();
        await capture("resume-home");
        await page.locator(v2 ? ".begin" : ".setup-start").click();
        await modal("replace");
        await close();
      } catch (e) {
        run.failure = e.message;
      }
      console.log(
        JSON.stringify({
          engine: name,
          v2,
          width,
          states: run.states.length,
          failure: run.failure,
          issues: run.states
            .filter(
              (s) =>
                s.overlap.length ||
                s.overflow ||
                s.dialogOverflow ||
                s.broken ||
                s.icons.some((i) => i.clipped || i.w < 8 || i.h < 8) ||
                s.buttons.some((b) => b.clipped),
            )
            .map((s) => s.label),
          errors: run.errors,
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
if (
  results.some(
    (r) =>
      r.failure ||
      r.errors.length ||
      r.states.some(
        (s) =>
          s.overlap.length ||
          s.overflow ||
          s.dialogOverflow ||
          s.broken ||
          s.icons.some((i) => i.clipped || i.w < 8 || i.h < 8) ||
          s.buttons.some((b) => b.clipped),
      ),
  )
)
  process.exitCode = 1;



