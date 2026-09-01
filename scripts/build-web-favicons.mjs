import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const assetsDir = path.join(root, "assets");
const publicDir = path.join(root, "public");
const publicLogoDir = path.join(publicDir, "logo");

const ICON_SRC = path.join(assetsDir, "icon-only.png");

async function generateFavicons() {
  console.log("Generating website favicons from:", ICON_SRC);

  if (!fs.existsSync(ICON_SRC)) {
    throw new Error("Missing source icon: " + ICON_SRC);
  }

  // 1. Generate PNGs of standard sizes
  const sizes = [
    { name: "favicon-16x16.png", size: 16 },
    { name: "favicon-32x32.png", size: 32 },
    { name: "favicon-48x48.png", size: 48 },
    { name: "apple-touch-icon.png", size: 180 },
    { name: "favicon.png", size: 64 },
    { name: "dilmart-store-icon-only.png", size: 512 },
    { name: "DilMart-store-icon-only.png", size: 512 },
  ];

  const pngBuffers = {};

  for (const item of sizes) {
    const outPath = path.join(publicDir, item.name);
    const buf = await sharp(ICON_SRC)
      .resize(item.size, item.size, { fit: "contain" })
      .png()
      .toBuffer();
    
    fs.writeFileSync(outPath, buf);
    pngBuffers[item.size] = buf;
    console.log(`✓ Generated ${item.name} (${item.size}x${item.size})`);
  }

  // Also ensure public/logo directory has the brand icon
  if (fs.existsSync(publicLogoDir)) {
    const logoIconPath = path.join(publicLogoDir, "dilmart-store-icon-only.png");
    const logoIcon2Path = path.join(publicLogoDir, "dilmart-store-icon-only2.png");
    fs.writeFileSync(logoIconPath, pngBuffers[512] || fs.readFileSync(ICON_SRC));
    fs.writeFileSync(logoIcon2Path, fs.readFileSync(ICON_SRC));
    console.log("✓ Updated public/logo icons");
  }

  // 2. Generate standard multi-image ICO file containing 16x16, 32x32, 48x48 PNG frames
  const icoSizes = [16, 32, 48];
  const images = [];

  for (const s of icoSizes) {
    const buf = pngBuffers[s] || await sharp(ICON_SRC).resize(s, s, { fit: "contain" }).png().toBuffer();
    images.push({ size: s, buffer: buf });
  }

  // ICO header: 6 bytes
  // ICONDIR: [0, 0, 1, 0, count (2 bytes)]
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // Reserved
  header.writeUInt16LE(1, 2); // Type 1 = ICO
  header.writeUInt16LE(images.length, 4); // Number of images

  // ICONDIRENTRY: 16 bytes per image
  let offset = 6 + images.length * 16;
  const dirEntries = [];

  for (const img of images) {
    const entry = Buffer.alloc(16);
    entry.writeUInt8(img.size === 256 ? 0 : img.size, 0); // Width
    entry.writeUInt8(img.size === 256 ? 0 : img.size, 1); // Height
    entry.writeUInt8(0, 2); // Color palette
    entry.writeUInt8(0, 3); // Reserved
    entry.writeUInt16LE(1, 4); // Color planes
    entry.writeUInt16LE(32, 6); // Bits per pixel
    entry.writeUInt32LE(img.buffer.length, 8); // Image size in bytes
    entry.writeUInt32LE(offset, 12); // Offset to image data
    dirEntries.push(entry);
    offset += img.buffer.length;
  }

  const icoBuffer = Buffer.concat([
    header,
    ...dirEntries,
    ...images.map((img) => img.buffer),
  ]);

  const icoPath = path.join(publicDir, "favicon.ico");
  fs.writeFileSync(icoPath, icoBuffer);
  console.log("✓ Generated public/favicon.ico (multi-resolution ICO)");
}

generateFavicons().catch((err) => {
  console.error("Failed to generate favicons:", err);
  process.exit(1);
});
