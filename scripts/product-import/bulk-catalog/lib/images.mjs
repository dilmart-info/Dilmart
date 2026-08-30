/**
 * Local image discovery + SHA / immutable path helpers.
 * No uploads in prepare/dry-run.
 */
import fs from "fs";
import path from "path";
import { sha256File, sha256Hex } from "./csv.mjs";
import { normalizeSku as normSku } from "./normalize.mjs";

const IMAGE_EXT = new Set([".webp", ".jpg", ".jpeg", ".png"]);

export function indexLocalImages(directories = []) {
  /** @type {Map<string, string[]>} */
  const bySku = new Map();
  let totalFiles = 0;
  for (const dir of directories) {
    if (!dir || !fs.existsSync(dir)) continue;
    walk(dir, (filePath) => {
      const ext = path.extname(filePath).toLowerCase();
      if (!IMAGE_EXT.has(ext)) return;
      totalFiles += 1;
      const base = path.basename(filePath);
      const m = base.match(/(ARD-\d+)/i);
      if (!m) return;
      const sku = normSku(m[1]);
      if (!bySku.has(sku)) bySku.set(sku, []);
      bySku.get(sku).push(filePath);
    });
  }
  return { bySku, totalFiles };
}

function walk(dir, onFile) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) walk(p, onFile);
    else if (ent.isFile()) onFile(p);
  }
}

/**
 * Prefer .webp under images/, then any match. Verify readable + size > 0.
 */
export function resolveImageForSku(bySku, sku) {
  const list = bySku.get(normSku(sku)) || [];
  if (!list.length) return { ok: false, code: "MISSING_IMAGE", path: null };
  const preferred =
    list.find((p) => path.extname(p).toLowerCase() === ".webp" && !p.includes("images-source")) ||
    list.find((p) => path.extname(p).toLowerCase() === ".webp") ||
    list[0];
  try {
    const st = fs.statSync(preferred);
    if (!st.isFile() || st.size < 32) {
      return { ok: false, code: "CORRUPT_OR_EMPTY_IMAGE", path: preferred };
    }
    const buf = fs.readFileSync(preferred);
    // Minimal MIME sniff
    const mime = sniffMime(buf, preferred);
    if (!mime.startsWith("image/")) {
      return { ok: false, code: "INVALID_MIME", path: preferred, mime };
    }
    const decoded = decodeImageMetadata(buf, mime);
    if (!decoded.ok) {
      return { ok: false, code: "IMAGE_DECODE_FAILED", path: preferred, mime };
    }
    const sha = sha256Hex(buf);
    return { ok: true, path: preferred, mime, sha256: sha, bytes: buf.length, decoded };
  } catch (e) {
    return { ok: false, code: "IMAGE_READ_FAILED", path: preferred, message: String(e.message || e) };
  }
}

export function sniffMime(buf, filePath = "") {
  if (buf.length >= 12) {
    if (buf.toString("ascii", 4, 12).startsWith("ftypavif") || buf.toString("ascii", 4, 12).startsWith("ftypavis")) {
      return "image/avif";
    }
    if (buf[0] === 0x52 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x46 && buf[8] === 0x57 && buf[9] === 0x45 && buf[10] === 0x42 && buf[11] === 0x50) {
      return "image/webp";
    }
    if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "image/jpeg";
    if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return "image/png";
  }
  const ext = path.extname(filePath).toLowerCase();
  if (ext === ".webp") return "image/webp";
  if (ext === ".jpg" || ext === ".jpeg") return "image/jpeg";
  if (ext === ".png") return "image/png";
  return "application/octet-stream";
}

/**
 * Decode structural image metadata without accepting an extension-only MIME guess.
 * The bulk corpus is WebP, while PNG/JPEG support keeps fixture and operator checks
 * honest without adding a second image library to the runtime.
 */
export function decodeImageMetadata(buf, mime = sniffMime(buf)) {
  try {
    if (mime === "image/avif") {
      const marker = Buffer.from("ispe");
      const index = buf.indexOf(marker);
      if (index < 4 || index + 16 > buf.length) return { ok: false };
      const width = buf.readUInt32BE(index + 8);
      const height = buf.readUInt32BE(index + 12);
      return { ok: width > 0 && height > 0, width, height, format: "avif" };
    }

    if (mime === "image/png") {
      if (buf.length < 24 || buf.toString("ascii", 12, 16) !== "IHDR") return { ok: false };
      const width = buf.readUInt32BE(16);
      const height = buf.readUInt32BE(20);
      return { ok: width > 0 && height > 0, width, height, format: "png" };
    }

    if (mime === "image/jpeg") {
      let offset = 2;
      while (offset + 9 < buf.length) {
        if (buf[offset] !== 0xff) {
          offset += 1;
          continue;
        }
        const marker = buf[offset + 1];
        if (marker === 0xd8 || marker === 0xd9) {
          offset += 2;
          continue;
        }
        const size = buf.readUInt16BE(offset + 2);
        if (size < 2 || offset + 2 + size > buf.length) return { ok: false };
        if ([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(marker)) {
          const height = buf.readUInt16BE(offset + 5);
          const width = buf.readUInt16BE(offset + 7);
          return { ok: width > 0 && height > 0, width, height, format: "jpeg" };
        }
        offset += 2 + size;
      }
      return { ok: false };
    }

    if (mime === "image/webp") {
      if (
        buf.length < 20 ||
        buf.toString("ascii", 0, 4) !== "RIFF" ||
        buf.toString("ascii", 8, 12) !== "WEBP" ||
        buf.readUInt32LE(4) + 8 > buf.length
      ) {
        return { ok: false };
      }
      let offset = 12;
      while (offset + 8 <= buf.length) {
        const type = buf.toString("ascii", offset, offset + 4);
        const size = buf.readUInt32LE(offset + 4);
        const start = offset + 8;
        const end = start + size;
        if (end > buf.length) return { ok: false };
        if (type === "VP8X" && size >= 10) {
          const width = 1 + buf.readUIntLE(start + 4, 3);
          const height = 1 + buf.readUIntLE(start + 7, 3);
          return { ok: width > 0 && height > 0, width, height, format: "webp" };
        }
        if (type === "VP8L" && size >= 5 && buf[start] === 0x2f) {
          const b1 = buf[start + 1];
          const b2 = buf[start + 2];
          const b3 = buf[start + 3];
          const b4 = buf[start + 4];
          const width = 1 + (b1 | ((b2 & 0x3f) << 8));
          const height = 1 + ((b2 >> 6) | (b3 << 2) | ((b4 & 0x0f) << 10));
          return { ok: width > 0 && height > 0, width, height, format: "webp" };
        }
        if (type === "VP8 " && size >= 10) {
          for (let i = start; i + 6 < end; i += 1) {
            if (buf[i] === 0x9d && buf[i + 1] === 0x01 && buf[i + 2] === 0x2a) {
              const width = buf.readUInt16LE(i + 3) & 0x3fff;
              const height = buf.readUInt16LE(i + 5) & 0x3fff;
              return { ok: width > 0 && height > 0, width, height, format: "webp" };
            }
          }
        }
        offset = end + (size % 2);
      }
    }
  } catch {
    return { ok: false };
  }
  return { ok: false };
}

/**
 * Immutable object path — never overwrite. Uses SHA prefix in filename.
 */
export function immutableStoragePath(merchantId, sku, sha256, ext = ".webp") {
  const short = String(sha256).slice(0, 8).toUpperCase();
  const e = ext.startsWith(".") ? ext : `.${ext}`;
  return `${merchantId}/bulk2200/${normSku(sku)}-${short}${e}`;
}

export { sha256File };
