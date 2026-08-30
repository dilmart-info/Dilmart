#!/usr/bin/env python3
"""Fetch and prepare local replacement WebPs for fix-plan (no Storage upload)."""
from __future__ import annotations

import hashlib
import json
import re
import urllib.request
from io import BytesIO
from pathlib import Path

from PIL import Image, ImageOps

ROOT = Path(__file__).resolve().parents[2]
TMP = ROOT / ".tmp-product-import" / "ard-al-khaleej" / "private-catalog-fix-plan"
SRC = TMP / "images-source"
OUT = TMP / "images"
DOCS = ROOT / "docs" / "product-import" / "ard-al-khaleej" / "private-catalog-fix-plan"
CANVAS = 1200
UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"

# Candidate direct image URLs (retailer CDN / known product photography).
# Each must be verified visually after download.
CANDIDATES = {
    "ARD-2793": [
        # Fakhar Men air freshener listings often use can packshots; try known retailer pages via og later
        "https://cdn.shopify.com/s/files/1/0558/2081/4902/files/fakhar-men-air-freshener.jpg",
    ],
    "ARD-4792": [
        "https://cdn.notinoimg.com/detail_main_mq/lattafa/musamam-black-intense_01-n.jpg",
        "https://fimgs.net/mdimg/perfume/375x500.119987.jpg",
    ],
    "ARD-2932": [
        "https://www.lattafa.my/cdn/perfumes/lattafa/al-awsaaf-lattafa-100ml-edp/large/image.jpg",
    ],
    "ARD-2511": [
        # Keep current official 60ml packshot path from approved manifest (size correction proposal)
        "https://www.lattafa.my/cdn/ana-abiyedh-poudree-by-lattafa-60ml-5/large/image.jpg",
    ],
    "ARD-823": [
        # Source already 50ml set in Batch100 manifest — retain as proposed-correct packaging
        "https://www.lattafa.my/cdn/perfumes/lattafa/sheikh-al-shuyukh-lattafa-50ml-edp-men-perfume-malaysia/large/image.jpg",
    ],
    "ARD-775": [
        # Salamah EDP (Asdaaf) — re-identify proposal; image already correct for Salamah
        "https://www.lattafa.my/cdn/perfumes/lattafa/salamah-by-lattafa-100ml-edp-unisex-perfume-malaysia-1/large/image.jpg",
    ],
}

PAGE_CANDIDATES = {
    "ARD-2793": "https://www.timesperfumes.com.au/products/fakhar-men-air-freshener-300ml",
    "ARD-2797": "https://barakahshops.com/products/lattafa-fakhar-lattafa",
    "ARD-4750": "https://qasrjamal.com/products/lattafa-eclaire-air-freshner-300ml",
    "ARD-4564": "https://www.perfume-click.ie/Lattafa-Perfumes-Maahir-Air-Freshener-300ml-Spray-s159101/",
    "ARD-4752": "https://www.eshaistic.pk/lattafa-badee-al-oud-noble-blush-air-freshener-300ml/",
    "ARD-4807": "https://shopforever.pk/product/nebras-lattafa-perfumes-air-freshener-room-spray-300-ml/",
    "ARD-4300": "https://shopforever.pk/product/badee-al-oud-lattafa-perfumes-air-freshener-room-spray-300-ml/",
    "ARD-4751": "https://shopforever.pk/product/musamam-white-lattafa-perfumes-air-freshener-room-spray-300-ml/",
    "ARD-4792": "https://www.fragrantica.com/perfume/Lattafa-Perfumes/Musamam-Black-Intense-119987.html",
}


def fetch(url: str, timeout: int = 45) -> bytes:
    req = urllib.request.Request(
        url,
        headers={
            "User-Agent": UA,
            "Accept": "image/avif,image/webp,image/apng,image/*,*/*;q=0.8,text/html",
            "Referer": "https://www.lattafa.com/",
        },
    )
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return resp.read()


def og_image(html: str) -> str | None:
    patterns = [
        r'property=["\']og:image["\']\s+content=["\']([^"\']+)',
        r'content=["\']([^"\']+)["\']\s+property=["\']og:image["\']',
        r'"image"\s*:\s*"(https?://[^"]+)"',
        r'"image"\s*:\s*\[\s*"(https?://[^"]+)"',
    ]
    for p in patterns:
        m = re.search(p, html, re.I)
        if m:
            return m.group(1).replace("\\/", "/").strip()
    return None


def prepare(src: bytes, out: Path) -> dict:
    im = Image.open(BytesIO(src))
    im = ImageOps.exif_transpose(im)
    if im.mode not in ("RGB", "RGBA"):
        im = im.convert("RGBA" if "A" in im.getbands() else "RGB")
    if im.mode == "RGBA":
        bg = Image.new("RGB", im.size, (255, 255, 255))
        bg.paste(im, mask=im.split()[-1])
        im = bg
    else:
        im = im.convert("RGB")
    im.thumbnail((CANVAS, CANVAS), Image.Resampling.LANCZOS)
    canvas = Image.new("RGB", (CANVAS, CANVAS), (255, 255, 255))
    canvas.paste(im, ((CANVAS - im.size[0]) // 2, (CANVAS - im.size[1]) // 2))
    out.parent.mkdir(parents=True, exist_ok=True)
    canvas.save(out, "WEBP", quality=90, method=6)
    data = out.read_bytes()
    return {
        "width": CANVAS,
        "height": CANVAS,
        "bytes": len(data),
        "sha256": hashlib.sha256(data).hexdigest().upper(),
        "mime": "image/webp",
    }


def main() -> None:
    SRC.mkdir(parents=True, exist_ok=True)
    OUT.mkdir(parents=True, exist_ok=True)
    results = {}

    # Resolve page og images into candidates
    for sku, page in PAGE_CANDIDATES.items():
        try:
            html = fetch(page).decode("utf-8", "ignore")
            img = og_image(html)
            results.setdefault(sku, {"page": page, "og_image": img, "status": "resolved" if img else "no_og"})
            if img:
                CANDIDATES.setdefault(sku, [])
                if img not in CANDIDATES[sku]:
                    CANDIDATES[sku] = [img, *CANDIDATES[sku]]
        except Exception as e:
            results[sku] = {"page": page, "status": f"page_err:{type(e).__name__}:{e}"}

    prepared = {}
    for sku, urls in CANDIDATES.items():
        ok = False
        errors = []
        for url in urls:
            try:
                raw = fetch(url)
                src_path = SRC / f"{sku}.src.bin"
                src_path.write_bytes(raw)
                meta = prepare(raw, OUT / f"{sku}.webp")
                prepared[sku] = {**meta, "source_url": url, "status": "prepared"}
                ok = True
                break
            except Exception as e:
                errors.append(f"{url[:80]}::{type(e).__name__}")
        if not ok:
            prepared[sku] = {"status": "HOLD_NO_VERIFIED_REPLACEMENT", "errors": errors}

    out_json = TMP / "prepare_results.json"
    out_json.write_text(json.dumps({"page_resolve": results, "prepared": prepared}, indent=2), encoding="utf-8")
    print(json.dumps({"prepared": {k: v.get("status") for k, v in prepared.items()}, "path": str(out_json)}, indent=2))


if __name__ == "__main__":
    main()
