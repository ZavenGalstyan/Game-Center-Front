/**
 * Hulk: Open World 3D — boss fights (framework-free).
 *
 *  WAR MACHINE    7 m armoured mech. Chaingun sweep (laser-sight telegraph),
 *                 lobbed missile barrage onto marked circles (vents overheat
 *                 afterwards = weakness window), stomp, and from phase 2 a
 *                 straight-line charge that STUNS it if it rams a building.
 *  IRON COLOSSUS  13 m industrial robot. Hammer slam (marked impact zone)
 *                 sends a ground ring you must jump over and leaves the
 *                 hammer stuck — it kneels, chest core exposed; furnace
 *                 flame cone; hurls concrete; from phase 2 a magnet pull
 *                 into an arm sweep.
 *  TITAN DESTROYER 15 m combat machine behind an energy shield that only
 *                 drops when its three shield generators are destroyed
 *                 (phase 1 and again at half health). Ground-level beam
 *                 sweep (jump it) that overheats the core, orbital strike
 *                 markers, drone (robot) deployment, homing plasma orbs.
 *
 * Damage model: outside weakness windows armour soaks most of a hit
 * (throws soak less); inside a window everything lands ×1.6 and the
 * exposed core ×2.2. Every powerful attack is telegraphed for ≥ 0.6 s.
 */
import { GRAVITY } from "./config.js";
import { clamp, wrapA, dampA } from "./util.js";
import { HERO } from "./config.js";

export const BOSSES = {
  warMachine: { name: "War Machine", hp: 3200, r: 3.0, h: 7, speed: 4.2, armor: 0.3, xp: 900 },
  colossus: { name: "Iron Colossus", hp: 5200, r: 3.6, h: 13, speed: 3.2, armor: 0.25, xp: 1400 },
  titan: { name: "Titan Destroyer", hp: 5800, r: 3.9, h: 15, speed: 3.6, armor: 0.25, xp: 2200 },
};

export function makeBoss(sim, kind, x, z, o = {}) {
  const def = BOSSES[kind];
  const hp = def.hp * sim.diff.enemyHp * (o.hpMul || 1);
  const b = {
    kind,
    def,
    name: o.name || def.name,
    x,
    y: sim.col.groundAt(x, z, 2, 1.2, 1, false).y,
    z,
    vx: 0,
    vz: 0,
    heading: o.heading || 0,
    hp,
    maxHp: hp,
    phase: 1,
    state: "intro",
    stT: 0,
    t: 0,
    vuln: 0,
    stun: 0,
    shield: false,
    gens: [],
    cdNext: 2,
    dead: false,
    deadT: 0,
    flash: 0,
    parts: [],
    anim: { mode: "idle", walk: 0, arm: 0, glow: 0, pods: 0, kneel: 0, hammer: 0, beam: 0, flame: 0, pull: 0 },
    markers: [], // telegraphed ground circles {x,z,r,t,ttl,kind}
    beam: null,
    ring: null,
    lastAttack: null,
    summoned: 0,
    hitTest: null,
    order: 0,
  };
  b.hitTest = (x, y, z, r) => {
    for (const p of b.parts) if (Math.hypot(p.x - x, p.y - y, p.z - z) < p.r + r) return true;
    return false;
  };
  updateParts(b);
  return b;
}

/** collision / hit spheres follow the pose */
function updateParts(b) {
  const f = [Math.sin(b.heading), Math.cos(b.heading)];
  const s = [f[1], -f[0]];
  const D = b.def;
  const kneel = b.anim.kneel;
  const P = (side, fwd, y, r, weak) => ({ x: b.x + s[0] * side + f[0] * fwd, y: b.y + y, z: b.z + s[1] * side + f[1] * fwd, r, weak });
  const bodyY = D.h * (0.62 - kneel * 0.3);
  b.parts = [
    P(0, 0, bodyY, D.r * 1.05, false),
    P(0, D.r * 0.6, bodyY - D.h * 0.05, D.r * 0.55, true), // chest core
    P(D.r * 0.55, 0, D.h * 0.22 * (1 - kneel * 0.4), D.r * 0.5, false),
    P(-D.r * 0.55, 0, D.h * 0.22 * (1 - kneel * 0.4), D.r * 0.5, false),
    P(0, 0, D.h * 0.38 * (1 - kneel * 0.35), D.r * 0.7, false),
  ];
}

export function damageBossImpl(sim, b, dmg, o = {}) {
  if (b.dead || b.state === "intro") return 0;
  if (b.shield) {
    sim.fx.push({ type: "shieldHit", x: o.x ?? b.x, y: o.y ?? b.y + b.def.h * 0.5, z: o.z ?? b.z });
    sim.events.push({ type: "bossShielded", boss: b });
    return 0;
  }
  let k = b.vuln > 0 || b.stun > 0 ? 1.6 : o.kind === "throw" ? 0.75 : b.def.armor;
  // exposed core
  if ((b.vuln > 0 || b.stun > 0) && o.x != null) {
    const core = b.parts[1];
    if (Math.hypot(core.x - o.x, core.y - (o.y ?? core.y), core.z - o.z) < core.r + 2.5) k = 2.2;
  }
  const real = dmg * k;
  b.hp -= real;
  b.flash = 0.12;
  sim.events.push({ type: "bossHit", boss: b, dmg: real, weak: k > 1 });
  if (o.x != null) sim.fx.push({ type: k > 1 ? "impact" : "spark", x: o.x, y: o.y ?? b.y + 3, z: o.z, n: 8, big: k > 1 });
  if (b.hp <= 0) {
    b.hp = 0;
    b.dead = true;
    b.deadT = 0;
    b.state = "dying";
    b.markers.length = 0;
    b.beam = null;
    b.ring = null;
    sim.events.push({ type: "bossDefeated", boss: b });
  } else {
    // phase transitions
    const f = b.hp / b.maxHp;
    const want = f < 0.25 ? 3 : f < 0.6 ? 2 : 1;
    if (b.kind === "titan" && b.phase === 1 && f < 0.5 && !b.shieldTwo) {
      b.shieldTwo = true;
      raiseShield(sim, b);
    }
    if (want > b.phase) {
      b.phase = want;
      sim.events.push({ type: "bossPhase", boss: b, phase: want });
      sim.shake(b.x, b.z, 0.8, 120);
      b.cdNext = Math.min(b.cdNext, 1.2);
      if (b.kind !== "titan" || want === 3) summon(sim, b, want === 2 ? 4 : 3);
    }
  }
  return real;
}

function summon(sim, b, n) {
  const type = b.kind === "warMachine" ? "soldier" : "robot";
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + sim.rand();
    const s = sim.safeSpot(b.x + Math.sin(a) * 18, b.z + Math.cos(a) * 18);
    sim.spawnEnemy(i === 0 && b.phase >= 3 ? (b.kind === "warMachine" ? "heavy" : "robot") : type, s.x, s.z, { aggro: true, tag: "bossAdd" });
  }
  b.summoned += n;
  sim.events.push({ type: "bossSummon", boss: b, n });
}

function raiseShield(sim, b) {
  b.shield = true;
  b.gens = [];
  for (let i = 0; i < 3; i++) {
    const a = b.heading + Math.PI + (i - 1) * 1.6 + sim.rand() * 0.3;
    const s = sim.safeSpot(b.x + Math.sin(a) * 24, b.z + Math.cos(a) * 24);
    b.gens.push(sim.spawnProp("shieldGen", s.x, s.z, { tag: "shieldGen" }));
  }
  sim.events.push({ type: "bossShield", boss: b });
}

/* ================================================================ update */
export function updateBosses(sim, dt) {
  for (const b of sim.bosses) {
    b.t += dt;
    b.flash = Math.max(0, b.flash - dt);
    if (b.dead) {
      b.deadT += dt;
      b.anim.mode = "dying";
      b.anim.kneel = Math.min(1, b.anim.kneel + dt);
      if (b.deadT < 3 && Math.floor(b.deadT * 4) !== Math.floor((b.deadT - dt) * 4)) {
        sim.fx.push({ type: "explosion", x: b.x + (sim.rand() - 0.5) * b.def.r * 2, y: b.y + sim.rand() * b.def.h, z: b.z + (sim.rand() - 0.5) * b.def.r * 2, r: 3 });
        sim.events.push({ type: "explosion", x: b.x, y: b.y, z: b.z, r: 3 });
      }
      if (b.deadT >= 3 && !b.finalBoom) {
        b.finalBoom = true;
        sim.fx.push({ type: "bigExplosion", x: b.x, y: b.y + b.def.h * 0.5, z: b.z, r: b.def.r * 3 });
        sim.events.push({ type: "explosion", x: b.x, y: b.y, z: b.z, r: 10, big: true });
        sim.shake(b.x, b.z, 1, 200);
      }
      continue;
    }
    if (b.state === "intro") {
      b.stT += dt;
      b.anim.mode = "intro";
      faceHero(sim, b, dt, 2);
      if (b.stT > 2.2) {
        b.state = "idle";
        b.stT = 0;
        if (b.kind === "titan") raiseShield(sim, b);
        sim.events.push({ type: "bossStart", boss: b });
      }
      updateParts(b);
      continue;
    }
    b.vuln = Math.max(0, b.vuln - dt);
    b.stun = Math.max(0, b.stun - dt);
    b.stT += dt;
    // shield generators
    if (b.shield && b.gens.length && b.gens.every((g) => g.state === 2 || g.mode === "gone")) {
      b.shield = false;
      b.vuln = 4;
      sim.events.push({ type: "bossShieldDown", boss: b });
      sim.shake(b.x, b.z, 0.8, 100);
    }
    updateMarkers(sim, b, dt);
    updateRing(sim, b, dt);
    if (b.stun > 0) {
      b.anim.mode = "stunned";
      b.anim.kneel = Math.min(1, b.anim.kneel + dt * 3);
      b.vx = b.vz = 0;
      updateParts(b);
      continue;
    }
    const ex = b.anim.mode === "vuln" ? 1 : 0;
    b.anim.kneel = Math.max(ex ? 0.8 : 0, b.anim.kneel - dt * 1.5);
    if (b.kind === "warMachine") warMachine(sim, b, dt);
    else if (b.kind === "colossus") colossus(sim, b, dt);
    else titan(sim, b, dt);
    // walk with collision
    b.x += b.vx * dt;
    b.z += b.vz * dt;
    const c = sim.col.pushOut(b, b.def.r, b.def.h, 1.5, false);
    if (c && b.state === "charge") {
      // rammed a building: stunned (weakness window)
      b.state = "idle";
      b.stT = 0;
      b.stun = 3.6;
      b.vx = b.vz = 0;
      sim.fx.push({ type: "dust", x: b.x + Math.sin(b.heading) * b.def.r, y: b.y + 3, z: b.z + Math.cos(b.heading) * b.def.r, r: 6 });
      sim.events.push({ type: "bossStunned", boss: b });
      sim.shake(b.x, b.z, 1, 120);
    }
    // smash props it walks through
    for (const p of sim.col.propsIn(b.x - b.def.r, b.z - b.def.r, b.x + b.def.r, b.z + b.def.r)) {
      if (p.mode === "static" && !p.tag && p.state < 2) sim.damagePropBy(p, 500, { byPlayer: false, dx: Math.sin(b.heading), dz: Math.cos(b.heading) });
    }
    b.y = sim.col.groundAt(b.x, b.z, b.y + 2, 2.5, 1, false).y;
    b.anim.walk += Math.hypot(b.vx, b.vz) * dt * 0.25;
    updateParts(b);
  }
}

function faceHero(sim, b, dt, rate) {
  const h = sim.hero;
  b.heading = dampA(b.heading, Math.atan2(h.x - b.x, h.z - b.z), rate, dt);
}
function heroDist(sim, b) {
  return Math.hypot(sim.hero.x - b.x, sim.hero.z - b.z);
}
function walkToward(sim, b, want, speed) {
  const h = sim.hero;
  const d = heroDist(sim, b);
  const dir = d > want + 2 ? 1 : d < want - 4 ? -0.6 : 0;
  const f = [Math.sin(b.heading), Math.cos(b.heading)];
  b.vx = f[0] * speed * dir;
  b.vz = f[1] * speed * dir;
  void h;
}
const heroAirborne = (sim) => {
  const h = sim.hero;
  return !h.grounded && h.y - h.groundY > 0.9;
};

/* ---------------------------------------------------------------- markers / rings */
function addMarker(b, x, z, r, ttl, kind, dmg) {
  b.markers.push({ x, z, r, t: 0, ttl, kind, dmg });
}
function updateMarkers(sim, b, dt) {
  for (const m of b.markers) {
    m.t += dt;
    if (m.t >= m.ttl && !m.done) {
      m.done = true;
      if (m.kind === "strike") {
        sim.explodeAt(m.x, sim.col.groundAt(m.x, m.z, 40, 0, 0.5).y + 0.5, m.z, m.r, m.dmg, { byPlayer: false, hurtsHero: true, big: true });
      }
    }
  }
  b.markers = b.markers.filter((m) => !m.done || m.t < m.ttl + 0.3);
}
function updateRing(sim, b, dt) {
  const r = b.ring;
  if (!r) return;
  r.r += r.speed * dt;
  const h = sim.hero;
  const d = Math.hypot(h.x - r.x, h.z - r.z);
  if (!r.hit && Math.abs(d - r.r) < 1.3 && !heroAirborne(sim) && Math.abs(h.y - r.y) < 2) {
    r.hit = true;
    sim.damageHero(r.dmg, { x: r.x, z: r.z, kind: "shockwave", knock: 10, lift: 6 });
  }
  if (r.r > r.max) b.ring = null;
}

/* ================================================================ WAR MACHINE */
function warMachine(sim, b, dt) {
  const A = b.anim;
  const h = sim.hero;
  const d = heroDist(sim, b);
  const fast = b.phase >= 3 ? 0.7 : b.phase === 2 ? 0.85 : 1;
  switch (b.state) {
    case "idle": {
      faceHero(sim, b, dt, 3);
      walkToward(sim, b, 17, b.def.speed);
      A.mode = Math.hypot(b.vx, b.vz) > 0.3 ? "walk" : "idle";
      A.arm = Math.max(0, A.arm - dt * 2);
      A.pods = Math.max(0, A.pods - dt * 2);
      b.cdNext -= dt;
      if (b.cdNext > 0) break;
      b.vx = b.vz = 0;
      const opts = [];
      if (d < 8) opts.push("stomp", "stomp");
      if (d >= 7) opts.push("chaingun");
      opts.push("missiles");
      if (b.phase >= 2 && d > 12) opts.push("charge", "charge");
      let pick = opts[Math.floor(sim.rand() * opts.length)];
      if (pick === b.lastAttack && opts.length > 1) pick = opts[(opts.indexOf(pick) + 1) % opts.length];
      b.lastAttack = pick;
      b.state = pick + "Tele";
      b.stT = 0;
      sim.events.push({ type: "bossTelegraph", boss: b, attack: pick });
      break;
    }
    case "chaingunTele":
      faceHero(sim, b, dt, 4);
      A.mode = "aim";
      A.arm = Math.min(1, A.arm + dt * 2);
      b.beam = { kind: "sight", yaw: b.heading, len: 60 };
      if (b.stT > 0.9 * fast) {
        b.state = "chaingun";
        b.stT = 0;
        b.sweep0 = b.heading - 0.45;
        b.fireT = 0;
      }
      break;
    case "chaingun": {
      const dur = 2.2 * fast;
      const u = b.stT / dur;
      b.heading = b.sweep0 + 0.9 * u;
      b.beam = null;
      A.mode = "fire";
      b.fireT -= dt;
      if (b.fireT <= 0) {
        b.fireT = 0.095 * fast;
        const f = [Math.sin(b.heading), Math.cos(b.heading)];
        const mx = b.x + f[0] * 2.6 + f[1] * 1.6;
        const mz = b.z + f[1] * 2.6 - f[0] * 1.6;
        const my = b.y + 4.4;
        const ty = h.y + 1.5;
        const dd = Math.max(5, d);
        sim.spawnProjectile("bullet", mx, my, mz, f[0] * dd + (sim.rand() - 0.5) * dd * 0.06, ty - my, f[1] * dd + (sim.rand() - 0.5) * dd * 0.06, { owner: b, dmgMul: 0.9 });
        sim.fx.push({ type: "muzzle", x: mx, y: my, z: mz, kind: "bullet" });
        sim.events.push({ type: "bossFire", boss: b, kind: "bullet" });
      }
      if (b.stT > dur) toIdle(b, 1.4 * fast);
      break;
    }
    case "missilesTele":
      faceHero(sim, b, dt, 3);
      A.mode = "pods";
      A.pods = Math.min(1, A.pods + dt * 1.5);
      if (b.stT > 1.0 * fast) {
        const n = b.phase >= 3 ? 9 : 6;
        for (let i = 0; i < n; i++) {
          const a = sim.rand() * Math.PI * 2;
          const rr = i === 0 ? 0 : 3 + sim.rand() * 9;
          const tx = h.x + h.vx * 0.8 + Math.sin(a) * rr;
          const tz = h.z + h.vz * 0.8 + Math.cos(a) * rr;
          const ty = sim.col.groundAt(tx, tz, 60, 0, 0.5).y;
          addMarker(b, tx, tz, 5, 1.7 + i * 0.12, "missile", 0);
          lob(sim, b, b.x, b.y + 6.5, b.z, tx, ty, tz, 1.7 + i * 0.12);
        }
        sim.events.push({ type: "bossFire", boss: b, kind: "missiles" });
        b.state = "missiles";
        b.stT = 0;
      }
      break;
    case "missiles":
      A.mode = "pods";
      if (b.stT > 2.2) {
        // vents overheat: weakness window
        b.state = "vent";
        b.stT = 0;
        b.vuln = 3.2;
        sim.events.push({ type: "bossVulnerable", boss: b });
      }
      break;
    case "vent":
      A.mode = "vuln";
      A.pods = Math.max(0, A.pods - dt);
      b.vx = b.vz = 0;
      if (b.stT > 3.2) toIdle(b, 1);
      break;
    case "stompTele":
      A.mode = "stompTele";
      if (b.stT > 0.65 * fast) {
        b.state = "stomp";
        b.stT = 0;
        b.ring = { x: b.x, y: b.y, z: b.z, r: 1, speed: 26, max: 13, dmg: 34 };
        if (d < 5 && !heroAirborne(sim)) sim.damageHero(30, { x: b.x, z: b.z, kind: "stomp", knock: 14, lift: 7 });
        sim.fx.push({ type: "shockwave", x: b.x, y: b.y + 0.1, z: b.z, r: 13 });
        sim.shake(b.x, b.z, 0.9, 80);
        sim.events.push({ type: "bossSlam", boss: b });
      }
      break;
    case "stomp":
      A.mode = "stomp";
      if (b.stT > 0.7) toIdle(b, 1);
      break;
    case "chargeTele":
      faceHero(sim, b, dt, 5);
      A.mode = "chargeTele";
      b.beam = { kind: "path", yaw: b.heading, len: 40 };
      if (b.stT > 0.85 * fast) {
        b.state = "charge";
        b.stT = 0;
        b.beam = null;
        b.hitHero = false;
      }
      break;
    case "charge": {
      A.mode = "charge";
      const f = [Math.sin(b.heading), Math.cos(b.heading)];
      b.vx = f[0] * 27;
      b.vz = f[1] * 27;
      if (!b.hitHero && d < b.def.r + HERO.radius + 0.6 && Math.abs(h.y - b.y) < 3) {
        b.hitHero = true;
        sim.damageHero(48, { x: b.x - f[0] * 3, z: b.z - f[1] * 3, kind: "charge", knock: 22, lift: 8 });
      }
      if (b.stT > 1.6) {
        b.vx = b.vz = 0;
        b.state = "vent";
        b.stT = 2.2; // short recovery window
        b.vuln = 1.0;
      }
      break;
    }
    default:
      toIdle(b, 1);
  }
}

/* ================================================================ IRON COLOSSUS */
function colossus(sim, b, dt) {
  const A = b.anim;
  const h = sim.hero;
  const d = heroDist(sim, b);
  const fast = b.phase >= 3 ? 0.72 : b.phase === 2 ? 0.86 : 1;
  switch (b.state) {
    case "idle": {
      faceHero(sim, b, dt, 2);
      walkToward(sim, b, 11, b.def.speed);
      A.mode = Math.hypot(b.vx, b.vz) > 0.3 ? "walk" : "idle";
      A.hammer = Math.max(0, A.hammer - dt * 2);
      A.flame = Math.max(0, A.flame - dt * 2);
      A.pull = Math.max(0, A.pull - dt * 2);
      b.cdNext -= dt;
      if (b.cdNext > 0) break;
      b.vx = b.vz = 0;
      const opts = ["slam", "slam"];
      if (d < 20) opts.push("flame");
      if (d > 14) opts.push("hurl", "hurl");
      if (b.phase >= 2) opts.push("magnet");
      let pick = opts[Math.floor(sim.rand() * opts.length)];
      if (pick === b.lastAttack) pick = opts[(opts.indexOf(pick) + 1) % opts.length];
      b.lastAttack = pick;
      b.state = pick + "Tele";
      b.stT = 0;
      sim.events.push({ type: "bossTelegraph", boss: b, attack: pick });
      if (pick === "slam") {
        const f = [Math.sin(b.heading), Math.cos(b.heading)];
        b.slamAt = { x: b.x + f[0] * 7.5, z: b.z + f[1] * 7.5 };
        addMarker(b, b.slamAt.x, b.slamAt.z, 5.5, 1.15 * fast, "slam", 0);
      }
      break;
    }
    case "slamTele":
      A.mode = "slamTele";
      A.hammer = Math.min(1, A.hammer + dt / (1.1 * fast));
      if (b.stT > 1.15 * fast) {
        const s = b.slamAt;
        const hy = sim.col.groundAt(s.x, s.z, 40, 0, 0.5).y;
        if (Math.hypot(h.x - s.x, h.z - s.z) < 5.5 && h.y - hy < 2.5) sim.damageHero(75, { x: s.x, z: s.z, kind: "slam", knock: 18, lift: 10 });
        b.ring = { x: s.x, y: hy, z: s.z, r: 5, speed: 18, max: 26, dmg: 28 };
        sim.fx.push({ type: "shockwave", x: s.x, y: hy + 0.1, z: s.z, r: 26 });
        sim.fx.push({ type: "crater", x: s.x, y: hy, z: s.z, r: 4.5 });
        sim.explodeProps(s.x, s.z, 7, 200);
        sim.shake(s.x, s.z, 1, 140);
        sim.events.push({ type: "bossSlam", boss: b });
        b.state = "stuck";
        b.stT = 0;
        b.vuln = 2.8;
        sim.events.push({ type: "bossVulnerable", boss: b });
      }
      break;
    case "stuck":
      A.mode = "vuln";
      A.hammer = 1;
      if (b.stT > 2.8) toIdle(b, 1.3 * fast);
      break;
    case "flameTele":
      faceHero(sim, b, dt, 2);
      A.mode = "flameTele";
      A.flame = Math.min(1, A.flame + dt);
      if (b.stT > 0.85 * fast) {
        b.state = "flame";
        b.stT = 0;
        b.sweep0 = b.heading - 0.5;
        b.fireT = 0;
      }
      break;
    case "flame": {
      const dur = 2.0;
      b.heading = b.sweep0 + (b.stT / dur) * 1.0;
      A.mode = "flame";
      A.flame = 1;
      b.fireT -= dt;
      if (b.fireT <= 0) {
        b.fireT = 0.05;
        const f = [Math.sin(b.heading), Math.cos(b.heading)];
        const my = b.y + 7.5;
        sim.spawnProjectile("flame", b.x + f[0] * 3.5, my, b.z + f[1] * 3.5, f[0] + (sim.rand() - 0.5) * 0.25, -0.38 + (sim.rand() - 0.5) * 0.1, f[1] + (sim.rand() - 0.5) * 0.25, { owner: b });
      }
      if (b.stT > dur) {
        toIdle(b, 1.2 * fast);
        b.vuln = 1.2; // furnace vents after breathing
      }
      break;
    }
    case "hurlTele":
      faceHero(sim, b, dt, 3);
      A.mode = "hurlTele";
      A.hammer = Math.min(1, A.hammer + dt);
      if (b.stT > 1.0 * fast) {
        const n = b.phase >= 3 ? 3 : b.phase === 2 ? 2 : 1;
        for (let i = 0; i < n; i++) {
          const tx = h.x + h.vx * 1.1 + (i ? (sim.rand() - 0.5) * 10 : 0);
          const tz = h.z + h.vz * 1.1 + (i ? (sim.rand() - 0.5) * 10 : 0);
          const ty = sim.col.groundAt(tx, tz, 60, 0, 0.5).y;
          addMarker(b, tx, tz, 4.5, 1.5 + i * 0.25, "missile", 0);
          lob(sim, b, b.x, b.y + 11, b.z, tx, ty, tz, 1.5 + i * 0.25, "orb");
        }
        sim.events.push({ type: "bossFire", boss: b, kind: "hurl" });
        b.state = "hurl";
        b.stT = 0;
      }
      break;
    case "hurl":
      A.mode = "hurl";
      if (b.stT > 0.8) toIdle(b, 1.2 * fast);
      break;
    case "magnetTele":
      faceHero(sim, b, dt, 3);
      A.mode = "magnet";
      A.pull = Math.min(1, A.pull + dt);
      if (b.stT > 0.8) {
        b.state = "magnet";
        b.stT = 0;
      }
      break;
    case "magnet": {
      faceHero(sim, b, dt, 3);
      A.mode = "magnet";
      // pull the hero in (sprinting / leaping away beats it)
      if (d > b.def.r + 3 && d < 45 && h.alive) {
        const k = 9 * dt;
        h.vx += ((b.x - h.x) / d) * k * 3;
        h.vz += ((b.z - h.z) / d) * k * 3;
      }
      if (b.stT > 1.8) {
        b.state = "sweep";
        b.stT = 0;
        sim.events.push({ type: "bossTelegraph", boss: b, attack: "sweep" });
      }
      break;
    }
    case "sweep":
      A.mode = "sweep";
      if (b.stT > 0.55 && !b.swept) {
        b.swept = true;
        if (d < 11 && !heroAirborne(sim)) sim.damageHero(55, { x: b.x, z: b.z, kind: "sweep", knock: 24, lift: 6 });
        sim.fx.push({ type: "shockwave", x: b.x, y: b.y + 1, z: b.z, r: 11, soft: true });
        sim.shake(b.x, b.z, 0.7, 60);
      }
      if (b.stT > 1.1) {
        b.swept = false;
        toIdle(b, 1.3 * fast);
      }
      break;
    default:
      toIdle(b, 1);
  }
}

/* ================================================================ TITAN DESTROYER */
function titan(sim, b, dt) {
  const A = b.anim;
  const h = sim.hero;
  const d = heroDist(sim, b);
  const fast = b.phase >= 3 ? 0.72 : b.phase === 2 ? 0.86 : 1;
  A.shield = b.shield ? 1 : 0;
  switch (b.state) {
    case "idle": {
      faceHero(sim, b, dt, 2);
      walkToward(sim, b, b.shield ? 26 : 16, b.def.speed);
      A.mode = Math.hypot(b.vx, b.vz) > 0.3 ? "walk" : "idle";
      A.beam = Math.max(0, A.beam - dt * 2);
      b.cdNext -= dt;
      // while shielded it keeps up harassing fire
      if (b.shield) {
        b.fireT = (b.fireT || 0) - dt;
        if (b.fireT <= 0) {
          b.fireT = 1.6 * fast;
          const f = [Math.sin(b.heading), Math.cos(b.heading)];
          for (const s of [-1, 1]) sim.spawnProjectile("blast", b.x + f[0] * 3 + f[1] * s * 3, b.y + 10, b.z + f[1] * 3 - f[0] * s * 3, h.x - b.x, h.y + 1.5 - (b.y + 10), h.z - b.z, { owner: b });
          sim.events.push({ type: "bossFire", boss: b, kind: "blast" });
        }
      }
      if (b.cdNext > 0) break;
      b.vx = b.vz = 0;
      const opts = ["beam", "strike"];
      if (d < 9) opts.push("stomp", "stomp");
      if (b.phase >= 2) opts.push("drones");
      if (b.phase >= 3) opts.push("orbs", "orbs");
      let pick = opts[Math.floor(sim.rand() * opts.length)];
      if (pick === b.lastAttack) pick = opts[(opts.indexOf(pick) + 1) % opts.length];
      if (pick === "drones" && sim.enemies.filter((e) => !e.dead && e.tag === "bossAdd").length > 3) pick = "beam";
      b.lastAttack = pick;
      b.state = pick + "Tele";
      b.stT = 0;
      sim.events.push({ type: "bossTelegraph", boss: b, attack: pick });
      break;
    }
    case "beamTele":
      faceHero(sim, b, dt, 2.5);
      A.mode = "beamTele";
      A.beam = Math.min(1, A.beam + dt);
      b.beam = { kind: "sight", yaw: b.heading - 0.8, len: 34 };
      if (b.stT > 1.0 * fast) {
        b.state = "beam";
        b.stT = 0;
        b.sweep0 = b.heading - 0.8;
        b.beamTick = 0;
      }
      break;
    case "beam": {
      const dur = 2.4 * fast;
      const yaw = b.sweep0 + (b.stT / dur) * 1.6;
      b.beam = { kind: "laser", yaw, len: 34, y: 0.8 };
      A.mode = "beam";
      // the beam skims the ground: jump over it
      const ang = Math.abs(wrapA(Math.atan2(h.x - b.x, h.z - b.z) - yaw));
      b.beamTick -= dt;
      if (b.beamTick <= 0 && d < 34 && ang < 0.07 + 2.0 / Math.max(4, d) && h.y - b.y < 1.6 && h.alive) {
        b.beamTick = 0.2;
        sim.damageHero(11, { x: b.x, z: b.z, kind: "laser" });
        sim.fx.push({ type: "hitHero", x: h.x, y: h.y + 1, z: h.z, kind: "laser" });
      }
      if (b.stT > dur) {
        b.beam = null;
        b.state = "overheat";
        b.stT = 0;
        b.vuln = 3;
        sim.events.push({ type: "bossVulnerable", boss: b });
      }
      break;
    }
    case "overheat":
      A.mode = "vuln";
      A.beam = Math.max(0, A.beam - dt);
      if (b.stT > 3) toIdle(b, 1.2 * fast);
      break;
    case "strikeTele":
      A.mode = "strike";
      if (b.stT > 0.5) {
        const n = b.phase >= 2 ? 6 : 4;
        for (let i = 0; i < n; i++) {
          const tx = h.x + h.vx * (0.6 + i * 0.25) + (sim.rand() - 0.5) * 8;
          const tz = h.z + h.vz * (0.6 + i * 0.25) + (sim.rand() - 0.5) * 8;
          addMarker(b, tx, tz, 5, 1.3 + i * 0.35, "strike", 46);
        }
        sim.events.push({ type: "bossFire", boss: b, kind: "strike" });
        b.state = "strike";
        b.stT = 0;
      }
      break;
    case "strike":
      A.mode = "strike";
      if (b.stT > 2.6) toIdle(b, 1.1 * fast);
      break;
    case "dronesTele":
      A.mode = "drones";
      if (b.stT > 1.0) {
        summon(sim, b, b.phase >= 3 ? 3 : 2);
        toIdle(b, 1.5);
      }
      break;
    case "orbsTele":
      A.mode = "beamTele";
      A.beam = Math.min(1, A.beam + dt * 2);
      if (b.stT > 0.8) {
        const f = [Math.sin(b.heading), Math.cos(b.heading)];
        for (let i = -1; i <= 1; i++) {
          const a = b.heading + i * 0.5;
          const pr = sim.spawnProjectile("orb", b.x + f[0] * 4, b.y + 9, b.z + f[1] * 4, Math.sin(a), -0.15, Math.cos(a), { owner: b });
          pr.homing = 1.4;
        }
        sim.events.push({ type: "bossFire", boss: b, kind: "orb" });
        toIdle(b, 1.4 * fast);
      }
      break;
    case "stompTele":
      A.mode = "stompTele";
      if (b.stT > 0.7 * fast) {
        b.ring = { x: b.x, y: b.y, z: b.z, r: 2, speed: 22, max: 16, dmg: 36 };
        if (d < 6 && !heroAirborne(sim)) sim.damageHero(40, { x: b.x, z: b.z, kind: "stomp", knock: 16, lift: 8 });
        sim.fx.push({ type: "shockwave", x: b.x, y: b.y + 0.1, z: b.z, r: 16 });
        sim.shake(b.x, b.z, 0.9, 80);
        sim.events.push({ type: "bossSlam", boss: b });
        b.state = "stomp";
        b.stT = 0;
      }
      break;
    case "stomp":
      A.mode = "stomp";
      if (b.stT > 0.8) toIdle(b, 1);
      break;
    default:
      toIdle(b, 1);
  }
}

function toIdle(b, cd) {
  b.state = "idle";
  b.stT = 0;
  b.cdNext = cd + 0.6;
  b.beam = null;
}

/** lob a projectile on a ballistic arc to land at (tx, ty, tz) after `T` seconds */
function lob(sim, b, x, y, z, tx, ty, tz, T, kind = "missile") {
  const g = GRAVITY * 0.6;
  const vx = (tx - x) / T;
  const vz = (tz - z) / T;
  const vy = (ty - y + 0.5 * g * T * T) / T;
  const pr = sim.spawnProjectile(kind, x, y, z, vx, vy, vz, { owner: b, speed: Math.hypot(vx, vy, vz), gravity: 0.6, life: T + 1, target: { x: tx, y: ty, z: tz } });
  return pr;
}

export { clamp };
