/**
 * Blade Rush — DEV-TIME stage generator. Not imported at runtime; run
 * manually with `node generateStages.mjs` whenever the 100 stages need to be
 * (re)produced. Writes `stages.js` next to it.
 *
 * FAIRNESS MODEL
 * A stage is fair as long as, at every moment, at least one honestly-sized
 * free arc exists on the target for the player to time a throw into — the
 * target keeps rotating, so the local angle that will land at the impact
 * point sweeps through the WHOLE circle over time; the player just waits for
 * a free one. That only breaks if:
 *   (a) the PRE-EMBEDDED blades (the only ones actually fixed at data-gen
 *       time — blades placed during play land wherever the rotation happens
 *       to be at the moment of a successful click, not at an authored spot)
 *       leave no gap wide enough for one more blade, or
 *   (b) the rotation pattern never actually moves (a permanently frozen
 *       target could freeze on an occupied angle forever).
 * Every stage below is checked against both before being written out, and a
 * generous SAFETY margin (spacing pre-embedded blades wider than the bare
 * legal minimum, and requiring a much bigger free arc than the bare minimum)
 * keeps "technically fair" from meaning "pixel-perfect frame-perfect".
 * Simplification, disclosed: this validates GEOMETRIC fairness (room exists),
 * not a full player-skill/timing simulation.
 */
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import {
  TAU,
  constantPattern, reversePeriodic, speedPulse, stopAndGo, burstPattern, randomizedSequence,
} from "../systems/rotationSystem.js";
import { allClear, COLLISION_THRESHOLD, SHARD_THRESHOLD } from "../systems/collisionSystem.js";
import { WORLDS } from "./worlds.js";

const PLACEMENT_THRESHOLD = COLLISION_THRESHOLD * 1.5; // extra breathing room between authored blades
const MIN_FREE_ARC = COLLISION_THRESHOLD * 2.4; // must always remain this wide somewhere

function seededRng(seed) {
  let s = (seed >>> 0) || 1;
  return () => {
    s ^= s << 13; s ^= s >>> 17; s ^= s << 5; s >>>= 0;
    return (s % 1000000) / 1000000;
  };
}

function maxFreeGap(angles) {
  if (angles.length === 0) return TAU;
  const sorted = [...angles].sort((a, b) => a - b);
  let best = 0;
  for (let i = 0; i < sorted.length; i++) {
    const a = sorted[i];
    const b = i + 1 < sorted.length ? sorted[i + 1] : sorted[0] + TAU;
    best = Math.max(best, b - a);
  }
  return best;
}

/** Place `count` angles, pairwise clear (extra margin) of each other and of
 *  `avoid`. Returns fewer than `count` only if geometrically impossible —
 *  callers must treat that as a hard generator error, never ship it silently. */
function placeAngles(count, rng, avoid = [], threshold = PLACEMENT_THRESHOLD) {
  const placed = [];
  let attempts = 0;
  while (placed.length < count && attempts < 2000) {
    attempts += 1;
    const candidate = rng() * TAU;
    if (allClear([...avoid, ...placed, candidate], threshold)) placed.push(candidate);
  }
  return placed;
}

function patternHasMotion(pattern) {
  if (pattern.type === "constant") return pattern.speed !== 0;
  return pattern.segments.some((s) => (s.speed && s.speed !== 0) || (s.from && s.from !== 0) || (s.to && s.to !== 0));
}

function validateStage(stage) {
  const errors = [];
  const phases = stage.boss ? stage.bossPhases : [{ requiredBlades: stage.requiredBlades, rotation: stage.rotation }];
  for (const p of phases) {
    if (!patternHasMotion(p.rotation)) errors.push(`stage ${stage.id}: frozen rotation pattern`);
  }
  const embedded = stage.embeddedBlades || [];
  if (!allClear(embedded, COLLISION_THRESHOLD)) errors.push(`stage ${stage.id}: pre-embedded blades overlap`);
  if (maxFreeGap(embedded) < MIN_FREE_ARC) errors.push(`stage ${stage.id}: no fair free arc (${embedded.length} embedded)`);
  const totalBlades = embedded.length + phases.reduce((s, p) => s + p.requiredBlades, 0);
  if (totalBlades > 18) errors.push(`stage ${stage.id}: ${totalBlades} total blades exceeds safe ceiling`);
  const shards = stage.bonusShards || [];
  if (!allClear([...embedded, ...shards], Math.max(SHARD_THRESHOLD, COLLISION_THRESHOLD) * 1.1))
    errors.push(`stage ${stage.id}: shard placed too close to a pre-embedded blade`);
  return errors;
}

/* ------------------------------------------------------------- difficulty */

const TIER_SPEED = [0.78, 1.15, 1.55, 2.0, 2.5]; // base rad/s per world tier — faster overall pass
const TIER_REQUIRED_BASE = [5, 6, 7, 8, 9];
const TIER_REQUIRED_GROWTH = [3, 4, 4, 3, 3]; // added across the 18 regular stages
const MINI_BOSS_TOTAL = [8, 9, 10, 11, 12];
const WORLD_BOSS_TOTAL = [10, 12, 13, 14, 15];

function patternForRegularStage(tier, li, seed) {
  const speed = TIER_SPEED[tier] * (0.85 + (li / 20) * 0.5);
  const rng = seededRng(seed);
  if (tier === 0) {
    if (li <= 4) return constantPattern(speed);
    if (li <= 8) return reversePeriodic(speed, 2.4 - li * 0.05);
    return speedPulse(speed * 0.7, speed * 1.5, 1.1, 0.7);
  }
  if (tier === 1) {
    const pick = li % 3;
    if (pick === 0) return reversePeriodic(speed, 1.7 - li * 0.02);
    if (pick === 1) return burstPattern(speed * 0.75, speed * 1.7, 1.2, 0.4);
    return speedPulse(speed * 0.6, speed * 1.6, 0.9, 0.55);
  }
  if (tier === 2) {
    const pick = li % 3;
    if (pick === 0) return reversePeriodic(speed, Math.max(0.8, 1.4 - li * 0.03));
    if (pick === 1) return stopAndGo(speed * 1.2, 0.85, 0.35);
    return burstPattern(speed * 0.8, speed * 1.9, 0.9, 0.35);
  }
  if (tier === 3) {
    const pick = li % 4;
    if (pick === 0) return stopAndGo(speed * 1.25, 0.7, 0.4);
    if (pick === 1) return randomizedSequence(seed * 7919 + li, 5, [speed * 0.6, speed * 1.6]);
    if (pick === 2) return reversePeriodic(speed * 1.1, Math.max(0.6, 1.1 - li * 0.02));
    return burstPattern(speed * 0.85, speed * 2.0, 0.75, 0.3);
  }
  // tier 4 — master combinations
  const pick = (li + Math.floor(rng() * 3)) % 4;
  if (pick === 0) return randomizedSequence(seed * 104729 + li, 6, [speed * 0.6, speed * 1.8]);
  if (pick === 1) return stopAndGo(speed * 1.35, 0.55, 0.4);
  if (pick === 2) return burstPattern(speed * 0.9, speed * 2.1, 0.65, 0.3);
  return reversePeriodic(speed * 1.2, Math.max(0.5, 0.95 - li * 0.01));
}

function embeddedCountFor(tier, li, isFinalStretch) {
  if (tier === 0) {
    if (li < 3) return 0;
    if (li < 6) return 1;
    if (li < 10) return 2;
    return isFinalStretch ? 3 : 2;
  }
  const base = 1 + Math.floor(li / 9) + Math.min(tier, 3);
  return Math.min(4, base);
}

function shardCountFor(tier, li) {
  if (tier === 0 && li < 4) return 0;
  const seedRoll = (tier * 37 + li * 11) % 5;
  return seedRoll < 2 ? 1 : 2;
}

function requiredBladesFor(tier, li) {
  const growth = TIER_REQUIRED_GROWTH[tier];
  const step = Math.min(1, li / 18);
  return Math.round(TIER_REQUIRED_BASE[tier] + growth * step);
}

function buildRegularStage(id, world, li, tier) {
  const seed = id * 2654435761;
  const rng = seededRng(seed);
  const requiredBlades = requiredBladesFor(tier, li);
  const rotation = patternForRegularStage(tier, li, seed);
  const embeddedCount = embeddedCountFor(tier, li, li >= 15);
  const embeddedBlades = placeAngles(embeddedCount, rng);
  const shardCount = shardCountFor(tier, li);
  const bonusShards = placeAngles(shardCount, rng, embeddedBlades, Math.max(SHARD_THRESHOLD, COLLISION_THRESHOLD) * 1.2);
  const target = world.targets[li % world.targets.length];

  return {
    id,
    world: world.id,
    target,
    material: world.material,
    rotation,
    requiredBlades,
    embeddedBlades,
    bonusShards,
    boss: false,
  };
}

function splitPhases(total, phaseCount = 3) {
  const base = Math.floor(total / phaseCount);
  const rem = total - base * phaseCount;
  const parts = new Array(phaseCount).fill(base);
  for (let i = 0; i < rem; i++) parts[phaseCount - 1 - i] += 1; // remainder escalates the later phases
  return parts;
}

function buildBossStage(id, world, isMiniBoss) {
  const seed = id * 40503 + 7;
  const rng = seededRng(seed);
  const tier = world.index;
  const speed = TIER_SPEED[tier];
  const total = (isMiniBoss ? MINI_BOSS_TOTAL : WORLD_BOSS_TOTAL)[tier];
  const requiredPerPhase = splitPhases(total, 3);

  const phasePatterns = [
    constantPattern(speed * 0.9),
    reversePeriodic(speed * 1.15, 1.0),
    tier >= 3 ? randomizedSequence(seed * 13, 5, [speed * 0.8, speed * 2.0]) : stopAndGo(speed * 1.4, 0.6, 0.35),
  ];

  const bossPhases = requiredPerPhase.map((requiredBlades, i) => ({
    requiredBlades,
    rotation: phasePatterns[i],
  }));

  const preEmbeddedCount = isMiniBoss ? Math.min(2, tier) : Math.min(3, tier);
  const embeddedBlades = placeAngles(preEmbeddedCount, rng);
  const bonusShards = placeAngles(isMiniBoss ? 2 : 3, rng, embeddedBlades, Math.max(SHARD_THRESHOLD, COLLISION_THRESHOLD) * 1.2);
  const target = isMiniBoss ? world.miniBoss : world.worldBoss;

  return {
    id,
    world: world.id,
    target,
    material: world.material,
    rotation: bossPhases[0].rotation,
    requiredBlades: bossPhases.reduce((s, p) => s + p.requiredBlades, 0),
    embeddedBlades,
    bonusShards,
    boss: true,
    bossPhases,
  };
}

/* ---------------------------------------------------------------- build all */

const stages = [];
for (const world of WORLDS) {
  const [start, end] = world.range;
  for (let id = start; id <= end; id++) {
    const li = id - start + 1; // 1..20, world-local
    if (li === 10) stages.push(buildBossStage(id, world, true));
    else if (li === 20) stages.push(buildBossStage(id, world, false));
    else stages.push(buildRegularStage(id, world, li, world.index));
  }
}

const allErrors = stages.flatMap(validateStage);
if (allErrors.length) {
  console.error(`Generated ${allErrors.length} fairness violation(s):`);
  for (const e of allErrors) console.error(" -", e);
  process.exit(1);
}

const __dirname = dirname(fileURLToPath(import.meta.url));
const out = `/**
 * Blade Rush — 100 data-driven stages, generated by generateStages.mjs.
 * DO NOT hand-edit; re-run the generator instead.
 *
 * Every rotation pattern and every pre-embedded/shard angle here was checked
 * for geometric fairness by validateStage() in the generator before this
 * file was written (see the comment at the top of generateStages.mjs).
 */
export const TOTAL_STAGES = ${stages.length};
export const STAGES = ${JSON.stringify(stages, null, 2)};

export const STAGE_BY_ID = Object.fromEntries(STAGES.map((s) => [s.id, s]));
export const getStage = (id) => STAGE_BY_ID[id] || null;
`;
writeFileSync(join(__dirname, "stages.js"), out);
console.log(`Wrote ${stages.length} stages to stages.js (0 fairness violations).`);
