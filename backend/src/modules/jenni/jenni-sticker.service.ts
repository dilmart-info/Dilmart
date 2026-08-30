import { BadRequestException, ForbiddenException, Injectable, Logger, ServiceUnavailableException } from "@nestjs/common";
import { JenniAuthService } from "./jenni-auth.service";
import { JenniClientService } from "./jenni-client.service";
import { SupabaseAdminService } from "../supabase-admin/supabase-admin.service";

/**
 * Proxy service for Jenni sticker/barcode PDF.
 *
 * Phase 1 approach: proxy the PDF directly from Jenni API — no storage.
 * Phase 2 (later): optionally cache in Supabase Storage.
 */
@Injectable()
export class JenniStickerService {
  private readonly logger = new Logger(JenniStickerService.name);

  constructor(
    private readonly jenniClient: JenniClientService,
    private readonly jenniAuth: JenniAuthService,
    private readonly supabaseAdmin: SupabaseAdminService,
  ) {}

  /**
   * Resolve the merchant_id for a user from merchant_users table.
   * Returns null if the user is not associated with any merchant.
   */
  private async resolveMerchantIdForUser(userId: string): Promise<string | null> {
    const { data, error } = await this.supabaseAdmin.client
      .from("merchant_users")
      .select("merchant_id")
      .eq("user_id", userId)
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    return (data?.merchant_id as string) ?? null;
  }

  /**
   * Get sticker PDF for an order, proxied from Jenni.
   *
   * @param orderId - Internal order UUID
   * @param actorRole - Role of the requesting user
   * @param actorUserId - user_id of the requesting user
   * @returns Buffer containing PDF binary data
   */
  async getStickerForOrder(orderId: string, actorRole?: string, actorUserId?: string): Promise<Buffer> {
    // 1. Verify Jenni credentials are configured
    if (!this.jenniAuth.isConfigured()) {
      throw new ServiceUnavailableException(
        "Jenni delivery provider is not configured. Sticker generation is unavailable.",
      );
    }

    // 2. Load order
    const { data: order, error: orderErr } = await this.supabaseAdmin.client
      .from("orders")
      .select("id,order_number,merchant_id,status")
      .eq("id", orderId)
      .maybeSingle();
    if (orderErr) throw orderErr;
    if (!order) throw new BadRequestException("Order not found.");

    // 3. Merchant ownership check — resolve user_id → merchant_id via merchant_users
    const isMerchant = ["merchant_owner", "merchant_manager", "merchant_staff"].includes(actorRole ?? "");
    if (isMerchant) {
      if (!actorUserId) {
        throw new ForbiddenException("Missing actor identity for merchant scope.");
      }
      const merchantId = await this.resolveMerchantIdForUser(actorUserId);
      if (!merchantId) {
        throw new ForbiddenException("User is not associated with any merchant.");
      }
      if (String((order as any).merchant_id) !== merchantId) {
        throw new ForbiddenException("You do not have access to this order.");
      }
    }

    // 4. Get Jenni integration record
    const { data: integration, error: intErr } = await this.supabaseAdmin.client
      .from("order_delivery_integrations")
      .select("provider_code,external_shipment_number,provider_shipment_id,dispatch_status")
      .eq("order_id", orderId)
      .eq("provider_code", "jenni")
      .maybeSingle();
    if (intErr) throw intErr;

    if (!integration) {
      throw new BadRequestException("This order has not been dispatched to Jenni yet.");
    }

    const dispatchStatus = String((integration as any).dispatch_status ?? "");
    if (dispatchStatus !== "dispatched" && dispatchStatus !== "synced") {
      throw new BadRequestException(
        `Cannot generate sticker: dispatch status is "${dispatchStatus}". Order must be dispatched first.`,
      );
    }

    const shipmentNumber = String((integration as any).external_shipment_number ?? "").trim();
    if (!shipmentNumber) {
      throw new BadRequestException("Shipment number is missing. Cannot generate sticker.");
    }

    // 5. Fetch sticker PDF from Jenni (proxy — no storage)
    this.logger.log(`Fetching sticker for shipment ${shipmentNumber} (order ${orderId})`);
    try {
      const pdfBuffer = await this.jenniClient.fetchStickerPdf([shipmentNumber]);
      return pdfBuffer;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to fetch sticker from Jenni.";
      this.logger.error(`Sticker fetch failed for ${shipmentNumber}: ${message}`);
      throw new ServiceUnavailableException(`Could not retrieve sticker from Jenni: ${message}`);
    }
  }
}
