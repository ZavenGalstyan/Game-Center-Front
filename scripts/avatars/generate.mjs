// Writes src/assets/avatars/<id>.svg for every avatar in the catalog.
// Run: node scripts/avatars/generate.mjs
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const outDir = join(here, "../../src/assets/avatars");

const parts = ["soldiers", "skulls", "cars", "robots", "fantasy", "fallback"];
const all = {};
for (const p of parts) {
  try {
    Object.assign(all, (await import(`./${p}.mjs`)).default);
  } catch (err) {
    if (err.code !== "ERR_MODULE_NOT_FOUND") throw err;
  }
}

mkdirSync(outDir, { recursive: true });
let total = 0;
for (const [id, draw] of Object.entries(all)) {
  const svg = draw();
  writeFileSync(join(outDir, `${id}.svg`), svg);
  total += svg.length;
  if (svg.length > 8192) console.warn(`${id}.svg is ${svg.length} bytes (> 8 KB)`);
}
console.log(`wrote ${Object.keys(all).length} avatars, ${(total / 1024).toFixed(1)} KB total`);
