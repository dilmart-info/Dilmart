/**
 * STORE-PR6A — Customer Order Summary orchestration (spec §33).
 *
 * Flow: feature flag (fail closed) → verify the dedicated Order Summary assertion → resolve the EXISTING linked
 * Store customer (read-only, strict predicate) → bounded minimal order queries → project a NEW safe object.
 * No provisioning, no linking, no session, no DB write, no PII, no raw row passthrough.
 */
import { Injectable } from "@nestjs/common";
import { CustomerOrderSummaryConfig } from "./customer-order-summary.config";
import { CustomerOrderSummaryAssertionService } from "./customer-order-summary-assertion.service";
import {
  CustomerOrderSummaryRepository,
  CustomerLinkRow,
  LatestOrderRow,
} from "./customer-order-summary.repository";
import { OrderSummaryErrors } from "./customer-order-summary.errors";
import {
  OrderSummaryLatestOrder,
  OrderSummaryResponse,
} from "./customer-order-summary.types";

/** `linked = true` ONLY for an existing CUSTOMER + LINKED row with a non-null store_customer_id (spec §33.4). */
export function isLinkedCustomer(link: CustomerLinkRow | null): link is CustomerLinkRow & { store_customer_id: string } {
  return (
    !!link &&
    link.DilMart_role === "CUSTOMER" &&
    link.link_status === "LINKED" &&
    typeof link.store_customer_id === "string" &&
    link.store_customer_id.length > 0
  );
}

/** Project the six allowed fields into a NEW object — never a raw DB row (spec §33.5). currency = currency_code. */
export function projectLatestOrder(row: LatestOrderRow | null): OrderSummaryLatestOrder | null {
  if (!row) return null;
  if (typeof row.order_number !== "string" || typeof row.status !== "string") return null;
  return {
    orderNumber: row.order_number,
    status: row.status,
    deliveryStatus: typeof row.delivery_status === "string" ? row.delivery_status : null,
    total: typeof row.total === "number" ? row.total : Number(row.total ?? 0),
    currency: typeof row.currency_code === "string" && row.currency_code.length > 0 ? row.currency_code : "",
    createdAt: typeof row.created_at === "string" ? row.created_at : "",
  };
}

/** Extract the bearer token from an Authorization header. Returns null if absent/malformed. */
export function extractBearer(authorization: string | undefined): string | null {
  if (typeof authorization !== "string") return null;
  const m = authorization.match(/^Bearer\s+(.+)$/i);
  const token = m?.[1]?.trim();
  return token && token.length > 0 ? token : null;
}

@Injectable()
export class CustomerOrderSummaryService {
  constructor(
    private readonly config: CustomerOrderSummaryConfig,
    private readonly assertion: CustomerOrderSummaryAssertionService,
    private readonly repo: CustomerOrderSummaryRepository,
  ) {}

  async getOrderSummary(authorization: string | undefined): Promise<OrderSummaryResponse> {
    // Fail closed when the independent Store flag is not exactly enabled (§33.6).
    if (!this.config.enabled) throw OrderSummaryErrors.disabled();

    const token = extractBearer(authorization);
    if (!token) throw OrderSummaryErrors.unauthorized();

    // Dedicated verifier — any failure becomes a safe UNAUTHORIZED (no raw assertion / crypto detail leaks).
    let sub: string;
    try {
      const claims = await this.assertion.verify(token);
      sub = claims.sub;
    } catch {
      throw OrderSummaryErrors.unauthorized();
    }

    const link = await this.repo.findCustomerLink(sub);
    const updatedAt = new Date().toISOString(); // server response time; no DB write (§33 / §14)

    if (!isLinkedCustomer(link)) {
      // Not-linked (no row / BLOCKED / REVOKED / LINK_REQUIRED / NULL / non-CUSTOMER / missing id). No handoff.
      return { linked: false, activeOrdersCount: 0, latestOrder: null, updatedAt };
    }

    const storeCustomerId = link.store_customer_id;
    const [activeOrdersCount, latest] = await Promise.all([
      this.repo.countActiveOrders(storeCustomerId),
      this.repo.findLatestOrder(storeCustomerId),
    ]);

    return {
      linked: true,
      activeOrdersCount,
      latestOrder: projectLatestOrder(latest),
      updatedAt,
    };
  }
}
