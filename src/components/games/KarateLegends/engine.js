/**
 * Karate Legends engine — framework-free fighter simulation.
 *
 * create() builds a battle, step(s, dt) advances it on a fixed 1/120s tick
 * and returns the sound/UI events that happened. Both fighters are driven
 * through the same `input` object (held left/right/block + latched press
 * timestamps for jump/punch/kick/special), so the AI in aiUpdate() obeys
 * exactly the same cooldowns, frame data and hit rules as the player.
 *
 * Hit rules: an attack hits at most once (attack.hit), only during its active
 * frames, only on a fighter that isn't KO'd. All hits of a tick are collected
 * first and applied after, so a same-tick trade never favours fighter 0.
 */
import { STYLES, OPPONENTS, BATTLES, playerStats, opponentStats } from "./data.js";

export const W = 960;
export const H = 540;
export const FLOOR = 452;
export const WALL_L = 56;
export const WALL_R = W - 56;
export const DT = 1 / 120;
export const ROUND_TIME = 60;
export const HURT = { x: 22, top: 168 }; // standing hurtbox half-width, height
export const PUSH = 50; // min centre distance between grounded fighters
export const ENERGY_MAX = 100;
const WALK = 265;
const JUMP_V = 780;
const GRAV = 2250;
const BUFFER = 0.18; // seconds a pressed attack waits for the fighter to be free
const COMBO_WINDOW = 0.42;
const INTRO = 1.5;
const ROUND_END = 2.4;
const MAX_ROUNDS = 5;

/** Frame data. box = [x0, x1, y0, y1] relative to the feet, facing right. */
export const MOVES = {
  jab: { startup: 0.07, active: 0.07, recovery: 0.13, dmg: 5, kb: 150, stun: 0.27, box: [12, 76, -146, -106], cd: 0.04, kind: "punch" },
  cross: { startup: 0.08, active: 0.07, recovery: 0.15, dmg: 6, kb: 170, stun: 0.29, box: [12, 80, -144, -104], cd: 0.04, kind: "punch" },
  roundhouse: { startup: 0.13, active: 0.09, recovery: 0.3, dmg: 11, kb: 430, stun: 0.46, launch: 260, box: [18, 98, -156, -94], cd: 0.3, kind: "kick" },
  kick: { startup: 0.14, active: 0.09, recovery: 0.24, dmg: 9, kb: 270, stun: 0.34, box: [22, 100, -104, -60], cd: 0.16, kind: "kick" },
  airPunch: { startup: 0.06, active: 0.14, recovery: 0.1, dmg: 6, kb: 170, stun: 0.3, box: [10, 72, -134, -84], cd: 0.05, kind: "punch", air: true },
  airKick: { startup: 0.08, active: 0.2, recovery: 0.1, dmg: 8, kb: 250, stun: 0.34, box: [6, 84, -94, -30], cd: 0.08, kind: "kick", air: true },
  special: { startup: 0.22, active: 0.28, recovery: 0.38, dmg: 20, kb: 540, stun: 0.6, launch: 380, chip: 0.3, dash: 720, box: [0, 84, -148, -48], cd: 0.4, kind: "special" },
};
const COMBO = ["jab", "cross", "roundhouse"];
export const moveTotal = (m) => m.startup + m.active + m.recovery;

/** mulberry32 — deterministic per battle so the Node tests are repeatable. */
function rngFrom(seed) {
  let a = seed >>> 0 || 1;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function makeFighter(idx, stats, look) {
  return {
    idx,
    look,
    ...stats,
    x: 0,
    y: FLOOR,
    vx: 0,
    vy: 0,
    facing: idx === 0 ? 1 : -1,
    hp: stats.maxHp,
    energy: 0,
    state: "idle",
    stateT: 0,
    walkT: 0,
    grounded: true,
    attack: null,
    stun: 0,
    blockStun: 0,
    cd: 0,
    comboStep: 0,
    comboT: 0,
    airAttackUsed: false,
    chain: 0, // hits landed in a row (combo counter)
    chainT: 0,
    wins: 0,
    input: { left: false, right: false, block: false, jumpQ: 0, punchQ: 0, kickQ: 0, specialQ: 0 },
    ai: null,
  };
}

/** Start a battle. opts: { battleId, upgrades, seed, playerAI: {style, skill} } */
export function create(opts = {}) {
  const battle = BATTLES.find((b) => b.id === opts.battleId) || BATTLES[0];
  const opp = OPPONENTS[battle.opponent];
  const s = {
    battle,
    roundsToWin: battle.roundsToWin,
    rng: rngFrom(opts.seed ?? battle.id * 7919 + 13),
    time: 1, // starts at 1 so a 0 press stamp is always "not pressed"
    acc: 0,
    phase: "intro",
    phaseT: 0,
    paused: false,
    round: 1,
    roundTime: ROUND_TIME,
    roundWinner: null, // 0 | 1 | -1 (draw)
    roundEndReason: null, // "ko" | "time"
    matchWinner: null,
    hitstop: 0,
    slowmo: 0,
    shake: 0,
    fx: [],
    fighters: [
      makeFighter(0, playerStats(opts.upgrades), opts.playerLook || null),
      makeFighter(1, opponentStats(battle), opp),
    ],
  };
  const foe = s.fighters[1];
  foe.ai = makeAI(opp.style, battle.skill);
  if (opts.playerAI) s.fighters[0].ai = makeAI(opts.playerAI.style || "balanced", opts.playerAI.skill ?? 0.6);
  resetRound(s);
  return s;
}

function makeAI(style, skill) {
  return { p: STYLES[style], skill, t: 0.4, act: "idle", actT: 0, combo: 0, jumpAtk: false };
}

function resetRound(s) {
  const [a, b] = s.fighters;
  for (const f of s.fighters) {
    Object.assign(f, {
      y: FLOOR, vx: 0, vy: 0, hp: f.maxHp, state: "idle", stateT: 0, grounded: true, attack: null,
      stun: 0, blockStun: 0, cd: 0, comboStep: 0, comboT: 0, airAttackUsed: false, chain: 0, chainT: 0,
    });
    clearInput(f);
    if (f.ai) Object.assign(f.ai, { t: 0.3, act: "idle", actT: 0, combo: 0, jumpAtk: false });
  }
  a.x = W / 2 - 170;
  b.x = W / 2 + 170;
  a.facing = 1;
  b.facing = -1;
  s.roundTime = ROUND_TIME;
  s.roundWinner = null;
  s.roundEndReason = null;
  s.phase = "intro";
  s.phaseT = 0;
  s.fx.length = 0;
  s.hitstop = 0;
  s.slowmo = 0;
}

export function clearInput(f) {
  Object.assign(f.input, { left: false, right: false, block: false, jumpQ: 0, punchQ: 0, kickQ: 0, specialQ: 0 });
}

/** Latch a press (jump/punch/kick/special) at the engine's current time. */
export function press(s, idx, what) {
  s.fighters[idx].input[what + "Q"] = s.time;
}

export function togglePause(s) {
  if (s.phase === "matchOver") return;
  s.paused = !s.paused;
  for (const f of s.fighters) if (!f.ai) clearInput(f);
}

/** Restart the same battle from round 1. */
export function restart(s) {
  for (const f of s.fighters) {
    f.wins = 0;
    f.energy = 0;
  }
  s.round = 1;
  s.matchWinner = null;
  s.paused = false;
  resetRound(s);
}

export function step(s, dt) {
  const events = [];
  if (s.paused || s.phase === "matchOver" && s.phaseT > 4) return events;
  s.acc = Math.min(s.acc + Math.min(Math.max(dt, 0), 0.1), 0.25);
  while (s.acc >= DT) {
    s.acc -= DT;
    tick(s, DT, events);
  }
  return events;
}

function tick(s, realDt, ev) {
  s.shake = Math.max(0, s.shake - realDt * 30);
  for (const p of s.fx) p.t += realDt;
  s.fx = s.fx.filter((p) => p.t < p.life);
  if (s.hitstop > 0) {
    s.hitstop -= realDt;
    return;
  }
  let dt = realDt;
  if (s.slowmo > 0) {
    s.slowmo -= realDt;
    dt *= 0.35;
  }
  s.time += dt;
  s.phaseT += dt;
  const [a, b] = s.fighters;

  if (s.phase === "intro") {
    if (s.phaseT - dt <= 0) ev.push("round");
    if (s.phaseT >= INTRO) {
      s.phase = "fight";
      s.phaseT = 0;
      ev.push("fight");
    }
  } else if (s.phase === "fight") {
    const before = Math.ceil(s.roundTime);
    s.roundTime = Math.max(0, s.roundTime - dt);
    if (Math.ceil(s.roundTime) !== before && s.roundTime <= 5 && s.roundTime > 0) ev.push("tick");
    if (s.roundTime <= 0) {
      const ra = a.hp / a.maxHp;
      const rb = b.hp / b.maxHp;
      endRound(s, Math.abs(ra - rb) < 1e-6 ? -1 : ra > rb ? 0 : 1, "time", ev);
    }
  } else if (s.phase === "roundEnd") {
    if (s.phaseT >= ROUND_END) nextRound(s, ev);
  }

  for (const f of s.fighters) control(s, f, s.fighters[1 - f.idx], dt, ev);
  for (const f of s.fighters) physics(s, f, dt, ev);
  resolveHits(s, ev);
  separate(s);
  for (const f of s.fighters) {
    const o = s.fighters[1 - f.idx];
    if (f.grounded && !f.attack && f.state !== "hit" && f.state !== "ko" && o.x !== f.x) f.facing = o.x > f.x ? 1 : -1;
    f.stateT += dt;
    if (f.chainT > 0 && (f.chainT -= dt) <= 0) f.chain = 0;
  }
}

function endRound(s, winner, reason, ev) {
  s.phase = "roundEnd";
  s.phaseT = 0;
  s.roundWinner = winner;
  s.roundEndReason = reason;
  if (winner >= 0) s.fighters[winner].wins++;
  for (const f of s.fighters) {
    f.attack = null;
    if (!f.ai) clearInput(f);
  }
  ev.push(reason === "ko" ? "ko" : "time");
}

function nextRound(s, ev) {
  const [a, b] = s.fighters;
  let mw = null;
  if (a.wins >= s.roundsToWin) mw = 0;
  else if (b.wins >= s.roundsToWin) mw = 1;
  else if (s.round >= MAX_ROUNDS) mw = a.wins > b.wins ? 0 : 1; // endless draws: the challenger must earn it
  if (mw !== null) {
    s.matchWinner = mw;
    s.phase = "matchOver";
    s.phaseT = 0;
    ev.push(mw === 0 ? "victory" : "defeat");
    return;
  }
  s.round++;
  resetRound(s);
}

const fresh = (s, q) => q > 0 && s.time - q <= BUFFER;

function startAttack(s, f, name, ev) {
  const m = MOVES[name];
  f.attack = { name, m, t: 0, hit: false };
  f.state = "attack";
  f.stateT = 0;
  if (!m.air) f.vx = 0;
  if (name === "special") {
    f.energy = 0;
    ev.push("special");
  } else ev.push(m.kind === "kick" ? "kickSwing" : "punchSwing");
}

function control(s, f, foe, dt, ev) {
  if (f.ai) aiUpdate(s, f, foe, dt);
  f.cd = Math.max(0, f.cd - dt);
  f.stun = Math.max(0, f.stun - dt);
  f.blockStun = Math.max(0, f.blockStun - dt);
  if (f.comboT > 0 && (f.comboT -= dt) <= 0) f.comboStep = 0;
  const inp = f.input;
  for (const k of ["jumpQ", "punchQ", "kickQ", "specialQ"]) if (inp[k] && !fresh(s, inp[k])) inp[k] = 0;

  if (f.state === "ko") return;
  if (s.phase !== "fight") {
    // no control in intro / after the bell; finish what you were doing, then settle
    if (f.attack) advanceAttack(s, f, dt);
    if (f.state === "hit" && f.stun > 0) return;
    if (f.grounded) {
      f.vx *= Math.exp(-10 * dt);
      const won = s.phase !== "intro" && (s.roundWinner === f.idx || s.matchWinner === f.idx) && s.phaseT > 0.7;
      if (!f.attack) setState(f, won ? "win" : "idle");
    }
    return;
  }
  if (f.state === "hit") {
    if (f.stun > 0) return;
    setState(f, f.grounded ? "idle" : "jump");
  }
  if (f.attack) {
    advanceAttack(s, f, dt);
    if (f.attack) return;
  }
  if (f.blockStun > 0) {
    setState(f, "block");
    return;
  }
  if (f.cd <= 0) {
    if (fresh(s, inp.specialQ) && f.grounded && f.energy >= ENERGY_MAX) {
      inp.specialQ = 0;
      f.comboStep = 0;
      startAttack(s, f, "special", ev);
      return;
    }
    if (fresh(s, inp.punchQ)) {
      if (f.grounded) {
        inp.punchQ = 0;
        const stepIdx = f.comboT > 0 ? f.comboStep : 0;
        f.comboStep = stepIdx + 1;
        startAttack(s, f, COMBO[stepIdx], ev);
        if (f.comboStep >= COMBO.length) f.comboStep = 0;
        return;
      }
      if (!f.airAttackUsed) {
        inp.punchQ = 0;
        f.airAttackUsed = true;
        startAttack(s, f, "airPunch", ev);
        return;
      }
    }
    if (fresh(s, inp.kickQ)) {
      if (f.grounded) {
        inp.kickQ = 0;
        f.comboStep = 0;
        startAttack(s, f, "kick", ev);
        return;
      }
      if (!f.airAttackUsed) {
        inp.kickQ = 0;
        f.airAttackUsed = true;
        startAttack(s, f, "airKick", ev);
        return;
      }
    }
  }
  if (!f.grounded) {
    setState(f, "jump");
    return;
  }
  if (inp.block) {
    f.vx = 0;
    setState(f, "block");
    return;
  }
  const dir = (inp.right ? 1 : 0) - (inp.left ? 1 : 0);
  if (fresh(s, inp.jumpQ)) {
    inp.jumpQ = 0;
    f.grounded = false;
    f.vy = -JUMP_V;
    f.vx = dir * WALK * 0.95 * f.speed;
    setState(f, "jump");
    ev.push("jump");
    return;
  }
  if (dir) {
    const backing = dir !== f.facing;
    f.vx = dir * WALK * f.speed * (backing ? 0.78 : 1);
    f.walkT += dt * dir * f.facing * f.speed;
    setState(f, "walk");
  } else {
    f.vx = 0;
    setState(f, "idle");
  }
}

function setState(f, st) {
  if (f.state !== st) {
    f.state = st;
    f.stateT = 0;
  }
}

function advanceAttack(s, f, dt) {
  const at = f.attack;
  const m = at.m;
  at.t += dt;
  if (at.name === "special") {
    const inActive = at.t >= m.startup && at.t < m.startup + m.active;
    f.vx = inActive ? f.facing * m.dash : 0;
    if (at.t >= m.startup && at.t - dt < m.startup) s.fx.push({ kind: "ring", x: f.x, y: f.y - 100, t: 0, life: 0.35 });
  }
  if (at.t >= moveTotal(m)) {
    f.attack = null;
    f.cd = m.cd;
    if (COMBO.includes(at.name)) f.comboT = f.comboStep ? COMBO_WINDOW : 0;
    setState(f, f.grounded ? "idle" : "jump");
  }
}

function physics(s, f, dt, ev) {
  if (!f.grounded) {
    f.vy += GRAV * dt;
    f.y += f.vy * dt;
    f.x += f.vx * dt;
    if (f.y >= FLOOR) {
      f.y = FLOOR;
      f.vy = 0;
      f.grounded = true;
      f.airAttackUsed = false;
      if (f.attack?.m.air) {
        f.attack = null;
        f.cd = 0.08;
      }
      if (f.state === "jump") setState(f, "idle");
      if (f.state !== "ko") f.vx = f.state === "hit" ? f.vx * 0.5 : 0;
      ev.push(f.state === "ko" ? "thud" : "land");
      s.fx.push({ kind: "dust", x: f.x, y: FLOOR, t: 0, life: 0.4 });
    }
  } else {
    f.x += f.vx * dt;
    if (f.state === "hit" || f.state === "ko" || f.state === "block" || f.state === "win" || (f.state === "idle" && s.phase !== "fight")) {
      f.vx *= Math.exp(-9 * dt);
    }
  }
  f.x = Math.min(WALL_R, Math.max(WALL_L, f.x));
}

/** World-space hitbox of an attack in its active frames, else null. */
export function hitbox(f) {
  const at = f.attack;
  if (!at) return null;
  const m = at.m;
  if (at.t < m.startup || at.t >= m.startup + m.active) return null;
  const [x0, x1, y0, y1] = m.box;
  return f.facing > 0 ? { l: f.x + x0, r: f.x + x1, t: f.y + y0, b: f.y + y1 } : { l: f.x - x1, r: f.x - x0, t: f.y + y0, b: f.y + y1 };
}

export function hurtbox(f) {
  if (f.state === "ko") return null;
  return { l: f.x - HURT.x, r: f.x + HURT.x, t: f.y - HURT.top, b: f.y };
}

const overlap = (p, q) => p && q && p.l < q.r && p.r > q.l && p.t < q.b && p.b > q.t;

function resolveHits(s, ev) {
  if (s.phase !== "fight") return;
  const hits = [];
  for (const a of s.fighters) {
    if (!a.attack || a.attack.hit) continue;
    const d = s.fighters[1 - a.idx];
    if (overlap(hitbox(a), hurtbox(d))) {
      a.attack.hit = true;
      hits.push([a, d, a.attack.m]);
    }
  }
  for (const [a, d, m] of hits) applyHit(s, a, d, m, ev);
  for (const [a, d] of hits) {
    if (d.hp <= 0 && s.phase === "fight") {
      // a double KO in one tick is a draw
      const other = s.fighters[1 - d.idx];
      endRound(s, other.hp <= 0 ? -1 : a.idx, "ko", ev);
    }
  }
}

function applyHit(s, a, d, m, ev) {
  const dir = d.x === a.x ? a.facing : Math.sign(d.x - a.x);
  const blocking = d.state === "block" && d.grounded && d.facing === -dir;
  const kbScale = 1 - d.kbResist;
  const hx = (a.x + d.x) / 2 + dir * 10;
  const hy = d.y - (m.kind === "kick" && !m.air ? 85 : 120);
  if (blocking) {
    const dmg = m.dmg * a.dmgMul * (m.chip ?? 0.12);
    d.hp = Math.max(Math.min(d.hp, 0.5), d.hp - dmg); // chip damage never KOs (and never heals)
    d.blockStun = 0.16 + m.stun * 0.4;
    d.vx = dir * m.kb * 0.45 * kbScale;
    a.energy = Math.min(ENERGY_MAX, a.energy + 3 * a.energyMul);
    d.energy = Math.min(ENERGY_MAX, d.energy + 5 * d.energyMul);
    a.chain = 0;
    s.hitstop = 0.035;
    s.fx.push({ kind: "block", x: hx, y: hy, t: 0, life: 0.25, dir });
    ev.push("block");
    return;
  }
  const dmg = m.dmg * a.dmgMul;
  d.hp = Math.max(0, d.hp - dmg);
  a.chain = d.state === "hit" && a.chainT > 0 ? a.chain + 1 : 1;
  a.chainT = 1.1;
  d.attack = null;
  d.comboStep = 0;
  d.comboT = 0;
  d.blockStun = 0;
  d.stun = m.stun;
  d.vx = dir * m.kb * kbScale;
  if (m.launch || !d.grounded) {
    d.vy = -(m.launch || 240) * (1 - d.kbResist * 0.5);
    d.grounded = false;
  }
  setState(d, "hit");
  if (d.hp <= 0) {
    setState(d, "ko");
    d.vy = -460;
    d.vx = dir * 320;
    d.grounded = false;
    s.slowmo = 0.9;
    s.hitstop = 0.18;
  } else s.hitstop = m.kind === "special" ? 0.12 : m.dmg >= 9 ? 0.07 : 0.05;
  a.energy = Math.min(ENERGY_MAX, a.energy + dmg * 1.5 * a.energyMul);
  d.energy = Math.min(ENERGY_MAX, d.energy + dmg * 0.8 * d.energyMul);
  s.shake = m.kind === "special" ? 10 : m.dmg >= 9 ? 6 : 3;
  s.fx.push({ kind: m.kind === "special" ? "burst" : "spark", x: hx, y: hy, t: 0, life: 0.3, dir });
  ev.push(m.kind === "special" ? "specialHit" : m.dmg >= 9 ? "heavyHit" : "hit");
}

function separate(s) {
  const [a, b] = s.fighters;
  if (a.state === "ko" || b.state === "ko") return;
  if (Math.abs(a.y - b.y) > 120) return; // jumping over the other fighter is allowed
  const dx = b.x - a.x;
  const dist = Math.abs(dx);
  if (dist >= PUSH) return;
  const sgn = dx === 0 ? (a.facing > 0 ? 1 : -1) : Math.sign(dx);
  const over = PUSH - dist;
  let ax = a.x - (sgn * over) / 2;
  let bx = b.x + (sgn * over) / 2;
  // pinned against a wall: the other fighter takes the whole push
  if (ax < WALL_L || ax > WALL_R) {
    ax = Math.min(WALL_R, Math.max(WALL_L, ax));
    bx = ax + sgn * PUSH;
  } else if (bx < WALL_L || bx > WALL_R) {
    bx = Math.min(WALL_R, Math.max(WALL_L, bx));
    ax = bx - sgn * PUSH;
  }
  a.x = Math.min(WALL_R, Math.max(WALL_L, ax));
  b.x = Math.min(WALL_R, Math.max(WALL_L, bx));
}

/* ---------------- AI ---------------- */

function aiUpdate(s, f, foe, dt) {
  const ai = f.ai;
  const p = ai.p;
  const sk = ai.skill;
  const inp = f.input;
  const rnd = s.rng;
  inp.left = inp.right = inp.block = false;
  if (s.phase !== "fight" || f.state === "ko") return;
  ai.t -= dt;
  ai.actT -= dt;
  const dx = foe.x - f.x;
  const dist = Math.abs(dx);
  const toward = dx >= 0 ? 1 : -1;
  const nearWall = f.x - WALL_L < 70 || WALL_R - f.x < 70;

  // keep a started combo string going
  if (ai.combo > 0 && !f.attack && f.comboT > 0 && dist < 100) {
    inp.punchQ = s.time;
    ai.combo--;
  }
  // a jump-in kick once close enough in the air
  if (!f.grounded && ai.jumpAtk && !f.airAttackUsed && dist < 110 && f.vy > -300) {
    inp.kickQ = s.time;
    ai.jumpAtk = false;
  }

  if (ai.t <= 0) {
    ai.t = p.think * (1.35 - 0.6 * sk) * (0.75 + 0.5 * rnd());
    const threat = foe.attack && dist < 160 && foe.attack.t < foe.attack.m.startup + foe.attack.m.active;
    const lowHp = f.hp / f.maxHp < 0.35;
    if (threat && rnd() < p.block * (0.45 + 0.55 * sk)) {
      ai.act = "block";
      ai.actT = 0.25 + 0.2 * rnd();
    } else if (f.energy >= ENERGY_MAX && dist < 230 && f.grounded && rnd() < p.special * (0.35 + 0.65 * sk)) {
      inp.specialQ = s.time;
      ai.act = "idle";
    } else if (dist > p.range + 18) {
      ai.act = "approach";
      ai.actT = 0.35 + 0.3 * rnd();
      if (f.grounded && dist < 330 && dist > 150 && rnd() < p.jump) {
        inp.jumpQ = s.time;
        ai.jumpAtk = true;
      }
    } else if (dist <= 112) {
      if (rnd() < p.aggression * (0.55 + 0.45 * sk) * (foe.state === "hit" ? 1.4 : 1)) {
        if (dist < 92 && rnd() > p.kickBias) {
          inp.punchQ = s.time;
          ai.combo = rnd() < p.combo * sk ? 2 : rnd() < p.combo ? 1 : 0;
        } else inp.kickQ = s.time;
        ai.act = "idle";
      } else if (rnd() < p.block * 0.5) {
        ai.act = "block";
        ai.actT = 0.3;
      } else if (!nearWall && rnd() < p.retreat * (lowHp ? 1.8 : 1)) {
        ai.act = "retreat";
        ai.actT = 0.2 + 0.25 * rnd();
      } else ai.act = "idle";
    } else {
      ai.act = rnd() < 0.7 ? "approach" : "idle";
      ai.actT = 0.25;
    }
  }

  if (ai.act === "block") {
    inp.block = true;
    if (ai.actT <= 0) ai.act = "idle";
  } else if (ai.act === "approach") {
    if (dist > 64) inp[toward > 0 ? "right" : "left"] = true;
    if (ai.actT <= 0 || dist <= p.range) ai.act = "idle";
  } else if (ai.act === "retreat") {
    inp[toward > 0 ? "left" : "right"] = true;
    if (ai.actT <= 0) ai.act = "idle";
  }
}
