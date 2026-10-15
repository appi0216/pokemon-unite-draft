import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import vm from "node:vm";

const roster = JSON.parse(await fs.readFile("src/data/pokemon.json", "utf8"));

for (const base of ["/", "/pokemon-unite-draft/"])
  test(`offline assets stay inside ${base}`, async () => {
    const listeners = {};
    const stores = new Map();
    let offline = false;
    const key = (request) =>
      new URL(
        typeof request === "string" ? request : request.url,
        "https://draft.test",
      ).pathname;
    const fetchAsset = async (request) => {
      if (offline) throw Error("Network unavailable");
      assert.ok(key(request).startsWith(base));
      const path = "/" + key(request).slice(base.length);
      return new Response(
        await fs.readFile(`dist${path === "/" ? "/index.html" : path}`),
      );
    };
    const caches = {
      keys: async () => [...stores.keys()],
      delete: async (name) => stores.delete(name),
      open: async (name) => {
        if (!stores.has(name)) stores.set(name, new Map());
        const data = stores.get(name);
        return {
          addAll: async (paths) => {
            for (const path of paths)
              data.set(key(path), await fetchAsset(path));
          },
          // Static files can be served with Vary: Origin (e.g. Vite preview).
          // Precache GETs have no Origin; module/script CORS GETs do.
          match: async (request, options) => {
            if (request.mode === "cors" && !options?.ignoreVary)
              return undefined;
            return data.get(key(request))?.clone();
          },
        };
      },
    };
    const messages = [];
    vm.runInNewContext(await fs.readFile("dist/sw.js", "utf8"), {
      caches,
      URL,
      fetch: fetchAsset,
      self: {
        location: {
          origin: "https://draft.test",
          href: `https://draft.test${base}sw.js`,
        },
        addEventListener: (name, handler) => {
          listeners[name] = handler;
        },
        skipWaiting: async () => {},
        clients: {
          claim: async () => {},
          matchAll: async () => [{ postMessage: (m) => messages.push(m) }],
        },
      },
    });
    await new Promise((resolve, reject) =>
      listeners.install({ waitUntil: (p) => p.then(resolve, reject) }),
    );
    await new Promise((resolve, reject) =>
      listeners.activate({ waitUntil: (p) => p.then(resolve, reject) }),
    );
    assert.equal(messages[0].type, "OFFLINE_READY");
    assert.ok([...stores.values()][0].size >= 108);
    offline = true;
    const request = async (url, mode) =>
      new Promise((resolve, reject) =>
        listeners.fetch({
          request: { url, mode, method: "GET" },
          respondWith: (p) => p.then(resolve, reject),
        }),
      );
    const html = await request(`https://draft.test${base}`, "navigate");
    assert.match(await html.text(), /UNITE DRAFT/);
    const image = await request(
      `https://draft.test${base}pokemon/pikachu.webp`,
      "cors",
    );
    assert.ok((await image.arrayBuffer()).byteLength > 100);
    const manifest = await request(
      `https://draft.test${base}asset-manifest.json`,
      "cors",
    );
    assert.deepEqual(
      (await manifest.json()).sort(),
      roster.map((pokemon) => pokemon.image).sort(),
    );
  });
