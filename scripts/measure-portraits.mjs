import fs from "node:fs/promises";
import sharp from "sharp";
const roster = JSON.parse(await fs.readFile("src/data/pokemon.json", "utf8"));
const layout = {};
for (const p of roster) {
  const { data, info } = await sharp(`public${p.image}`)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  let left = info.width,
    top = info.height,
    right = 0,
    bottom = 0;
  for (let y = 0; y < info.height; y++)
    for (let x = 0; x < info.width; x++) {
      if (data[(y * info.width + x) * 4 + 3] > 32) {
        left = Math.min(left, x);
        top = Math.min(top, y);
        right = Math.max(right, x);
        bottom = Math.max(bottom, y);
      }
    }
  const scale =
    0.84 /
    Math.max((right - left + 1) / info.width, (bottom - top + 1) / info.height);
  layout[p.id] = {
    width: +(scale * 100).toFixed(3),
    left: +(
      (0.5 - ((left + right + 1) / 2 / info.width) * scale) *
      100
    ).toFixed(3),
    top: +(
      (0.5 - ((top + bottom + 1) / 2 / info.height) * scale) *
      100
    ).toFixed(3),
  };
}
await fs.writeFile(
  "src/data/portrait-layout.json",
  JSON.stringify(layout, null, 2) + "\n",
);
console.log(
  `Measured ${roster.length} portraits; normalized silhouette extent to 84% of its square.`,
);
