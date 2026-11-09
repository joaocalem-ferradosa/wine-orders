// Fails if any wine in data.js is missing from the Stripe prices file or has a different box price.
// Usage: node scripts/check-prices.mjs [stripe-prices.json]
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const file = process.argv[2] || 'stripe-prices.json';
const ctx = { window: {} };
vm.runInNewContext(readFileSync(resolve(root, 'data.js'), 'utf8'), ctx);
const prices = JSON.parse(readFileSync(resolve(root, file), 'utf8'));

const problems = [];
for (const w of ctx.window.WINES) {
  const ref = prices.wines && prices.wines[w.id];
  const cents = Math.round(w.price * 600);
  if (!ref) problems.push(`${w.id}: missing from ${file}`);
  else if (ref.box_price_cents !== cents) problems.push(`${w.id}: data.js box ${cents} ≠ Stripe ${ref.box_price_cents}`);
}
if (problems.length) {
  console.error(`✗ ${file} (${prices.mode}) does not match data.js:\n  ` + problems.join('\n  '));
  process.exit(1);
}
console.log(`✓ ${file} (${prices.mode}) matches data.js for ${ctx.window.WINES.length} wines`);
