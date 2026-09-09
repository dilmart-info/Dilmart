import { BadRequestException, ForbiddenException, Injectable, InternalServerErrorException, Logger, NotFoundException } from "@nestjs/common";
import { ActorContext } from "../../common/authz/actor-context.decorator";
import { SupabaseAdminService } from "../supabase-admin/supabase-admin.service";
import { RequestAccountDeletionDto, UpdateCustomerProfileDto, UpsertCustomerAddressDto } from "./customer.dto";

@Injectable()
export class CustomerService {
  private readonly logger = new Logger(CustomerService.name);

  constructor(private readonly supabaseAdmin: SupabaseAdminService) {}

  private assertActor(actorId?: string) {
    if (!actorId) throw new ForbiddenException("Authentication required.");
  }

  async getProfile(actorId?: string) {
    this.assertActor(actorId);

    // Canonical identity fields (full_name, phone, email) are read strictly from public.profiles.
    // customer_profiles is treated as deprecated secondary storage and must never override canonical identity.
    const { data: profile, error } = await this.supabaseAdmin.client
      .from("profiles")
      .select("id, full_name, phone, email")
      .eq("id", actorId!)
      .maybeSingle();

    if (error) throw error;

    return {
      user_id: actorId,
      full_name: (profile as any)?.full_name ?? null,
      phone: (profile as any)?.phone ?? null,
      email: (profile as any)?.email ?? null,
    };
  }

  async updateProfile(actorId?: string, payload?: UpdateCustomerProfileDto) {
    this.assertActor(actorId);

    // Defense-in-depth: Reject any runtime payload keys other than 'full_name'
    if (payload && typeof payload === "object") {
      const allowedKeys = new Set(["full_name"]);
      for (const key of Object.keys(payload)) {
        if (!allowedKeys.has(key)) {
          throw new BadRequestException(`Field '${key}' cannot be modified via this endpoint. Dedicated verification flows are required.`);
        }
      }
    }

    if (!payload?.full_name || typeof payload.full_name !== "string") {
      throw new BadRequestException("full_name is required.");
    }

    const trimmed = payload.full_name.trim();
    if (trimmed.length < 2) {
      throw new BadRequestException("full_name must be at least 2 characters.");
    }
    if (trimmed.length > 100) {
      throw new BadRequestException("full_name cannot exceed 100 characters.");
    }

    // Canonical write: updates ONLY the authenticated actor's profiles.full_name
    const { data: updatedProfile, error } = await this.supabaseAdmin.client
      .from("profiles")
      .update({
        full_name: trimmed,
        updated_at: new Date().toISOString(),
      })
      .eq("id", actorId!)
      .select("id, full_name, phone, email")
      .maybeSingle();

    if (error) throw error;
    if (!updatedProfile) {
      throw new NotFoundException("Profile not found for authenticated actor.");
    }

    return {
      user_id: actorId,
      full_name: (updatedProfile as any).full_name ?? null,
      phone: (updatedProfile as any).phone ?? null,
      email: (updatedProfile as any).email ?? null,
    };
  }

  async listAddresses(actorId?: string) {
    this.assertActor(actorId);
    const { data, error } = await this.supabaseAdmin.client
      .from("customer_addresses")
      .select("*")
      .eq("user_id", actorId!)
      .order("is_default", { ascending: false })
      .order("created_at", { ascending: false });
    if (error) throw error;
    return data ?? [];
  }

  async createAddress(actorId?: string, payload?: UpsertCustomerAddressDto) {
    this.assertActor(actorId);
    if (!payload?.recipient_phone?.trim() || !payload?.area?.trim()) {
      throw new BadRequestException("recipient_phone and area are required.");
    }

    const current = await this.listAddresses(actorId);
    const shouldBeDefault = payload.is_default === true || current.length === 0 || !current.some((item: any) => item.is_default);
    if (shouldBeDefault) {
      await this.supabaseAdmin.client.from("customer_addresses").update({ is_default: false } as any).eq("user_id", actorId!);
    }

    const { data, error } = await this.supabaseAdmin.client
      .from("customer_addresses")
      .insert({
        user_id: actorId!,
        label: payload.label ?? "Other",
        recipient_name: payload.recipient_name,
        recipient_phone: payload.recipient_phone,
        governorate_id: payload.governorate_id ?? null,
        area: payload.area,
        nearest_landmark: payload.nearest_landmark ?? null,
        map_url: payload.map_url ?? null,
        delivery_notes: payload.delivery_notes ?? null,
        is_default: shouldBeDefault,
      } as any)
      .select("*")
      .single();
    if (error) throw error;
    return data;
  }

  async updateAddress(actorId: string | undefined, addressId: string, payload: UpsertCustomerAddressDto) {
    this.assertActor(actorId);
    const { data: existing, error: existingError } = await this.supabaseAdmin.client
      .from("customer_addresses")
      .select("id,user_id,is_default")
      .eq("id", addressId)
      .maybeSingle();
    if (existingError) throw existingError;
    if (!existing?.id || existing.user_id !== actorId) throw new ForbiddenException("Address access denied.");

    if (payload.is_default === true) {
      await this.supabaseAdmin.client.from("customer_addresses").update({ is_default: false } as any).eq("user_id", actorId!);
    }

    const { data, error } = await this.supabaseAdmin.client
      .from("customer_addresses")
      .update({
        label: payload.label ?? undefined,
        recipient_name: payload.recipient_name,
        recipient_phone: payload.recipient_phone,
        governorate_id: payload.governorate_id ?? null,
        area: payload.area,
        nearest_landmark: payload.nearest_landmark ?? null,
        map_url: payload.map_url ?? null,
        delivery_notes: payload.delivery_notes ?? null,
        is_default: payload.is_default === true ? true : existing.is_default,
      } as any)
      .eq("id", addressId)
      .eq("user_id", actorId!)
      .select("*")
      .single();
    if (error) throw error;
    return data;
  }

  async deleteAddress(actorId: string | undefined, addressId: string) {
    this.assertActor(actorId);
    const { data: existing, error: existingError } = await this.supabaseAdmin.client
      .from("customer_addresses")
      .select("id,user_id,is_default")
      .eq("id", addressId)
      .maybeSingle();
    if (existingError) throw existingError;
    if (!existing?.id || existing.user_id !== actorId) throw new ForbiddenException("Address access denied.");

    const { error } = await this.supabaseAdmin.client.from("customer_addresses").delete().eq("id", addressId).eq("user_id", actorId!);
    if (error) throw error;

    if (existing.is_default) {
      const { data: nextAddress, error: nextError } = await this.supabaseAdmin.client
        .from("customer_addresses")
        .select("id")
        .eq("user_id", actorId!)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (nextError) throw nextError;
      if (nextAddress?.id) {
        await this.supabaseAdmin.client.from("customer_addresses").update({ is_default: true } as any).eq("id", nextAddress.id).eq("user_id", actorId!);
      }
    }

    return { ok: true };
  }

  async setDefaultAddress(actorId: string | undefined, addressId: string) {
    this.assertActor(actorId);
    const { data: existing, error: existingError } = await this.supabaseAdmin.client
      .from("customer_addresses")
      .select("id,user_id")
      .eq("id", addressId)
      .maybeSingle();
    if (existingError) throw existingError;
    if (!existing?.id || existing.user_id !== actorId) throw new ForbiddenException("Address access denied.");

    await this.supabaseAdmin.client.from("customer_addresses").update({ is_default: false } as any).eq("user_id", actorId!);
    const { error } = await this.supabaseAdmin.client
      .from("customer_addresses")
      .update({ is_default: true } as any)
      .eq("id", addressId)
      .eq("user_id", actorId!);
    if (error) throw error;
    return { ok: true };
  }

  async listOrders(actorId: string | undefined, limit?: number) {
    this.assertActor(actorId);

    let req = this.supabaseAdmin.client
      .from("orders")
      .select("id,order_number,status,delivery_status,total,created_at,order_items(product_id,product_name,quantity,price)")
      .eq("user_id", actorId!)
      .order("created_at", { ascending: false });

    if (limit && Number.isFinite(limit)) {
      req = req.limit(Math.max(1, Math.min(50, Math.floor(limit))));
    }

    const { data, error } = await req;
    if (error) throw error;

    return (data ?? []).map((order: any) => ({
      id: order.id,
      order_number: order.order_number,
      status: order.status,
      delivery_status: order.delivery_status,
      total: Number(order.total ?? 0),
      created_at: order.created_at,
      items_count: Array.isArray(order.order_items) ? order.order_items.length : 0,
      items_preview: Array.isArray(order.order_items)
        ? order.order_items.slice(0, 4).map((item: any) => ({
            product_id: item.product_id,
            product_name: item.product_name,
            quantity: Number(item.quantity ?? 0),
            price: Number(item.price ?? 0),
          }))
        : [],
    }));
  }

  async getOrderDetail(actorId: string | undefined, orderId: string) {
    this.assertActor(actorId);

    const { data: order, error } = await this.supabaseAdmin.client
      .from("orders")
      .select("id,order_number,status,delivery_status,created_at,total,user_id,customer_name,customer_phone,governorate_id,area,nearest_landmark,map_url,notes,order_items(product_id,product_name,quantity,price,merchant_id)")
      .eq("id", orderId)
      .maybeSingle();
    if (error) throw error;
    if (!order?.id || order.user_id !== actorId) {
      throw new ForbiddenException("Order access denied.");
    }

    return {
      id: order.id,
      order_number: order.order_number,
      status: order.status,
      delivery_status: order.delivery_status,
      created_at: order.created_at,
      total: Number(order.total ?? 0),
      delivery_snapshot: {
        customer_name: order.customer_name,
        customer_phone: order.customer_phone,
        governorate_id: order.governorate_id,
        area: order.area,
        nearest_landmark: order.nearest_landmark,
        map_url: order.map_url,
        notes: order.notes,
      },
      items: (order.order_items ?? []).map((item: any) => ({
        product_id: item.product_id,
        product_name: item.product_name,
        quantity: Number(item.quantity ?? 0),
        price: Number(item.price ?? 0),
        merchant_id: item.merchant_id ?? null,
      })),
    };
  }

  async getReorderPreview(actorId: string | undefined, orderId: string) {
    this.assertActor(actorId);
    const detail = await this.getOrderDetail(actorId, orderId);

    const productIds = detail.items.map((item) => item.product_id).filter(Boolean);
    if (productIds.length === 0) {
      return {
        can_reorder: false,
        merchant_id: null,
        valid_items: [],
        unavailable_items: [],
        warnings: ["لا توجد منتجات في هذا الطلب."],
      };
    }

    const { data: products, error: productsError } = await this.supabaseAdmin.client
      .from("products")
      .select("id,name,price,discount_price,stock,is_active,merchant_id,merchants(status)")
      .in("id", productIds);
    if (productsError) throw productsError;

    const byId = new Map<string, any>((products ?? []).map((p: any) => [p.id, p]));
    const validItems: Array<{
      product_id: string;
      product_name: string;
      quantity: number;
      current_price: number;
      previous_price: number;
      price_changed: boolean;
      stock_available: boolean;
    }> = [];
    const unavailableItems: Array<{ product_id: string; product_name: string; reason: "inactive" | "deleted" | "out_of_stock" | "merchant_inactive" }> = [];
    const warnings: string[] = [];
    let merchantId: string | null = null;

    for (const item of detail.items) {
      const product = byId.get(item.product_id);
      if (!product) {
        unavailableItems.push({ product_id: item.product_id, product_name: item.product_name, reason: "deleted" });
        continue;
      }
      const merchant = Array.isArray(product.merchants) ? product.merchants[0] : product.merchants;
      if (merchant?.status !== "active") {
        unavailableItems.push({ product_id: item.product_id, product_name: item.product_name, reason: "merchant_inactive" });
        continue;
      }
      if (!product.is_active) {
        unavailableItems.push({ product_id: item.product_id, product_name: item.product_name, reason: "inactive" });
        continue;
      }
      if (Number(product.stock ?? 0) <= 0) {
        unavailableItems.push({ product_id: item.product_id, product_name: item.product_name, reason: "out_of_stock" });
        continue;
      }

      const currentPrice = Number(product.discount_price ?? product.price ?? 0);
      const previousPrice = Number(item.price ?? 0);
      const quantity = Math.max(1, Math.min(Number(item.quantity ?? 1), Number(product.stock ?? 0)));
      if (quantity < Number(item.quantity ?? 1)) {
        warnings.push(`تم تقليل كمية ${item.product_name} حسب المخزون الحالي.`);
      }
      if (merchantId && merchantId !== product.merchant_id) {
        warnings.push("لا يمكن مزج منتجات من أكثر من متجر في إعادة الطلب.");
        continue;
      }
      merchantId = merchantId ?? product.merchant_id ?? null;

      validItems.push({
        product_id: item.product_id,
        product_name: item.product_name,
        quantity,
        current_price: currentPrice,
        previous_price: previousPrice,
        price_changed: currentPrice !== previousPrice,
        stock_available: true,
      });
      if (currentPrice !== previousPrice) {
        warnings.push(`تم تحديث سعر ${item.product_name} إلى السعر الحالي.`);
      }
    }

    if (validItems.length === 0) {
      warnings.push("لا يمكن إعادة هذا الطلب لأن المنتجات لم تعد متاحة.");
    }

    return {
      can_reorder: validItems.length > 0 && !!merchantId,
      merchant_id: merchantId,
      valid_items: validItems,
      unavailable_items: unavailableItems,
      warnings: Array.from(new Set(warnings)),
    };
  }

  /**
   * Permanent account deletion for customer accounts.
   * Enforces customer-only role, active order/dispute precheck, transactional DB anonymization & detachment,
   * JWT-based global session revocation, Auth deletion, and verification before reporting success.
   */
  async deleteAccount(actor: ActorContext, payload: RequestAccountDeletionDto) {
    this.assertActor(actor?.actorId);
    const actorId = actor.actorId!;

    // 1. Authorization: customer-only endpoint
    if (actor.actorRole && !["customer", "authenticated"].includes(actor.actorRole)) {
      throw new ForbiddenException("حذف الحساب مخصص لحسابات المتسوقين فقط. يرجى التواصل مع الإدارة المركزية.");
    }

    // Check if user has administrative or merchant staff role in DB
    const { data: profile } = await this.supabaseAdmin.client
      .from("profiles")
      .select("role")
      .eq("id", actorId)
      .maybeSingle();

    if (profile?.role && !["customer", "authenticated"].includes(profile.role)) {
      throw new ForbiddenException("لا يمكن حذف حسابات المشرفين أو الإداريين من هذه البوابة.");
    }

    const { data: merchantUser } = await this.supabaseAdmin.client
      .from("merchant_users")
      .select("id")
      .eq("user_id", actorId)
      .limit(1)
      .maybeSingle();

    if (merchantUser) {
      throw new ForbiddenException("حساب التاجر مرتبط بمتجر، يرجى مراجعة إدارة المنصة لإنهاء الحساب.");
    }

    // 2. Explicit confirmation check
    if (payload?.confirmed !== true) {
      throw new BadRequestException("يجب تأكيد الرغبة في حذف الحساب صراحةً.");
    }

    // 3. Bearer session token check for session revocation
    const accessToken = actor.actorToken?.trim();
    if (!accessToken) {
      throw new ForbiddenException("رمز الجلسة مفقود، يرجى تسجيل الدخول مجدداً لإتمام الحذف.");
    }

    // 4. Precheck: Reject if active fulfillment, return disputes, or pending cancellations exist
    const { data: activeOrders } = await this.supabaseAdmin.client
      .from("orders")
      .select("id, status, delivery_status")
      .eq("user_id", actorId)
      .in("status", ["new", "contacted", "preparing", "shipped"])
      .limit(1);

    if (activeOrders && activeOrders.length > 0) {
      throw new BadRequestException("لا يمكن حذف الحساب نظراً لوجود طلبات قيد التجهيز أو التوصيل حالياً.");
    }

    const { data: activeReturns } = await this.supabaseAdmin.client
      .from("order_return_requests")
      .select("id, status, refund_status")
      .eq("customer_id", actorId)
      .not("status", "in", '("rejected","completed","cancelled")')
      .limit(1);

    if (activeReturns && activeReturns.length > 0) {
      throw new BadRequestException("لا يمكن حذف الحساب نظراً لوجود طلب استرجاع أو استرداد مالي قيد المراجعة.");
    }

    const { data: activeCancellations } = await this.supabaseAdmin.client
      .from("order_cancellation_requests")
      .select("id, status")
      .eq("user_id", actorId)
      .eq("status", "pending")
      .limit(1);

    if (activeCancellations && activeCancellations.length > 0) {
      throw new BadRequestException("لا يمكن حذف الحساب نظراً لوجود طلب إلغاء قيد المعالجة.");
    }

    // 5. Concurrency & partial-failure recovery: find or create logical request
    const { data: existingRequest } = await this.supabaseAdmin.client
      .from("account_deletion_requests")
      .select("id, status, step")
      .eq("user_id", actorId)
      .in("status", ["requested", "processing"])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    let requestId = existingRequest?.id;
    let currentStep = existingRequest?.step ?? "requested";

    if (!requestId) {
      const { data: created, error: createError } = await this.supabaseAdmin.client
        .from("account_deletion_requests")
        .insert({
          user_id: actorId,
          status: "processing",
          step: "requested",
          source: "app_customer",
          metadata: { reason: payload.reason ?? null },
        })
        .select("id")
        .single();

      if (createError) {
        this.logger.error(`Failed to create account_deletion_request: ${createError.message}`);
        throw new InternalServerErrorException("تعذر تسجيل طلب الحذف، يرجى المحاولة لاحقاً.");
      }
      requestId = created.id;
    }

    // 6. Step: Database Anonymization and Detachment via transactional RPC
    if (currentStep === "requested") {
      try {
        const { error: rpcError } = await this.supabaseAdmin.client.rpc(
          "anonymize_and_detach_customer",
          { p_user_id: actorId, p_reason: payload.reason ?? "customer_requested" },
        );

        if (rpcError) {
          const msg = rpcError.message || "";
          if (msg.includes("ACTIVE_ORDERS_IN_FULFILLMENT")) {
            throw new BadRequestException("لا يمكن حذف الحساب نظراً لوجود طلبات قيد التجهيز أو التوصيل حالياً.");
          }
          if (msg.includes("ACTIVE_RETURNS_EXIST")) {
            throw new BadRequestException("لا يمكن حذف الحساب نظراً لوجود طلب استرجاع أو استرداد مالي قيد المراجعة.");
          }
          if (msg.includes("ACTIVE_CANCELLATIONS_EXIST")) {
            throw new BadRequestException("لا يمكن حذف الحساب نظراً لوجود طلب إلغاء قيد المعالجة.");
          }
          throw rpcError;
        }

        await this.supabaseAdmin.client
          .from("account_deletion_requests")
          .update({ step: "db_anonymized", updated_at: new Date().toISOString() })
          .eq("id", requestId);
        currentStep = "db_anonymized";
      } catch (err: any) {
        if (err instanceof BadRequestException || err instanceof ForbiddenException) {
          await this.supabaseAdmin.client
            .from("account_deletion_requests")
            .update({ status: "failed", error_code: "PRECONDITION_FAILED", updated_at: new Date().toISOString() })
            .eq("id", requestId);
          throw err;
        }
        await this.supabaseAdmin.client
          .from("account_deletion_requests")
          .update({ status: "failed", error_code: "DB_ANONYMIZATION_ERROR", updated_at: new Date().toISOString() })
          .eq("id", requestId);
        this.logger.error(`Database anonymization failed for actor ${actorId}: ${err?.message}`);
        throw new InternalServerErrorException("تعذر إكمال معالجة بيانات الحساب، سيقوم النظام بالمحاولة لاحقاً.");
      }
    }

    // 7. Step: Global session revocation using Bearer accessToken
    if (currentStep === "db_anonymized") {
      const revokeRes = await this.supabaseAdmin.revokeUserSession(accessToken);
      if (!revokeRes.ok) {
        this.logger.warn(`Global session revocation warning for ${actorId}: ${revokeRes.error}`);
      }
      await this.supabaseAdmin.client
        .from("account_deletion_requests")
        .update({ step: "auth_revoked", updated_at: new Date().toISOString() })
        .eq("id", requestId);
      currentStep = "auth_revoked";
    }

    // 8. Step: Supabase Auth user deletion from auth.users
    if (currentStep === "auth_revoked" || currentStep === "db_anonymized") {
      const delRes = await this.supabaseAdmin.deleteAuthUser(actorId);
      if (!delRes.ok) {
        this.logger.error(`Supabase Auth deleteUser failed for ${actorId}: ${delRes.error}`);
        await this.supabaseAdmin.client
          .from("account_deletion_requests")
          .update({
            status: "failed",
            error_code: "AUTH_DELETE_FAILED",
            updated_at: new Date().toISOString(),
          })
          .eq("id", requestId);
        throw new InternalServerErrorException(
          "تم إخفاء بياناتك الشخصية ولكن تعذر حذف الحساب نهائياً من خادم المصادقة بشكل فوري. سيكمل النظام الحذف تلقائياً.",
        );
      }
      currentStep = "auth_deleted";
    }

    // 9. Step: Verify deletion before reporting completion
    const isDeleted = await this.supabaseAdmin.verifyUserDeleted(actorId);
    if (!isDeleted) {
      await this.supabaseAdmin.client
        .from("account_deletion_requests")
        .update({
          status: "failed",
          error_code: "AUTH_VERIFICATION_PENDING",
          updated_at: new Date().toISOString(),
        })
        .eq("id", requestId);
      throw new InternalServerErrorException(
        "جارٍ التحقق من إتمام حذف الحساب، ستتم المعالجة عبر نظام المطابقة التلقائي.",
      );
    }

    // 10. Step: Finalize request record and scrub raw user_id/PII
    await this.supabaseAdmin.client
      .from("account_deletion_requests")
      .update({
        user_id: null,
        status: "completed",
        step: "auth_deleted",
        completed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", requestId);

    return {
      ok: true,
      message: "تم حذف حسابك وجميع بياناتك الشخصية بنجاح وفق المعايير المعتمدة.",
    };
  }

  /**
   * Trusted backend reconciliation mechanism for unfinished deletion requests.
   * Inspects pending/failed deletion requests and completes auth deletion.
   */
  async reconcilePendingAccountDeletions(): Promise<{ processed: number; completed: number; errors: number }> {
    const { data: requests, error } = await this.supabaseAdmin.client
      .from("account_deletion_requests")
      .select("id, user_id, status, step")
      .not("user_id", "is", null)
      .in("status", ["processing", "failed"])
      .order("created_at", { ascending: true })
      .limit(20);

    if (error || !requests) {
      this.logger.debug(`No pending deletion requests found or error: ${error?.message}`);
      return { processed: 0, completed: 0, errors: 0 };
    }

    let completedCount = 0;
    let errorCount = 0;

    for (const req of requests) {
      if (!req.user_id) continue;
      try {
        // First check if already deleted from auth
        const alreadyDeleted = await this.supabaseAdmin.verifyUserDeleted(req.user_id);
        if (alreadyDeleted) {
          await this.supabaseAdmin.client
            .from("account_deletion_requests")
            .update({
              user_id: null,
              status: "completed",
              step: "auth_deleted",
              completed_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            })
            .eq("id", req.id);
          completedCount++;
          continue;
        }

        // If step was requested, try DB anonymization first
        if (req.step === "requested") {
          await this.supabaseAdmin.client.rpc("anonymize_and_detach_customer", {
            p_user_id: req.user_id,
            p_reason: "reconciliation_worker",
          });
        }

        // Attempt deleteUser
        const delRes = await this.supabaseAdmin.deleteAuthUser(req.user_id);
        if (delRes.ok) {
          const verified = await this.supabaseAdmin.verifyUserDeleted(req.user_id);
          if (verified) {
            await this.supabaseAdmin.client
              .from("account_deletion_requests")
              .update({
                user_id: null,
                status: "completed",
                step: "auth_deleted",
                completed_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
              })
              .eq("id", req.id);
            completedCount++;
            continue;
          }
        }
        errorCount++;
      } catch (err: any) {
        this.logger.error(`Reconciliation error for deletion request ${req.id}: ${err?.message}`);
        errorCount++;
      }
    }

    return {
      processed: requests.length,
      completed: completedCount,
      errors: errorCount,
    };
  }
}

