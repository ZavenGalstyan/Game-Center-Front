/**
 * Shadow Warriors — a match between two fighters (rounds, timer, hit
 * resolution, projectiles, telegraphed ground zones, boss mechanics).
 *
 * Pure simulation: no DOM, no React. `stepFight(F)` advances exactly one
 * 60 Hz frame; the component drains `F.events` for sound/FX after each step.
 * Both fighters' `inp` must be set before stepping (the AI fills its own
 * fighter's input inside the step from delayed perception).
 */
import { DT, WALL, PUSH_HALF, PARRY_F, COMBO_CAP, STAMINA_DELAY, ROUND_TIME, BOSS_TIME } from "./constants.js";
import { createFighter, stepFighter, computePose, applyHitReaction, isInvuln, isBlocking, isCrouching, movePhase, BLANK, clampMeter } from "./fighter.js";
import { strikeCapsule, capsuleHit, boxHitsCapsule } from "./skeleton.js";
import { createAI, thinkAI } from "./ai.js";
import { createBoss, stepBoss } from "./bosses.js";
import { makeRng } from "./rng.js";

const START_X = 190;

/**
 * cfg = {
 *   player: fighterCfg, enemy: fighterCfg,
 *   ai: aiProfile for the enemy, playerAI?: aiProfile (tests / demo),
 *   boss?: boss id, winsNeeded?: 2, time?: seconds, seed?: number
 * }
 */
export function createFight(cfg) {
  const p1 = createFighter(cfg.player, -START_X, 1);
  const p2 = createFighter(cfg.enemy, START_X, -1);
  p1.side = 0;
  p2.side = 1;
  p1.isPlayer = !cfg.playerAI;
  const rng = makeRng(cfg.seed ?? 12345);
  const F = {
    cfg,
    rng,
    p1,
    p2,
    fighters: [p1, p2],
    phase: "intro",
    t: 0,
    frame: 0,
    round: 1,
    wins: [0, 0],
    winsNeeded: cfg.winsNeeded || 2,
    roundTime: cfg.time || (cfg.boss ? BOSS_TIME : ROUND_TIME),
    timer: 0,
    events: [],
    seq: 1,
    projectiles: [],
    zones: [],
    wind: null,
    slowmo: 0,
    winner: null,
    roundWinner: null,
    perfect: [true, true],
    roundLog: [],
    effect: null,
  };
  F.timer = F.roundTime;
  F.effect = (f, opp, m) => runEffect(F, f, opp, m);
  if (!cfg.enemyManual) p2.ai = createAI(cfg.ai || {}, rng, p2);
  if (cfg.playerAI) p1.ai = createAI(cfg.playerAI, makeRng((cfg.seed ?? 12345) * 7 + 3), p1);
  if (cfg.boss) p2.boss = createBoss(cfg.boss, p2);
  F.events.push({ type: "round", round: 1 });
  return F;
}

function resetRound(F) {
  const keepMeter = [F.p1.meter, F.p2.meter];
  for (const f of F.fighters) {
    f.x = f.side === 0 ? -START_X : START_X;
    f.y = 0;
    f.vx = f.vy = 0;
    f.f = f.side === 0 ? 1 : -1;
    f.state = "intro";
    f.t = 0;
    f.move = null;
    f.hp = f.maxHp;
    f.st = f.maxSt;
    f.combo = 0;
    f.buf = null;
    f.invuln = 0;
    f.hitstop = 0;
    f.alpha = 1;
    f.wind = 0;
    for (const k in f.buffs) f.buffs[k] = 0;
    if (f.ai) f.ai.reset?.();
  }
  F.p1.meter = keepMeter[0];
  F.p2.meter = keepMeter[1];
  F.projectiles.length = 0;
  F.zones.length = 0;
  F.wind = null;
  F.timer = F.roundTime;
  F.perfect = [true, true];
  F.phase = "intro";
  F.t = 0;
  F.events.push({ type: "round", round: F.round });
}

// ------------------------------------------------------------------ main step
export function stepFight(F) {
  F.frame++;
  F.t++;
  if (F.slowmo > 0) F.slowmo--;
  const { p1, p2 } = F;

  if (F.phase === "intro") {
    if (F.t >= 96) {
      F.phase = "fight";
      F.t = 0;
      for (const f of F.fighters) if (f.state === "intro") f.state = "idle";
      F.events.push({ type: "fight" });
    }
  } else if (F.phase === "fight") {
    F.timer -= DT;
    if (F.timer <= 0) {
      F.timer = 0;
      timeOut(F);
    }
  } else if (F.phase === "ko") {
    if (F.t >= 130) endRound(F);
  } else if (F.phase === "over") {
    // fighters keep animating (winner pose)
  }

  // inputs
  const live = F.phase === "fight";
  for (const f of F.fighters) {
    const opp = f === p1 ? p2 : p1;
    if (!live) Object.assign(f.inp, BLANK);
    else if (f.ai) thinkAI(F, f, opp);
  }

  for (const f of F.fighters) {
    const opp = f === p1 ? p2 : p1;
    if (f.hitstop > 0) {
      f.hitstop--;
      // presses during hitstop still count (buffered)
      for (const btn of ["p", "k", "w", "s"]) if (f.inp[btn] && !f.prev[btn]) f.buf = { btn, age: 0, down: f.inp.d, fwd: f.inp[f.f > 0 ? "r" : "l"] };
      if (f.inp.b && !f.prev.b) f.blockAge = 0;
    } else stepFighter(F, f, opp);
    Object.assign(f.prev, f.inp);
  }

  // boss logic (specials, phases, teleports)
  if (p2.boss && F.phase === "fight") stepBoss(F, p2, p1);

  // wind (sandstorm)
  if (F.wind) {
    F.wind.t--;
    for (const f of F.fighters) f.wind = f === F.wind.from ? 0 : F.wind.t > 0 ? F.wind.v : 0;
    if (F.wind.t <= 0) F.wind = null;
  }

  pushApart(F);
  for (const f of F.fighters) face(f, f === p1 ? p2 : p1);
  computePose(p1);
  computePose(p2);

  // melee hits — detect both first so trades resolve symmetrically
  if (F.phase === "fight" || F.phase === "ko") {
    const h1 = detectMelee(p1, p2);
    const h2 = detectMelee(p2, p1);
    const m1 = p1.move;
    const m2 = p2.move;
    if (h1) resolveHit(F, p1, p2, m1, h1);
    if (h2) resolveHit(F, p2, p1, m2, h2);
  }
  stepProjectiles(F);
  stepZones(F);

  // KO check
  if (F.phase === "fight") {
    for (const f of F.fighters) {
      if (f.hp <= 0) {
        f.hp = 0;
        const other = f === p1 ? p2 : p1;
        roundOver(F, other, "ko");
        break;
      }
    }
  }
  for (const f of F.fighters) clampMeter(f);
}

function face(f, opp) {
  if (f.state === "vanish") return;
  const grounded = f.y <= 0.5;
  const turnable = f.state === "idle" || f.state === "walk" || f.state === "crouch" || f.state === "block" || f.state === "cblock" || f.state === "land" || f.state === "getup" || f.state === "intro" || f.state === "appear" || f.state === "prejump";
  if (!grounded || !turnable) return;
  const dx = opp.x - f.x;
  if (Math.abs(dx) > 4) {
    const nf = Math.sign(dx);
    if (nf !== f.f) {
      f.f = nf;
      if (f.state === "walk") f.vx = -f.vx * 0; // stop; next frame re-evaluates direction
    }
  }
}

function pushApart(F) {
  const a = F.p1;
  const b = F.p2;
  if (a.state === "vanish" || b.state === "vanish") return;
  if (Math.abs(a.y - b.y) > 105) return; // jumping clean over is allowed
  const dx = b.x - a.x;
  const min = PUSH_HALF * 2;
  if (Math.abs(dx) >= min) return;
  const s = dx === 0 ? (a.f > 0 ? 1 : -1) : Math.sign(dx);
  let over = (min - Math.abs(dx)) / 2;
  let ax = a.x - s * over;
  let bx = b.x + s * over;
  // walls: shove the other one instead
  if (ax < -WALL) {
    bx += -WALL - ax;
    ax = -WALL;
  } else if (ax > WALL) {
    bx -= ax - WALL;
    ax = WALL;
  }
  if (bx < -WALL) {
    ax += -WALL - bx;
    bx = -WALL;
  } else if (bx > WALL) {
    ax -= bx - WALL;
    bx = WALL;
  }
  a.x = ax;
  b.x = bx;
}

// ------------------------------------------------------------------ melee
function detectMelee(a, d) {
  if (a.state !== "attack" || a.hitstop > 0) return null;
  const m = a.move;
  if (!m || !m.limb) return null;
  if (a.mf < m.s || a.mf >= m.s + m.a) return null;
  if (a.hitTarget === a.atkId) return null;
  if (isInvuln(d)) return null;
  if (m.height === "high" && isCrouching(d)) return null; // highs whiff over crouchers
  const limbs = m.limbs || [m.limb];
  for (const limb of limbs) {
    const cap = strikeCapsule(a.J, limb);
    if (!cap) continue;
    for (const hc of d.hurt) {
      if (capsuleHit(cap, hc)) {
        // contact point ~ the strike end closest to the hurt capsule's centre
        const cx = (hc[0] + hc[2]) / 2;
        const cy = (hc[1] + hc[3]) / 2;
        const t = Math.abs(cap[2] - cx) < Math.abs(cap[0] - cx) ? 1 : 0.5;
        return { x: cap[0] + (cap[2] - cap[0]) * t * 0.95 + (cx - cap[2]) * 0.2, y: (cap[1] + (cap[3] - cap[1]) * t + cy) / 2, part: hc[5] };
      }
    }
  }
  return null;
}

/** Can `d` block an attack of this height in its current stance? */
export function canBlock(d, height) {
  if (!isBlocking(d)) return false;
  const crouch = isCrouching(d);
  if (height === "low") return crouch;
  if (height === "over") return !crouch;
  return true;
}

/**
 * Apply one hit/block from attacker `a` (or a projectile owner) to `d`.
 * `m` describes the attack; returns 'hit' | 'block' | 'parry' | 'armor'.
 */
export function resolveHit(F, a, d, m, at, proj = null) {
  if (!proj) {
    a.hitTarget = a.atkId;
    if (m.multi) {
      a.multiLeft--;
      if (a.multiLeft > 0) a.multiGap = 4;
    }
  }
  const dir = proj ? Math.sign(proj.vx) || a.f : Math.sign(d.x - a.x) || a.f;
  const blockable = !(proj && proj.unblockable) && !m.unblockable;
  const blocked = blockable && canBlock(d, m.height);
  const atWall = Math.abs(d.x) >= WALL - 4 && Math.sign(d.x) === dir;
  const basePower = proj ? proj.power : m.kind === "weapon" ? a.power : m.kind === "special" ? a.bodyPower * a.abilityPow : a.bodyPower;
  const raw = m.dmg * basePower;

  if (blocked && !proj && d.blockAge <= PARRY_F && !m.unparry) {
    // perfect block → the attacker staggers
    a.state = "parried";
    a.t = 0;
    a.stun = 28;
    a.move = null;
    a.vx = -dir * 140;
    d.state = isCrouching(d) ? "cblock" : "block";
    d.t = 0;
    d.meter += 12;
    d.st = Math.min(d.maxSt, d.st + 10);
    a.hitstop = d.hitstop = 8;
    d.stats.parries++;
    F.events.push({ type: "parry", who: d, by: a, x: at.x, y: at.y });
    return "parry";
  }

  if (blocked) {
    d.state = "blockstun";
    d.t = 0;
    d.stun = m.blockstun || 10;
    const push = Math.abs(m.push || 150) * 0.8;
    d.vx = dir * push;
    if (atWall && !proj) a.vx = -dir * push * 0.7;
    const cost = 3 + raw * 2.1 * (m.crush || 1);
    d.st -= cost;
    d.stDelay = STAMINA_DELAY;
    d.stats.blocked++;
    a.meter += 2;
    d.meter += 4;
    const hs = Math.max(3, (m.hitstop || 5) - 2);
    if (!proj) a.hitstop = hs;
    d.hitstop = hs;
    if (d.st <= 0) {
      d.st = 0;
      d.state = "guardbreak";
      d.t = 0;
      d.stun = 46;
      F.events.push({ type: "guardbreak", who: d, x: at.x, y: at.y });
    } else F.events.push({ type: "block", who: d, by: a, x: at.x, y: at.y, heavy: (m.hitstop || 0) >= 9, kind: m.kind, sfx: m.sfx });
    return "block";
  }

  // clean hit
  const counter = d.state === "attack" && movePhase(d) === "startup";
  const scale = Math.max(0.4, 1 - 0.12 * d.combo);
  const ironK = d.buffs.iron > 0 ? 0.65 : 1;
  const dmg = raw * (1 - d.def) * scale * (counter ? 1.2 : 1) * ironK;
  d.hp -= dmg;
  d.combo++;
  d.stats.taken += dmg;
  a.stats.dmg += dmg;
  a.stats.landed++;
  if (d.combo > a.stats.maxCombo) a.stats.maxCombo = d.combo;
  F.perfect[d.side] = false;
  if (a.buffs.vamp > 0) a.hp = Math.min(a.maxHp, a.hp + dmg * (a.boss ? 0.15 : 0.45 * a.abilityPow));
  a.meter += proj ? 5 : 8;
  d.meter += 6;
  const lightHit = (m.hitstun || 15) <= 19 && !m.kd;
  const superArmor = d.buffs.armor > 0 || (d.buffs.iron > 0 && lightHit) || (d.state === "attack" && d.move?.armor && d.mf >= d.move.armor[0] && d.mf <= d.move.armor[1]);
  const knockdown = !!m.kd || d.combo >= COMBO_CAP || d.hp <= 0 || d.y > 0.5;
  const hs = (m.hitstop || 5) + (counter ? 2 : 0) + (d.hp <= 0 ? 6 : 0);
  if (!proj) a.hitstop = hs;
  d.hitstop = hs;
  F.events.push({ type: "hit", who: d, by: a, x: at.x, y: at.y, dmg, counter, combo: d.combo, heavy: hs >= 9, kind: m.kind, sfx: m.sfx, part: at.part, armor: superArmor && d.hp > 0 });
  if (superArmor && d.hp > 0) return "armor";
  const stun = Math.round((m.hitstun || 15) * Math.max(0.55, 1 - 0.07 * (d.combo - 1))) + (counter ? 4 : 0);
  const pushV = m.pull ? -dir * 520 : dir * (m.push || 170);
  applyHitReaction(F, d, a, m, { stun, knockdown, kbx: dir * (m.kb?.vx ?? 230), kby: m.kb?.vy ?? 330, pushV });
  if (atWall && !m.pull && !proj && !knockdown) a.vx = -dir * Math.abs(m.push || 170) * 0.6;
  if (knockdown) F.events.push({ type: "knockdown", who: d });
  return "hit";
}

// ------------------------------------------------------------------ projectiles & zones
function owner(F, side) {
  return side === 0 ? F.p1 : F.p2;
}

export function spawnProjectile(F, p) {
  F.projectiles.push({ delay: 0, life: 150, w: 40, h: 40, y: 0, dmg: 8, height: "mid", hitstun: 18, push: 200, power: 1, alive: true, ...p });
}

function stepProjectiles(F) {
  const P = F.projectiles;
  for (const p of P) {
    if (!p.alive) continue;
    p.age = (p.age || 0) + 1;
    if (p.delay > 0) {
      p.delay--;
      if (p.track && p.delay > 0) p.y = p.track();
      continue;
    }
    p.x += p.vx * DT;
    p.life--;
    if (p.life <= 0 || Math.abs(p.x) > WALL + 120) p.alive = false;
  }
  // opposing projectiles cancel each other
  for (let i = 0; i < P.length; i++) {
    const a = P[i];
    if (!a.alive || a.delay > 0) continue;
    for (let j = i + 1; j < P.length; j++) {
      const b = P[j];
      if (!b.alive || b.delay > 0 || a.side === b.side || a.heavy || b.heavy) continue;
      if (Math.abs(a.x - b.x) < (a.w + b.w) / 2 && a.y < b.y + b.h && b.y < a.y + a.h) {
        a.alive = b.alive = false;
        F.events.push({ type: "clash", x: (a.x + b.x) / 2, y: (a.y + b.y + a.h / 2 + b.h / 2) / 2 });
      }
    }
  }
  if (F.phase !== "fight" && F.phase !== "ko") return;
  for (const p of P) {
    if (!p.alive || p.delay > 0) continue;
    const src = owner(F, p.side);
    const d = owner(F, 1 - p.side);
    if (isInvuln(d)) continue;
    if (p.height === "high" && isCrouching(d)) continue;
    const box = { x0: p.x - p.w / 2, x1: p.x + p.w / 2, y0: p.y, y1: p.y + p.h };
    let hit = false;
    for (const hc of d.hurt) {
      if (boxHitsCapsule(box, hc)) {
        hit = true;
        break;
      }
    }
    if (!hit) continue;
    const res = resolveHit(F, src, d, p, { x: p.x, y: Math.min(p.y + p.h / 2, d.J.neck.y) }, p);
    if (!p.pierce || res === "block") p.alive = false;
    else p.pierce--;
  }
  for (let i = P.length - 1; i >= 0; i--) if (!P[i].alive) P.splice(i, 1);
}

export function spawnZone(F, z) {
  F.zones.push({ warn: 40, active: 8, w: 100, h: 60, dmg: 10, height: "low", hitstun: 20, push: 120, power: 1, hit: false, ...z });
}

function stepZones(F) {
  const Z = F.zones;
  for (const z of Z) {
    z.age = (z.age || 0) + 1;
    if (z.warn > 0) {
      z.warn--;
      if (z.warn === 0) F.events.push({ type: "zone", kind: z.kind, x: z.x });
      continue;
    }
    z.active--;
    if (!z.hit && z.dmg > 0 && (F.phase === "fight" || F.phase === "ko")) {
      const src = owner(F, z.side);
      const d = owner(F, 1 - z.side);
      if (!isInvuln(d)) {
        const box = { x0: z.x - z.w / 2, x1: z.x + z.w / 2, y0: 0, y1: z.h };
        for (const hc of d.hurt) {
          if (boxHitsCapsule(box, hc)) {
            z.hit = true;
            resolveHit(F, src, d, z, { x: d.x, y: Math.min(z.h, 60) }, { ...z, vx: d.x - z.x || 1 });
            break;
          }
        }
      }
    }
  }
  for (let i = Z.length - 1; i >= 0; i--) if (Z[i].active <= 0) Z.splice(i, 1);
}

// ------------------------------------------------------------------ special effects
function runEffect(F, f, opp, m) {
  const pow = f.abilityPow * f.bodyPower;
  const side = f.side;
  switch (m.effect) {
    case "wave":
      spawnProjectile(F, { kind: "wave", side, x: f.x + f.f * 60, y: 28, w: 46, h: 76, vx: f.f * 540, dmg: 9, power: pow, height: "mid", hitstun: 20, push: 260, kb: { vx: 200, vy: 300 } });
      break;
    case "quake":
      for (const s of [-1, 1]) spawnProjectile(F, { kind: "quake", side, x: f.x + s * 40, y: 0, w: 44, h: 38, vx: s * 480, dmg: 8, power: pow, height: "low", kd: true, kb: { vx: 160, vy: 320 }, life: 80, heavy: true });
      F.events.push({ type: "shake", power: 8 });
      break;
    case "iron":
      f.buffs.iron = Math.round(300 * (0.85 + 0.15 * f.abilityPow));
      F.events.push({ type: "buff", who: f, kind: "iron" });
      break;
    case "vampire":
      f.buffs.vamp = Math.round(360 * (0.85 + 0.15 * f.abilityPow));
      F.events.push({ type: "buff", who: f, kind: "vamp" });
      break;
    case "rush":
      F.events.push({ type: "rush", who: f });
      break;
    // ----- bosses -----
    case "ripple":
      spawnProjectile(F, { kind: "ripple", side, x: f.x + f.f * 90, y: 0, w: 50, h: 44, vx: f.f * 430, dmg: 8, power: f.power, height: "low", kd: true, kb: { vx: 160, vy: 320 }, life: 120, heavy: true });
      F.events.push({ type: "shake", power: 7 });
      break;
    case "ironStance":
      f.buffs.armor = 150;
      F.events.push({ type: "buff", who: f, kind: "armor" });
      break;
    case "thorns": {
      const heights = f.boss?.phase >= 2 ? ["high", "low", "high", "low"] : ["high", "low", "high"];
      heights.forEach((h, i) => spawnProjectile(F, { kind: "thorn", side, x: f.x + f.f * 50, y: h === "high" ? 126 : 8, w: 34, h: 26, vx: f.f * 560, delay: i * 16, dmg: 6, power: f.power, height: h === "high" ? "high" : "low", hitstun: 16, push: 180 }));
      break;
    }
    case "vanish":
      f.state = "vanish";
      f.t = 0;
      f.boss.vanishT = 36;
      // reappear behind the target if there is room, otherwise in front
      {
        let tx = opp.x - opp.f * 115;
        if (Math.abs(tx) > WALL - 10) tx = opp.x + opp.f * 115;
        f.boss.vanishTo = Math.max(-WALL, Math.min(WALL, tx));
        spawnZone(F, { kind: "leaves", side, x: f.boss.vanishTo, warn: 36, active: 1, w: 0, h: 0, dmg: 0 });
      }
      break;
    case "clone":
      spawnProjectile(F, { kind: "clone", side, x: f.x - f.f * 40, y: 0, w: 60, h: 100, vx: f.f * 780, delay: 30, dmg: 9, power: f.power, height: "mid", hitstun: 22, push: 300, kd: true, kb: { vx: 260, vy: 320 }, life: 120, heavy: true });
      break;
    case "erupt":
      spawnZone(F, { kind: "geyser", side, x: opp.x, warn: 50, active: 10, w: 116, h: 240, dmg: 10, power: f.power, height: "mid", unblockable: true, kd: true, kb: { vx: 60, vy: 700 } });
      if (f.boss?.phase >= 2) spawnZone(F, { kind: "geyser", side, x: Math.max(-WALL, Math.min(WALL, opp.x + (opp.x > 0 ? -170 : 170))), warn: 62, active: 10, w: 116, h: 240, dmg: 10, power: f.power, height: "mid", unblockable: true, kd: true, kb: { vx: 60, vy: 700 } });
      break;
    case "storm":
      F.wind = { t: 240, v: Math.sign(opp.x - f.x || 1) * 125, from: f };
      F.events.push({ type: "storm" });
      break;
    case "eclipse": {
      const low = f.boss.nextLow;
      spawnProjectile(F, { kind: "eclipse", side, x: f.x + f.f * 50, y: low ? 0 : 128, w: 70, h: low ? 42 : 44, vx: f.f * 900, dmg: 11, power: f.power, height: low ? "low" : "high", hitstun: 24, push: 320, crush: 1.1, kd: true, kb: { vx: 300, vy: 340 }, life: 90, heavy: true });
      F.events.push({ type: "shake", power: 6 });
      break;
    }
    case "spikes": {
      const dir = Math.sign(opp.x - f.x) || f.f;
      const n = f.boss?.phase >= 3 ? 6 : 4;
      for (let i = 0; i < n; i++) {
        const x = f.x + dir * (90 + i * 86);
        if (Math.abs(x) > WALL + 20) break;
        spawnZone(F, { kind: "spike", side, x, warn: 34 + i * 10, active: 8, w: 72, h: 66, dmg: 7, power: f.power, height: "low", kd: true, kb: { vx: 120, vy: 360 } });
      }
      break;
    }
    case "flurry":
      break;
  }
}

// ------------------------------------------------------------------ rounds
function roundOver(F, winner, how) {
  F.phase = "ko";
  F.t = 0;
  F.slowmo = how === "ko" ? 60 : 0;
  F.roundWinner = winner;
  F.wins[winner.side]++;
  F.roundLog.push({ winner: winner.side, how, perfect: F.perfect[winner.side], hp: winner.hp / winner.maxHp, time: F.roundTime - F.timer });
  const loser = winner === F.p1 ? F.p2 : F.p1;
  if (how === "ko" && loser.state !== "fall" && loser.state !== "down" && loser.state !== "ko") {
    loser.state = "fall";
    loser.t = 0;
    loser.vy = 300;
    loser.vx = Math.sign(loser.x - winner.x) * 200;
    loser.y = Math.max(1, loser.y);
  }
  F.events.push({ type: "ko", winner, how, perfect: F.perfect[winner.side] });
}

function timeOut(F) {
  const a = F.p1.hp / F.p1.maxHp;
  const b = F.p2.hp / F.p2.maxHp;
  if (Math.abs(a - b) < 1e-6) {
    // dead even: nobody scores; replay the round (the player never loses a tie)
    if (F.round >= 6) roundOver(F, F.p1, "time");
    else {
      F.phase = "ko";
      F.t = 0;
      F.roundWinner = null;
      F.roundLog.push({ winner: -1, how: "draw" });
      F.events.push({ type: "ko", winner: null, how: "draw" });
    }
    return;
  }
  roundOver(F, a > b ? F.p1 : F.p2, "time");
}

function endRound(F) {
  const need = F.winsNeeded;
  if (F.wins[0] >= need || F.wins[1] >= need) {
    F.phase = "over";
    F.t = 0;
    F.winner = F.wins[0] >= need ? F.p1 : F.p2;
    const w = F.winner;
    if (w.state !== "fall" && w.state !== "down") {
      w.state = "win";
      w.t = 0;
    }
    F.events.push({ type: "over", winner: w });
    return;
  }
  F.round++;
  resetRound(F);
}
