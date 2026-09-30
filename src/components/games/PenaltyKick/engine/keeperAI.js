/**
 * Penalty Kick — AI goalkeeper brain.
 *
 * FAIRNESS IS STRUCTURAL: think() only ever receives an OBSERVATION —
 *   { t, contactT, ball: { p, v, w } }  (ball fields exist only after contact)
 * It never sees the shooter's input, target, power or curve. It can only:
 *   • before contact: stay ready, shuffle, or GAMBLE (commit early on a guess —
 *     aggression), which a well-placed shot punishes;
 *   • after contact + reactionTime (+ hesitation): READ the ball's flight.
 * The read blends a naive straight-line extrapolation (ignores curve & drag)
 * with a true physics read (sees the spin), weighted by predictionSkill, plus a
 * reading error that shrinks with skill. The dive itself is the real Keeper
 * body — reach and dive time decide whether the gloves actually get there.
 *
 * Decisions use a seeded RNG supplied per shot, so a replayed shot behaves the
 * same, and nothing in it depends on where the player aimed.
 */
import { PK, clamp, lerp } from "./constants.js";
import { makeBall, stepBall } from "./physics.js";
import { KZ } from "./keeper.js";

export function rng(seed) {
  let a = seed >>> 0 || 1;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const KEEPER_DEFAULT = {
  reaction: 0.12, // s after contact before the keeper can act on what it sees
  prediction: 0.4, // 0 = rough read of the flight, 1 = perfect trajectory read
  hesitation: 0.08, // extra random delay up to this (s)
  centerBias: 0.25, // chance to hold the middle on a shot that isn't central
  aggression: 0.1, // chance to gamble early on a side before contact
  reach: 1,
  diveTime: 0.42,
  catch: 0.4, // 0…1: how hard a shot can be held instead of parried
};

/** Where will the ball cross the keeper's plane? (two readers) */
function readLinear(p, v) {
  if (v[2] >= -0.5) return null;
  const T = (p[2] - KZ) / -v[2];
  return [p[0] + v[0] * T, Math.max(PK.BALL_R, p[1] + v[1] * T - 0.5 * PK.G * T * T), T];
}
function readPhysics(p, v, w) {
  const b = makeBall(p);
  b.v = [...v];
  b.w = [...w];
  b.moving = true;
  for (let i = 0; i < 600; i++) {
    const p0 = b.p;
    stepBall(b, [], { free: true });
    if (b.p[1] < PK.BALL_R) b.p = [b.p[0], PK.BALL_R, b.p[2]];
    if (b.p[2] <= KZ) {
      const f = (p0[2] - KZ) / (p0[2] - b.p[2]);
      return [p0[0] + (b.p[0] - p0[0]) * f, p0[1] + (b.p[1] - p0[1]) * f, (i + f) * PK.DT];
    }
  }
  return null;
}

export class KeeperAI {
  constructor(stats = {}, seed = 1) {
    this.s = { ...KEEPER_DEFAULT, ...stats };
    this.r = rng(seed);
    // everything random about THIS shot is drawn up front, independent of the shot
    this.gamble = this.r() < this.s.aggression;
    this.gambleSide = this.r() < 0.5 ? -1 : 1;
    this.gambleHigh = this.r() < 0.3;
    this.hesitate = this.r() * this.s.hesitation;
    this.holdMiddle = this.r() < this.s.centerBias;
    this.errX = (this.r() * 2 - 1) * (1 - this.s.prediction) * 1.3;
    this.errY = (this.r() * 2 - 1) * (1 - this.s.prediction) * 0.6;
    this.decided = false;
    this.read = null;
  }

  /** Called every physics step with an observation; drives the Keeper body. */
  think(obs, keeper) {
    if (this.decided) return;
    const t = obs.t;
    if (obs.contactT == null) {
      // before the strike: a gambler may leave early (a pure guess)
      if (this.gamble && obs.runUp != null && obs.runUp > 0.9) {
        this.decided = true;
        keeper.diveTo(this.gambleSide * 2.6, this.gambleHigh ? 1.9 : 0.8, t);
      }
      return;
    }
    if (t < obs.contactT + this.s.reaction + this.hesitate) return;
    const { p, v, w } = obs.ball;
    const lin = readLinear(p, v);
    const phy = readPhysics(p, v, w);
    if (!lin && !phy) return;
    const k = this.s.prediction;
    const a = lin || phy;
    const b = phy || lin;
    const px = lerp(a[0], b[0], k) + this.errX;
    const py = clamp(lerp(a[1], b[1], k) + this.errY, 0.15, 2.4);
    this.read = [px, py];
    this.decided = true;
    const off = px - keeper.x;
    // a shot at the body: block; a shot away from the body: dive — unless the keeper freezes
    if (Math.abs(off) < 0.5 && py < 1.75) {
      keeper.diveTo(px, py, t);
      return;
    }
    if (this.holdMiddle && Math.abs(off) < 1.6) {
      keeper.diveTo(keeper.x + Math.sign(off) * 0.3, clamp(py, 0.6, 1.6), t);
      return;
    }
    keeper.diveTo(px, py, t);
  }
}
