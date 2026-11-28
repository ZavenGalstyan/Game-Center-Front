// Builds the responsive WebP game-card banners in src/images/cards/ from the
// PNG originals in src/images/ (the originals stay the source of truth).
//
// For every PNG imported by src/lib/gameHelpers.jsx it writes
//   <name>-800.webp and <name>-1600.webp   (never wider than the original)
// which src/lib/cardImages.js serves through <img srcset>.
//
// No npm dependencies: it starts the locally installed Chrome headless and
// lets the browser do the high-quality downscale + WebP encode (canvas), while
// this script serves the files and writes the results.
//
// Run: node scripts/images/build-card-images.mjs [--force]
//      (CHROME_PATH=... to point at a different Chrome/Chromium/Edge binary)
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "../..");
const srcDir = join(root, "src/images");
const outDir = join(srcDir, "cards");
const WIDTHS = [800, 1600];
const QUALITY = 0.86;
const force = process.argv.includes("--force");

const helpers = readFileSync(join(root, "src/lib/gameHelpers.jsx"), "utf8");
const names = [...new Set([...helpers.matchAll(/cardImage\("([^"]+)"\)/g)].map((m) => m[1]))];
if (!names.length) throw new Error("no cardImage(\"...\") references found in gameHelpers.jsx");

mkdirSync(outDir, { recursive: true });
const outPath = (name, w) => join(outDir, `${name}-${w}.webp`);
const todo = names.filter((n) => {
  if (!existsSync(join(srcDir, `${n}.png`))) throw new Error(`missing src/images/${n}.png`);
  if (force) return true;
  const srcTime = statSync(join(srcDir, `${n}.png`)).mtimeMs;
  return WIDTHS.some((w) => !existsSync(outPath(n, w)) || statSync(outPath(n, w)).mtimeMs < srcTime);
});
if (!todo.length) {
  console.log(`all ${names.length} card images are up to date`);
  process.exit(0);
}

const chrome =
  process.env.CHROME_PATH ||
  [
    "C:/Program Files/Google/Chrome/Application/chrome.exe",
    "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/usr/bin/google-chrome",
    "/usr/bin/chromium",
  ].find((p) => existsSync(p));
if (!chrome) throw new Error("Chrome not found — set CHROME_PATH");

// Runs inside Chrome: downscale with the high-quality filter, encode WebP, post back.
const page = `<!doctype html><meta charset="utf-8"><script type="module">
const names = ${JSON.stringify(todo)}, widths = ${JSON.stringify(WIDTHS)}, quality = ${QUALITY};
for (const name of names) {
  try {
    const blob = await (await fetch("/png/" + encodeURIComponent(name))).blob();
    const full = await createImageBitmap(blob);
    for (const target of widths) {
      const w = Math.min(target, full.width), h = Math.round(full.height * w / full.width);
      const bmp = await createImageBitmap(full, { resizeWidth: w, resizeHeight: h, resizeQuality: "high" });
      const canvas = new OffscreenCanvas(w, h);
      const ctx = canvas.getContext("2d");
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(bmp, 0, 0);
      const webp = await canvas.convertToBlob({ type: "image/webp", quality });
      if (webp.type !== "image/webp") throw new Error("this browser cannot encode WebP");
      await fetch("/out/" + encodeURIComponent(name) + "/" + target, { method: "POST", body: webp });
    }
  } catch (e) {
    await fetch("/fail/" + encodeURIComponent(name), { method: "POST", body: String(e) });
  }
}
await fetch("/done", { method: "POST" });
</script>`;

let written = 0;
let bytesIn = 0;
let bytesOut = 0;
const failures = [];
let finish;
const finished = new Promise((r) => (finish = r));

const server = createServer((req, res) => {
  const [, kind, a, b] = req.url.split("/").map(decodeURIComponent);
  if (req.method === "GET" && kind === "") return res.end(page);
  if (req.method === "GET" && kind === "png" && todo.includes(a)) {
    const buf = readFileSync(join(srcDir, `${a}.png`));
    bytesIn += buf.length;
    res.setHeader("Content-Type", "image/png");
    return res.end(buf);
  }
  const chunks = [];
  req.on("data", (c) => chunks.push(c));
  req.on("end", () => {
    const body = Buffer.concat(chunks);
    if (kind === "out" && todo.includes(a) && WIDTHS.includes(Number(b))) {
      writeFileSync(outPath(a, Number(b)), body);
      written += 1;
      bytesOut += body.length;
    } else if (kind === "fail") failures.push(`${a}: ${body}`);
    else if (kind === "done") finish();
    res.end();
  });
});

await new Promise((r) => server.listen(0, "127.0.0.1", r));
const profile = mkdtempSync(join(tmpdir(), "card-images-"));
const browser = spawn(
  chrome,
  ["--headless=new", "--disable-gpu", "--no-first-run", `--user-data-dir=${profile}`, `http://127.0.0.1:${server.address().port}/`],
  { stdio: "ignore" },
);
const timeout = setTimeout(() => finish("timeout"), 10 * 60 * 1000);
const outcome = await finished;
clearTimeout(timeout);
browser.kill();
server.close();
try {
  rmSync(profile, { recursive: true, force: true });
} catch {
  /* Chrome may still hold the profile for a moment */
}

const mb = (n) => (n / 1024 / 1024).toFixed(1);
console.log(`${todo.length} images: ${written} files written, ${mb(bytesIn)} MB PNG -> ${mb(bytesOut)} MB WebP`);
if (outcome === "timeout") failures.push("timed out");
if (failures.length) {
  console.error(failures.join("\n"));
  process.exit(1);
}
