/**
 * The player: kinematic third-person controller + every combat action.
 *
 * Input (per 60 Hz step, see ui/input.js): mx/mz move axes (camera-relative),
 * sprint, jump/dodge edges, attack {down, pressed, released}, alt (RMB held:
 * block / ward / parry / aim), abilities q/r/f, potion, interact.
 *
 * Attack input: a press starts "pending"; releasing before HOLD fires a light
 * attack (or bolt / quick shot), holding past it charges a heavy (or a
 * fireball / full draw). Presses during an attack queue the next combo step.
 */
import { HEROES, ABILITIES } from "../data/heroes.js";
import { ITEMS } from "../data/items.js";
import { WORLD, INTERIOR_X } from "../data/worldmap.js";
import { clamp, wrapAngle, approachAngle } from "./math.js";
import { applyDamage, meleeSweep, spawnProjectile, spawnZone, foesOf } from "./combat.js";
import { abilityUnlocked } from "./profile.js";

const HOLD = 0.22;
const GRAV = 24;
const JUMP_V = 7.4;
const STEP_UP = 0.6;

export function createPlayer(G, at) {
  const H = HEROES[G.P.hero];
  const S = G.stats;
  const p = {
    kind: "player",
    team: "player",
    name: "You",
    x: at.x,
    y: at.y,
    z: at.z,
    yaw: at.yaw || 0,
    vx: 0,
    vz: 0,
    vy: 0,
    kx: 0,
    kz: 0,
    r: 0.42,
    h: 1.8,
    interior: at.interior || null,
    onGround: true,
    airT: 0,
    hp: at.hp ?? S.maxHp,
    st: S.maxSt,
    res: H.resource.start,
    maxHp: S.maxHp,
    armor: S.armor,
    poise: 60,
    poiseMax: 60,
    status: {},
    action: null,
    combo: 0,
    comboT: 0,
    queued: false,
    pending: -1,
    charge: 0,
    draw: 0,
    shotCd: 0,
    blocking: false,
    blockT: 0,
    blockDef: H.moves.block,
    aiming: false,
    iframes: 0,
    stDelay: 0,
    cds: { q: 0, r: 0, f: 0 },
    buffs: { warcry: 0, vanish: 0, critNext: false, sneak: false, unbreakable: 0 },
    usedSave: false,
    sprinting: false,
    speed: 0,
    moveX: 0,
    moveZ: 0,
    inWater: 0,
    combatT: 0,
    hitFlash: 0,
    dead: false,
    deadT: 0,
    potionT: 0,
    potionHeal: 0,
    traps: [],
    mat: "flesh",
  };
  p.dmgMult = 1;
  p.dmgTakenMult = 1;

  p.stagger = (t, why) => {
    if (p.dead) return;
    if (why === "poise" && G.P.hero === "knight" && p.blocking) return;
    p.action = { type: "stagger", t: 0, dur: t * 0.7 };
    p.blocking = false;
    p.pending = -1;
    p.charge = 0;
    p.draw = 0;
    G.emit({ type: "playerStagger" });
  };
  p.knock = (kx, kz) => {
    p.kx += kx * 1.2;
    p.kz += kz * 1.2;
  };
  p.flinch = () => {};
  p.alert = () => {};
  p.onBlock = () => {
    if (G.P.hero === "knight") p.res = Math.min(G.stats.maxRes, p.res + 8);
  };
  p.onParry = () => {
    if (G.P.skills.shieldWall) p.res = Math.min(G.stats.maxRes, p.res + 15);
    if (G.P.hero === "rogue" && G.P.skills.riposte) p.buffs.critNext = true;
    G.emit({ type: "notice", text: "Perfect parry!", kind: "good" });
  };
  p.onLethal = () => {
    if (p.usedSave) return false;
    if (G.P.skills.unbreakable) {
      p.usedSave = true;
      p.hp = 1;
      p.buffs.unbreakable = 3;
      G.emit({ type: "notice", text: "UNBREAKABLE — you refuse to fall", kind: "good" });
      return true;
    }
    if (G.P.skills.phoenix) {
      p.usedSave = true;
      p.hp = G.stats.maxHp * 0.4;
      G.emit({ type: "notice", text: "PHOENIX — you rise from the flames", kind: "good" });
      G.emit({ type: "nova", x: p.x, y: p.y, z: p.z });
      return true;
    }
    return false;
  };
  p.die = () => {
    if (p.dead) return;
    p.dead = true;
    p.deadT = 0;
    p.action = null;
    p.blocking = false;
    G.onPlayerDeath();
  };
  return p;
}

/* ================================================================ helpers */
function camAxes(yaw) {
  return { fx: Math.sin(yaw), fz: Math.cos(yaw), rx: -Math.cos(yaw), rz: Math.sin(yaw) };
}

/** Soft lock: best foe within range in front of the camera. */
export function pickTarget(G, maxD = 5, cone = 1.1, from = null) {
  const p = G.player;
  const yaw = from ?? G.camYaw;
  let best = null;
  let bs = Infinity;
  for (const e of foesOf(G, "player", p.interior)) {
    if (e.kind === "wildlife" && e.state !== "flee") continue;
    const tx = e.x;
    const tz = e.z;
    const d = Math.hypot(tx - p.x, tz - p.z) - (e.r || 0.5);
    if (d > maxD) continue;
    const a = Math.abs(wrapAngle(Math.atan2(tx - p.x, tz - p.z) - yaw));
    if (a > cone) continue;
    const s = d + a * 3;
    if (s < bs) {
      bs = s;
      best = e;
    }
  }
  return best;
}

function baseDamage(G, mult) {
  const S = G.stats;
  const p = G.player;
  const war = p.buffs.warcry > 0 ? 1.3 : 1;
  return S.atk * mult * S.dmgMult * war * (0.92 + G.rand() * 0.16);
}

function strikeOpts(G, move = {}) {
  const P = G.P;
  const S = G.stats;
  const p = G.player;
  const o = { kind: "melee", stagger: move.stagger || 15, critChance: S.crit, critMult: S.critMult, heavy: !!move.heavy };
  if (p.buffs.critNext) {
    o.crit = true;
    p.buffs.critNext = false;
  }
  if (P.hero === "rogue") o.backstab = 2 + (P.skills.backstab ? 1 : 0);
  if (P.skills.executioner) o.execute = 0.4;
  if (S.effect === "burn") o.fire = true;
  if (S.effect === "frost") o.frost = true;
  if (S.effect === "bleed") o.bleed = true;
  if (move.bleed && P.skills.bleed) o.bleed = true;
  if (move.finisher && P.skills.momentum) {
    o.stagger = 999;
    o.heavy = true;
  }
  if (p.buffs.sneak) {
    p.buffs.sneak = false;
    o.crit = true;
    o.critMult = (o.critMult || 1.6) * 1.9;
    if (P.skills.ambush) o.stun = 2;
    endVanish(G);
  }
  return o;
}
function endVanish(G) {
  const p = G.player;
  if (p.buffs.vanish > 0) {
    p.buffs.vanish = 0;
    G.emit({ type: "vanishEnd", x: p.x, y: p.y, z: p.z });
  }
}

function useStamina(p, n) {
  if (p.st < n * 0.35) return false;
  p.st = Math.max(0, p.st - n);
  p.stDelay = 0.85;
  return true;
}

/** Where the camera crosshair points (world, actors), for bows, spells and aimed abilities. */
export function aimPoint(G, maxD = 120) {
  const c = G.camera;
  if (!c) return null;
  const col = G.W.col;
  let t = col.raycast(c.x, c.y, c.z, c.fx, c.fy, c.fz, maxD, { noTrees: false });
  let target = null;
  for (const e of foesOf(G, "player", G.player.interior)) {
    const vols = e.hitboxes ? e.hitboxes() : [{ x: e.x, y: e.y + e.h * 0.5, z: e.z, r: Math.max(e.r, 0.5) + 0.25 }];
    for (const v of vols) {
      const vx = v.x - c.x;
      const vy = (v.cap ? v.y + v.h * 0.55 : v.y) - c.y;
      const vz = v.z - c.z;
      const along = vx * c.fx + vy * c.fy + vz * c.fz;
      if (along < 1 || along > t) continue;
      const px = c.x + c.fx * along - v.x;
      const py = c.y + c.fy * along - (v.cap ? v.y + v.h * 0.55 : v.y);
      const pz = c.z + c.fz * along - v.z;
      const miss = Math.hypot(px, py, pz);
      // generous assist: the further, the wider
      if (miss < v.r + 0.35 + along * 0.012) {
        t = along;
        target = { e, v };
      }
    }
  }
  if (target) {
    const v = target.v;
    return { x: v.x, y: v.cap ? v.y + v.h * 0.6 : v.y, z: v.z, target: target.e, d: t };
  }
  return { x: c.x + c.fx * t, y: c.y + c.fy * t, z: c.z + c.fz * t, target: null, d: t };
}

function launchFrom(G, side = 0.25) {
  const p = G.player;
  const ax = camAxes(p.yaw);
  return { x: p.x + ax.rx * side + ax.fx * 0.4, y: p.y + 1.45, z: p.z + ax.rz * side + ax.fz * 0.4 };
}
function dirTo(o, t) {
  const dx = t.x - o.x;
  const dy = t.y - o.y;
  const dz = t.z - o.z;
  const L = Math.hypot(dx, dy, dz) || 1;
  return { dx: dx / L, dy: dy / L, dz: dz / L, L };
}

/* ================================================================ abilities */
function startAbility(G, slot) {
  const P = G.P;
  const p = G.player;
  const H = HEROES[P.hero];
  const id = H.abilities[slot];
  const A = ABILITIES[id];
  if (!abilityUnlocked(P, slot)) {
    G.emit({ type: "notice", text: `${A.name} is locked — learn it in the skill tree (I → Skills).`, kind: "warn" });
    return;
  }
  if (p.cds[slot] > 0) return G.emit({ type: "deny", text: `${A.name} recharging` });
  if (p.res < A.cost) return G.emit({ type: "deny", text: `Not enough ${H.resource.name}` });
  if (p.action && !["attack"].includes(p.action.type)) return;
  const S = G.stats;
  let cd = A.cd;
  if (id === "shieldBash" && P.skills.bashMastery) cd *= 0.7;
  if (id === "snare" && P.skills.twinTraps) cd *= 0.75;
  if (id === "shadowstep" && P.skills.stepPlus) cd *= 0.65;
  // instant-resolution abilities validate first
  if (A.kind === "step") {
    const t = pickTarget(G, 14, 0.9) || pickTarget(G, 8, Math.PI);
    if (!t) return G.emit({ type: "deny", text: "No target for Shadowstep" });
    // behind the target if there's room, else beside it — never through walls or gates
    let bx = null;
    let bz = null;
    for (const off of [Math.PI, Math.PI * 0.6, -Math.PI * 0.6, Math.PI / 2, -Math.PI / 2, 0]) {
      const a = t.yaw + off;
      const cx = t.x + Math.sin(a) * (t.r + 1.1);
      const cz = t.z + Math.cos(a) * (t.r + 1.1);
      const g = G.ground(cx, cz, t.y + 1.5);
      if (Math.abs(g - t.y) > 1.2 || G.W.col.blockedAt(cx, cz, p.r, g) || !G.walkable(cx, cz)) continue;
      if (!G.W.col.los(t.x, t.y + 1, t.z, cx, g + 1, cz) || !G.W.col.los(p.x, p.y + 1, p.z, t.x, t.y + 1, t.z)) continue;
      bx = cx;
      bz = cz;
      break;
    }
    if (bx == null) return G.emit({ type: "deny", text: "No room to Shadowstep" });
    G.emit({ type: "blink", x: p.x, y: p.y, z: p.z, x2: bx, z2: bz, shadow: true });
    p.x = bx;
    p.z = bz;
    G.settle(p);
    p.yaw = Math.atan2(t.x - p.x, t.z - p.z);
    p.buffs.critNext = true;
    p.iframes = 0.3;
  }
  if (A.kind === "blink") {
    const ax = camAxes(G.camYaw);
    let dx = ax.fx;
    let dz = ax.fz;
    if (Math.abs(p.moveX) + Math.abs(p.moveZ) > 0.1) {
      dx = ax.rx * p.moveX + ax.fx * p.moveZ;
      dz = ax.rz * p.moveX + ax.fz * p.moveZ;
      const L = Math.hypot(dx, dz);
      dx /= L;
      dz /= L;
    }
    let best = 0;
    for (let d = 0.5; d <= 8; d += 0.5) {
      const nx = p.x + dx * d;
      const nz = p.z + dz * d;
      const g = G.ground(nx, nz, p.y + 1.5);
      if (Math.abs(g - p.y) > 2.5 || G.W.col.blockedAt(nx, nz, p.r, g) || !G.walkable(nx, nz, g)) break;
      if (!G.W.col.los(p.x, p.y + 1, p.z, nx, g + 1, nz)) break;
      best = d;
    }
    if (best < 1) return G.emit({ type: "deny", text: "No room to blink" });
    G.emit({ type: "blink", x: p.x, y: p.y, z: p.z, x2: p.x + dx * best, z2: p.z + dz * best });
    p.x += dx * best;
    p.z += dz * best;
    G.settle(p);
    p.iframes = 0.35;
  }
  p.res -= A.cost;
  p.cds[slot] = cd;
  p.action = { type: "ability", id, kind: A.kind, t: 0, dur: A.dur, clip: A.clip, clipLen: A.clipLen, hits: 0 };
  p.combo = 0;
  p.queued = false;
  G.emit({ type: "ability", id, x: p.x, y: p.y, z: p.z });
  // things that resolve at once
  if (A.kind === "vanish") {
    p.buffs.vanish = 6 + (P.skills.vanishPlus ? 3 : 0);
    p.buffs.sneak = true;
    for (const e of G.enemies) if (e.target === p) e.loseTarget?.();
  }
  if (A.kind === "trap") {
    const max = P.skills.twinTraps ? 2 : 1;
    p.traps = p.traps.filter((z) => !z.dead);
    while (p.traps.length >= max) {
      p.traps[0].dead = true;
      p.traps.shift();
    }
    const ax = camAxes(p.yaw);
    const z = spawnZone(G, { kind: "trap", x: p.x + ax.fx * 1.4, z: p.z + ax.fz * 1.4, y: p.y, r: 1.3, dur: 90, dmg: baseDamage(G, P.skills.barbed ? 1.9 : 1.2), root: P.skills.barbed ? 4 : 3, team: "player", src: p, tele: false });
    p.traps.push(z);
  }
  if (A.kind === "volley") {
    const a = aimPoint(G, 40) || { x: p.x + Math.sin(p.yaw) * 12, y: p.y, z: p.z + Math.cos(p.yaw) * 12 };
    const big = P.skills.volleyPlus;
    spawnZone(G, { kind: "volley", x: a.x, z: a.z, y: G.ground(a.x, a.z, a.y + 2), r: big ? 5.8 : 4.5, delay: 0.7, dur: big ? 2.6 : 2.0, tick: 0.33, dmg: baseDamage(G, 0.5), team: "player", src: p, stagger: 6, mark: !!P.skills.huntersMark });
    p.yaw = Math.atan2(a.x - p.x, a.z - p.z);
  }
  if (A.kind === "meteor") {
    const a = aimPoint(G, 34) || { x: p.x + Math.sin(p.yaw) * 14, y: p.y, z: p.z + Math.cos(p.yaw) * 14 };
    let ax = a.x;
    let az = a.z;
    const d = Math.hypot(ax - p.x, az - p.z);
    if (d > 32) {
      ax = p.x + ((ax - p.x) / d) * 32;
      az = p.z + ((az - p.z) / d) * 32;
    }
    const big = P.skills.meteorPlus;
    spawnZone(G, { kind: "meteor", x: ax, z: az, y: G.ground(ax, az, a.y + 2), r: big ? 6.5 : 5, delay: 1.0, dur: 0.05, tick: 0.01, once: true, dmg: baseDamage(G, big ? 5 : 4) * (1 + S.fire), team: "player", src: p, fire: true, knock: 8, stagger: 80, burnChance: 0.8, heavy: true });
    p.yaw = Math.atan2(ax - p.x, az - p.z);
  }
}

function tickAbility(G, a, dt) {
  const P = G.P;
  const p = G.player;
  const S = G.stats;
  const before = a.t;
  a.t += dt;
  const at = (x) => before < x && a.t >= x;
  switch (a.kind) {
    case "bash": {
      if (a.t < 0.38 && !a.hit) {
        const sp = 11;
        p.vx = Math.sin(p.yaw) * sp;
        p.vz = Math.cos(p.yaw) * sp;
        const hits = meleeSweep(G, p, { range: 1.7, arc: 1.6 });
        if (hits.length) {
          a.hit = true;
          for (const t of hits.slice(0, 2)) applyDamage(G, p, t, baseDamage(G, 0.8), { kind: "melee", stun: 2 + (P.skills.bashMastery ? 1 : 0), knock: 5, stagger: 60 });
          G.emit({ type: "bash", x: p.x, y: p.y, z: p.z });
          G.shake(0.5);
        }
      } else {
        p.vx *= 0.8;
        p.vz *= 0.8;
      }
      break;
    }
    case "warcry":
      if (at(0.3)) {
        p.buffs.warcry = 8;
        if (P.skills.rally) G.heal(p, G.stats.maxHp * 0.2);
        for (const e of foesOf(G, "player", p.interior)) if (Math.hypot(e.x - p.x, e.z - p.z) < 9 && e.stagger && !e.boss) e.stagger(1.5, "fear");
        G.emit({ type: "warcry", x: p.x, y: p.y, z: p.z });
        G.shake(0.4);
      }
      break;
    case "whirl":
      for (const hitAt of [0.35, 0.72])
        if (at(hitAt)) {
          for (const t of meleeSweep(G, p, { range: 3.3, arc: 6.3 })) applyDamage(G, p, t, baseDamage(G, 1.6), { ...strikeOpts(G, { stagger: 40 }), knock: 3 });
          G.emit({ type: "swing", heavy: true, x: p.x, y: p.y, z: p.z });
        }
      break;
    case "pierce":
      if (at(0.18)) shootArrow(G, 1, { pierce: 6, mult: 2.0 });
      break;
    case "nova":
      if (at(0.15)) {
        spawnZone(G, { kind: "nova", x: p.x, z: p.z, y: p.y, r: 5.2, dur: 0.05, tick: 0.01, once: true, dmg: baseDamage(G, 1.6) * (1 + S.fire), team: "player", src: p, fire: true, knock: 7, stagger: 60, stun: P.skills.novaPlus ? 1 : 0, burnChance: 0.7 });
        G.emit({ type: "nova", x: p.x, y: p.y, z: p.z });
      }
      break;
    case "fan":
      if (at(0.2)) {
        const aim = aimPoint(G, 60);
        const base = aim ? Math.atan2(aim.x - p.x, aim.z - p.z) : p.yaw;
        p.yaw = base;
        for (let k = -2; k <= 2; k++) {
          const yaw = base + k * 0.16;
          const o = launchFrom(G, 0.1);
          const dy = aim ? clamp((aim.y - o.y) / Math.max(4, aim.d || 10), -0.3, 0.3) : 0;
          spawnProjectile(G, { kind: "knife", ...o, dx: Math.sin(yaw), dy, dz: Math.cos(yaw), speed: 30, team: "player", dmg: baseDamage(G, 0.85), src: p, gravity: 3, life: 1.2, critChance: S.crit, critMult: S.critMult, backstab: 1.5, bleed: !!P.skills.bleed, stagger: 10 });
        }
      }
      break;
    default:
      break;
  }
  if (a.t >= a.dur) p.action = null;
}

/* ================================================================ ranged */
function shootArrow(G, power, extra = {}) {
  const p = G.player;
  const P = G.P;
  const S = G.stats;
  const M = HEROES.archer.moves.shot;
  const aim = aimPoint(G, 140);
  const o = launchFrom(G, 0.15);
  const speed = M.speedTap + (M.speedFull - M.speedTap) * power;
  let dir;
  if (aim) {
    // lead the drop a little so arrows land on the crosshair
    const d = dirTo(o, aim);
    const tFlight = d.L / speed;
    dir = dirTo(o, { x: aim.x, y: aim.y + 0.5 * 4 * tFlight * tFlight, z: aim.z });
    p.yaw = Math.atan2(aim.x - p.x, aim.z - p.z);
  } else dir = { dx: Math.sin(p.yaw), dy: 0, dz: Math.cos(p.yaw) };
  const mult = (M.tapMult + (M.fullMult - M.tapMult) * power) * (extra.mult || 1);
  spawnProjectile(G, {
    kind: "arrow",
    ...o,
    ...dir,
    speed,
    team: "player",
    dmg: baseDamage(G, mult),
    src: p,
    gravity: 4,
    life: 3.5,
    pierce: extra.pierce || 0,
    critChance: S.crit + (power > 0.95 && P.skills.headhunter ? 0.2 : 0),
    critMult: S.critMult,
    fire: S.effect === "burn",
    mark: !!P.skills.huntersMark,
    stagger: 8 + power * 22,
    knock: power > 0.9 ? 2 : 0,
  });
  if (p.buffs.sneak) {
    p.buffs.sneak = false;
    endVanish(G);
  }
  G.emit({ type: "bowRelease", power });
}

function castBolt(G, fireball, power = 1) {
  const p = G.player;
  const S = G.stats;
  const P = G.P;
  const M = HEROES.mage.moves;
  const aim = aimPoint(G, 120);
  const o = launchFrom(G, -0.25);
  const dir = aim ? dirTo(o, aim) : { dx: Math.sin(p.yaw), dy: 0, dz: Math.cos(p.yaw) };
  if (aim) p.yaw = Math.atan2(aim.x - p.x, aim.z - p.z);
  if (fireball) {
    spawnProjectile(G, { kind: "fireball", ...o, ...dir, speed: M.fireball.speed, team: "player", dmg: baseDamage(G, M.fireball.mult * power) * (1 + S.fire), src: p, r: 0.35, life: 3, splash: M.fireball.splash, splashMult: 0.75, fire: true, burnChance: 0.8, stagger: 50, knock: 5, groundFire: !!P.skills.inferno, critChance: S.crit, critMult: S.critMult, burnPower: P.skills.combustion ? 2 : 1 });
  } else {
    spawnProjectile(G, { kind: "firebolt", ...o, ...dir, speed: M.bolt.speed, team: "player", dmg: baseDamage(G, M.bolt.mult) * (1 + S.fire), src: p, r: 0.2, life: 2.5, splash: M.bolt.splash, splashMult: 0.4, fire: true, burnChance: 0.3, stagger: 14, critChance: S.crit, critMult: S.critMult, burnPower: P.skills.combustion ? 2 : 1 });
  }
}

/* ================================================================ step */
export function stepPlayer(G, inp, dt) {
  const p = G.player;
  const P = G.P;
  const S = G.stats;
  const H = HEROES[P.hero];
  const M = H.moves;
  // timers
  p.iframes = Math.max(0, p.iframes - dt);
  p.hitFlash = Math.max(0, p.hitFlash - dt);
  p.combatT = Math.max(0, p.combatT - dt);
  p.stDelay = Math.max(0, p.stDelay - dt);
  p.shotCd = Math.max(0, p.shotCd - dt);
  for (const k of ["q", "r", "f"]) p.cds[k] = Math.max(0, p.cds[k] - dt);
  p.buffs.warcry = Math.max(0, p.buffs.warcry - dt);
  if (p.buffs.vanish > 0) {
    p.buffs.vanish -= dt;
    if (p.buffs.vanish <= 0) endVanish(G);
  }
  if (p.buffs.unbreakable > 0) {
    p.buffs.unbreakable -= dt;
    G.heal(p, S.maxHp * 0.25 * (dt / 3), true);
  }
  p.dmgMult = 1;
  p.dmgTakenMult = p.buffs.warcry > 0 ? 0.7 : 1;
  p.maxHp = S.maxHp;
  p.armor = S.armor;
  p.resistFire = S.resistFire;
  if (p.combatT <= 0) p.usedSave = false;
  if (p.dead) {
    p.deadT += dt;
    p.vx *= 0.9;
    p.vz *= 0.9;
    return;
  }
  // potions heal over a moment
  if (p.potionT > 0) {
    const k = Math.min(dt, p.potionT);
    p.potionT -= k;
    G.heal(p, p.potionHeal * (k / 1.2), true);
  }
  // ------------------------------------------------- regen
  const inCombat = p.combatT > 0;
  if (!p.sprinting && p.stDelay <= 0) p.st = Math.min(S.maxSt, p.st + (p.blocking ? 14 : 34) * dt);
  if (H.resource.id === "resolve") {
    if (!inCombat) p.res = Math.max(H.resource.start * 0.5, p.res + H.resource.regen * dt);
  } else p.res = Math.min(S.maxRes, p.res + S.resRegen * (inCombat ? 1 : 1.8) * dt);
  p.res = Math.min(S.maxRes, p.res);
  if (!inCombat && p.hp < S.maxHp && !p.status.burn && !p.status.bleed) G.heal(p, S.maxHp * (0.012 + (P.skills.secondWind ? 0.02 : 0)) * dt, true);
  // ------------------------------------------------- move intent
  const ax = camAxes(G.camYaw);
  let mx = inp.mx || 0;
  let mz = inp.mz || 0;
  const ml = Math.hypot(mx, mz);
  if (ml > 1) {
    mx /= ml;
    mz /= ml;
  }
  p.moveX = mx;
  p.moveZ = mz;
  const wantX = ax.rx * mx + ax.fx * mz;
  const wantZ = ax.rz * mx + ax.fz * mz;
  const moving = ml > 0.1;
  const rooted = p.status.root > 0;
  // ------------------------------------------------- RMB: block / ward / parry / aim
  const altKind = H.moves.block ? H.moves.block.kind : "aim";
  if (altKind === "aim") {
    p.aiming = !!inp.alt && !p.action;
    p.blocking = false;
  } else {
    const wantBlock = !!inp.alt && !p.action;
    if (wantBlock && !p.blocking && (altKind === "ward" ? p.res > 2 : p.st > 5)) {
      p.blocking = true;
      p.blockT = 0;
      p.parryBonus = (P.skills.shieldWall || P.skills.riposte ? 0.1 : 0);
      p.blockStMult = 1 - 0.2 * (P.skills.steadfast || 0);
      p.wardEff = 1 / (1 + 0.2 * (P.skills.wardcraft || 0));
      if (p.action?.type === "attack") p.action = null;
    }
    if (!inp.alt || p.action) p.blocking = false;
    if (p.blocking) p.blockT += dt;
  }
  // ------------------------------------------------- dodge / jump
  const dodgeWanted = inp.dodge || (inp.jump && (p.blocking || G.inCombat()));
  if (dodgeWanted && p.onGround && !rooted && (!p.action || ["attack", "ability"].includes(p.action.type) && p.action.t > p.action.dur * 0.5)) {
    const D = M.dodge;
    let cost = D.st * (P.skills.evasion ? 0.75 : 1) * (P.skills.slippery ? 0.7 : 1);
    if (useStamina(p, cost)) {
      let dx = moving ? wantX : -Math.sin(p.yaw);
      let dz = moving ? wantZ : -Math.cos(p.yaw);
      const L = Math.hypot(dx, dz) || 1;
      dx /= L;
      dz /= L;
      p.action = { type: "dodge", t: 0, dur: D.dur, dx, dz, sp: D.dist / D.dur, back: !moving };
      p.iframes = D.iframes + (P.skills.evasion || P.skills.slippery ? 0.1 : 0);
      p.blocking = false;
      p.pending = -1;
      p.charge = 0;
      p.draw = 0;
      if (moving) p.yaw = Math.atan2(dx, dz);
      G.emit({ type: "dodge", x: p.x, y: p.y, z: p.z });
    } else G.emit({ type: "deny", text: "Too tired" });
  } else if (inp.jump && p.onGround && !p.action && !rooted) {
    p.vy = JUMP_V;
    p.onGround = false;
    G.emit({ type: "jump" });
  }
  // ------------------------------------------------- abilities & potion
  for (const k of ["q", "r", "f"]) if (inp[k] && !p.dead) startAbility(G, k);
  if (inp.potion && !p.action) G.drinkPotion(inp.potion);
  // ------------------------------------------------- attack input
  const A = inp.attack || {};
  const cls = P.hero;
  if (cls === "archer") stepBow(G, A, dt);
  else if (cls === "mage") stepStaff(G, A, dt);
  else stepMelee(G, A, dt, M);
  // ------------------------------------------------- actions
  const act = p.action;
  let speedMul = 1;
  let faceYaw = null;
  if (act) {
    switch (act.type) {
      case "attack":
      case "heavy": {
        const mv = act.move;
        const before = act.t;
        act.t += dt;
        // lunge during the windup
        if (act.t <= mv.hit) {
          const sp = (mv.lunge || 0) / Math.max(0.05, mv.hit);
          p.vx = Math.sin(p.yaw) * sp;
          p.vz = Math.cos(p.yaw) * sp;
          if (act.target && !act.target.dead) {
            const ty = Math.atan2(act.target.x - p.x, act.target.z - p.z);
            p.yaw = approachAngle(p.yaw, ty, 10 * dt);
            if (Math.hypot(act.target.x - p.x, act.target.z - p.z) < (act.target.r || 0.5) + 1.0) {
              p.vx *= 0.1;
              p.vz *= 0.1;
            }
          }
        } else {
          p.vx *= 0.75;
          p.vz *= 0.75;
        }
        if (before < mv.hit && act.t >= mv.hit) {
          const hits = meleeSweep(G, p, mv);
          const o = strikeOpts(G, mv);
          let any = false;
          for (const t of hits) {
            const r = applyDamage(G, p, t, baseDamage(G, mv.mult), { ...o, knock: mv.finisher || act.type === "heavy" ? 3 : 0.8, dirX: t.x - p.x, dirZ: t.z - p.z });
            if (r) {
              any = true;
              if (P.hero === "knight") p.res = Math.min(S.maxRes, p.res + (act.type === "heavy" ? 12 : 6));
              G.emit({ type: "hitConfirm", crit: r.crit, kill: r.killed, heavy: act.type === "heavy" });
            }
          }
          G.emit({ type: "swing", heavy: act.type === "heavy" || mv.finisher, hit: any, x: p.x, y: p.y, z: p.z, cls: P.hero });
          if (any) G.hitstop(act.type === "heavy" ? 0.08 : 0.04);
        }
        if (act.t >= mv.dur) {
          p.action = null;
          if (act.type === "attack" && p.queued) {
            p.queued = false;
            startLight(G, M);
          } else p.comboT = 0.45;
        }
        speedMul = 0.15;
        break;
      }
      case "charge": {
        act.t += dt;
        speedMul = 0.35;
        faceYaw = G.camYaw;
        break;
      }
      case "dodge": {
        act.t += dt;
        const k = act.t / act.dur;
        const sp = act.sp * (k < 0.7 ? 1 : 1 - (k - 0.7) / 0.3) * (act.back ? 0.8 : 1);
        p.vx = act.dx * sp;
        p.vz = act.dz * sp;
        if (act.t >= act.dur) p.action = null;
        speedMul = 0;
        break;
      }
      case "ability":
        tickAbility(G, act, dt);
        speedMul = act.kind === "bash" ? 0 : 0.25;
        break;
      case "potion":
        act.t += dt;
        speedMul = 0.45;
        if (act.t >= act.dur) p.action = null;
        break;
      case "interact":
        act.t += dt;
        speedMul = 0;
        if (act.t >= act.dur) p.action = null;
        break;
      case "cast":
        act.t += dt;
        speedMul = 0.35;
        if (act.t >= act.fireAt && !act.fired) {
          act.fired = true;
          castBolt(G, act.fireball, act.power);
        }
        if (act.t >= act.dur) p.action = null;
        break;
      case "stagger":
        act.t += dt;
        speedMul = 0;
        p.vx *= 0.85;
        p.vz *= 0.85;
        if (act.t >= act.dur) p.action = null;
        break;
      default:
        break;
    }
  }
  // ------------------------------------------------- locomotion
  const freeMove = !p.action || p.action.type === "charge" || p.action.type === "potion" || p.action.type === "cast" || p.action.type === "ability";
  p.sprinting = false;
  if (freeMove) {
    let target = 5.4 * S.speed;
    if (p.blocking) target = 2.2;
    else if (p.aiming || p.draw > 0) target = 2.6;
    else if (inp.sprint && moving && p.st > 1 && !p.action) {
      target = 7.8 * S.speed;
      p.sprinting = true;
      p.st = Math.max(0, p.st - 13 * dt);
      p.stDelay = 0.5;
    }
    if (p.buffs.vanish > 0) target *= 1.3;
    if (p.status.slow > 0) target *= 0.6;
    if (p.inWater > 0.3) target *= 0.6;
    if (rooted) target = 0;
    target *= speedMul;
    const tx = moving ? wantX * target : 0;
    const tz = moving ? wantZ * target : 0;
    const acc = (p.onGround ? 26 : 6) * dt;
    p.vx += clamp(tx - p.vx, -acc, acc);
    p.vz += clamp(tz - p.vz, -acc, acc);
    if (faceYaw == null) {
      if (p.blocking || p.aiming || p.draw > 0 || (p.action && ["cast", "charge"].includes(p.action.type))) faceYaw = G.camYaw;
      else if (moving) faceYaw = Math.atan2(wantX, wantZ);
    }
  }
  if (faceYaw != null) p.yaw = approachAngle(p.yaw, faceYaw, (p.blocking || p.aiming ? 14 : 11) * dt);
  // knockback decays
  p.kx *= Math.exp(-6 * dt);
  p.kz *= Math.exp(-6 * dt);
  integrate(G, p, dt);
  p.speed = Math.hypot(p.vx, p.vz);
}

function startLight(G, M) {
  const p = G.player;
  const moves = M.light;
  const i = p.comboT > 0 ? p.combo % moves.length : 0;
  const mv = moves[i];
  if (!useStamina(p, mv.st)) {
    G.emit({ type: "deny", text: "Too tired" });
    return;
  }
  const t = pickTarget(G, mv.range + 2.5, 1.0);
  if (t) p.yaw = Math.atan2(t.x - p.x, t.z - p.z);
  else if (Math.abs(p.moveX) + Math.abs(p.moveZ) < 0.1) p.yaw = approachAngle(p.yaw, G.camYaw, 0.6);
  p.action = { type: "attack", t: 0, dur: mv.dur, move: mv, step: i, target: t };
  p.combo = i + 1;
  p.comboT = 0;
  p.blocking = false;
  G.emit({ type: "attackStart", step: i });
}

function stepMelee(G, A, dt, M) {
  const p = G.player;
  p.comboT = Math.max(0, p.comboT - dt);
  if (p.comboT <= 0 && !p.action) p.combo = 0;
  if (A.pressed) {
    if (p.action?.type === "attack") {
      if (p.action.t > p.action.dur * 0.35) p.queued = true;
      return;
    }
    if (p.action || p.blocking) return;
    p.pending = 0;
  }
  if (p.pending >= 0) {
    if (p.action && p.action.type !== "charge") {
      p.pending = -1;
      return;
    }
    p.pending += dt;
    if (!A.down) {
      // released quickly: light attack
      if (!p.action) startLight(G, M);
      p.pending = -1;
    } else if (p.pending > HOLD && !p.action) {
      p.action = { type: "charge", t: 0 };
      G.emit({ type: "chargeStart" });
    }
  }
  if (p.action?.type === "charge") {
    const hv = M.heavy;
    p.charge = p.action.t;
    if (!A.down || p.action.t > 1.2) {
      p.pending = -1;
      if (!useStamina(p, hv.st)) {
        p.action = null;
        p.charge = 0;
        G.emit({ type: "deny", text: "Too tired" });
        return;
      }
      const t = pickTarget(G, hv.range + (hv.lunge || 0) + 1.5, 0.9);
      if (t) p.yaw = Math.atan2(t.x - p.x, t.z - p.z);
      const power = Math.min(1, p.action.t / 0.8);
      p.action = { type: "heavy", t: 0, dur: hv.dur, move: { ...hv, mult: hv.mult * (0.8 + power * 0.35), heavy: true }, target: t };
      p.charge = 0;
      G.emit({ type: "attackStart", heavy: true });
    }
  }
}

function stepBow(G, A, dt) {
  const p = G.player;
  const P = G.P;
  const M = HEROES.archer.moves.shot;
  const drawTime = M.draw * Math.pow(0.8, P.skills.quickDraw || 0);
  if (A.pressed && !p.action && p.shotCd <= 0) {
    if (useStamina(p, M.st)) {
      p.draw = 0.001;
      G.emit({ type: "drawStart" });
    }
  }
  if (p.draw > 0) {
    if (p.action) {
      p.draw = 0;
      return;
    }
    p.draw += dt;
    if (!A.down) {
      const power = clamp((p.draw - M.minDraw) / (drawTime - M.minDraw), 0, 1);
      shootArrow(G, power);
      p.draw = 0;
      p.shotCd = M.cooldown;
    }
  }
}

function stepStaff(G, A, dt) {
  const p = G.player;
  const P = G.P;
  const M = HEROES.mage.moves;
  if (A.pressed && !p.action && p.shotCd <= 0 && !p.blocking) p.pending = 0;
  if (p.pending >= 0) {
    p.pending += dt;
    if (p.action && p.action.type !== "charge") {
      p.pending = -1;
      return;
    }
    if (!A.down) {
      if (p.action?.type === "charge") {
        const t = p.action.t;
        p.action = null;
        p.charge = 0;
        if (t >= M.fireball.charge) {
          const cost = M.fireball.cost * (P.skills.overcharge ? 0.6 : 1);
          if (p.res >= cost) {
            p.res -= cost;
            p.action = { type: "cast", t: 0, dur: 0.5, fireAt: 0.12, fireball: true, power: 1 };
          } else G.emit({ type: "deny", text: "Not enough mana" });
        } else boltCast(G);
      } else boltCast(G);
      p.pending = -1;
    } else if (p.pending > HOLD && !p.action) {
      p.action = { type: "charge", t: 0, staff: true };
      G.emit({ type: "chargeStart", staff: true });
    }
  }
  if (p.action?.type === "charge") p.charge = p.action.t;
}
function boltCast(G) {
  const p = G.player;
  const M = HEROES.mage.moves.bolt;
  if (p.res < M.cost) return G.emit({ type: "deny", text: "Not enough mana" });
  p.res -= M.cost;
  p.action = { type: "cast", t: 0, dur: 0.38, fireAt: 0.1, fireball: false, power: 1 };
  p.shotCd = M.cooldown;
}

/* ================================================================ physics */
/** Shared kinematic integration for every walking actor. */
export function integrate(G, a, dt) {
  const col = G.W.col;
  const T = G.W.T;
  const vx = a.vx + (a.kx || 0);
  const vz = a.vz + (a.kz || 0);
  let nx = a.x + vx * dt;
  let nz = a.z + vz * dt;
  // ground at the candidate; refuse steps that are too tall or slopes too steep
  const feet = a.y;
  const tryPos = (x, z) => {
    const g = G.ground(x, z, feet + STEP_UP);
    if (g > feet + STEP_UP && a.onGround) return null;
    if (!a.interior && x < INTERIOR_X) {
      const onP = col.onPlatform(x, z, g);
      if (!onP && g > feet + 0.04 && T.slope(x, z) > 1.0) return null;
      const w = T.waterAt(x, z);
      // too deep to wade — unless we're already deeper here (always let actors climb out)
      if (!onP && w > g + 1.3 && !a.swims && w - g > (a.inWater || 0) + 0.05) return null;
      if (Math.max(Math.abs(x), Math.abs(z)) > WORLD.play) return null;
    }
    return g;
  };
  let g = tryPos(nx, nz);
  if (g == null) {
    // slide along the obstacle: try each axis
    const gx = tryPos(nx, a.z);
    const gz = tryPos(a.x, nz);
    if (gx != null && Math.abs(vx) >= Math.abs(vz)) {
      nz = a.z;
      g = gx;
    } else if (gz != null) {
      nx = a.x;
      g = gz;
    } else if (gx != null) {
      nz = a.z;
      g = gx;
    } else {
      nx = a.x;
      nz = a.z;
      g = G.ground(nx, nz, feet + STEP_UP);
      a.vx *= 0.2;
      a.vz *= 0.2;
    }
  }
  const pos = { x: nx, z: nz };
  col.resolve(pos, a.r, a.y, a.h || 1.8, 0.45);
  // actors push each other apart
  if (G.separate) G.separate(a, pos);
  a.x = pos.x;
  a.z = pos.z;
  g = G.ground(a.x, a.z, a.y + STEP_UP);
  // vertical
  if (a.flying) return;
  if (a.onGround && a.vy <= 0) {
    if (g < a.y - 0.6) {
      a.onGround = false;
      a.airT = 0;
    } else {
      a.y = g;
      a.vy = 0;
    }
  }
  if (!a.onGround) {
    a.vy -= GRAV * dt;
    a.y += a.vy * dt;
    a.airT += dt;
    if (a.y <= g) {
      const fall = -a.vy;
      a.y = g;
      a.vy = 0;
      a.onGround = true;
      if (a === G.player) {
        G.emit({ type: "land", hard: fall > 12 });
        if (fall > 17) applyDamage(G, null, a, (fall - 17) * 9, { kind: "fall", unblockable: true });
      }
    }
  }
  // water depth (wading)
  if (!a.interior) {
    const w = T.waterAt(a.x, a.z);
    a.inWater = w > a.y ? Math.min(2, w - a.y) : 0;
  } else a.inWater = 0;
}

export function drinkPotion(G, id) {
  const p = G.player;
  const P = G.P;
  const S = G.stats;
  const d = ITEMS[id];
  if (!d || G.inv.count(id) <= 0) return G.emit({ type: "deny", text: `No ${d ? d.name : "potions"} left` });
  G.inv.take(id, 1);
  const boost = P.skills.survivalist ? 1.4 : 1;
  if (d.heal) {
    p.potionT = 1.2;
    p.potionHeal = S.maxHp * d.heal * boost;
  }
  if (d.restore) {
    p.st = Math.min(S.maxSt, p.st + S.maxSt * d.restore * boost);
    p.res = Math.min(S.maxRes, p.res + S.maxRes * d.restore * boost);
  }
  p.action = { type: "potion", t: 0, dur: 0.9 };
  G.emit({ type: "potion", id, x: p.x, y: p.y, z: p.z });
}
