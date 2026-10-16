import fs from "node:fs/promises";
import sharp from "sharp";

const source = await fs.readFile("public/icon.svg", "utf8");
const core = source.replace(/<svg[^>]*>/, "").replace(/<\/svg>\s*$/, "");
const root = `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512"><rect width="512" height="512" fill="#403b54"/><g transform="translate(51.2 51.2) scale(6.4)">${core}</g></svg>`;
// Original two-panel symbol, distinct from the current version. All meaningful
// strokes fit the central 40%-radius maskable safe circle; backgrounds are opaque.
const studio = `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512"><rect width="512" height="512" fill="#f5f6fa"/><rect x="132" y="132" width="248" height="248" rx="42" fill="#1764c0"/><path d="M132 220h248M256 220v160" fill="none" stroke="#fff" stroke-width="18"/><circle cx="170" cy="175" r="9" fill="#fff"/><circle cx="202" cy="175" r="9" fill="#fff"/></svg>`;
for (const [folder, svg] of [
  ["public", root],
  ["public/v2", studio],
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
