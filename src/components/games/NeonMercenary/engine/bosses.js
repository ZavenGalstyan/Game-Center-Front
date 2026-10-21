/**
 * Boss encounters. A boss is an enemy entity with `boss` state driven by its
 * own controller instead of ai.js. Every attack is telegraphed through a
 * hazard (line / ring / circle / cone / laser / panel / beam) that the
 * renderer draws during its warn time, and every attack can be avoided:
 * projectiles travel, lines and rings can be stepped out of or dodged
 * (i-frames), lasers need line of sight at the moment they fire, the sweeping
 * beam passes over a crouching player.
 */
import { collideCircle, groundHeight, lineOfSight, nearestWalkable, raycast } from "./map.js";
import { approachAngle, clamp, dist, wrapAngle, yawOf } from "./math.js";
import { killEnemy } from "./ai.js";

export const BOSSES = {
  razor: {
    name: "Razor", title: "Red Fang Warlord", hp: 1050, speed: 3.2, run: 7, r: 0.45, h: 1.85,
    xp: 600, credits: 1500, reward: { weapon: ["fangspitter", "epic"], stacks: { circuit: 2, medkit: 2 } }, flag: "razorDown",
    look: { body: "m", hair: "Hair_Long", hairColor: "#d91f4a", suit: "#1a0f14", trim: "#ff3b5c", gear: "razor", coat: "#3a0b16", weapon: "smg", scale: 1.04 },
    intro: "The Red Fang warlord. Fast, vicious, never fights fair.",
  },
  ironjaw: {
    name: "Ironjaw", title: "Industrial Combat Cyborg", hp: 1900, speed: 1.9, run: 13, r: 0.7, h: 2.6,
    xp: 900, credits: 2600, reward: { weapon: ["jawbreaker", "epic"], stacks: { nanofiber: 2, circuit: 3 } }, flag: "ironjawDown",
    look: { body: "m", hair: null, suit: "#2a2a2a", trim: "#ff8a1f", gear: "ironjaw", scale: 1.45, girth: 1.35, weapon: "minigun" },
    intro: "Foundry test subject #0447. Two tonnes of armour and rage.",
  },
  specter: {
    name: "Specter-9", title: "Halcyon Assassin", hp: 1500, speed: 4.2, run: 9, r: 0.4, h: 1.75,
    xp: 1200, credits: 3800, reward: { weapon: ["wraith", "legendary"], stacks: { quantum: 1, nanofiber: 2 } }, flag: "specterDown",
    look: { body: "f", hair: "Hair_Buns", hairColor: "#dfe8ff", suit: "#0d1220", trim: "#9fe7ff", gear: "specter", visor: true, weapon: "heavyPistol" },
    intro: "Optical camouflage, monoblade, perfect aim.",
  },
  vex: {
    name: "Director Vex", title: "Halcyon Dynamics, Project CHOIR", hp: 2900, speed: 2.4, run: 5, r: 0.5, h: 2.0,
    xp: 2000, credits: 6000, reward: { weapon: ["sovereign", "legendary"], stacks: { quantum: 2 } }, flag: "vexDown",
    look: { body: "m", hair: "Hair_SimpleParted", hairColor: "#c9ced8", suit: "#10121a", trim: "#ff2bd6", gear: "vex", coat: "#1b1430", weapon: "energy", scale: 1.1 },
    intro: "The architect of CHOIR. More machine than man.",
  },
};

let HID = 1;
const hz = (G, h) => {
  h.id = HID++;
  h.t = 0;
  G.hazards.push(h);
  return h;
};

export function createBoss(G, id, x, z, arena) {
  const B = BOSSES[id];
  const e = {
    id: 10000 + HID++,
    kind: "enemy",
    type: id,
    def: { name: B.name, weapon: { kind: "boss", range: 60 }, look: B.look, detect: 80, fov: 360 },
    name: B.name,
    faction: "boss",
    boss: { id, phase: 1, t: 0, act: "intro", actT: 1.2, n: 0, arena, vuln: 0, summoned: {}, shieldOn: false, cloak: 0 },
    x, z, y: 0, yaw: yawOf(G.player.x - x, G.player.z - z), vx: 0, vz: 0,
    hp: B.hp, maxHp: B.hp, shield: 0, maxShield: 0, shieldDelay: 0,
    r: B.r, h: B.h, robot: id === "ironjaw", flyer: false,
    state: "combat", aware: 1, canSee: true, lastKnown: { x: G.player.x, z: G.player.z },
    stunT: 0, hitT: 0, deadT: 0, anim: "idle", animT: 0, look: B.look, token: false, tag: "boss",
    armorFront: id === "ironjaw" ? 0.65 : 0,
  };
  return e;
}

/** Damage multiplier for a hit on a boss from direction (dx,dz) → bullet travel dir. */
export function bossDamageMult(e, dx, dz) {
  const b = e.boss;
  if (b.shieldOn) return 0;
  let m = b.vuln > 0 ? 1.6 : 1;
  if (e.armorFront > 0 && b.vuln <= 0) {
    // hit from the front? (bullet travelling opposite to the boss's facing)
    const fx = Math.sin(e.yaw);
    const fz = Math.cos(e.yaw);
    if (dx * fx + dz * fz < -0.2) m *= 1 - e.armorFront;
  }
  return m;
}

function phaseOf(e) {
  const f = e.hp / e.maxHp;
  const id = e.boss.id;
  if (id === "razor") return f > 0.55 ? 1 : 2;
  if (id === "ironjaw") return f > 0.5 ? 1 : 2;
  if (id === "specter") return f > 0.6 ? 1 : f > 0.3 ? 2 : 3;
  return f > 0.7 ? 1 : f > 0.35 ? 2 : 3;
}

function step(G, e, tx, tz, speed, dt) {
  const dx = tx - e.x;
  const dz = tz - e.z;
  const d = Math.hypot(dx, dz);
  if (d > 0.05) {
    const s = Math.min(speed, d / dt);
    e.vx = (dx / d) * s;
    e.vz = (dz / d) * s;
  } else e.vx = e.vz = 0;
  e.x += e.vx * dt;
  e.z += e.vz * dt;
  const hit = collideCircle(G.map, e, e.r, e.h);
  e.y = groundHeight(G.map, e.x, e.z, e.r, e.y + 0.45);
  clampArena(e);
  return hit;
}
function clampArena(e) {
  const A = e.boss.arena;
  e.x = clamp(e.x, A.x0 + 1, A.x1 - 1);
  e.z = clamp(e.z, A.z0 + 1, A.z1 - 1);
}
const face = (e, x, z, dt, rate = 8) => (e.yaw = approachAngle(e.yaw, yawOf(x - e.x, z - e.z), dt * rate));
function randomSpot(G, A, minD = 6) {
  const p = G.player;
  for (let i = 0; i < 20; i++) {
    const x = A.x0 + 3 + G.rand() * (A.x1 - A.x0 - 6);
    const z = A.z0 + 3 + G.rand() * (A.z1 - A.z0 - 6);
    const n = nearestWalkable(G.map, x, z, 3);
    if (n && dist(n.x, n.z, p.x, p.z) > minD) return n;
  }
  return { x: (A.x0 + A.x1) / 2, z: (A.z0 + A.z1) / 2 };
}
const muzzle = (e) => ({ x: e.x + Math.sin(e.yaw) * 0.6, y: e.y + e.h * 0.72, z: e.z + Math.cos(e.yaw) * 0.6 });
function aimAt(G, e, spread = 0, lead = 0, speed = 30) {
  const p = G.player;
  const m = muzzle(e);
  const t = lead ? dist(m.x, m.z, p.x, p.z) / speed : 0;
  const tx = p.x + p.vx * t * lead + (G.rand() - 0.5) * spread;
  const tz = p.z + p.vz * t * lead + (G.rand() - 0.5) * spread;
  const ty = p.y + 1.1 + (G.rand() - 0.5) * spread * 0.4;
  const dx = tx - m.x;
  const dy = ty - m.y;
  const dz = tz - m.z;
  const l = Math.hypot(dx, dy, dz) || 1;
  return { m, dx: dx / l, dy: dy / l, dz: dz / l };
}

/* ------------------------------------------------------------ main */
export function updateBoss(G, e, dt) {
  if (e.state === "dead") {
    e.deadT += dt;
    return;
  }
  const b = e.boss;
  const p = G.player;
  b.t += dt;
  b.actT -= dt;
  b.vuln = Math.max(0, b.vuln - dt);
  e.animT = Math.max(0, e.animT - dt);
  e.hitT = Math.max(0, e.hitT - dt);
  e.lastKnown = { x: p.x, z: p.z };
  if (e.stunT > 0) {
    e.stunT -= dt;
    e.anim = "stun";
    return;
  }
  const ph = phaseOf(e);
  if (ph !== b.phase) {
    b.phase = ph;
    G.emit({ type: "bossPhase", boss: b.id, phase: ph });
    onPhase(G, e, ph);
  }
  if (p.dead) {
    e.vx = e.vz = 0;
    e.anim = "idle";
    return;
  }
  if (b.act === "intro") {
    face(e, p.x, p.z, dt);
    e.anim = "taunt";
    if (b.actT <= 0) next(G, e);
    return;
  }
  ({ razor, ironjaw, specter, vex })[b.id](G, e, dt);
}

function onPhase(G, e, ph) {
  const b = e.boss;
  const A = b.arena;
  if (b.id === "razor" && ph === 2) {
    G.say("Razor", "Fangs! Rip this merc apart!");
    for (const k of [0, 1]) G.spawnEnemy("gangFighter", k ? A.x0 + 3 : A.x1 - 3, A.z0 + 3, { tag: "bossAdd", alert: true, noLoot: false });
  }
  if (b.id === "ironjaw" && ph === 2) {
    e.armorFront = 0.3;
    G.say("Ironjaw", "PLATING… COMPROMISED. FURNACE… VENTING.");
    G.emit({ type: "armorBreak", id: e.id, x: e.x, y: e.y + 1.8, z: e.z });
  }
  if (b.id === "specter" && ph === 2) G.say("Specter-9", "Let's see you track three of me.");
  if (b.id === "specter" && ph === 3) G.say("Specter-9", "…No more games.");
  if (b.id === "vex" && ph === 2) {
    G.say("Director Vex", "You think the building is on your side? Every panel here answers to me.");
    b.shieldOn = false;
  }
  if (b.id === "vex" && ph === 3) {
    G.say("Director Vex", "OVERCLOCK. CHOIR, SING FOR ME.");
    for (const k of [0, 1]) G.spawnEnemy("eliteGuard", k ? A.x0 + 4 : A.x1 - 4, A.z1 - 4, { tag: "bossAdd", alert: true });
  }
}

function next(G, e) {
  const b = e.boss;
  b.n++;
  ({ razor: razorNext, ironjaw: ironNext, specter: specNext, vex: vexNext })[b.id](G, e);
}

/* ============================================================ RAZOR */
function razorNext(G, e) {
  const b = e.boss;
  const roll = b.n % 3;
  if (roll === 0) {
    b.act = "rush";
    b.rushes = b.phase === 2 ? 3 : 1;
    beginRush(G, e);
  } else {
    b.act = "strafe";
    b.actT = 3.2 + G.rand();
    b.burst = 0;
    b.fireT = 0.9;
    b.dir = G.rand() < 0.5 ? 1 : -1;
  }
}
function beginRush(G, e) {
  const b = e.boss;
  const p = G.player;
  const ang = yawOf(p.x - e.x, p.z - e.z);
  const len = Math.min(18, dist(e.x, e.z, p.x, p.z) + 5);
  b.rush = { ang, len, warn: b.phase === 2 ? 0.65 : 0.85, go: false, travelled: 0, hit: false };
  b.actT = 9;
  hz(G, { kind: "line", x: e.x, z: e.z, ang, len, width: 1.6, warn: b.rush.warn, life: 0.01, dmg: 0, owner: e.id, color: "#ff3b5c" });
  G.emit({ type: "telegraph", id: e.id, kind: "rush" });
  e.anim = "crouch";
}
function razor(G, e, dt) {
  const b = e.boss;
  const p = G.player;
  if (b.act === "rush") {
    const r = b.rush;
    if (!r.go) {
      r.warn -= dt;
      e.yaw = r.ang;
      e.anim = "crouch";
      if (r.warn <= 0) {
        r.go = true;
        G.emit({ type: "dash", id: e.id });
      }
      return;
    }
    const sp = 17;
    const tx = e.x + Math.sin(r.ang) * sp * dt;
    const tz = e.z + Math.cos(r.ang) * sp * dt;
    const ox = e.x;
    const oz = e.z;
    const wall = step(G, e, tx, tz, sp, dt);
    r.travelled += dist(ox, oz, e.x, e.z);
    e.anim = "dash";
    if (!r.hit && dist(e.x, e.z, p.x, p.z) < 1.3 && Math.abs(p.y - e.y) < 1.3) {
      r.hit = true;
      G.damagePlayer(24, e, "melee", { knock: [Math.sin(r.ang) * 7, Math.cos(r.ang) * 7] });
    }
    if (r.travelled >= r.len || wall || dist(ox, oz, e.x, e.z) < sp * dt * 0.2) {
      b.rushes--;
      e.vx = e.vz = 0;
      if (b.rushes > 0) beginRush(G, e);
      else {
        b.act = "recover";
        b.actT = 1.3;
        b.vuln = 1.3;
        e.anim = "stagger";
        G.emit({ type: "vulnerable", id: e.id });
      }
    }
    return;
  }
  if (b.act === "recover") {
    e.anim = "stagger";
    if (b.actT <= 0) next(G, e);
    return;
  }
  // strafe + SMG bursts (laser sight warns before each burst)
  const d = dist(e.x, e.z, p.x, p.z);
  const a = yawOf(e.x - p.x, e.z - p.z) + b.dir * dt * 0.9;
  const R = clamp(d, 7, 12);
  step(G, e, p.x + Math.sin(a) * R, p.z + Math.cos(a) * R, b.phase === 2 ? 4.6 : 3.6, dt);
  face(e, p.x, p.z, dt, 10);
  e.anim = "run";
  b.fireT -= dt;
  if (b.fireT <= 0 && !b.aiming) {
    b.aiming = 0.45;
    hz(G, { kind: "aimline", from: e.id, warn: 0.45, life: 0.01, color: "#ff3b5c" });
  }
  if (b.aiming) {
    b.aiming -= dt;
    e.anim = "aim";
    if (b.aiming <= 0) {
      b.aiming = 0;
      b.burst = b.phase === 2 ? 9 : 7;
      b.shotT = 0;
    }
  }
  if (b.burst > 0) {
    b.shotT -= dt;
    e.anim = "shoot";
    if (b.shotT <= 0) {
      b.shotT = b.phase === 2 ? 0.075 : 0.09;
      b.burst--;
      const s = aimAt(G, e, 1.6);
      G.bossHitscan(e, s, 5, 50);
      if (b.burst <= 0) b.fireT = 1.1 + G.rand() * 0.6;
    }
  }
  if (b.actT <= 0 && b.burst <= 0 && !b.aiming) next(G, e);
}

/* ============================================================ IRONJAW */
function ironNext(G, e) {
  const b = e.boss;
  const p = G.player;
  const d = dist(e.x, e.z, p.x, p.z);
  const opts = d < 7 ? ["slam", "slam", "sweep"] : ["charge", "sweep", "charge", "slam"];
  b.act = opts[b.n % opts.length];
  if (b.act === "slam") {
    b.actT = 1.15;
    b.slamHit = false;
    hz(G, { kind: "circle", x: e.x, z: e.z, r: 6.5, warn: 1.15, life: 0.12, dmg: 34, ground: true, owner: e.id, color: "#ff8a1f" });
    if (b.phase === 2) hz(G, { kind: "ring", x: e.x, z: e.z, r0: 6.5, r: 11, warn: 1.85, life: 0.12, dmg: 26, ground: true, owner: e.id, color: "#ff5a1f" });
    G.emit({ type: "telegraph", id: e.id, kind: "slam" });
    e.anim = "slamWind";
  } else if (b.act === "charge") {
    const ang = yawOf(p.x - e.x, p.z - e.z);
    b.charge = { ang, warn: 1.0, go: false, hit: false, t: 0 };
    b.actT = 6;
    hz(G, { kind: "line", x: e.x, z: e.z, ang, len: 22, width: 2.4, warn: 1.0, life: 0.01, dmg: 0, owner: e.id, color: "#ff8a1f" });
    G.emit({ type: "telegraph", id: e.id, kind: "charge" });
    e.anim = "roar";
  } else {
    b.actT = 3.6;
    b.sweep = { warn: 1.0, base: yawOf(p.x - e.x, p.z - e.z), t: 0, shotT: 0 };
    hz(G, { kind: "cone", x: e.x, z: e.z, ang: b.sweep.base, spread: 1.4, len: 26, warn: 1.0, life: 0.01, owner: e.id, color: "#ffb02e" });
    G.emit({ type: "telegraph", id: e.id, kind: "spin" });
    e.anim = "aim";
  }
  if (b.phase === 2 && b.n % 2 === 0) {
    // molten vents erupt somewhere near the player
    for (let i = 0; i < 2; i++) {
      const s = randomSpot(G, b.arena, 0);
      hz(G, { kind: "pool", x: i ? G.player.x + (G.rand() - 0.5) * 4 : s.x, z: i ? G.player.z + (G.rand() - 0.5) * 4 : s.z, r: 2.6, warn: 1.6, life: 9, dps: 16, ground: true, color: "#ff4a1a" });
    }
  }
}
function ironjaw(G, e, dt) {
  const b = e.boss;
  const p = G.player;
  if (b.act === "slam") {
    e.anim = b.actT > 0.15 ? "slamWind" : "slam";
    if (b.actT <= 0) {
      G.emit({ type: "shockwave", x: e.x, z: e.z, r: 6.5 });
      b.act = "recover";
      b.actT = 1.1;
    }
    return;
  }
  if (b.act === "charge") {
    const c = b.charge;
    if (!c.go) {
      c.warn -= dt;
      e.yaw = c.ang;
      e.anim = "roar";
      if (c.warn <= 0) c.go = true;
      return;
    }
    c.t += dt;
    e.anim = "charge";
    const sp = 13;
    const ox = e.x;
    const oz = e.z;
    const wall = step(G, e, e.x + Math.sin(c.ang) * sp * dt, e.z + Math.cos(c.ang) * sp * dt, sp, dt);
    if (!c.hit && dist(e.x, e.z, p.x, p.z) < e.r + 0.9) {
      c.hit = true;
      G.damagePlayer(30, e, "melee", { knock: [Math.sin(c.ang) * 9, Math.cos(c.ang) * 9] });
    }
    const stuck = dist(ox, oz, e.x, e.z) < sp * dt * 0.3;
    if (wall || stuck || c.t > 1.8) {
      if (wall || stuck) {
        // slammed into the wall → stunned, armour open
        b.act = "stunned";
        b.actT = 2.6;
        b.vuln = 2.6;
        G.emit({ type: "vulnerable", id: e.id, big: true });
        G.emit({ type: "shockwave", x: e.x, z: e.z, r: 2 });
      } else {
        b.act = "recover";
        b.actT = 0.8;
      }
    }
    return;
  }
  if (b.act === "sweep") {
    const s = b.sweep;
    if (s.warn > 0) {
      s.warn -= dt;
      e.yaw = s.base;
      e.anim = "aim";
      return;
    }
    s.t += dt;
    e.anim = "shoot";
    const ang = s.base - 0.7 + (s.t / 2.4) * 1.4;
    e.yaw = ang;
    s.shotT -= dt;
    if (s.shotT <= 0 && s.t < 2.4) {
      s.shotT = 0.07;
      const m = muzzle(e);
      const sp = (G.rand() - 0.5) * 0.05;
      G.fireBolt(m.x, m.y, m.z, Math.sin(ang + sp), -0.02, Math.cos(ang + sp), 34, 7, { color: "#ffb02e", owner: e.id, size: 0.12 });
    }
    if (s.t > 2.6) {
      b.act = "recover";
      b.actT = 0.7;
    }
    return;
  }
  if (b.act === "stunned") {
    e.anim = "stagger";
    if (b.actT <= 0) {
      b.act = "recover";
      b.actT = 0.4;
    }
    return;
  }
  // recover / walk toward the player
  face(e, p.x, p.z, dt, 3);
  if (dist(e.x, e.z, p.x, p.z) > 4) {
    step(G, e, p.x, p.z, 1.9, dt);
    e.anim = "walk";
  } else e.anim = "idle";
  if (b.actT <= 0) next(G, e);
}

/* ============================================================ SPECTER-9 */
function specNext(G, e) {
  const b = e.boss;
  const seq = b.phase === 1 ? ["cloak", "snipe", "burst", "snipe"] : b.phase === 2 ? ["cloak", "snipe", "decoys", "burst", "snipe"] : ["dash", "snipe", "dash", "cloak", "burst"];
  b.act = seq[b.n % seq.length];
  if (b.act === "decoys" && (b.summoned.decoys || 0) >= 2) b.act = "burst";
  if (b.act === "cloak") {
    b.cloak = 1;
    b.actT = 3.2;
    b.dest = randomSpot(G, b.arena, 9);
    G.emit({ type: "cloak", id: e.id, on: true });
  } else if (b.act === "snipe") {
    b.actT = b.phase === 3 ? 1.0 : 1.3;
    hz(G, { kind: "laser", from: e.id, warn: b.actT, lock: 0.32, life: 0.08, dmg: b.phase === 3 ? 34 : 38, color: "#ff2050" });
    G.emit({ type: "telegraph", id: e.id, kind: "snipe" });
  } else if (b.act === "burst") {
    b.actT = 1.2;
    b.shots = 3;
    b.shotT = 0.35;
  } else if (b.act === "decoys") {
    b.summoned.decoys = (b.summoned.decoys || 0) + 2;
    for (let i = 0; i < 2; i++) {
      const s = randomSpot(G, b.arena, 7);
      G.spawnDecoy(e, s.x, s.z);
    }
    b.actT = 0.6;
    G.emit({ type: "decoys", id: e.id });
  } else if (b.act === "dash") {
    const p = G.player;
    const ang = yawOf(p.x - e.x, p.z - e.z);
    b.dash = { ang, warn: 0.6, go: false, len: Math.min(16, dist(e.x, e.z, p.x, p.z) + 3), done: 0, hit: false };
    hz(G, { kind: "line", x: e.x, z: e.z, ang, len: b.dash.len, width: 1.4, warn: 0.6, life: 0.01, owner: e.id, color: "#9fe7ff" });
    G.emit({ type: "telegraph", id: e.id, kind: "dash" });
    b.actT = 5;
  }
}
function specter(G, e, dt) {
  const b = e.boss;
  const p = G.player;
  if (b.act === "cloak") {
    e.anim = "run";
    step(G, e, b.dest.x, b.dest.z, 6.5, dt);
    face(e, b.dest.x, b.dest.z, dt);
    if (b.actT <= 0 || dist(e.x, e.z, b.dest.x, b.dest.z) < 0.5) {
      b.cloak = 0;
      G.emit({ type: "cloak", id: e.id, on: false, x: e.x, y: e.y + 1, z: e.z });
      next(G, e);
    }
    return;
  }
  face(e, p.x, p.z, dt, 10);
  if (b.act === "snipe") {
    e.anim = "aim";
    if (b.actT <= 0) {
      b.act = "pause";
      b.actT = 0.6;
    }
    return;
  }
  if (b.act === "burst") {
    e.anim = "shoot";
    b.shotT -= dt;
    if (b.shotT <= 0 && b.shots > 0) {
      b.shots--;
      b.shotT = 0.22;
      const s = aimAt(G, e, 0.6, 0.8, 34);
      G.fireBolt(s.m.x, s.m.y, s.m.z, s.dx, s.dy, s.dz, 34, 11, { color: "#9fe7ff", owner: e.id });
    }
    if (b.actT <= 0) next(G, e);
    return;
  }
  if (b.act === "dash") {
    const r = b.dash;
    if (!r.go) {
      r.warn -= dt;
      e.yaw = r.ang;
      e.anim = "crouch";
      if (r.warn <= 0) r.go = true;
      return;
    }
    const sp = 20;
    const ox = e.x;
    const oz = e.z;
    const wall = step(G, e, e.x + Math.sin(r.ang) * sp * dt, e.z + Math.cos(r.ang) * sp * dt, sp, dt);
    r.done += dist(ox, oz, e.x, e.z);
    e.anim = "slash";
    if (!r.hit && dist(e.x, e.z, p.x, p.z) < 1.3) {
      r.hit = true;
      G.damagePlayer(22, e, "melee");
    }
    if (r.done >= r.len || wall) {
      b.act = "pause";
      b.actT = 0.9;
      b.vuln = 0.9;
    }
    return;
  }
  // pause: drift sideways
  e.anim = "walk";
  const a = yawOf(e.x - p.x, e.z - p.z) + dt * 1.2;
  const R = clamp(dist(e.x, e.z, p.x, p.z), 9, 14);
  step(G, e, p.x + Math.sin(a) * R, p.z + Math.cos(a) * R, 3.2, dt);
  if (b.actT <= 0) next(G, e);
}

/* ============================================================ DIRECTOR VEX */
function vexNext(G, e) {
  const b = e.boss;
  const A = b.arena;
  if (b.phase === 1) {
    const drones = G.enemies.filter((o) => o.tag === "vexDrone" && o.state !== "dead").length;
    if (!b.shieldOn && drones === 0 && (b.shieldT ?? 0) <= b.t) {
      // (re)deploy the drone guard → invulnerable until they fall
      b.shieldOn = true;
      const n = (b.summoned.waves || 0) === 0 ? 3 : 2;
      b.summoned.waves = (b.summoned.waves || 0) + 1;
      for (let i = 0; i < n; i++) G.spawnEnemy("drone", e.x + Math.sin(i * 2.1) * 3, e.z + Math.cos(i * 2.1) * 3, { tag: "vexDrone", alert: true, noLoot: true });
      G.say("Director Vex", b.summoned.waves === 1 ? "Shield drones, deploy. Let's see how long a freelancer lasts." : "Again.");
    }
    b.act = "volley";
    b.actT = 1.6;
    b.shots = 1;
    b.shotT = 0.5;
    return;
  }
  const seq = b.phase === 2 ? ["panels", "volley", "beam", "volley"] : ["teleport", "orbs", "panels", "teleport", "beam", "orbs"];
  b.act = seq[b.n % seq.length];
  if (b.act === "volley") {
    b.actT = 1.6;
    b.shots = b.phase === 3 ? 2 : 1;
    b.shotT = 0.5;
  } else if (b.act === "panels") {
    // 3×3 floor sectors, a random 4 (never all around the player) electrify
    const cols = 3;
    const w = (A.x1 - A.x0) / cols;
    const dz = (A.z1 - A.z0) / cols;
    const ids = [...Array(9).keys()].sort(() => G.rand() - 0.5).slice(0, b.phase === 3 ? 5 : 4);
    for (const k of ids) {
      const cx = A.x0 + (k % cols) * w;
      const cz = A.z0 + Math.floor(k / cols) * dz;
      hz(G, { kind: "panel", x0: cx + 0.3, z0: cz + 0.3, x1: cx + w - 0.3, z1: cz + dz - 0.3, warn: 1.5, life: 2.4, dps: 30, ground: true, color: "#ffe14d" });
    }
    b.actT = 1.8;
    G.emit({ type: "telegraph", id: e.id, kind: "panels" });
  } else if (b.act === "beam") {
    const p = G.player;
    const base = yawOf(p.x - e.x, p.z - e.z) - 1.1;
    hz(G, { kind: "beam", from: e.id, x: e.x, z: e.z, ang: base, sweep: 2.2, len: 30, height: 1.25, warn: 1.1, life: 2.6, dmg: 26, color: "#ff2bd6" });
    b.actT = 3.9;
    G.emit({ type: "telegraph", id: e.id, kind: "beam" });
  } else if (b.act === "teleport") {
    b.dest = randomSpot(G, A, 10);
    hz(G, { kind: "circle", x: b.dest.x, z: b.dest.z, r: 1.3, warn: 0.8, life: 0.01, dmg: 0, ground: true, color: "#ff2bd6" });
    b.actT = 0.8;
  } else if (b.act === "orbs") {
    b.shots = 4;
    b.shotT = 0.3;
    b.actT = 2;
  }
}
function vex(G, e, dt) {
  const b = e.boss;
  const p = G.player;
  if (b.phase === 1 && b.shieldOn) {
    const drones = G.enemies.filter((o) => o.tag === "vexDrone" && o.state !== "dead").length;
    if (drones === 0) {
      b.shieldOn = false;
      b.shieldT = b.t + 11; // exposed for a while
      b.vuln = 0;
      G.emit({ type: "shieldDown", id: e.id });
      G.say("Director Vex", "…Irrelevant.");
    }
  }
  face(e, p.x, p.z, dt, 6);
  if (b.act === "teleport") {
    e.anim = "cast";
    if (b.actT <= 0) {
      G.emit({ type: "teleport", id: e.id, x: e.x, y: e.y + 1, z: e.z, tx: b.dest.x, tz: b.dest.z });
      e.x = b.dest.x;
      e.z = b.dest.z;
      next(G, e);
    }
    return;
  }
  if (b.act === "volley" || b.act === "orbs") {
    e.anim = "cast";
    b.shotT -= dt;
    if (b.shotT <= 0 && b.shots > 0) {
      b.shots--;
      b.shotT = b.act === "orbs" ? 0.35 : 0.55;
      const s = aimAt(G, e, 0, 0.5, 18);
      if (b.act === "volley") {
        for (let k = -2; k <= 2; k++) {
          const a = Math.atan2(s.dx, s.dz) + k * 0.16;
          G.fireBolt(s.m.x, s.m.y, s.m.z, Math.sin(a), s.dy, Math.cos(a), 19, 12, { color: "#ff2bd6", owner: e.id, size: 0.22 });
        }
      } else {
        const a = Math.atan2(s.dx, s.dz) + (G.rand() - 0.5) * 1.6;
        G.fireBolt(s.m.x, s.m.y + 0.4, s.m.z, Math.sin(a), 0.15, Math.cos(a), 7, 15, { color: "#ff6bf0", owner: e.id, size: 0.32, homing: 2.2, life: 7, hp: 1 });
      }
    }
    if (b.actT <= 0 && b.shots <= 0) next(G, e);
    return;
  }
  // panels / beam: hold position, slow walk
  e.anim = b.act === "beam" ? "cast" : "walk";
  if (b.act !== "beam") {
    const a = yawOf(e.x - p.x, e.z - p.z) + dt * 0.6;
    const R = clamp(dist(e.x, e.z, p.x, p.z), 8, 13);
    step(G, e, p.x + Math.sin(a) * R, p.z + Math.cos(a) * R, 2.2, dt);
  }
  if (b.actT <= 0) next(G, e);
}

export function bossDefeated(G, e) {
  killEnemy(G, e);
  for (const o of G.enemies) if ((o.tag === "bossAdd" || o.tag === "vexDrone" || o.tag === "decoy") && o.state !== "dead") killEnemy(G, o);
  G.hazards.length = 0;
  G.bolts.length = 0;
}

export { raycast, lineOfSight, wrapAngle };
