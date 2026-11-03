/**
 * Route bot for tests: walks the real player controller (game.update with
 * key-style input) to every note via the walk-grid flow field, aims the
 * camera at each note, presses E, then walks out through the gate.
 */
import { flowField, flowAhead, cellOf, lineBlocked, LAYOUT } from "../sim.js";
import { GATE } from "../data.js";

export function createBot(g, { order, evade = false } = {}) {
  let flee = null, fleeField = null, fleeT = 0;
  const queue = (order || nearestOrder(g)).slice();
  let goal = null, field = null, phase = "walk", aimT = 0;
  const pickGoal = () => {
    if (queue.length) {
      const n = g.notes[queue[0]];
      goal = { x: n.stand.x, z: n.stand.z, note: n };
    } else goal = { x: GATE.x, z: GATE.z + 3, gate: true };
    field = flowField(cellOf(goal.x, goal.z));
    phase = "walk";
  };
  pickGoal();
  return function step() {
    const P = g.player;
    const M = g.monster;
    const inp = {};
    // evasive mode: when the creature is hunting nearby, run for a far nav point
    if (evade && (M.mode === "chase" || M.mode === "stalk") && M.dist < 24 && (M.mode === "chase" || M.visible)) {
      fleeT--;
      if (!flee || fleeT <= 0 || Math.hypot(flee.x - P.x, flee.z - P.z) < 2) {
        let best = null, bs = -Infinity;
        for (const n of LAYOUT.nav) {
          const dp = Math.hypot(n.x - P.x, n.z - P.z), dm = Math.hypot(n.x - M.x, n.z - M.z);
          if (dp < 8 || dp > 40) continue;
          // away from the creature: the nav point must not be on its side
          const ax = (n.x - P.x) / dp, az = (n.z - P.z) / dp;
          const mx = (M.x - P.x) / (M.dist || 1), mz = (M.z - P.z) / (M.dist || 1);
          const sc = dm - dp * 0.5 - (ax * mx + az * mz) * 20;
          if (sc > bs) {
            bs = sc;
            best = n;
          }
        }
        flee = best;
        fleeField = best ? flowField(cellOf(best.x, best.z)) : null;
        fleeT = 90;
      }
      if (flee) {
        const t = flowAhead(fleeField, P.x, P.z, 4);
        P.yaw = Math.atan2(-(t.x - P.x), -(t.z - P.z));
        inp.f = true;
        inp.sprint = true;
        phase = phase === "aim" ? "walk" : phase;
        return inp;
      }
    } else if (flee) {
      flee = null;
      field = flowField(cellOf(goal.x, goal.z));
    }
    if (phase === "walk") {
      const d = Math.hypot(goal.x - P.x, goal.z - P.z);
      if (d < 0.45) {
        if (goal.gate) phase = "exit";
        else {
          phase = "aim";
          aimT = 0;
        }
      } else {
        let t = flowAhead(field, P.x, P.z, 4);
        if (d < 3 && !lineBlocked(P.x, P.z, goal.x, goal.z)) t = goal;
        P.yaw = Math.atan2(-(t.x - P.x), -(t.z - P.z));
        inp.f = true;
        inp.sprint = P.stamina > 40;
      }
    } else if (phase === "aim") {
      const n = goal.note;
      P.yaw = Math.atan2(-(n.x - P.x), -(n.z - P.z));
      P.pitch = Math.atan2(n.y - P.y, Math.hypot(n.x - P.x, n.z - P.z));
      aimT++;
      if (g.aim === n.i) {
        g.interact();
        queue.shift();
        pickGoal();
      } else if (aimT > 30) return { stuck: `cannot aim at note ${n.i} (${n.place})` };
    } else if (phase === "exit") {
      P.yaw = Math.atan2(-(GATE.x - P.x), -(GATE.z - 2 - P.z));
      inp.f = true;
    }
    return inp;
  };
}

export function nearestOrder(g) {
  const left = g.notes.map((n) => n.i);
  const out = [];
  let x = g.player.x, z = g.player.z;
  while (left.length) {
    left.sort((a, b) => Math.hypot(g.notes[a].x - x, g.notes[a].z - z) - Math.hypot(g.notes[b].x - x, g.notes[b].z - z));
    const i = left.shift();
    out.push(i);
    x = g.notes[i].x;
    z = g.notes[i].z;
  }
  return out;
}
