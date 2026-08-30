/**
 * Shared marketplace category hierarchy helpers.
 * Visibility is driven by `is_active` only — product occupancy never drops a category.
 */

export type MarketplaceCategoryRow = {
  id: string;
  name: string;
  slug: string;
  parent_id: string | null;
  is_active?: boolean | null;
  is_featured?: boolean | null;
  sort_order?: number | null;
  image_url?: string | null;
  icon_url?: string | null;
  layout_variant?: string | null;
  background_color?: string | null;
  text_color?: string | null;
  [key: string]: unknown;
};

export type CategoryScope = {
  selectedCategory: MarketplaceCategoryRow;
  /** Selected id + all active descendants (any depth). */
  categoryIds: string[];
  isParent: boolean;
  parent: MarketplaceCategoryRow | null;
  children: MarketplaceCategoryRow[];
};

export type CategoryWithPublicCounts = MarketplaceCategoryRow & {
  direct_public_product_count: number;
  subtree_public_product_count: number;
  has_public_products: boolean;
};

/** Deterministic storefront order: featured → sort_order → name. */
export function sortCategoriesDeterministic<T extends MarketplaceCategoryRow>(rows: T[]): T[] {
  return [...rows].sort((a, b) => {
    const feat = Number(Boolean(b.is_featured)) - Number(Boolean(a.is_featured));
    if (feat !== 0) return feat;
    const so = Number(a.sort_order ?? 0) - Number(b.sort_order ?? 0);
    if (so !== 0) return so;
    return String(a.name ?? "").localeCompare(String(b.name ?? ""), "ar");
  });
}

export function isActiveCategory(row: MarketplaceCategoryRow | null | undefined): boolean {
  return Boolean(row) && row!.is_active !== false;
}

/** Active descendants of `rootId` at any depth (root itself excluded). */
export function collectActiveDescendantIds(
  categories: MarketplaceCategoryRow[],
  rootId: string,
): string[] {
  const byParent = new Map<string, MarketplaceCategoryRow[]>();
  for (const c of categories) {
    if (!c.parent_id || !isActiveCategory(c)) continue;
    const list = byParent.get(c.parent_id) ?? [];
    list.push(c);
    byParent.set(c.parent_id, list);
  }

  const out: string[] = [];
  const queue = [rootId];
  const seen = new Set<string>([rootId]);
  while (queue.length > 0) {
    const id = queue.shift()!;
    const kids = byParent.get(id) ?? [];
    for (const kid of sortCategoriesDeterministic(kids)) {
      if (seen.has(kid.id)) continue;
      seen.add(kid.id);
      out.push(kid.id);
      queue.push(kid.id);
    }
  }
  return out;
}

export function resolveCategoryScopeFromRows(
  slug: string,
  categories: MarketplaceCategoryRow[],
): CategoryScope | null {
  const trimmed = String(slug || "").trim();
  if (!trimmed) return null;

  const selected = categories.find((c) => c.slug === trimmed && isActiveCategory(c));
  if (!selected) return null;

  const descendantIds = collectActiveDescendantIds(categories, selected.id);
  const children = sortCategoriesDeterministic(
    categories.filter((c) => c.parent_id === selected.id && isActiveCategory(c)),
  );
  const parent =
    selected.parent_id != null
      ? categories.find((c) => c.id === selected.parent_id && isActiveCategory(c)) ?? null
      : null;

  return {
    selectedCategory: selected,
    categoryIds: [selected.id, ...descendantIds],
    isParent: children.length > 0 || descendantIds.length > 0,
    parent,
    children,
  };
}

export function enrichCategoriesWithPublicCounts(
  categories: MarketplaceCategoryRow[],
  directPublicCounts: Map<string, number> | Record<string, number>,
): CategoryWithPublicCounts[] {
  const direct =
    directPublicCounts instanceof Map
      ? directPublicCounts
      : new Map(Object.entries(directPublicCounts).map(([k, v]) => [k, Number(v) || 0]));

  const active = categories.filter((c) => isActiveCategory(c));
  const byId = new Map(active.map((c) => [c.id, c]));

  return sortCategoriesDeterministic(active).map((c) => {
    const descendantIds = collectActiveDescendantIds(active, c.id);
    const directCount = direct.get(c.id) ?? 0;
    let subtree = directCount;
    for (const id of descendantIds) {
      if (!byId.has(id)) continue;
      subtree += direct.get(id) ?? 0;
    }
    return {
      ...c,
      direct_public_product_count: directCount,
      subtree_public_product_count: subtree,
      has_public_products: subtree > 0,
    };
  });
}

/** Root categories only (`parent_id` null/empty). */
export function filterRootCategories<T extends MarketplaceCategoryRow>(categories: T[]): T[] {
  return sortCategoriesDeterministic(categories.filter((c) => !c.parent_id && isActiveCategory(c)));
}
