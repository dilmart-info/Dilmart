/**
 * STORE-PR2 — target-path allowlist (customer-entry.validator).
 * Pure unit test; no DB. Proves only discovery-safe internal targets pass and
 * external/admin/scheme/traversal targets are rejected (master spec §12).
 */
import test from 'node:test';
import assert from 'node:assert/strict';

const { validateTargetPath, categoryTarget, productTarget, isValidSlug } =
  await import('../dist/modules/marketplace/customer-entry/customer-entry.validator.js');

test('accepts discovery-safe internal targets', () => {
  for (const p of ['/', '/products', '/offers', '/stores', '/category/fragrance', '/product/argan-oil-250', '/store/dukany']) {
    assert.equal(validateTargetPath(p), p, `should accept ${p}`);
  }
  assert.equal(validateTargetPath('/category/عطور'), '/category/عطور', 'accepts Arabic slug');
});

test('rejects external, absolute, protocol-relative and scheme targets', () => {
  for (const p of ['https://evil.com', 'http://x', '//evil.com', 'javascript:alert(1)', 'data:text/html,x', 'vbscript:x', 'ftp://x']) {
    assert.equal(validateTargetPath(p), null, `should reject ${p}`);
  }
});

test('rejects admin / merchant / agent and non-discovery routes', () => {
  for (const p of ['/admin', '/admin/login', '/merchant/x', '/agent', '/cart', '/checkout', '/wishlist', '/my-account/orders', '/track-order']) {
    assert.equal(validateTargetPath(p), null, `should reject ${p}`);
  }
});

test('rejects traversal, whitespace, control chars, and malformed slugs', () => {
  for (const p of ['/category/../etc', '/category/a b', '/category/', '/product/valid_slug', '/CATEGORY/Up', 'products', '', '/category/x/y']) {
    assert.equal(validateTargetPath(p), null, `should reject ${JSON.stringify(p)}`);
  }
});

test('slug builders validate and return null for unsafe slugs', () => {
  assert.equal(categoryTarget('fragrance'), '/category/fragrance');
  assert.equal(productTarget('argan-oil-250'), '/product/argan-oil-250');
  assert.equal(categoryTarget('../etc'), null);
  assert.equal(productTarget('a b'), null);
  assert.equal(productTarget(''), null);
  assert.equal(productTarget(null), null);
  assert.equal(isValidSlug('valid-slug-1'), true);
  assert.equal(isValidSlug('bad slug'), false);
});
