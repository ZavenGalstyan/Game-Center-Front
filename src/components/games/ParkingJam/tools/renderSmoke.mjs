/**
 * Parking Jam — render smoke test runner:
 *   node src/components/games/ParkingJam/tools/renderSmoke.mjs
 * Bundles renderSmoke.entry.jsx with esbuild (already installed as Vite's
 * bundler — no extra dependency) and runs it in Node.
 */
import { build } from "esbuild";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join } from "node:path";
import { mkdtempSync, rmSync } from "node:fs";

const here = dirname(fileURLToPath(import.meta.url));
// temp dir inside the project so the bundle resolves react from node_modules
const out = mkdtempSync(join(here, ".smoke-"));
const file = join(out, "smoke.mjs");
try {
  await build({
    entryPoints: [join(here, "renderSmoke.entry.jsx")],
    bundle: true,
    platform: "node",
    format: "esm",
    jsx: "automatic",
    packages: "external",
    outfile: file,
    logLevel: "error",
  });
  const { run } = await import(pathToFileURL(file).href);
  const { renders, failures } = run();
  for (const f of failures) console.error("✗", f);
  console.log(`${renders} renders ok, ${failures.length} failed`);
  process.exitCode = failures.length ? 1 : 0;
} finally {
  rmSync(out, { recursive: true, force: true });
}
