import { BadRequestException, ForbiddenException, Injectable } from "@nestjs/common";
import { SupabaseAdminService } from "../supabase-admin/supabase-admin.service";
import { UpdateCustomerProfileDto, UpsertCustomerAddressDto } from "./customer.dto";

@Injectable()
export class CustomerService {
  constructor(private readonly supabaseAdmin: SupabaseAdminService) {}

  private assertActor(actorId?: string) {
    if (!actorId) throw new ForbiddenException("Authentication required.");
  }

  async getProfile(actorId?: string) {
    this.assertActor(actorId);
    const { data, error } = await this.supabaseAdmin.client.from("customer_profiles").select("*").eq("user_id", actorId!).maybeSingle();
    if (!error && data) {
      return data;
    }

    const { data: legacy, error: legacyError } = await this.supabaseAdmin.client
      .from("profiles")
      .select("id,full_name,phone,email")
      .eq("id", actorId!)
      .maybeSingle();
    if (legacyError) {
      return { user_id: actorId, full_name: null, phone: null, email: null };
    }
    return {
      user_id: actorId,
      full_name: (legacy as any)?.full_name ?? null,
      phone: (legacy as any)?.phone ?? null,
      email: (legacy as any)?.email ?? null,
    };
  }

  async updateProfile(actorId?: string, payload?: UpdateCustomerProfileDto) {
    this.assertActor(actorId);
    const { data, error } = await this.supabaseAdmin.client
      .from("customer_profiles")
      .upsert(
        {
          user_id: actorId!,
          full_name: payload?.full_name ?? null,
          phone: payload?.phone ?? null,
          email: payload?.email ?? null,
        } as any,
        { onConflict: "user_id" },
      )
      .select("*")
      .single();
    if (error) throw error;
    return data;
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
}
