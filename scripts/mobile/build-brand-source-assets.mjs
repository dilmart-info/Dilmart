/**
 * Derives the @capacitor/assets source set from the two authoritative DILMART brand files.
 *
 * Authoritative sources (never modified, never renamed):
 *   assets/icon-only.png  → DILMART app icon artwork
 *   assets/logo.png       → DILMART full lockup used on the native splash screen
 *
 * Approved DILMART Brand Palette:
 *   Primary Blue:  #1261D8
 *   Deep Navy:     #071A3D
 *   Accent Orange: #FF8A00
 *   White:         #FFFFFF
 *
 * Everything else under assets/ that this script writes is a derivation.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const assetsDir = path.join(root, "assets");

const ICON_SRC = path.join(assetsDir, "icon-only.png");
const LOGO_SRC = path.join(assetsDir, "logo.png");

/**
 * Approved DILMART native brand background.
 * Uses clean White (#FFFFFF) to complement the Primary Blue (#1261D8) / Deep Navy (#071A3D) logo lockup.
 */
const BRAND_BACKGROUND = "#FFFFFF";
const BRAND_NAVY = "#071A3D";

const ICON_CANVAS = 1024;
const SPLASH_CANVAS = 2732;

/**
 * Adaptive-icon foreground safety ratio.
 * Keeps the DILMART icon artwork safely inside Android 12+ circular and squircle launcher masks.
 */
const ADAPTIVE_RADIUS_RATIO = 0.85;

/**
 * iOS & legacy Android icon fill ratio inside the canvas.
 */
const ICON_FILL_RATIO = 0.85;

/**
 * Splash logo width fractions of the 2732x2732 canvas.
 */
const SPLASH_LOGO_RATIO = 0.50;
const SPLASH_LOGO_RATIO_ANDROID = 0.35;

function hexToRgb(hex, alpha = 1) {
  const clean = hex.replace("#", "");
  return {
    r: parseInt(clean.slice(0, 2), 16),
    g: parseInt(clean.slice(2, 4), 16),
    b: parseInt(clean.slice(4, 6), 16),
    alpha,
  };
}

async function readRgba(file) {
  const { data, info } = await sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return { data, width: info.width, height: info.height, channels: info.channels };
}

/** Bounding box of visible artwork (alpha >= 16 and non-white if opaque). */
function getArtworkBounds({ data, width, height, channels }) {
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const idx = (y * width + x) * channels;
      const a = data[idx + 3];
      const r = data[idx];
      const g = data[idx + 1];
      const b = data[idx + 2];
      const isVisible = a >= 16 && (a < 255 || r < 248 || g < 248 || b < 248);
      if (isVisible) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < 0) {
    return { left: 0, top: 0, width, height };
  }
  return { left: minX, top: minY, width: maxX - minX + 1, height: maxY - minY + 1 };
}

/** Largest distance from the bounding-box centre to any visible pixel. */
function maxOpaqueRadius(image, bounds) {
  const { data, width, channels } = image;
  const cx = bounds.left + (bounds.width - 1) / 2;
  const cy = bounds.top + (bounds.height - 1) / 2;
  let max = 0;
  for (let y = bounds.top; y < bounds.top + bounds.height; y += 1) {
    for (let x = bounds.left; x < bounds.left + bounds.width; x += 1) {
      const idx = (y * width + x) * channels;
      const a = data[idx + 3];
      const r = data[idx];
      const g = data[idx + 1];
      const b = data[idx + 2];
      const isVisible = a >= 16 && (a < 255 || r < 248 || g < 248 || b < 248);
      if (isVisible) {
        const rad = Math.hypot(x - cx, y - cy);
        if (rad > max) max = rad;
      }
    }
  }
  return max > 0 ? max : Math.hypot(bounds.width / 2, bounds.height / 2);
}

async function writeOnCanvas({ source, bounds, targetWidth, canvas, background, out }) {
  const scale = targetWidth / bounds.width;
  const artWidth = Math.max(1, Math.round(bounds.width * scale));
  const artHeight = Math.max(1, Math.round(bounds.height * scale));
  const art = await sharp(source)
    .extract({ left: bounds.left, top: bounds.top, width: bounds.width, height: bounds.height })
    .resize(artWidth, artHeight, { fit: "contain" })
    .png()
    .toBuffer();

  await sharp({
    create: { width: canvas, height: canvas, channels: 4, background },
  })
    .composite([{ input: art, gravity: "centre" }])
    .png()
    .toFile(out);

  return { artWidth, artHeight };
}

async function main() {
  for (const file of [ICON_SRC, LOGO_SRC]) {
    if (!fs.existsSync(file)) {
      console.error(`Missing authoritative source: ${path.relative(root, file)}`);
      process.exit(1);
    }
  }

  fs.mkdirSync(path.join(assetsDir, "android"), { recursive: true });
  fs.mkdirSync(path.join(assetsDir, "ios"), { recursive: true });

  const icon = await readRgba(ICON_SRC);
  const iconBounds = getArtworkBounds(icon);
  const iconRadius = maxOpaqueRadius(icon, iconBounds);

  const transparent = { r: 0, g: 0, b: 0, alpha: 0 };
  const brandBg = hexToRgb(BRAND_BACKGROUND, 1);

  // Adaptive foreground: scale so the DILMART icon stays cleanly inside the circular mask.
  const adaptiveTargetRadius = (ICON_CANVAS / 2) * ADAPTIVE_RADIUS_RATIO;
  const adaptiveWidth = Math.round(iconBounds.width * (adaptiveTargetRadius / iconRadius));
  const foreground = await writeOnCanvas({
    source: ICON_SRC,
    bounds: iconBounds,
    targetWidth: adaptiveWidth,
    canvas: ICON_CANVAS,
    background: transparent,
    out: path.join(assetsDir, "icon-foreground.png"),
  });

  // Adaptive background: flat DILMART white background matching brand theme.
  await sharp({
    create: { width: ICON_CANVAS, height: ICON_CANVAS, channels: 4, background: brandBg },
  })
    .png()
    .toFile(path.join(assetsDir, "icon-background.png"));

  // Square icon for the legacy Android launcher and the iOS app icon (iOS requires opaque, noAlpha).
  const squareIconWidth = Math.round(ICON_CANVAS * ICON_FILL_RATIO);
  for (const out of [path.join(assetsDir, "android", "icon.png"), path.join(assetsDir, "ios", "icon.png")]) {
    await writeOnCanvas({
      source: ICON_SRC,
      bounds: iconBounds,
      targetWidth: squareIconWidth,
      canvas: ICON_CANVAS,
      background: brandBg,
      out,
    });
  }

  // Splash canvases: full DILMART lockup, centred, contained, on the white background.
  const logo = await readRgba(LOGO_SRC);
  const logoBounds = getArtworkBounds(logo);

  const splashVariants = [
    { out: path.join(assetsDir, "splash.png"), ratio: SPLASH_LOGO_RATIO },
    { out: path.join(assetsDir, "splash-dark.png"), ratio: SPLASH_LOGO_RATIO },
    { out: path.join(assetsDir, "android", "splash.png"), ratio: SPLASH_LOGO_RATIO_ANDROID },
    { out: path.join(assetsDir, "android", "splash-dark.png"), ratio: SPLASH_LOGO_RATIO_ANDROID },
  ];

  const splashSizes = [];
  for (const variant of splashVariants) {
    const size = await writeOnCanvas({
      source: LOGO_SRC,
      bounds: logoBounds,
      targetWidth: Math.round(SPLASH_CANVAS * variant.ratio),
      canvas: SPLASH_CANVAS,
      background: brandBg,
      out: variant.out,
    });
    splashSizes.push({ file: path.relative(root, variant.out), ...size });
  }

  console.log(`DILMART brand background: ${BRAND_BACKGROUND}`);
  console.log(`icon artwork bounds:     ${iconBounds.width}x${iconBounds.height} @ ${iconBounds.left},${iconBounds.top}`);
  console.log(`icon max radius:         ${iconRadius.toFixed(1)}px`);
  console.log(`logo artwork bounds:     ${logoBounds.width}x${logoBounds.height} @ ${logoBounds.left},${logoBounds.top}`);
  console.log(`assets/icon-foreground.png  artwork ${foreground.artWidth}x${foreground.artHeight} on ${ICON_CANVAS}`);
  console.log(`assets/icon-background.png  flat ${BRAND_BACKGROUND} on ${ICON_CANVAS}`);
  console.log(`assets/android/icon.png     artwork ${squareIconWidth}px on ${ICON_CANVAS}`);
  console.log(`assets/ios/icon.png         artwork ${squareIconWidth}px on ${ICON_CANVAS} (opaque)`);
  for (const s of splashSizes) {
    console.log(`${s.file.padEnd(28)} logo ${s.artWidth}x${s.artHeight} on ${SPLASH_CANVAS}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
