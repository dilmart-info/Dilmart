import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { SupabaseAdminService } from "../supabase-admin/supabase-admin.service";
import { ProductContentBulkUpdateDto } from "./product-content-bulk.dto";
import {
  SHORT_DESCRIPTION_MAX,
  SHORT_DESCRIPTION_MIN,
  codePointLength,
  validateShortDescription,
} from "./short-description";

const HOLD_SKU = "ARD-1191";

/**
 * Admin content-only bulk update. Writes go through
 * `product_content_bulk_update_atomic` (single DB transaction).
 * Nest validates payload + HOLD/duplicates before the RPC for fail-fast UX;
 * the RPC re-validates and is the source of transactional truth.
 */
@Injectable()
export class ProductContentBulkService {
  constructor(private readonly supabaseAdmin: SupabaseAdminService) {}

  /**
   * Fail-fast mirror of the RPC's live-description guard.
   *
   * SKU matching mirrors the RPC exactly (`upper(btrim(merchant_sku))`): the stored casing may
   * differ from the normalized SKU in the payload, so rows are fetched for the merchant with a
   * case-insensitive match and compared normalized in JS. An exact `.in()` match would silently
   * miss a legacy lower-case SKU and report "safe" for a product the RPC would (correctly)
   * refuse. The RPC remains the authority — this only turns a common mistake into a fast 400.
   */
  private async assertNoLiveDescriptionClearing(
    merchantId: string,
    rpcItems: Array<{ merchant_sku: string; description: string | null }>,
  ) {
    const clearedSkus = rpcItems.filter((item) => item.description === null).map((item) => item.merchant_sku);
    if (clearedSkus.length === 0) return;

    // `ilike` (case-insensitive) instead of an exact `in`, so a stored `ard-1007` still matches
    // the normalized `ARD-1007`. A SKU with characters that cannot be embedded safely in the
    // PostgREST `or` grammar is simply left to the authoritative RPC check.
    const matchable = clearedSkus.filter((sku) => /^[A-Za-z0-9 ._\-#/]+$/.test(sku));
    if (matchable.length === 0) return;

    const { data, error } = await this.supabaseAdmin.client
      .from("products")
      .select("merchant_sku,is_active,is_published,visibility_status")
      .eq("merchant_id", merchantId)
      .or(matchable.map((sku) => `merchant_sku.ilike."${sku}"`).join(","));
    if (error) throw error;

    const cleared = new Set(clearedSkus);
    const blocked = ((data ?? []) as Array<{
      merchant_sku: string | null;
      is_active: boolean | null;
      is_published: boolean | null;
      visibility_status: string | null;
    }>)
      .filter((row) => cleared.has(String(row.merchant_sku ?? "").trim().toUpperCase()))
      .filter((row) => row.is_active === true || row.is_published === true || row.visibility_status === "public");

    if (blocked.length > 0) {
      throw new BadRequestException({
        message: "Cannot clear the description of an active/published product.",
        code: "CONTENT_BULK_PRODUCT_NOT_READY",
        merchant_skus: blocked.map((row) => String(row.merchant_sku ?? "").trim().toUpperCase()),
      });
    }
  }

  async bulkUpdateContent(
    merchantId: string,
    payload: ProductContentBulkUpdateDto,
    actor?: { actor_role?: string; actor_id?: string },
  ) {
    const role = actor?.actor_role;
    if (role !== "admin" && role !== "super_admin") {
      throw new ForbiddenException("Admin role required.");
    }
    if (!actor?.actor_id) {
      throw new BadRequestException("actor_id is required.");
    }

    const { data: merchant, error: merchantErr } = await this.supabaseAdmin.client
      .from("merchants")
      .select("id")
      .eq("id", merchantId)
      .maybeSingle();
    if (merchantErr) throw merchantErr;
    if (!merchant) throw new NotFoundException("Merchant not found.");

    const items = payload.items ?? [];
    if (items.length < 1) {
      throw new BadRequestException({ message: "items required", code: "CONTENT_BULK_ITEMS_REQUIRED" });
    }

    const seen = new Set<string>();
    const rpcItems: Array<{
      merchant_sku: string;
      short_description: string;
      description: string | null;
    }> = [];

    for (const raw of items) {
      const sku = String(raw.merchant_sku ?? "")
        .trim()
        .toUpperCase();
      if (!sku) {
        throw new BadRequestException({ message: "merchant_sku required", code: "CONTENT_BULK_SKU_REQUIRED" });
      }
      if (sku === HOLD_SKU) {
        throw new BadRequestException({
          message: `HOLD SKU rejected: ${HOLD_SKU}`,
          code: "CONTENT_BULK_HOLD_SKU_REJECTED",
        });
      }
      if (seen.has(sku)) {
        throw new BadRequestException({
          message: `Duplicate merchant_sku: ${sku}`,
          code: "CONTENT_BULK_DUPLICATE_SKU",
        });
      }
      seen.add(sku);

      const short = validateShortDescription(raw.short_description, { required: true });
      if (!short.ok) {
        throw new BadRequestException({
          message: short.message,
          code: `CONTENT_BULK_${short.code}`,
          merchant_sku: sku,
          length: codePointLength(String(raw.short_description ?? "").trim()),
          min: SHORT_DESCRIPTION_MIN,
          max: SHORT_DESCRIPTION_MAX,
        });
      }

      const descriptionRaw =
        raw.description === undefined || raw.description === null
          ? null
          : String(raw.description).trim() || null;

      rpcItems.push({
        merchant_sku: sku,
        short_description: short.value as string,
        description: descriptionRaw,
      });
    }

    // Readiness invariant: this admin path may not clear the description of a product that is
    // currently live. `description_present` is an activation readiness check, so blanking it
    // would leave an active/published/public product below the bar every activation path
    // enforces. Editing the description of a draft product stays unrestricted.
    //
    // AUTHORITY: the enforcing check lives in `product_content_bulk_update_atomic`, which locks
    // each matched product FOR UPDATE inside the same transaction as the write (see
    // supabase/migrations/20260819130000_product_content_bulk_live_description_guard.sql). The
    // block below is fail-fast UX only — it cannot be authoritative because a product can be
    // activated between this read and the RPC call.
    await this.assertNoLiveDescriptionClearing(merchantId, rpcItems);

    const { data, error } = await this.supabaseAdmin.client.rpc("product_content_bulk_update_atomic", {
      p_merchant_id: merchantId,
      p_actor_id: actor.actor_id,
      p_actor_role: role,
      p_items: rpcItems,
    });

    if (error) {
      const msg = String(error.message ?? error);
      throw new BadRequestException({
        message: msg,
        code: msg.split(":")[0]?.trim() || "CONTENT_BULK_FAILED",
      });
    }

    return data;
  }
}
