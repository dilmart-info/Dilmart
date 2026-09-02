import { BadRequestException, ConflictException, ForbiddenException, Injectable } from "@nestjs/common";
import { SupabaseAdminService } from "../supabase-admin/supabase-admin.service";
import { ScopeResolverService } from "../scope-resolver/scope-resolver.service";
import { CategoriesService } from "../categories/categories.service";
import { ProductScopeQueryDto, UpsertProductDto } from "./products.dto";
import { PRODUCT_IMPORT_TEMPLATE_HEADER } from "./product-import.service";
import { validateShortDescription } from "./short-description";
import {
  PRODUCT_NOT_READY_CODE,
  ProductPublicationInput,
  ProductReadinessInput,
  buildProductReadiness,
  findNewlyBrokenActivationChecks,
  getBlockingActivationChecks,
  increasesPublicExposure,
  requestsMorePublicExposure,
  resolveProductPublicationState,
  resolveUpdatePublicationState,
  toMissingChecks,
} from "./product-readiness";

@Injectable()
export class ProductsService {
  constructor(
    private readonly supabaseAdmin: SupabaseAdminService,
    private readonly scopeResolver: ScopeResolverService,
    private readonly categoriesService: CategoriesService,
  ) {}

  /**
   * CSV import itself was extracted to `ProductImportService` (Gate 1,
   * DilMart-ARD-AL-KHALEEJ-VERTICAL-PILOT-10-001). This template header is kept here only so
   * `getImportTemplate()` (used by the merchant-facing "download template" button) stays a
   * single-line change if the columns ever move again — it delegates to the same constant.
   */
  private readonly importTemplateHeader = PRODUCT_IMPORT_TEMPLATE_HEADER;

  /**
   * Readiness is defined once, in `./product-readiness`, and shared by every activation path
   * (create / update / status / quick add / bulk activate / duplicate / CSV import). This
   * wrapper only exists so the read paths below keep their previous call shape.
   */
  private buildProductReadiness(product: ProductReadinessInput) {
    return buildProductReadiness(product);
  }

  /**
   * Single gate every activation path calls before flipping a product on. Throws the shared
   * structured PRODUCT_NOT_READY error; `exception` picks the HTTP status each existing caller
   * already returned (Forbidden for `updateProductStatus`, BadRequest everywhere else).
   */
  private assertReadyForActivation(
    candidate: ProductReadinessInput,
    options: { message: string; exception?: "bad_request" | "forbidden"; productId?: string },
  ) {
    const blocking = getBlockingActivationChecks(candidate);
    if (blocking.length === 0) return;
    const body = {
      message: options.message,
      code: PRODUCT_NOT_READY_CODE,
      ...(options.productId ? { product_id: options.productId } : {}),
      missing_checks: toMissingChecks(blocking),
    };
    throw options.exception === "forbidden" ? new ForbiddenException(body) : new BadRequestException(body);
  }

  private isMerchantRole(role?: string) {
    return role === "merchant_owner" || role === "merchant_manager" || role === "merchant_staff";
  }

  private async ensureSlugUniqueWithinMerchant(slug: string, merchantId: string, excludeProductId?: string) {
    let req = this.supabaseAdmin.client.from("products").select("id").eq("merchant_id", merchantId).eq("slug", slug).limit(1);
    if (excludeProductId) req = req.neq("id", excludeProductId);
    const { data, error } = await req.maybeSingle();
    if (error) throw error;
    if (data?.id) {
      throw new ConflictException({
        message: "Slug already exists for this merchant.",
        code: "PRODUCT_SLUG_EXISTS",
      });
    }
  }

  private async ensureMerchantSkuAbsent(merchantSku: string, merchantId: string) {
    const { data, error } = await this.supabaseAdmin.client
      .from("products")
      .select("id")
      .eq("merchant_id", merchantId)
      .eq("merchant_sku", merchantSku)
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    if (data?.id) {
      throw new ConflictException({
        message: "Merchant SKU already exists; create never updates an existing SKU.",
        code: "PRODUCT_MERCHANT_SKU_EXISTS",
      });
    }
  }

  private async ensureMerchantActiveForMerchantActor(merchantId: string, actorRole?: string) {
    if (!this.isMerchantRole(actorRole)) return;
    const { data, error } = await this.supabaseAdmin.client.from("merchants").select("status").eq("id", merchantId).maybeSingle();
    if (error) throw error;
    if (!data?.status || data.status !== "active") {
      throw new ForbiddenException("Merchant is pending approval or not active.");
    }
  }

  private slugify(value: string) {
    return String(value ?? "")
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9\u0600-\u06FF\s-]/g, "")
      .replace(/\s+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "");
  }

  private async resolveMerchantForActor(
    requestedMerchantId: string,
    actor: { actor_role?: string; actor_id?: string },
  ) {
    if (!this.isMerchantRole(actor?.actor_role)) {
      throw new ForbiddenException("Merchant role required.");
    }
    if (!requestedMerchantId) {
      throw new BadRequestException("merchant_id is required.");
    }
    const merchantId = await this.scopeResolver.resolveMerchantScope(requestedMerchantId, actor?.actor_role, actor?.actor_id);
    if (!merchantId || merchantId !== requestedMerchantId) {
      throw new ForbiddenException("Merchant scope is not allowed for this actor.");
    }
    await this.ensureMerchantActiveForMerchantActor(merchantId, actor?.actor_role);
    return merchantId;
  }

  /**
   * CSV import (preview/confirm) moved to `ProductImportService` — see that file for the
   * rebuilt, idempotent, SKU-keyed import path. This getter is kept here for backward
   * compatibility with existing callers of `ProductsService.getImportTemplate()`.
   */
  async getImportTemplate() {
    return {
      filename: "merchant-products-template.csv",
      contentType: "text/csv; charset=utf-8",
      body: this.importTemplateHeader,
    };
  }

  async performBulkAction(
    payload: {
      merchant_id: string;
      product_ids: string[];
      action: "activate" | "deactivate" | "update_stock" | "change_category" | "adjust_price_percent" | "archive";
      payload?: Record<string, any>;
    },
    actor?: { actor_role?: string; actor_id?: string },
  ) {
    if (!payload?.merchant_id) {
      throw new BadRequestException("merchant_id is required.");
    }
    const merchantId = await this.resolveMerchantForActor(payload.merchant_id, actor ?? {});
    const productIds = Array.from(new Set((payload.product_ids ?? []).filter(Boolean)));
    if (productIds.length === 0) throw new BadRequestException("product_ids are required.");

    // Fetch explicitly every field used by buildProductReadiness plus merchant_id and is_published/visibility_status.
    const { data: rows, error: rowsError } = await this.supabaseAdmin.client
      .from("products")
      .select("id,merchant_id,name,slug,price,category_id,images,stock,discount_price,description,is_active,is_published,visibility_status")
      .in("id", productIds);
    if (rowsError) throw rowsError;
    if ((rows ?? []).length !== productIds.length) {
      throw new ForbiddenException("Some products are out of merchant scope.");
    }
    if ((rows ?? []).some((r: any) => String(r.merchant_id) !== merchantId)) {
      throw new ForbiddenException("Bulk action must target products from same merchant.");
    }

    const actionPayload = payload.payload ?? {};
    if (payload.action === "update_stock") {
      const stock = Number(actionPayload.stock);
      if (!Number.isInteger(stock) || stock < 0) throw new BadRequestException("payload.stock must be integer >= 0.");
      const { error } = await this.supabaseAdmin.client.from("products").update({ stock } as any).in("id", productIds).eq("merchant_id", merchantId);
      if (error) throw error;
      return { ok: true, affected: productIds.length };
    }

    if (payload.action === "change_category") {
      const categoryId = String(actionPayload.category_id ?? "");
      if (!categoryId) throw new BadRequestException("payload.category_id is required.");
      await this.categoriesService.assertAssignableCategoryId(categoryId, { required: true });
      const { error } = await this.supabaseAdmin.client.from("products").update({ category_id: categoryId } as any).in("id", productIds).eq("merchant_id", merchantId);
      if (error) throw error;
      return { ok: true, affected: productIds.length };
    }

    if (payload.action === "adjust_price_percent") {
      const percent = Number(actionPayload.percent);
      if (!Number.isFinite(percent) || percent < -90 || percent > 500) {
        throw new BadRequestException("payload.percent must be between -90 and +500.");
      }
      for (const row of rows ?? []) {
        const current = Number((row as any).price ?? 0);
        const next = Math.max(0.01, current + (current * percent) / 100);
        const { error } = await this.supabaseAdmin.client.from("products").update({ price: next } as any).eq("id", (row as any).id).eq("merchant_id", merchantId);
        if (error) throw error;
      }
      return { ok: true, affected: productIds.length };
    }

    if (payload.action === "activate") {
      // Readiness is validated for EVERY product first: one unready product blocks the whole
      // batch, so a bulk activate can never publish a product a single activate would refuse.
      for (const row of (rows ?? []) as Array<ProductReadinessInput & { id: string; name: string }>) {
        this.assertReadyForActivation(row, {
          message: `المنتج "${row.name}" غير جاهز للتفعيل.`,
          productId: row.id,
        });
      }
      const { error } = await this.supabaseAdmin.client
        .from("products")
        .update({
          ...resolveProductPublicationState({ requestedActive: true }),
          updated_at: new Date().toISOString()
        } as any)
        .in("id", productIds)
        .eq("merchant_id", merchantId);
      if (error) throw error;
      return { ok: true, affected: productIds.length };
    }

    if (payload.action === "deactivate") {
      // Deactivation writes the whole triple (see `updateProductStatus`): only flipping
      // `is_active` could leave `is_published=true` / `visibility_status=public` behind.
      // Archived products stay archived instead of being restored to `private`.
      const archivedIds = ((rows ?? []) as Array<{ id: string; visibility_status: string | null }>)
        .filter((row) => row.visibility_status === "archived")
        .map((row) => String(row.id));
      const plainIds = productIds.filter((productId) => !archivedIds.includes(productId));
      for (const [ids, archived] of [
        [plainIds, false],
        [archivedIds, true],
      ] as Array<[string[], boolean]>) {
        if (ids.length === 0) continue;
        const updateFields: Record<string, unknown> = {
          ...resolveProductPublicationState({ requestedActive: false, archived }),
          updated_at: new Date().toISOString(),
        };
        const { error } = await this.supabaseAdmin.client
          .from("products")
          .update(updateFields)
          .in("id", ids)
          .eq("merchant_id", merchantId);
        if (error) throw error;
      }
      return { ok: true, affected: productIds.length };
    }

    if (payload.action === "archive") {
      const { error } = await this.supabaseAdmin.client
        .from("products")
        .update({
          // Archival always leaves the product inactive + unpublished + archived.
          ...resolveProductPublicationState({ requestedActive: false, archived: true }),
          updated_at: new Date().toISOString()
        } as any)
        .in("id", productIds)
        .eq("merchant_id", merchantId);
      if (error) throw error;
      return { ok: true, affected: productIds.length };
    }

    throw new BadRequestException("Unsupported bulk action.");
  }

  async quickAddProduct(
    payload: {
      merchant_id: string;
      name: string;
      category_id: string;
      price: number;
      stock?: number;
      image_url?: string;
      description?: string;
      is_active?: boolean;
    },
    actor?: { actor_role?: string; actor_id?: string },
  ) {
    if (!payload?.merchant_id) {
      throw new BadRequestException("merchant_id is required.");
    }
    const merchantId = await this.resolveMerchantForActor(payload.merchant_id, actor ?? {});
    if (!payload.name?.trim()) throw new BadRequestException("name is required.");
    if (!payload.category_id) throw new BadRequestException("category_id is required.");
    if (Number(payload.price ?? 0) <= 0) throw new BadRequestException("price must be > 0.");
    const stock = Number(payload.stock ?? 0);
    if (!Number.isInteger(stock) || stock < 0) throw new BadRequestException("stock must be integer >= 0.");
    await this.categoriesService.assertAssignableCategoryId(payload.category_id, { required: true });

    const slugBase = this.slugify(payload.name);
    let slug = slugBase || `product-${Math.floor(Date.now() / 1000)}`;
    for (let attempt = 1; attempt <= 5; attempt += 1) {
      try {
        await this.ensureSlugUniqueWithinMerchant(slug, merchantId);
        break;
      } catch {
        slug = `${slugBase}-${Math.floor(Math.random() * 9999)}`;
      }
    }

    const images = payload.image_url ? [payload.image_url] : [];
    const candidate: ProductReadinessInput = {
      name: payload.name.trim(),
      slug,
      description: payload.description ?? "",
      price: Number(payload.price),
      discount_price: null,
      category_id: payload.category_id,
      stock,
      images,
    };

    // Quick Add uses the SAME readiness rules as every other activation path — it can never
    // publish an incomplete product.
    //  - `is_active: true` asked for explicitly → refuse with the shared PRODUCT_NOT_READY error.
    //  - `is_active` omitted → stay useful: activate when ready, otherwise create a draft
    //    (inactive / unpublished / private) instead of silently publishing something incomplete.
    //  - `is_active: false` → always a draft.
    const explicitlyRequestedActive = payload.is_active === true;
    if (explicitlyRequestedActive) {
      this.assertReadyForActivation(candidate, {
        message: "Product is not ready for activation yet.",
      });
    }
    const isActive = payload.is_active === false ? false : getBlockingActivationChecks(candidate).length === 0;

    const { data, error } = await this.supabaseAdmin.client
      .from("products")
      .insert({
        merchant_id: merchantId,
        name: candidate.name,
        slug,
        description: candidate.description,
        price: candidate.price,
        discount_price: null,
        category_id: payload.category_id,
        stock,
        purchase_price: 0,
        low_stock_threshold: 5,
        ...resolveProductPublicationState({ requestedActive: isActive }),
        is_featured: false,
        is_new: false,
        is_best_seller: false,
        offer_ends_at: null,
        images,
        loyalty_points_enabled: false,
      } as any)
      // Publication state is returned so the caller can tell an activated product from one that
      // was deliberately created as a draft because it did not meet readiness.
      .select("id,name,slug,is_active,is_published,visibility_status")
      .single();
    if (error) throw error;
    return data;
  }

  async duplicateProduct(
    id: string,
    merchantId: string,
    actor?: { actor_role?: string; actor_id?: string },
  ) {
    if (!merchantId) {
      throw new BadRequestException("merchant_id is required.");
    }
    const resolvedMerchantId = await this.resolveMerchantForActor(merchantId, actor ?? {});
    const { data: source, error: sourceError } = await this.supabaseAdmin.client
      .from("products")
      .select("*")
      .eq("id", id)
      .eq("merchant_id", resolvedMerchantId)
      .maybeSingle();
    if (sourceError) throw sourceError;
    if (!source) throw new ForbiddenException("Product not found in merchant scope.");

    const originalName = String((source as any).name ?? "Product");
    const copyName = `${originalName} (Copy)`;
    const slugBase = this.slugify(copyName) || "product-copy";
    let slug = slugBase;
    for (let attempt = 1; attempt <= 5; attempt += 1) {
      try {
        await this.ensureSlugUniqueWithinMerchant(slug, resolvedMerchantId);
        break;
      } catch {
        slug = `${slugBase}-${Math.floor(Math.random() * 9999)}`;
      }
    }

    const { data, error } = await this.supabaseAdmin.client
      .from("products")
      .insert({
        ...(source as any),
        id: undefined,
        // `is_ready` is a GENERATED column (added by
        // 20260820120000_products_true_readiness_generated_column.sql): Postgres refuses any
        // explicit value for it, and the source row above is read with `select("*")`, so the
        // spread would otherwise send it straight back on INSERT. An `undefined` value is
        // dropped during JSON serialization, so the key is simply absent from the request.
        // This guard shipped ahead of the column in PR #119, which is what let the schema
        // change roll out without a compatibility window.
        is_ready: undefined,
        merchant_id: merchantId,
        name: copyName,
        slug,
        merchant_sku: null,
        // A copy always starts as a draft. `is_published` must be forced too — the spread above
        // carries the source product's flags, so copying a published product used to leave the
        // copy at is_active=false + is_published=true (an inconsistent, half-public state).
        ...resolveProductPublicationState({ requestedActive: false }),
        created_at: undefined,
        updated_at: undefined,
      } as any)
      .select("id,name,slug,is_active,is_published,visibility_status")
      .single();
    if (error) throw error;
    return data;
  }

  private validateCatalogPayload(payload: UpsertProductDto) {
    if (Number(payload.price ?? 0) <= 0) {
      throw new BadRequestException("Product price must be greater than zero.");
    }
    if (Number(payload.purchase_price ?? 0) < 0) {
      throw new BadRequestException("Purchase price cannot be negative.");
    }
    if (Number(payload.stock ?? 0) < 0) {
      throw new BadRequestException("Stock cannot be negative.");
    }
    if (Number(payload.low_stock_threshold ?? 0) < 0) {
      throw new BadRequestException("Low stock threshold cannot be negative.");
    }
    if (payload.discount_price != null && payload.discount_price !== undefined) {
      if (Number(payload.discount_price) <= 0 || Number(payload.discount_price) >= Number(payload.price)) {
        throw new BadRequestException("Discount price must be positive and lower than base price.");
      }
    }
    if (payload.images && !Array.isArray(payload.images)) {
      throw new BadRequestException("Images must be an array.");
    }
    if (payload.colors && !Array.isArray(payload.colors)) {
      throw new BadRequestException("colors must be an array.");
    }
    if (payload.sizes && !Array.isArray(payload.sizes)) {
      throw new BadRequestException("sizes must be an array.");
    }
    if (payload.weight_grams != null && Number(payload.weight_grams) < 0) {
      throw new BadRequestException("weight_grams cannot be negative.");
    }

    if (payload.offer_ends_at) {
      if (payload.discount_price == null || payload.discount_price === undefined) {
        throw new BadRequestException("Offer end date requires a valid discount price.");
      }
      const offerEndsAtMs = Date.parse(payload.offer_ends_at);
      if (Number.isNaN(offerEndsAtMs)) {
        throw new BadRequestException("Offer end date is invalid.");
      }
      if (offerEndsAtMs <= Date.now()) {
        throw new BadRequestException("Offer end date must be in the future.");
      }
    }

    // Merchandising flags should only apply to active, purchasable products.
    if ((payload.is_featured || payload.is_new || payload.is_best_seller) && !payload.is_active) {
      throw new BadRequestException("Merchandising flags require product to be active.");
    }
    if ((payload.is_featured || payload.is_best_seller) && Number(payload.stock ?? 0) <= 0) {
      throw new BadRequestException("Featured/best-seller products must have stock above zero.");
    }
  }

  async listProducts(params: {
    merchant_id?: string;
    search?: string;
    offset?: number;
    limit?: number;
    page?: number;
    readiness?: "all" | "ready" | "not_ready";
    actor_role?: string;
    actor_id?: string;
  }) {
    const resolvedMerchantId = await this.scopeResolver.resolveMerchantScope(params.merchant_id, params.actor_role, params.actor_id);

    // Bounds enforcement
    const rawLimit = Number(params.limit ?? 100);
    const limit = Number.isFinite(rawLimit) ? Math.min(500, Math.max(1, Math.floor(rawLimit))) : 100;

    let offset = 0;
    if (params.offset !== undefined && params.offset !== null) {
      const rawOffset = Number(params.offset);
      offset = Number.isFinite(rawOffset) ? Math.max(0, Math.floor(rawOffset)) : 0;
    } else if (params.page !== undefined && params.page !== null) {
      const rawPage = Number(params.page);
      const page = Number.isFinite(rawPage) ? Math.max(1, Math.floor(rawPage)) : 1;
      offset = (page - 1) * limit;
    }

    let req = this.supabaseAdmin.client
      .from("products")
      .select("*, categories(name), merchants(display_name)", { count: "exact" })
      .order("created_at", { ascending: false })
      .order("id", { ascending: false });

    if (resolvedMerchantId) req = req.eq("merchant_id", resolvedMerchantId);
    if (params.search?.trim()) req = req.ilike("name", `%${params.search.trim()}%`);

    // True readiness filtering. `products.is_ready` is a STORED GENERATED column that Postgres
    // derives from this row's own columns using exactly the `buildProductReadiness(...)` rules
    // (see supabase/migrations/20260820120000_products_true_readiness_generated_column.sql), so
    // the predicate is applied to the WHOLE scoped population BEFORE `.range(...)` and the
    // `count: "exact"` below is the true filtered total.
    //
    // This used to be `eq("is_active", …)`, which is a different concept: an active legacy
    // product with no image or description is active but NOT ready, and was listed under
    // `readiness=ready` with the wrong page boundaries and totals.
    if (params.readiness === "ready") {
      req = req.eq("is_ready", true);
    } else if (params.readiness === "not_ready") {
      req = req.eq("is_ready", false);
    }

    const to = offset + limit - 1;
    req = req.range(offset, to);

    const { data, count, error } = await req;
    if (error) throw error;

    const items = (data ?? []).map((row: any) => ({
      ...row,
      readiness: this.buildProductReadiness(row),
    }));

    return {
      items,
      total: typeof count === "number" ? count : items.length,
      offset,
      limit,
    };
  }

  async getProductById(id: string, query: ProductScopeQueryDto & { actor_role?: string; actor_id?: string }) {
    const resolvedMerchantId = await this.scopeResolver.resolveMerchantScope(query.merchant_id, query.actor_role, query.actor_id);
    let req = this.supabaseAdmin.client.from("products").select("*").eq("id", id);
    if (resolvedMerchantId) req = req.eq("merchant_id", resolvedMerchantId);
    const { data, error } = await req.single();
    if (error) throw error;
    return { ...data, readiness: this.buildProductReadiness(data) };
  }

  async createProduct(payload: UpsertProductDto, actor?: { actor_role?: string; actor_id?: string }) {
    const resolvedMerchantId = await this.scopeResolver.resolveMerchantScope(payload.merchant_id, actor?.actor_role, actor?.actor_id);
    const merchantId = resolvedMerchantId ?? payload.merchant_id;
    if (!merchantId) throw new BadRequestException("merchant_id is required.");
    await this.ensureMerchantActiveForMerchantActor(merchantId, actor?.actor_role);
    this.validateCatalogPayload(payload);
    await this.ensureSlugUniqueWithinMerchant(payload.slug, merchantId);
    const merchantSku = payload.merchant_sku ? String(payload.merchant_sku).trim().toUpperCase() : null;
    if (merchantSku) await this.ensureMerchantSkuAbsent(merchantSku, merchantId);
    if (payload.category_id) {
      await this.categoriesService.assertAssignableCategoryId(payload.category_id);
    }
    const short = validateShortDescription(payload.short_description, { required: true });
    if (!short.ok) {
      throw new BadRequestException({ message: short.message, code: short.code });
    }
    const isArchived = payload.visibility_status === "archived";
    const isActive = isArchived ? false : payload.is_active === true;

    if (isActive) {
      this.assertReadyForActivation(
        { ...payload, merchant_id: merchantId } as ProductReadinessInput,
        { message: "Product is not ready for activation yet." },
      );
    }
    const insertPayload = {
      ...payload,
      merchant_id: merchantId,
      merchant_sku: merchantSku,
      ...resolveProductPublicationState({ requestedActive: isActive, archived: isArchived }),
      short_description: short.value,
      brand: payload.brand ? String(payload.brand).trim() : null,
      colors: (payload.colors ?? []).map((x) => String(x).trim()).filter(Boolean),
      sizes: (payload.sizes ?? []).map((x) => String(x).trim()).filter(Boolean),
      dimensions: payload.dimensions ? String(payload.dimensions).trim() : null,
      weight_grams: payload.weight_grams ?? null,
    };
    const { data, error } = await this.supabaseAdmin.client.from("products").insert(insertPayload as any).select("*").single();
    if (error) throw error;
    return data;
  }

  async updateProduct(id: string, payload: UpsertProductDto, query: ProductScopeQueryDto & { actor_role?: string; actor_id?: string }) {
    const resolvedMerchantId = await this.scopeResolver.resolveMerchantScope(query.merchant_id ?? payload.merchant_id, query.actor_role, query.actor_id);
    const merchantId = resolvedMerchantId ?? payload.merchant_id;
    if (!merchantId) throw new BadRequestException("merchant_id is required.");
    await this.ensureMerchantActiveForMerchantActor(merchantId, query.actor_role);
    this.validateCatalogPayload(payload);
    await this.ensureSlugUniqueWithinMerchant(payload.slug, merchantId, id);

    let productQuery = this.supabaseAdmin.client.from("products").select("*").eq("id", id);
    if (resolvedMerchantId) productQuery = productQuery.eq("merchant_id", resolvedMerchantId);
    const { data: existingProduct, error: existingErr } = await productQuery.maybeSingle();
    if (existingErr) throw existingErr;
    if (!existingProduct) {
      throw new ForbiddenException("Product not found in actor scope.");
    }

    const existingCategoryId = existingProduct.category_id ? String(existingProduct.category_id) : null;
    const existingMerchantSku = existingProduct.merchant_sku ? String(existingProduct.merchant_sku) : null;

    if (
      payload.merchant_sku != null &&
      String(payload.merchant_sku).trim().toUpperCase() !==
        String(existingMerchantSku || "").trim().toUpperCase()
    ) {
      throw new BadRequestException({
        message: "merchant_sku cannot be changed after product creation.",
        code: "PRODUCT_MERCHANT_SKU_IMMUTABLE",
      });
    }

    if (payload.category_id !== undefined) {
      await this.categoriesService.assertAssignableCategoryId(payload.category_id, {
        previousCategoryId: existingCategoryId,
      });
    }

    const incomingChanges = {
      ...payload,
      brand: payload.brand ? String(payload.brand).trim() : null,
      colors: (payload.colors ?? []).map((x) => String(x).trim()).filter(Boolean),
      sizes: (payload.sizes ?? []).map((x) => String(x).trim()).filter(Boolean),
      dimensions: payload.dimensions ? String(payload.dimensions).trim() : null,
      weight_grams: payload.weight_grams ?? null,
    };
    if (payload.short_description !== undefined) {
      const short = validateShortDescription(payload.short_description, { required: false });
      if (!short.ok) {
        throw new BadRequestException({ message: short.message, code: short.code });
      }
      incomingChanges.short_description = short.value;
    }

    const mergedProduct = { ...existingProduct, ...incomingChanges } as ProductReadinessInput;

    // Activating an archived product without saying what it should become is contradictory: the
    // archive wins (nothing would change), so the request is refused explicitly instead of
    // succeeding as a silent no-op. Callers either restore through `updateProductStatus`
    // (the merchant "restore and publish" action) or state the target visibility here.
    if (
      existingProduct.visibility_status === "archived" &&
      payload.is_active === true &&
      payload.visibility_status === undefined
    ) {
      throw new BadRequestException({
        message: "Product is archived; restore it before activating.",
        code: "PRODUCT_ARCHIVED",
      });
    }

    // The client-supplied publication triple is NEVER persisted verbatim: it is canonicalized
    // here, so contradictory combinations (is_active=false with is_published=true and/or
    // visibility_status=public) cannot be written by any caller.
    const publicationTarget = resolveUpdatePublicationState(existingProduct as ProductPublicationInput, {
      is_active: payload.is_active,
      is_published: payload.is_published,
      visibility_status: payload.visibility_status,
    });

    const requestedPublication: ProductPublicationInput = {
      is_active: payload.is_active,
      is_published: payload.is_published,
      visibility_status: payload.visibility_status,
    };
    if (
      increasesPublicExposure(existingProduct as ProductPublicationInput, publicationTarget) ||
      requestsMorePublicExposure(existingProduct as ProductPublicationInput, requestedPublication)
    ) {
      // Any transition that increases exposure — inactive→active, unpublished→published,
      // private→public, or a restore out of archived — runs the FULL readiness gate. A legacy
      // active-but-unready product must stay repairable, but must never be newly exposed.
      this.assertReadyForActivation(mergedProduct, { message: "Product is not ready for activation yet." });
    } else if (publicationTarget.is_active) {
      // The product stays ON after this edit without becoming more exposed, so the edit itself
      // must not break the invariant. Already-failing checks are tolerated (legacy rows
      // predating this invariant must stay fixable); newly broken ones — e.g. clearing the
      // images or the description of a live product — are refused with the same structured
      // error as any other activation path.
      const newlyBroken = findNewlyBrokenActivationChecks(existingProduct as ProductReadinessInput, mergedProduct);
      if (newlyBroken.length > 0) {
        throw new BadRequestException({
          message: "Product is active; this change would leave it below activation readiness.",
          code: PRODUCT_NOT_READY_CODE,
          missing_checks: toMissingChecks(newlyBroken),
        });
      }
    }

    const updatePayload: Record<string, unknown> = {
      ...incomingChanges,
    };
    delete updatePayload.merchant_sku;
    if (payload.short_description === undefined) {
      delete updatePayload.short_description;
    }

    // Drop whatever the client sent for the publication triple, then write back only the axes
    // the canonical target actually changes (so an ordinary edit of an `active + private`
    // product still touches none of them).
    delete updatePayload.is_active;
    delete updatePayload.is_published;
    delete updatePayload.visibility_status;
    if (publicationTarget.is_active !== (existingProduct.is_active === true)) {
      updatePayload.is_active = publicationTarget.is_active;
    }
    if (publicationTarget.is_published !== (existingProduct.is_published === true)) {
      updatePayload.is_published = publicationTarget.is_published;
    }
    if (publicationTarget.visibility_status !== existingProduct.visibility_status) {
      updatePayload.visibility_status = publicationTarget.visibility_status;
    }
    updatePayload.updated_at = new Date().toISOString();

    let req = this.supabaseAdmin.client.from("products").update(updatePayload as any).eq("id", id);
    if (resolvedMerchantId) req = req.eq("merchant_id", resolvedMerchantId);
    const { error } = await req;
    if (error) throw error;
    return { ok: true };
  }

  async updateProductStatus(id: string, payload: { is_active: boolean; merchant_id?: string; actor_role?: string; actor_id?: string }) {
    if (this.isMerchantRole(payload.actor_role)) {
      if (!payload.merchant_id) {
        throw new BadRequestException("merchant_id is required.");
      }
    }
    const resolvedMerchantId = await this.scopeResolver.resolveMerchantScope(payload.merchant_id, payload.actor_role, payload.actor_id);
    if (this.isMerchantRole(payload.actor_role)) {
      if (!resolvedMerchantId || (payload.merchant_id && resolvedMerchantId !== payload.merchant_id)) {
        throw new ForbiddenException("Merchant scope is not allowed for this actor.");
      }
    }
    if (resolvedMerchantId) {
      await this.ensureMerchantActiveForMerchantActor(resolvedMerchantId, payload.actor_role);
    }
    // The current row is loaded for BOTH directions: activation needs the readiness gate, and
    // deactivation needs to know whether the product is archived so it is not silently restored
    // to `private` by turning it off.
    let productQuery = this.supabaseAdmin.client.from("products").select("*").eq("id", id);
    if (resolvedMerchantId) productQuery = productQuery.eq("merchant_id", resolvedMerchantId);
    const { data: product, error: productError } = await productQuery.maybeSingle();
    if (productError) throw productError;
    if (!product) throw new ForbiddenException("Product not found in actor scope.");

    if (payload.is_active) {
      this.assertReadyForActivation(product as ProductReadinessInput, {
        message: "Product is not ready for activation yet.",
        exception: "forbidden",
      });
    }

    // Deactivation writes the whole triple: leaving `is_published`/`visibility_status` untouched
    // used to produce `is_active=false` + `is_published=true` + `public`.
    const publication = resolveProductPublicationState({
      requestedActive: payload.is_active === true,
      archived: payload.is_active !== true && product.visibility_status === "archived",
    });
    const updateFields: Record<string, unknown> = {
      ...publication,
      updated_at: new Date().toISOString(),
    };
    let req = this.supabaseAdmin.client.from("products").update(updateFields as any).eq("id", id);
    if (resolvedMerchantId) req = req.eq("merchant_id", resolvedMerchantId);
    const { error } = await req;
    if (error) throw error;
    return { ok: true };
  }
}
