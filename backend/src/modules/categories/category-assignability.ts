/**
 * Category assignability rules (Phase B taxonomy).
 *
 * - Inactive category: not assignable (except admin may still list; assignment rejected).
 * - Category with at least one active child: not assignable for NEW assignments.
 * - Leaf (no active children) that is active: assignable.
 * - Root without active children: assignable.
 *
 * Legacy products already on a parent-with-children remain readable/updatable for
 * non-category fields when category_id is unchanged. No DB grandfather flag.
 */

export type CategoryAssignabilityRow = {
  id: string;
  is_active?: boolean | null;
  parent_id?: string | null;
};

export const CategoryAssignErrors = {
  CATEGORY_NOT_FOUND: "CATEGORY_NOT_FOUND",
  CATEGORY_INACTIVE: "CATEGORY_INACTIVE",
  CATEGORY_PARENT_NOT_ASSIGNABLE: "CATEGORY_PARENT_NOT_ASSIGNABLE",
  CATEGORY_AMBIGUOUS: "CATEGORY_AMBIGUOUS",
  CATEGORY_PATH_NOT_FOUND: "CATEGORY_PATH_NOT_FOUND",
} as const;

export type CategoryAssignErrorCode = (typeof CategoryAssignErrors)[keyof typeof CategoryAssignErrors];

export function isAssignableCategory(
  category: CategoryAssignabilityRow | null | undefined,
  activeChildCount: number,
): { ok: true } | { ok: false; code: CategoryAssignErrorCode; message: string } {
  if (!category?.id) {
    return {
      ok: false,
      code: CategoryAssignErrors.CATEGORY_NOT_FOUND,
      message: "Category not found.",
    };
  }
  if (category.is_active === false) {
    return {
      ok: false,
      code: CategoryAssignErrors.CATEGORY_INACTIVE,
      message: "Category is inactive and cannot be assigned to products.",
    };
  }
  if (activeChildCount > 0) {
    return {
      ok: false,
      code: CategoryAssignErrors.CATEGORY_PARENT_NOT_ASSIGNABLE,
      message: "Category has active children and cannot be assigned directly to products.",
    };
  }
  return { ok: true };
}

/** Split hierarchical CSV tokens: "Parent > Child" or "Parent › Child". */
export function splitCategoryPath(raw: string): string[] {
  return String(raw ?? "")
    .split(/\s*[>›]\s*/)
    .map((p) => p.trim())
    .filter(Boolean);
}
