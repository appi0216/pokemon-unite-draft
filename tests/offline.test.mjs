import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import vm from "node:vm";
import sharp from "sharp";
import { createOfflineBundle } from "../scripts/build-offline.mjs";

const roster = JSON.parse(await fs.readFile("src/data/pokemon.json", "utf8"));
const source = await fs.readFile("dist/sw.js", "utf8");
function environment(base) {
  const listeners = {},
    stores = new Map(),
    messages = [];
  let offline = false,
    brokenCache = false,
    forcedActivation = false;
  const key = (request) =>
    new URL(
      typeof request === "string" ? request : request.url,
      "https://draft.test",
    ).pathname;
  const fetchAsset = async (request) => {
    if (offline) throw Error("Network unavailable");
    assert.ok(key(request).startsWith(base));
    const file = "/" + key(request).slice(base.length);
    return new Response(
      await fs.readFile(`dist${file === "/" ? "/index.html" : file}`),
    );
  };
  const caches = {
    keys: async () => [...stores.keys()],
    delete: async (name) => stores.delete(name),
    open: async (name) => {
      if (brokenCache) throw Error("Storage unavailable");
      if (!stores.has(name)) stores.set(name, new Map());
      const data = stores.get(name);
      return {
        addAll: async (requests) => {
          const fetched = await Promise.all(
            requests.map(async (request) => [
              key(request),
              await fetchAsset(request),
            ]),
          );
          fetched.forEach(([url, response]) => data.set(url, response));
        },
        keys: async () =>
          [...data.keys()].map(
            (url) => new Request("https://draft.test" + url),
          ),
        match: async (request, options) =>
          request.mode === "cors" && !options?.ignoreVary
            ? undefined
            : data.get(key(request))?.clone(),
      };
    },
  };
  vm.runInNewContext(source, {
    caches,
    URL,
    Request,
    fetch: fetchAsset,
    self: {
      location: {
        origin: "https://draft.test",
        href: `https://draft.test${base}sw.js`,
      },
      addEventListener: (name, handler) => {
        listeners[name] = handler;
      },
      skipWaiting: async () => {
        forcedActivation = true;
      },
      clients: {
        claim: async () => {},
        matchAll: async () => [
          { postMessage: (message) => messages.push(message) },
        ],
      },
    },
  });
  const lifecycle = (type, data) =>
    new Promise((resolve, reject) =>
      listeners[type]({
        data,
        source: { postMessage: (message) => messages.push(message) },
        waitUntil: (promise) => promise.then(resolve, reject),
      }),
    );
  const request = (url, mode = "cors") =>
    new Promise((resolve, reject) =>
      listeners.fetch({
        request: {
          url: "https://draft.test" + base + url,
          mode,
          method: "GET",
        },
        respondWith: (promise) => promise.then(resolve, reject),
      }),
    );
  return {
    stores,
    messages,
    lifecycle,
    request,
    setOffline: (value) => {
      offline = value;
    },
    breakCache: () => {
      brokenCache = true;
    },
    forced: () => forcedActivation,
  };
}

for (const base of ["/", "/pokemon-unite-draft/"]) {
  test(`complete cache serves both versions offline at ${base}`, async () => {
    const env = environment(base);
    await env.lifecycle("install");
    assert.equal(
      env.forced(),
      false,
      "updates must never activate over an open draft",
    );
    await env.lifecycle("activate");
    assert.equal(env.messages.at(-1).type, "OFFLINE_READY");
    assert.ok([...env.stores.values()][0].size >= 115);
    env.setOffline(true);
    assert.match(
      await (await env.request("", "navigate")).text(),
      /UNITE DRAFT/,
    );
    assert.match(
      await (await env.request("v2/", "navigate")).text(),
      /Draft 02/,
    );
    assert.match(
      await (await env.request("v2", "navigate")).text(),
      /Draft 02/,
    );
    assert.ok(
      (await (await env.request("pokemon/pikachu.webp")).arrayBuffer())
        .byteLength > 100,
    );
    assert.deepEqual(
      (await (await env.request("asset-manifest.json")).json()).sort(),
      roster.map((pokemon) => pokemon.image).sort(),
    );
    for (const route of [
      "manifest.webmanifest",
      "v2/manifest.webmanifest",
      "apple-touch-icon.png",
      "v2/icon-maskable-512.png",
    ])
      assert.ok((await env.request(route)).ok);
  });
}
test("missing cached data is reported and can be repaired without clearing draft storage", async () => {
  const env = environment("/pokemon-unite-draft/");
  await env.lifecycle("install");
  await env.lifecycle("activate");
  const cache = [...env.stores.values()][0];
  cache.delete("/pokemon-unite-draft/pokemon/pikachu.webp");
  await env.lifecycle("message", { type: "CHECK_OFFLINE" });
  assert.equal(env.messages.at(-1).type, "OFFLINE_UNAVAILABLE");
  env.setOffline(true);
  await env.lifecycle("message", { type: "REPAIR_OFFLINE" });
  assert.equal(env.messages.at(-1).type, "OFFLINE_UNAVAILABLE");
  env.setOffline(false);
  await env.lifecycle("message", { type: "REPAIR_OFFLINE" });
  assert.equal(env.messages.at(-1).type, "OFFLINE_READY");
  env.breakCache();
  await env.lifecycle("message", { type: "CHECK_OFFLINE" });
  assert.equal(env.messages.at(-1).type, "OFFLINE_UNAVAILABLE");
});
test("failed precache does not activate or delete previous releases", async () => {
  const env = environment("/");
  env.stores.set(
    "unite-draft-%2F-previous",
    new Map([["/index.html", new Response("previous")]]),
  );
  env.setOffline(true);
  await assert.rejects(env.lifecycle("install"), /Network unavailable/);
  assert.equal(env.forced(), false);
  assert.ok(env.stores.has("unite-draft-%2F-previous"));
});
test("image-only releases invalidate the cache and generated sw does not hash itself", async () => {
  const root = path.resolve("tests");
  const directory = await fs.mkdtemp(path.join(root, ".offline-hash-"));
  try {
    await fs.writeFile(path.join(directory, "index.html"), "unchanged HTML");
    await fs.writeFile(path.join(directory, "icon.png"), "image one");
    const a = await createOfflineBundle(directory);
    await fs.writeFile(path.join(directory, "sw.js"), a.source);
    assert.equal((await createOfflineBundle(directory)).version, a.version);
    await fs.writeFile(path.join(directory, "icon.png"), "image two");
    assert.notEqual((await createOfflineBundle(directory)).version, a.version);
  } finally {
    assert.ok(directory.startsWith(root + path.sep));
    await fs.rm(directory, { recursive: true, force: true });
  }
});
test("both manifests have independent identity, unrestricted orientation and opaque safe icons", async () => {
  const ids = [];
  for (const folder of ["public", "public/v2"]) {
    const manifest = JSON.parse(
      await fs.readFile(`${folder}/manifest.webmanifest`, "utf8"),
    );
    ids.push(
      new URL(manifest.id, `https://draft.test/${folder}/manifest.webmanifest`)
        .href,
    );
    assert.equal(manifest.display, "standalone");
    assert.equal(manifest.orientation, undefined);
    assert.ok(
      manifest.icons.some(
        (icon) => icon.sizes === "192x192" && icon.purpose === "any",
      ),
    );
    const mask = manifest.icons.find((icon) => icon.purpose === "maskable");
    assert.ok(mask);
    const metadata = await sharp(`${folder}/${mask.src}`).metadata();
    assert.equal(metadata.width, 512);
    assert.equal(metadata.height, 512);
    const { data, info } = await sharp(`${folder}/${mask.src}`)
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    for (let i = 3; i < data.length; i += info.channels)
      assert.equal(data[i], 255, "maskable background must be opaque");
    const apple = await sharp(`${folder}/apple-touch-icon.png`).metadata();
    assert.equal(apple.width, 180);
  }
  assert.notEqual(ids[0], ids[1]);
});
