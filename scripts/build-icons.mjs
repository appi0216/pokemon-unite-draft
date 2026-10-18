import fs from "node:fs/promises";
import sharp from "sharp";

const source = await fs.readFile("public/icon.svg", "utf8");
const core = source.replace(/<svg[^>]*>/, "").replace(/<\/svg>\s*$/, "");
const root = `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512"><rect width="512" height="512" fill="#403b54"/><g transform="translate(51.2 51.2) scale(6.4)">${core}</g></svg>`;
for (const [folder, svg] of [
  ["public", root],

]) {
  for (const [file, size] of [
    ["icon-192.png", 192],
    ["icon-512.png", 512],
    ["icon-maskable-512.png", 512],
    ["apple-touch-icon.png", 180],
  ]) {
    await sharp(Buffer.from(svg))
      .resize(size, size)
      .png()
      .toFile(`${folder}/${file}`);
  }
}

