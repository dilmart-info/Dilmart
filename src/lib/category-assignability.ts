/**
 * Frontend mirror of backend leaf-only category assignment rules.
 * A category is assignable when it is active and has no active children.
 */

export type CategoryRow = {
  id: string;
  name: string;
  parent_id?: string | null;
  is_active?: boolean | null;
};

export function hasActiveChildren(categories: CategoryRow[], categoryId: string): boolean {
  return categories.some((c) => c.parent_id === categoryId && c.is_active !== false);
}

export function isAssignableCategoryRow(categories: CategoryRow[], category: CategoryRow): boolean {
  if (!category?.id) return false;
  if (category.is_active === false) return false;
  return !hasActiveChildren(categories, category.id);
}

/** Options for product category pickers: leaves (and roots without active children). */
export function listAssignableCategoryOptions(
  categories: CategoryRow[],
  opts?: { includeInactive?: boolean },
): Array<{ id: string; label: string; parentName?: string }> {
  const list = categories ?? [];
  const byId = new Map(list.map((c) => [c.id, c]));
  const out: Array<{ id: string; label: string; parentName?: string }> = [];

  for (const cat of list) {
    if (!opts?.includeInactive && cat.is_active === false) continue;
    if (!isAssignableCategoryRow(list, cat)) continue;
    const parent = cat.parent_id ? byId.get(cat.parent_id) : undefined;
    const inactiveSuffix = cat.is_active === false ? " (غير نشط)" : "";
    if (parent) {
      out.push({
        id: cat.id,
        label: `${parent.name} › ${cat.name}${inactiveSuffix}`,
        parentName: parent.name,
      });
    } else {
      out.push({
        id: cat.id,
        label: `${cat.name}${inactiveSuffix}`,
      });
    }
  }

  return out.sort((a, b) => a.label.localeCompare(b.label, "ar"));
}
