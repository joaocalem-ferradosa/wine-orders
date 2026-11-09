import { test, beforeEach, afterEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import worker from '../worker/src/index.js';

const PRICES_URL = 'http://prices.test/stripe-prices.json';
const CENTS = { 'ferro-branco': 2670, 'ferro-tinto': 2670, rose: 6270, branco: 9570, quinta: 10770, tinto: 13770 };
const PRICES = {
  wines: Object.fromEntries(
    Object.entries(CENTS).map(([id, c]) => [id, { wine_id: id, price_id: `price_${id}`, box_price_cents: c }])
  ),
  shipping: { shipping_rate_id: 'shr_test' },
};
const env = { STRIPE_SECRET_KEY: 'sk_test_x', PRICES_URL };

let calls;
let couponResponse;

beforeEach(() => {
  calls = [];
  couponResponse = { id: 'cpn_test' };
  mock.method(globalThis, 'fetch', async (url, init = {}) => {
    const u = String(url);
    const form = init.body ? Object.fromEntries(new URLSearchParams(init.body)) : null;
    calls.push({ url: u, form });
    if (u === PRICES_URL) return Response.json(PRICES);
    if (u.endsWith('/v1/coupons')) return Response.json(couponResponse, { status: couponResponse.error ? 400 : 200 });
    if (u.endsWith('/v1/checkout/sessions')) return Response.json({ id: 'cs_test', url: 'https://checkout.test/x' });
    throw new Error(`unexpected fetch ${u}`);
  });
});
afterEach(() => mock.restoreAll());

const checkout = (body) =>
  worker.fetch(
    new Request('http://worker.test/checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: 'http://localhost:8765' },
      body: JSON.stringify(body),
    }),
    env
  );
const couponCall = () => calls.find((c) => c.url.endsWith('/v1/coupons'));
const sessionCall = () => calls.find((c) => c.url.endsWith('/v1/checkout/sessions'));

test('reads prices from env.PRICES_URL', async () => {
  await checkout({ items: [{ wine_id: 'branco', qty: 1 }] });
  assert.equal(calls[0].url, PRICES_URL);
});

test('TECA with 1 box: no coupon, customer can still type a code', async () => {
  const r = await checkout({ items: [{ wine_id: 'branco', qty: 1 }], promo: 'TECA' });
  assert.equal(r.status, 200);
  assert.equal(couponCall(), undefined);
  assert.equal(sessionCall().form.allow_promotion_codes, 'true');
});

test('TECA (any case) on Branco + Tinto: one coupon for the summed first-tier discount', async () => {
  const r = await checkout({
    items: [{ wine_id: 'branco', qty: 1 }, { wine_id: 'tinto', qty: 1 }],
    promo: ' teca ',
    lang: 'pt',
  });
  assert.equal(r.status, 200);
  const c = couponCall().form;
  assert.equal(c.amount_off, '4668');
  assert.equal(c.currency, 'eur');
  assert.equal(c.duration, 'once');
  assert.equal(c.max_redemptions, '1');
  assert.equal(c.name, 'TECA (2+ caixas)');
  const s = sessionCall().form;
  assert.equal(s['discounts[0][coupon]'], 'cpn_test');
  assert.equal(s.allow_promotion_codes, undefined);
  assert.equal(s['metadata[promo]'], 'TECA');
});

test('TECA on 6 Branco in English: 30% tier coupon', async () => {
  await checkout({ items: [{ wine_id: 'branco', qty: 6 }], promo: 'TECA', lang: 'en' });
  assert.equal(couponCall().form.amount_off, '17226');
  assert.equal(couponCall().form.name, 'TECA (6+ cases)');
});

test('no promo: no coupon, promotion codes allowed', async () => {
  await checkout({ items: [{ wine_id: 'branco', qty: 1 }, { wine_id: 'tinto', qty: 1 }] });
  assert.equal(couponCall(), undefined);
  assert.equal(sessionCall().form.allow_promotion_codes, 'true');
});

test('expired TECA is ignored', async () => {
  mock.timers.enable({ apis: ['Date'], now: Date.UTC(2027, 0, 1) });
  let r;
  try {
    r = await checkout({ items: [{ wine_id: 'branco', qty: 1 }, { wine_id: 'tinto', qty: 1 }], promo: 'TECA' });
  } finally {
    mock.timers.reset();
  }
  assert.equal(r.status, 200);
  assert.equal(couponCall(), undefined);
  assert.equal(sessionCall().form.allow_promotion_codes, 'true');
});

test('coupon creation failure returns 502 and creates no session', async () => {
  couponResponse = { error: { message: 'boom' } };
  const r = await checkout({ items: [{ wine_id: 'branco', qty: 2 }], promo: 'TECA' });
  assert.equal(r.status, 502);
  assert.ok(couponCall());
  assert.equal(sessionCall(), undefined);
});

test('expected total that differs from server prices: 409 price_mismatch, nothing created in Stripe', async () => {
  const r = await checkout({ items: [{ wine_id: 'branco', qty: 2 }], promo: 'TECA', expectedTotalCents: 15000 });
  assert.equal(r.status, 409);
  assert.equal((await r.json()).code, 'price_mismatch');
  assert.equal(couponCall(), undefined);
  assert.equal(sessionCall(), undefined);
});

test('expected total that matches proceeds to checkout', async () => {
  const r = await checkout({ items: [{ wine_id: 'branco', qty: 2 }], promo: 'TECA', expectedTotalCents: 19140 - 2 * 1914 });
  assert.equal(r.status, 200);
  assert.ok(sessionCall());
});
