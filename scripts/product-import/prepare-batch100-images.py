#!/usr/bin/env python3
"""Download and prepare Batch100 product images as square WebP (local only)."""
from __future__ import annotations

import hashlib
import json
import os
import re
import sys
import time
import urllib.error
import urllib.request
from io import BytesIO
from pathlib import Path

from PIL import Image, ImageOps

ROOT = Path(r"E:\Project\DilMart-Store")
TMP = ROOT / ".tmp-product-import" / "ard-al-khaleej" / "batch100"
IMG_DIR = TMP / "images"
SRC_DIR = TMP / "images-source"
FINAL = TMP / "final-100-identity.json"
MANIFEST_OUT = TMP / "prepared-image-manifest.json"

UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
CANVAS = 1200


def fetch_bytes(url: str, timeout: int = 45) -> bytes:
    req = urllib.request.Request(
        url,
        headers={
            "User-Agent": UA,
            "Accept": "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
            "Referer": "https://lattafa.com/",
        },
    )
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return resp.read()


def extract_og_image(html: str) -> str | None:
    patterns = [
        r'property=["\']og:image["\']\s+content=["\']([^"\']+)["\']',
        r'content=["\']([^"\']+)["\']\s+property=["\']og:image["\']',
        r'name=["\']twitter:image["\']\s+content=["\']([^"\']+)["\']',
        r'"image"\s*:\s*\[\s*"?(https?://[^"\']+)"?',
        r'"image"\s*:\s*"(https?://[^"\']+)"',
    ]
    for pat in patterns:
        m = re.search(pat, html, re.I)
        if m:
            return m.group(1).replace("\\/", "/").strip()
    return None


def resolve_image_url(item: dict) -> str | None:
    direct = (item.get("source_image_url") or "").strip()
    if direct and re.search(r"\.(jpe?g|png|webp|gif)(\?|$)", direct, re.I):
        return direct
    if direct and re.search(r"cdn\.|wp-content|/media/|/images?/", direct, re.I):
        return direct
    page = (item.get("source_page_url") or item.get("identity_source_url") or "").strip()
    if not page:
        return None
    try:
        req = urllib.request.Request(page, headers={"User-Agent": UA, "Accept": "text/html"})
        with urllib.request.urlopen(req, timeout=40) as resp:
            html = resp.read().decode("utf-8", "ignore")
        return extract_og_image(html)
    except Exception as e:
        print(f"  resolve fail {item.get('merchant_sku')}: {e}")
        return None


def prepare_webp(src_bytes: bytes, out_path: Path) -> dict:
    im = Image.open(BytesIO(src_bytes))
    im = ImageOps.exif_transpose(im)
    if im.mode not in ("RGB", "RGBA"):
        im = im.convert("RGBA" if "A" in im.getbands() else "RGB")
    w, h = im.size
    longest = max(w, h)
    if longest < 600:
        raise ValueError(f"source too small: {w}x{h}")
    # Fit into square canvas without stretch
    scale = min(CANVAS / w, CANVAS / h)
    nw, nh = max(1, int(w * scale)), max(1, int(h * scale))
    resized = im.resize((nw, nh), Image.Resampling.LANCZOS)
    canvas = Image.new("RGB", (CANVAS, CANVAS), (255, 255, 255))
    if resized.mode == "RGBA":
        bg = Image.new("RGB", resized.size, (255, 255, 255))
        bg.paste(resized, mask=resized.split()[-1])
        resized = bg
    else:
        resized = resized.convert("RGB")
    ox = (CANVAS - nw) // 2
    oy = (CANVAS - nh) // 2
    canvas.paste(resized, (ox, oy))
    out_path.parent.mkdir(parents=True, exist_ok=True)
    canvas.save(out_path, "WEBP", quality=88, method=6)
    data = out_path.read_bytes()
    return {
        "width": CANVAS,
        "height": CANVAS,
        "file_size": len(data),
        "sha256": hashlib.sha256(data).hexdigest().upper(),
        "source_width": w,
        "source_height": h,
    }


def main() -> int:
    if not FINAL.exists():
        print(f"MISSING {FINAL} — waiting for final-100-identity.json")
        return 2
    data = json.loads(FINAL.read_text(encoding="utf-8"))
    items = data.get("selected") or data.get("items") or []
    if len(items) != 100:
        print(f"expected 100 selected, got {len(items)}")
        return 3

    IMG_DIR.mkdir(parents=True, exist_ok=True)
    SRC_DIR.mkdir(parents=True, exist_ok=True)
    only = set(a.upper() for a in sys.argv[1:]) if len(sys.argv) > 1 else None
    prev = {}
    if MANIFEST_OUT.exists() and only:
        try:
            for row in json.loads(MANIFEST_OUT.read_text(encoding="utf-8")):
                prev[row["merchant_sku"]] = row
        except Exception:
            prev = {}
    results = []
    ok = 0
    for i, item in enumerate(items, 1):
        sku = item["merchant_sku"]
        out_webp = IMG_DIR / f"{sku}.webp"
        if only is not None and sku.upper() not in only:
            if out_webp.exists() and sku in prev and prev[sku].get("status") == "OK":
                results.append(prev[sku])
                ok += 1
                continue
            if out_webp.exists():
                data_bytes = out_webp.read_bytes()
                results.append(
                    {
                        "merchant_sku": sku,
                        "status": "OK",
                        "source_image_url": item.get("source_image_url"),
                        "source_page_url": item.get("source_page_url") or item.get("identity_source_url"),
                        "prepared_image_path": str(out_webp).replace("\\", "/"),
                        "width": CANVAS,
                        "height": CANVAS,
                        "file_size": len(data_bytes),
                        "sha256": hashlib.sha256(data_bytes).hexdigest().upper(),
                    }
                )
                ok += 1
                continue
        print(f"[{i}/100] {sku}")
        img_url = resolve_image_url(item)
        if not img_url:
            results.append({"merchant_sku": sku, "status": "MISSING_URL"})
            continue
        item["source_image_url"] = img_url
        try:
            raw = fetch_bytes(img_url)
            ext = ".jpg"
            if ".png" in img_url.lower():
                ext = ".png"
            elif ".webp" in img_url.lower():
                ext = ".webp"
            src_path = SRC_DIR / f"{sku}{ext}"
            src_path.write_bytes(raw)
            meta = prepare_webp(raw, out_webp)
            results.append(
                {
                    "merchant_sku": sku,
                    "status": "OK",
                    "source_image_url": img_url,
                    "source_page_url": item.get("source_page_url") or item.get("identity_source_url"),
                    "prepared_image_path": str(out_webp).replace("\\", "/"),
                    **meta,
                }
            )
            ok += 1
            print(f"  OK {meta['source_width']}x{meta['source_height']} -> 1200 webp")
        except Exception as e:
            print(f"  FAIL {e}")
            results.append({"merchant_sku": sku, "status": f"FAIL:{e}", "source_image_url": img_url})
        time.sleep(0.35)

    # keep stable order matching selected
    by_sku = {r["merchant_sku"]: r for r in results}
    ordered = [by_sku[it["merchant_sku"]] for it in items if it["merchant_sku"] in by_sku]
    MANIFEST_OUT.write_text(json.dumps(ordered, ensure_ascii=False, indent=2), encoding="utf-8")
    FINAL.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"prepared_ok={ok}/100 manifest_rows={len(ordered)}")
    return 0 if ok == 100 else 1


if __name__ == "__main__":
    sys.exit(main())
