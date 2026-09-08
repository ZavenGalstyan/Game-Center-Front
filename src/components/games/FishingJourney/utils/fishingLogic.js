/**
 * Fishing Journey — pure gameplay maths (no React, no storage).
 *
 * Everything random or derived about a catch lives here so the screens stay
 * declarative and the numbers are easy to tune in one place.
 */

import { fishForLocation } from "../data/fish.js";
import { RARITIES } from "../data/fish.js";

const RARITY_ORDER = ["common", "uncommon", "rare", "epic"];

export function randBetween(min, max) {
  return min + Math.random() * (max - min);
}

/**
 * Decide which species bites, given the current location and equipped rod.
 * Cast distance skews the rarity roll upward a little; if the rolled rarity has
 * no species at this location we step down until one exists.
 */
export function pickFish(location, rod) {
  const weights = { ...location.rarityWeights };
  const skew = (rod?.castDistance ?? 0) * 0.5; // 0..0.5

  // move a slice of the common weight toward rare/epic
  const moved = weights.common * skew * 0.6;
  weights.common = Math.max(4, weights.common - moved);
  weights.rare += moved * 0.6;
  weights.epic += moved * 0.4;

  const total = RARITY_ORDER.reduce((s, r) => s + (weights[r] || 0), 0);
  let roll = Math.random() * total;
  let rarity = "common";
  for (const r of RARITY_ORDER) {
    roll -= weights[r] || 0;
    if (roll <= 0) {
      rarity = r;
      break;
    }
  }

  const pool = fishForLocation(location.id);
  let candidates = pool.filter((f) => f.rarity === rarity);
  let idx = RARITY_ORDER.indexOf(rarity);
  while (candidates.length === 0 && idx > 0) {
    idx -= 1;
    candidates = pool.filter((f) => f.rarity === RARITY_ORDER[idx]);
  }
  if (candidates.length === 0) candidates = pool;

  return candidates[Math.floor(Math.random() * candidates.length)];
}

/**
 * Roll a weight inside the species range. Cast distance biases the roll toward
 * the heavy end (better rods hook bigger fish). Returns kg to 1 decimal.
 */
export function rollWeight(fish, rod) {
  const bias = 0.5 + (rod?.castDistance ?? 0) * 0.35; // 0.5 (flat) .. ~0.82
  // Math.pow with exponent < 1 pushes the uniform roll toward 1
  const t = Math.pow(Math.random(), bias);
  const raw = fish.minWeight + t * (fish.maxWeight - fish.minWeight);
  const decimals = raw < 10 ? 1 : 0;
  return Number(raw.toFixed(decimals));
}

/** 0..1 — where this weight sits in the species range. */
export function weightFraction(fish, weight) {
  if (fish.maxWeight === fish.minWeight) return 0.5;
  return Math.min(
    1,
    Math.max(0, (weight - fish.minWeight) / (fish.maxWeight - fish.minWeight)),
  );
}

/**
 * Effective reeling difficulty for this exact fish: species difficulty, scaled
 * up for heavier individuals and by the location, then eased by rod control.
 */
export function catchDifficulty(fish, weight, location, rod) {
  const wf = weightFraction(fish, weight);
  const base = fish.difficulty * (0.8 + wf * 0.6) * (location?.difficultyMod ?? 1);
  const control = rod?.control ?? 0;
  return Math.max(0.5, base * (1 - control * 0.35));
}

/** Coins for a successful catch — species value scaled by how heavy it was. */
export function coinReward(fish, weight) {
  const wf = weightFraction(fish, weight);
  return Math.max(1, Math.round(fish.baseCoinValue * (0.75 + wf * 0.85)));
}

/** Reaction window (ms) the player has to hit "Reel In" after a bite. */
export function reactionWindow(rod) {
  const control = rod?.control ?? 0;
  return Math.round(1500 + control * 800); // 1.5s .. 2.3s
}

export function rarityLabel(rarity) {
  return RARITIES[rarity]?.label ?? rarity;
}

export function rarityColor(rarity) {
  return RARITIES[rarity]?.color ?? "#9aa7b8";
}

/**
 * Fold a fresh catch into the saved progress object. Returns a NEW progress
 * object (never mutates) plus the coin reward, so the caller can show it.
 */
export function applyCatch(progress, fish, weight) {
  const reward = coinReward(fish, weight);
  const prev = progress.caughtFish[fish.id] || { count: 0, best: 0 };
  const entry = {
    count: prev.count + 1,
    best: Math.max(prev.best, weight),
  };

  const isBest =
    !progress.bestCatch || weight > (progress.bestCatch.weight ?? 0);

  return {
    progress: {
      ...progress,
      coins: progress.coins + reward,
      totalFishCaught: progress.totalFishCaught + 1,
      caughtFish: { ...progress.caughtFish, [fish.id]: entry },
      bestCatch: isBest
        ? { fishId: fish.id, name: fish.name, weight, rarity: fish.rarity }
        : progress.bestCatch,
    },
    reward,
    isRecord: isBest,
  };
}
