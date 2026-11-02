/**
 * The one combat simulation behind every Iron Fist fight (Arcade and Local VS).
 *
 * Deterministic fixed-step state machine, no Three.js / DOM. Each side is fed
 * an input frame `{ held: {left,right,up,down}, pressed: {punch,kick,special,dodge,jump} }`
 * — it doesn't know or care whether a keyboard or the AI produced it.
 *
 * Per step (during the `fight` phase):
 *   1. buffer presses (a tap shorter than a step, or during hit-stop, still counts)
 *   2. advance each fighter's state machine (actions, moves, stun, knockdown…)
 *   3. physics: gravity, landing, body push-apart, arena walls, facing
 *   4. collect EVERY hit of this step (strikes, projectiles, bolts) for both
 *      sides, then apply them together — trades are fair and simultaneous KOs
 *      are real double KOs. A move instance can land at most once (hitDone).
 *   5. KO / time-out → round end → next round or match over
 *
 * Events (`m.events`) tell the renderer / audio what happened; the consumer
 * drains them. World X is the fighting plane: +X is screen-right.
 */
import { SIM_DT, ROUND_TIME, WINS_NEEDED, MAX_ROUNDS, ARENA_HALF, START_GAP, PUSH_DIST, BODY_TOP, GRAVITY, JUMP_V, JUMP_VX, WALK_FWD, WALK_BACK, TURN_DELAY, BUFFER_T, DODGE, KNOCKDOWN, INTRO_T, ROUND_END_T, HITSTOP } from "./constants.js";
import { MOVES, CHAIN, CHAIN_LEN } from "./moves.js";
import { FIGHTER_BY_ID } from "./fighters.js";

export const EMPTY_INPUT = Object.freeze({ held: Object.freeze({ left: false, right: false, up: false, down: false }), pressed: Object.freeze({ punch: false, kick: false, special: false, dodge: false, jump: false }) });
const BUTTONS = ["punch", "kick", "special", "dodge", "jump"];
const sign = (v) => (v > 0 ? 1 : v < 0 ? -1 : 0);
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const EPS = 1e-6; // float slack for frame-exact phase checks
const approach = (v, t, d) => (v < t ? Math.min(t, v + d) : Math.max(t, v - d));

/* ================================================================ creation */
function makeFighter(side, def, mods = {}) {
  const maxHp = Math.round(def.stats.hp * (mods.hpMul ?? 1));
  return {
    side,
    id: def.id,
    def,
    name: def.name,
    stats: def.stats,
    mods: { hpMul: mods.hpMul ?? 1, dmgMul: mods.dmgMul ?? 1 },
    special: MOVES[def.special],
    maxHp,
    hp: maxHp,
    x: 0,
    y: 0,
    vx: 0,
    vy: 0,
    facing: side === 0 ? 1 : -1,
    state: "intro",
    st: 0,
    move: null,
    mt: 0,
    hitDone: false,
    connected: false,
    chain: -1,
    airUsed: false,
    spawned: false,
    teleported: false,
    armorUsed: false,
    stun: 0,
    turnT: 0,
    combo: 0, // hits taken in the opponent's current combo
    buf: { punch: 0, kick: 0, special: 0, dodge: 0, jump: 0 },
    cdSpecial: 0,
    cdDodge: 0,
    moveSeq: 0, // increments per started move (renderer restarts clips on change)
    hitSeq: 0, // increments per hit / block taken
    lastHit: null, // { move, level, blocked }
    rec: { hits: 0, blocked: 0, dmg: 0, maxCombo: 0, specials: 0 },
  };
}

/**
 * cfg: { fighters: [idA, idB], arena, mode: 'arcade'|'vs', mods?: [{hpMul,dmgMul}, …],
 *        alt?: [bool,bool], roundTime?, winsNeeded? }
 */
export function createMatch(cfg) {
  const defs = cfg.fighters.map((id) => FIGHTER_BY_ID[id]);
  if (!defs[0] || !defs[1]) throw new Error(`unknown fighter ${cfg.fighters}`);
  const m = {
    cfg: { roundTime: ROUND_TIME, winsNeeded: WINS_NEEDED, ...cfg },
    f: [makeFighter(0, defs[0], cfg.mods?.[0]), makeFighter(1, defs[1], cfg.mods?.[1])],
    phase: "intro",
    phaseT: 0,
    round: 0,
    wins: [0, 0],
    clock: ROUND_TIME,
    freeze: 0,
    time: 0,
    order: 1, // sign(f1.x − f0.x), kept for exact overlaps
    projectiles: [],
    bolts: [],
    events: [],
    roundLog: [],
    roundWinner: null,
    roundReason: null,
    result: null,
    seq: 0,
  };
  startRound(m);
  return m;
}

function emit(m, e) {
  e.t = m.time;
  m.events.push(e);
  if (m.events.length > 400) m.events.splice(0, m.events.length - 400); // nobody draining (tests)
}

function startRound(m) {
  m.round++;
  m.phase = "intro";
  m.phaseT = 0;
  m.clock = m.cfg.roundTime;
  m.freeze = 0;
  m.projectiles = [];
  m.bolts = [];
  m.roundWinner = null;
  m.roundReason = null;
  m.order = 1;
  for (const F of m.f) {
    F.x = F.side === 0 ? -START_GAP / 2 : START_GAP / 2;
    F.y = 0;
    F.vx = F.vy = 0;
    F.facing = F.side === 0 ? 1 : -1;
    F.hp = F.maxHp;
    F.state = "intro";
    F.st = 0;
    F.move = null;
    F.mt = 0;
    F.chain = -1;
    F.combo = 0;
    F.stun = 0;
    F.turnT = 0;
    F.cdSpecial = 0;
    F.cdDodge = 0;
    F.lastHit = null;
    for (const k of BUTTONS) F.buf[k] = 0;
  }
  emit(m, { type: "round", round: m.round, final: m.wins[0] === m.cfg.winsNeeded - 1 && m.wins[1] === m.cfg.winsNeeded - 1 });
}

/* ================================================================ queries */
const tempo = (F) => F.stats.tempo;
export function moveTimes(F, mv = F.move) {
  const T = tempo(F);
  return { S: mv.startup * T, A: mv.active * T, R: mv.recovery * T };
}
export function isInvulnerable(F) {
  if (F.state === "knockdown" || F.state === "getup" || F.state === "ko") return true;
  if (F.state === "dodge") return F.st >= DODGE.invulFrom && F.st <= DODGE.invulTo;
  if (F.state === "attack" && F.move?.vanish) {
    const T = tempo(F);
    return F.mt >= F.move.vanish[0] * T && F.mt <= F.move.vanish[1] * T;
  }
  return false;
}
/** Vanished fighters (Shadow Step) pass through the opponent's body. */
const isGhost = (F) => F.state === "attack" && !!F.move?.vanish && F.mt >= F.move.vanish[0] * tempo(F) && F.mt <= F.move.vanish[1] * tempo(F);
const grounded = (F) => F.y <= 0 && F.vy <= 0;
const canAct = (F) => F.state === "idle" || F.state === "walk" || F.state === "block";
export function isBlocking(F, fromX) {
  return (F.state === "block" || F.state === "blockstun") && F.facing === (sign(fromX - F.x) || F.facing);
}
export const specialReady = (F) => F.cdSpecial <= 0;

/* ================================================================ actions */
function startMove(m, F, id, chainIdx = -1) {
  const mv = MOVES[id];
  F.state = "attack";
  F.st = 0;
  F.move = mv;
  F.mt = 0;
  F.hitDone = false;
  F.connected = false;
  F.spawned = false;
  F.teleported = false;
  F.armorUsed = false;
  F.chain = chainIdx;
  F.moveSeq++;
  if (mv.kind === "special") {
    F.cdSpecial = mv.cooldown;
    F.rec.specials++;
    emit(m, { type: "special", side: F.side, move: id, x: F.x });
  } else emit(m, { type: "swing", side: F.side, move: id, kind: mv.kind });
}

function tryAction(m, F, inp) {
  const b = F.buf;
  if (b.special > 0 && specialReady(F)) {
    b.special = 0;
    startMove(m, F, F.def.special);
    return true;
  }
  if (b.punch > 0 || b.kick > 0) {
    const btn = b.punch > 0 ? "punch" : "kick";
    b[btn] = 0;
    startMove(m, F, CHAIN[btn][0], 0);
    return true;
  }
  if (b.dodge > 0 && F.cdDodge <= 0) {
    b.dodge = 0;
    F.state = "dodge";
    F.st = 0;
    F.vx = 0;
    F.cdDodge = DODGE.cooldown;
    F.moveSeq++;
    emit(m, { type: "dodge", side: F.side });
    return true;
  }
  if ((inp.held.up || b.jump > 0) && grounded(F)) {
    b.jump = 0;
    const dir = (inp.held.right ? 1 : 0) - (inp.held.left ? 1 : 0);
    F.state = "jump";
    F.st = 0;
    F.vy = JUMP_V * Math.sqrt(F.stats.jump);
    F.vx = dir * JUMP_VX * F.stats.speed;
    F.airUsed = false;
    F.moveSeq++;
    emit(m, { type: "jump", side: F.side });
    return true;
  }
  return false;
}

/* ================================================================ fighter update */
function updateFighter(m, F, O, inp, dt) {
  F.st += dt;
  F.cdSpecial = Math.max(0, F.cdSpecial - dt);
  F.cdDodge = Math.max(0, F.cdDodge - dt);
  switch (F.state) {
    case "idle":
    case "walk":
    case "block": {
      if (tryAction(m, F, inp)) break;
      if (inp.held.down) {
        if (F.state !== "block") F.st = 0;
        F.state = "block";
        F.vx = 0;
      } else {
        const dir = (inp.held.right ? 1 : 0) - (inp.held.left ? 1 : 0);
        const spd = dir === F.facing ? WALK_FWD : WALK_BACK;
        F.vx = dir * spd * F.stats.speed;
        const ns = dir ? "walk" : "idle";
        if (ns !== F.state) F.st = 0;
        F.state = ns;
      }
      break;
    }
    case "jump":
      if ((F.buf.punch > 0 || F.buf.kick > 0) && !F.airUsed && F.y > 0.15) {
        F.buf.punch = F.buf.kick = 0;
        F.airUsed = true;
        const vx = F.vx;
        startMove(m, F, "jumpKick");
        F.vx = vx; // keep the jump arc
      }
      break;
    case "attack":
      advanceMove(m, F, O, dt);
      break;
    case "hitstun":
    case "blockstun":
      F.stun -= dt;
      if (grounded(F)) F.vx = approach(F.vx, 0, 11 * dt);
      if (F.stun <= 0 && grounded(F)) toIdle(F);
      break;
    case "knockdown":
      if (grounded(F)) F.vx = approach(F.vx, 0, 9 * dt);
      if (F.st >= KNOCKDOWN.fall + KNOCKDOWN.lie && grounded(F)) {
        F.state = "getup";
        F.st = 0;
        F.vx = 0;
        emit(m, { type: "getup", side: F.side });
      }
      break;
    case "getup":
      if (F.st >= KNOCKDOWN.getup) toIdle(F);
      break;
    case "dodge":
      if (F.st >= DODGE.total) toIdle(F);
      break;
    case "ko":
    case "win":
    case "lose":
    case "intro":
      if (grounded(F)) F.vx = approach(F.vx, 0, 8 * dt);
      break;
    default:
      toIdle(F);
  }
}

function toIdle(F) {
  F.state = "idle";
  F.st = 0;
  F.move = null;
  F.chain = -1;
  F.combo = 0;
}

function advanceMove(m, F, O, dt) {
  const mv = F.move;
  const { S, A, R } = moveTimes(F);
  F.mt += dt;
  if (!mv.air) {
    if (mv.advance && F.mt < S + A && !(mv.type === "rush" && F.connected)) F.vx = F.facing * mv.advance * (mv.kind === "special" ? Math.sqrt(F.stats.speed) : 1);
    else F.vx = approach(F.vx, 0, 30 * dt);
  }
  // special behaviours
  if (mv.type === "projectile" && !F.spawned && F.mt >= S - EPS) {
    F.spawned = true;
    const p = mv.proj;
    m.projectiles.push({ id: ++m.seq, owner: F.side, x: F.x + F.facing * 0.55, y: p.y, vx: F.facing * p.speed, r: p.r, life: p.life, move: mv, dead: false });
    emit(m, { type: "projectile", side: F.side, x: F.x + F.facing * 0.55, y: p.y });
  }
  if (mv.type === "bolt" && !F.spawned && F.mt >= S - EPS) {
    F.spawned = true;
    m.bolts.push({ id: ++m.seq, owner: F.side, x: O.x, t: mv.bolt.delay, r: mv.bolt.r, move: mv, dead: false });
    emit(m, { type: "boltMark", side: F.side, x: O.x });
  }
  if (mv.type === "teleport" && !F.teleported && F.mt >= mv.teleportAt * tempo(F)) {
    F.teleported = true;
    const fromX = F.x;
    let tx = O.x - O.facing * 0.9;
    if (Math.abs(tx) > ARENA_HALF) tx = O.x + O.facing * 0.9;
    F.x = clamp(tx, -ARENA_HALF, ARENA_HALF);
    F.facing = sign(O.x - F.x) || F.facing;
    emit(m, { type: "teleport", side: F.side, from: fromX, to: F.x });
  }
  // chain into the next hit of the 3-hit combo (during recovery, only after contact)
  if ((mv.kind === "punch" || mv.kind === "kick") && F.connected && F.chain >= 0 && F.chain < CHAIN_LEN - 1 && F.mt >= S + A) {
    const btn = F.buf.punch > 0 ? "punch" : F.buf.kick > 0 ? "kick" : null;
    if (btn) {
      F.buf[btn] = 0;
      const next = F.chain + 1;
      startMove(m, F, CHAIN[btn][next], next);
      return;
    }
  }
  if (!mv.air && F.mt >= S + A + R - EPS) toIdle(F);
}

/* ================================================================ physics */
function physics(m, dt) {
  for (const F of m.f) {
    if (F.y > 0 || F.vy > 0) {
      F.vy -= GRAVITY * dt;
      F.y += F.vy * dt;
      if (F.y <= 0) {
        F.y = 0;
        F.vy = 0;
        emit(m, { type: "land", side: F.side, hard: F.state === "knockdown" || F.state === "ko" });
        if (F.state === "jump" || (F.state === "attack" && F.move?.air)) {
          toIdle(F);
          F.vx = 0;
        }
      }
    }
    F.x += F.vx * dt;
  }
  separate(m);
  for (const F of m.f) {
    const O = m.f[1 - F.side];
    const want = sign(O.x - F.x);
    if (want && want !== F.facing && (canAct(F) || F.state === "intro")) {
      F.turnT += dt;
      if (F.turnT >= TURN_DELAY) {
        F.facing = want;
        F.turnT = 0;
      }
    } else F.turnT = 0;
  }
}

function separate(m) {
  const [a, b] = m.f;
  for (const F of m.f) F.x = clamp(F.x, -ARENA_HALF, ARENA_HALF);
  if (!isGhost(a) && !isGhost(b) && Math.abs(a.y - b.y) < 1.25) {
    const dx = b.x - a.x;
    if (Math.abs(dx) < PUSH_DIST) {
      const s = sign(dx) || m.order;
      const over = PUSH_DIST - Math.abs(dx);
      a.x -= (s * over) / 2;
      b.x += (s * over) / 2;
      // a wall stops one body: the other takes the whole correction
      for (const [F, O, d] of [
        [a, b, -s],
        [b, a, s],
      ]) {
        if (Math.abs(F.x) > ARENA_HALF) {
          const ex = F.x - clamp(F.x, -ARENA_HALF, ARENA_HALF);
          F.x -= ex;
          O.x -= ex;
          void d;
        }
      }
    }
  }
  const o = sign(b.x - a.x);
  if (o) m.order = o;
}

/* ================================================================ hits */
function overlaps(F, O, mv) {
  const dx = (O.x - F.x) * F.facing;
  if (dx < -0.15 || dx > mv.reach) return false;
  const lo = F.y + mv.band[0];
  const hi = F.y + mv.band[1];
  return lo < O.y + BODY_TOP && hi > O.y;
}

function activeStrike(F) {
  if (F.state !== "attack" || F.hitDone) return false;
  const mv = F.move;
  if (mv.type === "projectile" || mv.type === "bolt") return false;
  const { S, A } = moveTimes(F);
  return F.mt >= S - EPS && F.mt < S + A - EPS;
}

function collectHits(m, dt) {
  const hits = [];
  for (const F of m.f) {
    const O = m.f[1 - F.side];
    if (activeStrike(F) && overlaps(F, O, F.move) && !isInvulnerable(O)) {
      F.hitDone = true;
      hits.push({ a: F, d: O, move: F.move, fromX: F.x });
    }
  }
  // projectiles
  for (const p of m.projectiles) {
    if (p.dead) continue;
    p.x += p.vx * dt;
    p.life -= dt;
    if (p.life <= 0 || Math.abs(p.x) > ARENA_HALF + 1.5) {
      p.dead = true;
      emit(m, { type: "projFade", id: p.id, x: p.x, y: p.y });
      continue;
    }
    const T = m.f[1 - p.owner];
    if (Math.abs(T.x - p.x) < p.r + 0.28 && p.y - p.r < T.y + BODY_TOP && p.y + p.r > T.y && !isInvulnerable(T)) {
      p.dead = true;
      hits.push({ a: m.f[p.owner], d: T, move: p.move, fromX: p.x - p.vx * 0.05, proj: p });
    }
  }
  // two waves meeting cancel out
  for (const p of m.projectiles)
    for (const q of m.projectiles)
      if (p !== q && !p.dead && !q.dead && p.owner !== q.owner && Math.abs(p.x - q.x) < p.r + q.r) {
        p.dead = q.dead = true;
        emit(m, { type: "clash", x: (p.x + q.x) / 2, y: p.y });
      }
  m.projectiles = m.projectiles.filter((p) => !p.dead);
  // lightning bolts
  for (const b of m.bolts) {
    b.t -= dt;
    if (b.t > 0) continue;
    b.dead = true;
    emit(m, { type: "bolt", side: b.owner, x: b.x });
    const T = m.f[1 - b.owner];
    if (Math.abs(T.x - b.x) <= b.r + 0.25 && !isInvulnerable(T)) hits.push({ a: m.f[b.owner], d: T, move: b.move, fromX: m.f[b.owner].x, bolt: b });
  }
  m.bolts = m.bolts.filter((b) => !b.dead);
  return hits;
}

function applyHit(m, h) {
  const { a, d, move } = h;
  const away = sign(d.x - h.fromX) || -d.facing;
  const blocked = !move.unblockable && isBlocking(d, h.fromX);
  const power = a.stats.power * a.mods.dmgMul;
  const hx = d.x - away * 0.22;
  const hy = d.y + (move.level === "low" ? 0.45 : move.level === "mid" ? 1.1 : 1.5);
  a.connected = true;
  if (move.type === "rush") a.vx = 0;
  d.hitSeq++;
  if (blocked) {
    const dmg = Math.round(move.dmg * power * (move.chip ?? 0));
    d.hp = Math.max(1, d.hp - dmg);
    d.state = "blockstun";
    d.st = 0;
    d.stun = move.blockstun;
    d.vx = away * move.push * 0.55 * d.stats.weight;
    d.lastHit = { move: move.id, level: move.level, blocked: true };
    d.rec.blocked++;
    m.freeze = Math.max(m.freeze, HITSTOP.light * 0.8);
    emit(m, { type: "block", side: a.side, target: d.side, move: move.id, dmg, x: hx, y: hy, special: move.kind === "special" });
  } else {
    const armored = d.state === "attack" && d.move?.armor && !d.armorUsed && d.mt < moveTimes(d).S;
    const scale = d.combo > 0 && (d.state === "hitstun" || d.state === "knockdown") ? Math.max(0.6, 1 - 0.12 * d.combo) : 1;
    const dmg = Math.max(1, Math.round(move.dmg * power * scale * (armored ? 0.7 : 1)));
    d.hp = Math.max(0, d.hp - dmg);
    d.combo = d.state === "hitstun" ? d.combo + 1 : 1;
    a.rec.hits++;
    a.rec.dmg += dmg;
    a.rec.maxCombo = Math.max(a.rec.maxCombo, d.combo);
    d.lastHit = { move: move.id, level: move.level, blocked: false };
    const heavy = !!(move.heavy || move.knockdown || move.kind === "special");
    if (armored && d.hp > 0) {
      d.armorUsed = true;
      emit(m, { type: "armor", side: d.side, x: hx, y: hy });
    } else if (d.hp <= 0) {
      d.state = "ko";
      d.st = 0;
      d.move = null;
      d.vx = away * 3.4 * d.stats.weight;
      d.vy = 3.8;
    } else if (move.knockdown || d.y > 0.05) {
      d.state = "knockdown";
      d.st = 0;
      d.move = null;
      d.chain = -1;
      d.vx = away * move.push * d.stats.weight;
      d.vy = 3.2;
    } else {
      d.state = "hitstun";
      d.st = 0;
      d.move = null;
      d.chain = -1;
      d.stun = move.hitstun;
      d.vx = away * move.push * d.stats.weight;
    }
    m.freeze = Math.max(m.freeze, move.kind === "special" ? HITSTOP.special : heavy ? HITSTOP.heavy : HITSTOP.light);
    emit(m, { type: "hit", side: a.side, target: d.side, move: move.id, kind: move.kind, level: move.level, dmg, heavy, combo: d.combo, x: hx, y: hy, ko: d.hp <= 0, armored });
  }
  // cornered defender: the attacker takes the pushback instead
  if (Math.abs(d.x) >= ARENA_HALF - 0.05 && !h.proj && !h.bolt && grounded(a)) a.vx = -away * move.push * 0.45;
}

/* ================================================================ rounds */
function endRound(m, winner, reason) {
  m.phase = "roundEnd";
  m.phaseT = 0;
  m.roundWinner = winner;
  const W = winner >= 0 ? m.f[winner] : null;
  const perfect = reason === "ko" && !!W && W.hp === W.maxHp;
  m.roundReason = perfect ? "perfect" : reason;
  if (winner >= 0) m.wins[winner]++;
  m.projectiles = [];
  m.bolts = [];
  m.roundLog.push({ round: m.round, winner, reason: m.roundReason, hp: m.f.map((F) => F.hp / F.maxHp) });
  if (reason === "time")
    for (const F of m.f) {
      if (F.state === "ko") continue;
      F.state = F.side === winner ? "win" : "lose";
      F.st = 0;
      F.move = null;
    }
  emit(m, { type: "roundEnd", winner, reason: m.roundReason, round: m.round });
}

function finishRoundEnd(m) {
  const need = m.cfg.winsNeeded;
  const done = m.wins[0] >= need || m.wins[1] >= need || m.round >= MAX_ROUNDS;
  if (!done) return startRound(m);
  m.phase = "matchOver";
  m.phaseT = 0;
  const winner = m.wins[0] === m.wins[1] ? -1 : m.wins[0] > m.wins[1] ? 0 : 1;
  m.result = { winner, wins: [...m.wins], rounds: m.round, log: m.roundLog, rec: m.f.map((F) => ({ ...F.rec })), hpLeft: m.f.map((F) => F.hp / F.maxHp) };
  for (const F of m.f) {
    if (F.state === "ko") continue;
    F.state = winner === F.side ? "win" : "lose";
    F.st = 0;
    F.move = null;
  }
  emit(m, { type: "matchOver", winner });
}

/* ================================================================ step */
export function step(m, inputs, dt = SIM_DT) {
  m.time += dt;
  m.phaseT += dt;
  const ins = [inputs?.[0] || EMPTY_INPUT, inputs?.[1] || EMPTY_INPUT];
  // buffer presses first, so taps during hit-stop / intro count when allowed
  for (const F of m.f) {
    const p = ins[F.side].pressed;
    for (const k of BUTTONS) F.buf[k] = p[k] ? BUFFER_T : Math.max(0, F.buf[k] - dt);
  }
  switch (m.phase) {
    case "intro":
      for (const F of m.f) F.st += dt;
      if (m.phaseT >= INTRO_T) {
        m.phase = "fight";
        m.phaseT = 0;
        for (const F of m.f) {
          toIdle(F);
          for (const k of BUTTONS) F.buf[k] = 0;
        }
        emit(m, { type: "fight", round: m.round });
      }
      return;
    case "fight": {
      if (m.freeze > 0) {
        m.freeze = Math.max(0, m.freeze - dt);
        return;
      }
      m.clock = Math.max(0, m.clock - dt);
      const [a, b] = m.f;
      updateFighter(m, a, b, ins[0], dt);
      updateFighter(m, b, a, ins[1], dt);
      physics(m, dt);
      const hits = collectHits(m, dt);
      for (const h of hits) applyHit(m, h);
      if (hits.length) separate(m); // an interrupted vanish must not leave bodies overlapping
      const ko = m.f.filter((F) => F.state === "ko");
      if (ko.length) {
        const winner = ko.length === 2 ? -1 : 1 - ko[0].side;
        emit(m, { type: "ko", winner, double: ko.length === 2 });
        endRound(m, winner, ko.length === 2 ? "double" : "ko");
      } else if (m.clock <= 0) {
        const r = m.f.map((F) => F.hp / F.maxHp);
        const winner = Math.abs(r[0] - r[1]) < 1e-9 ? -1 : r[0] > r[1] ? 0 : 1;
        emit(m, { type: "timeUp", winner });
        endRound(m, winner, "time");
      }
      return;
    }
    case "roundEnd": {
      if (m.freeze > 0) m.freeze = Math.max(0, m.freeze - dt);
      for (const F of m.f) {
        const O = m.f[1 - F.side];
        updateFighter(m, F, O, EMPTY_INPUT, dt);
        // the survivor celebrates once the dust settles
        if (m.phaseT > 1.1 && F.side === m.roundWinner && (F.state === "idle" || F.state === "walk" || F.state === "block")) {
          F.state = "win";
          F.st = 0;
        }
      }
      physics(m, dt);
      if (m.phaseT >= ROUND_END_T) finishRoundEnd(m);
      return;
    }
    case "matchOver":
      for (const F of m.f) F.st += dt;
      physics(m, dt);
      return;
  }
}

/** Start the same pairing again (VS rematch / arcade retry). */
export function rematch(m) {
  return createMatch(m.cfg);
}
