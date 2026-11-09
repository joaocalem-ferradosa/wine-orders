# wine-orders

Static site for `orders.ferradosa.com` (GitHub Pages).

Landing page + checkout for Quinta da Ferradosa direct sales. Stripe Checkout handles payment (MBWay, Multibanco, card). Boxes of 6 only, mainland Portugal only.

## Stripe setup (one-time)

1. Open a Stripe account (Portugal, company, Lda). Enable MBWay + Multibanco in **Settings → Payment methods**.
2. Get your **secret key** from <https://dashboard.stripe.com/apikeys> (start with the test key `sk_test_…`).
3. `cp .env.example .env` and paste the secret key.
4. `npm install`
5. `npm run setup-stripe` — creates one product + box price per wine in `data.js` and the free-shipping rate for mainland PT. Idempotent; safe to re-run. Writes `stripe-prices.json` with a live key, `stripe-prices.test.json` (gitignored) with a test key.
6. Get your **publishable key** (`pk_test_…`) from the same Dashboard page and paste it into `stripe-config.js`.
7. Commit `stripe-prices.json` + the updated `stripe-config.js` and push. GitHub Pages rebuilds in ~30s.

When the live account is approved, repeat 2–6 with the `sk_live_…` / `pk_live_…` keys (live and test are separate worlds in Stripe).

## Promo codes

Rules live in `promo.js` (per-wine % by total boxes, expiry), shared by the page and the Worker. Current: **TECA** — 2+ / 6+ boxes, until 31 Dec 2026. Link: `https://orders.ferradosa.com/?code=TECA` (the page remembers it); customers can also type it in the cart. Changing a promo needs a Worker redeploy.

## Tests

```sh
npm test
```

## Local dev

```sh
python3 -m http.server 8765
# open http://localhost:8765
```

## Files

- `index.html` — entry point
- `app.jsx` — React app (landing + checkout + age gate) — runs via Babel-standalone in the browser
- `data.js` — wine catalog (prices, stock); also the source for `setup-stripe`
- `promo.js` — promo code rules + discount calculation (page and Worker)
- `strings.js` — PT / EN copy
- `styles.css` — visuals (from Claude design)
- `stripe-config.js` — publishable key + redirect URLs
- `stripe-prices.json` — Stripe price IDs (output of `setup-stripe`)
- `scripts/setup-stripe.mjs` — Node script that creates the Stripe resources
- `assets/wines/*.png` — bottle photos
- `success.html` — post-checkout thank-you
- `CNAME` — custom-domain mapping for GitHub Pages
