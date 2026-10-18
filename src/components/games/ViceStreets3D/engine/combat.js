/**
 * Vice Streets 3D — hand-to-hand combat shared by the player and pedestrians.
 *
 * Every strike is a move with real timing: a wind-up, a short active window in
 * which its hitbox (a sphere at the fist / foot: `reach` m ahead of the hips,
 * `h` m up, radius `r`) is tested against bodies, then a recovery. A hit needs
 * the target inside that sphere, on the same level and in plain sight — so a
 * punch that visibly falls short never deals damage, and nothing hits through
 * walls. The player's light attacks chain jab → cross → left hook → right hook,
 * heavy attacks pick a straight / uppercut / heavy hook from the combo so far,
 * and kicks go front → side, or a finishing kick after two punches.
 *
 * Pedestrians that fight use the same moves against the player; one of them
 * strikes at a time (an attack token) so a crowd never lands a synchronised
 * volley, and fighters can block (guard up, facing the attacker) or step back.
 */
import { clamp, dist, headingOf, wrapA } from "./util.js";

/**
 * dmg: to NPCs (player attacks) · npcDmg: to the player (NPC attacks)
 * push: m/s shove · knock: always knocks down · knockback: long stagger shove
 * arm: −1 left / +1 right (animation) · step: forward weight shift (m)
 */
export const MOVES = {
  jab: { kind: "punch", arm: -1, dur: 0.32, hitAt: 0.11, active: 0.06, reach: 0.95, h: 1.45, r: 0.42, dmg: 8, npcDmg: 4, push: 1.6, cool: 0.02 },
  cross: { kind: "punch", arm: 1, dur: 0.36, hitAt: 0.13, active: 0.06, reach: 1.0, h: 1.45, r: 0.42, dmg: 11, npcDmg: 5, push: 2.2, cool: 0.03 },
  lhook: { kind: "hook", arm: -1, dur: 0.42, hitAt: 0.17, active: 0.07, reach: 0.78, h: 1.45, r: 0.55, dmg: 13, npcDmg: 6, push: 2.4, cool: 0.04 },
  rhook: { kind: "hook", arm: 1, dur: 0.44, hitAt: 0.18, active: 0.07, reach: 0.78, h: 1.45, r: 0.55, dmg: 15, npcDmg: 6, push: 2.8, cool: 0.22 },
  power: { kind: "power", arm: 1, dur: 0.66, hitAt: 0.32, active: 0.08, reach: 1.05, h: 1.45, r: 0.46, dmg: 26, npcDmg: 9, push: 5.8, knockback: true, heavy: true, cool: 0.22 },
  upper: { kind: "upper", arm: 1, dur: 0.6, hitAt: 0.29, active: 0.08, reach: 0.72, h: 1.5, r: 0.5, dmg: 28, npcDmg: 9, push: 3.4, knock: true, heavy: true, cool: 0.25 },
  hhook: { kind: "hhook", arm: 1, dur: 0.72, hitAt: 0.36, active: 0.09, reach: 0.82, h: 1.45, r: 0.66, dmg: 32, npcDmg: 10, push: 6.2, knock: true, heavy: true, sweep: 2, cool: 0.28 },
  fkick: { kind: "kick", arm: 0, dur: 0.6, hitAt: 0.28, active: 0.08, reach: 1.22, h: 0.95, r: 0.5, dmg: 16, npcDmg: 7, push: 4.2, knockback: true, cool: 0.12 },
  skick: { kind: "skick", arm: 0, dur: 0.64, hitAt: 0.31, active: 0.08, reach: 1.32, h: 1.05, r: 0.52, dmg: 18, npcDmg: 8, push: 5.2, knockback: true, cool: 0.15 },
  finisher: { kind: "finisher", arm: 0, dur: 0.72, hitAt: 0.35, active: 0.09, reach: 1.32, h: 1.1, r: 0.56, dmg: 25, npcDmg: 10, push: 6.8, knock: true, heavy: true, cool: 0.3 },
};
for (const [id, m] of Object.entries(MOVES)) m.id = id;
const LIGHT = ["jab", "cross", "lhook", "rhook"];
const PUNCHES = new Set(["jab", "cross", "lhook", "rhook", "power", "upper", "hhook"]);
/** a chain continues if the next input comes within this long after a move ends */
export const CHAIN = 0.8;
export const BODY_R = 0.28;

/** the player's next move from the input and the combo so far */
export function chooseMove(chain, input) {
  let lights = 0;
  for (let i = chain.length - 1; i >= 0 && LIGHT.includes(chain[i]); i--) lights++;
  const punches = chain.filter((m) => PUNCHES.has(m)).length;
  if (input === "kick") {
    if (punches >= 2) return "finisher";
    return chain[chain.length - 1] === "fkick" ? "skick" : "fkick";
  }
  if (input === "power") return "power";
  if (input === "heavy") return lights >= 2 ? "hhook" : lights === 1 ? "upper" : "power";
  return LIGHT[lights % LIGHT.length];
}

/** fist / foot position of a move for an attacker at (x, z) facing h */
export function strikePoint(a, M) {
  return { x: a.x + Math.sin(a.h) * M.reach, z: a.z + Math.cos(a.h) * M.reach, y: (a.y || 0) + M.h };
}

/** can the strike sphere touch this body? (same level, inside the sphere, in sight) */
export function inStrike(sim, a, M, t) {
  if (!t || t.dead || t.hidden || t.inCar) return false;
  const P = strikePoint(a, M);
  const d = dist(P.x, P.z, t.x, t.z);
  if (d > M.r + BODY_R) return false;
  // in front of the attacker, not behind
  if ((t.x - a.x) * Math.sin(a.h) + (t.z - a.z) * Math.cos(a.h) < -0.1) return false;
  const dy = Math.abs((t.y || 0) - (a.y || 0));
  if (dy > 0.9) return false;
  return !sim.col.segBlocked(a.x, a.z, (a.y || 0) + 1.25, t.x, t.z, (t.y || 0) + 1.25);
}

/** begin a move (no-op while another is running) */
export function startMove(sim, a, id, isPlayer) {
  const M = MOVES[id];
  a.atk = { id, t: 0, hit: new Set(), done: false };
  a.anim.punch = { k: 0, move: id, arm: M.arm };
  sim.emit({ type: "swing", heavy: !!M.heavy, kick: M.arm === 0, x: a.x, z: a.z, player: isPlayer, move: id });
  if (isPlayer) sim.peds.incoming(a, M);
  return M;
}

/**
 * advance a running move; resolves hits in its active window.
 * targets(): the bodies this attacker can hit. Returns true when it ended.
 */
export function stepMove(sim, a, dt, isPlayer) {
  const k = a.atk;
  if (!k) return true;
  const M = MOVES[k.id];
  k.t += dt;
  if (a.anim.punch) a.anim.punch.k = Math.min(1, k.t / M.dur);
  if (k.t >= M.hitAt && k.t <= M.hitAt + M.active + dt * 0.5) {
    if (isPlayer) {
      const cands = [];
      for (const p of sim.peds.list) if (!k.hit.has(p) && inStrike(sim, a, M, p)) cands.push(p);
      for (const p of sim.police.foot) if (!k.hit.has(p) && inStrike(sim, a, M, p)) cands.push(p);
      const P = strikePoint(a, M);
      cands.sort((p, q) => dist(p.x, p.z, P.x, P.z) - dist(q.x, q.z, P.x, P.z));
      for (const p of cands.slice(0, Math.max(0, (M.sweep || 1) - k.hit.size))) {
        k.hit.add(p);
        hitPerson(sim, a, p, M);
      }
    } else {
      const pl = sim.player;
      if (!k.hit.has(pl) && pl.mode === "foot" && inStrike(sim, a, M, pl)) {
        k.hit.add(pl);
        hitPlayer(sim, a, M);
      }
    }
  }
  if (!k.done && k.t > M.hitAt + M.active) {
    k.done = true;
    if (!k.hit.size) sim.emit({ type: "punchMiss", x: a.x, z: a.z, heavy: !!M.heavy, player: isPlayer });
  }
  if (k.t >= M.dur) {
    a.atk = null;
    a.anim.punch = null;
    return true;
  }
  return false;
}

/** the player's strike lands on a pedestrian / officer */
export function hitPerson(sim, a, p, M) {
  const dx = p.x - a.x;
  const dz = p.z - a.z;
  const L = Math.hypot(dx, dz) || 1;
  // a raised guard facing the attacker soaks most of it; heavy blows break through
  const facing = Math.cos(wrapA(headingOf(-dx, -dz) - p.h)) > 0.3;
  let dmg = M.dmg;
  let blocked = false;
  let broke = false;
  if (p.blocking && facing && !p.dead) {
    if (M.heavy) {
      dmg *= 0.5;
      broke = true;
      p.blocking = 0;
    } else {
      dmg *= 0.2;
      blocked = true;
    }
  }
  const cop = p.kind === "cop";
  let out;
  if (blocked) {
    p.hp -= dmg;
    out = p.hp <= 0 ? (sim.peds.kill(p, dx / L, dz / L, M.push), "dead") : "blocked";
    // pushed back a touch, guard stays up
    p.x += (dx / L) * 0.12;
    p.z += (dz / L) * 0.12;
    sim.pushPerson(p);
  } else {
    out = sim.peds.damage(p, dmg, { kind: M.kind, move: M.id, heavy: !!M.heavy, knock: !!M.knock, knockback: !!M.knockback || broke, fx: dx / L, fz: dz / L, speed: M.push, by: "player", side: M.arm });
  }
  sim.stats.punches = (sim.stats.punches || 0) + 1;
  sim.emit({ type: "punchHit", x: p.x, y: p.y || 0, z: p.z, heavy: !!M.heavy, kick: M.arm === 0, move: M.id, result: out, dx: dx / L, dz: dz / L, player: true, blocked });
  if (blocked) return out;
  sim.peds.violence(p.x, p.z, out === "dead" ? 3 : out === "down" ? 2 : 1, p, true);
  if (cop) sim.police.report(out === "dead" ? "copKilled" : "assaultCop", p.x, p.z);
  else sim.police.report(out === "dead" ? "murder" : out === "down" ? "seriousAssault" : "assault", p.x, p.z);
  return out;
}

/** a pedestrian's strike lands on the player */
export function hitPlayer(sim, a, M) {
  const pl = sim.player;
  const dx = pl.x - a.x;
  const dz = pl.z - a.z;
  const L = Math.hypot(dx, dz) || 1;
  sim.hurtPlayer(M.npcDmg, "fight");
  // flinch: an attack still winding up is interrupted
  if (pl.atk && pl.atk.t < MOVES[pl.atk.id].hitAt) {
    pl.atk = null;
    pl.anim.punch = null;
  }
  pl.hitStun = M.heavy ? 0.45 : 0.28;
  pl.anim.stagger = pl.hitStun;
  pl.vx = (dx / L) * M.push * 0.45;
  pl.vz = (dz / L) * M.push * 0.45;
  sim.emit({ type: "punchHit", x: pl.x, y: pl.y, z: pl.z, heavy: !!M.heavy, kick: M.arm === 0, move: M.id, onPlayer: true, dx: dx / L, dz: dz / L });
  // a finishing kick can put the player down
  if (M.knock && pl.hp > 0 && sim.rand() < 0.4 && pl.mode === "foot") {
    pl.mode = "down";
    pl.downT = 1.3;
    pl.anim.down = 1;
    pl.h = headingOf(-dx, -dz);
    pl.vx = (dx / L) * 3;
    pl.vz = (dz / L) * 3;
  }
}

export const isPunch = (id) => PUNCHES.has(id);
export { clamp };
