/**
 * Escape Quest — render smoke test: server-renders every prop kind (closed and
 * open), every item icon, and every room/view/hotspot/clue of all 50 levels.
 *   node src/components/games/EscapeQuest/tools/renderTest.mjs
 */
import { build } from "esbuild";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const here = path.dirname(fileURLToPath(import.meta.url));
const out = path.join(os.tmpdir(), `eq-render-${process.pid}.cjs`);
await build({ entryPoints: [path.join(here, "renderEntry.jsx")], bundle: true, platform: "node", format: "cjs", outfile: out, jsx: "automatic", loader: { ".css": "empty" }, logLevel: "error" });
const { run } = createRequire(import.meta.url)(out);
const errs = run();
console.log(errs.length ? errs.join("\n") + `\n${errs.length} render error(s)` : "All props, items and rooms render.");
process.exit(errs.length ? 1 : 0);
