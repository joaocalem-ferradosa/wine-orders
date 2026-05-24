// Idempotent Stripe setup for orders.ferradosa.com.
//
// Creates (or updates):
//   - one Product per wine, one Price per box (6 bottles)
//   - the LDW promo coupon (30% off, expires 2026-06-14) + promotion code
//   - a free shipping rate for mainland Portugal
//
// Writes the resulting public IDs to ../stripe-prices.json so the static
// page can reference them.
//
// Usage:
//   cp .env.example .env  # then paste your sk_test_... or sk_live_...
//   npm install
//   npm run setup-stripe

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import Stripe from 'stripe';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '..');

// ── Load .env ──────────────────────────────────────────────────────────
function loadEnv() {
  try {
    const raw = readFileSync(resolve(repoRoot, '.env'), 'utf8');
    for (const line of raw.split('\n')) {
      const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)\s*$/i);
      if (!m) continue;
      const [, k, v] = m;
      if (!process.env[k]) process.env[k] = v.replace(/^["']|["']$/g, '');
    }
  } catch (e) {
    // .env optional — fall back to ambient env
  }
}
loadEnv();

if (!process.env.STRIPE_SECRET_KEY) {
  console.error('Missing STRIPE_SECRET_KEY. Copy .env.example to .env and paste your key.');
  process.exit(1);
}

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

// ── Catalog ────────────────────────────────────────────────────────────
const BOTTLES_PER_BOX = 6;
const WINES = [
  { id: 'branco', name: 'Ferradosa Branco 2022 — Caixa de 6', perBottle: 17.45, stock: true },
  { id: 'rose',   name: 'Ferradosa Rosé 2024 — Caixa de 6',   perBottle: 10.45, stock: true },
  { id: 'quinta', name: 'Quinta da Ferradosa 2021 — Caixa de 6', perBottle: 17.95, stock: false },
  { id: 'tinto',  name: 'Ferradosa Tinto 2019 — Caixa de 6',  perBottle: 26.95, stock: true },
];

const PROMO = {
  code: 'LDW',
  name: 'Lisbon Design Week 2026',
  percentOff: 30,
  // 2026-06-14 23:59 Europe/Lisbon. Stripe wants a Unix timestamp (seconds, UTC).
  redeemBy: Math.floor(new Date('2026-06-14T22:59:59Z').getTime() / 1000),
};

const SHIPPING_RATE = {
  display_name: 'Envio grátis — Portugal Continental',
  type: 'fixed_amount',
  fixed_amount: { amount: 0, currency: 'eur' },
  delivery_estimate: {
    minimum: { unit: 'business_day', value: 3 },
    maximum: { unit: 'business_day', value: 7 },
  },
};

// ── Helpers ────────────────────────────────────────────────────────────
const toCents = (eur) => Math.round(eur * 100);

async function findByMetadata(listFn, key, value) {
  // Stripe doesn't support metadata filtering in list calls, so we paginate.
  for await (const item of listFn) {
    if (item.metadata && item.metadata[key] === value) return item;
  }
  return null;
}

async function upsertWine(w) {
  const boxCents = toCents(w.perBottle * BOTTLES_PER_BOX);
  const productsIter = stripe.products.list({ limit: 100, active: true });
  const existing = await findByMetadata(productsIter, 'wine_id', w.id);

  let product;
  if (existing) {
    product = await stripe.products.update(existing.id, {
      name: w.name,
      active: w.stock,
      metadata: { wine_id: w.id, per_bottle_eur: String(w.perBottle) },
    });
    console.log(`  Product ${w.id}: updated (${product.id})`);
  } else {
    product = await stripe.products.create({
      name: w.name,
      active: w.stock,
      metadata: { wine_id: w.id, per_bottle_eur: String(w.perBottle) },
    });
    console.log(`  Product ${w.id}: created (${product.id})`);
  }

  // Find or create the price. Prices are immutable for amount/currency,
  // so if the amount changed we create a new one and deactivate the old.
  const pricesIter = stripe.prices.list({ product: product.id, active: true, limit: 100 });
  let price = null;
  for await (const p of pricesIter) {
    if (p.unit_amount === boxCents && p.currency === 'eur') {
      price = p;
      break;
    }
  }
  if (!price) {
    // Deactivate any stale prices for this product.
    const stale = stripe.prices.list({ product: product.id, active: true, limit: 100 });
    for await (const p of stale) {
      await stripe.prices.update(p.id, { active: false });
      console.log(`  Price ${w.id}: deactivated stale ${p.id}`);
    }
    price = await stripe.prices.create({
      product: product.id,
      currency: 'eur',
      unit_amount: boxCents,
      tax_behavior: 'inclusive',
      metadata: { wine_id: w.id },
    });
    console.log(`  Price ${w.id}: created (${price.id}) = €${(boxCents / 100).toFixed(2)}`);
  } else {
    console.log(`  Price ${w.id}: reused (${price.id}) = €${(boxCents / 100).toFixed(2)}`);
  }

  return { wine_id: w.id, product_id: product.id, price_id: price.id, box_price_cents: boxCents };
}

async function upsertPromo() {
  const couponsIter = stripe.coupons.list({ limit: 100 });
  const existingCoupon = await findByMetadata(couponsIter, 'promo_key', PROMO.code);

  let coupon;
  if (existingCoupon) {
    coupon = existingCoupon;
    console.log(`  Coupon LDW: reused (${coupon.id})`);
  } else {
    coupon = await stripe.coupons.create({
      name: PROMO.name,
      percent_off: PROMO.percentOff,
      duration: 'once',
      redeem_by: PROMO.redeemBy,
      metadata: { promo_key: PROMO.code },
    });
    console.log(`  Coupon LDW: created (${coupon.id})`);
  }

  const promosIter = stripe.promotionCodes.list({ code: PROMO.code, limit: 10 });
  let promoCode = null;
  for await (const pc of promosIter) {
    if (pc.code === PROMO.code) { promoCode = pc; break; }
  }
  if (!promoCode) {
    promoCode = await stripe.promotionCodes.create({
      coupon: coupon.id,
      code: PROMO.code,
      expires_at: PROMO.redeemBy,
      metadata: { promo_key: PROMO.code },
    });
    console.log(`  PromotionCode LDW: created (${promoCode.id})`);
  } else {
    console.log(`  PromotionCode LDW: reused (${promoCode.id})`);
  }

  return { coupon_id: coupon.id, promotion_code_id: promoCode.id, code: PROMO.code };
}

async function upsertShippingRate() {
  const ratesIter = stripe.shippingRates.list({ active: true, limit: 100 });
  const existing = await findByMetadata(ratesIter, 'rate_key', 'pt-mainland-free');
  if (existing) {
    console.log(`  Shipping rate PT mainland: reused (${existing.id})`);
    return { shipping_rate_id: existing.id };
  }
  const rate = await stripe.shippingRates.create({
    ...SHIPPING_RATE,
    metadata: { rate_key: 'pt-mainland-free' },
  });
  console.log(`  Shipping rate PT mainland: created (${rate.id})`);
  return { shipping_rate_id: rate.id };
}

// ── Run ────────────────────────────────────────────────────────────────
async function main() {
  const acct = await stripe.accounts.retrieve().catch(() => null);
  const mode = process.env.STRIPE_SECRET_KEY.startsWith('sk_live_') ? 'LIVE' : 'TEST';
  console.log(`Stripe mode: ${mode}${acct ? ` (account ${acct.id})` : ''}\n`);

  console.log('Wines:');
  const wines = {};
  for (const w of WINES) {
    const out = await upsertWine(w);
    wines[w.id] = out;
  }

  console.log('\nPromotion:');
  const promo = await upsertPromo();

  console.log('\nShipping:');
  const shipping = await upsertShippingRate();

  const out = {
    mode,
    generated_at: new Date().toISOString(),
    wines,
    promotion: promo,
    shipping,
  };

  const outPath = resolve(repoRoot, 'stripe-prices.json');
  writeFileSync(outPath, JSON.stringify(out, null, 2) + '\n');
  console.log(`\nWrote ${outPath}`);
  console.log('\nNext: paste your publishable key (pk_...) into stripe-config.js,');
  console.log('commit stripe-prices.json + stripe-config.js, and push.');
}

main().catch((e) => {
  console.error('\nSetup failed:', e.message);
  process.exit(1);
});
