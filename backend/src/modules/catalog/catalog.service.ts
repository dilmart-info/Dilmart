import { Injectable } from "@nestjs/common";
import { SupabaseAdminService } from "../supabase-admin/supabase-admin.service";

type ProductSort = "newest" | "price-asc" | "price-desc";

@Injectable()
export class CatalogService {
  constructor(private readonly supabaseAdmin: SupabaseAdminService) {}

  async getCategories() {
    const { data, error } = await this.supabaseAdmin.client.from("categories").select("*").order("sort_order");
    if (error) throw error;
    return data ?? [];
  }

  async getProducts(params: {
    merchant_id: string;
    category_slug?: string;
    filter?: string;
    search?: string;
    sort?: ProductSort;
  }) {
    const categories = await this.getCategories();

    let query = this.supabaseAdmin.client
      .from("products")
      .select("*, categories(slug)")
      .eq("is_active", true)
      .eq("merchant_id", params.merchant_id);

    if (params.category_slug) {
      const cat = categories.find((c: any) => c.slug === params.category_slug);
      if (cat) {
        query = query.eq("category_id", cat.id);
      }
    }

    if (params.filter === "offers") query = query.not("discount_price", "is", null);
    if (params.filter === "new") query = query.eq("is_new", true);
    if (params.search) query = query.ilike("name", `%${params.search}%`);

    const sort = params.sort ?? "newest";
    if (sort === "price-asc") query = query.order("price", { ascending: true });
    else if (sort === "price-desc") query = query.order("price", { ascending: false });
    else query = query.order("created_at", { ascending: false });

    const { data, error } = await query;
    if (error) throw error;
    return data ?? [];
  }

  async getProductsByIds(ids: string[]) {
    if (ids.length === 0) return [];
    const { data, error } = await this.supabaseAdmin.client.from("products").select("*").in("id", ids);
    if (error) throw error;
    return data ?? [];
  }

  async getOffers(merchantId: string) {
    const { data, error } = await this.supabaseAdmin.client
      .from("products")
      .select("*, categories(name, slug)")
      .not("discount_price", "is", null)
      .eq("is_active", true)
      .eq("merchant_id", merchantId)
      .order("sort_order", { ascending: true });
    if (error) throw error;
    return (data ?? []).filter((p: any) => p.discount_price != null && p.discount_price < p.price);
  }

  async getProductBySlug(slug: string, merchantId: string) {
    const { data, error } = await this.supabaseAdmin.client
      .from("products")
      .select("*")
      .eq("slug", slug)
      .eq("is_active", true)
      .eq("merchant_id", merchantId)
      .maybeSingle();
    if (error) throw error;
    return data;
  }

  async getSuggestedProducts(params: { merchant_id: string; category_id: string; exclude_id: string }) {
    const { data, error } = await this.supabaseAdmin.client
      .from("products")
      .select("*")
      .eq("category_id", params.category_id)
      .neq("id", params.exclude_id)
      .eq("is_active", true)
      .eq("merchant_id", params.merchant_id)
      .limit(4);
    if (error) throw error;
    return data ?? [];
  }

  async getCategoryPage(slug: string, merchantId: string) {
    const { data: category, error: catError } = await this.supabaseAdmin.client.from("categories").select("*").eq("slug", slug).maybeSingle();
    if (catError) throw catError;
    if (!category) return { category: null, subcategories: [], products: [] };

    const { data: subcategories, error: subError } = await this.supabaseAdmin.client
      .from("categories")
      .select("id, name, slug")
      .eq("parent_id", (category as any).id)
      .order("sort_order", { ascending: true });
    if (subError) throw subError;

    const categoryIds = [(category as any).id, ...((subcategories ?? []).map((s: any) => s.id) || [])];
    const { data: products, error: productsError } = await this.supabaseAdmin.client
      .from("products")
      .select("*")
      .in("category_id", categoryIds)
      .eq("is_active", true)
      .eq("merchant_id", merchantId)
      .order("sort_order", { ascending: true });
    if (productsError) throw productsError;

    return {
      category,
      subcategories: subcategories ?? [],
      products: products ?? [],
    };
  }

  async getHomeCollections(merchantId: string) {
    const categories = await this.getCategories();

    const [featuredRes, newRes, offersRes] = await Promise.all([
      this.supabaseAdmin.client.from("products").select("*").eq("is_best_seller", true).eq("is_active", true).eq("merchant_id", merchantId).limit(8),
      this.supabaseAdmin.client.from("products").select("*").eq("is_new", true).eq("is_active", true).eq("merchant_id", merchantId).limit(8),
      this.supabaseAdmin.client.from("products").select("*").not("discount_price", "is", null).eq("is_active", true).eq("merchant_id", merchantId).limit(8),
    ]);

    if (featuredRes.error) throw featuredRes.error;
    if (newRes.error) throw newRes.error;
    if (offersRes.error) throw offersRes.error;

    return {
      categories,
      featuredProducts: featuredRes.data ?? [],
      newProducts: newRes.data ?? [],
      offerProducts: offersRes.data ?? [],
    };
  }
}
