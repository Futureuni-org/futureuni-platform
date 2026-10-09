/*
 * Generates the PWA icon set from the existing brand mark.
 *
 *   node scripts/pwa/generate-icons.mjs
 *
 * Source: public/brand/futureuni-mark.png (non-square). Each icon centres the mark on a solid
 * brand-navy square (tokens.css `--sidebar` #0c1148). Re-run this if a proper square logo arrives.
 *
 * Outputs (public/icons/):
 *   - icon-192.png, icon-512.png        purpose "any"
 *   - icon-maskable-512.png             purpose "maskable" (extra safe-zone padding)
 *   - apple-touch-icon-180.png          iOS home-screen icon
 */

import { mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import sharp from "sharp";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..", "..");
const source = resolve(root, "public", "brand", "futureuni-mark.png");
const outDir = resolve(root, "public", "icons");

// Brand navy (--sidebar / brand rail), opaque.
const navy = { r: 12, g: 17, b: 72, alpha: 1 };

/**
 * @param {number} size      output square side in px
 * @param {number} logoRatio fraction of the side the mark may occupy (safe zone for maskable)
 * @param {string} outFile   absolute output path
 */
async function makeIcon(size, logoRatio, outFile) {
  const logoBox = Math.round(size * logoRatio);
  const logo = await sharp(source)
    .trim() // drop any uniform border so the mark is truly centred
    .resize(logoBox, logoBox, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();

  await sharp({ create: { width: size, height: size, channels: 4, background: navy } })
    .composite([{ input: logo, gravity: "center" }])
    .png()
    .toFile(outFile);

  console.warn(`wrote ${outFile}`);
}

async function main() {
  await mkdir(outDir, { recursive: true });
  await makeIcon(192, 0.68, resolve(outDir, "icon-192.png"));
  await makeIcon(512, 0.68, resolve(outDir, "icon-512.png"));
  // Maskable icons are cropped to a circle/squircle by the OS; keep the mark inside the 80% safe
  // zone (here ~56%) so nothing important is clipped.
  await makeIcon(512, 0.56, resolve(outDir, "icon-maskable-512.png"));
  await makeIcon(180, 0.68, resolve(outDir, "apple-touch-icon-180.png"));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
