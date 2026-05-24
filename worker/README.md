# wine-orders checkout worker

Tiny Cloudflare Worker that creates Stripe Checkout Sessions for `orders.ferradosa.com`.

## Why this exists

The static page can't talk to Stripe's Checkout Session API directly (that requires a secret key). This Worker is the smallest possible backend that does the secret-key call and returns the hosted Stripe Checkout URL. Free tier is plenty for our volume.

## Deploy (one-time, ~10 min)

1. Sign up at <https://dash.cloudflare.com/sign-up> (free).
2. From this directory:
   ```sh
   cd worker
   npm install
   npx wrangler login          # browser auth, one time
   npx wrangler secret put STRIPE_SECRET_KEY
   # paste your sk_test_... (or sk_live_... later)
   npx wrangler deploy
   ```
3. Wrangler prints a URL like `https://wine-orders-checkout.<your-handle>.workers.dev`. Copy it.
4. Paste it into `../stripe-config.js` as `window.CHECKOUT_URL`.
5. Commit the updated `stripe-config.js` and push. GitHub Pages rebuilds in ~30s.

## Going live

When you swap from test to live Stripe keys:

```sh
npx wrangler secret put STRIPE_SECRET_KEY
# paste your sk_live_...
npx wrangler deploy
```

The Worker reads price/coupon/shipping IDs from `https://orders.ferradosa.com/stripe-prices.json`, so re-running `npm run setup-stripe` (in the parent dir) and pushing is enough — no Worker redeploy needed when prices change.

## Local dev

```sh
cp .dev.vars.example .dev.vars  # paste sk_test_... into .dev.vars
npx wrangler dev                # serves at http://localhost:8787
```

Then from the static page running on `localhost`, point `window.CHECKOUT_URL` at `http://localhost:8787/checkout`.

## Endpoints

- `POST /checkout` — create a Checkout Session. Body: `{items, lang, promo, successUrl, cancelUrl}`. Returns `{url}` or `{error}`.
- `GET /` — health check.
- `OPTIONS /checkout` — CORS preflight.

CORS allows `https://orders.ferradosa.com` and `localhost`.
