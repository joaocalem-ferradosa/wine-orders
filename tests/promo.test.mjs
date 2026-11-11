import { test } from 'node:test';
import assert from 'node:assert/strict';
import '../promo.js';

const { findPromo, promoTier, quotePromo, boxCents, discountedBottleCents } = globalThis;
const TECA = () => findPromo('TECA');
const BOX = { 'ferro-branco': 2670, rose: 6270, branco: 9570, quinta: 10770, tinto: 13770 };
const line = (id, qty) => ({ id, qty, boxCents: BOX[id] });

test('findPromo accepts TECA in any case and with spaces', () => {
  assert.equal(findPromo('TECA').code, 'TECA');
  assert.equal(findPromo(' teca ').code, 'TECA');
});

test('findPromo rejects unknown and empty codes', () => {
  assert.equal(findPromo('LDW'), null);
  assert.equal(findPromo(null), null);
  assert.equal(findPromo(''), null);
});

test('findPromo: TECA valid through 31 Dec 2026, expired from 1 Jan 2027 UTC', () => {
  assert.notEqual(findPromo('TECA', Date.UTC(2026, 11, 31, 23, 59)), null);
  assert.equal(findPromo('TECA', Date.UTC(2027, 0, 1)), null);
});

test('promoTier: under 2 boxes none, 2-5 first tier, 6+ second tier', () => {
  const p = TECA();
  assert.equal(promoTier(p, 1), -1);
  assert.equal(promoTier(p, 2), 0);
  assert.equal(promoTier(p, 5), 0);
  assert.equal(promoTier(p, 6), 1);
});

test('boxCents is 6 bottles in integer cents', () => {
  assert.equal(boxCents(15.95), 9570);
  assert.equal(boxCents(4.45), 2670);
});

test('quote: Branco + Tinto gets each wine its own first-tier %', () => {
  const q = quotePromo(TECA(), [line('branco', 1), line('tinto', 1)]);
  assert.equal(q.tier, 0);
  assert.equal(q.totalBoxes, 2);
  assert.equal(q.subtotalCents, 23340);
  assert.equal(q.discountCents, 1914 + 2754);
  assert.equal(q.totalCents, 18672);
  assert.deepEqual(q.lines.map((l) => l.pct), [20, 20]);
});

test('quote: 6 Branco uses the 30% tier off full price (not stacked)', () => {
  const q = quotePromo(TECA(), [line('branco', 6)]);
  assert.equal(q.tier, 1);
  assert.equal(q.lines[0].perBoxDiscountCents, 2871);
  assert.equal(q.discountCents, 17226);
  assert.equal(q.totalCents, 40194);
  assert.equal(q.next, null);
});

test('quote: 1 Ferro box has no discount and a nudge to 2 boxes', () => {
  const q = quotePromo(TECA(), [line('ferro-branco', 1)]);
  assert.equal(q.tier, -1);
  assert.equal(q.discountCents, 0);
  assert.deepEqual(q.next, { minBoxes: 2, boxesNeeded: 1, discountCents: 133 });
});

test('quote: a half-cent discount rounds like the order desk (amount kept, per line)', () => {
  // 3 × 26,70 = 80,10; 95% of it is 76,095 → kept 76,10, so 4,00 off (per box would give 3 × 1,34 = 4,02).
  const q = quotePromo(TECA(), [line('ferro-branco', 3)]);
  assert.equal(q.lines[0].lineDiscountCents, 400);
  assert.equal(q.totalCents, 7610);
});

test('quote: 3 Rosé nudges to the 6-box tier, priced on the current cart', () => {
  const q = quotePromo(TECA(), [line('rose', 3)]);
  assert.equal(q.tier, 0);
  assert.deepEqual(q.next, { minBoxes: 6, boxesNeeded: 3, discountCents: 3 * 1254 });
});

test('quote without a promo is the plain subtotal', () => {
  const q = quotePromo(null, [line('branco', 2)]);
  assert.equal(q.tier, -1);
  assert.equal(q.discountCents, 0);
  assert.equal(q.totalCents, 19140);
  assert.equal(q.next, null);
});

test('wines without a configured % get 0%', () => {
  const q = quotePromo(TECA(), [{ id: 'mystery', qty: 2, boxCents: 5000 }]);
  assert.equal(q.discountCents, 0);
});

test('per-bottle display prices reproduce the email table', () => {
  const p = TECA();
  const perBottle = (id, tier) => discountedBottleCents(BOX[id], p.percentOff[id][tier]);
  assert.equal(perBottle('ferro-branco', 0), 423);
  assert.equal(perBottle('ferro-branco', 1), 401);
  assert.equal(perBottle('rose', 0), 941);
  assert.equal(perBottle('rose', 1), 836);
  assert.equal(perBottle('branco', 0), 1276);
  assert.equal(perBottle('branco', 1), 1117);
  assert.equal(perBottle('quinta', 0), 1616);
  assert.equal(perBottle('quinta', 1), 1436);
  assert.equal(perBottle('tinto', 0), 1836);
  assert.equal(perBottle('tinto', 1), 1607);
});
