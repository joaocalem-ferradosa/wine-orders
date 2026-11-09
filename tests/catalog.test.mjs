import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { loadBrowserScripts, repoRoot } from './load-browser.mjs';

const w = loadBrowserScripts('data.js', 'strings.js');

test('catalog lists Ferros first, then Ferradosa wines', () => {
  assert.deepEqual(Array.from(w.WINES, (x) => x.id), ['ferro-branco', 'ferro-tinto', 'rose', 'branco', 'quinta', 'tinto']);
});

test('catalog per-bottle prices match the price list', () => {
  assert.deepEqual(Array.from(w.WINES, (x) => x.price), [4.45, 4.45, 10.45, 15.95, 17.95, 22.95]);
});

test('every wine is in stock', () => {
  assert.ok(w.WINES.every((x) => x.stock === true));
});

test('every wine has PT and EN varietal copy', () => {
  for (const x of w.WINES) {
    assert.ok(w.WINE_COPY.pt[x.id]?.varietal, `pt ${x.id}`);
    assert.ok(w.WINE_COPY.en[x.id]?.varietal, `en ${x.id}`);
  }
});

test('every wine image exists', () => {
  for (const x of w.WINES) assert.ok(existsSync(resolve(repoRoot, x.img)), x.img);
});
