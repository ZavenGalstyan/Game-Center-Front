/**
 * Vaelith, the Ashen Wyrm — the Cinderpeak boss.
 *
 * Phase 1 (100–65%)  grounded: bite, claw swipe, tail sweep (when you're
 *                    behind her), fire breath (a sweeping cone), stomp.
 * Phase 2 (65–30%)   takes wing: circles the arena, strafing fire runs and
 *                    fireball volleys, then dives to land and fights on foot
 *                    for a while. A hit from either ballista knocks her out
 *                    of the sky (6 s, takes extra damage) — melee heroes'
 *                    answer to flight.
 * Phase 3 (<30%)     enraged: faster, fire nova rings, more breath.
 * At 1 HP she collapses ("down"): the fight ends and her fate is chosen.
 *
 * Every attack telegraphs on the ground before it lands.
 */
import { wrapAngle, approachAngle, clamp } from "./math.js";
import { applyDamage, spawnZone, spawnProjectile } from "./combat.js";

const CX = 310;
const CZ = -330;
const ARENA = 33;
const ALT = 17;

export function createDragon(G) {
  const y0 = G.ground(CX, CZ, 1e9);
  const D = {
    id: G.nextId++,
    kind: "boss",
    type: "dragon",
    name: "Vaelith, the Ashen Wyrm",
    team: "hostile",
    boss: true,
    unique: "dragon",
    tag: "dragon",
    x: CX,
    y: y0,
    z: CZ - 6,
    yaw: 0,
    vx: 0,
    vz: 0,
    alt: 0,
    r: 3,
    h: 5,
    hp: 3600,
    maxHp: 3600,
    armor: 30,
    poise: 9999,
    poiseMax: 0,
    status: {},
    resistFire: 0.6,
    state: "dormant",
    t: 0,
    phase: 1,
    atk: null,
    atkCd: 2,
    flightT: 0,
    groundT: 0,
    hitFlash: 0,
    dead: false,
    down: false,
    interior: null,
    mat: "scale",
    flap: 0,
    breath: null,
    neck: 0,
    tail: 0,
    jaw: 0,
    stunT: 0,
  };
  D.flying = () => D.alt > 2;
  D.hittable = () => D.state !== "dormant" && !D.down && D.state !== "gone";
  D.hitboxes = () => {
    const fx = Math.sin(D.yaw);
    const fz = Math.cos(D.yaw);
    const by = D.y + D.alt;
    const hy = by + (D.flying() ? 0 : 3.4) + D.neck * 0.8;
    const out = [
      { x: D.x, y: by + 2.2, z: D.z, r: 2.6, part: "body" },
      { x: D.x - fx * 2.6, y: by + 2.0, z: D.z - fz * 2.6, r: 2.3, part: "body" },
      { x: D.x + fx * 3.3, y: by + 2.8, z: D.z + fz * 3.3, r: 1.3, part: "neck" },
      { x: D.x + fx * (5.4 + D.neck), y: hy, z: D.z + fz * (5.4 + D.neck), r: 1.25, part: "head" },
      { x: D.x - fx * 6.2, y: by + 1.2, z: D.z - fz * 6.2, r: 1.3, part: "tail" },
      { x: D.x - fx * 8.6, y: by + 0.8, z: D.z - fz * 8.6, r: 1.0, part: "tail" },
    ];
    return out;
  };
  D.head = () => {
    const fx = Math.sin(D.yaw);
    const fz = Math.cos(D.yaw);
    return { x: D.x + fx * (5.6 + D.neck), y: D.y + D.alt + (D.flying() ? 0.2 : 3.3) + D.neck * 0.8, z: D.z + fz * (5.6 + D.neck) };
  };
  D.alert = () => {
    if (D.state === "dormant" && objectiveLive(G)) wake(G, D);
  };
  D.knock = () => {};
  D.onLethal = () => {
    if (!D.down) collapse(G, D);
    return true;
  };
  D.die = () => {};
  return D;
}

const objectiveLive = (G) => G.P.quests.q_dragon?.state === "active" && !G.P.flags.dragonDown;

function wake(G, D) {
  D.state = "roar";
  D.t = 0;
  G.emit({ type: "bossAggro", id: D.id, name: D.name, etype: "dragon" });
  G.emit({ type: "dragonRoar", x: D.x, y: D.y + 4, z: D.z, intro: true });
  G.shake(1);
}

function collapse(G, D) {
  D.down = true;
  D.hp = 1;
  D.state = "down";
  D.t = 0;
  D.breath = null;
  D.atk = null;
  G.setFlag("dragonDown", true);
  G.emit({ type: "dragonDown", x: D.x, y: D.y, z: D.z });
  G.shake(1.2);
}

/** Damage helper for the dragon's attacks (fire unless told otherwise). */
function hurtZone(G, D, o) {
  return spawnZone(G, { team: "hostile", src: D, fire: true, tick: 0.01, once: true, dur: 0.05, knock: 5, stagger: 40, heavy: true, interior: null, ...o });
}

function pickGroundAttack(G, D) {
  const p = G.player;
  const dx = p.x - D.x;
  const dz = p.z - D.z;
  const d = Math.hypot(dx, dz);
  const ang = Math.abs(wrapAngle(Math.atan2(dx, dz) - D.yaw));
  const R = G.rand();
  if (D.phase === 3 && (D.cdNova || 0) <= 0 && d < 10 && R < 0.35) return "nova";
  if (ang > 2.2 && d < 11) return "tail";
  if (d < 9 && ang < 0.8) return R < 0.55 ? "bite" : "claw";
  if (d < 8 && ang < 1.6) return "claw";
  if ((D.cdBreath || 0) <= 0 && d < 22 && ang < 0.9) return "breath";
  if (d < 7) return "stomp";
  return null;
}

const ATK = {
  bite: { windup: 0.7, recover: 0.8 },
  claw: { windup: 0.65, recover: 0.8 },
  tail: { windup: 0.9, recover: 0.9 },
  breath: { windup: 1.1, recover: 1.0, dur: 2.4 },
  stomp: { windup: 1.0, recover: 0.9 },
  nova: { windup: 1.4, recover: 1.2 },
};

function startAttack(G, D, id) {
  const p = G.player;
  const A = ATK[id];
  const fast = D.phase === 3 ? 0.78 : 1;
  D.atk = { id, phase: "windup", t: 0, windup: A.windup * fast, recover: A.recover * fast };
  D.state = "attack";
  const fx = Math.sin(D.yaw);
  const fz = Math.cos(D.yaw);
  const y = D.y;
  if (id === "bite") G.emitTele({ shape: "cone", x: D.x + fx * 3, z: D.z + fz * 3, y, r: 6, yaw: D.yaw, half: 0.6, dur: D.atk.windup });
  if (id === "claw") G.emitTele({ shape: "cone", x: D.x + fx * 1.5, z: D.z + fz * 1.5, y, r: 7.5, yaw: D.yaw, half: 1.15, dur: D.atk.windup });
  if (id === "tail") G.emitTele({ shape: "cone", x: D.x, z: D.z, y, r: 11, yaw: D.yaw + Math.PI, half: 1.25, dur: D.atk.windup });
  if (id === "stomp") G.emitTele({ shape: "circle", x: D.x, z: D.z, y, r: 7.5, dur: D.atk.windup });
  if (id === "nova") G.emitTele({ shape: "circle", x: D.x, z: D.z, y, r: 12, dur: D.atk.windup });
  if (id === "breath") {
    D.atk.aim = Math.atan2(p.x - D.x, p.z - D.z);
    G.emitTele({ shape: "cone", x: D.x + fx * 5, z: D.z + fz * 5, y, r: 22, yaw: D.atk.aim, half: 0.4, dur: D.atk.windup });
  }
  G.emit({ type: "dragonWindup", atk: id, x: D.x, y: D.y + 3, z: D.z });
}

function resolveAttack(G, D) {
  const A = D.atk;
  const fx = Math.sin(D.yaw);
  const fz = Math.cos(D.yaw);
  const dmg = 26 * (D.phase === 3 ? 1.15 : 1);
  switch (A.id) {
    case "bite":
      hurtZone(G, D, { kind: "bite", shape: "cone", x: D.x + fx * 3, z: D.z + fz * 3, y: D.y, r: 6, yaw: D.yaw, half: 0.6, dmg: dmg * 1.3, fire: false, tele: false });
      G.emit({ type: "dragonBite", x: D.x + fx * 6, y: D.y + 2, z: D.z + fz * 6 });
      break;
    case "claw":
      hurtZone(G, D, { kind: "claw", shape: "cone", x: D.x + fx * 1.5, z: D.z + fz * 1.5, y: D.y, r: 7.5, yaw: D.yaw, half: 1.15, dmg: dmg * 1.1, fire: false, tele: false });
      break;
    case "tail":
      hurtZone(G, D, { kind: "tail", shape: "cone", x: D.x, z: D.z, y: D.y, r: 11, yaw: D.yaw + Math.PI, half: 1.25, dmg: dmg * 1.2, knock: 9, fire: false, tele: false });
      G.shake(0.5);
      break;
    case "stomp":
      hurtZone(G, D, { kind: "stomp", x: D.x, z: D.z, y: D.y, r: 7.5, dmg: dmg * 1.0, knock: 8, fire: false, tele: false });
      G.shake(0.9);
      break;
    case "nova":
      hurtZone(G, D, { kind: "nova", x: D.x, z: D.z, y: D.y, r: 12, dmg: dmg * 1.5, knock: 10, tele: false });
      G.emit({ type: "dragonNova", x: D.x, y: D.y, z: D.z });
      D.cdNova = 9;
      G.shake(1);
      break;
    case "breath":
      D.breath = { t: 0, dur: ATK.breath.dur, yaw: A.aim, sweep: G.rand() < 0.5 ? 1 : -1, acc: 0 };
      D.cdBreath = D.phase === 3 ? 6 : 9;
      G.emit({ type: "dragonBreath", on: true });
      break;
  }
}

function stepBreath(G, D, dt) {
  const B = D.breath;
  B.t += dt;
  B.yaw += B.sweep * 0.22 * dt;
  D.yaw = approachAngle(D.yaw, B.yaw, 2 * dt);
  B.acc -= dt;
  if (B.acc <= 0) {
    B.acc = 0.25;
    const h = D.head();
    // damage cone from the head along its facing (ground-level, plus the flying case)
    spawnZone(G, { kind: "breath", shape: "cone", x: h.x, z: h.z, y: D.y, height: 6, r: 20, yaw: D.yaw, half: 0.36, dmg: 9, team: "hostile", src: D, fire: true, dur: 0.05, tick: 0.01, once: true, tele: false, burnChance: 0.5, stagger: 6 });
  }
  if (B.t >= B.dur) {
    D.breath = null;
    G.emit({ type: "dragonBreath", on: false });
  }
}

export function stepDragon(G, D, dt) {
  D.hitFlash = Math.max(0, D.hitFlash - dt);
  D.t += dt;
  D.flap += dt * (D.flying() ? 2.2 : 0.4);
  D.cdBreath = Math.max(0, (D.cdBreath || 0) - dt);
  D.cdNova = Math.max(0, (D.cdNova || 0) - dt);
  D.atkCd = Math.max(0, D.atkCd - dt);
  const p = G.player;
  if (D.state === "gone") return;
  if (D.state === "dormant") {
    D.alt = 0;
    if (objectiveLive(G) && !p.interior && Math.hypot(p.x - CX, p.z - CZ) < 50) wake(G, D);
    return;
  }
  if (D.down) {
    D.alt = Math.max(0, D.alt - dt * 8);
    D.neck = Math.max(-2, D.neck - dt);
    if (D.state === "freed") {
      D.alt += dt * (D.t < 2 ? 0 : 8);
      D.down = true;
      if (D.t > 2) D.z -= dt * 12;
      if (D.t > 9) D.state = "gone";
    }
    if (D.state === "slain") {
      D.deadT = (D.deadT || 0) + dt;
      if (D.deadT > 6) D.state = "gone";
    }
    return;
  }
  // phases
  const f = D.hp / D.maxHp;
  const newPhase = f < 0.3 ? 3 : f < 0.65 ? 2 : 1;
  if (newPhase !== D.phase) {
    D.phase = newPhase;
    G.emit({ type: "bossPhase", phase: newPhase, name: D.name });
    G.emit({ type: "dragonRoar", x: D.x, y: D.y + 4, z: D.z });
    if (newPhase === 2) takeOff(G, D);
  }
  if (D.stunT > 0) {
    D.stunT -= dt;
    D.dmgTakenMult = 1.5;
    if (D.stunT <= 0) {
      D.dmgTakenMult = 1;
      D.state = "ground";
      D.groundT = 0;
      G.emit({ type: "dragonRoar", x: D.x, y: D.y + 4, z: D.z });
    }
    return;
  }
  if (D.breath) stepBreath(G, D, dt);
  switch (D.state) {
    case "roar":
      D.yaw = approachAngle(D.yaw, Math.atan2(p.x - D.x, p.z - D.z), dt * 2);
      if (D.t > 2.6) {
        D.state = "ground";
        D.t = 0;
        D.groundT = 0;
      }
      break;
    case "ground": {
      D.groundT += dt;
      const dx = p.x - D.x;
      const dz = p.z - D.z;
      const d = Math.hypot(dx, dz);
      const want = Math.atan2(dx, dz);
      const ang = wrapAngle(want - D.yaw);
      if (!D.breath) D.yaw += clamp(ang, -1.3 * dt, 1.3 * dt);
      // walk to keep the player within reach, but stay in the arena
      const sp = d > 9 && Math.abs(ang) < 1.2 ? 5 : 0;
      D.x += Math.sin(D.yaw) * sp * dt;
      D.z += Math.cos(D.yaw) * sp * dt;
      const ad = Math.hypot(D.x - CX, D.z - CZ);
      if (ad > ARENA - 6) {
        D.x = CX + ((D.x - CX) / ad) * (ARENA - 6);
        D.z = CZ + ((D.z - CZ) / ad) * (ARENA - 6);
      }
      D.y = G.ground(D.x, D.z, 1e9);
      D.speed = sp;
      if (D.phase >= 2 && D.groundT > (D.phase === 3 ? 22 : 16) && !D.breath) {
        takeOff(G, D);
        break;
      }
      if (D.atkCd <= 0 && !D.breath) {
        const a = pickGroundAttack(G, D);
        if (a) startAttack(G, D, a);
      }
      break;
    }
    case "attack": {
      const A = D.atk;
      A.t += dt;
      if (A.phase === "windup") {
        if (A.id === "bite" || A.id === "claw") D.yaw = approachAngle(D.yaw, Math.atan2(p.x - D.x, p.z - D.z), dt * 0.8);
        D.neck = A.id === "bite" ? -0.6 * (A.t / A.windup) : A.id === "breath" ? 0.6 * (A.t / A.windup) : 0;
        D.tail = A.id === "tail" ? A.t / A.windup : 0;
        if (A.t >= A.windup) {
          A.phase = "recover";
          A.t = 0;
          resolveAttack(G, D);
          if (A.id === "bite") D.neck = 1.2;
        }
      } else {
        D.neck *= 0.92;
        D.tail *= 0.9;
        if (A.t >= A.recover && !D.breath) {
          D.atk = null;
          D.state = "ground";
          D.atkCd = (D.phase === 3 ? 0.6 : 1.1) + G.rand() * 0.8;
        }
      }
      break;
    }
    case "takeoff":
      D.alt += dt * 7;
      if (D.alt >= ALT) {
        D.alt = ALT;
        D.state = "fly";
        D.t = 0;
        D.orbit = Math.atan2(D.x - CX, D.z - CZ);
        D.flyAct = 2;
      }
      break;
    case "fly": {
      D.flightT += dt;
      D.orbit += dt * 0.35;
      const tx = CX + Math.sin(D.orbit) * 26;
      const tz = CZ + Math.cos(D.orbit) * 26;
      D.yaw = approachAngle(D.yaw, Math.atan2(tx - D.x, tz - D.z), dt * 2.5);
      D.x += (tx - D.x) * Math.min(1, dt * 1.5);
      D.z += (tz - D.z) * Math.min(1, dt * 1.5);
      D.y = G.ground(CX, CZ, 1e9);
      D.flyAct -= dt;
      if (D.flyAct <= 0) {
        D.flyAct = 3.4 + G.rand() * 1.5;
        if (G.rand() < 0.5) {
          // fireball volley at the player
          for (let k = 0; k < 3; k++) {
            const h = D.head();
            const lead = { x: p.x + p.vx * 0.6 + (k - 1) * 3, y: p.y + 0.5, z: p.z + p.vz * 0.6 };
            const dx = lead.x - h.x;
            const dy = lead.y - h.y;
            const dz = lead.z - h.z;
            const L = Math.hypot(dx, dy, dz);
            spawnProjectile(G, { kind: "dragonfire", x: h.x, y: h.y, z: h.z, dx: dx / L, dy: dy / L, dz: dz / L, speed: 24 + k * 2, team: "hostile", dmg: 26, src: D, r: 0.7, life: 4, splash: 3.6, splashMult: 0.9, fire: true, stagger: 30, knock: 5 });
          }
          G.emit({ type: "dragonSpit", x: D.x, y: D.y + D.alt, z: D.z });
        } else {
          // strafing run: a line of fire along her path toward the player
          const yaw = Math.atan2(p.x - D.x, p.z - D.z);
          for (let k = 0; k < 6; k++) {
            const px = p.x + Math.sin(yaw) * (k - 2) * 4.5;
            const pz = p.z + Math.cos(yaw) * (k - 2) * 4.5;
            hurtZone(G, D, { kind: "firerain", x: px, z: pz, y: G.ground(px, pz, 1e9), r: 3.2, delay: 0.9 + k * 0.18, dmg: 24, knock: 3, tele: true });
          }
          G.emit({ type: "dragonStrafe" });
        }
      }
      if (D.flightT > (D.phase === 3 ? 10 : 16)) land(G, D);
      break;
    }
    case "dive": {
      D.t2 = (D.t2 || 0) + dt;
      const k = Math.min(1, D.t2 / 1.2);
      D.x += (D.lx - D.x) * Math.min(1, dt * 3);
      D.z += (D.lz - D.z) * Math.min(1, dt * 3);
      D.alt = ALT * (1 - k);
      if (k >= 1) {
        D.alt = 0;
        D.y = G.ground(D.x, D.z, 1e9);
        hurtZone(G, D, { kind: "land", x: D.x, z: D.z, y: D.y, r: 8, dmg: 34, knock: 10, fire: false, tele: false });
        G.emit({ type: "dragonLand", x: D.x, y: D.y, z: D.z });
        G.shake(1.2);
        D.state = "ground";
        D.groundT = 0;
        D.atkCd = 1.2;
      }
      break;
    }
    case "crash":
      D.alt = Math.max(0, D.alt - dt * 14);
      if (D.alt <= 0) {
        D.y = G.ground(D.x, D.z, 1e9);
        if (!D.crashed) {
          D.crashed = true;
          G.emit({ type: "dragonLand", x: D.x, y: D.y, z: D.z, crash: true });
          G.shake(1.4);
          D.stunT = 6;
          G.emit({ type: "notice", text: "Vaelith is grounded — strike now!", kind: "good" });
        }
      }
      break;
    default:
      break;
  }
}

function takeOff(G, D) {
  D.state = "takeoff";
  D.t = 0;
  D.flightT = 0;
  D.atk = null;
  D.breath = null;
  G.emit({ type: "dragonTakeoff", x: D.x, y: D.y, z: D.z });
}
function land(G, D) {
  const p = G.player;
  let lx = p.x;
  let lz = p.z;
  const d = Math.hypot(lx - CX, lz - CZ);
  if (d > ARENA - 8) {
    lx = CX + ((lx - CX) / d) * (ARENA - 8);
    lz = CZ + ((lz - CZ) / d) * (ARENA - 8);
  }
  D.lx = lx;
  D.lz = lz;
  D.state = "dive";
  D.t2 = 0;
  G.emitTele({ shape: "circle", x: lx, z: lz, y: G.ground(lx, lz, 1e9), r: 8, dur: 1.2 });
}

/** A ballista bolt struck her in flight. */
export function ballistaHit(G, D) {
  if (!D.flying() || D.down) return false;
  D.state = "crash";
  D.crashed = false;
  D.breath = null;
  applyDamage(G, G.player, D, 160, { kind: "ranged", unblockable: true });
  G.emit({ type: "dragonRoar", x: D.x, y: D.y + D.alt, z: D.z, hurt: true });
  return true;
}

/** After the fate choice. */
export function resolveDragonFate(G, D, fate) {
  D.state = fate === "slain" ? "slain" : "freed";
  D.t = 0;
  D.deadT = 0;
  if (fate === "slain") {
    D.dead = true;
    G.P.world.dead.dragon = true;
  }
}
