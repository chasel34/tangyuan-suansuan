// Entry point so that `node --test tests/` works on Node versions that treat the directory
// argument as a module path: it loads every *.test.mjs file in this folder.
import { readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const dir = fileURLToPath(new URL('.', import.meta.url));
for (const f of readdirSync(dir).filter((n) => n.endsWith('.test.mjs')).sort()) {
  await import(new URL(f, import.meta.url));
}
