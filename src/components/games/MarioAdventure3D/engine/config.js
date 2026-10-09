/**
 * Mario Adventure 3D — gameplay tuning. Units are metres-ish: Mario is ~1.5
 * tall, a walk is 6.5 u/s, a sprint 10.5 u/s.
 *
 * Jump numbers were picked so the level kit's spacing rules hold:
 *   single jump  ≈ 2.7 high, ≈ 4.5 far at walk / ≈ 7 far sprinting
 *   double jump  ≈ +2.3 high on top of the first
 * (tools/simTest.mjs measures these and fails if they drift.)
 */
export const STEP = 1 / 120; // fixed physics step (s)
export const MAX_STEPS = 12; // per rendered frame (≈ 0.1 s) — no spiral of death

export const P = {
  RADIUS: 0.42,
  HEIGHT: 1.5,
  STEP_UP: 0.42, // climbs ledges/stairs this tall without jumping
  SNAP_DOWN: 0.38, // keeps the feet glued walking down slopes / off small steps
  WALK: 6.5,
  RUN: 10.5,
  ACCEL: 46,
  DECEL: 54,
  TURN_DECEL: 70, // pressing against the current velocity
  AIR_ACCEL: 24,
  AIR_DRAG: 2.5,
  ICE_ACCEL: 9,
  ICE_DECEL: 2.6,
  GRAVITY_UP: 36,
  GRAVITY_DOWN: 54,
  GRAVITY_CUT: 88, // jump released early → short hop
  MAX_FALL: 32,
  JUMP_V: 14,
  DOUBLE_V: 12.6,
  STOMP_V: 12.5,
  STOMP_V_HELD: 16,
  SPRING_V: 22,
  COYOTE: 0.12,
  BUFFER: 0.15,
  LAND_TIME: 0.16,
  HURT_TIME: 0.5,
  INVULN: 1.8,
  MAX_SLOPE: 1.15, // rise/run a slope can be walked up (≈ 49°)
  SLIDE_SLOPE: 0.95, // steeper than this slides you down
  TURN_RATE: 14, // facing slerp (1/s)
  HEARTS: 3,
};

export const CAM = {
  DIST: 7.4,
  DIST_MIN: 4.6,
  DIST_MAX: 11,
  MIN_DIST: 1.4,
  PIVOT_H: 1.55, // aim just above the shoulders
  PITCH_MIN: -0.32, // looking up
  PITCH_MAX: 1.12, // looking down
  PITCH_DEFAULT: 0.3,
  PAD: 0.3,
  SENS: 0.0026,
  RETURN: 3.2,
  FOV: 60,
};

export const POWER = {
  speed: { name: "Speed Boost", dur: 10, color: "#38b6ff" },
  jump: { name: "Higher Jump", dur: 12, color: "#4cd964" },
  star: { name: "Invincibility", dur: 8, color: "#ffd23a" },
  magnet: { name: "Coin Magnet", dur: 12, color: "#c06cff" },
};
export const POWER_IDS = Object.keys(POWER);
export const SPEED_MUL = 1.42;
export const JUMP_MUL = 1.28;
export const MAGNET_R = 9;

export const ENEMY = {
  walker: { r: 0.55, h: 1.0, speed: 1.9, chase: 3.4, sense: 9, hp: 1, stomp: true },
  jumper: { r: 0.55, h: 1.0, speed: 0, chase: 4.2, sense: 10, hp: 1, stomp: true },
  flyer: { r: 0.6, h: 0.8, speed: 2.4, chase: 6.5, sense: 11, hp: 1, stomp: true },
  armored: { r: 0.65, h: 1.15, speed: 1.6, chase: 2.8, sense: 8, hp: 2, stomp: true },
  fast: { r: 0.6, h: 1.0, speed: 3, chase: 12.5, sense: 13, hp: 1, stomp: true },
};
export const ENEMY_TYPES = Object.keys(ENEMY);

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const damp = (a, b, k, dt) => a + (b - a) * (1 - Math.exp(-k * dt));
export const lerp = (a, b, t) => a + (b - a) * t;
export function wrapAngle(a) {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}
export function dampAngle(a, b, k, dt) {
  return a + wrapAngle(b - a) * (1 - Math.exp(-k * dt));
}
export const smooth = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));
