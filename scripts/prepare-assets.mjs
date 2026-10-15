import fs from "node:fs/promises";
import sharp from "sharp";
// Pass the date on which the official roster and release news were verified.
// Never silently reuse roster-source.html: that archived file predates new releases.
const snapshot = process.argv[2];
if (!snapshot || !/^\d{4}-\d{2}-\d{2}$/.test(snapshot))
  throw Error("Usage: node scripts/prepare-assets.mjs YYYY-MM-DD");
const source = "https://www.pokemonunite.jp/ja/pokemon/";
const response = await fetch(source);
if (!response.ok) throw Error(`Official roster: ${response.status}`);
const html = await response.text();
const matches = [
  ...html.matchAll(/<li class="card-border ([^"]+)">([\s\S]*?)<\/li>/g),
];
// Saved drafts use the original ID, even after the official URL typo was fixed.
const legacyIds = { inteleon: "iinteleon" };
const roster = matches.map(([, role, block], index) => {
  const name = block.match(/class="name-text">([^<]+)/)?.[1];
  const source = block.match(/<img[^>]+src="([^"]+)"/)?.[1];
  const detail = block.match(/<a href="([^"]+)"/)?.[1];
  const officialId = detail?.split("/").filter(Boolean).at(-1);
  const id = legacyIds[officialId] ?? officialId;
  if (!name || !source || !id) throw Error("Invalid official roster entry");
  return {
    id,
    name,
    role,
    order: index + 1,
    image: `/pokemon/${id}.webp`,
    source,
    detail,
  };
});
if (
  roster.length < 90 ||
  new Set(roster.map((p) => p.id)).size !== roster.length
)
  throw Error("Unexpected roster");
await fs.mkdir("public/pokemon", { recursive: true });
await fs.mkdir("src/data", { recursive: true });
let inputBytes = 0,
  outputBytes = 0,
  cursor = 0;
await Promise.all(
  Array.from({ length: 6 }, async () => {
    while (cursor < roster.length) {
      const p = roster[cursor++];
      const res = await fetch(p.source, { headers: { Referer: source } });
      if (!res.ok) throw Error(`${p.id}: ${res.status}`);
      const buf = Buffer.from(await res.arrayBuffer());
      inputBytes += buf.length;
      const out = await sharp(buf)
        .resize(208, 208)
        .webp({ quality: 78, effort: 6 })
        .toBuffer();
      outputBytes += out.length;
      await fs.writeFile(`public${p.image}`, out);
    }
  }),
);
await fs.writeFile(
  "src/data/pokemon.json",
  JSON.stringify(roster, null, 2) + "\n",
);
await fs.writeFile(
  "public/asset-manifest.json",
  JSON.stringify(roster.map((p) => p.image)),
);
for (const size of [192, 512])
  await sharp("public/icon.png")
    .resize(size, size)
    .png()
    .toFile(`public/icon-${size}.png`);
// Keep portrait sizing in sync whenever the roster changes.
await import("./measure-portraits.mjs");
await fs.writeFile(
  "src/data/assets-stats.json",
  JSON.stringify(
    {
      count: roster.length,
      inputBytes,
      outputBytes,
      snapshot,
      source,
    },
    null,
    2,
  ) + "\n",
);
console.log(
  JSON.stringify({
    count: roster.length,
    inputBytes,
    outputBytes,
    saving: ((1 - outputBytes / inputBytes) * 100).toFixed(1) + "%",
  }),
);
