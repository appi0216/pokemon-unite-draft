import { createRequire } from "node:module";
import fs from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import assert from "node:assert/strict";
const { chromium, webkit } = createRequire(import.meta.url)("playwright");
const root = path.resolve("dist");
const base = "/pokemon-unite-draft/";
const output = path.resolve(process.env.AUDIT_OUT || ".artifacts/pwa-release");
await fs.mkdir(output, { recursive: true });
let disconnected = false,
  blocked = 0,
  release = 1;
const server = http.createServer(async (request, response) => {
  if (disconnected) {
    blocked++;
    request.socket.destroy();
    return;
  }
  const pathname = decodeURIComponent(
    new URL(request.url, "http://localhost").pathname,
  );
  if (!pathname.startsWith(base)) {
    response.writeHead(404).end();
    return;
  }
  const relative = pathname.slice(base.length) || "index.html";
  const file = path.resolve(
    root,
    relative.endsWith("/") ? relative + "index.html" : relative,
  );
  if (!file.startsWith(root + path.sep)) {
    response.writeHead(403).end();
    return;
  }
  try {
    let body = await fs.readFile(file);
    if (release === 2 && path.extname(file) === ".html")
      body = Buffer.from(
        body
          .toString()
          .replace("</head>", '<meta name="audit-release" content="2"></head>'),
      );
    if (release === 2 && file.endsWith("sw.js"))
      body = Buffer.from(
        body
          .toString()
          .replace(
            /const CACHE=PREFIX\+"[^"]+"/,
            'const CACHE=PREFIX+"release-2-audit"',
          ),
      );
    response
      .writeHead(200, {
        "Content-Type":
          {
            ".html": "text/html",
            ".js": "text/javascript",
            ".css": "text/css",
            ".json": "application/json",
            ".webmanifest": "application/manifest+json",
            ".webp": "image/webp",
            ".png": "image/png",
          }[path.extname(file)] || "application/octet-stream",
        Vary: "Origin",
        "Cache-Control": "no-store",
      })
      .end(body);
  } catch {
    response.writeHead(404).end();
  }
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
const results = [];
const syntheticPrompt = (page, outcome) =>
  page.evaluate((outcome) => {
    const event = new Event("beforeinstallprompt", { cancelable: true });
    event.prompt = async () => {
      window.__promptCalls = (window.__promptCalls || 0) + 1;
    };
    event.userChoice = Promise.resolve({ outcome });
    window.dispatchEvent(event);
  }, outcome);
const help = async (page, studio) => {
  await page
    .getByRole("button", {
      name: studio ? "使い方" : "使い方・ルール",
      exact: true,
    })
    .click();
  await page.locator(".pwa-panel").waitFor();
};
const closeHelp = async (page) => {
  await page.keyboard.press("Escape");
  await page.locator(".pwa-panel").waitFor({ state: "hidden" });
};
const ready = async (page) => {
  await page.waitForFunction(() => navigator.serviceWorker.controller);
  await page.waitForFunction(() =>
    document
      .querySelector(".pwa-offline")
      ?.textContent.includes("オフラインで利用できます"),
  );
};
try {
  for (const engineName of (
    process.env.AUDIT_ENGINES || "chromium,webkit"
  ).split(",")) {
    const browser = await { chromium, webkit }[engineName].launch();
    try {
      for (const studio of [false, true]) {
        disconnected = false;
        release = 1;
        blocked = 0;
        const context = await browser.newContext({
          viewport: { width: 390, height: 844 },
          hasTouch: true,
          isMobile: true,
        });
        let page = await context.newPage();
        page.setDefaultTimeout(15000);
        const result = {
          engine: engineName,
          version: browser.version(),
          route: studio ? "v2/" : "",
          checks: [],
          errors: [],
        };
        results.push(result);
        page.on("pageerror", (error) => result.errors.push(error.message));
        const url = origin + base + result.route;
        try {
          await page.goto(url, { waitUntil: "networkidle" });
          await help(page, studio);
          await ready(page);
          if (engineName === "chromium") {
            const cdp = await context.newCDPSession(page);
            const errors = await cdp.send("Page.getInstallabilityErrors");
            assert.deepEqual(errors.installabilityErrors, []);
            result.checks.push("Chromium installability");
          }
          await syntheticPrompt(page, "dismissed");
          await page
            .locator(".pwa-panel")
            .getByRole("button", { name: "アプリを追加" })
            .click();
          assert.equal(
            await page
              .locator(".pwa-panel")
              .getByRole("button", { name: "アプリを追加" })
              .count(),
            0,
          );
          assert.ok(
            !(await page.locator(".pwa-panel").textContent()).includes(
              "アプリを追加しました",
            ),
          );
          await syntheticPrompt(page, "accepted");
          await page
            .locator(".pwa-panel")
            .getByRole("button", { name: "アプリを追加" })
            .click();
          await page
            .getByText(
              "ブラウザーで追加を受け付けました。インストールの完了をお待ちください。",
            )
            .waitFor();
          assert.equal(await page.evaluate(() => window.__promptCalls), 2);
          await page.evaluate(() =>
            window.dispatchEvent(new Event("appinstalled")),
          );
          await page
            .getByText(
              "アプリを追加しました。ホーム画面やアプリ一覧から開けます。",
            )
            .waitFor();
          result.checks.push(
            "install dismiss, retry, accepted pending, appinstalled",
          );
          await page.evaluate(async () => {
            for (const name of await caches.keys())
              await (
                await caches.open(name)
              ).delete(
                new URL(
                  "pokemon/pikachu.webp",
                  location.origin + "/pokemon-unite-draft/",
                ),
              );
            navigator.serviceWorker.controller.postMessage({
              type: "CHECK_OFFLINE",
            });
          });
          await page
            .getByText("オフライン用データを保存できませんでした", {
              exact: true,
            })
            .waitFor();
          await page
            .locator(".pwa-panel")
            .getByRole("button", { name: "再試行" })
            .click();
          await ready(page);
          result.checks.push("missing-cache status and repair");
          await closeHelp(page);
          await page.locator(studio ? ".begin" : ".setup-start").click();
          await page
            .locator(
              studio ? ".first-choice button" : ".first-prompt-options button",
            )
            .first()
            .click();
          await page
            .locator(
              studio
                ? ".creature:not(:disabled)"
                : ".pokemon-card:not(:disabled)",
            )
            .first()
            .click();
          await page
            .locator(studio ? ".commit" : ".decision-main > .confirm-button")
            .click();
          const storage = studio ? "unite-draft.studio.v2" : "unite-draft.v1";
          await page.waitForFunction(
            (key) =>
              JSON.parse(localStorage.getItem(key))?.draft.actions.length === 1,
            storage,
          );
          const saved = await page.evaluate(
            (key) => localStorage.getItem(key),
            storage,
          );
          disconnected = true;
          // Prove the server is unavailable, independently of browser offline APIs.
          assert.equal(
            await page.evaluate(async () => {
              try {
                return (await fetch("network-probe", { cache: "no-store" })).ok;
              } catch {
                return false;
              }
            }),
            false,
          );
          await page.reload({ waitUntil: "networkidle" });
          await page
            .locator(studio ? ".creature" : ".pokemon-card")
            .first()
            .waitFor();
          await page.waitForFunction(() =>
            [...document.images].every((image) => image.complete),
          );
          assert.equal(
            await page.evaluate((key) => localStorage.getItem(key), storage),
            saved,
          );
          assert.deepEqual(
            await page.evaluate(() =>
              [...document.images]
                .filter((image) => !image.naturalWidth)
                .map((image) => image.src),
            ),
            [],
          );
          assert.ok(blocked > 0);
          result.checks.push(
            "actual network disconnect, offline reload, images, draft restoration",
          );
          disconnected = false;
          release = 2;
          await page.evaluate(async () =>
            (await navigator.serviceWorker.getRegistration()).update(),
          );
          await page.waitForFunction(async () =>
            Boolean((await navigator.serviceWorker.getRegistration())?.waiting),
          );
          await help(page, studio);
          await page.getByText("更新があります。", { exact: false }).waitFor();
          assert.equal(
            await page.locator('meta[name="audit-release"]').count(),
            0,
          );
          await page.reload({ waitUntil: "networkidle" });
          assert.equal(
            await page.locator('meta[name="audit-release"]').count(),
            0,
            "pending release must not mix HTML/assets into active app",
          );
          assert.equal(
            await page.evaluate((key) => localStorage.getItem(key), storage),
            saved,
          );
          await page.close();
          page = await context.newPage();
          await page.goto(url, { waitUntil: "networkidle" });
          await page.waitForFunction(
            () =>
              document.querySelector('meta[name="audit-release"]')?.content ===
              "2",
          );
          assert.equal(
            await page.evaluate((key) => localStorage.getItem(key), storage),
            saved,
          );
          result.checks.push(
            "update waits without reloading; consistent release after all windows close",
          );
          assert.deepEqual(result.errors, []);
        } catch (error) {
          result.failure = error.stack;
        }
        await context.close();
        console.log(JSON.stringify(result));
      }
      disconnected = false;
      release = 1;
      for (const profile of [
        {
          name: "iPhone guidance",
          ua: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1",
          platform: "iPhone",
          expected: "ホーム画面に追加",
        },
        {
          name: "iPad desktop UA guidance",
          ua: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15) AppleWebKit/605.1.15 Version/18.0 Safari/605.1.15",
          platform: "MacIntel",
          expected: "ホーム画面に追加",
        },
        {
          name: "Mac guidance",
          ua: "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/605.1.15 Version/17.0 Safari/605.1.15",
          platform: "MacIntel",
          expected: "Dockに追加",
          touch: 0,
        },
        {
          name: "Android guidance",
          ua: "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/128.0.0.0 Mobile Safari/537.36",
          platform: "Linux armv8l",
          expected: "ホーム画面に追加",
        },
        {
          name: "standalone guidance",
          ua: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1",
          platform: "iPhone",
          expected: "アプリで起動しています",
          standalone: true,
        },
      ]) {
        const context = await browser.newContext({
          viewport: { width: 390, height: 844 },
          userAgent: profile.ua,
        });
        await context.addInitScript((profile) => {
          Object.defineProperty(navigator, "platform", {
            get: () => profile.platform,
          });
          Object.defineProperty(navigator, "maxTouchPoints", {
            get: () => profile.touch ?? 5,
          });
          Object.defineProperty(navigator, "standalone", {
            get: () => profile.standalone ?? false,
          });
          window.addEventListener("beforeinstallprompt", (event) =>
            event.stopImmediatePropagation(),
          );
        }, profile);
        const page = await context.newPage();
        const result = { engine: engineName, profile: profile.name };
        results.push(result);
        try {
          await page.goto(origin + base + "v2/");
          await help(page, true);
          assert.ok(
            (await page.locator(".pwa-panel").textContent()).includes(
              profile.expected,
            ),
          );
          result.passed = true;
        } catch (error) {
          result.failure = error.stack;
        }
        await context.close();
        console.log(JSON.stringify(result));
      }
    } finally {
      await browser.close();
    }
  }
} finally {
  server.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
}
await fs.writeFile(
  path.join(output, "results.json"),
  JSON.stringify(results, null, 2),
);
if (results.some((result) => result.failure)) process.exitCode = 1;
