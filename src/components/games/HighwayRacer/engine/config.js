/**
 * Highway Racer — every gameplay number in one place.
 *
 * World units are metres. The player car sits at z = 0 and drives toward -Z;
 * the road, traffic, pickups and props scroll toward +Z (the camera). Speeds
 * are metres per second; the HUD shows km/h (× 3.6), so the numbers on screen
 * stay internally consistent with how fast the road actually moves.
 */
export const LANE_COUNT = 3;
export const LANE_WIDTH = 3.2;
export const LANES = [-LANE_WIDTH, 0, LANE_WIDTH];
export const ROAD_HALF = LANE_WIDTH * 1.5; // outer edge of the outer lanes
export const SHOULDER = 1.6; // paved strip outside the edge line
export const RAIL_X = ROAD_HALF + SHOULDER + 0.35;

export const KMH = 3.6;

/** Fixed simulation step: deterministic, and too small to tunnel through a car. */
export const STEP = 1 / 120;
/** Longest real frame we accept (tab stalls / debugger pauses never jump the world). */
export const MAX_FRAME = 0.05;

export const COUNTDOWN = 3.0; // 3 · 2 · 1, then GO
export const CRASH_TIME = 1.35; // CRASHED → RESULT

/* --------------------------------------------------------------- speed */
export const SPEED = {
  start: 27.8, // 100 km/h
  launch: 1.6, // seconds from 0 to start speed after GO
  /** cruise target = start → car top speed, by play time: 0-30 s easy,
   *  30-60 moderate, 60-120 fast, 120 s+ high intensity, then capped */
  ramp: [
    [0, 0],
    [30, 0.24],
    [60, 0.48],
    [120, 0.8],
    [200, 1],
  ],
  accel: 3.2, // m/s² toward the cruise target
  boostMul: 1.32,
  boostAccel: 22,
  hardCap: 82, // absolute ceiling even with boost (295 km/h)
};

/* --------------------------------------------------------------- player */
export const PLAYER = {
  halfWidth: 0.86, // visual ≈ 0.95 — slightly forgiving
  halfLength: 1.95, // visual ≈ 2.15
  /** lane change ≈ 250-450 ms; handling stat picks a point in this range */
  laneTimeSlow: 0.43,
  laneTimeFast: 0.3,
};

/* --------------------------------------------------------------- traffic */
/** All traffic flows at one steady speed. Cars never catch each other, the
 *  gaps the spawner validated never drift shut, and the player reads every
 *  gap at the same closing speed. (Lanes drifting at different speeds were
 *  tried first: gaps that were fair at spawn could close up later.) */
export const TRAFFIC_SPEED = 12.5;
export const LANE_SPEED = [TRAFFIC_SPEED, TRAFFIC_SPEED, TRAFFIC_SPEED];
export const SPAWN_AHEAD = 175; // metres ahead (inside fog — fades in)
export const DESPAWN_BEHIND = 18;
export const MAX_TRAFFIC = 18;
export const SAME_LANE_GAP = 9; // min bumper gap between cars in one lane

export const VEHICLES = {
  sedan: { halfWidth: 0.92, halfLength: 2.2, height: 1.45 },
  hatch: { halfWidth: 0.88, halfLength: 1.9, height: 1.5 },
  suv: { halfWidth: 0.98, halfLength: 2.35, height: 1.8 },
  van: { halfWidth: 1.0, halfLength: 2.55, height: 2.15 },
  truck: { halfWidth: 1.18, halfLength: 4.6, height: 3.1 },
};

/** Spawn rhythm: seconds between traffic groups, easing down with play time. */
export const DENSITY = [
  [0, 2.6],
  [30, 2.0],
  [60, 1.55],
  [120, 1.2],
  [200, 1.0],
];

/* --------------------------------------------------------------- fairness */
export const FAIR = {
  dt: 0.04,
  /** extra metres around every car the planner treats as blocked */
  margin: 1.2,
  /** the spawner plans for a human: wider margins, slower lane changes */
  spawnMargin: 3.0,
  humanLaneTime: 1.3,
  /** the player needs this long to see and react before the first input */
  reaction: 0.35,
};

/* --------------------------------------------------------------- pickups */
export const COIN = { radius: 0.75, value: 1, score: 50, spacing: 7 };
export const BOOST_PICKUP = { radius: 0.9, fill: 0.35 };
export const MAX_COINS = 40;
export const MAX_BOOST_PICKUPS = 3;

/* --------------------------------------------------------------- near miss / combo */
export const NEAR = {
  gap: 0.9, // lateral clearance (between bodies) that counts as close
  score: 100,
  comboWindow: 3.0,
  comboMax: 4,
  boostFill: 0.12,
};

/* --------------------------------------------------------------- boost */
export const BOOST = {
  baseDuration: 2.4, // + 0.3 s per boost-stat point
  perStat: 0.3,
  distanceFill: 1 / 1400, // meter fills per metre driven
};

/* --------------------------------------------------------------- score */
export const SCORE = {
  perMetre: 1,
  /** up to +100 % distance points at top speed */
  speedBonus: 1.0,
};

export function lerpTable(table, x) {
  if (x <= table[0][0]) return table[0][1];
  for (let i = 1; i < table.length; i++) {
    const [x1, y1] = table[i];
    if (x <= x1) {
      const [x0, y0] = table[i - 1];
      return y0 + ((y1 - y0) * (x - x0)) / (x1 - x0);
    }
  }
  return table[table.length - 1][1];
}

export const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
