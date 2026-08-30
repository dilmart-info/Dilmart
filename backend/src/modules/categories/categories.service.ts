import { BadRequestException, Injectable } from "@nestjs/common";
import { SupabaseAdminService } from "../supabase-admin/supabase-admin.service";
import { CreateCategoryDto, UpdateCategoryDto } from "./categories.dto";
import {
  CategoryAssignErrors,
  isAssignableCategory,
  splitCategoryPath,
} from "./category-assignability";

@Injectable()
export class CategoriesService {
  constructor(private readonly supabaseAdmin: SupabaseAdminService) {}

  async getAdminCategories() {
    const { data, error } = await this.supabaseAdmin.client
      .from("categories")
      .select("*")
      .order("sort_order", { ascending: true })
      .order("name", { ascending: true });
    if (error) throw error;
    return data ?? [];
  }

  async countActiveChildren(categoryId: string): Promise<number> {
    const { count, error } = await this.supabaseAdmin.client
      .from("categories")
      .select("id", { count: "exact", head: true })
      .eq("parent_id", categoryId)
      .eq("is_active", true);
    if (error) throw error;
    return count ?? 0;
  }

  /**
   * Assert category may be newly assigned to a product.
   * Pass `previousCategoryId` when updating: if unchanged, skip assignability
   * (legacy parent-with-children products remain editable for other fields).
   */
  async assertAssignableCategoryId(
    categoryId: string | null | undefined,
    opts?: { previousCategoryId?: string | null; required?: boolean },
  ) {
    if (!categoryId) {
      if (opts?.required) {
        throw new BadRequestException({
          message: "category_id is required.",
          code: CategoryAssignErrors.CATEGORY_NOT_FOUND,
        });
      }
      return;
    }
    if (opts?.previousCategoryId && opts.previousCategoryId === categoryId) {
      return;
    }

    const { data: category, error } = await this.supabaseAdmin.client
      .from("categories")
      .select("id,is_active,parent_id,name,slug")
      .eq("id", categoryId)
      .maybeSingle();
    if (error) throw error;

    const childCount = category?.id ? await this.countActiveChildren(category.id) : 0;
    const result = isAssignableCategory(category as any, childCount);
    if (!result.ok) {
      throw new BadRequestException({ message: result.message, code: result.code });
    }
  }

  /** Resolve flat token or hierarchical path "Parent > Child" / slug path. Fail closed on ambiguity. */
  async resolveCategoryToken(raw: string): Promise<{ id: string; name: string; slug: string }> {
    const token = String(raw ?? "").trim();
    if (!token) {
      throw new BadRequestException({
        message: "category is required.",
        code: CategoryAssignErrors.CATEGORY_NOT_FOUND,
      });
    }

    const { data, error } = await this.supabaseAdmin.client
      .from("categories")
      .select("id,name,slug,parent_id,is_active");
    if (error) throw error;
    const rows = data ?? [];

    const parts = splitCategoryPath(token);
    if (parts.length > 2) {
      throw new BadRequestException({
        message: "category path depth exceeds Root > Child.",
        code: CategoryAssignErrors.CATEGORY_PATH_NOT_FOUND,
      });
    }

    const matchToken = (row: any, t: string) => {
      const lower = t.toLowerCase();
      return (
        String(row.id).toLowerCase() === lower ||
        String(row.name ?? "").toLowerCase() === lower ||
        String(row.slug ?? "").toLowerCase() === lower
      );
    };

    let matched: any[] = [];
    if (parts.length === 1) {
      matched = rows.filter((r) => matchToken(r, parts[0]));
    } else {
      const parents = rows.filter((r) => matchToken(r, parts[0]) && !r.parent_id);
      if (parents.length === 0) {
        throw new BadRequestException({
          message: `CATEGORY_PATH_NOT_FOUND: parent "${parts[0]}"`,
          code: CategoryAssignErrors.CATEGORY_PATH_NOT_FOUND,
        });
      }
      if (parents.length > 1) {
        throw new BadRequestException({
          message: `CATEGORY_AMBIGUOUS: parent "${parts[0]}"`,
          code: CategoryAssignErrors.CATEGORY_AMBIGUOUS,
        });
      }
      const parentId = parents[0].id;
      matched = rows.filter((r) => r.parent_id === parentId && matchToken(r, parts[1]));
    }

    if (matched.length === 0) {
      throw new BadRequestException({
        message: `CATEGORY_PATH_NOT_FOUND: "${token}"`,
        code: CategoryAssignErrors.CATEGORY_PATH_NOT_FOUND,
      });
    }
    if (matched.length > 1) {
      throw new BadRequestException({
        message: `CATEGORY_AMBIGUOUS: "${token}"`,
        code: CategoryAssignErrors.CATEGORY_AMBIGUOUS,
      });
    }

    const category = matched[0];
    const childCount = await this.countActiveChildren(category.id);
    const assign = isAssignableCategory(category, childCount);
    if (!assign.ok) {
      throw new BadRequestException({ message: assign.message, code: assign.code });
    }
    return { id: category.id, name: category.name, slug: category.slug };
  }

  private async assertNoHierarchyCycle(id: string | null, parentId: string | null) {
    if (!parentId) return;
    if (id && parentId === id) {
      throw new BadRequestException("Category cannot be its own parent.");
    }
    // Walk up from proposed parent; if we hit id, cycle.
    let cursor: string | null = parentId;
    const seen = new Set<string>();
    while (cursor) {
      if (id && cursor === id) {
        throw new BadRequestException("Category hierarchy cycle is not allowed.");
      }
      if (seen.has(cursor)) break;
      seen.add(cursor);
      const walkId: string = cursor;
      const { data, error } = await this.supabaseAdmin.client
        .from("categories")
        .select("parent_id")
        .eq("id", walkId)
        .maybeSingle();
      if (error) throw error;
      const parent = data as { parent_id?: string | null } | null;
      cursor = parent?.parent_id ?? null;
    }
  }

  async createCategory(payload: CreateCategoryDto) {
    await this.assertNoHierarchyCycle(null, (payload as any).parent_id ?? null);
    const { data, error } = await this.supabaseAdmin.client.from("categories").insert(payload as any).select("*").single();
    if (error) throw error;
    return data;
  }

  async updateCategory(id: string, payload: UpdateCategoryDto) {
    if ((payload as any).parent_id !== undefined) {
      await this.assertNoHierarchyCycle(id, (payload as any).parent_id ?? null);
    }
    const { error } = await this.supabaseAdmin.client.from("categories").update(payload as any).eq("id", id);
    if (error) throw error;
    return { ok: true };
  }

  async deleteCategory(id: string) {
    const { error } = await this.supabaseAdmin.client.from("categories").delete().eq("id", id);
    if (error) throw error;
    return { ok: true };
  }
}
