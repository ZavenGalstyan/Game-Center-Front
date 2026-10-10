/**
 * Web Hero — the five bosses. Each boss is an enemy entity (e.boss = true)
 * driven by its own controller instead of the generic FSM. Every boss has a
 * circular arena, a health bar, ≥3 telegraphed attacks, a readable weak
 * window (the only time damage lands — armour sparks otherwise), a phase
 * change at half health and a defeat sequence.
 *
 *   bruiser    IRON BRUISER     slam waves, haymaker combo, wall-charge → stunned (core exposed)
 *   commander  DRONE COMMANDER  hovers behind a shield fed by drones; missile rain;
 *                               drones down → shield drops, web-pull him to the ground
 *   striker    SHOCK STRIKER    lightning dashes, shock rings, sky bolts; a dodged dash
 *                               leaves him stunned; phase 2 aura needs a web trap first
 *   hunter     SHADOW HUNTER    turns invisible, knife volleys, ambush strikes, counter
 *                               stance (don't hit the blue guard); web hits reveal + stun him
 *   titan      TITAN OVERLORD   3 phases: melee mech → shield pylons (disable with E) →
 *                               airborne laser sweeps + minions; overheats → core exposed
 */
import { spawnEnemy, KINDS } from "./enemies.js";
import { ready } from "./combat.js";

const NAMES = { bruiser: "Iron Bruiser", commander: "Drone Commander", striker: "Shock Striker", hunter: "Shadow Hunter", titan: "Titan Overlord" };
const HP = { bruiser: 520, commander: 420, striker: 480, hunter: 460, titan: 900 };

export function createBoss(W, s) {
  const kind = s.boss;
  const c = s.arena;
  const e = spawnEnemy(W, "bruiser", c.x, c.y, c.z + 8, { group: "boss" });
  e.boss = true;
  e.bossKind = kind;
  e.K = { ...KINDS.bruiser, hp: HP[kind], r: kind === "titan" ? 1.6 : kind === "bruiser" ? 1.2 : 0.7, hy: kind === "titan" ? 2.4 : kind === "bruiser" ? 1.8 : 1.1, xp: 400, heavy: true };
  e.hp = e.maxHp = Math.round(HP[kind] * (W.hpScale || 1));
  e.r = e.K.r;
  e.hy = e.K.hy;
  e.state = "boss";
  const B = {
    kind,
    name: NAMES[kind],
    e,
    cx: c.x,
    cy: c.y,
    cz: c.z,
    radius: s.radius || 22,
    phase: 1,
    st: "intro",
    t: 0,
    weak: false,
    defeated: false,
    doneT: 0,
    rings: [],
    marks: [],
    beams: [],
    hint: "",
    pylons: [],
    shield: false,
    invisible: false,
    counter: false,
    cool: 0,
    alt: 0,
  };
  B.canHit = (en, o) => canHit(W, B, o);
  B.threat = () => threat(W, B);
  B.onHit = (en, o) => onHit(W, B, o);
  if (kind === "titan") {
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2 + 0.5;
      B.pylons.push({ x: c.x + Math.sin(a) * (B.radius - 5), y: c.y, z: c.z + Math.cos(a) * (B.radius - 5), on: false, done: false, hold: 0 });
    }
  }
  return B;
}

/* ------------------------------------------------------------------ helpers */
function set(B, st) {
  B.st = st;
  B.t = 0;
}
function moveE(e, tx, tz, sp, dt) {
  const dx = tx - e.x;
  const dz = tz - e.z;
  const d = Math.hypot(dx, dz);
  if (d < 0.3) return true;
  const s = Math.min(d, sp * dt);
  e.x += (dx / d) * s;
  e.z += (dz / d) * s;
  e.facing = Math.atan2(dx, dz);
  e.moving = true;
  return false;
}
function clampArena(B, e) {
  const dx = e.x - B.cx;
  const dz = e.z - B.cz;
  const d = Math.hypot(dx, dz);
  const lim = B.radius - 2;
  if (d > lim) {
    e.x = B.cx + (dx / d) * lim;
    e.z = B.cz + (dz / d) * lim;
    return true;
  }
  return false;
}
function ring(B, x, y, z, speed, max, h = 0.8) {
  B.rings.push({ x, y, z, r: 0.5, speed, max, h, hitIds: new Set() });
}
function mark(B, x, y, z, delay, rad, dmg, kind = "blast") {
  B.marks.push({ x, y, z, t: 0, delay, rad, dmg, kind, done: false });
}

function canHit(W, B, o) {
  if (o.storm) return true;
  if (B.kind === "hunter" && B.counter && o.move !== "strike" && o.move !== "storm") {
    // struck his counter stance: he ripostes
    W.damageHero(14 * W.dmgScale, B.e.x, B.e.z, "heavy", false, B.e);
    B.counter = false;
    W.events.push({ type: "bossCounter", x: B.e.x, y: B.e.y + 2, z: B.e.z });
    return false;
  }
  return B.weak;
}

function onHit(W, B, o) {
  W.events.push({ type: "bossHit", x: B.e.x, y: B.e.y + B.e.hy, z: B.e.z, hp: B.e.hp, max: B.e.maxHp });
  if (B.phase === 1 && B.e.hp <= B.e.maxHp * 0.5) {
    B.phase = 2;
    B.weak = false;
    set(B, "phase");
    W.events.push({ type: "bossPhase", text: phaseText(B.kind, 2) });
  } else if (B.kind === "titan" && B.phase === 2 && B.e.hp <= B.e.maxHp * 0.25) {
    B.phase = 3;
    B.weak = false;
    set(B, "phase");
    W.events.push({ type: "bossPhase", text: phaseText(B.kind, 3) });
  }
  void o;
}

function phaseText(k, p) {
  if (k === "bruiser") return "Iron Bruiser is enraged — debris incoming!";
  if (k === "commander") return "More drones — and a laser!";
  if (k === "striker") return "Overcharged! Web-trap him to short his aura";
  if (k === "hunter") return "Shadow clones! Find the real one";
  if (k === "titan") return p === 2 ? "Shield pylons online — disable them with E!" : "Titan takes flight — survive the lasers!";
  return "";
}

function threat(W, B) {
  const h = W.hero;
  let best = Infinity;
  const e = B.e;
  if (B.st === "slamWind" || B.st === "hayWind" || B.st === "dashWind" || B.st === "ambushWind" || B.st === "chargeWind") {
    const d = Math.hypot(h.x - e.x, h.z - e.z);
    if (d < 9) best = Math.max(0, (B.windT || 0.8) - B.t);
  }
  for (const r of B.rings) {
    const d = Math.hypot(h.x - r.x, h.z - r.z) - r.r;
    if (d > 0 && d < 3) best = Math.min(best, d / r.speed);
  }
  for (const m of B.marks) if (!m.done && Math.hypot(h.x - m.x, h.z - m.z) < m.rad) best = Math.min(best, Math.max(0, m.delay - m.t));
  return best;
}

/* ------------------------------------------------------------------ step */
export function stepBoss(W, dt) {
  const B = W.boss;
  if (!B) return;
  const e = B.e;
  const h = W.hero;
  B.t += dt;
  B.cool = Math.max(0, B.cool - dt);
  if (e.state === "defeated" || e.dead) {
    if (!B.defeated) {
      B.defeated = true;
      B.rings = [];
      B.marks = [];
      B.beams = [];
      W.shots = [];
      for (const o of W.enemies) if (!o.boss && !o.dead && o.state !== "defeated") o.hp = 0, (o.state = "defeated"), (o.t = 0);
      W.events.push({ type: "bossDefeat", x: e.x, y: e.y + 2, z: e.z });
    }
    B.doneT += dt;
    return;
  }
  // the arena wall keeps the fight readable
  const hx = h.x - B.cx;
  const hz = h.z - B.cz;
  const hd = Math.hypot(hx, hz);
  if (hd > B.radius + 6 && Math.abs(h.y - B.cy) < 10) {
    h.x = B.cx + (hx / hd) * (B.radius + 6);
    h.z = B.cz + (hz / hd) * (B.radius + 6);
  }
  if (e.web > 0) e.web -= dt;
  const dx = h.x - e.x;
  const dz = h.z - e.z;
  const dist = Math.hypot(dx, dz);
  switch (B.kind) {
    case "bruiser":
      bruiser(W, B, e, dx, dz, dist, dt);
      break;
    case "commander":
      commander(W, B, e, dx, dz, dist, dt);
      break;
    case "striker":
      striker(W, B, e, dx, dz, dist, dt);
      break;
    case "hunter":
      hunter(W, B, e, dx, dz, dist, dt);
      break;
    case "titan":
      titan(W, B, e, dx, dz, dist, dt);
      break;
    default:
  }
  hazards(W, B, dt);
}

function hazards(W, B, dt) {
  const h = W.hero;
  const keep = [];
  for (const r of B.rings) {
    r.r += r.speed * dt;
    if (r.r > r.max) continue;
    keep.push(r);
    const d = Math.hypot(h.x - r.x, h.z - r.z);
    if (Math.abs(d - r.r) < 0.7 && h.y < r.y + r.h && h.y > r.y - 1 && !r.hitIds.has(1)) {
      r.hitIds.add(1);
      W.damageHero(12 * W.dmgScale, r.x, r.z, "heavy", false, null);
    }
  }
  B.rings = keep;
  for (const m of B.marks) {
    m.t += dt;
    if (!m.done && m.t >= m.delay) {
      m.done = true;
      W.events.push({ type: "bossBlast", x: m.x, y: m.y, z: m.z, kind: m.kind });
      if (Math.hypot(h.x - m.x, h.z - m.z) < m.rad && Math.abs(h.y - m.y) < 4) W.damageHero(m.dmg * W.dmgScale, m.x, m.z, "heavy", false, null);
    }
  }
  B.marks = B.marks.filter((m) => m.t < m.delay + 0.5);
  for (const bm of B.beams) {
    bm.t += dt;
    bm.a += bm.spin * dt;
    bm.on = bm.t > bm.warn;
    if (!bm.on) continue;
    const d = Math.hypot(h.x - bm.x, h.z - bm.z);
    let da = Math.atan2(h.x - bm.x, h.z - bm.z) - bm.a;
    while (da > Math.PI) da -= Math.PI * 2;
    while (da < -Math.PI) da += Math.PI * 2;
    if (d < bm.len && d > 1.5 && Math.abs(da) * d < 0.7 && h.y < bm.y + 1.0 && h.y > bm.y - 1.5 && !bm.hit) {
      bm.hit = true;
      W.damageHero(15 * W.dmgScale, bm.x, bm.z, "heavy", false, null);
    }
    if (Math.abs(da) * d > 3) bm.hit = false;
  }
  B.beams = B.beams.filter((b) => b.t < b.life);
}

/* ------------------------------------------------------------------ 1 iron bruiser */
function bruiser(W, B, e, dx, dz, dist, dt) {
  const h = W.hero;
  const fast = B.phase === 2 ? 1.3 : 1;
  switch (B.st) {
    case "intro":
    case "phase":
      B.weak = false;
      B.hint = B.phase === 1 ? "Dodge his charge so he slams into the arena wall — then hit his exposed core!" : "Enraged: watch for thrown debris";
      if (B.t > 1.8) set(B, "stalk");
      break;
    case "stalk":
      B.weak = false;
      moveE(e, h.x, h.z, 3.2 * fast, dt);
      if (dist < 3.5 && B.cool <= 0) {
        set(B, B.alt++ % 2 ? "slamWind" : "hayWind");
        B.windT = B.st === "slamWind" ? 0.9 : 0.6;
        W.events.push({ type: "telegraph", x: e.x, y: e.y + 3.5, z: e.z, kind: "boss" });
      } else if (B.t > 2.6 / fast) {
        set(B, "chargeWind");
        B.windT = 0.9;
        B.dir = [dx / (dist || 1), dz / (dist || 1)];
        W.events.push({ type: "telegraph", x: e.x, y: e.y + 3.5, z: e.z, kind: "charge" });
      } else if (B.phase === 2 && B.t > 1.2 && B.t - dt <= 1.2) {
        // throw debris
        throwAt(W, e, h, 22, 16, "debris");
      }
      break;
    case "slamWind":
      e.facing = Math.atan2(dx, dz);
      if (B.t > B.windT) {
        ring(B, e.x, e.y, e.z, 13, 13, 0.9);
        W.events.push({ type: "slam", x: e.x, y: e.y, z: e.z });
        set(B, "recover");
        B.cool = 1.4;
      }
      break;
    case "hayWind":
      e.facing = Math.atan2(dx, dz);
      if (B.t > B.windT) {
        if (dist < 4 && Math.abs(h.y - e.y) < 2.5) W.damageHero(18 * W.dmgScale, e.x, e.z, "heavy", false, e);
        W.events.push({ type: "swingAtk", move: "boss" });
        set(B, "recover");
        B.cool = 1.1;
      }
      break;
    case "chargeWind":
      e.facing = Math.atan2(B.dir[0], B.dir[1]);
      if (B.t > B.windT) set(B, "charge");
      break;
    case "charge": {
      e.x += B.dir[0] * 22 * fast * dt;
      e.z += B.dir[1] * 22 * fast * dt;
      if (Math.hypot(h.x - e.x, h.z - e.z) < 2 && !B.chargeHit) {
        B.chargeHit = true;
        W.damageHero(20 * W.dmgScale, e.x, e.z, "heavy", false, e);
      }
      if (clampArena(B, e) || B.t > 1.6) {
        B.chargeHit = false;
        W.events.push({ type: "bossCrash", x: e.x, y: e.y + 1, z: e.z });
        set(B, "stunned");
      }
      break;
    }
    case "stunned":
      B.weak = true;
      B.hint = "Core exposed — strike now!";
      if (B.t > 3.2) {
        B.weak = false;
        set(B, "stalk");
      }
      break;
    case "recover":
      B.weak = false;
      if (B.t > 0.7) set(B, "stalk");
      break;
    default:
      set(B, "stalk");
  }
  clampArena(B, e);
}

function throwAt(W, e, h, sp, dmg, kind) {
  const sx = e.x;
  const sy = e.y + e.hy + 1.5;
  const sz = e.z;
  const dx = h.x - sx;
  const dy = h.y + 1 - sy;
  const dz = h.z - sz;
  const l = Math.hypot(dx, dy, dz) || 1;
  W.shots.push({ x: sx, y: sy, z: sz, vx: (dx / l) * sp, vy: (dy / l) * sp, vz: (dz / l) * sp, t: 0, dmg: dmg * W.dmgScale, kind });
  W.events.push({ type: "enemyShoot", x: sx, y: sy, z: sz, kind });
}

/* ------------------------------------------------------------------ 2 drone commander */
function commander(W, B, e, dx, dz, dist, dt) {
  const h = W.hero;
  const drones = W.enemies.filter((o) => o.minion && !o.dead && o.state !== "defeated");
  switch (B.st) {
    case "intro":
    case "phase":
      B.weak = false;
      B.shield = true;
      B.hint = "Destroy his drones to drop the shield, then web-pull him down!";
      e.y += (B.cy + 9 - e.y) * Math.min(1, dt * 2);
      if (B.t > 1.6) {
        const n = B.phase === 2 ? 4 : 3;
        for (let i = 0; i < n; i++) {
          const a = (i / n) * Math.PI * 2;
          const d = spawnEnemy(W, "drone", B.cx + Math.sin(a) * 9, B.cy, B.cz + Math.cos(a) * 9, { aggro: true, hpScale: W.hpScale });
          d.minion = true;
        }
        set(B, "hover");
      }
      break;
    case "hover":
      B.shield = drones.length > 0;
      B.weak = false;
      B.ang = (B.ang || 0) + dt * 0.35;
      moveE(e, B.cx + Math.sin(B.ang) * 9, B.cz + Math.cos(B.ang) * 9, 6, dt);
      e.y += (B.cy + 9 - e.y) * Math.min(1, dt * 2);
      e.facing = Math.atan2(dx, dz);
      if (B.cool <= 0) {
        // missile rain: telegraphed circles around the hero
        for (let i = 0; i < (B.phase === 2 ? 5 : 3); i++) {
          const a = (i / 3) * Math.PI * 2 + B.t;
          mark(B, h.x + Math.sin(a) * (i ? 3 : 0), h.y, h.z + Math.cos(a) * (i ? 3 : 0), 1.1 + i * 0.15, 2.4, 14, "missile");
        }
        if (B.phase === 2) B.beams.push({ x: B.cx, y: B.cy + 0.4, z: B.cz, a: Math.atan2(dx, dz) + 1.4, spin: 1.1, len: B.radius + 4, t: 0, warn: 0.9, life: 5, on: false });
        B.cool = 4.2;
      }
      if (!B.shield) {
        set(B, "exposed");
        W.events.push({ type: "shieldDown", x: e.x, y: e.y, z: e.z });
      }
      break;
    case "exposed":
      // shield down: hovers low and slow; a web pull (or any hit) brings him down
      B.hint = "Shield down! Web-pull (2) him to the ground or hit him in the air!";
      e.y += (B.cy + 3.2 - e.y) * Math.min(1, dt * 2.5);
      B.weak = true;
      if (e.state === "stunned" || e.web > 0) {
        set(B, "grounded");
        break;
      }
      if (B.t > 7) set(B, "phase");
      break;
    case "grounded":
      B.weak = true;
      B.hint = "He's down — beat him while he's grounded!";
      e.y += (B.cy - e.y) * Math.min(1, dt * 6);
      if (B.t > 5) {
        e.state = "boss";
        set(B, "phase");
      }
      break;
    default:
      set(B, "hover");
  }
  if (e.state === "stunned") {
    e.stun -= dt;
    if (e.stun <= 0 && B.st !== "grounded") e.state = "boss";
  }
}

/* ------------------------------------------------------------------ 3 shock striker */
function striker(W, B, e, dx, dz, dist, dt) {
  const h = W.hero;
  const fast = B.phase === 2 ? 1.25 : 1;
  B.aura = B.phase === 2 && e.web <= 0;
  if (B.aura && dist < 2.4 && Math.abs(h.y - e.y) < 2) W.damageHero(6 * W.dmgScale, e.x, e.z, "melee", false, null);
  switch (B.st) {
    case "intro":
    case "phase":
      B.weak = false;
      B.hint = B.phase === 1 ? "Dodge his lightning dash at the last moment — he'll be stunned" : "Web-trap (1) or 3 web shots short his aura, then strike";
      if (B.t > 1.6) set(B, "circle");
      break;
    case "circle":
      B.weak = e.web > 0;
      B.ang = (B.ang || 0) + dt * 0.9 * fast;
      moveE(e, h.x + Math.sin(B.ang) * 9, h.z + Math.cos(B.ang) * 9, 9 * fast, dt);
      e.facing = Math.atan2(dx, dz);
      if (B.cool <= 0) {
        const pick = B.alt++ % 3;
        if (pick === 0) {
          set(B, "dashWind");
          B.windT = 0.75;
          B.dir = [dx / (dist || 1), dz / (dist || 1)];
          W.events.push({ type: "telegraph", x: e.x, y: e.y + 2.5, z: e.z, kind: "dash" });
        } else if (pick === 1) {
          ring(B, e.x, e.y, e.z, 11, 14, 0.8);
          W.events.push({ type: "shockRing", x: e.x, y: e.y, z: e.z });
          B.cool = 2.2;
        } else {
          for (let i = 0; i < 4; i++) mark(B, h.x + (i % 2 ? 3 : -3) * (i > 1 ? 1 : 0), h.y, h.z + (i % 2 ? 0 : 3) * (i > 1 ? -1 : 0), 0.9 + i * 0.18, 2, 12, "bolt");
          B.cool = 2.6;
        }
      }
      break;
    case "dashWind":
      e.facing = Math.atan2(B.dir[0], B.dir[1]);
      if (B.t > B.windT) set(B, "dash");
      break;
    case "dash":
      e.x += B.dir[0] * 30 * dt;
      e.z += B.dir[1] * 30 * dt;
      if (Math.hypot(h.x - e.x, h.z - e.z) < 1.8 && !B.dashHit) {
        B.dashHit = true;
        W.damageHero(16 * W.dmgScale, e.x, e.z, "heavy", false, e);
      }
      if (clampArena(B, e) || B.t > 0.6) {
        const missed = !B.dashHit;
        B.dashHit = false;
        if (missed) {
          set(B, "stunned");
          W.events.push({ type: "bossStunned", x: e.x, y: e.y + 2, z: e.z });
        } else {
          set(B, "circle");
          B.cool = 1.4;
        }
      }
      break;
    case "stunned":
      B.weak = !B.aura || e.web > 0;
      B.hint = B.aura ? "Short his aura with webs first!" : "Stunned — strike!";
      if (B.t > 2.8) {
        set(B, "circle");
        B.cool = 1.2;
      }
      break;
    default:
      set(B, "circle");
  }
  clampArena(B, e);
}

/* ------------------------------------------------------------------ 4 shadow hunter */
function hunter(W, B, e, dx, dz, dist, dt) {
  const h = W.hero;
  switch (B.st) {
    case "intro":
    case "phase":
      B.weak = false;
      B.invisible = false;
      B.counter = false;
      B.hint = B.phase === 1 ? "Hit him with webs to reveal and stun him — never strike his blue counter stance" : "Shadow clones! Webs reveal the real hunter";
      if (B.phase === 2 && B.t < dt * 1.5) {
        for (let i = 0; i < 2; i++) {
          const c = spawnEnemy(W, "assassin", e.x + (i ? 3 : -3), B.cy, e.z, { aggro: true, hpScale: W.hpScale });
          c.minion = true;
        }
      }
      if (B.t > 1.6) set(B, "stalk");
      break;
    case "stalk":
      B.invisible = B.t > 0.6 && e.web <= 0;
      B.counter = false;
      B.weak = false;
      B.ang = (B.ang || 0) + dt * 0.6;
      moveE(e, h.x + Math.sin(B.ang) * 7, h.z + Math.cos(B.ang) * 7, 8, dt);
      if (e.web > 0) {
        set(B, "revealed");
        break;
      }
      if (B.t > 2.4) {
        const pick = B.alt++ % 3;
        if (pick === 0) {
          // ambush from behind
          set(B, "ambushWind");
          B.windT = 0.7;
          const bx = -Math.sin(h.facing);
          const bz = -Math.cos(h.facing);
          e.x = h.x + bx * 2.4;
          e.z = h.z + bz * 2.4;
          B.invisible = false;
          W.events.push({ type: "telegraph", x: e.x, y: e.y + 2.5, z: e.z, kind: "ambush" });
        } else if (pick === 1) {
          set(B, "knives");
        } else {
          set(B, "counter");
        }
      }
      break;
    case "ambushWind":
      e.facing = Math.atan2(dx, dz);
      if (B.t > B.windT) {
        if (dist < 3 && Math.abs(h.y - e.y) < 2) W.damageHero(15 * W.dmgScale, e.x, e.z, "melee", false, e);
        set(B, "stalk");
      }
      break;
    case "knives":
      B.invisible = false;
      e.facing = Math.atan2(dx, dz);
      if (B.t > 0.5 && !B.thrown) {
        B.thrown = true;
        for (const off of [-0.25, 0, 0.25]) {
          const a = Math.atan2(dx, dz) + off;
          W.shots.push({ x: e.x, y: e.y + 1.3, z: e.z, vx: Math.sin(a) * 26, vy: (h.y - e.y) * 0.5, vz: Math.cos(a) * 26, t: 0, dmg: 8 * W.dmgScale, kind: "knife" });
        }
        W.events.push({ type: "enemyShoot", x: e.x, y: e.y + 1, z: e.z, kind: "knife" });
      }
      if (B.t > 1.0) {
        B.thrown = false;
        set(B, "stalk");
      }
      break;
    case "counter":
      B.invisible = false;
      B.counter = true;
      B.hint = "Blue stance — don't attack! Webs only.";
      e.facing = Math.atan2(dx, dz);
      if (e.web > 0) {
        B.counter = false;
        set(B, "revealed");
      } else if (B.t > 2.2) {
        B.counter = false;
        set(B, "stalk");
      }
      break;
    case "revealed":
      B.invisible = false;
      B.counter = false;
      B.weak = true;
      B.hint = "Revealed and stunned — strike!";
      if (B.t > 3.4) set(B, "stalk");
      break;
    default:
      set(B, "stalk");
  }
  clampArena(B, e);
}

/* ------------------------------------------------------------------ 5 titan overlord */
function titan(W, B, e, dx, dz, dist, dt) {
  const h = W.hero;
  switch (B.st) {
    case "intro":
    case "phase":
      B.weak = false;
      B.shield = B.phase === 2;
      if (B.phase === 2 && B.t < dt * 1.5) for (const p of B.pylons) p.on = true;
      B.hint = B.phase === 1 ? "Dodge the slams; strike the core when he overheats" : B.phase === 2 ? "Disable the three shield pylons (hold E)!" : "Jump the laser sweeps — hit the core when it vents!";
      if (B.phase === 3 && B.t < dt * 1.5) {
        for (let i = 0; i < 3; i++) {
          const a = (i / 3) * Math.PI * 2;
          const m = spawnEnemy(W, i === 1 ? "gunner" : "thug", B.cx + Math.sin(a) * 12, B.cy, B.cz + Math.cos(a) * 12, { aggro: true, hpScale: W.hpScale });
          m.minion = true;
        }
      }
      if (B.t > 2) set(B, B.phase === 2 ? "pylons" : B.phase === 3 ? "fly" : "stalk");
      break;
    case "stalk":
      moveE(e, h.x, h.z, 3, dt);
      if (B.cool <= 0 && dist < 5) {
        set(B, "slamWind");
        B.windT = 0.85;
        W.events.push({ type: "telegraph", x: e.x, y: e.y + 4.5, z: e.z, kind: "boss" });
      } else if (B.t > 3.2) {
        // missile barrage
        for (let i = 0; i < 4; i++) mark(B, h.x + Math.sin(i * 1.6) * 3, h.y, h.z + Math.cos(i * 1.6) * 3, 1.0 + i * 0.12, 2.4, 14, "missile");
        set(B, "stalk");
        B.salvos = (B.salvos || 0) + 1;
        if (B.salvos >= 2) {
          B.salvos = 0;
          set(B, "overheat");
          W.events.push({ type: "overheat", x: e.x, y: e.y + 3, z: e.z });
        }
      }
      break;
    case "slamWind":
      if (B.t > B.windT) {
        ring(B, e.x, e.y, e.z, 12, 15, 0.9);
        W.events.push({ type: "slam", x: e.x, y: e.y, z: e.z });
        B.cool = 1.6;
        // every third slam overheats the mech too (staying close is rewarded)
        B.slams = (B.slams || 0) + 1;
        if (B.slams >= 3) {
          B.slams = 0;
          set(B, "overheat");
          W.events.push({ type: "overheat", x: e.x, y: e.y + 3, z: e.z });
        } else set(B, "stalk");
      }
      break;
    case "overheat":
      B.weak = true;
      B.hint = "Core venting — strike now!";
      if (B.t > 3.6) {
        B.weak = false;
        set(B, B.phase === 3 ? "fly" : "stalk");
      }
      break;
    case "pylons": {
      B.weak = false;
      // pylons: hold E next to each (he keeps slamming)
      W.prompt = null;
      for (const p of B.pylons) {
        if (p.done) continue;
        if (Math.hypot(h.x - p.x, h.z - p.z) < 2.6 && Math.abs(h.y - p.y) < 2.5) {
          W.prompt = "Hold E to disable the pylon";
          if (W.lastInput && W.lastInput.interactHeld) {
            p.hold += dt;
            if (p.hold > 1.0) {
              p.done = true;
              p.on = false;
              W.events.push({ type: "disabled", x: p.x, y: p.y, z: p.z });
            }
          } else p.hold = Math.max(0, p.hold - dt);
        }
      }
      moveE(e, h.x, h.z, 2.2, dt);
      if (B.cool <= 0 && dist < 6) {
        ring(B, e.x, e.y, e.z, 11, 13, 0.9);
        W.events.push({ type: "slam", x: e.x, y: e.y, z: e.z });
        B.cool = 3;
      }
      if (B.pylons.every((p) => p.done)) {
        B.shield = false;
        set(B, "overheat");
        W.events.push({ type: "shieldDown", x: e.x, y: e.y, z: e.z });
      }
      break;
    }
    case "fly":
      B.weak = false;
      e.y += (B.cy + 6 - e.y) * Math.min(1, dt * 2);
      moveE(e, B.cx, B.cz, 4, dt);
      if (B.cool <= 0) {
        B.beams.push({ x: B.cx, y: B.cy + 0.4, z: B.cz, a: Math.atan2(dx, dz) + 1.2, spin: 1.15, len: B.radius + 4, t: 0, warn: 0.9, life: 5.5, on: false });
        B.cool = 6;
        B.sweeps = (B.sweeps || 0) + 1;
      }
      if (B.sweeps >= 2 && B.t > 6) {
        B.sweeps = 0;
        e.y = B.cy;
        set(B, "overheat");
        W.events.push({ type: "overheat", x: e.x, y: e.y + 3, z: e.z });
      }
      break;
    default:
      set(B, "stalk");
  }
  if (B.st !== "fly" && B.st !== "phase") e.y += (B.cy - e.y) * Math.min(1, dt * 4);
  clampArena(B, e);
}

/* ------------------------------------------------------------------ bot policy */
/** returns input overrides for the verification bot during a boss fight */
export function bossBot(W, inp, bot) {
  const B = W.boss;
  const h = W.hero;
  if (!B || B.defeated) return false;
  const e = B.e;
  const dx = e.x - h.x;
  const dz = e.z - h.z;
  const dist = Math.hypot(dx, dz);
  const go = (tx, tz, stop = 1.5) => {
    const ddx = tx - h.x;
    const ddz = tz - h.z;
    if (Math.hypot(ddx, ddz) > stop) {
      inp.camYaw = Math.atan2(ddx, ddz);
      inp.my = 1;
    }
  };
  const away = (want = 9) => {
    if (dist < want) {
      // strafe around the boss, staying inside the arena
      const tx = h.x - (dz / (dist || 1)) * 4 - (dx / (dist || 1)) * 3;
      const tz = h.z + (dx / (dist || 1)) * 4 - (dz / (dist || 1)) * 3;
      const rr = Math.hypot(tx - B.cx, tz - B.cz);
      if (rr > B.radius - 2) go(B.cx, B.cz, 1);
      else go(tx, tz, 0.5);
    }
  };
  // dodge whatever is about to land
  const tt = threat(W, B);
  if (tt < 0.2 && h.dodgeCd <= 0) inp.dodge = true;
  for (const r of B.rings) {
    const d = Math.hypot(h.x - r.x, h.z - r.z) - r.r;
    if (d > 0 && d < 2.2 && h.grounded) inp.jump = true;
  }
  for (const bm of B.beams) {
    if (!bm.on || !h.grounded) continue;
    let da = Math.atan2(h.x - bm.x, h.z - bm.z) - bm.a;
    while (da > Math.PI) da -= Math.PI * 2;
    while (da < -Math.PI) da += Math.PI * 2;
    if (da > 0 && da * Math.hypot(h.x - bm.x, h.z - bm.z) < 2.6) inp.jump = true;
  }
  for (const m of B.marks) if (!m.done && Math.hypot(h.x - m.x, h.z - m.z) < m.rad + 0.5) go(h.x - (m.x - h.x) * 3, h.z - (m.z - h.z) * 3, 0.2);
  const strike = () => {
    go(e.x, e.z, 1.6);
    if (dist < 3.2 && Math.abs(e.y - h.y) < 2.5) {
      if (bot.alt++ % 4 === 3) inp.heavy = true;
      else inp.light = true;
    } else if (dist < 3.2 && e.y - h.y > 1.5) {
      inp.jump = true;
      inp.light = !h.grounded;
    }
  };
  // minions first (they also feed the commander's shield)
  const minion = W.enemies.find((o) => o.minion && !o.dead && o.state !== "defeated");
  switch (B.kind) {
    case "bruiser":
      if (B.weak) strike();
      else if (B.st === "chargeWind" || B.st === "charge") {
        if (B.st === "charge" && dist < 6) inp.dodge = h.dodgeCd <= 0;
      } else away(10);
      return true;
    case "commander":
      if (B.st === "exposed") {
        if (dist < 18) inp.ab2 = ready(W, "pull");
        go(e.x, e.z, 2);
        if (!inp.ab2) inp.web = true;
      } else if (B.weak) strike();
      else if (minion) {
        go(minion.x, minion.z, 3);
        inp.web = Math.hypot(minion.x - h.x, minion.z - h.z) < 20;
        if (Math.hypot(minion.x - h.x, minion.z - h.z) < 6) {
          inp.jump = h.grounded;
          inp.light = !h.grounded;
        }
      } else away(8);
      return true;
    case "striker":
      if (B.aura && dist < 20) {
        inp.web = true;
        if (ready(W, "trap")) inp.ab1 = true;
      }
      if (B.weak) strike();
      else if (B.st === "dash" || B.st === "dashWind") {
        if (B.st === "dash" && dist < 5) inp.dodge = h.dodgeCd <= 0;
      } else away(7);
      return true;
    case "hunter":
      if (minion && Math.hypot(minion.x - h.x, minion.z - h.z) < 10) {
        go(minion.x, minion.z, 1.6);
        if (Math.hypot(minion.x - h.x, minion.z - h.z) < 3) inp.light = true;
        return true;
      }
      if (B.weak) strike();
      else {
        if (dist < 22) inp.web = true;
        away(6);
      }
      return true;
    case "titan": {
      if (B.st === "pylons") {
        const p = B.pylons.find((q) => !q.done);
        if (p) {
          go(p.x, p.z, 1.2);
          if (Math.hypot(p.x - h.x, p.z - h.z) < 2.2) inp.interactHeld = true;
        }
        return true;
      }
      if (minion && Math.hypot(minion.x - h.x, minion.z - h.z) < 12 && !B.weak) {
        go(minion.x, minion.z, 1.6);
        if (Math.hypot(minion.x - h.x, minion.z - h.z) < 3) inp.light = true;
        return true;
      }
      if (B.weak) strike();
      else away(9);
      return true;
    }
    default:
      return false;
  }
}
