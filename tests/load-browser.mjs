import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

export const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

export function loadBrowserScripts(...files) {
  const ctx = vm.createContext({});
  ctx.window = ctx;
  for (const f of files) vm.runInContext(readFileSync(resolve(repoRoot, f), 'utf8'), ctx, { filename: f });
  return ctx;
}
