/**
 * STORE-PR6A — Customer Order Summary data access (spec §33.4, §33.5, §10, §12).
 *
 * READ ONLY. Dedicated, bounded, minimal queries via the service-role Supabase client. It NEVER reuses
 * OrdersService.getMyOrders() and NEVER uses select("*"). It reads only the exact columns the contract needs and
 * NEVER reads customer PII (name/phone/email/address/notes/items/payment/internal metadata). It performs no
 * write of any kind (no provisioning, linking, link-status change, or audit write).
 */
import { Injectable } from "@nestjs/common";
import { SupabaseAdminService } from "../../supabase-admin/supabase-admin.service";
import { TERMINAL_ORDER_STATUSES } from "./customer-order-summary.types";

/** Only the columns needed to resolve the strict linked-customer predicate (§33.4). */
export interface CustomerLinkRow {
  DilMart_role: string | null;
  link_status: string | null;
  store_customer_id: string | null;
}

/** Only the six contract columns for latestOrder (§33.5). No PII, no raw row leaves this layer. */
export interface LatestOrderRow {
  order_number: string | null;
  status: string | null;
  delivery_status: string | null;
  total: number | null;
  currency_code: string | null;
  created_at: string | null;
}

// PostgREST `in`-list of terminal statuses, e.g. ("delivered","returned",...). Used with `.not(status,in,...)`.
const TERMINAL_IN_LIST = `(${TERMINAL_ORDER_STATUSES.map((s) => `"${s}"`).join(",")})`;

@Injectable()
export class CustomerOrderSummaryRepository {
  constructor(private readonly supabaseAdmin: SupabaseAdminService) {}

  private get db() {
    return this.supabaseAdmin.client;
  }

  /** Bounded single-row link lookup by DilMart user (DilMart_user_id is UNIQUE). Reads only 3 columns. */
  async findCustomerLink(DilMartUserId: string): Promise<CustomerLinkRow | null> {
    const { data, error } = await this.db
      .from("store_linked_profiles")
      .select("DilMart_role, link_status, store_customer_id")
      .eq("DilMart_user_id", DilMartUserId)
      .maybeSingle();
    if (error) throw error;
    return (data as CustomerLinkRow | null) ?? null;
  }

  /**
   * Store-owned active-order count for the resolved Store customer (§33.4/§33.5, §11). Uses a HEAD count (no
   * rows, no PII returned) with `orders.user_id = storeCustomerId` and status NOT IN the terminal set.
   */
  async countActiveOrders(storeCustomerId: string): Promise<number> {
    const { count, error } = await this.db
      .from("orders")
      .select("id", { count: "exact", head: true })
      .eq("user_id", storeCustomerId)
      .not("status", "in", TERMINAL_IN_LIST);
    if (error) throw error;
    return count ?? 0;
  }

  /** Most recently created order for the resolved Store customer — bounded LIMIT 1, six columns only (§33.5). */
  async findLatestOrder(storeCustomerId: string): Promise<LatestOrderRow | null> {
    const { data, error } = await this.db
      .from("orders")
      .select("order_number, status, delivery_status, total, currency_code, created_at")
      .eq("user_id", storeCustomerId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    return (data as LatestOrderRow | null) ?? null;
  }
}
