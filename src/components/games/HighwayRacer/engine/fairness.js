/**
 * Highway Racer — can the player still get through?
 *
 * Traffic flows at a steady speed per lane, so every car's arrival at the
 * player is predictable: a car whose centre is `d` metres ahead, closing at
 * `c` m/s, occupies the player's lane band from (d - R)/c to (d + R)/c
 * seconds, R being both half-lengths plus a safety margin.
 *
 * That turns "is this traffic fair?" into a tiny reachability problem on a
 * lanes × time grid: the player may stay in a free lane, or move one lane
 * over if both lanes stay free for a full lane change. The spawner only
 * accepts a traffic pattern if every lane the player could survive from
 * before it is still survivable after it, at the fastest speed the player
 * can reach (boost) — which, with one shared traffic speed, covers every
 * slower speed too. The same grid steers the test bot.
 */
import { FAIR, LANES, LANE_COUNT, PLAYER, VEHICLES } from "./config.js";

const MAX_H = 14; // seconds of look-ahead
const STEPS = Math.ceil(MAX_H / FAIR.dt) + 1;
const blocked = Array.from({ length: LANE_COUNT }, () => new Uint8Array(STEPS));
const reach = Array.from({ length: LANE_COUNT }, () => new Uint8Array(STEPS));

/** Occupancy window [t0, t1] (seconds from now) of `car` against the player. */
export function window(car, playerSpeed, margin = FAIR.margin) {
  const v = VEHICLES[car.type] || VEHICLES.sedan;
  const c = playerSpeed - car.speed;
  const R = v.halfLength + PLAYER.halfLength + margin;
  const d = -car.z;
  if (c <= 0.05) {
    // not closing: blocked only while it already overlaps
    return Math.abs(d) < R ? [0, MAX_H] : null;
  }
  const t0 = (d - R) / c;
  const t1 = (d + R) / c;
  if (t1 < 0) return null;
  return [Math.max(0, t0), t1];
}

/** Lanes a car (centre x, half width) physically covers for the player. */
function lanesOf(x, halfWidth) {
  const out = [];
  for (let l = 0; l < LANE_COUNT; l++) {
    if (Math.abs(LANES[l] - x) < halfWidth + PLAYER.halfWidth + 0.15) out.push(l);
  }
  return out;
}

function fill(cars, playerSpeed, steps, margin = FAIR.margin) {
  for (let l = 0; l < LANE_COUNT; l++) blocked[l].fill(0, 0, steps);
  for (const car of cars) {
    const w = window(car, playerSpeed, margin);
    if (!w) continue;
    const k0 = Math.max(0, Math.floor(w[0] / FAIR.dt));
    const k1 = Math.min(steps - 1, Math.ceil(w[1] / FAIR.dt));
    if (k0 > k1) continue;
    const v = VEHICLES[car.type] || VEHICLES.sedan;
    for (const l of lanesOf(LANES[car.lane], v.halfWidth)) blocked[l].fill(1, k0, k1 + 1);
  }
}

/**
 * Which start lanes can survive the next `horizon` seconds?
 * Returns a bitmask (bit l = lane l survivable).
 * `react`: seconds before the first lane change may begin.
 */
function survivable(steps, laneSteps, reactSteps) {
  // During a lane change the car is still inside its old lane for the first
  // ~45 % of the move and already inside the new one after ~25 % (critically
  // damped spring vs. the collision boxes) — the planner uses those phases,
  // plus the window margins, instead of "both lanes for the whole change".
  const leaveSteps = Math.ceil(laneSteps * 0.45);
  const enterSteps = Math.floor(laneSteps * 0.25);
  let mask = 0;
  for (let s = 0; s < LANE_COUNT; s++) {
    for (let l = 0; l < LANE_COUNT; l++) reach[l].fill(0, 0, steps);
    if (blocked[s][0]) continue;
    reach[s][0] = 1;
    for (let k = 0; k < steps - 1; k++) {
      for (let l = 0; l < LANE_COUNT; l++) {
        if (!reach[l][k]) continue;
        if (!blocked[l][k + 1]) reach[l][k + 1] = 1;
        if (k < reactSteps) continue;
        for (const n of [l - 1, l + 1]) {
          if (n < 0 || n >= LANE_COUNT) continue;
          const end = Math.min(steps - 1, k + leaveSteps);
          let ok = true;
          for (let j = k; j <= end && ok; j++) if (blocked[l][j]) ok = false;
          for (let j = Math.min(end, k + enterSteps); j <= end && ok; j++) if (blocked[n][j]) ok = false;
          if (ok) reach[n][end] = 1;
        }
      }
    }
    for (let l = 0; l < LANE_COUNT; l++) {
      if (reach[l][steps - 1]) {
        mask |= 1 << s;
        break;
      }
    }
  }
  return mask;
}

function horizonFor(cars, speed, margin = FAIR.margin) {
  let h = 1;
  for (const car of cars) {
    const w = window(car, speed, margin);
    if (w && w[1] > h) h = w[1];
  }
  return Math.min(MAX_H, h + 0.6);
}

/** Bitmask of survivable start lanes for `cars` at `speed`. */
export function survivableLanes(cars, speed, laneTime, react = FAIR.reaction, margin = FAIR.margin) {
  const steps = Math.min(STEPS, Math.ceil(horizonFor(cars, speed, margin) / FAIR.dt) + 1);
  fill(cars, speed, steps, margin);
  return survivable(steps, Math.ceil(laneTime / FAIR.dt), Math.ceil(react / FAIR.dt));
}

/**
 * True if adding `extra` cars to `cars` takes no survivable start lane away,
 * checked at the current speed and at `boostSpeed`.
 */
export function isFair(cars, extra, speed, boostSpeed, laneTime) {
  const all = cars.concat(extra);
  // Traffic shares one speed, so the gaps are fixed in distance and only the
  // lane-change distance (closing speed × lane time) grows with speed: if it
  // is fair at the fastest the player can go before these cars arrive
  // (boost), it is fair at every slower speed too. Humans get slack the
  // physics doesn't need: wider margins and slower lane changes.
  const lt = laneTime * FAIR.humanLaneTime;
  for (const v of [speed, boostSpeed * 1.04]) {
    const before = survivableLanes(cars, v, lt, FAIR.reaction, FAIR.spawnMargin);
    const after = survivableLanes(all, v, lt, FAIR.reaction, FAIR.spawnMargin);
    if ((after & before) !== before) return false;
    if (after === 0) return false;
  }
  return true;
}

const good = Array.from({ length: LANE_COUNT }, () => new Uint8Array(STEPS));

/**
 * Bot helper: which way to steer right now (-1 / 0 / +1) from `lane`.
 * Backward DP over the same grid: good[l][k] = "settled in lane l at step k,
 * the player can still get through". Stays put when that is safe for the
 * next `decision` seconds, otherwise takes the move that keeps a way out.
 */
export function planMove(cars, speed, laneTime, lane, decision = 0.1) {
  const steps = Math.min(STEPS, Math.ceil(horizonFor(cars, speed) / FAIR.dt) + 1);
  fill(cars, speed, steps);
  const laneSteps = Math.ceil(laneTime / FAIR.dt);
  const leaveSteps = Math.ceil(laneSteps * 0.45);
  const enterSteps = Math.floor(laneSteps * 0.25);
  const canMove = (l, n, k) => {
    const end = Math.min(steps - 1, k + leaveSteps);
    for (let j = k; j <= end; j++) if (blocked[l][j]) return -1;
    for (let j = Math.min(end, k + enterSteps); j <= end; j++) if (blocked[n][j]) return -1;
    return end;
  };
  for (let l = 0; l < LANE_COUNT; l++) good[l][steps - 1] = blocked[l][steps - 1] ? 0 : 1;
  for (let k = steps - 2; k >= 0; k--) {
    for (let l = 0; l < LANE_COUNT; l++) {
      let g = 0;
      if (!blocked[l][k]) {
        if (good[l][k + 1]) g = 1;
        else {
          for (const n of [l - 1, l + 1]) {
            if (n < 0 || n >= LANE_COUNT) continue;
            const end = canMove(l, n, k);
            if (end > k && good[n][end]) g = 1;
          }
        }
      }
      good[l][k] = g;
    }
  }
  const dec = Math.min(steps - 1, Math.ceil(decision / FAIR.dt));
  let stayOk = good[lane][dec] === 1;
  for (let k = 0; k <= dec && stayOk; k++) if (blocked[lane][k]) stayOk = false;
  const freeRun = (l, from) => {
    let k = from;
    while (k < steps && !blocked[l][k]) k++;
    return k;
  };
  const ownFree = freeRun(lane, 0);
  // stay while the lane is clear for a while; when it's about to close,
  // move early to a lane that's clear for longer instead of cutting it fine
  if (stayOk && ownFree * FAIR.dt > 1.0) return 0;
  let best = 0;
  let bestFree = stayOk ? ownFree : -1;
  for (const n of [lane - 1, lane + 1]) {
    if (n < 0 || n >= LANE_COUNT) continue;
    const end = canMove(lane, n, 0);
    if (end < 0 || !good[n][end]) continue;
    const free = freeRun(n, end);
    if (free > bestFree) {
      bestFree = free;
      best = n - lane;
    }
  }
  return best;
}

/** Is staying in / moving to `lane` safe for the planner? (coin chasing) */
export function laneSafe(lane) {
  return good[lane][0] === 1;
}
