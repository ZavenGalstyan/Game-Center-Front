/**
 * Shadow Arena — deterministic one-on-one fight simulation (fixed 60 Hz).
 *
 *   const m = createMatch({ fighters: ["flame", "frost"], arena: "temple" });
 *   const events = step(m, [input0, input1]);
 *
 * An input is `{ l, r, block, jump, punch, kick, special }`: l/r/block are
 * held states, jump/punch/kick/special are one-shot presses for this tick.
 * Humans and the AI feed the exact same structure, so the AI has no extra
 * powers. Both fighters are advanced from the same tick's inputs and every
 * hit of a tick is collected before any is applied, so neither side gets an
 * ordering advantage (trades and double KOs are real).
 *
 * Every attack and projectile carries a serial `id`.
 *
 * Phases: intro → fight → ko | timeup → (next round intro) … → over.
 */
import {
  FIGHTER_BY_ID, GRAVITY, BACK_SPEED, FRICTION, BUFFER, INV_AFTER, LAND_LAG, HITSTOP,
  BOUND_L, BOUND_R, ROUNDS_TO_WIN, MAX_ROUNDS, INTRO_F, OUTRO_F, clamp,
} from "./data.js";

export const NO_INPUT = Object.freeze({ l: false, r: false, block: false, jump: false, punch: false, kick: false, special: false });

const START_X = [300, 660];
const FREE = new Set(["idle", "walk", "block", "jump"]);

export function makeFighter(def, side, { hpMul = 1, alt = false } = {}) {
  const maxHp = Math.round(def.hp * hpMul);
  return {
    def,
    side,
    pal: alt ? def.alt : def.pal,
    x: START_X[side],
    y: 0,
    vx: 0,
    vy: 0,
    face: side === 0 ? 1 : -1,
    hp: maxHp,
    maxHp,
    lag: maxHp, // trailing "recent damage" bar for the HUD
    lagHold: 0,
    state: "idle",
    t: 0,
    stun: 0,
    inv: 0,
    frozen: 0,
    atk: null, // { name, move, t, hit, air, stop }
    cd: 0, // special cooldown
    buf: null, // buffered attack name
    bufT: 0,
    jbuf: 0,
    airUsed: false,
    lastDir: 0,
    stats: { hits: 0, blocked: 0, dmg: 0 },
  };
}

/**
 * cfg: { fighters: [id, id], arena, roundTime (s), hpMul?: [a, b], dmgMul?: [a, b], mode? }
 * Mirror matches automatically give player 2 the alternate palette.
 */
export function createMatch(cfg) {
  const c = { roundTime: 60, hpMul: [1, 1], dmgMul: [1, 1], mode: "vs", ...cfg };
  const m = {
    cfg: c,
    round: 1,
    wins: [0, 0],
    draws: 0,
    phase: "intro",
    t: 0,
    time: c.roundTime * 60,
    f: [],
    projs: [],
    hitstop: 0,
    shake: 0,
    roundWinner: null, // 0 | 1 | -1 (draw) once a round ends
    roundReason: null, // "ko" | "double" | "time"
    winner: null, // 0 | 1 | -1 when the match is over
    frame: 0,
    serial: 0, // ids for attacks and projectiles
    events: [],
    stats: [0, 1].map(() => ({ hits: 0, blocked: 0, dmg: 0 })), // whole-match totals per side
  };
  resetRound(m);
  return m;
}

function resetRound(m) {
  const c = m.cfg;
  const [a, b] = c.fighters;
  m.f = [makeFighter(FIGHTER_BY_ID[a], 0, { hpMul: c.hpMul[0] }), makeFighter(FIGHTER_BY_ID[b], 1, { hpMul: c.hpMul[1], alt: a === b })];
  m.f.forEach((f, i) => (f.stats = m.stats[i])); // stats carry across rounds
  m.projs = [];
  m.phase = "intro";
  m.t = 0;
  m.time = c.roundTime * 60;
  m.hitstop = 0;
  m.shake = 0;
  m.roundWinner = null;
  m.roundReason = null;
}

export const isFree = (f) => FREE.has(f.state);
export const isActive = (f) => f.state === "attack" && f.atk.t > f.atk.move.startup && f.atk.t <= f.atk.move.startup + f.atk.move.active;
export const attackLength = (mv) => mv.startup + mv.active + mv.recovery;

/** world-space hitbox of the fighter's current attack, or null */
export function attackBox(f) {
  if (!isActive(f) || f.atk.move.kind === "projectile") return null;
  const b = f.atk.move.box;
  const s = f.def.scale;
  const x0 = f.face > 0 ? f.x + b.x0 * s : f.x - b.x1 * s;
  const x1 = f.face > 0 ? f.x + b.x1 * s : f.x - b.x0 * s;
  return { x0, x1, y0: f.y + b.y0 * s, y1: f.y + b.y1 * s };
}

export const hurtBox = (f) => ({ x0: f.x - f.def.w / 2, x1: f.x + f.def.w / 2, y0: f.y, y1: f.y + f.def.h });
export const projBox = (p) => ({ x0: p.x - p.w / 2, x1: p.x + p.w / 2, y0: p.y - p.h / 2, y1: p.y + p.h / 2 });
const overlap = (a, b) => a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;

function setState(f, s) {
  f.state = s;
  f.t = 0;
}

/* ------------------------------------------------------------------ input */

function intake(f, inp) {
  if (f.bufT > 0 && --f.bufT === 0) f.buf = null;
  if (f.jbuf > 0) f.jbuf--;
  // one buffered attack at a time; the strongest press of a tick wins
  const press = inp.special ? "special" : inp.kick ? "kick" : inp.punch ? "punch" : null;
  if (press) {
    f.buf = press;
    f.bufT = BUFFER;
  }
  if (inp.jump) f.jbuf = BUFFER;
}

function tryAttack(m, f, name, ev) {
  const mv = f.def.moves[name];
  const air = f.y > 0;
  if (air && (name === "special" || f.airUsed)) return false;
  if (name === "special") {
    if (f.cd > 0) return false;
    if (mv.kind === "projectile" && m.projs.some((p) => p.owner === f.side)) return false;
  }
  setState(f, "attack");
  f.atk = { id: ++m.serial, name, move: mv, t: 0, hit: false, air, stop: false };
  if (air) f.airUsed = true;
  else f.vx = 0;
  ev.push({ type: name === "special" ? "special" : "swing", name, kind: mv.fx || mv.kind, side: f.side, x: f.x, y: f.y });
  return true;
}

function control(m, f, inp, ev) {
  const ground = f.y <= 0;
  if (ground && inp.block) {
    // blocking has priority: attacks pressed while guarding are dropped
    f.buf = null;
    if (f.state !== "block") setState(f, "block");
    f.vx = 0;
    return;
  }
  if (f.buf && tryAttack(m, f, f.buf, ev)) {
    f.buf = null;
    return;
  }
  if (!ground) return; // jumps are committed arcs
  if (f.jbuf > 0) {
    f.jbuf = 0;
    const dir = (inp.r ? 1 : 0) - (inp.l ? 1 : 0);
    setState(f, "jump");
    f.vy = f.def.jump;
    f.y = 0.01;
    f.vx = dir * f.def.speed * 1.12;
    ev.push({ type: "jump", side: f.side, x: f.x, y: 0 });
    return;
  }
  const dir = (inp.r ? 1 : 0) - (inp.l ? 1 : 0);
  if (dir) {
    f.vx = dir * f.def.speed * (dir === f.face ? 1 : BACK_SPEED);
    if (f.state !== "walk") setState(f, "walk");
  } else {
    f.vx = 0;
    if (f.state !== "idle") setState(f, "idle");
  }
}

/* ------------------------------------------------------------------ update */

function stepAttack(m, f, ev) {
  const a = f.atk;
  const mv = a.move;
  a.t++;
  const active = a.t > mv.startup && a.t <= mv.startup + mv.active;
  if ((mv.kind === "dash" || mv.kind === "spin") && !a.air) {
    if (active && !a.stop) f.vx = f.face * mv.dashV;
    else if (a.t > mv.startup) f.vx *= 0.6;
  }
  if (mv.kind === "projectile" && a.t === mv.startup + 1) {
    const p = mv.proj;
    m.projs.push({ id: ++m.serial, owner: f.side, x: f.x + f.face * (f.def.w / 2 + 14), y: f.y + p.y * f.def.scale, vx: f.face * p.speed, w: p.w, h: p.h, life: p.life, move: mv, fx: p.fx, t: 0 });
    ev.push({ type: "proj", side: f.side, kind: p.fx, x: f.x, y: f.y + p.y });
  }
  if (a.t >= attackLength(mv)) {
    if (a.name === "special") f.cd = mv.cd;
    f.atk = null;
    setState(f, f.y > 0 ? "jump" : "idle");
  }
}

function physics(f, ev) {
  if (f.y > 0 || f.vy > 0) {
    f.vy -= GRAVITY;
    f.y += f.vy;
    if (f.y <= 0) {
      f.y = 0;
      f.vy = 0;
      f.airUsed = false;
      if (f.state === "jump") {
        setState(f, "idle");
        f.vx = 0;
        ev.push({ type: "land", side: f.side, x: f.x, y: 0 });
      } else if (f.state === "attack" && f.atk.air) {
        f.atk = null;
        setState(f, "land");
        f.vx = 0;
        ev.push({ type: "land", side: f.side, x: f.x, y: 0 });
      } else if (f.state === "ko") {
        f.vx *= 0.5;
        ev.push({ type: "thud", side: f.side, x: f.x, y: 0 });
      }
    }
  } else if (!(f.state === "attack" && (f.atk.move.kind === "dash" || f.atk.move.kind === "spin")) && !isFree(f)) {
    f.vx *= FRICTION;
    if (Math.abs(f.vx) < 0.05) f.vx = 0;
  }
  f.x = clamp(f.x + f.vx, BOUND_L + f.def.w / 2, BOUND_R - f.def.w / 2);
}

function updateFighter(m, f, inp, ev) {
  if (f.inv > 0) f.inv--;
  if (f.cd > 0) f.cd--;
  if (f.frozen > 0) f.frozen--;
  f.t++;
  if (f.lagHold > 0) f.lagHold--;
  else if (f.lag > f.hp) f.lag = Math.max(f.hp, f.lag - 0.6);
  else f.lag = f.hp;

  const ground = f.y <= 0;
  switch (f.state) {
    case "hit":
    case "blockstun":
      if (--f.stun <= 0 && ground) setState(f, f.state === "blockstun" && inp.block ? "block" : "idle");
      break;
    case "attack":
      stepAttack(m, f, ev);
      break;
    case "land":
      if (f.t >= LAND_LAG) setState(f, "idle");
      break;
    default:
  }
  if (isFree(f)) control(m, f, inp, ev);
  physics(f, ev);
}

/** keep the two bodies from overlapping; a jumper high enough can pass over */
function separate(m) {
  const [a, b] = m.f;
  if (a.state === "ko" || b.state === "ko") return;
  const minD = (a.def.w + b.def.w) / 2;
  const vert = a.y < b.y + b.def.h * 0.78 && b.y < a.y + a.def.h * 0.78;
  const dx = a.x - b.x;
  if (!vert || Math.abs(dx) >= minD) return;
  // a sits left of b unless clearly right of it (ties keep the start sides)
  const dir = dx > 0.5 ? 1 : dx < -0.5 ? -1 : a.face < 0 ? 1 : -1;
  const push = (minD - Math.abs(dx)) / 2;
  const clA = (x) => clamp(x, BOUND_L + a.def.w / 2, BOUND_R - a.def.w / 2);
  const clB = (x) => clamp(x, BOUND_L + b.def.w / 2, BOUND_R - b.def.w / 2);
  let ax = clA(a.x + dir * push);
  let bx = clB(b.x - dir * push);
  // whoever is pinned to a wall can't give way, so the other takes the rest
  const left = minD - Math.abs(ax - bx);
  if (left > 0.01) {
    if (Math.abs(ax - (a.x + dir * push)) > 1e-6) bx = clB(bx - dir * left);
    else ax = clA(ax + dir * left);
  }
  a.x = ax;
  b.x = bx;
}

function faceEachOther(m) {
  const [a, b] = m.f;
  for (const [f, o] of [[a, b], [b, a]]) {
    if ((isFree(f) || f.state === "land") && Math.abs(o.x - f.x) > 1) f.face = o.x > f.x ? 1 : -1;
  }
}

/* ------------------------------------------------------------------ hits */

const canBeHit = (m, d) => m.phase === "fight" && d.inv === 0 && d.state !== "ko";

function collectHits(m) {
  const hits = [];
  for (const f of m.f) {
    const d = m.f[1 - f.side];
    const box = attackBox(f);
    if (box && !f.atk.hit && canBeHit(m, d) && overlap(box, hurtBox(d))) {
      const dir = f.atk.move.kind === "spin" ? Math.sign(d.x - f.x) || f.face : f.face;
      hits.push({ att: f, atk: f.atk, def: d, move: f.atk.move, dir });
    }
  }
  for (const p of m.projs) {
    if (p.dead) continue;
    const d = m.f[1 - p.owner];
    if (canBeHit(m, d) && overlap(projBox(p), hurtBox(d))) hits.push({ proj: p, att: m.f[p.owner], def: d, move: p.move, dir: Math.sign(p.vx) });
  }
  return hits;
}

function applyHit(m, h, ev) {
  const d = h.def;
  const att = h.att;
  const mv = h.move;
  if (h.proj) h.proj.dead = true;
  else h.atk.hit = true; // the attack object captured at collection (a trade may have cancelled it since)
  if (!canBeHit(m, d)) return; // already struck earlier this tick
  const mul = m.cfg.dmgMul[att.side] ?? 1;
  const blocked = (d.state === "block" || d.state === "blockstun") && d.y <= 0 && d.face === -h.dir;
  d.lastDir = h.dir;
  const hx = h.proj ? h.proj.x : (d.x + att.x) / 2 + h.dir * 10;
  const hy = h.proj ? h.proj.y : d.y + clamp((mv.box?.y0 + mv.box?.y1) / 2 || 90, 30, d.def.h - 10);
  if (blocked) {
    const dmg = Math.min(d.hp, Math.round(mv.dmg * mv.chip * mul));
    d.hp -= dmg;
    d.lagHold = 30;
    setState(d, "blockstun");
    d.stun = mv.bstun;
    d.vx = h.dir * mv.knock * 0.7;
    d.stats.blocked++;
    att.stats.dmg += dmg;
    m.hitstop = Math.max(m.hitstop, 3);
    ev.push({ type: "block", side: d.side, by: att.side, dmg, x: hx, y: hy, kind: mv.fx || "melee" });
  } else {
    const dmg = Math.min(d.hp, Math.max(1, Math.round(mv.dmg * mul)));
    d.hp -= dmg;
    d.lagHold = 30;
    d.atk = null;
    setState(d, "hit");
    d.stun = mv.stun;
    d.inv = mv.stun + INV_AFTER;
    d.vx = h.dir * mv.knock;
    if (d.y > 0) d.vy = Math.max(d.vy, 3);
    if (mv.freeze) d.frozen = mv.stun;
    att.stats.hits++;
    att.stats.dmg += dmg;
    m.hitstop = Math.max(m.hitstop, HITSTOP);
    m.shake = Math.max(m.shake, Math.min(14, 3 + mv.dmg * 0.5));
    if (h.atk && (mv.kind === "dash" || mv.kind === "spin")) h.atk.stop = true;
    ev.push({ type: "hit", side: d.side, by: att.side, dmg, heavy: mv.dmg >= 11, x: hx, y: hy, kind: mv.fx || "melee", name: h.proj ? "special" : h.atk.name });
  }
  // a defender pinned to the wall can't be pushed, so the attacker recoils instead
  const wallGap = h.dir > 0 ? BOUND_R - (d.x + d.def.w / 2) : d.x - d.def.w / 2 - BOUND_L;
  if (!h.proj && wallGap < 6 && att.y <= 0) att.vx = -h.dir * mv.knock * 0.6;
}

function projectiles(m, ev) {
  for (const p of m.projs) {
    p.x += p.vx;
    p.t++;
    if (--p.life <= 0 || p.x < BOUND_L - 40 || p.x > BOUND_R + 40) p.dead = true;
  }
  // opposing projectiles cancel each other out
  for (const p of m.projs)
    for (const q of m.projs)
      if (p.owner === 0 && q.owner === 1 && !p.dead && !q.dead && overlap(projBox(p), projBox(q))) {
        p.dead = q.dead = true;
        ev.push({ type: "clash", x: (p.x + q.x) / 2, y: (p.y + q.y) / 2 });
      }
}

/* ------------------------------------------------------------------ rounds */

function endFight(m, winner, reason, ev) {
  m.phase = reason === "time" ? "timeup" : "ko";
  m.t = 0;
  m.roundWinner = winner;
  m.roundReason = reason;
  m.projs = [];
  if (winner >= 0) m.wins[winner]++;
  else m.draws++;
  for (const f of m.f) {
    f.buf = null;
    f.jbuf = 0;
  }
  ev.push({ type: reason === "time" ? "timeup" : "ko", winner, reason });
}

function checkEnd(m, ev) {
  const [a, b] = m.f;
  const deadA = a.hp <= 0;
  const deadB = b.hp <= 0;
  if (deadA || deadB) {
    for (const f of [a, b]) {
      if (f.hp > 0) continue;
      f.atk = null;
      setState(f, "ko");
      f.vx = (f.lastDir || -f.face) * 6;
      f.vy = Math.max(f.vy, 7);
      f.y = Math.max(f.y, 0.01);
      f.inv = 0;
    }
    endFight(m, deadA && deadB ? -1 : deadA ? 1 : 0, deadA && deadB ? "double" : "ko", ev);
    return;
  }
  if (m.time <= 0) {
    const ra = a.hp / a.maxHp;
    const rb = b.hp / b.maxHp;
    endFight(m, Math.abs(ra - rb) < 1e-9 ? -1 : ra > rb ? 0 : 1, "time", ev);
  }
}

function finishRound(m, ev) {
  const w = m.wins;
  if (w[0] >= ROUNDS_TO_WIN || w[1] >= ROUNDS_TO_WIN || m.round >= MAX_ROUNDS) {
    m.phase = "over";
    m.t = 0;
    m.winner = w[0] > w[1] ? 0 : w[1] > w[0] ? 1 : -1;
    ev.push({ type: "over", winner: m.winner });
    return;
  }
  m.round++;
  resetRound(m);
  ev.push({ type: "round", round: m.round });
}

/** advance one 60 Hz tick; returns this tick's events */
export function step(m, inputs) {
  const ev = [];
  m.events = ev;
  m.frame++;
  m.t++;
  if (m.shake > 0) m.shake = Math.max(0, m.shake - 0.8);

  if (m.phase === "intro") {
    if (m.t === 1) ev.push({ type: "round", round: m.round });
    if (m.t === INTRO_F - 40) ev.push({ type: "fight" });
    for (const f of m.f) updateFighter(m, f, NO_INPUT, ev);
    if (m.t >= INTRO_F) {
      m.phase = "fight";
      m.t = 0;
    }
    return ev;
  }

  if (m.phase === "fight") {
    const ins = [inputs?.[0] || NO_INPUT, inputs?.[1] || NO_INPUT];
    m.f.forEach((f, i) => intake(f, ins[i]));
    if (m.hitstop > 0) {
      m.hitstop--;
      return ev;
    }
    m.time--;
    m.f.forEach((f, i) => updateFighter(m, f, ins[i], ev));
    separate(m);
    faceEachOther(m);
    projectiles(m, ev);
    for (const h of collectHits(m)) applyHit(m, h, ev);
    m.projs = m.projs.filter((p) => !p.dead);
    checkEnd(m, ev);
    return ev;
  }

  // ko / timeup / over: physics only, the winner celebrates once settled
  if (m.hitstop > 0) m.hitstop--;
  for (const f of m.f) {
    updateFighter(m, f, NO_INPUT, ev);
    const won = m.phase === "over" ? m.winner === f.side : m.roundWinner === f.side;
    if (won && m.t >= 45 && f.state !== "win" && isFree(f) && f.y <= 0) setState(f, "win");
  }
  separate(m);
  if ((m.phase === "ko" || m.phase === "timeup") && m.t >= OUTRO_F) finishRound(m, ev);
  return ev;
}

export const secondsLeft = (m) => Math.max(0, Math.ceil(m.time / 60));
