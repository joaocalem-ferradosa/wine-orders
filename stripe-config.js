// Stripe publishable key + price IDs for the static page.
//
// The publishable key is safe to commit (it's public).
// Swap pk_test_... <-> pk_live_... when the live account is verified.
//
// The price IDs come from running `npm run setup-stripe` and are stored
// in stripe-prices.json (fetched at runtime so we don't have to edit
// this file every time prices change).

window.STRIPE_PUBLISHABLE_KEY = 'pk_test_51TacDeV052YnjDnXXJabEzLQdjd9HI6KznKHMF2UpgZfRJDB66Wo5m4ZZQ8AGAHTijox9G5moR5tnvZMihGd6ua100kiNaRTz4';

// Where to send the customer after Stripe Checkout completes / is cancelled.
window.STRIPE_SUCCESS_URL = window.location.origin + '/success.html';
window.STRIPE_CANCEL_URL = window.location.origin + '/';
