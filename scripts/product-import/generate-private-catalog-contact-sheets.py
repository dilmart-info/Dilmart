#!/usr/bin/env python3
"""Generate private catalog contact sheets (read-only local images)."""
from __future__ import annotations

import csv
import json
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[2]
TMP = ROOT / ".tmp-product-import" / "ard-al-khaleej" / "private-catalog-qa"
IMG = TMP / "images"
DOCS = ROOT / "docs" / "product-import" / "ard-al-khaleej" / "private-catalog-qa"
OUT = DOCS / "review"
VISUAL = DOCS / "04_VISUAL_QA_110.csv"

COLS, ROWS = 5, 4
TILE_W, TILE_H = 360, 420
PAD = 8


def load_rows():
    with VISUAL.open(encoding="utf-8") as f:
        return list(csv.DictReader(f))


def fit(im: Image.Image, box: tuple[int, int]) -> Image.Image:
    im = im.convert("RGB")
    im.thumbnail(box, Image.Resampling.LANCZOS)
    canvas = Image.new("RGB", box, (245, 245, 245))
    x = (box[0] - im.size[0]) // 2
    y = (box[1] - im.size[1]) // 2
    canvas.paste(im, (x, y))
    return canvas


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    rows = sorted(load_rows(), key=lambda r: r["merchant_sku"])
    per_page = COLS * ROWS
    pages = (len(rows) + per_page - 1) // per_page
    try:
        font = ImageFont.truetype("arial.ttf", 14)
        font_sm = ImageFont.truetype("arial.ttf", 12)
    except Exception:
        font = ImageFont.load_default()
        font_sm = font

    for page in range(pages):
        chunk = rows[page * per_page : (page + 1) * per_page]
        sheet = Image.new("RGB", (COLS * TILE_W, ROWS * TILE_H), (255, 255, 255))
        draw = ImageDraw.Draw(sheet)
        for i, r in enumerate(chunk):
            c, rr = i % COLS, i // COLS
            x0, y0 = c * TILE_W, rr * TILE_H
            img_path = IMG / f"{r['merchant_sku']}.webp"
            if img_path.exists():
                try:
                    im = Image.open(img_path)
                    tile = fit(im, (TILE_W - 2 * PAD, 260))
                    sheet.paste(tile, (x0 + PAD, y0 + PAD))
                except Exception:
                    draw.rectangle([x0 + PAD, y0 + PAD, x0 + TILE_W - PAD, y0 + 260], outline=(200, 0, 0))
            status = r.get("overall_status") or r.get("reviewer_decision") or "PENDING"
            lines = [
                r["merchant_sku"],
                (r.get("name") or "")[:34],
                f"{r.get('brand','')} | {r.get('sizes','')}",
                f"{r.get('price','')} | {r.get('category_slug','')}",
                f"QA:{status}",
            ]
            ty = y0 + 270
            for li, line in enumerate(lines):
                draw.text((x0 + PAD, ty + li * 16), line, fill=(20, 20, 20), font=font_sm if li else font)
            draw.rectangle([x0, y0, x0 + TILE_W - 1, y0 + TILE_H - 1], outline=(210, 210, 210))
        out = OUT / f"PRIVATE_CATALOG_CONTACT_SHEET_{page+1:02d}.png"
        sheet.save(out, "PNG")
        print(out)


if __name__ == "__main__":
    main()
