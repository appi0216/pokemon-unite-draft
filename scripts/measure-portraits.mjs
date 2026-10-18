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
  let area = 0;
  for (let y = 0; y < info.height; y++)
    for (let x = 0; x < info.width; x++) {
      if (data[(y * info.width + x) * 4 + 3] > 0) {
        area += data[(y * info.width + x) * 4 + 3] / 255;
        left = Math.min(left, x);
        top = Math.min(top, y);
        right = Math.max(right, x);
        bottom = Math.max(bottom, y);
      }
    }
  const widthRatio = (right - left + 1) / info.width;
  const heightRatio = (bottom - top + 1) / info.height;
  // Optical sizing must never crop wings, tails or antialiased edge pixels.
  // Constrain both axes, leaving a 2% safety margin on every side.
  const scale = Math.max(
    0.84 / Math.max(widthRatio, heightRatio),
    Math.min(Math.sqrt(0.48 / (area / (info.width * info.height))),
      0.96 / heightRatio, 0.96 / widthRatio),
  );
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
  `Measured ${roster.length} portraits; normalized optical area with safe framing on all four sides.`,
);
