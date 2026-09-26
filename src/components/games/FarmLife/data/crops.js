/**
 * Farm Life — crop definitions.
 *
 * Checkpoint 1 ships the three starting crops (spec: "start with a few —
 * Wheat, Carrot, Potato, then unlock more"). Growth is game-time based (spec:
 * "do NOT require real-world hours/days"): `stageSeconds` is how long a
 * WATERED tile spends in each stage before advancing, in real seconds of
 * active play, tuned so a full grow-out is satisfying within one browser
 * session. Growth only advances while the tile is watered (see
 * engine/farmGrid.js) — never punishing, just paused, per the spec's "do not
 * make farming annoying" rule.
 *
 * Stages: 0 seed, 1 sprout, 2 young, 3 growing, 4 mature (harvestable).
 */
import { ITEM } from "./items.js";

export const CROPS = {
  [ITEM.WHEAT]: {
    id: ITEM.WHEAT,
    name: "Wheat",
    seedId: ITEM.WHEAT_SEED,
    seedPrice: 6,
    sellPrice: 12,
    season: "any",
    stageSeconds: [22, 22, 22, 22], // seed->sprout->young->growing->mature
    regrow: false,
    yield: 1,
    color: "#e8c752",
  },
  [ITEM.CARROT]: {
    id: ITEM.CARROT,
    name: "Carrot",
    seedId: ITEM.CARROT_SEED,
    seedPrice: 8,
    sellPrice: 16,
    season: "any",
    stageSeconds: [26, 26, 26, 26],
    regrow: false,
    yield: 1,
    color: "#e8752e",
  },
  [ITEM.POTATO]: {
    id: ITEM.POTATO,
    name: "Potato",
    seedId: ITEM.POTATO_SEED,
    seedPrice: 10,
    sellPrice: 18,
    season: "any",
    stageSeconds: [30, 30, 30, 30],
    regrow: false,
    yield: 1,
    color: "#c99a5c",
  },
};

export function getCrop(id) {
  return CROPS[id] || null;
}

export function cropForSeed(seedId) {
  return Object.values(CROPS).find((c) => c.seedId === seedId) || null;
}

export const STAGE_COUNT = 5; // 0..4
