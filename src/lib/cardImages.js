/**
 * Responsive game-card banners. The PNG originals in src/images/ are the
 * source; scripts/images/build-card-images.mjs derives the 800w / 1600w WebP
 * copies in src/images/cards/ that actually ship (a fraction of the bytes at
 * the size the cards are displayed). Re-run it after adding or changing one.
 */
const files = import.meta.glob("../images/cards/*.webp", { eager: true, import: "default" });

const byName = {};
for (const [path, url] of Object.entries(files)) {
  const m = /\/([^/]+)-(\d+)\.webp$/.exec(path);
  if (m) (byName[m[1]] ||= []).push({ url, width: Number(m[2]) });
}

/**
 * `{ src, srcSet }` for the banner derived from src/images/<name>.png, or
 * null when its WebP copies haven't been generated.
 */
export function cardImage(name) {
  const variants = byName[name]?.sort((a, b) => a.width - b.width);
  if (!variants?.length) {
    if (import.meta.env.DEV) console.warn(`card image "${name}" missing — run scripts/images/build-card-images.mjs`);
    return null;
  }
  return {
    src: variants[0].url,
    srcSet: variants.map((v) => `${v.url} ${v.width}w`).join(", "),
  };
}

/** Rendered card width per layout (mirrors the .game-grid breakpoints). */
export const CARD_IMAGE_SIZES = "(max-width: 767px) 100vw, (max-width: 1199px) 50vw, 33vw";
