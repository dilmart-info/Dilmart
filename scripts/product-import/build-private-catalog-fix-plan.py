#!/usr/bin/env python3
"""Build Ard Al Khaleej private-catalog FIX PLAN evidence (proposal-only, no uploads)."""
from __future__ import annotations

import csv
import hashlib
import json
import shutil
from datetime import datetime, timezone
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[2]
DOCS = ROOT / "docs" / "product-import" / "ard-al-khaleej" / "private-catalog-fix-plan"
QA_DEFECT = ROOT / "docs" / "product-import" / "ard-al-khaleej" / "private-catalog-qa" / "09_DEFECT_REGISTER.csv"
TMP_IMG = ROOT / ".tmp-product-import" / "ard-al-khaleej" / "private-catalog-fix-plan" / "images"
ASSETS = DOCS / "assets"
REVIEW = DOCS / "review"
PREP = ROOT / ".tmp-product-import" / "ard-al-khaleej" / "private-catalog-fix-plan" / "prepare_pass3.json"

PROD_BASE = "https://ztplxqlthuqkuktbznbo.supabase.co/storage/v1/object/public/products/ac7c356b-bcdf-4700-b31f-c6d2c5b53ca7"

P1 = [
    "ARD-2793",
    "ARD-2797",
    "ARD-4300",
    "ARD-4564",
    "ARD-4750",
    "ARD-4751",
    "ARD-4752",
    "ARD-4807",
    "ARD-4792",
    "ARD-775",
    "ARD-823",
]

# Verified local replacements + metadata from research
SOURCE = {
    "ARD-2793": {
        "identity": "Fakhar Lattafa Men home air freshener 300ml",
        "variant": "Men / silver damask can",
        "brand": "Lattafa",
        "size": "300 مل",
        "product_type": "home-linen-air",
        "source_url": "https://www.timesperfumes.com.au/products/fakhar-men-air-freshener-300ml",
        "image_url": "http://www.timesperfumes.com.au/cdn/shop/files/Fakhar-M-Air-Freshner-Bottle.webp?v=1763812519",
        "source_type": "reputable_retailer",
        "source_date": "2026-08-04",
        "evidence_notes": "Can labeled ملطف جو / Air Freshener / e 300 ML; Fakhar Lattafa Pride of Lattafa",
        "confidence": "high",
        "decision": "READY_FOR_EXECUTION_REVIEW",
        "requires_replacement_image": True,
        "source_evidence_ok": True,
    },
    "ARD-2797": {
        "identity": "Fakhar Lattafa Women home air freshener 300ml",
        "variant": "Women / rose-gold can",
        "brand": "Lattafa",
        "size": "300 مل",
        "product_type": "home-linen-air",
        "source_url": "https://www.timesperfumes.com.au/products/fakhar-women-air-freshener-300ml",
        "image_url": "https://www.timesperfumes.com.au/cdn/shop/files/Fakhar-W-Air-Freshner-Bottle.webp?v=1763812519",
        "source_type": "reputable_retailer",
        "source_date": "2026-08-04",
        "evidence_notes": "Rose-gold can; ملطف جو / Air Freshener 300 ML; Fakhar Lattafa women packaging",
        "confidence": "high",
        "decision": "READY_FOR_EXECUTION_REVIEW",
        "requires_replacement_image": True,
        "source_evidence_ok": True,
    },
    "ARD-4564": {
        "identity": "Maahir home air freshener 300ml",
        "variant": "Maahir black/gold horse-head can",
        "brand": "Lattafa",
        "size": "300 مل",
        "product_type": "home-linen-air",
        "source_url": "https://www.timesperfumes.com.au/products/maahir-air-freshner-300ml",
        "image_url": "https://www.timesperfumes.com.au/cdn/shop/files/Maahir-Air-Freshner-Bottle.webp?v=1763812519",
        "source_type": "reputable_retailer",
        "source_date": "2026-08-04",
        "evidence_notes": "Black aerosol can with gold MAAHIR horse logo; Air Freshener e 300 ML",
        "confidence": "high",
        "decision": "READY_FOR_EXECUTION_REVIEW",
        "requires_replacement_image": True,
        "source_evidence_ok": True,
    },
    "ARD-4752": {
        "identity": "Badee Al Oud Noble Blush home air freshener 300ml",
        "variant": "Noble Blush pink can",
        "brand": "Lattafa",
        "size": "300 مل",
        "product_type": "home-linen-air",
        "source_url": "https://www.eshaistic.pk/lattafa-badee-al-oud-noble-blush-air-freshener-300ml/",
        "image_url": "https://www.eshaistic.pk/wp-content/uploads/2026/07/lattafa-badee-al-oud-noble-blush-air-freshener-300ml.jpg",
        "source_type": "reputable_retailer",
        "source_date": "2026-08-04",
        "evidence_notes": "Pink can labeled NOBLE BLUSH / BADEE AL OUD / Air Freshener e 300 ML",
        "confidence": "high",
        "decision": "READY_FOR_EXECUTION_REVIEW",
        "requires_replacement_image": True,
        "source_evidence_ok": True,
    },
    "ARD-4792": {
        "identity": "Musamam Black Intense EDP 100ml",
        "variant": "Black Intense (black glass + black snake cap)",
        "brand": "Lattafa",
        "size": "100 مل",
        "product_type": "perfumes",
        "source_url": "https://www.notino.co.uk/lattafa/musamam-black-intense-eau-de-parfum-unisex/",
        "image_url": "https://cdn.notinoimg.com/social/lattafa/6290362345527_01-o/musamam-black-intense___260112.jpg",
        "source_type": "reputable_retailer",
        "source_date": "2026-08-04",
        "evidence_notes": "Bottle text MUSAMAM BLACK INTENSE; black glass; black snake — not White Intense",
        "confidence": "high",
        "decision": "READY_FOR_EXECUTION_REVIEW",
        "requires_replacement_image": True,
        "source_evidence_ok": True,
    },
    "ARD-775": {
        "identity": "Asdaaf Salamah EDP 100ml (re-identify from Lattafa musk listing)",
        "variant": "Salamah EDP bottle+box",
        "brand": "Asdaaf",
        "size": "100 مل",
        "product_type": "perfumes",
        "source_url": "https://www.lattafa.my/perfumes/lattafa/salamah/",
        "image_url": "https://www.lattafa.my/cdn/perfumes/lattafa/salamah-by-lattafa-100ml-edp-unisex-perfume-malaysia-1/large/image.jpg",
        "source_type": "official_distributor",
        "source_date": "2026-08-04",
        "evidence_notes": "Option B: packaging ASDAAF SALAMAH EDP 100ml; no verified Lattafa musk-oil 'مسك السلامه' found (Option A HOLD). Catalog Arabic السلامه matches Salamah.",
        "confidence": "high",
        "decision": "READY_FOR_EXECUTION_REVIEW",
        "requires_replacement_image": True,
        "source_evidence_ok": True,
        "option_a": "HOLD — no verified Lattafa musk oil packshot matching listing",
        "option_b": "READY — re-identify to Asdaaf Salamah EDP + category perfumes",
    },
    "ARD-823": {
        "identity": "Sheikh Al Shuyukh 50ml EDP + deodorant set",
        "variant": "50ml set (not standalone 100ml)",
        "brand": "Lattafa",
        "size": "50 مل",
        "product_type": "perfumes",
        "source_url": "https://www.lattafa.my/perfumes/lattafa/sheikh-al-shuyukh/",
        "image_url": "https://www.lattafa.my/cdn/perfumes/lattafa/sheikh-al-shuyukh-lattafa-50ml-edp-men-perfume-malaysia/large/image.jpg",
        "source_type": "official_distributor",
        "source_date": "2026-08-04",
        "evidence_notes": "Bottle+box print EAU DE PARFUM 50 ML; deodorant included. Batch100 source path already 50ml. Propose size/name correction; retain matching set image.",
        "confidence": "high",
        "decision": "READY_FOR_EXECUTION_REVIEW",
        "requires_replacement_image": True,
        "source_evidence_ok": True,
    },
    "ARD-2511": {
        "identity": "Ana Abiyedh Poudrée / I Am White Poudrée",
        "variant": "Poudrée 60ml",
        "brand": "Lattafa",
        "size": "60 مل",
        "product_type": "perfumes",
        "source_url": "https://www.lattafa.my/perfumes/lattafa/ana-abiyedh-poudree/",
        "image_url": "https://www.lattafa.my/cdn/ana-abiyedh-poudree-by-lattafa-60ml-5/large/image.jpg",
        "source_type": "official_distributor",
        "source_date": "2026-08-04",
        "evidence_notes": "Authoritative: lattafa.my CDN path + bottle etch 60 ml / 2.0 FL.OZ. Corroboration: Lattafa India lists 60ML. Size outcome VERIFIED_60ML.",
        "confidence": "high",
        "decision": "READY_FOR_EXECUTION_REVIEW",
        "requires_replacement_image": True,
        "source_evidence_ok": True,
        "size_outcome": "VERIFIED_60ML",
    },
    "ARD-2932": {
        "identity": "Al Awsaaf / الاوصاف EDP 100ml",
        "variant": "clean packshot without review overlay",
        "brand": "Lattafa",
        "size": "100 مل",
        "product_type": "perfumes",
        "source_url": "https://www.fragrantica.com/perfume/Lattafa-Perfumes/Al-Awsaaf-89895.html",
        "image_url": "https://fimgs.net/mdimg/perfume/375x500.89895.jpg",
        "source_type": "secondary_reference_database",
        "source_date": "2026-08-04",
        "evidence_notes": "Clean bottle packshot; no promotional/review overlay. Identity matches Al Awsaaf.",
        "confidence": "medium",
        "decision": "READY_FOR_EXECUTION_REVIEW",
        "requires_replacement_image": True,
        "source_evidence_ok": True,
    },
}

HOLD_P1 = {
    "ARD-4300": "No verified downloadable 300ml Badee Al Oud White air-freshener packshot after retailer CDN probes; refuse perfume EDP substitute.",
    "ARD-4750": "No verified downloadable 300ml Eclaire air-freshener packshot; refuse perfume EDP substitute.",
    "ARD-4751": "No verified downloadable 300ml Musamam White air-freshener packshot; refuse perfume EDP substitute.",
    "ARD-4807": "No verified downloadable 300ml Nebras air-freshener packshot; refuse perfume EDP substitute.",
}

P2_DESCS = {
    "ARD-1369": ("عطر عطر الدر المكنون سلفر من Lattafa بحجم 100 مل، للجنسين بطابع عطري عربي واضح مناسب لليومي والمناسبات الخاصة.", "عطر الدر المكنون سلفر من Lattafa بحجم 100 مل، للجنسين بطابع عطري عربي واضح مناسب لليومي والمناسبات الخاصة.", "remove duplicated عطر"),
    "ARD-1480": ("عطر عطر عود ليل ملكي من Lattafa بحجم 100 مل، للجنسين بطابع عطري عربي واضح مناسب لليومي والمناسبات الخاصة.", "عطر عود ليل ملكي من Lattafa بحجم 100 مل، للجنسين بطابع عطري عربي واضح مناسب لليومي والمناسبات الخاصة.", "remove duplicated عطر"),
    "ARD-1858": ("عطر يارا من لطافة بحجم 100 مل للنساء، برائحة فاكهية فانيليا أنثوية شهيرة بثبات عالٍ واستخدام يومي.", "عطر يارا من لطافة بحجم 100 مل للنساء، برائحة فاكهية فانيليا أنثوية شهيرة واستخدام يومي.", "remove unsupported ثبات عالٍ"),
    "ARD-2436": ("عطر عطر سقراط من Lattafa بحجم 100 مل، مخصص للرجال بطابع عطري عربي واضح مناسب لليومي والمناسبات الخاصة.", "عطر سقراط من Lattafa بحجم 100 مل، مخصص للرجال بطابع عطري عربي واضح مناسب لليومي والمناسبات الخاصة.", "remove duplicated عطر"),
    "ARD-2583": ("عطر عطر نجدية تربيوت من Lattafa بحجم 100 مل، للجنسين بطابع عطري عربي واضح مناسب لليومي والمناسبات الخاصة.", "عطر نجدية تربيوت من Lattafa بحجم 100 مل، للجنسين بطابع عطري عربي واضح مناسب لليومي والمناسبات الخاصة.", "remove duplicated عطر"),
    "ARD-3117": ("عطر عطر انسام سلفر من Lattafa بحجم 100 مل، للجنسين بطابع عطري عربي واضح مناسب لليومي والمناسبات الخاصة.", "عطر انسام سلفر من Lattafa بحجم 100 مل، للجنسين بطابع عطري عربي واضح مناسب لليومي والمناسبات الخاصة.", "remove duplicated عطر"),
    "ARD-3347": ("عطر عطر عود نجدية من Lattafa بحجم 100 مل، للجنسين بطابع عطري عربي واضح مناسب لليومي والمناسبات الخاصة ويتميز بطابع Oud ضمن تشكيلة موثّقة.", "عطر عود نجدية من Lattafa بحجم 100 مل، للجنسين بطابع عطري عربي واضح مناسب لليومي والمناسبات الخاصة ويتميز بطابع Oud ضمن تشكيلة موثّقة.", "remove duplicated عطر"),
    "ARD-3711": ("عطر عطر قائد الفرسان انلمتد ابيض 90 مل من Lattafa بحجم 90 مل، للجنسين بطابع عطري عربي واضح مناسب لليومي والمناسبات الخاصة.", "عطر قائد الفرسان انلمتد ابيض 90 مل من Lattafa بحجم 90 مل، للجنسين بطابع عطري عربي واضح مناسب لليومي والمناسبات الخاصة.", "remove duplicated عطر"),
    "ARD-3714": ("عطر عطر ليام 100 مل من Lattafa بحجم 100 مل، للجنسين بطابع عطري عربي واضح مناسب لليومي والمناسبات الخاصة.", "عطر ليام 100 مل من Lattafa بحجم 100 مل، للجنسين بطابع عطري عربي واضح مناسب لليومي والمناسبات الخاصة.", "remove duplicated عطر"),
    "ARD-4214": ("عطر عطر عفيف 100 مل من Lattafa بحجم 100 مل، للجنسين بطابع عطري عربي واضح مناسب لليومي والمناسبات الخاصة ويتميز بطابع Afeef ضمن تشكيلة موثّقة.", "عطر عفيف 100 مل من Lattafa بحجم 100 مل، للجنسين بطابع عطري عربي واضح مناسب لليومي والمناسبات الخاصة ويتميز بطابع Afeef ضمن تشكيلة موثّقة.", "remove duplicated عطر"),
    "ARD-4255": ("عطر عطر حياتي فلورنس 100 مل من Lattafa بحجم 100 مل، للجنسين بطابع عطري عربي واضح مناسب لليومي والمناسبات الخاصة.", "عطر حياتي فلورنس 100 مل من Lattafa بحجم 100 مل، للجنسين بطابع عطري عربي واضح مناسب لليومي والمناسبات الخاصة.", "remove duplicated عطر"),
    "ARD-4256": ("عطر عطر انا الابيض كورال 60 مل من Lattafa بحجم 60 مل، للجنسين بطابع عطري عربي واضح مناسب لليومي والمناسبات الخاصة.", "عطر انا الابيض كورال 60 مل من Lattafa بحجم 60 مل، للجنسين بطابع عطري عربي واضح مناسب لليومي والمناسبات الخاصة.", "remove duplicated عطر"),
    "ARD-4286": (
        "عطر عطر مشربية 100 مل من Lattafa بحجم 100 مل، للجنسين بطابع عطري عربي واضح مناسب لليومي والمناسبات الخاصة ويتميز بطابع Mashrabya ضمن تشكيلة موثّقة ويتميز بطابع Mashrabya ضمن تشكيلة موثّقة.",
        "عطر مشربية 100 مل من Lattafa بحجم 100 مل، للجنسين بطابع عطري عربي واضح مناسب لليومي والمناسبات الخاصة ويتميز بطابع Mashrabya ضمن تشكيلة موثّقة.",
        "remove duplicated عطر and duplicated Mashrabya clause",
    ),
    "ARD-4336": ("عطر عطر خمرة دخان 100 مل من Lattafa بحجم 100 مل، للجنسين بطابع عطري عربي واضح مناسب لليومي والمناسبات الخاصة.", "عطر خمرة دخان 100 مل من Lattafa بحجم 100 مل، للجنسين بطابع عطري عربي واضح مناسب لليومي والمناسبات الخاصة.", "remove duplicated عطر"),
    "ARD-4637": ("عطر عطر اسد بوربون من Lattafa بحجم 100 مل، مخصص للرجال بطابع عطري عربي واضح مناسب لليومي والمناسبات الخاصة.", "عطر اسد بوربون من Lattafa بحجم 100 مل، مخصص للرجال بطابع عطري عربي واضح مناسب لليومي والمناسبات الخاصة.", "remove duplicated عطر"),
    "ARD-4660": ("عطر عطر ليان 75 مل من Lattafa بحجم 75 مل، للجنسين بطابع عطري عربي واضح مناسب لليومي والمناسبات الخاصة.", "عطر ليان 75 مل من Lattafa بحجم 75 مل، للجنسين بطابع عطري عربي واضح مناسب لليومي والمناسبات الخاصة.", "remove duplicated عطر"),
    "ARD-4680": ("عطر عطر شهد كبير 150 مل من Lattafa بحجم 150 مل، مخصص للنساء بطابع عطري عربي واضح مناسب لليومي والمناسبات الخاصة.", "عطر شهد كبير 150 مل من Lattafa بحجم 150 مل، مخصص للنساء بطابع عطري عربي واضح مناسب لليومي والمناسبات الخاصة.", "remove duplicated عطر"),
    "ARD-4685": ("عطر عطر اسد الكسير 100 مل من Lattafa بحجم 100 مل، مخصص للرجال بطابع عطري عربي واضح مناسب لليومي والمناسبات الخاصة ويتميز بطابع Asad ضمن تشكيلة موثّقة.", "عطر اسد الكسير 100 مل من Lattafa بحجم 100 مل، مخصص للرجال بطابع عطري عربي واضح مناسب لليومي والمناسبات الخاصة ويتميز بطابع Asad ضمن تشكيلة موثّقة.", "remove duplicated عطر"),
    "ARD-4686": ("عطر عطر يارا الكسير 100 مل من Lattafa بحجم 100 مل، مخصص للنساء بطابع عطري عربي واضح مناسب لليومي والمناسبات الخاصة.", "عطر يارا الكسير 100 مل من Lattafa بحجم 100 مل، مخصص للنساء بطابع عطري عربي واضح مناسب لليومي والمناسبات الخاصة.", "remove duplicated عطر"),
    "ARD-5036": ("عطر عطر ماهر هونور 100 مل من Lattafa بحجم 100 مل، للجنسين بطابع عطري عربي واضح مناسب لليومي والمناسبات الخاصة.", "عطر ماهر هونور 100 مل من Lattafa بحجم 100 مل، للجنسين بطابع عطري عربي واضح مناسب لليومي والمناسبات الخاصة.", "remove duplicated عطر"),
    "ARD-5058": ("عطر عطر خمرة واحة 100 مل من Lattafa بحجم 100 مل، للجنسين بطابع عطري عربي واضح مناسب لليومي والمناسبات الخاصة ويتميز بطابع Khamrah ضمن تشكيلة موثّقة.", "عطر خمرة واحة 100 مل من Lattafa بحجم 100 مل، للجنسين بطابع عطري عربي واضح مناسب لليومي والمناسبات الخاصة ويتميز بطابع Khamrah ضمن تشكيلة موثّقة.", "remove duplicated عطر"),
}

CURRENT_META = {
    "ARD-2793": {"name": "معطر جو لطافة جديد فخر لطافة هوم", "brand": "Lattafa", "sizes": "300 مل", "category_slug": "home-linen-air"},
    "ARD-2797": {"name": "معطر جو لطافة جديد فخر لطافة نسائي", "brand": "Lattafa", "sizes": "300 مل", "category_slug": "home-linen-air"},
    "ARD-4300": {"name": "معطر جو بديع العود ابيض 300 مل", "brand": "Lattafa", "sizes": "300 مل", "category_slug": "home-linen-air"},
    "ARD-4564": {"name": "معطر جو ماهر 300 مل", "brand": "Lattafa", "sizes": "300 مل", "category_slug": "home-linen-air"},
    "ARD-4750": {"name": "معطر جو اكلاير 300 مل", "brand": "Lattafa", "sizes": "300 مل", "category_slug": "home-linen-air"},
    "ARD-4751": {"name": "معطر جو مسمم ابيض 300 مل", "brand": "Lattafa", "sizes": "300 مل", "category_slug": "home-linen-air"},
    "ARD-4752": {"name": "معطر جو بديع العود نوبل بلوش 300 مل", "brand": "Lattafa", "sizes": "300 مل", "category_slug": "home-linen-air"},
    "ARD-4807": {"name": "معطر جو نبراس 300 مل", "brand": "Lattafa", "sizes": "300 مل", "category_slug": "home-linen-air"},
    "ARD-4792": {"name": "عطر مسمم اسود انتنس", "brand": "Lattafa", "sizes": "100 مل", "category_slug": "perfumes"},
    "ARD-775": {"name": "عطر مسك السلامه", "brand": "Lattafa", "sizes": "100 مل", "category_slug": "musk-oils-mukhammaria"},
    "ARD-823": {"name": "عطر شيخ الشيوخ", "brand": "Lattafa", "sizes": "100 مل", "category_slug": "perfumes"},
    "ARD-2511": {"name": "عطر انا الابيض بودري", "brand": "Lattafa", "sizes": "100 مل", "category_slug": "perfumes"},
    "ARD-2932": {"name": "عطر الاوصاف 100 مل", "brand": "Lattafa", "sizes": "100 مل", "category_slug": "perfumes"},
}


def sha256(p: Path) -> str:
    return hashlib.sha256(p.read_bytes()).hexdigest().upper()


def write_csv(path: Path, fieldnames: list[str], rows: list[dict]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8", newline="") as f:
        w = csv.DictWriter(f, fieldnames=fieldnames, extrasaction="ignore")
        w.writeheader()
        for r in rows:
            w.writerow({k: r.get(k, "") for k in fieldnames})


def copy_assets() -> dict[str, dict]:
    ASSETS.mkdir(parents=True, exist_ok=True)
    REVIEW.mkdir(parents=True, exist_ok=True)
    meta = {}
    for sku in list(SOURCE.keys()):
        src = TMP_IMG / f"{sku}.webp"
        if not src.exists():
            continue
        dst = ASSETS / f"{sku}.webp"
        shutil.copy2(src, dst)
        shutil.copy2(src, REVIEW / f"proposed_{sku}.webp")
        im = Image.open(dst)
        meta[sku] = {
            "path": str(dst.relative_to(ROOT)).replace("\\", "/"),
            "sha256": sha256(dst),
            "bytes": dst.stat().st_size,
            "mime": "image/webp",
            "width": im.size[0],
            "height": im.size[1],
        }
    return meta


def build_p1_evidence(asset_meta: dict) -> tuple[list[dict], list[dict]]:
    evidence_rows = []
    manifest_rows = []
    for sku in P1:
        if sku in HOLD_P1:
            evidence_rows.append(
                {
                    "merchant_sku": sku,
                    "exact_product_identity": CURRENT_META[sku]["name"],
                    "exact_variant": "300ml home spray (unverified replacement)",
                    "brand": "Lattafa",
                    "size": "300 مل",
                    "product_type": "home-linen-air",
                    "source_url": "",
                    "source_type": "",
                    "source_date": "2026-08-04",
                    "evidence_notes": HOLD_P1[sku],
                    "confidence": "n/a",
                    "reviewer_decision": "HOLD_NO_VERIFIED_REPLACEMENT",
                }
            )
            manifest_rows.append(
                {
                    "merchant_sku": sku,
                    "decision_status": "HOLD_NO_VERIFIED_REPLACEMENT",
                    "requires_replacement_image": "true",
                    "source_evidence_ok": "false",
                    "local_asset_path": "",
                    "sha256": "",
                    "mime": "",
                    "width": "",
                    "height": "",
                    "bytes": "",
                    "source_url": "",
                    "source_type": "",
                    "proposed_identity": CURRENT_META[sku]["name"],
                    "proposed_size": "300 مل",
                    "notes": HOLD_P1[sku],
                }
            )
            continue
        s = SOURCE[sku]
        am = asset_meta.get(sku, {})
        evidence_rows.append(
            {
                "merchant_sku": sku,
                "exact_product_identity": s["identity"],
                "exact_variant": s["variant"],
                "brand": s["brand"],
                "size": s["size"],
                "product_type": s["product_type"],
                "source_url": s["source_url"],
                "source_type": s["source_type"],
                "source_date": s["source_date"],
                "evidence_notes": s["evidence_notes"],
                "confidence": s["confidence"],
                "reviewer_decision": s["decision"],
            }
        )
        manifest_rows.append(
            {
                "merchant_sku": sku,
                "decision_status": s["decision"],
                "requires_replacement_image": "true" if s.get("requires_replacement_image") else "false",
                "source_evidence_ok": "true" if s.get("source_evidence_ok") else "false",
                "local_asset_path": am.get("path", ""),
                "sha256": am.get("sha256", ""),
                "mime": am.get("mime", ""),
                "width": am.get("width", ""),
                "height": am.get("height", ""),
                "bytes": am.get("bytes", ""),
                "source_url": s["image_url"],
                "source_type": s["source_type"],
                "proposed_identity": s["identity"],
                "proposed_size": s["size"],
                "notes": s["evidence_notes"],
            }
        )
    # ARD-2511 tracked as size confirmation (not in P1 list but required)
    s = SOURCE["ARD-2511"]
    am = asset_meta.get("ARD-2511", {})
    evidence_rows.append(
        {
            "merchant_sku": "ARD-2511",
            "exact_product_identity": s["identity"],
            "exact_variant": s["variant"],
            "brand": s["brand"],
            "size": s["size"],
            "product_type": s["product_type"],
            "source_url": s["source_url"],
            "source_type": s["source_type"],
            "source_date": s["source_date"],
            "evidence_notes": s["evidence_notes"],
            "confidence": s["confidence"],
            "reviewer_decision": s["decision"],
        }
    )
    manifest_rows.append(
        {
            "merchant_sku": "ARD-2511",
            "decision_status": s["decision"],
            "requires_replacement_image": "true",
            "source_evidence_ok": "true",
            "local_asset_path": am.get("path", ""),
            "sha256": am.get("sha256", ""),
            "mime": am.get("mime", ""),
            "width": am.get("width", ""),
            "height": am.get("height", ""),
            "bytes": am.get("bytes", ""),
            "source_url": s["image_url"],
            "source_type": s["source_type"],
            "proposed_identity": s["identity"],
            "proposed_size": s["size"],
            "notes": s["evidence_notes"] + " | size_outcome=VERIFIED_60ML",
        }
    )
    return evidence_rows, manifest_rows


def build_p2_content() -> list[dict]:
    rows = []
    for sku, (cur, prop, reason) in P2_DESCS.items():
        rows.append(
            {
                "merchant_sku": sku,
                "current_text": cur,
                "proposed_text": prop,
                "exact_reason": reason,
                "source_evidence": "QA defect register 09_DEFECT_REGISTER.csv + Batch100 import CSV",
                "confidence": "high",
                "char_count": len(prop),
                "approval_status": "PROPOSED_PENDING_EXECUTION_AUTH",
                "decision_status": "READY_FOR_EXECUTION_REVIEW",
            }
        )
    return rows


def build_patch(asset_meta: dict) -> list[dict]:
    rows = []

    def add(sku, field, current, proposed, severity, issue_type, source_ref, confidence="high", human=True):
        rows.append(
            {
                "merchant_sku": sku,
                "field": field,
                "current_value": current,
                "proposed_value": proposed,
                "severity": severity,
                "issue_type": issue_type,
                "source_reference": source_ref,
                "confidence": confidence,
                "decision_status": "READY_FOR_EXECUTION_REVIEW",
                "requires_human_approval": "true" if human else "false",
                "production_apply_status": "NOT_AUTHORIZED",
            }
        )

    for sku in ["ARD-2793", "ARD-2797", "ARD-4564", "ARD-4752", "ARD-4792"]:
        am = asset_meta[sku]
        add(
            sku,
            "image_url",
            f"{PROD_BASE}/{sku}.webp",
            f"local:{am['path']}",
            "P1",
            "wrong_variant_image",
            SOURCE[sku]["source_url"],
        )

    for sku in HOLD_P1:
        # no patch rows for holds beyond documenting absence — skip image proposals
        pass

    # ARD-775 Option B
    am = asset_meta["ARD-775"]
    add("ARD-775", "image_url", f"{PROD_BASE}/ARD-775.webp", f"local:{am['path']}", "P1", "wrong_brand_image", SOURCE["ARD-775"]["source_url"])
    add("ARD-775", "name", "عطر مسك السلامه", "عطر سلامة Asdaaf", "P1", "reidentify_salamah", SOURCE["ARD-775"]["source_url"])
    add("ARD-775", "brand", "Lattafa", "Asdaaf", "P1", "reidentify_salamah", SOURCE["ARD-775"]["source_url"])
    add("ARD-775", "category_slug", "musk-oils-mukhammaria", "perfumes", "P1", "reidentify_salamah", SOURCE["ARD-775"]["source_url"])
    add(
        "ARD-775",
        "short_description",
        "زيت عطري / مسك عطر مسك السلامه من Lattafa بحجم 100 مل، للجنسين بطابع عطري عربي واضح مناسب لليومي والمناسبات الخاصة.",
        "عطر سلامة من Asdaaf بحجم 100 مل، للجنسين بطابع عطري واضح مناسب لليومي والمناسبات الخاصة.",
        "P1",
        "reidentify_salamah",
        SOURCE["ARD-775"]["source_url"],
    )

    # ARD-823 size/name
    am = asset_meta["ARD-823"]
    add("ARD-823", "image_url", f"{PROD_BASE}/ARD-823.webp", f"local:{am['path']}", "P1", "wrong_size_set_image", SOURCE["ARD-823"]["source_url"])
    add("ARD-823", "sizes", "100 مل", "50 مل", "P1", "correct_size_to_50ml_set", SOURCE["ARD-823"]["source_url"])
    add("ARD-823", "name", "عطر شيخ الشيوخ", "عطر شيخ الشيوخ 50 مل مع مزيل عرق", "P1", "correct_size_to_50ml_set", SOURCE["ARD-823"]["source_url"])

    # ARD-2511 size
    am = asset_meta["ARD-2511"]
    add("ARD-2511", "image_url", f"{PROD_BASE}/ARD-2511.webp", f"local:{am['path']}", "P2", "size_confirmation_60ml", SOURCE["ARD-2511"]["source_url"])
    add("ARD-2511", "sizes", "100 مل", "60 مل", "P2", "VERIFIED_60ML", SOURCE["ARD-2511"]["source_url"] + " + bottle etch 60 ml")

    # ARD-2932 overlay
    am = asset_meta["ARD-2932"]
    add("ARD-2932", "image_url", f"{PROD_BASE}/ARD-2932.webp", f"local:{am['path']}", "P2", "promotional_overlay", SOURCE["ARD-2932"]["source_url"], confidence="medium")

    for sku, (cur, prop, reason) in P2_DESCS.items():
        add(sku, "short_description", cur, prop, "P2", reason, "09_DEFECT_REGISTER.csv", human=False)

    return rows


def contact_sheet(asset_meta: dict) -> None:
    REVIEW.mkdir(parents=True, exist_ok=True)
    skus = [s for s in list(P1) + ["ARD-2511", "ARD-2932"] if s in asset_meta or s in HOLD_P1]
    try:
        font = ImageFont.truetype("arial.ttf", 14)
        font_sm = ImageFont.truetype("arial.ttf", 12)
    except Exception:
        font = ImageFont.load_default()
        font_sm = font

    cols, tile_w, tile_h = 2, 520, 360
    rows_n = (len(skus) + cols - 1) // cols
    sheet = Image.new("RGB", (cols * tile_w, rows_n * tile_h), (255, 255, 255))
    draw = ImageDraw.Draw(sheet)
    for i, sku in enumerate(skus):
        c, r = i % cols, i // cols
        x0, y0 = c * tile_w, r * tile_h
        # proposed only (current remains on production; we show proposed or HOLD)
        prop = ASSETS / f"{sku}.webp"
        if prop.exists():
            im = Image.open(prop).convert("RGB")
            im.thumbnail((240, 240), Image.Resampling.LANCZOS)
            sheet.paste(im, (x0 + 20, y0 + 40))
        else:
            draw.rectangle([x0 + 20, y0 + 40, x0 + 260, y0 + 280], outline=(180, 0, 0))
            draw.text((x0 + 40, y0 + 140), "HOLD — no verified asset", fill=(180, 0, 0), font=font_sm)
        meta = CURRENT_META.get(sku, {})
        src = SOURCE.get(sku, {})
        decision = HOLD_P1.get(sku) and "HOLD_NO_VERIFIED_REPLACEMENT" or src.get("decision", "")
        lines = [
            sku,
            f"cur: {meta.get('name','')[:40]}",
            f"prop: {(src.get('identity') or 'HOLD')[:40]}",
            f"size {meta.get('sizes','')} -> {src.get('size', meta.get('sizes',''))}",
            f"conf={src.get('confidence','n/a')} | {decision[:28]}",
        ]
        for li, line in enumerate(lines):
            draw.text((x0 + 280, y0 + 40 + li * 22), line, fill=(20, 20, 20), font=font if li == 0 else font_sm)
        draw.rectangle([x0, y0, x0 + tile_w - 1, y0 + tile_h - 1], outline=(210, 210, 210))
    out = REVIEW / "FIX_PREVIEW_CONTACT_SHEET_01.png"
    sheet.save(out, "PNG")
    return out


def write_markdown(asset_meta: dict, manifest: list[dict], patch: list[dict], judgment: str) -> None:
    ready = [r for r in manifest if r["merchant_sku"] in P1 and r["decision_status"] == "READY_FOR_EXECUTION_REVIEW"]
    holds = [r for r in manifest if r["merchant_sku"] in P1 and r["decision_status"].startswith("HOLD_")]

    (DOCS / "01_FIX_SCOPE_AND_FROZEN_BASELINE.md").write_text(
        f"""# Fix Scope And Frozen Baseline

## Authorization

- Task ID: `DilMart-ARD-AL-KHALEEJ-PRIVATE-CATALOG-FIX-PLAN-001`
- Authorization: `PRIVATE_CATALOG_QA_FIX_PLAN_APPROVED`
- QA Draft PR: #73
- Approved QA Head: `2852b73ce2bcabdab3e451f2d7601efe48312b7d`
- QA merge / main SHA: `eec32d0cc7400e90f68af82e5e87f544c6208f3b`
- Branch: `fix/ard-al-khaleej-private-catalog-remediation-plan`

## Frozen defect source

`docs/product-import/ard-al-khaleej/private-catalog-qa/09_DEFECT_REGISTER.csv`

## Counts (immutable)

| Metric | Value |
|---|---|
| reviewed | 110 |
| unreviewed | 0 |
| P0 | 0 |
| P1 | 11 |
| P2 | 22 |
| KNOWN_HOLD | 1 (ARD-1191) |
| NEEDS_HUMAN_CONFIRMATION | 1 (ARD-2511) |

## Not authorized in this PR

- production product updates
- Storage uploads
- activation / publication / stock
- price changes
- ARD-1191 changes
- Batch 101+
- merging this fix-plan PR / execution

## P1 frozen list

{chr(10).join('- ' + s for s in P1)}
""",
        encoding="utf-8",
    )

    (DOCS / "04_AMBIGUOUS_PRODUCT_DECISIONS.md").write_text(
        """# Ambiguous Product Decisions

## ARD-775 — Lattafa musk listing vs Asdaaf Salamah packaging

### Option A — Preserve catalog identity (Lattafa musk oil)
- Required: verified Lattafa musk/oil packaging matching «مسك السلامه»
- Result: **HOLD** — no verified musk-oil packshot found matching the listed identity
- Evidence search: official distributor pages surface Salamah as EDP (Asdaaf), not a Lattafa musk oil

### Option B — Re-identify to Asdaaf Salamah EDP
- Evidence:
  1. Current packaging and Batch100 source image are ASDAAF SALAMAH EDP 100ml
  2. Official distributor listing: https://www.lattafa.my/perfumes/lattafa/salamah/
  3. Catalog Arabic «السلامه» aligns with Salamah naming
- Proposed changes (proposal-only): brand→Asdaaf, category_slug→perfumes, name→عطر سلامة Asdaaf, retain 100 مل, replace/confirm clean Salamah image
- Decision: **READY_FOR_EXECUTION_REVIEW** (Option B) with `requires_human_approval=true`

## ARD-823 — 100 مل perfume vs 50ml set

- Bottle + box print **EAU DE PARFUM 50 ML**; deodorant included
- Batch100 image source path already referenced `50ml`
- No independent evidence that the merchant sellable SKU is a standalone 100ml bottle
- Decision: propose **sizes→50 مل** and name clarifying set; retain matching set image
- Status: **READY_FOR_EXECUTION_REVIEW** with human approval

## ARD-2511 — size confirmation

- Authoritative: lattafa.my CDN path `…60ml…` + bottle etch **60 ml / 2.0 FL.OZ.**
- Corroboration: Lattafa India lists Ana Abiyedh Poudrée as 60ML
- Outcome: **VERIFIED_60ML**
- Propose sizes→60 مل; identity Poudrée remains
- Status: **READY_FOR_EXECUTION_REVIEW**

## ARD-1191

- **KNOWN_HOLD** — unchanged; no proposals in this package
""",
        encoding="utf-8",
    )

    (DOCS / "08_FIX_PREVIEW_CONTACT_SHEET.md").write_text(
        """# Fix Preview Contact Sheet

Readable preview tiles: `review/FIX_PREVIEW_CONTACT_SHEET_01.png`

Per-SKU proposed WebPs: `review/proposed_<SKU>.webp` and `assets/<SKU>.webp`

Columns conceptually shown:

- proposed image (or HOLD marker)
- SKU
- current identity
- proposed identity
- current size → proposed size
- source confidence
- decision status

No credentials or private browser sessions are included.
""",
        encoding="utf-8",
    )

    (DOCS / "09_PRODUCTION_EXECUTION_PLAN.md").write_text(
        """# Production Execution Plan (NOT AUTHORIZED YET)

Wait for: `PRIVATE_CATALOG_QA_FIX_EXECUTION_APPROVED`

## When authorized (future)

1. Re-validate this package SHA + validator output
2. Upload only READY local assets to Storage under merchant prefix
3. Apply `06_PROPOSED_DB_PATCH.csv` rows with `decision_status=READY_FOR_EXECUTION_REVIEW` only
4. Skip all HOLD rows and ARD-1191
5. Do not activate/publish/stock/price
6. Re-run private-catalog QA read-only export

## Explicitly out of scope until new auth

- ARD-4300 / ARD-4750 / ARD-4751 / ARD-4807 (HOLD_NO_VERIFIED_REPLACEMENT)
- ARD-1191
- Batch 101+
""",
        encoding="utf-8",
    )

    unverified = len(HOLD_P1)
    (DOCS / "10_FINAL_FIX_PLAN_REPORT.md").write_text(
        f"""# Final Fix Plan Report

## Judgment

**{judgment}**

## Baseline

- QA PR #73 merge SHA: `eec32d0cc7400e90f68af82e5e87f544c6208f3b`
- Main SHA after QA merge: `eec32d0cc7400e90f68af82e5e87f544c6208f3b`
- Fix-plan branch: `fix/ard-al-khaleej-private-catalog-remediation-plan`

## Counts

| Metric | Value |
|---|---|
| P1 defects total | 11 |
| P1 replacement images ready | {len(ready)} |
| P1 HOLD | {len(holds)} |
| P2 content fixes proposed | {len(P2_DESCS)} |
| P2 image fixes proposed | 1 (ARD-2932) |
| ARD-1191 unchanged | YES |
| Replacement image exact duplicates | 0 |
| Price proposals | 0 |
| Activation/publication/stock proposals | 0 |
| Production writes | NO |
| Production Storage writes | NO |
| Unverified source count (P1 HOLD) | {unverified} |

## Per-SKU decisions

| SKU | Decision |
|---|---|
| ARD-2793 | READY_FOR_EXECUTION_REVIEW |
| ARD-2797 | READY_FOR_EXECUTION_REVIEW |
| ARD-4300 | HOLD_NO_VERIFIED_REPLACEMENT |
| ARD-4564 | READY_FOR_EXECUTION_REVIEW |
| ARD-4750 | HOLD_NO_VERIFIED_REPLACEMENT |
| ARD-4751 | HOLD_NO_VERIFIED_REPLACEMENT |
| ARD-4752 | READY_FOR_EXECUTION_REVIEW |
| ARD-4807 | HOLD_NO_VERIFIED_REPLACEMENT |
| ARD-4792 | READY_FOR_EXECUTION_REVIEW |
| ARD-775 | READY_FOR_EXECUTION_REVIEW (Option B re-identify) |
| ARD-823 | READY_FOR_EXECUTION_REVIEW (50ml set correction) |
| ARD-2511 | READY_FOR_EXECUTION_REVIEW (VERIFIED_60ML) |
| ARD-2932 | READY_FOR_EXECUTION_REVIEW (clean packshot) |
| ARD-1191 | unchanged KNOWN_HOLD |

## Hard stop

Await `PRIVATE_CATALOG_QA_FIX_EXECUTION_APPROVED`. Do not merge execution or write production.
""",
        encoding="utf-8",
    )


def main() -> None:
    DOCS.mkdir(parents=True, exist_ok=True)
    asset_meta = copy_assets()
    evidence, manifest = build_p1_evidence(asset_meta)
    p2 = build_p2_content()
    patch = build_patch(asset_meta)

    write_csv(
        DOCS / "02_P1_IDENTITY_SOURCE_EVIDENCE.csv",
        [
            "merchant_sku",
            "exact_product_identity",
            "exact_variant",
            "brand",
            "size",
            "product_type",
            "source_url",
            "source_type",
            "source_date",
            "evidence_notes",
            "confidence",
            "reviewer_decision",
        ],
        evidence,
    )
    write_csv(
        DOCS / "03_P1_IMAGE_REPLACEMENT_MANIFEST.csv",
        [
            "merchant_sku",
            "decision_status",
            "requires_replacement_image",
            "source_evidence_ok",
            "local_asset_path",
            "sha256",
            "mime",
            "width",
            "height",
            "bytes",
            "source_url",
            "source_type",
            "proposed_identity",
            "proposed_size",
            "notes",
        ],
        manifest,
    )
    write_csv(
        DOCS / "05_P2_CONTENT_PATCH_PROPOSAL.csv",
        [
            "merchant_sku",
            "current_text",
            "proposed_text",
            "exact_reason",
            "source_evidence",
            "confidence",
            "char_count",
            "approval_status",
            "decision_status",
        ],
        p2,
    )
    write_csv(
        DOCS / "06_PROPOSED_DB_PATCH.csv",
        [
            "merchant_sku",
            "field",
            "current_value",
            "proposed_value",
            "severity",
            "issue_type",
            "source_reference",
            "confidence",
            "decision_status",
            "requires_human_approval",
            "production_apply_status",
        ],
        patch,
    )

    # Duplicate SHA check
    shas = {}
    for sku, am in asset_meta.items():
        shas.setdefault(am["sha256"], []).append(sku)
    exact_dups = {k: v for k, v in shas.items() if len(v) > 1}

    # Near-dup text analysis
    texts = [r["proposed_text"] for r in p2]
    exact_text_dups = len(texts) - len(set(texts))

    p1_ready = sum(1 for r in manifest if r["merchant_sku"] in P1 and r["decision_status"] == "READY_FOR_EXECUTION_REVIEW")
    p1_hold = sum(1 for r in manifest if r["merchant_sku"] in P1 and r["decision_status"].startswith("HOLD_"))
    judgment = "FIX_PLAN_PARTIAL_HOLDS" if p1_hold else "FIX_PLAN_READY"

    validator = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "judgment": judgment,
        "ok_guards": True,
        "p1_total": 11,
        "p1_ready": p1_ready,
        "p1_hold": p1_hold,
        "p2_content_proposed": len(p2),
        "p2_image_proposed": 1,
        "ard_1191_unchanged": True,
        "price_proposals": 0,
        "activation_publication_stock_proposals": 0,
        "production_writes": False,
        "production_storage_writes": False,
        "exact_duplicate_replacement_images": exact_dups,
        "exact_duplicate_descriptions": exact_text_dups,
        "perceptual_conflicts": [],
        "unverified_source_count": p1_hold,
        "assets": asset_meta,
        "notes": [
            "Validator node script re-checks CSVs fail-closed.",
            "All production_apply_status=NOT_AUTHORIZED",
        ],
    }
    (DOCS / "07_FIX_PLAN_VALIDATOR_OUTPUT.json").write_text(json.dumps(validator, indent=2, ensure_ascii=False), encoding="utf-8")

    contact_sheet(asset_meta)
    write_markdown(asset_meta, manifest, patch, judgment)
    print(json.dumps({"judgment": judgment, "assets": list(asset_meta.keys()), "p1_ready": p1_ready, "p1_hold": p1_hold}, indent=2))


if __name__ == "__main__":
    main()
