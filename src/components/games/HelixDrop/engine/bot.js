/**
 * Helix Drop — steering bot. It only ever sets the tower's rotation target
 * (exactly what a drag does) and never touches the ball. Used by the menu
 * demo, the level validator and the endless test.
 *
 * Policy, re-decided every `react` seconds (a human-like reaction time):
 *   • bouncing on layer K       → put K's best gap under the ball
 *   • falling toward layer K+1  → mode "safe": land on the centre of its
 *                                  widest safe sector (no streak chaining)
 *                                  mode "drop": keep going through its gap
 * With opts.rotCap < 1 the tower turns slower than a player can turn it.
 */
import { PHYS, TAU, norm } from "./constants.js";
import { layerOffset, classify } from "./sim.js";

const wrapPi = (a) => {
  a = norm(a);
  return a > Math.PI ? a - TAU : a;
};

/** Seconds until the ball bottom reaches height y (descending), or null. */
export function timeToY(ball, y) {
  const h = ball.y - PHYS.BALL_R - y;
  const disc = ball.vy * ball.vy + 2 * PHYS.G * h;
  if (disc < 0) return null;
  return (ball.vy + Math.sqrt(disc)) / PHYS.G;
}

export class Bot {
  constructor(opts = {}) {
    this.mode = opts.mode || "safe";
    this.react = opts.react ?? 0.12;
    this.next = 0;
    this.goal = null;
  }

  /** Call before each sim.step(). */
  drive(sim) {
    if (sim.status !== "play") return;
    if (sim.t >= this.next) {
      this.next = sim.t + this.react;
      this.goal = this.decide(sim);
    }
    if (this.goal != null) sim.target = sim.rot + wrapPi(this.goal - sim.rot);
  }

  decide(sim) {
    const b = sim.ball;
    const bottom = b.y - PHYS.BALL_R;
    const L = sim.layers.find((l) => !l.passed && !l.destroyed && l.y <= bottom + 1e-6);
    if (!L || L.finish) return null;
    const onIt = sim.lastLayer === L.idx;
    const T = timeToY(b, L.y) ?? 0.4;
    const tc = sim.t + T;
    const off = layerOffset(L, tc);
    const reach = sim.rotCap * Math.max(0, T - 0.02); // how far the tower can still turn before contact
    const margin = 0.22; // stay this far (rad) inside a sector's edges
    // candidate aim points: inside each sector, as close to the current angle as possible
    const phiNow = norm(PHYS.BALL_ANGLE + sim.rot);
    const cands = [];
    for (const s of L.sectors) {
      const len = s.a1 - s.a0;
      if (len < margin * 2 + 0.05) continue;
      const lo = s.a0 + off + margin;
      const hi = s.a1 + off - margin;
      // nearest point of [lo, hi] to phiNow (on the circle)
      const d = wrapPi(phiNow - (lo + hi) / 2);
      const half = (hi - lo) / 2;
      const aim = (lo + hi) / 2 + Math.max(-half, Math.min(half, d));
      const need = Math.abs(wrapPi(aim - phiNow));
      cands.push({ type: s.type, aim, need, len });
    }
    const wantGap = onIt || this.mode === "drop";
    // resting on a ring: choose WHERE inside the gap to drop, by what lies below
    // (a player drops through the part of the gap that lands on safe ground)
    if (wantGap) {
      const N = sim.layers.find((l) => l.idx > L.idx && !l.destroyed);
      const land = sim.t + T + 0.24;
      let best = null;
      for (const c of cands) {
        if (c.type !== "gap") continue;
        const s = L.sectors.find((x) => c.aim - off >= x.a0 - 1e-9 && c.aim - off <= x.a1 + 1e-9) || null;
        void s;
      }
      for (const sct of L.sectors) {
        if (sct.type !== "gap") continue;
        const lo = sct.a0 + off + margin;
        const hi = sct.a1 + off - margin;
        for (let k = 0; k <= 16; k++) {
          const aim = lo + ((hi - lo) * k) / 16;
          // follow the drop down through aligned gaps to where it will really land
          let below = "gap";
          let worst = 0;
          let M = N;
          let tl = land;
          for (let hop = 0; hop < 5 && M && !M.finish; hop++) {
            const w = 0.2 + hop * 0.08;
            for (const dd of [-w, -w / 2, 0, w / 2, w]) {
              const ty = classify(M, norm(aim + dd), tl);
              if (ty === "danger") worst = Math.max(worst, dd === 0 ? 2 : 1);
              if (dd === 0 && hop === 0) below = ty;
            }
            if (worst || classify(M, norm(aim), tl) !== "gap") break;
            M = sim.layers.find((l) => l.idx > M.idx && !l.destroyed);
            tl += 0.17;
          }
          const need = Math.abs(wrapPi(aim - phiNow));
          if (!onIt && need > reach) continue; // cannot get there before contact
          const pref = this.mode === "drop" ? (below === "gap" ? 0 : 1) : below === "gap" ? 1 : 0;
          const score = worst * 100 + pref * 3 + need * 0.2;
          if (!best || score < best.score) best = { aim, score };
        }
      }
      if (best && (onIt || best.score < 100)) return best.aim - PHYS.BALL_ANGLE;
    }
    const rank = (c) => {
      const feasible = c.need <= reach || onIt; // resting on a layer: time is not a constraint
      let score = feasible ? 0 : 100;
      if (c.type === "danger") score += 1000;
      if (wantGap) score += c.type === "gap" ? 0 : 10;
      else score += c.type === "gap" ? 10 : 0;
      return score + c.need * 0.1 - c.len * 0.01;
    };
    cands.sort((a, b2) => rank(a) - rank(b2));
    const pick = cands[0];
    if (!pick || pick.type === "danger") return null;
    return pick.aim - PHYS.BALL_ANGLE;
  }
}

/**
 * Play a level to the end with the bot. Returns
 * { ok, status, time, maxStreak, smashes, deaths:[layer] }.
 */
export function playLevel(SimClass, level, opts = {}) {
  const sim = new SimClass(level, { rotCap: opts.rotCap ?? 1 });
  const bot = new Bot(opts);
  const maxT = opts.maxT ?? 180;
  while (sim.status === "play" && sim.t < maxT) {
    bot.drive(sim);
    sim.step();
    sim.events.length = 0;
  }
  return {
    ok: sim.status === "finished",
    status: sim.status,
    time: sim.endAt || sim.t,
    maxStreak: sim.stats.maxStreak,
    smashes: sim.stats.smashes,
    deathLayer: sim.status === "dead" ? sim.lastLayer + 1 : null,
    sim,
  };
}
