/**
 * Shadow Arena — arcade opponent AI.
 *
 * The AI produces the same input structure a keyboard player does and goes
 * through the same move rules, cooldowns and buffers. It never reads the
 * opponent's inputs: it only sees the opponent (and their projectiles) as
 * they looked `react` frames ago, so its reaction time is a real delay, and
 * it only re-plans every `think` frames. Difficulty `d` (0…1) scales those
 * delays and how often it guards, attacks and uses its special.
 */
import { NO_INPUT } from "./fight.js";

export function aiParams(d) {
  return {
    d,
    react: Math.round(30 - 18 * d), // perception delay (frames): 30 → 12
    think: Math.round(26 - 16 * d), // frames between decisions: 26 → 10
    block: 0.1 + 0.5 * d, // chance to guard an attack it sees coming
    preGuard: 0.04 + 0.12 * d, // chance to guard pre-emptively up close
    aggro: 0.28 + 0.47 * d, // chance to swing when in range
    special: 0.12 + 0.28 * d,
    antiProj: 0.2 + 0.55 * d, // chance to block/jump an incoming projectile
    jump: 0.05 + 0.05 * d,
    retreat: 0.16 - 0.06 * d,
    whiff: 0.32 - 0.26 * d, // chance a swing is thrown from a bad distance
  };
}

export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function createAI(params, seed = 1) {
  return { p: params, rng: mulberry32(seed), hist: [], wait: 0, move: 0, moveT: 0, guardT: 0, seenAtk: null, seenProj: new Set(), jumpQ: false };
}

const snap = (m, o) => ({
  x: o.x,
  y: o.y,
  state: o.state,
  atk: o.atk ? { name: o.atk.name, t: o.atk.t, move: o.atk.move, id: o.atk.id } : null,
  projs: m.projs.filter((p) => p.owner === o.side).map((p) => ({ x: p.x, vx: p.vx, id: p.id })),
});

/** preferred distance band for this fighter's special */
function specialRange(def) {
  switch (def.moves.special.kind) {
    case "projectile": return [190, 900];
    case "dash": return [110, 260];
    case "spin": return [0, 95];
    default: return def.id === "thunder" ? [70, 210] : [0, 115];
  }
}

const reach = (def, name) => def.moves[name].box.x1 * def.scale;

/** one tick of AI input for fighter `side` */
export function aiInput(ai, m, side) {
  const me = m.f[side];
  const op = m.f[1 - side];
  ai.hist.push(snap(m, op));
  if (ai.hist.length > 60) ai.hist.shift();
  if (m.phase !== "fight") {
    ai.guardT = 0;
    ai.move = 0;
    return NO_INPUT;
  }
  const P = ai.p;
  const r = ai.rng;
  const seen = ai.hist[Math.max(0, ai.hist.length - 1 - P.react)];
  const dx = seen.x - me.x;
  const dist = Math.abs(dx);
  const toward = dx >= 0 ? 1 : -1;
  const out = { ...NO_INPUT };
  const press = (k) => (out[k] = true);
  const walk = (dir) => {
    if (dir > 0) out.r = true;
    else if (dir < 0) out.l = true;
  };

  // --- defence: react to what it saw
  if (seen.atk && seen.atk.id !== ai.seenAtk) {
    ai.seenAtk = seen.atk.id;
    const mv = seen.atk.move;
    const threatR = (mv.box ? mv.box.x1 * op.def.scale : 0) + 40;
    const left = mv.startup + mv.active - seen.atk.t;
    if (mv.kind !== "projectile" && dist < threatR && left > -2 && r() < P.block) ai.guardT = Math.max(8, left + 8);
  }
  for (const p of seen.projs) {
    if (ai.seenProj.has(p.id)) continue; // each projectile is judged once
    const coming = Math.sign(p.vx) === Math.sign(me.x - p.x);
    const gap = Math.abs(me.x - p.x);
    if (!coming || gap > 320) continue;
    ai.seenProj.add(p.id);
    if (r() < P.antiProj) {
      if (r() < 0.35 && gap > 120) ai.jumpQ = true;
      else ai.guardT = Math.ceil(gap / Math.abs(p.vx)) + 10;
    }
  }
  if (ai.seenProj.size > 30) ai.seenProj = new Set([...ai.seenProj].slice(-10));

  if (ai.guardT > 0) {
    ai.guardT--;
    out.block = true;
    return out;
  }
  if (ai.jumpQ) {
    ai.jumpQ = false;
    press("jump");
    walk(toward);
    return out;
  }

  // --- offence / movement, re-planned every `think` frames
  if (ai.moveT > 0) ai.moveT--;
  if (ai.wait > 0) ai.wait--;
  else {
    ai.wait = P.think + Math.floor(r() * 6);
    const pr = reach(me.def, "punch");
    const kr = reach(me.def, "kick");
    const [s0, s1] = specialRange(me.def);
    const busy = me.state === "attack";
    const lowHp = me.hp / me.maxHp < 0.3;
    if (!busy && me.cd === 0 && dist >= s0 && dist <= s1 && r() < P.special) {
      press("special");
    } else if (!busy && dist < pr + 6 && r() < P.aggro) {
      press(r() < 0.45 ? "kick" : "punch");
    } else if (!busy && dist < kr + 4 && r() < P.aggro) {
      press("kick");
    } else if (!busy && dist < kr + 60 && r() < P.whiff * 0.5) {
      press(r() < 0.5 ? "kick" : "punch"); // a mistimed swing
    } else if (dist < 120 && r() < P.preGuard) {
      ai.guardT = P.think;
    } else if (r() < P.jump && dist > 140 && dist < 330) {
      press("jump");
      ai.move = toward;
      ai.moveT = 4;
    } else if (r() < P.retreat * (lowHp ? 2 : 1) && dist < 260) {
      ai.move = -toward;
      ai.moveT = P.think;
    } else if (dist > pr - 10) {
      ai.move = toward;
      ai.moveT = P.think + 4;
    } else {
      ai.move = r() < 0.5 ? 0 : -toward;
      ai.moveT = Math.ceil(P.think / 2);
    }
  }
  if (ai.moveT > 0) walk(ai.move);
  return out;
}
