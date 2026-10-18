import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import sharp from "sharp";

const readJson = async (path) =>
  JSON.parse(await fs.readFile(new URL(path, import.meta.url), "utf8"));
const roster = await readJson("../src/data/pokemon.json");
const manifest = await readJson("../public/asset-manifest.json");
const layout = await readJson("../src/data/portrait-layout.json");
const stats = await readJson("../src/data/assets-stats.json");

test("the verified 2026-10-15 official roster has all 102 selectable entries", () => {
  assert.equal(stats.snapshot, "2026-10-15");
  assert.equal(roster.length, 102);
  assert.equal(stats.count, roster.length);
  assert.equal(new Set(roster.map((p) => p.id)).size, roster.length);
  // This ID already appears in saved drafts; the official URL correction must not rename it.
  assert.ok(roster.some((p) => p.id === "iinteleon"));
  assert.ok(!roster.some((p) => p.id === "inteleon"));
  const validRoles = new Set([
    "attack",
    "balance",
    "defense",
    "speed",
    "support",
  ]);
  for (const [index, p] of roster.entries()) {
    assert.equal(p.order, index + 1, p.id);
    assert.ok(validRoles.has(p.role), p.id);
    assert.equal(p.image, `/pokemon/${p.id}.webp`);
    assert.equal(new URL(p.source).hostname, "www.pokemonunite.jp");
    assert.equal(new URL(p.detail).hostname, "www.pokemonunite.jp");
  }
  assert.deepEqual(
    roster.slice(-3).map(({ id, name, role }) => ({ id, name, role })),
    [
      { id: "toxtricity", name: "ストリンダー", role: "attack" },
      { id: "jolteon", name: "サンダース", role: "speed" },
      { id: "flareon", name: "ブースター", role: "balance" },
    ],
  );
});

test("every portrait is included in the offline cache and has a normalized layout", () => {
  assert.deepEqual([...manifest].sort(), roster.map((p) => p.image).sort());
  assert.deepEqual(Object.keys(layout).sort(), roster.map((p) => p.id).sort());
  for (const p of roster) {
    const portrait = layout[p.id];
    for (const field of ["width", "left", "top"])
      assert.ok(Number.isFinite(portrait[field]), `${p.id}: ${field}`);
    assert.ok(portrait.width > 0, p.id);
  }
});

test("all local portraits decode as 208px transparent WebP images", async () => {
  let outputBytes = 0;
  for (const p of roster) {
    const buffer = await fs.readFile(
      new URL(`../public${p.image}`, import.meta.url),
    );
    const metadata = await sharp(buffer).metadata();
    assert.equal(metadata.format, "webp", p.id);
    assert.equal(metadata.width, 208, p.id);
    assert.equal(metadata.height, 208, p.id);
    assert.equal(metadata.hasAlpha, true, p.id);
    outputBytes += buffer.length;
  }
  assert.equal(stats.outputBytes, outputBytes);
});

test("optical portraits preserve vertical silhouettes and enlarge wide Reshiram", async () => {
  assert.ok(layout.reshiram.width > 125);
  for (const p of roster) {
    const {data,info} = await sharp(new URL(`../public${p.image}`,import.meta.url).pathname.replace(/^\/([A-Za-z]:)/,'$1')).ensureAlpha().raw().toBuffer({resolveWithObject:true});
    let top=info.height, bottom=0;
    for(let y=0;y<info.height;y++) for(let x=0;x<info.width;x++) {
      if(data[(y*info.width+x)*4+3]>32) { top=Math.min(top,y); bottom=Math.max(bottom,y+1); }
    }
    const box=layout[p.id];
    assert.ok(box.top + top/info.height*box.width >= 1.9, `${p.id}: top cropped`);
    assert.ok(box.top + bottom/info.height*box.width <= 98.1, `${p.id}: bottom cropped`);
  }
});
