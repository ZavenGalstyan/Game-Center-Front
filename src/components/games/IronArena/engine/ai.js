/**
 * Iron Arena — AI tank brains.
 *
 * Think (≈4 Hz, staggered): perceive enemies (range + line of sight, cloak),
 * pick a target, choose a movement goal for the mode/role (patrol, engage at
 * the weapon's preferred range, strafe, retreat to cover, CTF objectives),
 * path to it on the nav graph, and decide on abilities.
 *
 * Act (every step): follow the path with steering + feelers, avoid other
 * tanks, aim with lead/gravity compensation plus a human-like error that
 * settles over time, and only fire with a clear line of fire.
 *
 * Fairness: enemies are engaged only after a reaction delay, aim error never
 * reaches zero, turret speed limits apply exactly as for the player, and AI
 * tanks get no damage or health bonuses on any difficulty.
 */
import { clamp, wrap } from "./util.js";
import { muzzle, pivot } from "./tank.js";
import { segTank, tryAbility } from "./combat.js";
import { walk } from "./nav.js";

export const DIFF = {
  easy: { react: 1.05, err0: 0.075, err1: 0.03, settle: 2.2, lead: 0.45, detect: 85, tol: 1.7, ability: 0.3, retreat: 0.18, think: 0.36, burstPause: 0.9, cover: false },
  normal: { react: 0.6, err0: 0.05, err1: 0.016, settle: 1.6, lead: 0.78, detect: 115, tol: 1.25, ability: 0.7, retreat: 0.28, think: 0.28, burstPause: 0.35, cover: true },
  hard: { react: 0.34, err0: 0.035, err1: 0.008, settle: 1.1, lead: 0.95, detect: 150, tol: 1.0, ability: 1, retreat: 0.34, think: 0.22, burstPause: 0.1, cover: true },
};

const PREF_RANGE = { flame: 11, burst: 38, plasma: 45, clip: 45, shell: 62, he: 58, rail: 115 };
const tmp = { x: 0, y: 0, z: 0, dx: 0, dy: 0, dz: 0 };
const tmp2 = { x: 0, y: 0, z: 0 };

export function createBrain(t, M) {
  const D = DIFF[M.difficulty] || DIFF.normal;
  return {
    D,
    role: "free",
    path: null,
    pi: 0,
    goal: null,
    goalWhy: "",
    repathT: 0,
    thinkT: M.rand() * D.think,
    target: null,
    seen: new Map(),
    lastKnown: null,
    hitBy: null,
    aim: { ex: 0, ey: 0, ez: 0, mag: D.err0, tgt: -1, t0: 0, phase: M.rand() * 10 },
    strafe: M.rand() < 0.5 ? -1 : 1,
    strafeT: 0,
    hist: [],
    histT: 0,
    stuckT: 0,
    stuckN: 0,
    stuckWindow: 0,
    unstickT: 0,
    unstickSteer: 1,
    farT: 0,
    farPos: { x: t.x, z: t.z },
    holdT: 0,
    fireOk: false,
    fireCheckT: 0,
    triggerT: 0,
    mode: "patrol",
    reverse: false,
    abilityT: 1 + M.rand() * 2,
    avoid: new Map(),
  };
}

export function resetBrain(t, M) {
  const B = t.brain;
  if (!B) return;
  B.path = null;
  B.goal = null;
  B.target = null;
  B.seen.clear();
  B.hitBy = null;
  B.stuckT = 0;
  B.stuckN = 0;
  B.unstickT = 0;
  B.hist.length = 0;
  B.farT = 0;
  B.farPos = { x: t.x, z: t.z };
  B.mode = "patrol";
}

/* ------------------------------------------------------------------ helpers */
const eyeY = (o) => o.y + o.dims.top + 0.2;
function canSee(M, t, o) {
  return M.A.los(t.x, eyeY(t), t.z, o.x, o.y + o.dims.top * 0.75, o.z) || M.A.los(t.x, eyeY(t), t.z, o.x, o.y + o.dims.top + 0.3, o.z);
}
function nodeAt(M, x, z, y) {
  return M.nav.nearest(x, z, y);
}

function setGoal(M, t, x, z, y, why, force = false) {
  const B = t.brain;
  const lim = M.A.H - 9;
  x = clamp(x, -lim, lim);
  z = clamp(z, -lim, lim);
  if (!force && B.goal && Math.hypot(B.goal.x - x, B.goal.z - z) < 8 && B.path && M.clock - B.repathT < 6) {
    B.goalWhy = why;
    return;
  }
  const from = nodeAt(M, t.x, t.z, t.y);
  const to = nodeAt(M, x, z, y);
  // nodes where this bot recently got stuck cost extra, so it re-routes
  const now = M.clock;
  const avoid = B.avoid;
  const p = M.nav.path(from, to, avoid.size ? (n) => ((avoid.get(n.id) ?? -1) > now ? 160 : 0) : null);
  B.goal = { x, z, y, node: to };
  B.goalWhy = why;
  B.repathT = M.clock;
  if (p && p.length) {
    B.path = p;
    // skip the first node if we're already past it
    B.pi = p.length > 1 && Math.hypot(p[0].x - t.x, p[0].z - t.z) < 6 ? 1 : 0;
  } else {
    B.path = [{ x, z, y }];
    B.pi = 0;
  }
}

function randomGoal(M, t, bias) {
  const nodes = M.nav.good;
  let best = null;
  let bs = -Infinity;
  for (let k = 0; k < 10; k++) {
    const n = nodes[Math.floor(M.rand() * nodes.length)];
    if (n.water) continue;
    const d = Math.hypot(n.x - t.x, n.z - t.z);
    if (d < 25) continue;
    let s = M.rand() * 30 - Math.abs(d - 70) * 0.3;
    if (bias) s += bias(n);
    if (s > bs) {
      bs = s;
      best = n;
    }
  }
  return best || nodes[Math.floor(M.rand() * nodes.length)];
}

function coverNode(M, t, threat) {
  // a node 15–45 m away that the threat cannot see
  const nodes = M.nav.good;
  let best = null;
  let bs = Infinity;
  for (let k = 0; k < 26; k++) {
    const n = nodes[Math.floor(M.rand() * nodes.length)];
    const d = Math.hypot(n.x - t.x, n.z - t.z);
    if (d < 12 || d > 48 || n.water) continue;
    const dt = Math.hypot(n.x - threat.x, n.z - threat.z);
    if (dt < Math.hypot(t.x - threat.x, t.z - threat.z)) continue;
    if (M.A.los(threat.x, eyeY(threat), threat.z, n.x, n.y + 2.2, n.z)) continue;
    const s = d - dt * 0.2;
    if (s < bs) {
      bs = s;
      best = n;
    }
  }
  return best;
}

/* ------------------------------------------------------------------ think */
function perceive(M, t) {
  const B = t.brain;
  const D = B.D;
  let best = null;
  let bs = Infinity;
  const now = M.clock;
  for (const o of M.tanks) {
    if (!o.alive || !M.isEnemy(t, o)) continue;
    const d = Math.hypot(o.x - t.x, o.z - t.z, o.y - t.y);
    const cloaked = o.fx.cloak > 0 && d > 12;
    if (d > D.detect || cloaked) {
      if (B.seen.has(o.id) && now - B.seen.get(o.id).last > 2) B.seen.delete(o.id);
      continue;
    }
    if (!canSee(M, t, o)) {
      if (B.seen.has(o.id) && now - B.seen.get(o.id).last > 2) B.seen.delete(o.id);
      continue;
    }
    let rec = B.seen.get(o.id);
    if (!rec) {
      // reaction delay, shorter when we were just shot by this tank
      const react = D.react * (B.hitBy && B.hitBy.id === o.id && now - B.hitBy.t < 3 ? 0.5 : 1) * (0.8 + M.rand() * 0.4);
      rec = { first: now, ready: now + react, last: now };
      B.seen.set(o.id, rec);
    }
    rec.last = now;
    rec.x = o.x;
    rec.z = o.z;
    let s = d;
    if (B.hitBy && B.hitBy.id === o.id && now - B.hitBy.t < 4) s -= 35;
    if (o.carrying >= 0) s -= 60;
    s += (o.hp / o.stats.hp) * 25;
    if (B.target === o) s -= 15; // stickiness
    if (s < bs) {
      bs = s;
      best = o;
    }
  }
  if (best) {
    B.target = best;
    B.lastKnown = { x: best.x, z: best.z, y: best.y, t: now };
  } else if (B.target && (!B.target.alive || now - (B.seen.get(B.target.id)?.last ?? -9) > 1.5)) B.target = null;
}

function ctfGoal(M, t) {
  const B = t.brain;
  const my = M.flags[t.team];
  const en = M.flags[1 - t.team];
  const myHome = my.home;
  // carrying: run home (wait near base if our flag is gone)
  if (t.carrying >= 0) {
    if (my.state === "dropped" && Math.hypot(my.x - t.x, my.z - t.z) < 40) return setGoal(M, t, my.x, my.z, my.y, "return-own");
    return setGoal(M, t, myHome.x, myHome.z, myHome.y, "capture");
  }
  // our dropped flag nearby: everyone goes to return it
  if (my.state === "dropped" && (B.role !== "attack" || Math.hypot(my.x - t.x, my.z - t.z) < 45)) return setGoal(M, t, my.x, my.z, my.y, "return-own");
  if (my.state === "carried" && (B.role !== "attack" || Math.hypot(M.tanks[my.carrier].x - t.x, M.tanks[my.carrier].z - t.z) < 50)) {
    const c = M.tanks[my.carrier];
    return setGoal(M, t, c.x, c.z, c.y, "chase-carrier");
  }
  if (B.role === "defend") {
    if (B.target && Math.hypot(B.target.x - myHome.x, B.target.z - myHome.z) < 45) return; // engage handles it
    const a = M.clock * 0.07 + t.id;
    const towardMid = -Math.sign(myHome.z) || 1;
    return setGoal(M, t, myHome.x + Math.cos(a) * 18, myHome.z + towardMid * (14 + Math.sin(a) * 6), null, "guard");
  }
  if (en.state === "carried") {
    const c = M.tanks[en.carrier];
    // escort our carrier when close enough to help (stay a little ahead, toward home)
    if (c && c.team === t.team && Math.hypot(c.x - t.x, c.z - t.z) < 70) {
      const hx = myHome.x - c.x;
      const hz = myHome.z - c.z;
      const hl = Math.hypot(hx, hz) || 1;
      const side = t.id % 2 ? 1 : -1;
      return setGoal(M, t, c.x + (hx / hl) * 10 + (-hz / hl) * 7 * side, c.z + (hz / hl) * 10 + (hx / hl) * 7 * side, c.y, "escort");
    }
  }
  return setGoal(M, t, en.x, en.z, en.y, "take-flag");
}

function think(M, t) {
  const B = t.brain;
  const D = B.D;
  perceive(M, t);
  const w = t.stats.weapon;
  const hpF = t.hp / t.stats.hp;
  const T = B.target;
  const ctf = M.mode.id === "ctf";
  const objective = ctf && (t.carrying >= 0 || B.role === "attack");

  // retreat to cover when badly hurt (not while carrying the flag)
  const canRepair = t.stats.ability === "repair" && t.ab.cd <= 0;
  if (D.cover && T && hpF < D.retreat && !canRepair && t.carrying < 0 && B.mode !== "retreat") {
    const c = coverNode(M, t, T);
    if (c) {
      B.mode = "retreat";
      B.holdT = M.clock + 9;
      setGoal(M, t, c.x, c.z, c.y, "cover", true);
    }
  }
  if (B.mode === "retreat") {
    const arrived = B.goal && Math.hypot(B.goal.x - t.x, B.goal.z - t.z) < 5;
    const enemyClose = T && Math.hypot(T.x - t.x, T.z - t.z) < 22;
    if (hpF > 0.65 || enemyClose || M.clock > B.holdT + (arrived ? 6 : 0)) B.mode = "patrol";
    else {
      useAbilities(M, t);
      return;
    }
  }

  // CTF: movement follows the objective (runners fight on the move); only
  // defenders break off to engage enemies that come near their base
  let fightMove = !!T;
  if (ctf) {
    ctfGoal(M, t);
    const home = M.flags[t.team].home;
    const objectiveGoal = ["take-flag", "capture", "return-own", "chase-carrier", "escort"].includes(B.goalWhy);
    fightMove = !!T && !objective && !objectiveGoal && Math.hypot(T.x - home.x, T.z - home.z) < 55;
    if (T) B.mode = "engage";
  }
  if (fightMove) {
    B.mode = "engage";
    const d = Math.hypot(T.x - t.x, T.z - t.z);
    const pref = PREF_RANGE[w.kind] || 55;
    if (d > pref * 1.3) setGoal(M, t, T.x, T.z, T.y, "close-in");
    else if (d < pref * 0.55 && w.kind !== "flame") {
      // back off along the line away from the target
      const ux = (t.x - T.x) / (d || 1);
      const uz = (t.z - T.z) / (d || 1);
      setGoal(M, t, t.x + ux * 22, t.z + uz * 22, t.y, "back-off");
    } else {
      // strafe around the target
      if (M.clock > B.strafeT) {
        B.strafeT = M.clock + 2.5 + M.rand() * 3;
        B.strafe = -B.strafe;
      }
      const ux = (t.x - T.x) / (d || 1);
      const uz = (t.z - T.z) / (d || 1);
      const px = -uz * B.strafe;
      const pz = ux * B.strafe;
      const r = Math.min(pref, d);
      setGoal(M, t, T.x + ux * r + px * 16, T.z + uz * r + pz * 16, t.y, "strafe");
    }
  } else if (!ctf) {
    B.mode = T ? "engage" : "patrol";
    const arrived = !B.goal || Math.hypot(B.goal.x - t.x, B.goal.z - t.z) < 8 || !B.path || B.pi >= B.path.length;
    if (B.lastKnown && M.clock - B.lastKnown.t < 12 && B.goalWhy !== "hunt") setGoal(M, t, B.lastKnown.x, B.lastKnown.z, B.lastKnown.y, "hunt", true);
    else if (B.hitBy && M.clock - B.hitBy.t < 5 && B.goalWhy !== "investigate") setGoal(M, t, B.hitBy.x, B.hitBy.z, null, "investigate", true);
    else if (arrived || M.clock - B.repathT > 25) {
      // team modes: drift toward the enemy half / allies; DM: roam
      let bias = null;
      if (M.mode.teams) {
        const ez = M.bases[1 - t.team].z;
        bias = (n) => -Math.abs(n.z - (ez * 0.25 + M.rand() * ez * 0.4)) * 0.6;
      }
      const n = randomGoal(M, t, bias);
      setGoal(M, t, n.x, n.z, n.y, "patrol", true);
    }
  }
  useAbilities(M, t);
}

function useAbilities(M, t) {
  const B = t.brain;
  if (t.ab.cd > 0 || M.clock < B.abilityT) return;
  const D = B.D;
  const T = B.target;
  const hpF = t.hp / t.stats.hp;
  const d = T ? Math.hypot(T.x - t.x, T.z - t.z) : Infinity;
  const engaged = !!(T && B.seen.get(T.id) && M.clock >= B.seen.get(T.id).ready);
  let want = false;
  switch (t.stats.ability) {
    case "nitro":
      want = (!T && B.path && B.path.length - B.pi > 6) || B.mode === "retreat" || t.carrying >= 0;
      break;
    case "repair":
      want = hpF < (t.carrying >= 0 ? 0.7 : 0.5);
      break;
    case "shield":
      want = (engaged && (hpF < 0.75 || (B.hitBy && M.clock - B.hitBy.t < 1))) || (t.carrying >= 0 && B.hitBy && M.clock - B.hitBy.t < 1.5);
      break;
    case "focus":
      want = engaged && d > 45;
      break;
    case "inferno": {
      let n = 0;
      for (const o of M.tanks) if (o.alive && M.isEnemy(t, o) && Math.hypot(o.x - t.x, o.z - t.z) < 8.5) n++;
      want = n > 0;
      break;
    }
    case "overclock":
      want = engaged && d < 80 && t.ws.clip >= 5;
      break;
    case "cloak":
      want = (!T && B.role === "attack" && B.path && B.path.length - B.pi > 5) || B.mode === "retreat";
      break;
    case "barrage":
      want = engaged && d > 22 && d < 120;
      break;
    default:
  }
  if (!want) return;
  B.abilityT = M.clock + 1 + M.rand() * 2;
  if (M.rand() > D.ability) {
    B.abilityT = M.clock + 3 + M.rand() * 4;
    return;
  }
  tryAbility(M, t);
}

/* ------------------------------------------------------------------ act */
function steerTo(M, t, x, z, out) {
  const desired = Math.atan2(x - t.x, z - t.z);
  let diff = wrap(desired - t.yaw);
  const B = t.brain;
  // reverse when the waypoint is close behind (backing off) and we're not far
  const dist = Math.hypot(x - t.x, z - t.z);
  B.reverse = B.goalWhy === "back-off" && Math.abs(diff) > 2.2 && dist < 26;
  if (B.reverse) {
    diff = wrap(diff + Math.PI);
    out.steer = clamp(-diff * 2.4, -1, 1);
    out.throttle = -0.9;
    return;
  }
  out.steer = clamp(-diff * 2.4, -1, 1);
  const ad = Math.abs(diff);
  out.throttle = ad > 1.35 ? 0.12 : clamp(1.25 - ad * 0.95, 0.25, 1);
}

function feelers(M, t, out) {
  // probe ahead for walls; steer toward the freer side
  const A = M.A;
  if (out.throttle < 0) {
    // reversing: if something is right behind us, drive forward instead
    const L = t.dims.len / 2 + 2;
    if (A.solidAt(t.x - Math.sin(t.yaw) * L, t.z - Math.cos(t.yaw) * L, t.r * 0.8, t.y, t.dims.top)) {
      out.throttle = 0.6;
      if (t.brain.unstickT > 0) t.brain.unstickT = Math.min(t.brain.unstickT, 0.05);
    }
    return;
  }
  // pivoting in place toward a waypoint behind us: don't fight the turn
  if (out.throttle < 0.3 || Math.abs(out.steer) > 0.95) return;
  const r = t.r * 0.8;
  const L = t.dims.len / 2 + 2.5 + Math.abs(t.vf) * 0.35;
  const probe = (ang) => {
    const a = t.yaw + ang;
    return A.solidAt(t.x + Math.sin(a) * L, t.z + Math.cos(a) * L, r, t.y, t.dims.top) ? 1 : 0;
  };
  const c = probe(0);
  if (!c) return;
  const l = probe(0.55);
  const rr = probe(-0.55);
  if (l && !rr) out.steer = clamp(out.steer + 0.9, -1, 1);
  else if (rr && !l) out.steer = clamp(out.steer - 0.9, -1, 1);
  else out.steer = clamp(out.steer + (t.brain.strafe > 0 ? 0.9 : -0.9), -1, 1);
  out.throttle = Math.min(out.throttle, 0.45);
}

function avoidTanks(M, t, out) {
  if (Math.abs(out.steer) > 0.95) return;
  const fx = Math.sin(t.yaw);
  const fz = Math.cos(t.yaw);
  for (const o of M.tanks) {
    if (o === t || !o.alive) continue;
    const dx = o.x - t.x;
    const dz = o.z - t.z;
    const d = Math.hypot(dx, dz);
    if (d > 11 || d < 0.1) continue;
    const ahead = (dx * fx + dz * fz) / d;
    if (ahead < 0.45) continue;
    const side = dx * fz - dz * fx; // > 0: other tank is on our left (+X)
    out.steer = clamp(out.steer + (side > 0 ? 0.7 : -0.7) * (1 - d / 11), -1, 1);
    if (d < 6 && !M.isEnemy(t, o)) out.throttle = Math.min(out.throttle, 0.3);
  }
}

function stuckLogic(M, t, dt, out) {
  const B = t.brain;
  B.histT += dt;
  if (B.histT >= 0.5) {
    B.histT = 0;
    B.hist.push({ x: t.x, z: t.z, yaw: t.yaw });
    if (B.hist.length > 4) B.hist.shift();
    const h0 = B.hist[0];
    const moved = Math.hypot(t.x - h0.x, t.z - h0.z);
    const turned = Math.abs(wrap(t.yaw - h0.yaw));
    const wants = (Math.abs(t.input.throttle) > 0.35 || Math.abs(t.input.steer) > 0.5) && B.unstickT <= 0;
    if (wants && B.hist.length >= 4 && moved < 1.2 && turned < 0.35) B.stuckT += 0.5;
    else if (moved > 2.5) B.stuckT = 0;
    if (B.stuckT >= 1.5) {
      B.stuckT = 0;
      B.stuckN++;
      // penalise the next waypoints (and the node we're on) for a while
      if (B.path)
        for (let k = Math.max(0, B.pi - 1); k < Math.min(B.path.length, B.pi + 2); k++) if (B.path[k].id != null) B.avoid.set(B.path[k].id, M.clock + 25);
      const here = M.nav.nearest(t.x, t.z, t.y, false);
      if (here) B.avoid.set(here.id, M.clock + 12);
      B.stuckWindow = M.clock;
      B.unstickT = 1.1 + M.rand() * 0.6;
      B.unstickSteer = M.rand() < 0.5 ? -1 : 1;
      B.hist.length = 0;
    }
    // long-term no-progress failsafe (counts only when the bot wants to move)
    if (Math.hypot(t.x - B.farPos.x, t.z - B.farPos.z) > 6) {
      B.farPos = { x: t.x, z: t.z };
      B.farT = 0;
    } else if (B.mode !== "retreat" && B.goal && Math.hypot(B.goal.x - t.x, B.goal.z - t.z) > 14 && !["guard", "strafe", "escort"].includes(B.goalWhy)) B.farT += 0.5;
  }
  if (B.unstickT > 0) {
    B.unstickT -= dt;
    out.throttle = -0.85;
    out.steer = B.unstickSteer;
    if (B.unstickT <= 0) {
      if (B.stuckN >= 3 && M.clock - B.stuckWindow < 20) {
        B.stuckN = 0;
        const n = randomGoal(M, t);
        setGoal(M, t, n.x, n.z, n.y, "unstick", true);
      } else if (B.goal) setGoal(M, t, B.goal.x, B.goal.z, B.goal.y, B.goalWhy, true);
    }
    return true;
  }
  if (B.farT > 28) {
    B.farT = 0;
    M.rescue(t);
    return true;
  }
  return false;
}

function aimAndFire(M, t, dt) {
  const B = t.brain;
  const D = B.D;
  const inp = t.input;
  const T = B.target;
  const w = t.stats.weapon;
  const rec = T ? B.seen.get(T.id) : null;
  const engaged = T && rec && M.clock >= rec.ready;
  inp.fire = false;
  if (!engaged) {
    // look where we're going (or toward the last threat)
    let lx;
    let lz;
    if (B.hitBy && M.clock - B.hitBy.t < 4) {
      lx = B.hitBy.x;
      lz = B.hitBy.z;
    } else if (T) {
      lx = T.x;
      lz = T.z;
    } else {
      lx = t.x + Math.sin(t.yaw) * 40;
      lz = t.z + Math.cos(t.yaw) * 40;
    }
    inp.ax = lx;
    inp.az = lz;
    inp.ay = M.A.groundAt(lx, lz) + 2;
    return;
  }
  // aim error: re-roll on a new target, settle over time, wobble smoothly
  const A = B.aim;
  if (A.tgt !== T.id) {
    A.tgt = T.id;
    A.t0 = M.clock;
    const a = M.rand() * Math.PI * 2;
    A.ex = Math.cos(a);
    A.ez = Math.sin(a);
    A.ey = (M.rand() - 0.5) * 0.8;
  }
  const k = clamp((M.clock - A.t0) / D.settle, 0, 1);
  const mag = D.err0 + (D.err1 - D.err0) * k;
  A.phase += dt * 0.9;
  const wob = Math.sin(A.phase * 1.7) * 0.6 + Math.sin(A.phase * 0.73 + 1) * 0.4;
  const cx = T.x;
  const cy = T.y + T.dims.top * 0.55;
  const cz = T.z;
  const pv = pivot(t, tmp2);
  const d = Math.hypot(cx - pv.x, cy - pv.y, cz - pv.z);
  // lead the target
  const speed = w.speed;
  const tvx = Math.sin(T.yaw) * T.vf + Math.cos(T.yaw) * T.vl;
  const tvz = Math.cos(T.yaw) * T.vf - Math.sin(T.yaw) * T.vl;
  let tf = d / speed;
  let px = cx;
  let pz = cz;
  for (let i = 0; i < 2; i++) {
    px = cx + tvx * tf * D.lead;
    pz = cz + tvz * tf * D.lead;
    tf = Math.hypot(px - pv.x, cy - pv.y, pz - pv.z) / speed;
  }
  const drop = w.kind === "flame" ? 0 : 0.5 * w.gravity * tf * tf;
  const err = mag * d;
  inp.ax = px + (A.ex * wob - A.ez * (1 - wob) * 0.3) * err;
  inp.ay = cy + drop + A.ey * err * 0.6;
  inp.az = pz + (A.ez * wob + A.ex * (1 - wob) * 0.3) * err;

  // trigger discipline: aligned + clear line of fire
  B.fireCheckT -= dt;
  if (B.fireCheckT <= 0) {
    B.fireCheckT = 0.12;
    muzzle(t, tmp);
    const ax = inp.ax - tmp.x;
    const ay = inp.ay - tmp.y;
    const az = inp.az - tmp.z;
    const L = Math.hypot(ax, ay, az) || 1;
    const dot = (ax * tmp.dx + ay * tmp.dy + az * tmp.dz) / L;
    const ang = Math.acos(clamp(dot, -1, 1));
    const tol = Math.atan2(T.dims.wid * 0.55 * D.tol, d) + (w.kind === "flame" ? 0.18 : 0.004);
    let ok = ang < tol && d < w.range * (w.kind === "flame" ? 0.95 : 0.98);
    if (ok) {
      // obstacles in the way?
      const h = M.A.raycast(tmp.x, tmp.y, tmp.z, cx, cy, cz);
      if (h && h.t < 0.97) ok = false;
    }
    if (ok)
      for (const o of M.tanks) {
        if (!o.alive || o === t || o === T || M.isEnemy(t, o)) continue;
        const tt = segTank(o, tmp.x, tmp.y, tmp.z, cx, cy, cz, 0.6);
        if (tt >= 0 && tt < 0.98) {
          ok = false;
          break;
        }
      }
    B.fireOk = ok;
  }
  if (B.fireOk) {
    // easy bots pause between bursts / shots a bit
    if (w.kind === "clip" || w.kind === "flame") {
      B.triggerT -= dt;
      if (B.triggerT < -2.2) B.triggerT = D.burstPause;
      inp.fire = B.triggerT <= 0;
    } else inp.fire = true;
  }
}

export function updateBot(M, t, dt) {
  const B = t.brain;
  const inp = t.input;
  if (!t.alive) {
    inp.throttle = 0;
    inp.steer = 0;
    inp.fire = false;
    return;
  }
  B.thinkT -= dt;
  if (B.thinkT <= 0) {
    B.thinkT = B.D.think;
    think(M, t);
  }
  const out = { throttle: 0, steer: 0 };
  if (B.path && B.pi < B.path.length) {
    let wp = B.path[B.pi];
    const last = B.pi === B.path.length - 1;
    const dWp = Math.hypot(wp.x - t.x, wp.z - t.z);
    if (dWp < (last ? 3.5 : 5.5) || (B.pi + 1 < B.path.length && Math.hypot(B.path[B.pi + 1].x - t.x, B.path[B.pi + 1].z - t.z) < dWp - 1 && dWp < 9)) {
      B.pi++;
      if (B.pi < B.path.length) wp = B.path[B.pi];
    }
    if (B.pi < B.path.length) {
      // look one waypoint ahead when the shortcut is walkable
      if (B.pi + 1 < B.path.length && dWp < 12) {
        const n2 = B.path[B.pi + 1];
        if (walk(M.A, t.x, t.z, t.y, n2.x, n2.z, 1.4) !== -1) wp = { x: (wp.x + n2.x) / 2, z: (wp.z + n2.z) / 2 };
      }
      steerTo(M, t, wp.x, wp.z, out);
      if (B.pi === B.path.length - 1 && dWp < 10) out.throttle *= 0.6;
    }
  } else if (B.mode === "engage" && B.target) {
    // arrived: face the target with the hull's strongest side (frontal)
    const desired = Math.atan2(B.target.x - t.x, B.target.z - t.z);
    out.steer = clamp(-wrap(desired - t.yaw) * 1.5, -0.6, 0.6);
  }
  const unsticking = stuckLogic(M, t, dt, out);
  if (!unsticking) avoidTanks(M, t, out);
  feelers(M, t, out);
  inp.throttle = out.throttle;
  inp.steer = out.steer;
  aimAndFire(M, t, dt);
}

/** called by the match when a bot takes damage */
export function notifyHit(t, attacker, M) {
  if (!t.brain || !attacker) return;
  t.brain.hitBy = { id: attacker.id, x: attacker.x, z: attacker.z, t: M.clock };
}
