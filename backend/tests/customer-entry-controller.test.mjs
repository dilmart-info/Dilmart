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

function build({ isEnabled = true } = {}) {
  const captured = {};
  const headers = {};
  const res = { setHeader: (k, v) => { headers[k] = v; } };
  const mockService = {
    isEnabled: () => isEnabled,
    build: async (ctx) => {
      captured.ctx = ctx;
      return { hero: null, categories: [], products: [], brands: [] };
    },
  };
  const controller = new CustomerEntryController(mockService);
  return { controller, captured, res, headers };
}

test('feature flag disabled -> 503 STORE_INTEGRATION_DISABLED, no build', async () => {
  const { controller, captured, res } = build({ isEnabled: false });
  await assert.rejects(
    () => controller.getCustomerEntry(res),
    (err) => {
      assert.equal(err.getStatus?.(), 503);
      const body = err.getResponse?.();
      assert.equal(body.code, 'STORE_INTEGRATION_DISABLED');
      return true;
    },
  );
  assert.equal(captured.ctx, undefined, 'build not called when disabled');
});

test('public/unauthenticated caller resolves to web_store (public cache)', async () => {
  const { controller, captured, res, headers } = build({});
  await controller.getCustomerEntry(res);
  assert.equal(captured.ctx.surface, 'web_store');
  assert.equal(captured.ctx.isTrusted, false);
  assert.equal(headers['Cache-Control'], 'public, max-age=60, stale-while-revalidate=300');
});
