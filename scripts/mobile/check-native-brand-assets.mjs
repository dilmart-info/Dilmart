/**
 * Native brand asset guard.
 *
 * Fails if the app icon or the native splash screen has drifted back to a
 * placeholder or to a stale brand: missing sources, wrong source dimensions, or
 * missing generated Android/iOS resources.
 *
 * Reads PNG headers directly (IHDR) so it needs no image library and stays fast
 * enough to run in CI.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

const failures = [];

function fail(message) {
  failures.push(message);
}

/** Reads width/height/colour type from a PNG IHDR chunk. */
function readPngHeader(relPath) {
  const abs = path.join(root, relPath);
  if (!fs.existsSync(abs)) return null;
  const fd = fs.openSync(abs, "r");
  try {
    const head = Buffer.alloc(26);
    const read = fs.readSync(fd, head, 0, 26, 0);
    if (read < 26 || !head.subarray(0, 8).equals(PNG_SIGNATURE)) return null;
    return {
      width: head.readUInt32BE(16),
      height: head.readUInt32BE(20),
      colorType: head[25],
      bytes: fs.statSync(abs).size,
    };
  } finally {
    fs.closeSync(fd);
  }
}

function requireImage(relPath, { minWidth, minHeight, square = false, noAlpha = false } = {}) {
  const header = readPngHeader(relPath);
  if (!header) {
    fail(`missing or not a PNG: ${relPath}`);
    return null;
  }
  if (minWidth && header.width < minWidth) {
    fail(`${relPath} is ${header.width}px wide, expected at least ${minWidth}px`);
  }
  if (minHeight && header.height < minHeight) {
    fail(`${relPath} is ${header.height}px tall, expected at least ${minHeight}px`);
  }
  if (square && header.width !== header.height) {
    fail(`${relPath} must be square, got ${header.width}x${header.height}`);
  }
  // Colour types 4 (grey+alpha) and 6 (RGBA) carry an alpha channel, which the
  // App Store rejects for the iOS app icon.
  if (noAlpha && (header.colorType === 4 || header.colorType === 6)) {
    fail(`${relPath} carries an alpha channel; the iOS app icon must be opaque`);
  }
  return header;
}

function requireFile(relPath) {
  if (!fs.existsSync(path.join(root, relPath))) fail(`missing: ${relPath}`);
}

// --- Authoritative brand sources -------------------------------------------
requireImage("assets/icon-only.png", { minWidth: 1024, minHeight: 1024 });
requireImage("assets/logo.png", { minWidth: 1024 });

// --- Derived sources consumed by @capacitor/assets --------------------------
requireImage("assets/icon-foreground.png", { minWidth: 1024, minHeight: 1024, square: true });
requireImage("assets/icon-background.png", { minWidth: 1024, minHeight: 1024, square: true });
requireImage("assets/splash.png", { minWidth: 2732, minHeight: 2732, square: true });
requireImage("assets/splash-dark.png", { minWidth: 2732, minHeight: 2732, square: true });
requireImage("assets/android/icon.png", { minWidth: 1024, minHeight: 1024, square: true });
requireImage("assets/android/splash.png", { minWidth: 2732, minHeight: 2732, square: true });
requireImage("assets/android/splash-dark.png", { minWidth: 2732, minHeight: 2732, square: true });
requireImage("assets/ios/icon.png", { minWidth: 1024, minHeight: 1024, square: true });

// --- Generated Android launcher resources -----------------------------------
const ANDROID_RES = "android/app/src/main/res";
const ANDROID_DENSITIES = ["ldpi", "mdpi", "hdpi", "xhdpi", "xxhdpi", "xxxhdpi"];
for (const density of ANDROID_DENSITIES) {
  for (const name of ["ic_launcher", "ic_launcher_round", "ic_launcher_foreground", "ic_launcher_background"]) {
    requireFile(`${ANDROID_RES}/mipmap-${density}/${name}.png`);
  }
}
requireFile(`${ANDROID_RES}/mipmap-anydpi-v26/ic_launcher.xml`);
requireFile(`${ANDROID_RES}/mipmap-anydpi-v26/ic_launcher_round.xml`);

// --- Generated Android splash resources -------------------------------------
requireFile(`${ANDROID_RES}/drawable/splash.png`);
requireFile(`${ANDROID_RES}/drawable-night/splash.png`);
for (const orientation of ["port", "land"]) {
  for (const density of ANDROID_DENSITIES) {
    requireFile(`${ANDROID_RES}/drawable-${orientation}-${density}/splash.png`);
    requireFile(`${ANDROID_RES}/drawable-${orientation}-night-${density}/splash.png`);
  }
}

// --- Android launch theme must stay branded ---------------------------------
const stylesPath = path.join(root, ANDROID_RES, "values", "styles.xml");
if (!fs.existsSync(stylesPath)) {
  fail(`missing: ${ANDROID_RES}/values/styles.xml`);
} else {
  const styles = fs.readFileSync(stylesPath, "utf8");
  for (const attr of ["windowSplashScreenBackground", "windowSplashScreenAnimatedIcon"]) {
    if (!styles.includes(attr)) {
      fail(`${ANDROID_RES}/values/styles.xml no longer sets ${attr}; Android 12+ would fall back to the system splash`);
    }
  }
}

// --- Generated iOS resources -------------------------------------------------
const IOS_ASSETS = "ios/App/App/Assets.xcassets";
requireImage(`${IOS_ASSETS}/AppIcon.appiconset/AppIcon-512@2x.png`, {
  minWidth: 1024,
  minHeight: 1024,
  square: true,
  noAlpha: true,
});
requireFile(`${IOS_ASSETS}/AppIcon.appiconset/Contents.json`);
requireFile(`${IOS_ASSETS}/Splash.imageset/Contents.json`);
for (const scale of ["1x", "2x", "3x"]) {
  requireImage(`${IOS_ASSETS}/Splash.imageset/Default@${scale}~universal~anyany.png`, {
    minWidth: 2732,
    minHeight: 2732,
    square: true,
  });
  requireImage(`${IOS_ASSETS}/Splash.imageset/Default@${scale}~universal~anyany-dark.png`, {
    minWidth: 2732,
    minHeight: 2732,
    square: true,
  });
}

// --- iOS splash must not be cropped by the launch storyboard -----------------
const storyboardPath = path.join(root, "ios/App/App/Base.lproj/LaunchScreen.storyboard");
if (!fs.existsSync(storyboardPath)) {
  fail("missing: ios/App/App/Base.lproj/LaunchScreen.storyboard");
} else {
  const storyboard = fs.readFileSync(storyboardPath, "utf8");
  if (storyboard.includes('contentMode="scaleAspectFill"')) {
    fail("LaunchScreen.storyboard uses scaleAspectFill, which crops the full logo on tall devices");
  }
}

if (failures.length > 0) {
  console.error("Native brand asset check FAILED:");
  for (const message of failures) console.error(`  - ${message}`);
  console.error("\nRegenerate with: npm run cap:assets");
  process.exit(1);
}

console.log("Native brand asset check PASS — icon and splash resources present for Android and iOS");
