// Cloudflare Worker — Stripe Checkout Session creator for orders.ferradosa.com.
//
// POST /checkout
//   body: {
//     items: [{ wine_id: 'branco', qty: 1 }, ...],
//     lang:  'pt' | 'en',
//     promo: 'LDW' | null,
//     successUrl?: string,
//     cancelUrl?:  string
//   }
// → 200: { url: 'https://checkout.stripe.com/...' }
// → 4xx: { error: '...' }
//
// Reads the canonical price/coupon/shipping IDs from the public
// stripe-prices.json on the site, so re-running `npm run setup-stripe`
// updates the Worker without redeploying.

const PRICES_URL = 'https://orders.ferradosa.com/stripe-prices.json';
const ALLOWED_ORIGIN = 'https://orders.ferradosa.com';
const PRICES_TTL_MS = 60_000;

// 2026-06-14 23:00 UTC ≈ end-of-day Lisbon
const LDW_DEADLINE_MS = Date.UTC(2026, 5, 14, 23, 0, 0);

let pricesCache = null;
let pricesFetchedAt = 0;

async function getPrices() {
  const now = Date.now();
  if (pricesCache && now - pricesFetchedAt < PRICES_TTL_MS) return pricesCache;
  const r = await fetch(PRICES_URL, { cf: { cacheTtl: 30 } });
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

async function createStripeSession(secretKey, body) {
  const flat = flatten(body);
  const r = await fetch('https://api.stripe.com/v1/checkout/sessions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${secretKey}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams(flat).toString(),
  });
  return r.json();
}

async function handleCheckout(request, env) {
  const origin = request.headers.get('Origin') || '';

  let payload;
  try {
    payload = await request.json();
  } catch (e) {
    return json({ error: 'invalid json' }, 400, origin);
  }

  const { items, lang, successUrl, cancelUrl } = payload || {};
  if (!Array.isArray(items) || items.length === 0) {
    return json({ error: 'no items' }, 400, origin);
  }
  if (!env.STRIPE_SECRET_KEY) {
    return json({ error: 'server not configured' }, 500, origin);
  }

  let prices;
  try {
    prices = await getPrices();
  } catch (e) {
    return json({ error: 'price config unavailable' }, 502, origin);
  }

  const lineItems = [];
  for (const it of items) {
    const ref = prices.wines && prices.wines[it.wine_id];
    if (!ref) return json({ error: `unknown wine_id: ${it.wine_id}` }, 400, origin);
    const qty = Math.max(1, Math.min(99, parseInt(it.qty, 10) || 1));
    lineItems.push({ price: ref.price_id, quantity: qty });
  }

  const sessionBody = {
    mode: 'payment',
    line_items: lineItems,
    success_url: successUrl || 'https://orders.ferradosa.com/success.html',
    cancel_url: cancelUrl || 'https://orders.ferradosa.com/',
    locale: lang === 'en' ? 'en' : 'pt',
    billing_address_collection: 'required',
    shipping_address_collection: { allowed_countries: ['PT'] },
    phone_number_collection: { enabled: true },
    // Optional Portuguese NIF / EU VAT ID, used for the TOConline invoice.
    tax_id_collection: { enabled: true },
  };

  if (prices.shipping && prices.shipping.shipping_rate_id) {
    sessionBody.shipping_options = [{ shipping_rate: prices.shipping.shipping_rate_id }];
  }

  // LDW promo: always auto-apply within the campaign window.
  // After the deadline, fall back to manual promo entry.
  const now = Date.now();
  if (
    now <= LDW_DEADLINE_MS &&
    prices.promotion &&
    prices.promotion.coupon_id
  ) {
    sessionBody.discounts = [{ coupon: prices.promotion.coupon_id }];
  } else {
    sessionBody.allow_promotion_codes = true;
  }

  const session = await createStripeSession(env.STRIPE_SECRET_KEY, sessionBody);
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
    if (url.pathname === '/' && request.method === 'GET') {
      return new Response('wine-orders checkout worker — POST /checkout', {
        status: 200,
        headers: { 'Content-Type': 'text/plain', ...corsHeaders(origin) },
      });
    }
    return new Response('not found', { status: 404, headers: corsHeaders(origin) });
  },
};
