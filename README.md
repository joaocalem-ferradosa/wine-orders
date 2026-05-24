# wine-orders

Static site for `orders.ferradosa.com` (GitHub Pages).

Landing page + checkout for Quinta da Ferradosa direct sales. Stripe Checkout handles payment (MBWay, Multibanco, card). Boxes of 6 only, mainland Portugal only.

## Stripe setup (one-time)

1. Open a Stripe account (Portugal, company, Lda). Enable MBWay + Multibanco in **Settings → Payment methods**.
2. Get your **secret key** from <https://dashboard.stripe.com/apikeys> (start with the test key `sk_test_…`).
3. `cp .env.example .env` and paste the secret key.
4. `npm install`
5. `npm run setup-stripe` — creates products, prices, the `LDW` promo code (30% off, expires 14 Jun 2026) and the free-shipping rate for mainland PT. Idempotent; safe to re-run. Writes `stripe-prices.json`.
6. Get your **publishable key** (`pk_test_…`) from the same Dashboard page and paste it into `stripe-config.js`.
7. In the Stripe Dashboard, go to **Settings → Checkout and Payment Links** and toggle **"Allow promotion codes"** on, so customers can type `LDW` at checkout.
8. Commit `stripe-prices.json` + the updated `stripe-config.js` and push. GitHub Pages rebuilds in ~30s.

When the live account is approved, repeat 2–7 with the `sk_live_…` / `pk_live_…` keys (live and test are separate worlds in Stripe).

## QR / event link

The card QR points to `https://orders.ferradosa.com/?code=LDW` — the page detects the param and shows the LDW banner telling customers to type `LDW` at checkout.

## Local dev

```sh
python3 -m http.server 8765
# open http://localhost:8765
```

## Files

- `index.html` — entry point
- `app.jsx` — React app (landing + checkout + age gate) — runs via Babel-standalone in the browser
- `data.js` — wine catalog (prices, stock)
- `strings.js` — PT / EN copy
- `styles.css` — visuals (from Claude design)
- `stripe-config.js` — publishable key + redirect URLs
- `stripe-prices.json` — Stripe price IDs (output of `setup-stripe`)
- `scripts/setup-stripe.mjs` — Node script that creates the Stripe resources
- `assets/wines/*.png` — bottle photos
- `success.html` — post-checkout thank-you
- `CNAME` — custom-domain mapping for GitHub Pages
