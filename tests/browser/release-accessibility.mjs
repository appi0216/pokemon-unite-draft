import { createRequire } from "node:module";
import fs from "node:fs/promises";
import path from "node:path";
const { chromium, webkit } = createRequire(import.meta.url)("playwright");
const base =
  process.env.AUDIT_URL || "http://127.0.0.1:5174/pokemon-unite-draft/";
const out = path.resolve(
  process.env.AUDIT_OUT || ".artifacts/release-accessibility",
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
  try {
    for (const version of ["current", "v2"])
      for (const [width, height] of [
        [320, 568],
        [844, 390],
      ]) {
        const context = await browser.newContext({
          viewport: { width, height },
          hasTouch: true,
          reducedMotion: "reduce",
        });
        const page = await context.newPage();
        const result = {
          engine,
          version,
          width,
          height,
          states: [],
          checks: [],
          errors: [],
        };
        results.push(result);
        page.on("pageerror", (e) => result.errors.push(e.message));
        page.setDefaultTimeout(12000);
        const inspect = async (state, fit = false) => {
          await page.waitForTimeout(200);
          await page.waitForFunction(() =>
            [...document.images].every((i) => {
              const r = i.getBoundingClientRect();
              // Offscreen lazy images need not load until the user scrolls.
              return (
                !r.width ||
                !r.height ||
                r.bottom <= 0 ||
                r.top >= innerHeight ||
                i.complete
              );
            }),
          );
          const metrics = await page.evaluate(() => {
            const visible = (e) =>
              e.getBoundingClientRect().width > 0 &&
              e.getBoundingClientRect().height > 0 &&
              getComputedStyle(e).visibility !== "hidden";
            const name = (e) =>
              e.getAttribute("aria-label") ||
              (e.getAttribute("aria-labelledby") || "")
                .split(/\s+/)
                .map((id) => document.getElementById(id)?.textContent || "")
                .join("")
                .trim() ||
              e.textContent?.trim() ||
              e.getAttribute("title");
            const controls = [
              ...document.querySelectorAll("button,select,input"),
            ].filter(visible);
            const unnamed = controls
              .filter((e) => e.tagName === "BUTTON" && !name(e))
              .map((e) => e.outerHTML.slice(0, 180));
            const small = controls
              .filter((e) => !e.closest(".collection-measure"))
              .flatMap((e) => {
                const r = (
                  e.matches('input[type="checkbox"]')
                    ? e.closest("label") || e
                    : e
                ).getBoundingClientRect();
                return r.width < 43.5 || r.height < 43.5
                  ? [
                      {
                        name: name(e),
                        class: e.className,
                        width: r.width,
                        height: r.height,
                      },
                    ]
                  : [];
              });
            const moving = [...document.querySelectorAll("*")]
              .filter(visible)
              .filter((e) => {
                const s = getComputedStyle(e);
                return (
                  s.animationName !== "none" &&
                  s.animationDuration
                    .split(",")
                    .some((v) => parseFloat(v) > 0.001)
                );
              })
              .map((e) => e.className);
            return {
              unnamed,
              small,
              moving,
              width: innerWidth,
              scrollWidth: document.documentElement.scrollWidth,
              height: innerHeight,
              scrollHeight: document.documentElement.scrollHeight,
            };
          });
          result.states.push({ state, ...metrics });
          assert(!metrics.unnamed.length, `${state}: unnamed controls`);
          assert(
            !metrics.moving.length,
            `${state}: animation ignores reduced motion`,
          );
          assert(
            metrics.scrollWidth <= metrics.width + 1,
            `${state}: horizontal overflow`,
          );
          if (fit)
            assert(
              metrics.scrollHeight <= metrics.height + 1,
              `${state}: document scroll`,
            );
          await page.screenshot({
            path: path.join(
              out,
              `${engine}-${version}-${width}x${height}-${state}.png`,
            ),
            fullPage: true,
          });
        };
        try {
          await page.goto(base + (version === "v2" ? "v2/" : ""), {
            waitUntil: "networkidle",
          });
          await inspect("home");
          await page
            .locator(version === "v2" ? ".begin" : ".setup-start")
            .click();
          await page
            .locator(
              version === "v2"
                ? ".first-choice button"
                : ".first-prompt-options button",
            )
            .first()
            .click();
          await inspect("draft", true);
          const filter = page.getByRole("button", {
            name: version === "v2" ? "絞り込みと並び順" : "絞り込み",
            exact: true,
          });
          await filter.click();
          await inspect("filters");
          const dialog = page.locator("dialog[open]");
          // The native dialog must keep keyboard users inside while it is open.
          for (let i = 0; i < 20; i++) {
            await page.keyboard.press("Tab");
            // Browser chrome may take focus at the end of the native dialog's
            // cycle (reported as body); no background app control may receive it.
            assert(
              await dialog.evaluate(
                (e) =>
                  document.activeElement === document.body ||
                  e.contains(document.activeElement),
              ),
              "focus escaped modal into background control",
            );
          }
          await page.keyboard.press("Escape");
          assert((await dialog.count()) === 0, "Escape did not dismiss modal");
          result.checks.push("modal-focus-Escape");
          await page.keyboard.press("/");
          assert(
            await page
              .getByRole("searchbox")
              .evaluate((e) => e === document.activeElement),
            "search shortcut focus",
          );
          await page.getByRole("searchbox").fill("ピカチュウ");
          const card = page.locator(
            version === "v2" ? ".creature" : ".pokemon-card",
          );
          assert((await card.count()) === 1, "search failed");
          // A short viewport approximates the content space left by a software keyboard.
          // This is deliberately not claimed as a physical OS keyboard test.
          await page.setViewportSize({ width: 390, height: 420 });
          await inspect("short-search");
          await card.first().click();
          await page
            .locator(
              version === "v2" ? ".commit" : ".decision-main > .confirm-button",
            )
            .click();
          await page.setViewportSize({ width, height });
          await page
            .getByRole("button", { name: "検索をクリア", exact: true })
            .click();
          await page.evaluate(() => {
            document.documentElement.style.fontSize = "32px";
          });
          await inspect("text-200");
          result.checks.push(
            "short-viewport-search-confirm",
            "text-200",
            "reduced-motion",
            "control-names",
          );
        } catch (error) {
          result.failure = error.message;
        }
        console.log(
          JSON.stringify({
            engine,
            version,
            width,
            height,
            failure: result.failure,
            small: result.states.flatMap((s) =>
              s.small.map((c) => ({ state: s.state, ...c })),
            ),
            errors: result.errors,
          }),
        );
        await fs.writeFile(
          path.join(out, "results.json"),
          JSON.stringify(results, null, 2),
        );
        await context.close();
      }
  } finally {
    await browser.close();
  }
}
if (results.some((r) => r.failure || r.errors.length)) process.exitCode = 1;
