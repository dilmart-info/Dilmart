import assert from "node:assert/strict";
import test from "node:test";
import { ValidationPipe, ParseUUIDPipe, BadRequestException, ForbiddenException, NotFoundException } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { MerchantsService } from "../dist/modules/merchants/merchants.service.js";
import { MerchantsController } from "../dist/modules/merchants/merchants.controller.js";
import {
  MerchantFinanceStatementQueryDto,
  MerchantPayoutHistoryQueryDto,
} from "../dist/modules/merchants/merchants.dto.js";

const STORE_A = "11111111-1111-4111-8111-111111111111";
const STORE_B = "22222222-2222-4222-8222-222222222222";
const STORE_INACTIVE = "33333333-3333-4333-8333-333333333333";
const USER_STORE_A = "user-store-a-owner";
const USER_STORE_A_STAFF = "user-store-a-staff";
const USER_STORE_A_MANAGER = "user-store-a-manager";
const USER_STORE_B = "user-store-b-owner";
const USER_ADMIN = "user-platform-admin";

function makeHarness() {
  const state = {
    merchants: [
      { id: STORE_A, status: "active", display_name: "متجر بغداد" },
      { id: STORE_B, status: "active", display_name: "متجر البصرة" },
      { id: STORE_INACTIVE, status: "pending", display_name: "متجر معلق" },
    ],
    merchant_users: [
      { user_id: USER_STORE_A, merchant_id: STORE_A, role: "owner" },
      { user_id: USER_STORE_A_MANAGER, merchant_id: STORE_A, role: "manager" },
      { user_id: USER_STORE_A_STAFF, merchant_id: STORE_A, role: "staff" },
      { user_id: USER_STORE_B, merchant_id: STORE_B, role: "owner" },
    ],
    merchant_ledger_entries: [
      {
        id: "ledger-entry-a-1",
        merchant_id: STORE_A,
        order_id: "order-1",
        entry_type: "order_accrual",
        direction: "credit",
        amount: 150000,
        status: "payable",
        created_at: "2026-05-01T10:00:00.000Z",
        effective_at: "2026-05-01T10:00:00.000Z",
        description: "استحقاق طلب 1",
      },
      {
        id: "ledger-entry-a-2",
        merchant_id: STORE_A,
        order_id: "order-2",
        entry_type: "order_accrual",
        direction: "credit",
        amount: 50000,
        status: "accrued",
        created_at: "2026-05-02T10:00:00.000Z",
        effective_at: "2026-05-02T10:00:00.000Z",
        description: "استحقاق طلب 2",
      },
      {
        id: "ledger-entry-b-1",
        merchant_id: STORE_B,
        order_id: "order-3",
        entry_type: "order_accrual",
        direction: "credit",
        amount: 80000,
        status: "payable",
        created_at: "2026-05-03T10:00:00.000Z",
        effective_at: "2026-05-03T10:00:00.000Z",
        description: "استحقاق طلب 3 متجر ب",
      },
    ],
    merchant_payout_batches: [
      {
        id: "payout-batch-a-1",
        merchant_id: STORE_A,
        status: "settled",
        period_start: "2026-04-01T00:00:00.000Z",
        period_end: "2026-04-30T23:59:59.000Z",
        total_credits: 350000,
        total_debits: 50000,
        net_amount: 300000,
        currency_code: "IQD",
        created_at: "2026-05-01T08:00:00.000Z",
        approved_at: "2026-05-01T09:00:00.000Z",
        settled_at: "2026-05-01T10:00:00.000Z",
      },
      {
        id: "payout-batch-b-1",
        merchant_id: STORE_B,
        status: "approved",
        period_start: "2026-04-01T00:00:00.000Z",
        period_end: "2026-04-30T23:59:59.000Z",
        total_credits: 140000,
        total_debits: 20000,
        net_amount: 120000,
        currency_code: "IQD",
        created_at: "2026-05-02T08:00:00.000Z",
        approved_at: "2026-05-02T09:00:00.000Z",
      },
    ],
  };

  class Query {
    constructor(table) {
      this.table = table;
      this.filters = [];
      this.rangeBounds = null;
      this.sortField = null;
      this.sortAsc = false;
    }
    select() {
      return this;
    }
    order(field, opts) {
      this.sortField = field;
      this.sortAsc = opts?.ascending ?? false;
      return this;
    }
    limit() {
      return this;
    }
    range(from, to) {
      this.rangeBounds = { from, to };
      return this;
    }
    eq(column, value) {
      this.filters.push({ type: "eq", column, value });
      return this;
    }
    gte(column, value) {
      this.filters.push({ type: "gte", column, value });
      return this;
    }
    lte(column, value) {
      this.filters.push({ type: "lte", column, value });
      return this;
    }
    async maybeSingle() {
      const rows = this._execute();
      return { data: rows[0] ?? null, error: null };
    }
    then(resolve, reject) {
      try {
        const rows = this._execute();
        let sliced = rows;
        if (this.rangeBounds) {
          sliced = rows.slice(this.rangeBounds.from, this.rangeBounds.to + 1);
        }
        resolve({ data: sliced, error: null, count: rows.length });
      } catch (err) {
        reject(err);
      }
    }
    _execute() {
      let data = (state[this.table] ?? []).slice();
      for (const filter of this.filters) {
        if (filter.type === "eq") {
          data = data.filter((row) => row[filter.column] === filter.value);
        } else if (filter.type === "gte") {
          data = data.filter((row) => (row[filter.column] ?? "") >= filter.value);
        } else if (filter.type === "lte") {
          data = data.filter((row) => (row[filter.column] ?? "") <= filter.value);
        }
      }
      return data;
    }
  }

  const supabaseAdmin = {
    client: {
      from(table) {
        return new Query(table);
      },
    },
  };

  const scopeResolver = {
    resolveMerchantScope: async (requestedId, role, actorId) => {
      if (role === "super_admin" || role === "admin") return requestedId;
      const membership = state.merchant_users.find(
        (m) => m.user_id === actorId && (!requestedId || m.merchant_id === requestedId)
      );
      return membership?.merchant_id;
    },
  };

  const service = new MerchantsService(supabaseAdmin, scopeResolver);
  const controller = new MerchantsController(service);

  return { state, service, controller };
}

test("BOUNDARY VALIDATION: ParseUUIDPipe rejects malformed merchant UUIDs with HTTP 400", async () => {
  const pipe = new ParseUUIDPipe({ version: "4" });

  await assert.rejects(
    async () => pipe.transform("not-a-uuid", { type: "param", metatype: String, data: "id" }),
    (err) => err instanceof BadRequestException
  );

  await assert.rejects(
    async () => pipe.transform("12345", { type: "param", metatype: String, data: "id" }),
    (err) => err instanceof BadRequestException
  );

  await assert.rejects(
    async () => pipe.transform("", { type: "param", metatype: String, data: "id" }),
    (err) => err instanceof BadRequestException
  );

  const valid = await pipe.transform(STORE_A, { type: "param", metatype: String, data: "id" });
  assert.equal(valid, STORE_A);
});

test("DTO VALIDATION: ValidationPipe rejects invalid statement status, negative pagination, non-integers, and from > to", async () => {
  const validationPipe = new ValidationPipe({
    whitelist: true,
    transform: true,
    forbidNonWhitelisted: true,
  });

  // 1. Valid statement query passes and transforms numbers
  const valid = await validationPipe.transform(
    { limit: "50", offset: "0", status: "payable", from: "2026-05-01T00:00:00.000Z", to: "2026-05-10T00:00:00.000Z" },
    { type: "query", metatype: MerchantFinanceStatementQueryDto }
  );
  assert.equal(valid.limit, 50);
  assert.equal(valid.offset, 0);
  assert.equal(valid.status, "payable");

  // 2. Valid disputed status passes
  const validDisputed = await validationPipe.transform(
    { status: "disputed" },
    { type: "query", metatype: MerchantFinanceStatementQueryDto }
  );
  assert.equal(validDisputed.status, "disputed");

  // 3. Invalid status enum rejected with BadRequestException
  await assert.rejects(
    async () =>
      validationPipe.transform(
        { status: "hacked_status" },
        { type: "query", metatype: MerchantFinanceStatementQueryDto }
      ),
    (err) => err instanceof BadRequestException
  );

  // 4. Non-integer / NaN limit rejected with BadRequestException
  await assert.rejects(
    async () =>
      validationPipe.transform(
        { limit: "abc" },
        { type: "query", metatype: MerchantFinanceStatementQueryDto }
      ),
    (err) => err instanceof BadRequestException
  );

  // 5. Negative limit rejected
  await assert.rejects(
    async () =>
      validationPipe.transform(
        { limit: "-5" },
        { type: "query", metatype: MerchantFinanceStatementQueryDto }
      ),
    (err) => err instanceof BadRequestException
  );

  // 6. Negative offset rejected
  await assert.rejects(
    async () =>
      validationPipe.transform(
        { offset: "-1" },
        { type: "query", metatype: MerchantFinanceStatementQueryDto }
      ),
    (err) => err instanceof BadRequestException
  );

  // 7. Limit exceeding max (200) rejected
  await assert.rejects(
    async () =>
      validationPipe.transform(
        { limit: "250" },
        { type: "query", metatype: MerchantFinanceStatementQueryDto }
      ),
    (err) => err instanceof BadRequestException
  );

  // 8. Invalid ISO date string rejected
  await assert.rejects(
    async () =>
      validationPipe.transform(
        { from: "not-a-date" },
        { type: "query", metatype: MerchantFinanceStatementQueryDto }
      ),
    (err) => err instanceof BadRequestException
  );

  // 9. from > to rejected with BadRequestException
  await assert.rejects(
    async () =>
      validationPipe.transform(
        { from: "2026-05-15T00:00:00.000Z", to: "2026-05-01T00:00:00.000Z" },
        { type: "query", metatype: MerchantFinanceStatementQueryDto }
      ),
    (err) => err instanceof BadRequestException
  );

  // 10. Non-whitelisted field rejected
  await assert.rejects(
    async () =>
      validationPipe.transform(
        { extra_field: "hack" },
        { type: "query", metatype: MerchantFinanceStatementQueryDto }
      ),
    (err) => err instanceof BadRequestException
  );
});

test("DTO VALIDATION: ValidationPipe rejects invalid payout history query parameters", async () => {
  const validationPipe = new ValidationPipe({
    whitelist: true,
    transform: true,
    forbidNonWhitelisted: true,
  });

  // Valid payout query
  const valid = await validationPipe.transform(
    { limit: "20", offset: "0", status: "settled" },
    { type: "query", metatype: MerchantPayoutHistoryQueryDto }
  );
  assert.equal(valid.limit, 20);
  assert.equal(valid.status, "settled");

  // Invalid payout status rejected
  await assert.rejects(
    async () =>
      validationPipe.transform(
        { status: "nonexistent_status" },
        { type: "query", metatype: MerchantPayoutHistoryQueryDto }
      ),
    (err) => err instanceof BadRequestException
  );

  // Payout limit exceeding max (100) rejected
  await assert.rejects(
    async () =>
      validationPipe.transform(
        { limit: "150" },
        { type: "query", metatype: MerchantPayoutHistoryQueryDto }
      ),
    (err) => err instanceof BadRequestException
  );

  // from > to in payout history rejected
  await assert.rejects(
    async () =>
      validationPipe.transform(
        { from: "2026-06-01T00:00:00.000Z", to: "2026-05-01T00:00:00.000Z" },
        { type: "query", metatype: MerchantPayoutHistoryQueryDto }
      ),
    (err) => err instanceof BadRequestException
  );
});

test("SERVICE AUTHORITY: owner, manager, and staff can read finance summary, statement, and payouts for their active store", async () => {
  const { service } = makeHarness();

  const roles = [
    { actor_role: "merchant_owner", actor_id: USER_STORE_A },
    { actor_role: "merchant_manager", actor_id: USER_STORE_A_MANAGER },
    { actor_role: "merchant_staff", actor_id: USER_STORE_A_STAFF },
  ];

  for (const actor of roles) {
    const summary = await service.getMerchantFinanceSummary(STORE_A, actor);
    assert.equal(summary.merchant_id, STORE_A);
    assert.equal(summary.total_payable, 150000);
    assert.equal(summary.total_accrued, 50000);
    assert.equal(summary.last_payout_amount, 300000);

    const statement = await service.listMerchantStatementEntries(STORE_A, actor, { limit: 20, offset: 0 });
    assert.equal(statement.merchant_id, STORE_A);
    assert.equal(statement.entries.length, 2);
    assert.equal(statement.entries[0].order_id, "order-1");

    const payouts = await service.listMerchantPayoutHistory(STORE_A, actor, { limit: 10, offset: 0 });
    assert.equal(payouts.merchant_id, STORE_A);
    assert.equal(payouts.payouts.length, 1);
    assert.equal(payouts.payouts[0].net_amount, 300000);
  }
});

test("SERVICE AUTHORITY: cross-merchant access is strictly rejected with ForbiddenException (HTTP 403)", async () => {
  const { service } = makeHarness();

  // Store A owner attempts to read Store B
  const actorStoreA = { actor_role: "merchant_owner", actor_id: USER_STORE_A };

  await assert.rejects(
    async () => service.getMerchantFinanceSummary(STORE_B, actorStoreA),
    (err) => err instanceof ForbiddenException
  );

  await assert.rejects(
    async () => service.listMerchantStatementEntries(STORE_B, actorStoreA, { limit: 20 }),
    (err) => err instanceof ForbiddenException
  );

  await assert.rejects(
    async () => service.listMerchantPayoutHistory(STORE_B, actorStoreA, { limit: 10 }),
    (err) => err instanceof ForbiddenException
  );
});

test("SERVICE AUTHORITY: merchant actor accessing non-active / pending merchant is rejected with ForbiddenException", async () => {
  const { service, state } = makeHarness();

  // Assign user to inactive merchant
  state.merchant_users.push({ user_id: "user-inactive", merchant_id: STORE_INACTIVE, role: "owner" });
  const actorInactive = { actor_role: "merchant_owner", actor_id: "user-inactive" };

  await assert.rejects(
    async () => service.getMerchantFinanceSummary(STORE_INACTIVE, actorInactive),
    (err) => err instanceof ForbiddenException
  );
});

test("SERVICE AUTHORITY: missing actor context or unauthorized role fails closed with ForbiddenException", async () => {
  const { service } = makeHarness();

  // Missing actor
  await assert.rejects(
    async () => service.getMerchantFinanceSummary(STORE_A, undefined),
    (err) => err instanceof ForbiddenException
  );

  // Unauthorized role (customer)
  await assert.rejects(
    async () => service.getMerchantFinanceSummary(STORE_A, { actor_role: "customer", actor_id: "cust-1" }),
    (err) => err instanceof ForbiddenException
  );
});

test("SERVICE AUTHORITY: platform admin requires explicit merchant ID, checks existence, and can inspect non-active stores", async () => {
  const { service } = makeHarness();
  const adminActor = { actor_role: "super_admin", actor_id: USER_ADMIN };

  // Admin reading active store
  const summaryA = await service.getMerchantFinanceSummary(STORE_A, adminActor);
  assert.equal(summaryA.merchant_id, STORE_A);

  // Admin inspecting pending / non-active store succeeds for governance oversight
  const summaryInactive = await service.getMerchantFinanceSummary(STORE_INACTIVE, adminActor);
  assert.equal(summaryInactive.merchant_id, STORE_INACTIVE);

  // Admin requesting non-existent merchant throws NotFoundException
  await assert.rejects(
    async () => service.getMerchantFinanceSummary("99999999-9999-4999-8999-999999999999", adminActor),
    (err) => err instanceof NotFoundException
  );
});

test("HTTP CONTROLLER ROUTE: GET /merchants/:id/finance/summary, statement, and payout-history actual HTTP routes", async (t) => {
  const recordedCalls = {
    summary: [],
    statement: [],
    payouts: [],
  };

  const stubService = {
    getMerchantFinanceSummary: async (id, actor) => {
      recordedCalls.summary.push({ id, actor });
      return { merchant_id: id, total_payable: 150000, currency_code: "IQD" };
    },
    listMerchantStatementEntries: async (id, actor, query) => {
      recordedCalls.statement.push({ id, actor, query });
      return { merchant_id: id, entries: [], total: 0, limit: query?.limit ?? 20, offset: query?.offset ?? 0 };
    },
    listMerchantPayoutHistory: async (id, actor, query) => {
      recordedCalls.payouts.push({ id, actor, query });
      return { merchant_id: id, payouts: [], total: 0, limit: query?.limit ?? 10, offset: query?.offset ?? 0 };
    },
    // Stubs for other methods to satisfy controller
    getActiveMerchants: async () => [],
    getStorefrontDefaultMerchant: async () => null,
    getActiveMerchantBySlug: async () => null,
    getAllMerchants: async () => [],
    getMerchantSettings: async () => null,
    upsertMerchantSettings: async () => null,
    getMerchantById: async () => null,
    getMerchantReadiness: async () => null,
    getMerchantPerformanceScorecard: async () => null,
    updateMerchantRegistrationDetails: async () => null,
  };

  const moduleRef = await Test.createTestingModule({
    controllers: [MerchantsController],
    providers: [
      {
        provide: MerchantsService,
        useValue: stubService,
      },
    ],
  }).compile();

  const app = moduleRef.createNestApplication();
  await app.listen(0);
  const port = app.getHttpServer().address().port;
  const baseUrl = `http://127.0.0.1:${port}`;

  t.after(async () => {
    await app.close();
  });

  // 1. Malformed UUID => HTTP 400 and service method NOT called
  {
    const resSummary = await fetch(`${baseUrl}/merchants/not-a-uuid/finance/summary`);
    assert.equal(resSummary.status, 400, "malformed UUID on summary must return HTTP 400");
    assert.equal(recordedCalls.summary.length, 0, "service summary must not be called on malformed UUID");

    const resStatement = await fetch(`${baseUrl}/merchants/12345/finance/statement`);
    assert.equal(resStatement.status, 400, "malformed UUID on statement must return HTTP 400");
    assert.equal(recordedCalls.statement.length, 0, "service statement must not be called on malformed UUID");

    const resPayouts = await fetch(`${baseUrl}/merchants/invalid-id/finance/payout-history`);
    assert.equal(resPayouts.status, 400, "malformed UUID on payouts must return HTTP 400");
    assert.equal(recordedCalls.payouts.length, 0, "service payouts must not be called on malformed UUID");
  }

  // 2. Statement route parameter validation through real HTTP boundary
  {
    // Invalid status enum
    const res = await fetch(`${baseUrl}/merchants/${STORE_A}/finance/statement?status=invalid_status`);
    assert.equal(res.status, 400, "invalid statement status must return HTTP 400");

    // NaN limit
    const resNan = await fetch(`${baseUrl}/merchants/${STORE_A}/finance/statement?limit=abc`);
    assert.equal(resNan.status, 400, "non-integer limit must return HTTP 400");

    // Negative limit
    const resNegLimit = await fetch(`${baseUrl}/merchants/${STORE_A}/finance/statement?limit=-5`);
    assert.equal(resNegLimit.status, 400, "negative limit must return HTTP 400");

    // Negative offset
    const resNegOffset = await fetch(`${baseUrl}/merchants/${STORE_A}/finance/statement?offset=-1`);
    assert.equal(resNegOffset.status, 400, "negative offset must return HTTP 400");

    // Excessive limit (> 200)
    const resExcessLimit = await fetch(`${baseUrl}/merchants/${STORE_A}/finance/statement?limit=250`);
    assert.equal(resExcessLimit.status, 400, "excessive limit > 200 must return HTTP 400");

    // Invalid ISO date string
    const resInvalidDate = await fetch(`${baseUrl}/merchants/${STORE_A}/finance/statement?from=not-a-date`);
    assert.equal(resInvalidDate.status, 400, "invalid date format must return HTTP 400");

    // from > to date range violation
    const resFromGtTo = await fetch(`${baseUrl}/merchants/${STORE_A}/finance/statement?from=2026-05-15T00:00:00.000Z&to=2026-05-01T00:00:00.000Z`);
    assert.equal(resFromGtTo.status, 400, "from > to date range must return HTTP 400");

    // Non-whitelisted query parameter
    const resNonWhitelisted = await fetch(`${baseUrl}/merchants/${STORE_A}/finance/statement?unauthorized_param=hack`);
    assert.equal(resNonWhitelisted.status, 400, "non-whitelisted query parameter must return HTTP 400");
  }

  // 3. Payout history route parameter validation through real HTTP boundary
  {
    // Invalid payout status
    const res = await fetch(`${baseUrl}/merchants/${STORE_A}/finance/payout-history?status=invalid_batch_status`);
    assert.equal(res.status, 400, "invalid payout status must return HTTP 400");

    // Excessive payout limit (> 100)
    const resExcess = await fetch(`${baseUrl}/merchants/${STORE_A}/finance/payout-history?limit=150`);
    assert.equal(resExcess.status, 400, "payout limit > 100 must return HTTP 400");

    // from > to in payout history
    const resFromGtTo = await fetch(`${baseUrl}/merchants/${STORE_A}/finance/payout-history?from=2026-06-01T00:00:00.000Z&to=2026-05-01T00:00:00.000Z`);
    assert.equal(resFromGtTo.status, 400, "payout from > to must return HTTP 400");
  }

  // 4. Valid HTTP requests reach service with transformed types
  {
    // Summary
    const resSummary = await fetch(`${baseUrl}/merchants/${STORE_A}/finance/summary`);
    assert.equal(resSummary.status, 200, "valid summary request must return HTTP 200");
    const summaryBody = await resSummary.json();
    assert.equal(summaryBody.merchant_id, STORE_A);
    assert.equal(recordedCalls.summary.at(-1)?.id, STORE_A);

    // Statement with transformed query numbers
    const resStatement = await fetch(`${baseUrl}/merchants/${STORE_A}/finance/statement?limit=50&offset=10&status=payable&from=2026-05-01T00:00:00.000Z&to=2026-05-10T00:00:00.000Z`);
    assert.equal(resStatement.status, 200, "valid statement request must return HTTP 200");
    assert.equal(recordedCalls.statement.at(-1)?.id, STORE_A);
    assert.equal(recordedCalls.statement.at(-1)?.query.limit, 50, "limit must be transformed to number");
    assert.equal(recordedCalls.statement.at(-1)?.query.offset, 10, "offset must be transformed to number");
    assert.equal(recordedCalls.statement.at(-1)?.query.status, "payable");
    assert.equal(recordedCalls.statement.at(-1)?.query.from, "2026-05-01T00:00:00.000Z");
    assert.equal(recordedCalls.statement.at(-1)?.query.to, "2026-05-10T00:00:00.000Z");

    // Statement with valid 'disputed' status
    const resDisputed = await fetch(`${baseUrl}/merchants/${STORE_A}/finance/statement?status=disputed`);
    assert.equal(resDisputed.status, 200, "valid disputed status must return HTTP 200");
    assert.equal(recordedCalls.statement.at(-1)?.query.status, "disputed");

    // Payout history with transformed query numbers
    const resPayouts = await fetch(`${baseUrl}/merchants/${STORE_A}/finance/payout-history?limit=25&offset=5&status=settled`);
    assert.equal(resPayouts.status, 200, "valid payout history request must return HTTP 200");
    assert.equal(recordedCalls.payouts.at(-1)?.id, STORE_A);
    assert.equal(recordedCalls.payouts.at(-1)?.query.limit, 25, "payout limit must be transformed to number");
    assert.equal(recordedCalls.payouts.at(-1)?.query.offset, 5, "payout offset must be transformed to number");
    assert.equal(recordedCalls.payouts.at(-1)?.query.status, "settled");
  }
});
