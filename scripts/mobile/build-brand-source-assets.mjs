/**
 * Derives the @capacitor/assets source set from the two authoritative brand files.
 *
 * Authoritative sources (never modified, never renamed):
 *   assets/icon-only.png  → app icon artwork
 *   assets/logo.png       → full lockup used on the native splash screen
 *
 * Everything else under assets/ that this script writes is a derivation. Re-running
 * the script must reproduce byte-comparable output for the same inputs, so all
 * geometry is computed from the real alpha masks instead of hard-coded guesses.
 *
 * Why each derivation exists is documented next to its constant below.
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
 * Brand background. Mean colour of the opaque dark field inside icon-only.png
 * (luminance < 40), so the splash and the adaptive-icon background match the
 * artwork instead of an invented value. Recomputed on every run and asserted
 * against this constant so a source swap cannot silently drift the palette.
 */
const BRAND_DARK = "#0f0d0b";

const ICON_CANVAS = 1024;
const SPLASH_CANVAS = 2732;

/**
 * Adaptive-icon foreground safety.
 *
 * @capacitor/assets writes mipmap-anydpi-v26/ic_launcher.xml with a 16.7% inset on
 * both layers, so the foreground drawable lands on the central 66.6% of the 108dp
 * adaptive canvas — exactly the 72dp visible viewport. A circular launcher mask is
 * a 72dp-diameter circle inscribed in that viewport, which clips anything whose
 * radius from the centre exceeds 50% of the foreground image width.
 *
 * icon-only.png has a max opaque radius of ~1.10x its half-width, so a full-bleed
 * foreground loses the gold frame corners under a circle mask. Scaling the artwork
 * so its max radius lands at 95% of the inscribed circle keeps the whole gold frame
 * and the shopping bag visible under square, rounded-square and circular masks.
 */
const ADAPTIVE_RADIUS_RATIO = 0.95;

/**
 * Legacy launcher / iOS icon fill.
 *
 * icon-only.png places its artwork on ~91% of its own canvas. Keeping that ratio
 * preserves the intended breathing room inside the iOS superellipse mask instead of
 * pushing the gold frame into the corners where iOS would clip it.
 */
const ICON_FILL_RATIO = 0.9107;

/**
 * Splash logo width, as a fraction of the 2732x2732 canvas.
 *
 * iOS renders the square splash through LaunchScreen.storyboard with
 * scaleAspectFit, so the whole canvas is always visible and the logo keeps the
 * requested 45-55% share of the screen width.
 *
 * Android is different: @capacitor/assets cover-crops the square canvas down to
 * each drawable template (the narrowest is 720x1280, keeping only the central
 * 66.7% of the width) and the plugin then applies CENTER_CROP to reach the real
 * screen aspect. On a 20:9 phone that compounds to roughly the central 45% of the
 * canvas, so a 50% logo would be cropped. The Android-specific derivation is sized
 * for that double crop and still lands near 65% of the device width.
 */
const SPLASH_LOGO_RATIO = 0.5;
const SPLASH_LOGO_RATIO_ANDROID = 0.3;

function hexToRgb(hex) {
  const clean = hex.replace("#", "");
  return {
    r: parseInt(clean.slice(0, 2), 16),
    g: parseInt(clean.slice(2, 4), 16),
    b: parseInt(clean.slice(4, 6), 16),
    alpha: 1,
  };
}

async function readRgba(file) {
  const { data, info } = await sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return { data, width: info.width, height: info.height, channels: info.channels };
}

/** Bounding box of pixels with alpha >= 16, i.e. the visible artwork. */
function opaqueBounds({ data, width, height, channels }) {
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (data[(y * width + x) * channels + 3] >= 16) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < 0) throw new Error("Source image has no opaque pixels");
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
      if (data[(y * width + x) * channels + 3] >= 16) {
        const r = Math.hypot(x - cx, y - cy);
        if (r > max) max = r;
      }
    }
  }
  return max;
}

/** Mean colour of the opaque near-black field, used to verify BRAND_DARK. */
function meanDarkField({ data, channels }) {
  let r = 0;
  let g = 0;
  let b = 0;
  let n = 0;
  for (let i = 0; i < data.length; i += channels) {
    if (data[i + 3] !== 255) continue;
    const lum = 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];
    if (lum >= 40) continue;
    r += data[i];
    g += data[i + 1];
    b += data[i + 2];
    n += 1;
  }
  if (!n) throw new Error("No dark field found in icon-only.png");
  const to2 = (v) => Math.round(v / n).toString(16).padStart(2, "0");
  return `#${to2(r)}${to2(g)}${to2(b)}`;
}

async function writeOnCanvas({ source, bounds, targetWidth, canvas, background, out }) {
  const scale = targetWidth / bounds.width;
  const artWidth = Math.max(1, Math.round(bounds.width * scale));
  const artHeight = Math.max(1, Math.round(bounds.height * scale));
  const art = await sharp(source)
    .extract({ left: bounds.left, top: bounds.top, width: bounds.width, height: bounds.height })
    .resize(artWidth, artHeight, { fit: "fill" })
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
  const iconBounds = opaqueBounds(icon);
  const iconRadius = maxOpaqueRadius(icon, iconBounds);
  const measuredDark = meanDarkField(icon);

  if (measuredDark !== BRAND_DARK) {
    console.error(
      `Brand background drifted: icon-only.png dark field is ${measuredDark}, BRAND_DARK is ${BRAND_DARK}. ` +
        `Update BRAND_DARK deliberately — do not regenerate with a stale palette.`,
    );
    process.exit(1);
  }

  const transparent = { r: 0, g: 0, b: 0, alpha: 0 };
  const brand = hexToRgb(BRAND_DARK);

  // Adaptive foreground: scale so the artwork stays inside the circular mask.
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

  // Adaptive background: flat brand colour, matching the artwork's own field.
  await sharp({
    create: { width: ICON_CANVAS, height: ICON_CANVAS, channels: 4, background: brand },
  })
    .png()
    .toFile(path.join(assetsDir, "icon-background.png"));

  // Square, unmasked icon for the legacy Android launcher and the iOS app icon.
  const squareIconWidth = Math.round(ICON_CANVAS * ICON_FILL_RATIO);
  for (const out of [path.join(assetsDir, "android", "icon.png"), path.join(assetsDir, "ios", "icon.png")]) {
    await writeOnCanvas({
      source: ICON_SRC,
      bounds: iconBounds,
      targetWidth: squareIconWidth,
      canvas: ICON_CANVAS,
      background: transparent,
      out,
    });
  }

  // Splash canvases: full lockup, centred, contained, on the brand background.
  const logo = await readRgba(LOGO_SRC);
  const logoBounds = opaqueBounds(logo);

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
      background: brand,
      out: variant.out,
    });
    splashSizes.push({ file: path.relative(root, variant.out), ...size });
  }

  console.log(`brand background      ${BRAND_DARK} (verified against icon-only.png dark field)`);
  console.log(`icon artwork bounds   ${iconBounds.width}x${iconBounds.height} @ ${iconBounds.left},${iconBounds.top}`);
  console.log(`icon max radius       ${iconRadius.toFixed(1)}px`);
  console.log(`logo artwork bounds   ${logoBounds.width}x${logoBounds.height} @ ${logoBounds.left},${logoBounds.top}`);
  console.log(`assets/icon-foreground.png  artwork ${foreground.artWidth}x${foreground.artHeight} on ${ICON_CANVAS}`);
  console.log(`assets/icon-background.png  flat ${BRAND_DARK} on ${ICON_CANVAS}`);
  console.log(`assets/android/icon.png     artwork ${squareIconWidth}px on ${ICON_CANVAS}`);
  console.log(`assets/ios/icon.png         artwork ${squareIconWidth}px on ${ICON_CANVAS}`);
  for (const s of splashSizes) {
    console.log(`${s.file.padEnd(28)} logo ${s.artWidth}x${s.artHeight} on ${SPLASH_CANVAS}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
