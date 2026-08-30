/**
 * STORE-PR2 — CustomerEntryController surface resolution + feature flag.
 * Uses the real controller (real shared PR#71 resolver) with a fake
 * CustomerEntryService (captures the ViewerContext) and fake StoreIntegrationService.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

const { CustomerEntryController } = await import(
  '../dist/modules/marketplace/customer-entry/customer-entry.controller.js'
);

function build({ enabled = true, headerToClaims = {} } = {}) {
  const captured = {};
  const entryService = {
    isEnabled: () => enabled,
    build: async (ctx) => {
      captured.ctx = ctx;
      return { version: 1 };
    },
  };
  const storeIntegration = {
    verifyStoreSessionHeader: (h) => headerToClaims[h] ?? null,
  };
  const controller = new CustomerEntryController(entryService, storeIntegration);
  const headers = {};
  const res = { setHeader: (k, v) => (headers[k] = v) };
  return { controller, captured, res, headers };
}

test('feature flag disabled -> 503 STORE_INTEGRATION_DISABLED, no build', async () => {
  const { controller, captured, res } = build({ enabled: false });
  await assert.rejects(
    () => controller.getCustomerEntry(res, undefined),
    (err) => {
      assert.equal(err.getStatus?.(), 503);
      const body = err.getResponse?.();
      assert.equal(body.code, 'STORE_INTEGRATION_DISABLED');
      return true;
    },
  );
  assert.equal(captured.ctx, undefined, 'build not called when disabled');
});

test('trusted customer_app session resolves to surface customer_app', async () => {
  const { controller, captured, res, headers } = build({
    headerToClaims: {
      'cust-token': { linkedProfileId: 'lp', segment: 'DilMart_APP_CUSTOMER', DilMartUserId: 'u', sourceApp: 'customer_app' },
    },
  });
  await controller.getCustomerEntry(res, 'cust-token');
  assert.equal(captured.ctx.surface, 'customer_app');
  assert.equal(captured.ctx.isTrusted, true);
  assert.equal(headers['Cache-Control'], 'private, max-age=30');
});

test('trusted barber_app session does NOT become customer_app', async () => {
  const { controller, captured, res } = build({
    headerToClaims: {
      'barb-token': { linkedProfileId: 'lp', segment: 'DilMart_APP_BARBER_OWNER', DilMartUserId: 'u', sourceApp: 'barber_app' },
    },
  });
  await controller.getCustomerEntry(res, 'barb-token');
  assert.equal(captured.ctx.surface, 'barber_app');
  assert.notEqual(captured.ctx.surface, 'customer_app');
});

test('public/unauthenticated caller resolves to web_store (public cache)', async () => {
  const { controller, captured, res, headers } = build({});
  await controller.getCustomerEntry(res, undefined);
  assert.equal(captured.ctx.surface, 'web_store');
  assert.equal(captured.ctx.isTrusted, false);
  assert.equal(headers['Cache-Control'], 'public, max-age=60, stale-while-revalidate=300');
});

test('an unverified/forged X-Store-Session cannot self-promote to customer_app', async () => {
  // verifyStoreSessionHeader returns null (invalid) -> falls back to web_store.
  const { controller, captured, res } = build({ headerToClaims: { /* nothing verifies */ } });
  await controller.getCustomerEntry(res, 'forged-or-expired');
  assert.equal(captured.ctx.surface, 'web_store');
});
