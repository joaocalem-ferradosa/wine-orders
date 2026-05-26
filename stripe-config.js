// Frontend Stripe config for the static page.
//
// CHECKOUT_URL is the Cloudflare Worker that creates Stripe Checkout
// Sessions. Deploy the worker from ./worker/ (see worker/README.md),
// then paste the resulting *.workers.dev URL below.
//
// The publishable key is no longer used directly by the page (the Worker
// handles all Stripe API calls server-side), but is kept here so the page
// can later embed Stripe Elements if we ever want that.

window.CHECKOUT_URL = 'https://wine-orders-checkout.ferradosa.workers.dev/checkout';

window.STRIPE_PUBLISHABLE_KEY = 'pk_live_51Tab21V056qwZ0N8FiSozVrLaYLFgPO4J7LlmVZw8xBrONS511e3Ds1ivF9beKwYHeUaMpggSRXaFKCdZAIrY7TZ00dafvKcW8';

// Where to send the customer after Stripe Checkout completes / is cancelled.
window.STRIPE_SUCCESS_URL = window.location.origin + '/success.html';
window.STRIPE_CANCEL_URL = window.location.origin + '/';
