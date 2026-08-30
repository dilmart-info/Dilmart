import { describe, expect, it } from "vitest";

import {
  categoryInitial,
  colorLuminance,
  isCutoutArtwork,
  readableTextColor,
  resolveCategoryTileImage,
  toCategoryDisplayLabel,
} from "./category-display";

describe("toCategoryDisplayLabel", () => {
  it("keeps short names untouched", () => {
    expect(toCategoryDisplayLabel("العطور والمعطرات")).toBe("العطور والمعطرات");
  });

  it("shortens long production category names to their leading words", () => {
    expect(toCategoryDisplayLabel("ماكينات حلاقة ومشابك كهربائية")).toBe("ماكينات حلاقة");
    expect(toCategoryDisplayLabel("مقصات وشفرات وموس احترافي")).toBe("مقصات وشفرات");
    expect(toCategoryDisplayLabel("تجهيزات صالون حلاقة رجالي")).toBe("تجهيزات صالون");
    expect(toCategoryDisplayLabel("تعقيم وقفازات ومناشف ولابس صحي")).toBe("تعقيم وقفازات");
    expect(toCategoryDisplayLabel("صبغة ومستلزمات صالون للشعر")).toBe("صبغة ومستلزمات");
  });

  it("drops separator glyphs instead of ending a label with them", () => {
    expect(toCategoryDisplayLabel("أدوات تصفيف — صالون نسائي")).toBe("أدوات تصفيف");
    expect(toCategoryDisplayLabel("ملحقات صالون — بخاخات وروب وعبوات")).toBe("ملحقات صالون");
  });

  it("never returns an empty label for a single very long word", () => {
    expect(toCategoryDisplayLabel("أ".repeat(40))).toHaveLength(40);
    expect(toCategoryDisplayLabel("")).toBe("");
  });
});

describe("readableTextColor", () => {
  it("prefers an explicit text color", () => {
    expect(readableTextColor("#111111", "#ff0000")).toBe("#ff0000");
  });

  it("returns light ink on a dark category background", () => {
    expect(readableTextColor("#111111")).toBe("#F7F4EF");
    expect(readableTextColor("rgb(20, 20, 20)")).toBe("#F7F4EF");
  });

  it("returns dark ink on a light category background", () => {
    expect(readableTextColor("#F3F3F2")).toBe("#14110F");
    expect(readableTextColor("#fff")).toBe("#14110F");
  });

  it("falls back to dark ink when the color cannot be parsed", () => {
    expect(readableTextColor("linear-gradient(black, white)")).toBe("#14110F");
    expect(readableTextColor(null)).toBe("#14110F");
  });

  it("computes luminance only for parseable colors", () => {
    expect(colorLuminance("#ffffff")).toBeCloseTo(1, 5);
    expect(colorLuminance("nope")).toBeNull();
  });
});

describe("isCutoutArtwork", () => {
  it("treats PNG/SVG artwork as cutout compositions", () => {
    expect(isCutoutArtwork("https://cdn.example.com/products/abc.png")).toBe(true);
    expect(isCutoutArtwork("https://cdn.example.com/products/abc.png?width=400")).toBe(true);
    expect(isCutoutArtwork("data:image/svg+xml,%3Csvg%3E")).toBe(true);
  });

  it("treats photography as cover artwork", () => {
    expect(isCutoutArtwork("https://images.unsplash.com/photo-123?w=800")).toBe(false);
    expect(isCutoutArtwork("https://cdn.example.com/a.jpg")).toBe(false);
    expect(isCutoutArtwork("")).toBe(false);
  });
});

describe("resolveCategoryTileImage", () => {
  it("prefers icon_url, then image_url, then the fallback", () => {
    expect(resolveCategoryTileImage({ icon_url: "icon.png", image_url: "img.jpg" }, "fb.svg")).toBe("icon.png");
    expect(resolveCategoryTileImage({ icon_url: "  ", image_url: "img.jpg" }, "fb.svg")).toBe("img.jpg");
    expect(resolveCategoryTileImage({ icon_url: null, image_url: null }, "fb.svg")).toBe("fb.svg");
  });
});

describe("categoryInitial", () => {
  it("returns the first letter of the category name", () => {
    expect(categoryInitial("العطور والمعطرات")).toBe("ا");
    expect(categoryInitial("— صبغة")).toBe("ص");
    expect(categoryInitial("")).toBe("•");
  });
});
