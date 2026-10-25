// Checks the avatar catalog/asset mapping. Loads src/lib/avatars.js through
// Vite (so import.meta.glob resolves exactly as in the app) and, when the
// backend repo sits next to this one, compares against its catalog.
// Run: node scripts/avatars/verify.mjs [path/to/Backend-Game-Center]
import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const backendDir = resolve(process.argv[2] || join(root, "../Backend-Game-Center"));

let failures = 0;
const check = (ok, msg) => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${msg}`);
  if (!ok) failures++;
};

const server = await createServer({ root, logLevel: "error", server: { middlewareMode: true }, appType: "custom" });
try {
  const m = await server.ssrLoadModule("/src/lib/avatars.js");
  const ids = m.LOCAL_AVATARS.map((a) => a.id);

  check(ids.length === 50, `local catalog has 50 avatars (got ${ids.length})`);
  check(new Set(ids).size === ids.length, "avatar ids are unique");
  check(m.LOCAL_CATEGORIES.length === 6, "6 categories");
  const missing = ids.filter((id) => !m.hasAvatarAsset(id));
  check(missing.length === 0, `every id has an asset${missing.length ? ` (missing: ${missing.join(", ")})` : ""}`);
  const files = ids.map((id) => join(root, "src/assets/avatars", `${id}.svg`));
  check(files.every(existsSync), "every <id>.svg exists on disk");
  const contents = files.map((f) => readFileSync(f, "utf8"));
  check(new Set(contents).size === contents.length, "no two avatars share the same image");
  check(contents.every((c) => c.startsWith("<svg") && c.includes('viewBox="0 0 128 128"')), "all assets are 128x128 SVGs");
  check(Boolean(m.FALLBACK_AVATAR_SRC), "_fallback.svg is mapped");

  const srcs = ids.map((id) => m.getAvatarSrc(id));
  check(new Set(srcs).size === 50, "getAvatarSrc gives 50 distinct URLs");
  const def = m.getAvatarSrc(m.DEFAULT_AVATAR_ID);
  for (const bad of [undefined, null, "", "nope", "Shadow-Soldier", " shadow-soldier", 42, "_fallback", "constructor", "__proto__"]) {
    check(m.getAvatarSrc(bad) === def, `getAvatarSrc(${JSON.stringify(bad)}) -> default`);
  }
  check(m.resolveAvatarId(undefined) === "shadow-soldier", "legacy user without avatarId resolves to default");

  const counts = Object.fromEntries(m.LOCAL_CATEGORIES.map((c) => [c.id, ids.filter((_, i) => m.LOCAL_AVATARS[i].category === c.id).length]));
  check(JSON.stringify(counts) === JSON.stringify({ "soldiers-warriors": 10, "skulls-dark": 10, "cars-racing": 10, "robots-scifi": 10, "animals-fantasy": 5, "anime-mystery": 5 }), `category sizes ${JSON.stringify(counts)}`);

  const norm = m.normalizeCatalog({ avatars: [{ id: "fire-dragon", name: "Fire Dragon", category: "animals-fantasy" }, { id: "future-id", name: "X", category: "new" }], categories: m.LOCAL_CATEGORIES, defaultAvatarId: "shadow-soldier" });
  check(norm.avatars.length === 1 && norm.categories.length === 1, "normalizeCatalog drops ids without assets and empty categories");
  check(m.normalizeCatalog(null) === null && m.normalizeCatalog({}) === null, "normalizeCatalog rejects unusable payloads");

  const backendConfig = join(backendDir, "src/config/avatars.js");
  if (existsSync(backendConfig)) {
    const be = createRequire(import.meta.url)(backendConfig);
    check(JSON.stringify(be.AVATARS.map((a) => [a.id, a.name, a.category])) === JSON.stringify(m.LOCAL_AVATARS.map((a) => [a.id, a.name, a.category])), "local catalog matches backend AVATARS exactly (ids, names, categories, order)");
    check(JSON.stringify(be.AVATAR_CATEGORIES.map((c) => [c.id, c.name])) === JSON.stringify(m.LOCAL_CATEGORIES.map((c) => [c.id, c.name])), "categories match backend");
    check(be.DEFAULT_AVATAR_ID === m.DEFAULT_AVATAR_ID, "default id matches backend");
  } else {
    console.log(`SKIP  backend catalog not found at ${backendConfig}`);
  }
} finally {
  await server.close();
}

console.log(failures ? `\n${failures} check(s) failed` : "\nall checks passed");
process.exit(failures ? 1 : 0);
