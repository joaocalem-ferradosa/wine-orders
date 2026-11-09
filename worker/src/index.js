// Cloudflare Worker — Stripe Checkout Session creator for orders.ferradosa.com.
//
// POST /checkout
//   body: {
//     items: [{ wine_id: 'branco', qty: 1 }, ...],
//     lang:  'pt' | 'en',
//     promo: 'TECA' | null,
//     successUrl?: string,
//     cancelUrl?:  string
//   }
// → 200: { url: 'https://checkout.stripe.com/...' }
// → 4xx: { error: '...' }
//
// Reads the canonical price/coupon/shipping IDs from the public
// stripe-prices.json on the site, so re-running `npm run setup-stripe`
// updates the Worker without redeploying.

import '../../promo.js';

const DEFAULT_PRICES_URL = 'https://orders.ferradosa.com/stripe-prices.json';
const ALLOWED_ORIGIN = 'https://orders.ferradosa.com';
const PRICES_TTL_MS = 60_000;

let pricesCache = null;
let pricesFetchedAt = 0;

async function getPrices(env) {
  const now = Date.now();
  if (pricesCache && now - pricesFetchedAt < PRICES_TTL_MS) return pricesCache;
  const r = await fetch(env.PRICES_URL || DEFAULT_PRICES_URL, { cf: { cacheTtl: 30 } });
  if (!r.ok) throw new Error(`prices fetch failed: ${r.status}`);
  pricesCache = await r.json();
  pricesFetchedAt = now;
  return pricesCache;
}

function allowedOrigin(origin) {
  if (!origin) return ALLOWED_ORIGIN;
  if (origin === ALLOWED_ORIGIN) return origin;
  if (/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) return origin;
  return ALLOWED_ORIGIN;
}

function corsHeaders(origin) {
  return {
    'Access-Control-Allow-Origin': allowedOrigin(origin),
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin',
  };
}

function json(data, status, origin) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) },
  });
}

// Flatten a nested object into Stripe-compatible bracket-notation form fields.
function flatten(obj, prefix = '') {
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined || v === null) continue;
    const key = prefix ? `${prefix}[${k}]` : k;
    if (Array.isArray(v)) {
      v.forEach((item, i) => {
        if (item !== null && typeof item === 'object') {
          Object.assign(out, flatten(item, `${key}[${i}]`));
        } else {
          out[`${key}[${i}]`] = String(item);
        }
      });
    } else if (typeof v === 'object') {
      Object.assign(out, flatten(v, key));
    } else {
      out[key] = String(v);
    }
  }
  return out;
}

async function stripePost(secretKey, path, body) {
  const flat = flatten(body);
  const r = await fetch(`https://api.stripe.com/v1/${path}`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${secretKey}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams(flat).toString(),
  });
  return r.json();
}

// ── Stripe webhook signature verification (Web Crypto, no SDK) ────────
async function verifyStripeSignature(payload, header, secret) {
  if (!header) return false;
  const parts = Object.fromEntries(
    header.split(',').map((p) => {
      const i = p.indexOf('=');
      return [p.slice(0, i).trim(), p.slice(i + 1).trim()];
    })
  );
  const t = parts.t;
  const v1 = parts.v1;
  if (!t || !v1) return false;

  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sigBuf = await crypto.subtle.sign('HMAC', key, enc.encode(`${t}.${payload}`));
  const expected = Array.from(new Uint8Array(sigBuf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');

  if (expected.length !== v1.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) {
    diff |= expected.charCodeAt(i) ^ v1.charCodeAt(i);
  }
  return diff === 0;
}

async function attachTaxIdToCustomer(secretKey, customerId, tax) {
  if (!customerId || !tax || !tax.type || !tax.value) return;
  const r = await fetch(
    `https://api.stripe.com/v1/customers/${customerId}/tax_ids`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${secretKey}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({ type: tax.type, value: tax.value }).toString(),
    }
  );
  // Duplicates return 400 — that's fine, ignore.
  if (!r.ok) {
    const body = await r.text().catch(() => '');
    console.warn(`tax_id attach failed (${r.status}): ${body}`);
  }
}

async function handleWebhook(request, env) {
  if (!env.STRIPE_WEBHOOK_SECRET) {
    return new Response('webhook secret not configured', { status: 500 });
  }
  const sigHeader = request.headers.get('Stripe-Signature');
  const body = await request.text();

  const ok = await verifyStripeSignature(body, sigHeader, env.STRIPE_WEBHOOK_SECRET);
  if (!ok) return new Response('invalid signature', { status: 400 });

  let event;
  try { event = JSON.parse(body); }
  catch (e) { return new Response('invalid json', { status: 400 }); }

  if (event.type === 'checkout.session.completed') {
    const session = event.data && event.data.object;
    const customerId = session && session.customer;
    const taxIds = (session && session.customer_details && session.customer_details.tax_ids) || [];
    for (const tx of taxIds) {
      await attachTaxIdToCustomer(env.STRIPE_SECRET_KEY, customerId, tx);
    }
  }
  return new Response('ok', { status: 200 });
}

async function handleCheckout(request, env) {
  const origin = request.headers.get('Origin') || '';

  let payload;
  try {
    payload = await request.json();
  } catch (e) {
    return json({ error: 'invalid json' }, 400, origin);
  }

  const { items, lang, promo, successUrl, cancelUrl } = payload || {};
  if (!Array.isArray(items) || items.length === 0) {
    return json({ error: 'no items' }, 400, origin);
  }
  if (!env.STRIPE_SECRET_KEY) {
    return json({ error: 'server not configured' }, 500, origin);
  }

  let prices;
  try {
    prices = await getPrices(env);
  } catch (e) {
    return json({ error: 'price config unavailable' }, 502, origin);
  }

  const lineItems = [];
  const quoteLines = [];
  for (const it of items) {
    const ref = prices.wines && prices.wines[it.wine_id];
    if (!ref) return json({ error: `unknown wine_id: ${it.wine_id}` }, 400, origin);
    const qty = Math.max(1, Math.min(99, parseInt(it.qty, 10) || 1));
    lineItems.push({ price: ref.price_id, quantity: qty });
    quoteLines.push({ id: it.wine_id, qty, boxCents: ref.box_price_cents });
  }
  const activePromo = findPromo(promo);
  const quote = quotePromo(activePromo, quoteLines);

  const sessionBody = {
    mode: 'payment',
    line_items: lineItems,
    success_url: successUrl || 'https://orders.ferradosa.com/success.html',
    cancel_url: cancelUrl || 'https://orders.ferradosa.com/',
    locale: lang === 'en' ? 'en' : 'pt',
    // Always materialise a Customer record so tax IDs, billing address and
    // shipping address are visible on the Customers tab.
    customer_creation: 'always',
    billing_address_collection: 'required',
    shipping_address_collection: { allowed_countries: ['PT'] },
    phone_number_collection: { enabled: true },
    // Optional Portuguese NIF / EU VAT ID, used for the TOConline invoice.
    tax_id_collection: { enabled: true },
  };

  if (prices.shipping && prices.shipping.shipping_rate_id) {
    sessionBody.shipping_options = [{ shipping_rate: prices.shipping.shipping_rate_id }];
  }

  // Stripe allows one discount per session, so the per-wine tier discount becomes a single-use coupon.
  if (quote.discountCents > 0) {
    const minBoxes = activePromo.tiers[quote.tier];
    const coupon = await stripePost(env.STRIPE_SECRET_KEY, 'coupons', {
      amount_off: quote.discountCents,
      currency: 'eur',
      duration: 'once',
      max_redemptions: 1,
      redeem_by: Math.floor(Date.now() / 1000) + 25 * 3600,
      name: `${activePromo.code} (${minBoxes}+ ${lang === 'en' ? 'cases' : 'caixas'})`,
      metadata: { promo: activePromo.code, tier: String(quote.tier) },
    });
    if (coupon.error || !coupon.id) {
      return json({ error: (coupon.error && coupon.error.message) || 'coupon error' }, 502, origin);
    }
    sessionBody.discounts = [{ coupon: coupon.id }];
    sessionBody.metadata = { promo: activePromo.code };
  } else {
    sessionBody.allow_promotion_codes = true;
  }

  const session = await stripePost(env.STRIPE_SECRET_KEY, 'checkout/sessions', sessionBody);
  if (session.error) {
    return json({ error: session.error.message || 'stripe error' }, 502, origin);
  }
  return json({ url: session.url }, 200, origin);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const origin = request.headers.get('Origin') || '';

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders(origin) });
    }
    if (url.pathname === '/checkout' && request.method === 'POST') {
      return handleCheckout(request, env);
    }
    if (url.pathname === '/webhook' && request.method === 'POST') {
      return handleWebhook(request, env);
    }
    if (url.pathname === '/' && request.method === 'GET') {
      return new Response('wine-orders checkout worker — POST /checkout, POST /webhook', {
        status: 200,
        headers: { 'Content-Type': 'text/plain', ...corsHeaders(origin) },
      });
    }
    return new Response('not found', { status: 404, headers: corsHeaders(origin) });
  },
};
