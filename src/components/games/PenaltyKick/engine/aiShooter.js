/**
 * Penalty Kick — AI penalty taker. It produces the SAME kind of input the
 * player does ({aimX, aimY, power, curve}) and the ball then flies through the
 * SAME physics — no teleports, no guaranteed goals, no special AI ball.
 *
 * Choice: a preferred zone (weighted by the opponent's style, risk and score
 * pressure) → a point in it → EXECUTION error that shrinks with accuracy.
 * Awareness: if the (player) keeper has visibly committed before the strike,
 * a sharp taker switches to the other side at contact — dive too early and you
 * get punished.
 * Tells: the run-up angle and hip lean hint at the side, as honestly as the
 * opponent's `tell` value (0 = poker face, 1 = always honest).
 */
import { rng } from "./keeperAI.js";

const ZONES = {
  lowLeft: [-2.9, 0.35],
  lowRight: [2.9, 0.35],
  midLeft: [-2.7, 1.2],
  midRight: [2.7, 1.2],
  highLeft: [-3.05, 2.05],
  highRight: [3.05, 2.05],
  center: [0, 1.1],
  lowCenter: [0.3, 0.3],
  highCenter: [0, 2.05],
};

export const SHOOTER_DEFAULT = {
  accuracy: 0.6, // 0…1: execution precision
  power: 0.62, // preferred power
  curve: 0.15, // how much it curves shots
  risk: 0.3, // appetite for corners/high shots
  tell: 0.6, // honesty of the body language
  smart: 0.4, // chance to switch sides when the keeper leaves early
  spread: 1, // how wide it dares to go (×zone x); rookies stay nearer the keeper
  zones: { lowLeft: 1, lowRight: 1, midLeft: 1, midRight: 1, highLeft: 0.4, highRight: 0.4, center: 0.35 },
};

export class AIShooter {
  constructor(stats = {}, seed = 7, pressure = 0) {
    this.s = { ...SHOOTER_DEFAULT, ...stats, zones: { ...SHOOTER_DEFAULT.zones, ...(stats.zones || {}) } };
    this.r = rng(seed);
    this.pressure = pressure; // 0…1 (sudden death / must-score)
    this.plan = this.pick();
    // body language: honest with probability `tell`, otherwise shows the other side
    const honest = this.r() < this.s.tell;
    const side = Math.sign(this.plan.aimX) || 1;
    this.lean = (honest ? side : -side) * (0.45 + this.r() * 0.5);
    this.approach = 18 + this.r() * 22;
  }

  pick() {
    const s = this.s;
    const entries = Object.entries(s.zones).map(([k, w]) => {
      const [x, y] = ZONES[k];
      // risky zones scale with risk; pressure pulls a little toward safer zones
      const riskW = y > 1.8 || Math.abs(x) > 3 ? s.risk * 1.6 + 0.2 : 1;
      return [k, w * riskW * (y > 1.8 ? 1 - this.pressure * 0.3 : 1)];
    });
    const total = entries.reduce((a, [, w]) => a + w, 0);
    let roll = this.r() * total;
    let zone = entries[0][0];
    for (const [k, w] of entries) {
      roll -= w;
      if (roll <= 0) {
        zone = k;
        break;
      }
    }
    const [zx, zy] = ZONES[zone];
    // execution error (never a teleport — just a slightly different strike)
    const err = (1 - s.accuracy) * (1 + this.pressure * 0.4);
    const aimX = zx * s.spread + (this.r() * 2 - 1) * 0.9 * err;
    const aimY = Math.max(0.15, zy + (this.r() * 2 - 1) * 0.55 * err);
    const power = Math.min(1, Math.max(0.2, s.power + (this.r() * 2 - 1) * 0.15));
    const curve = (this.r() * 2 - 1) * s.curve;
    return { zone, aimX, aimY, power, curve };
  }

  /**
   * Final strike at the moment of contact. `keeperCommitted` is what a real
   * taker can see: has the keeper already left early, and to which side?
   */
  strike(keeperCommitted) {
    let { aimX, aimY, power, curve } = this.plan;
    if (keeperCommitted && Math.sign(keeperCommitted.side) === Math.sign(aimX) && this.r() < this.s.smart) {
      aimX = -aimX * 0.92; // wrong-foot the early diver
    }
    return { aimX, aimY, power, curve };
  }
}
