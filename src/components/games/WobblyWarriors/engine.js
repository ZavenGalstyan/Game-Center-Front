/**
 * Wobbly Warriors engine — pure state + fixed-step physics, no DOM. The
 * component feeds `fighters[i].input` and calls step(); render.js draws.
 *
 * World units: 960 x 540, feet sit on FLOOR. Each fighter is a short capsule
 * (feet x/y) with a sprung `tilt` that fakes ragdoll wobble: walking leans it,
 * hits kick it, a KO lets it topple over.
 */

export const W = 960;
export const H = 540;
export const FLOOR = 468;
export const WALL_L = 60;
export const WALL_R = W - 60;
export const WINS_NEEDED = 3;
export const ROUND_TIME = 60;

const DT = 1 / 120;
const GRAVITY = 1900;
const MOVE_SPEED = 260;
const ACCEL = 2200;
const AIR_ACCEL = 1200;
const FRICTION = 1800;
const JUMP_V = 720;
export const HALF_W = 26; // body half width (push-apart + walls)
export const BODY_H = 118; // feet to head top
export const PUNCH_DUR = 0.3;
const PUNCH_ACTIVE = [0.08, 0.18]; // seconds into the punch where the fist can connect
const PUNCH_COOLDOWN = 0.45;
export const REACH = 92; // fist reach measured from the attacker's centre
const HIT_STUN = 0.32;
const KO_HOLD = 2.2;
const ROUND_HOLD = 2.0;
const COUNTDOWN = 3.0;
const COUNT_INTRO = 0.6; // "ROUND n" shows first, then 3-2-1

export const FIGHTERS = [
  { name: "Bonko", body: "#ff6b3d", dark: "#c2401b", belly: "#ffd0a8", band: "#ffe14d" },
  { name: "Pudge", body: "#3d9bff", dark: "#1f63b8", belly: "#c4e3ff", band: "#7dff8a" },
];

export const ARENAS = [
  { id: "backyard", name: "Sunny Backyard" },
  { id: "candy", name: "Candy Ring" },
  { id: "dock", name: "Moonlit Dock" },
];

/** Small seeded RNG so tests (and AI) are reproducible. */
function rng(seed) {
  let a = seed >>> 0 || 1;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function emptyInput() {
  return { left: false, right: false, jumpQ: false, punchQ: false };
}

function makeFighter(i) {
  return {
    i,
    ...FIGHTERS[i],
    x: i === 0 ? 300 : W - 300,
    y: FLOOR,
    vx: 0,
    vy: 0,
    onGround: true,
    facing: i === 0 ? 1 : -1,
    hp: 100,
    shownHp: 100, // lags behind hp for the bar's "drain" effect
    tilt: 0,
    tiltV: 0,
    walk: 0, // leg-swing phase
    squash: 0,
    punchT: -1, // <0 = not punching
    punchHit: false, // the current punch already landed (one damage event per attack)
    cooldown: 0,
    stun: 0,
    flash: 0,
    ko: false,
    wins: 0,
    input: emptyInput(),
  };
}

/** mode: "pvp" | "ai"; arena: index into ARENAS. */
export function create({ mode = "pvp", arena = 0, seed = Date.now() } = {}) {
  const s = {
    mode,
    arena,
    rand: rng(seed),
    phase: "countdown", // countdown | fight | ko | roundOver | matchOver | paused
    pausedFrom: null,
    phaseT: 0,
    round: 1,
    timer: ROUND_TIME,
    time: 0,
    acc: 0,
    shake: 0,
    fighters: [makeFighter(0), makeFighter(1)],
    roundWinner: -1, // -1 = draw
    matchWinner: -1,
    fx: [], // particles / pop words
    pendingHits: [],
    ai: { react: 0, jumpT: 1.5, backOff: 0 },
    lastTick: 0,
  };
  return s;
}

function resetRound(s) {
  for (const f of s.fighters) {
    const wins = f.wins;
    const input = f.input;
    Object.assign(f, makeFighter(f.i), { wins, input });
  }
  s.timer = ROUND_TIME;
  s.phase = "countdown";
  s.phaseT = 0;
  s.lastTick = 0;
  s.fx.length = 0;
  s.roundWinner = -1;
}

/** Fresh match, same mode + arena. */
export function rematch(s) {
  for (const f of s.fighters) f.wins = 0;
  s.round = 1;
  s.matchWinner = -1;
  resetRound(s);
}

export function togglePause(s) {
  if (s.phase === "paused") {
    s.phase = s.pausedFrom;
    s.pausedFrom = null;
  } else if (s.phase === "countdown" || s.phase === "fight" || s.phase === "ko" || s.phase === "roundOver") {
    s.pausedFrom = s.phase;
    s.phase = "paused";
  }
}

// ---------------------------------------------------------------- AI ----

/** Very simple bot for fighter 1: walk in, punch in range, hop sometimes. */
function aiThink(s, dt) {
  const me = s.fighters[1];
  const foe = s.fighters[0];
  const ai = s.ai;
  const inp = me.input;
  const dx = foe.x - me.x;
  const dist = Math.abs(dx);
  inp.left = inp.right = false;
  if (me.ko || foe.ko || s.phase !== "fight") return;

  ai.backOff -= dt;
  ai.jumpT -= dt;
  if (ai.backOff > 0) {
    // shuffle away for a moment after getting hit — gives the human openings
    if (dx > 0) inp.left = true;
    else inp.right = true;
  } else if (dist > REACH - 12) {
    if (dx > 0) inp.right = true;
    else inp.left = true;
    ai.react = 0.1 + s.rand() * 0.2;
  } else {
    ai.react -= dt;
    if (ai.react <= 0 && me.cooldown <= 0 && me.stun <= 0) {
      if (s.rand() < 0.85) inp.punchQ = true; // sometimes it just hesitates
      ai.react = 0.22 + s.rand() * 0.3;
    }
  }
  if (ai.jumpT <= 0) {
    if (s.rand() < 0.5) inp.jumpQ = true;
    ai.jumpT = 1.4 + s.rand() * 2.2;
  }
}

// ----------------------------------------------------------- physics ----

function pop(s, x, y, text, color) {
  s.fx.push({ kind: "word", x, y, vx: 0, vy: -60, life: 0.7, max: 0.7, text, color });
}
function burst(s, x, y, n, color) {
  for (let k = 0; k < n; k++) {
    const a = s.rand() * Math.PI * 2;
    const v = 120 + s.rand() * 260;
    s.fx.push({ kind: "dot", x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 80, life: 0.45, max: 0.45, r: 3 + s.rand() * 4, color });
  }
}

const HIT_WORDS = ["POW!", "BONK!", "WHAP!", "OOF!", "BAM!"];

function updateFighter(s, f, foe, dt, ev) {
  const inp = f.input;
  const canAct = !f.ko && f.stun <= 0 && s.phase === "fight";

  // horizontal intent
  let dir = 0;
  if (canAct) dir = (inp.right ? 1 : 0) - (inp.left ? 1 : 0);
  const target = dir * MOVE_SPEED * (f.punchT >= 0 ? 0.45 : 1);
  if (f.stun > 0 || f.ko) {
    // sliding from knockback: just friction
    const fr = (f.onGround ? FRICTION * 0.5 : 120) * dt;
    f.vx = Math.abs(f.vx) <= fr ? 0 : f.vx - Math.sign(f.vx) * fr;
  } else if (dir !== 0) {
    const a = (f.onGround ? ACCEL : AIR_ACCEL) * dt;
    f.vx += Math.max(-a, Math.min(a, target - f.vx));
  } else if (f.onGround) {
    const fr = FRICTION * dt;
    f.vx = Math.abs(f.vx) <= fr ? 0 : f.vx - Math.sign(f.vx) * fr;
  }

  // jump (latched key press, consumed this tick either way)
  if (inp.jumpQ) {
    if (canAct && f.onGround) {
      f.vy = -JUMP_V;
      f.onGround = false;
      f.squash = -0.25;
      f.tiltV += -f.facing * 1.5;
      ev.push("jump");
    }
    inp.jumpQ = false;
  }

  // punch start
  if (inp.punchQ) {
    if (canAct && f.cooldown <= 0 && f.punchT < 0) {
      f.punchT = 0;
      f.punchHit = false;
      f.cooldown = PUNCH_COOLDOWN;
      f.tiltV += f.facing * 3.5; // lean into it
      ev.push("punch");
    }
    inp.punchQ = false;
  }

  // face the opponent unless mid-punch
  if (f.punchT < 0 && !f.ko && f.stun <= 0) f.facing = foe.x >= f.x ? 1 : -1;

  // integrate
  f.vy += GRAVITY * dt;
  f.x += f.vx * dt;
  f.y += f.vy * dt;
  if (f.y >= FLOOR) {
    if (!f.onGround && f.vy > 300) {
      f.squash = Math.min(0.35, f.vy / 2400);
      f.tiltV += (s.rand() - 0.5) * 4;
      ev.push("land");
    }
    f.y = FLOOR;
    f.vy = 0;
    f.onGround = true;
  } else {
    f.onGround = false;
  }
  if (f.x < WALL_L + HALF_W) {
    f.x = WALL_L + HALF_W;
    if (f.vx < 0) f.vx = -f.vx * 0.3;
  } else if (f.x > WALL_R - HALF_W) {
    f.x = WALL_R - HALF_W;
    if (f.vx > 0) f.vx = -f.vx * 0.3;
  }

  // wobble spring: walking leans forward, KO topples over
  const lean = f.ko ? f.facing * -1.45 : (f.vx / MOVE_SPEED) * 0.22;
  const k = f.ko ? 30 : 60;
  const damp = f.ko ? 5 : 6;
  f.tiltV += (-(f.tilt - lean) * k - f.tiltV * damp) * dt;
  if (!f.ko) f.tiltV += Math.sin(s.time * 3.1 + f.i * 2) * 0.6 * dt; // idle sway
  f.tilt += f.tiltV * dt;
  if (!f.ko) f.tilt = Math.max(-0.9, Math.min(0.9, f.tilt));
  else f.tilt = Math.max(-1.55, Math.min(1.55, f.tilt));

  f.walk += Math.abs(f.vx) * dt * 0.045;
  f.squash *= Math.exp(-10 * dt);
  f.flash = Math.max(0, f.flash - dt);
  f.stun = Math.max(0, f.stun - dt);
  f.cooldown = Math.max(0, f.cooldown - dt);
  f.shownHp += (f.hp - f.shownHp) * Math.min(1, dt * 4);

  // punch timeline + hit check (only inside the active window, only once)
  if (f.punchT >= 0) {
    f.punchT += dt;
    if (!f.punchHit && f.punchT >= PUNCH_ACTIVE[0] && f.punchT <= PUNCH_ACTIVE[1] && !foe.ko && s.phase === "fight") {
      const dx = (foe.x - f.x) * f.facing; // >0 = in front
      const dy = Math.abs(foe.y - f.y);
      if (dx > 0 && dx <= REACH + HALF_W && dy < 80) {
        f.punchHit = true;
        s.pendingHits.push(f); // resolved after both fighters moved, so same-tick trades hit both
      }
    }
    if (f.punchT >= PUNCH_DUR) f.punchT = -1;
  }
}

function landHit(s, f, foe, ev) {
  const air = !foe.onGround;
  const dmg = 9 + Math.floor(s.rand() * 5) + (air ? 2 : 0);
  foe.hp = Math.max(0, foe.hp - dmg);
  foe.vx = f.facing * (380 + s.rand() * 80);
  foe.vy = -(200 + s.rand() * 80);
  foe.onGround = false;
  foe.tiltV += f.facing * 9;
  foe.stun = HIT_STUN;
  foe.flash = 0.14;
  foe.punchT = -1; // getting bonked interrupts your own punch
  s.shake = Math.max(s.shake, 0.18);
  const hx = foe.x - f.facing * 10;
  const hy = foe.y - BODY_H * 0.7;
  burst(s, hx, hy, 8, "#fff3a0");
  pop(s, hx, hy - 20, HIT_WORDS[Math.floor(s.rand() * HIT_WORDS.length)], f.band);
  ev.push("hit");
  if (s.mode === "ai" && foe.i === 1 && s.rand() < 0.3) s.ai.backOff = 0.35 + s.rand() * 0.35;
  if (foe.hp <= 0) {
    foe.ko = true;
    foe.vx = f.facing * 520;
    foe.vy = -380;
    s.shake = 0.4;
    burst(s, hx, hy, 16, "#ffffff");
  }
}

function resolveHits(s, ev) {
  if (!s.pendingHits.length) return;
  for (const f of s.pendingHits) landHit(s, f, s.fighters[1 - f.i], ev);
  s.pendingHits.length = 0;
  const [a, b] = s.fighters;
  if (a.ko || b.ko) {
    s.phase = "ko";
    s.phaseT = 0;
    s.roundWinner = a.ko && b.ko ? -1 : a.ko ? 1 : 0; // double KO = draw
    ev.push("ko");
  }
}

/** Fighters can't walk through each other. */
function separate(a, b) {
  const dx = b.x - a.x;
  const overlap = HALF_W * 2 - Math.abs(dx);
  if (overlap <= 0 || Math.abs(a.y - b.y) > BODY_H * 0.8 || a.ko || b.ko) return;
  const dir = dx === 0 ? (a.i === 0 ? 1 : -1) : Math.sign(dx);
  a.x -= dir * overlap * 0.5;
  b.x += dir * overlap * 0.5;
  for (const f of [a, b]) f.x = Math.max(WALL_L + HALF_W, Math.min(WALL_R - HALF_W, f.x));
  // pinned against a wall: the free one takes the rest of the push
  const gap = HALF_W * 2 - Math.abs(b.x - a.x);
  if (gap > 0.01) {
    if (a.x <= WALL_L + HALF_W + 0.01 || a.x >= WALL_R - HALF_W - 0.01) b.x += dir * gap;
    else a.x -= dir * gap;
  }
}

function endRound(s, winner, ev) {
  s.roundWinner = winner;
  if (winner >= 0) s.fighters[winner].wins++;
  s.phase = s.fighters.some((f) => f.wins >= WINS_NEEDED) ? "matchOver" : "roundOver";
  if (s.phase === "matchOver") s.matchWinner = winner;
  s.phaseT = 0;
  ev.push(s.phase === "matchOver" ? "match" : "round");
}

/** 3, 2, 1 during the countdown (0 while "ROUND n" is still showing). */
export function countdownNumber(s) {
  if (s.phase !== "countdown" || s.phaseT < COUNT_INTRO) return 0;
  return Math.max(1, Math.ceil((COUNTDOWN - s.phaseT) / ((COUNTDOWN - COUNT_INTRO) / 3)));
}

function tick(s, ev) {
  s.time += DT;
  s.phaseT += DT;
  s.shake = Math.max(0, s.shake - DT);
  const [a, b] = s.fighters;

  if (s.phase === "countdown") {
    const n = countdownNumber(s);
    if (n > 0 && n !== s.lastTick) {
      s.lastTick = n;
      ev.push("tick");
    }
    if (s.phaseT >= COUNTDOWN) {
      s.phase = "fight";
      s.phaseT = 0;
      ev.push("fight");
    }
  } else if (s.phase === "fight") {
    s.timer = Math.max(0, s.timer - DT);
    if (s.timer <= 0) {
      const w = a.hp === b.hp ? -1 : a.hp > b.hp ? 0 : 1;
      endRound(s, w, ev);
    }
  } else if (s.phase === "ko") {
    if (s.phaseT >= KO_HOLD) endRound(s, s.roundWinner, ev);
  } else if (s.phase === "roundOver") {
    if (s.phaseT >= ROUND_HOLD) {
      s.round++;
      resetRound(s);
    }
  }

  if (s.mode === "ai") aiThink(s, DT);
  updateFighter(s, a, b, DT, ev);
  updateFighter(s, b, a, DT, ev);
  resolveHits(s, ev);
  separate(a, b);

  for (const p of s.fx) {
    p.life -= DT;
    p.x += p.vx * DT;
    p.y += p.vy * DT;
    if (p.kind === "dot") p.vy += GRAVITY * 0.5 * DT;
  }
  if (s.fx.length) s.fx = s.fx.filter((p) => p.life > 0);
}

/** Advance real time `dt` (seconds). Returns the events that happened. */
export function step(s, dt) {
  const ev = [];
  if (s.phase === "paused" || (s.phase === "matchOver" && s.phaseT > 4)) {
    s.acc = 0;
    return ev;
  }
  s.acc += Math.min(Math.max(dt, 0), 0.1); // a long stall never spirals
  while (s.acc >= DT) {
    s.acc -= DT;
    tick(s, ev);
  }
  return ev;
}

export const TUNING = { DT, PUNCH_COOLDOWN, PUNCH_ACTIVE, COUNTDOWN, KO_HOLD, ROUND_HOLD };
