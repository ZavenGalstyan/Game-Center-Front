/** Water Tanks — the five chapters (10 levels each). */
export const LEVELS_PER_CHAPTER = 10;

export const CHAPTERS = [
  { id: 1, name: "Clear Water", blurb: "First pours. Two tanks, then three, and exact measures.", hue: 196 },
  { id: 2, name: "Deep Measure", blurb: "Bigger tanks, longer plans, less obvious answers.", hue: 210 },
  { id: 3, name: "Valve Lab", blurb: "One-way valves, sealed tanks and inlet-only reservoirs.", hue: 176 },
  { id: 4, name: "Pressure Works", blurb: "Fill taps, drains with limited uses, and twin targets.", hue: 222 },
  { id: 5, name: "Master Reservoir", blurb: "Every mechanic at once. Fair, but you'll need a plan.", hue: 188 },
];

export const chapterOf = (levelId) => CHAPTERS[Math.min(CHAPTERS.length, Math.ceil(levelId / LEVELS_PER_CHAPTER)) - 1];
export const chapterLevelIds = (chapterId) => Array.from({ length: LEVELS_PER_CHAPTER }, (_, i) => (chapterId - 1) * LEVELS_PER_CHAPTER + i + 1);
