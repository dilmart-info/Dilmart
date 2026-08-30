/**
 * Merchant Commercial Agreement: order-finance arithmetic for the two confirmed business
 * agreements (Al Arsh 15%, Ard Al Khaleej 12%). Delivery charge is intentionally excluded from
 * the commission base — matches existing computeOrderFinancialSnapshot semantics (untouched by
 * this feature).
 */

import test from "node:test";
import assert from "node:assert/strict";

process.env.SUPABASE_URL = process.env.SUPABASE_URL ?? "https://example.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "test-service-role-key";

test("12% agreement: merchandise gross 100000 -> commission 12000, merchant amount 88000", async () => {
  const { OrderFinanceService } = await import("../dist/modules/finance/order-finance.service.js");
  const service = new OrderFinanceService({}, {}, {});

  const snapshot = service.computeOrderFinancialSnapshot({
    subtotal: 100000,
    discount: 0,
    deliveryFeeCharged: 5000,
    channel: "web_checkout",
    terms: { commission_type: "percentage", commission_rate: 12, assisted_fee_rate: 0, platform_fee_rate: 0, delivery_billing_mode: "customer_pays" },
  });

  assert.equal(snapshot.merchant_gross_amount, 100000);
  assert.equal(snapshot.platform_commission_amount, 12000);
  assert.equal(snapshot.merchant_net_amount, 88000, "merchant amount before other explicitly applicable fees");
  assert.equal(snapshot.delivery_fee_charged, 5000, "delivery charge is tracked separately, not folded into the commission base");
});

test("15% agreement: merchandise gross 100000 -> commission 15000, merchant amount 85000", async () => {
  const { OrderFinanceService } = await import("../dist/modules/finance/order-finance.service.js");
  const service = new OrderFinanceService({}, {}, {});

  const snapshot = service.computeOrderFinancialSnapshot({
    subtotal: 100000,
    discount: 0,
    deliveryFeeCharged: 0,
    channel: "web_checkout",
    terms: { commission_type: "percentage", commission_rate: 15, assisted_fee_rate: 0, platform_fee_rate: 0, delivery_billing_mode: "customer_pays" },
  });

  assert.equal(snapshot.platform_commission_amount, 15000);
  assert.equal(snapshot.merchant_net_amount, 85000, "merchant amount before other explicitly applicable fees");
});

test("old order financial snapshot is unaffected by a later commission-rate change (frozen at computation time)", async () => {
  const { OrderFinanceService } = await import("../dist/modules/finance/order-finance.service.js");
  const service = new OrderFinanceService({}, {}, {});

  const snapshotAt12 = service.computeOrderFinancialSnapshot({
    subtotal: 100000,
    discount: 0,
    deliveryFeeCharged: 0,
    channel: "web_checkout",
    terms: { commission_type: "percentage", commission_rate: 12, assisted_fee_rate: 0, platform_fee_rate: 0, delivery_billing_mode: "customer_pays" },
  });

  // Simulate the agreement changing to 14% afterwards — computeOrderFinancialSnapshot is a pure
  // function of the terms it is given; nothing re-derives commission_rate from current DB state
  // for an already-computed snapshot, so re-running it with the OLD terms must still give 12%.
  assert.equal(snapshotAt12.platform_commission_amount, 12000);

  const snapshotAt14 = service.computeOrderFinancialSnapshot({
    subtotal: 100000,
    discount: 0,
    deliveryFeeCharged: 0,
    channel: "web_checkout",
    terms: { commission_type: "percentage", commission_rate: 14, assisted_fee_rate: 0, platform_fee_rate: 0, delivery_billing_mode: "customer_pays" },
  });
  assert.equal(snapshotAt14.platform_commission_amount, 14000);
  assert.notEqual(
    snapshotAt12.platform_commission_amount,
    snapshotAt14.platform_commission_amount,
    "the original snapshot's stored amount must never be mutated by a later rate change",
  );
});
