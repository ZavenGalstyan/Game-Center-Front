/**
 * Element Merge — the 8 discovery chapters. An element's `chapter` field
 * (see elements.js) is one of these ids. Order here is the display/unlock
 * order used by the Chapters and Discovery Book screens.
 */
export const CHAPTERS = [
  { id: "primal", n: 1, name: "Primal", blurb: "Fundamental materials and forces." },
  { id: "world", n: 2, name: "World", blurb: "Planetary environments and geology." },
  { id: "nature", n: 3, name: "Nature", blurb: "Plant life and ecosystems." },
  { id: "life", n: 4, name: "Life", blurb: "Living creatures, great and small." },
  { id: "civilization", n: 5, name: "Civilization", blurb: "Human development and culture." },
  { id: "industry", n: 6, name: "Industry", blurb: "Machines and mass production." },
  { id: "technology", n: 7, name: "Technology", blurb: "Circuits, code and automation." },
  { id: "cosmos", n: 8, name: "Cosmos", blurb: "Beyond the sky." },
];

const CHAPTER_INDEX = new Map(CHAPTERS.map((c) => [c.id, c]));

export function chapterInfo(id) {
  return CHAPTER_INDEX.get(id) || null;
}

export function chapterOrder(id) {
  const c = CHAPTER_INDEX.get(id);
  return c ? c.n : 99;
}
