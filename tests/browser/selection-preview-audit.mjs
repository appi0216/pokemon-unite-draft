import { createRequire } from "node:module";
import fs from "node:fs/promises";
import path from "node:path";

const { chromium, webkit } = createRequire(import.meta.url)("playwright");
const base =
  process.env.AUDIT_URL || "http://127.0.0.1:5174/pokemon-unite-draft/";
const out = process.env.AUDIT_OUT || ".artifacts/selection-preview";
const sizes = JSON.parse(
  process.env.AUDIT_SIZES ||
    "[[628,828],[768,900],[390,844],[320,568],[1523,800],[1775,900],[667,375]]",
);
await fs.mkdir(out, { recursive: true });
const results = [];

for (const engine of (process.env.AUDIT_ENGINES || "chromium,webkit").split(
  ",",
)) {
  const browser = await { chromium, webkit }[engine].launch();
  for (const [width, height] of sizes) {
    const context = await browser.newContext({
      viewport: { width, height },
      hasTouch: width < 1000,
      reducedMotion: "reduce",
    });
    const page = await context.newPage();
    page.setDefaultTimeout(12000);
    const run = { engine, width, height, states: [], errors: [] };
    results.push(run);
    page.on("pageerror", (error) => run.errors.push(error.message));
    const capture = async (
      label,
      { selection = false, teamSummary = false, expectedPortrait = null } = {},
    ) => {
      await page.waitForTimeout(200);
      await page.waitForFunction(() =>
        [...document.images].every(
          (image) => !image.getBoundingClientRect().width || image.complete,
        ),
      );
      const metrics = await page.evaluate(
        ({ selection, teamSummary, expectedPortrait }) => {
          const rect = (element) => {
            if (!element) return null;
            const { x, y, width, height, top, bottom, left, right } =
              element.getBoundingClientRect();
            return { x, y, width, height, top, bottom, left, right };
          };
          const visible = (element) =>
            !!element &&
            !!element.getClientRects().length &&
            getComputedStyle(element).visibility !== "hidden";
          const inside = (inner, outer, tolerance = 1.5) =>
            inner.left >= outer.left - tolerance &&
            inner.right <= outer.right + tolerance &&
            inner.top >= outer.top - tolerance &&
            inner.bottom <= outer.bottom + tolerance;
          const issues = [];
          const confirmButton = document.querySelector(
            ".decision-main .confirm-button",
          );
          const confirmBox = rect(confirmButton);
          const confirmationCenterOffset = visible(confirmButton)
            ? Math.abs(
                (confirmBox.left + confirmBox.right) / 2 - innerWidth / 2,
              )
            : null;
          if (confirmationCenterOffset !== null && confirmationCenterOffset > 2)
            issues.push(
              `Confirmation button is not at viewport center (${confirmationCenterOffset.toFixed(1)}px offset)`,
            );
          if (
            visible(confirmButton) &&
            (confirmBox.left < -1 || confirmBox.right > innerWidth + 1)
          )
            issues.push("Confirmation button exceeds viewport width");
          const selectionPanel = document.querySelector(".selection-panel");
          if (visible(selectionPanel)) {
            for (const button of selectionPanel.querySelectorAll(
              ".roster-pagination button",
            )) {
              if (
                visible(button) &&
                !inside(rect(button), rect(selectionPanel))
              )
                issues.push("Pagination control clipped by Pokémon panel");
            }
          }
          const tabs = document.querySelector(".compact-view-tabs");
          if (visible(tabs)) {
            const bounds = rect(tabs);
            for (const button of tabs.querySelectorAll("button")) {
              if (visible(button) && !inside(rect(button), bounds))
                issues.push("Team tab outside its navigation container");
            }
            const arena = rect(document.querySelector(".draft-arena"));
            if (
              Math.min(bounds.right, arena.right) >
                Math.max(bounds.left, arena.left) + 1 &&
              Math.min(bounds.bottom, arena.bottom) >
                Math.max(bounds.top, arena.top) + 1
            )
              issues.push("Team navigation overlaps draft panel");
          }
          if (
            expectedPortrait &&
            ![...document.querySelectorAll(expectedPortrait)].some(visible)
          ) {
            issues.push(
              `Expected portrait is absent or hidden: ${expectedPortrait}`,
            );
          }
          const portraits = [
            ...document.querySelectorAll(
              ".ban-slot .portrait,.player-slot .portrait",
            ),
          ]
            .filter(visible)
            .map((portrait) => {
              const slot = portrait.closest(".ban-slot,.player-slot");
              const p = rect(portrait),
                s = rect(slot);
              const contained = inside(p, s);
              if (!contained)
                issues.push(
                  `Portrait outside ${slot.className}: ${portrait.querySelector("img")?.alt}`,
                );
              // Compare the portrait wrapper, not transparent source-image padding.
              // Any clipping ancestor below the slot must also contain this wrapper.
              for (
                let ancestor = portrait.parentElement;
                ancestor && ancestor !== slot;
                ancestor = ancestor.parentElement
              ) {
                const style = getComputedStyle(ancestor);
                if (
                  /(hidden|clip|scroll|auto)/.test(
                    `${style.overflowX} ${style.overflowY}`,
                  ) &&
                  !inside(p, rect(ancestor))
                )
                  issues.push(`Portrait clipped by ${ancestor.className}`);
              }
              return {
                name: portrait.querySelector("img")?.alt,
                slotClass: slot.className,
                portrait: p,
                slot: s,
                contained,
              };
            });
          const teamRows = [...document.querySelectorAll(".team-panel")]
            .filter(visible)
            .map((panel) => {
              const slots = [...panel.querySelectorAll(".player-slot")].filter(
                visible,
              );
              const boxes = slots.map(rect);
              if (
                innerWidth > 1000 &&
                innerHeight >= 800 &&
                parseFloat(
                  getComputedStyle(document.documentElement).fontSize,
                ) <= 16 &&
                boxes.some((box) => !inside(box, rect(panel)))
              )
                issues.push("Desktop team panel clips one of its five rows");
              for (let index = 1; index < boxes.length; index++) {
                if (
                  boxes[index].top < boxes[index - 1].bottom - 1 ||
                  Math.abs(boxes[index].left - boxes[0].left) > 2
                )
                  issues.push(
                    `Team selection slots are not five vertical rows: ${panel.getAttribute("aria-label")}`,
                  );
              }
              for (const slot of slots) {
                const portrait = slot.querySelector(".player-portrait"),
                  info = slot.querySelector(".player-info");
                if (!visible(portrait) || !visible(info)) continue;
                const p = rect(portrait),
                  i = rect(info);
                const phoneLandscape =
                  innerWidth <= 1000 && innerWidth > innerHeight;
                const minimum = phoneLandscape
                  ? 24
                  : innerWidth <= 1000
                    ? 52
                    : 56;
                if (p.width < minimum - 1 || p.height < minimum - 1)
                  issues.push(`Team detail portrait below ${minimum}px`);
                if (
                  i.left < p.right - 1 ||
                  Math.min(i.bottom, p.bottom) <= Math.max(i.top, p.top)
                )
                  issues.push(
                    "Team detail must place name beside the portrait",
                  );
                const role = slot.querySelector(".role-text");
                if (slot.querySelector(".portrait") && !visible(role))
                  issues.push("Selected Pokémon role is hidden in team detail");
              }
              return { team: panel.getAttribute("aria-label"), slots: boxes };
            });
          const playerNames = [
            ...document.querySelectorAll(
              ".player-slot:has(.portrait) .player-name",
            ),
          ]
            .filter(visible)
            .map((name) => {
              const range = document.createRange();
              range.selectNodeContents(name);
              const text = rect(range),
                slot = rect(name.closest(".player-slot"));
              if (!inside(text, slot))
                issues.push(
                  `Player name clipped by its slot: ${name.textContent}`,
                );
              for (
                let ancestor = name;
                ancestor && !ancestor.matches(".player-slot");
                ancestor = ancestor.parentElement
              ) {
                const style = getComputedStyle(ancestor);
                if (
                  /(hidden|clip|scroll|auto)/.test(
                    `${style.overflowX} ${style.overflowY}`,
                  ) &&
                  !inside(text, rect(ancestor))
                )
                  issues.push(
                    `Player name clipped by ${ancestor.className}: ${name.textContent}`,
                  );
              }
              return { name: name.textContent, text, slot };
            });
          const summary = [
            ...document.querySelectorAll(".compact-picks .portrait"),
          ].map((portrait) => {
            const p = rect(portrait),
              shown = visible(portrait);
            const minimum = innerWidth >= 600 ? 32 : 24;
            if (
              teamSummary &&
              (!shown || p.width < minimum - 1 || p.height < minimum - 1)
            )
              issues.push(
                `Compact team portrait too small/hidden: ${portrait.querySelector("img")?.alt} (${p.width}×${p.height})`,
              );
            const tab = portrait.closest("button");
            if (shown && !inside(p, rect(tab)))
              issues.push(
                `Compact portrait outside its team button: ${portrait.querySelector("img")?.alt}`,
              );
            return {
              name: portrait.querySelector("img")?.alt,
              shown,
              box: p,
              minimum,
            };
          });
          let decision = null;
          if (selection) {
            const description = document.querySelector(
              ".decision-main .selected-description",
            );
            const title = description?.querySelector("strong");
            const portrait = description?.querySelector(".portrait");
            const button = document.querySelector(
              ".decision-main .confirm-button",
            );
            const bar = document.querySelector(".decision-bar");
            const range = document.createRange();
            if (title) range.selectNodeContents(title);
            const nameBox = title ? rect(range) : null;
            const buttonBox = rect(button),
              barBox = rect(bar);
            const nameVisible =
              visible(title) && nameBox.width > 0 && nameBox.height > 0;
            if (nameVisible)
              issues.push(
                "Selected Pokémon name should not be rendered at the confirmation boundary",
              );
            if (!visible(portrait))
              issues.push(
                "Selected Pokémon portrait is hidden at the confirmation boundary",
              );
            if (!inside(buttonBox, barBox))
              issues.push("Confirm button outside decision bar");
            if (buttonBox.width < 44 || buttonBox.height < 44)
              issues.push("Confirm touch target below 44px");
            let gap = null;
            if (nameVisible) {
              if (!inside(nameBox, barBox))
                issues.push("Selected Pokémon name outside decision bar");
              const sameRow =
                Math.min(nameBox.bottom, buttonBox.bottom) >
                Math.max(nameBox.top, buttonBox.top);
              gap = sameRow
                ? Math.max(
                    buttonBox.left - nameBox.right,
                    nameBox.left - buttonBox.right,
                    0,
                  )
                : Math.max(
                    buttonBox.top - nameBox.bottom,
                    nameBox.top - buttonBox.bottom,
                    0,
                  );
              // CJK wrapping can leave one glyph's advance unused. Allow
              // that residual plus the 12px group gap at enlarged text,
              // while still detecting the previous 94–401px separation.
              const horizontalLimit = Math.max(
                32,
                parseFloat(getComputedStyle(title).fontSize) + 12,
              );
              if (gap > (sameRow ? horizontalLimit : 16) + 1)
                issues.push(
                  `Selected name too far from confirmation (${gap.toFixed(1)}px ${sameRow ? "horizontal" : "vertical"} gap)`,
                );
              if (
                sameRow &&
                Math.min(nameBox.right, buttonBox.right) >
                  Math.max(nameBox.left, buttonBox.left) + 1
              )
                issues.push("Selected name overlaps confirmation button");
            }
            decision = {
              name: title?.textContent,
              nameVisible,
              nameBox,
              portrait: rect(portrait),
              buttonBox,
              gap,
              barBox,
            };
          }
          if (document.documentElement.scrollWidth > innerWidth + 1)
            issues.push("Horizontal page overflow");
          return {
            portraits,
            teamRows,
            playerNames,
            summary,
            decision,
            issues,
            bodyHeight: document.documentElement.scrollHeight,
            confirmationCenterOffset,
          };
        },
        { selection, teamSummary, expectedPortrait },
      );
      run.states.push({ label, ...metrics });
      await page.screenshot({
        path: path.join(out, `${engine}-${width}x${height}-${label}.png`),
        fullPage: true,
      });
    };
    const roster = async () => {
      const tab = page.locator(".compact-view-tabs .roster");
      if (await tab.isVisible()) await tab.click();
    };
    const activeTeam = async () => {
      const tab = page.locator(
        ".compact-view-tabs button:has(.compact-turn-label)",
      );
      if (await tab.isVisible()) await tab.click();
    };
    const select = async (name) => {
      await roster();
      await page.getByPlaceholder("ポケモンを検索").fill(name);
      await page
        .locator(".pokemon-card:not(:disabled)")
        .filter({ has: page.getByAltText(name, { exact: true }) })
        .first()
        .click();
    };
    const confirm = () => page.locator(".decision-bar .confirm-button").click();
    try {
      await page.goto(base, { waitUntil: "networkidle" });
      await page.locator(".setup-start").click();
      await page.locator(".first-prompt-options button").first().click();
      await select("フシギバナ");
      await capture("ban-preview-roster", { selection: true });
      await activeTeam();
      await capture("ban-preview-team", {
        selection: true,
        expectedPortrait: ".ban-slot.preview .portrait",
      });
      await page.evaluate(
        () => (document.documentElement.style.fontSize = "32px"),
      );
      await capture("ban-preview-text200", {
        selection: true,
        expectedPortrait: ".ban-slot.preview .portrait",
      });
      await page.evaluate(() => (document.documentElement.style.fontSize = ""));
      await confirm();
      const purpleTab = page.locator(".compact-view-tabs .purple");
      if (await purpleTab.isVisible()) await purpleTab.click();
      await capture("ban-committed", {
        expectedPortrait: ".ban-slot.filled .portrait",
      });
      for (const name of [
        "リザードン",
        "カメックス",
        "ピカチュウ",
        "カイリキー",
        "ゲンガー",
      ]) {
        await select(name);
        await confirm();
      }
      await select("アローラキュウコン");
      await capture("long-name-pick-roster", { selection: true });
      await activeTeam();
      await capture("pick-preview-team", {
        selection: true,
        expectedPortrait: ".player-slot.active .portrait",
      });
      await page.evaluate(
        () => (document.documentElement.style.fontSize = "32px"),
      );
      await capture("long-name-pick-text200", {
        selection: true,
        expectedPortrait: ".player-slot.active .portrait",
      });
      await page.evaluate(() => (document.documentElement.style.fontSize = ""));
      await confirm();
      for (const name of ["ブラッキー", "グレイシア"]) {
        await select(name);
        await confirm();
      }
      await roster();
      await page.getByPlaceholder("ポケモンを検索").fill("");
      await capture("committed-team-summary", {
        teamSummary: await page.locator(".compact-view-tabs").isVisible(),
      });
      await page.evaluate(
        () => (document.documentElement.style.fontSize = "32px"),
      );
      await capture("committed-team-summary-text200", {
        teamSummary: await page.locator(".compact-view-tabs").isVisible(),
      });
      await page.evaluate(() => (document.documentElement.style.fontSize = ""));
      for (let index = 9; index < 16; index++) {
        await roster();
        await page.locator(".pokemon-card:not(:disabled)").first().click();
        await confirm();
      }
      await capture("completed");
      await page.evaluate(
        () => (document.documentElement.style.fontSize = "32px"),
      );
      await capture("completed-text200");
    } catch (error) {
      run.errors.push(error.stack || error.message);
      await page
        .screenshot({
          path: path.join(out, `${engine}-${width}x${height}-failure.png`),
          fullPage: true,
        })
        .catch(() => {});
    }
    console.log(
      JSON.stringify({
        engine,
        width,
        height,
        states: run.states.length,
        issues: run.states.flatMap((state) =>
          state.issues.map((issue) => `${state.label}: ${issue}`),
        ),
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
process.exitCode = results.some(
  (run) => run.errors.length || run.states.some((state) => state.issues.length),
)
  ? 1
  : 0;
