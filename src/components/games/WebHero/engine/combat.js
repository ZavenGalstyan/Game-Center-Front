/**
 * Web Hero — hero combat: melee chains, combos, auto-targeting, hit-stop,
 * finishers, web shot and the web abilities.
 *
 * Combos (inputs within the chain window after each hit):
 *   1  Light → Light → Light        punch, punch, spinning kick (knock-away)
 *   2  Light → Heavy                 heavy punch (guard break)
 *   3  Heavy → Heavy → (air) Light   kick, launcher kick, aerial strike (spike)
 *   4  Web Pull → Light → Light      pull-punch, pull-kick
 *   5  perfect Dodge → Light         counter attack
 * Heavy near a weakened enemy (≤25 % hp) performs a finisher.
 */
import { MOVES, ABILITIES, ENERGY_MAX, H } from "./config.js";
import { wish } from "./hero.js";
import { hitEnemy, webEnemy, pullEnemy } from "./enemies.js";
import { raycast } from "./collide.js";

const CHAIN = 0.9; // seconds after a move ends that the next input still chains
const rc = {};

export function cooldownMult(h) {
  return 1 - (h.up.cooldown || 0) * 0.12;
}

/** nearest valid enemy in a cone around dir (or any direction if dir null) */
export function pickTarget(W, h, dir, maxD = 7, cone = 1.1) {
  let best = null;
  let bs = Infinity;
  for (const e of W.enemies) {
    if (e.dead || e.state === "defeated") continue;
    const dx = e.x - h.x;
    const dz = e.z - h.z;
    const dy = e.y + e.hy - (h.y + 1);
    const d = Math.hypot(dx, dz);
    if (d > maxD || Math.abs(dy) > (e.fly ? 7 : 3.5)) continue;
    let a = 0;
    if (dir) {
      a = Math.acos(Math.max(-1, Math.min(1, (dx * dir[0] + dz * dir[1]) / (d || 1))));
      if (a > cone && d > 1.6) continue;
    }
    const s = d + a * 3;
    if (s < bs) {
      bs = s;
      best = e;
    }
  }
  return best;
}

function chooseMove(W, h, kind) {
  const now = W.t;
  const recent = h.chain.filter((c) => now - c.t < CHAIN + 0.6);
  const last = recent[recent.length - 1];
  const prev = recent[recent.length - 2];
  if (kind === "L") {
    if (h.counterT > 0) return "counter";
    if (!h.grounded && h.mode === "air") return "aerial";
    if (last && last.k === "pull") return "pullPunch";
    if (last && last.m === "pullPunch") return "pullKick";
    if (last && last.k === "L" && prev && prev.k === "L" && last.m !== "kick3" && prev.m !== "kick3") return "kick3";
    if (last && last.m === "punch1") return "punch2";
    return "punch1";
  }
  // heavy
  const tgt = pickTarget(W, h, null, 2.9);
  if (tgt && tgt.hp <= tgt.maxHp * 0.25 && !tgt.boss) return "finisher";
  if (h.counterT > 0) return "counter";
  if (last && last.k === "L" && last.m !== "kick3") return "heavyPunch";
  if (last && last.m === "kick") return "launcher";
  return "kick";
}

export function stepCombat(W, inp, dt) {
  const h = W.hero;
  const ab = W.cool;
  for (const k of Object.keys(ab)) ab[k] = Math.max(0, ab[k] - dt);
  h.shieldT = Math.max(0, (h.shieldT || 0) - dt);
  if (W.comboT > 0) {
    W.comboT -= dt;
    if (W.comboT <= 0) W.combo = 0;
  }
  const can = h.action !== "hurt" && h.action !== "knockdown" && h.action !== "rescue" && h.action !== "victory" && h.action !== "defeated" && h.mode !== "ledge";

  // queue inputs (buffered while an attack is still playing)
  if (inp.light) h.qAtk = { k: "L", t: 0.35 };
  else if (inp.heavy) h.qAtk = { k: "H", t: 0.35 };
  if (h.qAtk) {
    h.qAtk.t -= dt;
    if (h.qAtk.t <= 0) h.qAtk = null;
  }

  // current attack
  if (h.action === "attack" && h.atk) {
    const a = h.atk;
    const mv = MOVES[a.move];
    a.t += dt;
    // lunge toward the target during the windup
    if (a.target && !a.target.dead && a.t < mv.wind + mv.act) {
      const dx = a.target.x - h.x;
      const dz = a.target.z - h.z;
      const d = Math.hypot(dx, dz);
      if (d > 1.3) {
        const sp = Math.min(14, (d - 1.2) / Math.max(0.05, mv.wind + mv.act - a.t + 0.02));
        h.vx = (dx / d) * sp;
        h.vz = (dz / d) * sp;
      } else {
        h.vx *= 0.5;
        h.vz *= 0.5;
      }
      h.facing = Math.atan2(dx, dz);
    } else if (h.grounded) {
      h.vx *= 0.8;
      h.vz *= 0.8;
    }
    if (a.air && a.t < mv.wind + mv.act) h.vy = Math.max(h.vy, 1.5);
    if (!a.hit && a.t >= mv.wind) {
      a.hit = true;
      resolveHit(W, h, a.move);
    }
    const end = mv.wind + mv.act + mv.rec;
    // chain early into a queued attack once the hit is out
    if (h.qAtk && a.t >= mv.wind + mv.act * 0.6) {
      const q = h.qAtk;
      h.qAtk = null;
      startAttack(W, h, chooseMove(W, h, q.k), q.k, inp);
    } else if (a.t >= end) {
      h.action = "none";
      h.atk = null;
    }
  } else if (can && h.qAtk && h.action !== "dodge" && h.mode !== "climb" && h.mode !== "wallrun") {
    if (h.mode === "swing") {
      // swing kick: let go and strike
      W.forceRelease = true;
    }
    const q = h.qAtk;
    h.qAtk = null;
    startAttack(W, h, chooseMove(W, h, q.k), q.k, inp);
  }

  if (!can) return;

  // web shot (RMB)
  if (inp.web && ab.shot <= 0 && h.mode !== "ledge") {
    ab.shot = ABILITIES.shot.cd;
    fireWeb(W, h, inp, "shot");
  }
  // abilities 1-5
  const keys = [
    ["trap", inp.ab1],
    ["pull", inp.ab2],
    ["strike", inp.ab3],
    ["shield", inp.ab4],
    ["burst", inp.ab5],
  ];
  for (const [id, pressed] of keys) {
    if (!pressed) continue;
    if (W.opts.abilities && !W.opts.abilities[id]) {
      W.events.push({ type: "locked", id });
      continue;
    }
    if (ab[id] > 0) {
      W.events.push({ type: "cooldown", id });
      continue;
    }
    if (useAbility(W, h, id, inp)) ab[id] = ABILITIES[id].cd * cooldownMult(h);
  }
  // Web Storm (R) with a full meter
  if (inp.special) {
    if (W.energy >= ENERGY_MAX) webStorm(W, h);
    else W.events.push({ type: "energyLow" });
  }
}

function startAttack(W, h, move, kind, inp) {
  const mv = MOVES[move];
  const m = wish(inp);
  const dir = m.m > 0.1 ? [m.x, m.z] : [Math.sin(h.facing), Math.cos(h.facing)];
  const target = move === "finisher" ? pickTarget(W, h, null, 2.9) : pickTarget(W, h, dir, move === "aerial" ? 6 : 7);
  h.action = "attack";
  h.actT = 0;
  h.atk = { move, t: 0, hit: false, target, air: move === "aerial" };
  if (target) h.facing = Math.atan2(target.x - h.x, target.z - h.z);
  h.chain.push({ k: kind, m: move, t: W.t });
  if (h.chain.length > 6) h.chain.shift();
  if (move === "counter") h.counterT = 0;
  if (move === "aerial") h.vy = Math.max(h.vy, 3);
  W.events.push({ type: "swingAtk", move });
  void mv;
}

function resolveHit(W, h, move) {
  const mv = MOVES[move];
  const fx = Math.sin(h.facing);
  const fz = Math.cos(h.facing);
  const mult = 1 + (h.up.punch || 0) * 0.15;
  let n = 0;
  for (const e of W.enemies) {
    if (e.dead || e.state === "defeated") continue;
    const dx = e.x - h.x;
    const dz = e.z - h.z;
    const dy = e.y + e.hy - (h.y + 1);
    const d = Math.hypot(dx, dz);
    if (d > mv.reach + e.r || Math.abs(dy) > (move === "aerial" || e.fly ? 3 : 1.8)) continue;
    const ang = Math.acos(Math.max(-1, Math.min(1, (dx * fx + dz * fz) / (d || 1))));
    if (ang > mv.arc && d > 1.2) continue;
    const res = hitEnemy(W, e, { dmg: mv.dmg * mult, knock: mv.knock, launch: mv.launch || 0, spike: mv.spike || 0, fx, fz, move, breaksGuard: !!mv.breaksGuard, finisher: move === "finisher" });
    if (res !== "miss") n++;
  }
  if (n) {
    W.hitStop = move === "finisher" ? 0.16 : mv.dmg >= 18 ? 0.08 : 0.05;
    W.gainEnergy(mv.energy * Math.min(2, n));
    W.combo += n;
    W.comboT = 2.2;
    W.stats.maxCombo = Math.max(W.stats.maxCombo, W.combo);
  } else W.events.push({ type: "whiff" });
}

/* ------------------------------------------------------------------ web */

function aimTarget(W, h, inp, range) {
  const [fx, fz] = [Math.sin(inp.camYaw || h.facing), Math.cos(inp.camYaw || h.facing)];
  return pickTarget(W, h, [fx, fz], range, 0.7) || pickTarget(W, h, [Math.sin(h.facing), Math.cos(h.facing)], range, 0.9);
}

function fireWeb(W, h, inp, kind) {
  const t = aimTarget(W, h, inp, 30);
  let dx;
  let dy;
  let dz;
  if (t) {
    dx = t.x - h.x;
    dy = t.y + t.hy - (h.y + 1.3);
    dz = t.z - h.z;
  } else {
    dx = Math.sin(inp.camYaw || h.facing);
    dy = 0.05;
    dz = Math.cos(inp.camYaw || h.facing);
  }
  const l = Math.hypot(dx, dy, dz) || 1;
  W.webs.push({ x: h.x, y: h.y + 1.3, z: h.z, vx: (dx / l) * 48, vy: (dy / l) * 48, vz: (dz / l) * 48, t: 0, kind, target: t });
  h.facing = Math.atan2(dx, dz);
  h.webPose = 0.35;
  W.stats.webs++;
  W.events.push({ type: "webShoot" });
}

export function stepWebs(W, dt) {
  const keep = [];
  for (const w of W.webs) {
    w.t += dt;
    // home slightly toward its target
    if (w.target && !w.target.dead) {
      const dx = w.target.x - w.x;
      const dy = w.target.y + w.target.hy - w.y;
      const dz = w.target.z - w.z;
      const d = Math.hypot(dx, dy, dz) || 1;
      const s = Math.hypot(w.vx, w.vy, w.vz);
      w.vx += ((dx / d) * s - w.vx) * Math.min(1, dt * 8);
      w.vy += ((dy / d) * s - w.vy) * Math.min(1, dt * 8);
      w.vz += ((dz / d) * s - w.vz) * Math.min(1, dt * 8);
    }
    const nx = w.x + w.vx * dt;
    const ny = w.y + w.vy * dt;
    const nz = w.z + w.vz * dt;
    let dead = w.t > 1.2;
    // hit an enemy?
    for (const e of W.enemies) {
      if (dead || e.dead || e.state === "defeated") continue;
      if (Math.hypot(e.x - nx, e.y + e.hy - ny, e.z - nz) < e.r + 0.5) {
        webEnemy(W, e, w.kind === "shot" ? 1 : 3, w.kind === "shot" ? 5 : 2);
        dead = true;
      }
    }
    if (!dead && raycast(W.geo, w.x, w.y, w.z, nx - w.x, ny - w.y, nz - w.z, 1, rc)) {
      dead = true;
      W.events.push({ type: "webSplat", x: rc.x, y: rc.y, z: rc.z });
    }
    w.x = nx;
    w.y = ny;
    w.z = nz;
    if (!dead) keep.push(w);
  }
  W.webs = keep;
}

function useAbility(W, h, id, inp) {
  switch (id) {
    case "trap": {
      const t = aimTarget(W, h, inp, 26);
      if (!t) return noTarget(W);
      fireWebAt(W, h, t, "trap");
      W.stats.abilities++;
      return true;
    }
    case "pull": {
      const t = aimTarget(W, h, inp, 18);
      if (!t) return noTarget(W);
      pullEnemy(W, t, h);
      h.chain.push({ k: "pull", m: "pull", t: W.t });
      h.webPose = 0.4;
      h.facing = Math.atan2(t.x - h.x, t.z - h.z);
      W.stats.abilities++;
      W.events.push({ type: "webPull", x: t.x, y: t.y + t.hy, z: t.z });
      return true;
    }
    case "strike": {
      const t = aimTarget(W, h, inp, 26);
      if (!t) return noTarget(W);
      // zip toward the target, then a flying kick on arrival
      const dx = t.x - h.x;
      const dz = t.z - h.z;
      const d = Math.hypot(dx, dz) || 1;
      if (h.mode === "swing") W.forceRelease = true;
      h.zip = { t: 0, target: t, dur: Math.min(0.55, d / 34) };
      h.facing = Math.atan2(dx, dz);
      W.stats.abilities++;
      W.events.push({ type: "webZip", x: t.x, y: t.y + t.hy, z: t.z });
      return true;
    }
    case "shield":
      h.shieldT = 2.6;
      W.stats.abilities++;
      W.events.push({ type: "webShield" });
      return true;
    case "burst": {
      let n = 0;
      for (const e of W.enemies) {
        if (e.dead || e.state === "defeated") continue;
        if (Math.hypot(e.x - h.x, e.z - h.z) < 7.5 && Math.abs(e.y - h.y) < 4) {
          hitEnemy(W, e, { dmg: 10 * (1 + (h.up.punch || 0) * 0.15), knock: 4, fx: (e.x - h.x) / 7, fz: (e.z - h.z) / 7, move: "burst" });
          webEnemy(W, e, 2, 0);
          n++;
        }
      }
      W.stats.abilities++;
      W.gainEnergy(3 * n);
      W.events.push({ type: "webBurst", x: h.x, y: h.y + 1, z: h.z });
      return true;
    }
    default:
      return false;
  }
}

function fireWebAt(W, h, t, kind) {
  const dx = t.x - h.x;
  const dy = t.y + t.hy - (h.y + 1.3);
  const dz = t.z - h.z;
  const l = Math.hypot(dx, dy, dz) || 1;
  W.webs.push({ x: h.x, y: h.y + 1.3, z: h.z, vx: (dx / l) * 40, vy: (dy / l) * 40, vz: (dz / l) * 40, t: 0, kind, target: t });
  h.facing = Math.atan2(dx, dz);
  h.webPose = 0.35;
  W.events.push({ type: "webShoot", kind });
}

function noTarget(W) {
  W.events.push({ type: "noTarget" });
  return false;
}

/** web-zip strike: flies the hero to the target and kicks on arrival */
export function stepZip(W, dt) {
  const h = W.hero;
  const z = h.zip;
  if (!z) return false;
  z.t += dt;
  const t = z.target;
  if (!t || t.dead) {
    h.zip = null;
    return false;
  }
  const dx = t.x - h.x;
  const dy = t.y + 0.2 - h.y;
  const dz = t.z - h.z;
  const d = Math.hypot(dx, dy, dz);
  if (d < 1.6 || z.t > 0.8) {
    h.zip = null;
    h.vx = (dx / (d || 1)) * 4;
    h.vz = (dz / (d || 1)) * 4;
    h.vy = 4;
    h.grounded = false;
    h.mode = "air";
    hitEnemy(W, t, { dmg: 22 * (1 + (h.up.punch || 0) * 0.15), knock: 9, fx: dx / (d || 1), fz: dz / (d || 1), move: "strike", breaksGuard: true });
    W.hitStop = 0.08;
    W.gainEnergy(8);
    W.combo++;
    W.comboT = 2.2;
    return false;
  }
  const sp = 34;
  h.vx = (dx / d) * sp;
  h.vy = (dy / d) * sp;
  h.vz = (dz / d) * sp;
  h.x += h.vx * dt;
  h.y += h.vy * dt;
  h.z += h.vz * dt;
  h.mode = "air";
  h.grounded = false;
  h.facing = Math.atan2(dx, dz);
  return true;
}

function webStorm(W, h) {
  W.energy = 0;
  W.storm = { t: 0, x: h.x, y: h.y, z: h.z };
  h.action = "special";
  h.actT = 0;
  h.iframes = Math.max(h.iframes, 1.6);
  h.vy = 9;
  h.grounded = false;
  h.mode = "air";
  W.stats.storms++;
  W.events.push({ type: "webStorm", x: h.x, y: h.y, z: h.z });
}

export function stepStorm(W, dt) {
  const s = W.storm;
  if (!s) return;
  s.t += dt;
  const h = W.hero;
  if (s.t < 0.5) h.vy = Math.max(h.vy, 2);
  if (!s.hit && s.t > 0.55) {
    s.hit = true;
    for (const e of W.enemies) {
      if (e.dead || e.state === "defeated") continue;
      if (Math.hypot(e.x - h.x, e.z - h.z) < 15 && Math.abs(e.y - h.y) < 9) {
        hitEnemy(W, e, { dmg: 48 * (1 + (h.up.punch || 0) * 0.15), knock: 6, fx: e.x - h.x, fz: e.z - h.z, move: "storm", breaksGuard: true, storm: true });
        webEnemy(W, e, 3, 4);
      }
    }
    W.hitStop = 0.12;
    W.events.push({ type: "stormHit", x: h.x, y: h.y, z: h.z });
  }
  if (s.t > 1.1) {
    W.storm = null;
    if (h.action === "special") h.action = "none";
  }
}

export { H };

/** ability unlocked for this mission and off cooldown (bot + UI helper) */
export function ready(W, id) {
  return (!W.opts.abilities || !!W.opts.abilities[id]) && W.cool[id] <= 0;
}
