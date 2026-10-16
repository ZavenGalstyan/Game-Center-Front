/**
 * Wild Kingdom 3D — wildlife and companion AI (lightweight state machines),
 * plus population management (spawn / despawn around the player).
 *
 * Every animal is a plain object in `sim.ents`:
 *   type/def (WILD), role (wild | rival | intruder | recruit | companion),
 *   x/y/z, yaw, speed, hp, state + stateT, alert (prey awareness), target
 *   ("player" | entity), anim channels for the renderer.
 * Decisions run on a short `think` timer; movement runs every frame (far
 * animals are stepped at a lower rate).
 */
import { WILD, SPECIES, TERRITORIES, NAMES } from "./data.js";
import { WATER, HALF, biomeWeights, clamp } from "./terrain.js";

const TAU = Math.PI * 2;
const wrapA = (a) => {
  a = (a + Math.PI) % TAU;
  if (a < 0) a += TAU;
  return a - Math.PI;
};
const angTo = (from, to) => wrapA(to - from);
const BW = {};

export const MAX_WILD = 30;
const MAX_FISH = 8;
const MAX_HUNTERS = 6;
const DESPAWN = 360;

/* ------------------------------------------------------------------ relations */
/** Would a hunter of this power hunt / scare this prey? */
export function isThreat(power, hunterType, preyDef) {
  if (preyDef.water) return hunterType === "bear" || hunterType === "eagle";
  if (preyDef.size === "small") return power >= 1;
  if (preyDef.size === "medium") return power >= 2.5;
  return power >= 3;
}
function playerPos(sim) {
  return sim.player;
}
function distP(sim, e) {
  const p = sim.player;
  return Math.hypot(p.x - e.x, p.z - e.z);
}
function tgtPos(sim, t) {
  return t === "player" ? sim.player : t;
}
function tgtAlive(sim, t) {
  if (!t) return false;
  if (t === "player") return !sim.player.dead;
  return !t.dead && !t.gone;
}
function tgtR(sim, t) {
  return t === "player" ? sim.def.size.r : t.r;
}

/* ------------------------------------------------------------------ creation */
let uid = 1;
export function makeEntity(sim, type, x, z, o = {}) {
  const def = WILD[type];
  const role = o.role || "wild";
  const tier = o.tier || 0;
  let scale = o.scale ?? (role === "rival" ? 1.12 : 0.9 + sim.rand() * 0.2);
  let hp = def.hp;
  let dmg = def.dmg || 0;
  let power = def.power || 0;
  if (role === "rival") {
    hp *= 1.35 + 0.4 * tier + 0.03 * sim.A.level;
    dmg *= 1 + 0.22 * tier + 0.015 * sim.A.level;
    power *= 1.3;
  } else if (role === "intruder") {
    hp *= 1.1 + 0.2 * tier;
    dmg *= 1 + 0.12 * tier;
  } else if (role === "companion") {
    const lv = sim.A.level;
    hp *= 0.8 + 0.03 * lv;
    dmg *= 0.85 + 0.03 * lv;
  }
  const cub = !!o.cub;
  if (cub) {
    scale = 0.42 + 0.35 * (o.growth || 0);
    hp = 40;
    dmg = 0;
  }
  const flier = !!def.flier;
  let y = sim.terrain.height(x, z);
  if (def.water) y = WATER - 0.5 - sim.rand() * 0.6;
  if (type === "eagle") y = sim.terrain.surface(x, z) + 25 + sim.rand() * 20;
  const names = NAMES[type] || ["Wanderer"];
  const e = {
    id: uid++,
    type,
    def,
    role,
    tier,
    x,
    y,
    z,
    yaw: sim.rand() * TAU,
    speed: 0,
    vy: 0,
    hp,
    maxHp: hp,
    dmg,
    power,
    r: def.r * scale,
    h: def.h * scale,
    scale,
    state: "idle",
    stateT: 1 + sim.rand() * 2,
    think: sim.rand() * 0.3,
    alert: 0,
    target: null,
    fleeFrom: null,
    home: { x, z },
    wx: x,
    wz: z,
    stun: 0,
    fearT: 0,
    weakT: 0,
    buffT: 0,
    hurtT: 0,
    atk: null,
    atkCd: 0,
    fleeStam: 1,
    hunger: sim.rand() * 0.6,
    dead: false,
    deathT: 0,
    meat: 0,
    gone: false,
    flying: type === "eagle",
    alt: type === "eagle" ? 30 : 0,
    sleeping: false,
    marker: role === "recruit",
    name: role === "rival" ? NAMES.rival[type] || def.name : o.name || (role === "wild" ? def.name : names[Math.floor(sim.rand() * names.length)]),
    cub,
    growth: o.growth || 0,
    terr: o.terr || null,
    group: o.group || 0,
    famId: o.famId || null,
    famRole: o.famRole || null,
    acc: 0,
    anim: { phase: sim.rand() * 10, spd: 0, turn: 0, atk: 0, hurt: 0, lie: 0, head: 0, flap: 0 },
  };
  if (role === "rival" || role === "intruder") e.name = role === "rival" ? `${e.name} (Alpha)` : `${def.name} intruder`;
  if (flier && type === "bird") {
    e.flying = false;
    e.alt = 0;
  }
  return e;
}

/* ------------------------------------------------------------------ movement */
function blockedAhead(sim, e, yaw, dist, avoidWater) {
  const T = sim.terrain;
  const x = e.x + Math.sin(yaw) * dist;
  const z = e.z + Math.cos(yaw) * dist;
  if (Math.abs(x) > HALF - 12 || Math.abs(z) > HALF - 12) return true;
  const h = T.height(x, z);
  if (avoidWater && h < WATER + 0.1) return true;
  if (h > T.height(e.x, e.z) + 0.3 && T.normal(x, z).y < 0.62) return true;
  let hit = false;
  sim.colliders.query(x, z, e.r + 2, (c) => {
    if (!hit && (c.x - x) ** 2 + (c.z - z) ** 2 < (c.r + e.r + 0.2) ** 2) hit = true;
  });
  return hit;
}
/** Steer toward `yaw` at `spd`, avoiding obstacles, water (unless allowed) and cliffs. */
function moveGround(sim, e, yaw, spd, dt, o = {}) {
  const T = sim.terrain;
  const def = e.def;
  const avoidWater = !o.swim;
  if (spd > 0.05) {
    const look = 1.5 + e.r * 2 + spd * 0.25;
    if (blockedAhead(sim, e, yaw, look, avoidWater)) {
      let found = null;
      for (const off of [0.6, -0.6, 1.2, -1.2, 1.9, -1.9, 2.6, -2.6]) {
        const s = e.avoidSide || 1;
        if (!blockedAhead(sim, e, yaw + off * s, look, avoidWater)) {
          found = yaw + off * s;
          break;
        }
      }
      if (found == null) {
        e.avoidSide = -(e.avoidSide || 1);
        found = yaw + Math.PI * 0.8;
        spd *= 0.5;
      }
      yaw = found;
    }
  }
  const turnRate = (def.mass < 10 ? 9 : def.mass < 100 ? 5.5 : 3.6) * (e.stun > 0 ? 0 : 1);
  const diff = angTo(e.yaw, yaw);
  e.yaw = wrapA(e.yaw + clamp(diff, -turnRate * dt, turnRate * dt));
  e.anim.turn += (clamp(diff, -1, 1) - e.anim.turn) * Math.min(1, dt * 6);
  if (Math.abs(diff) > 1.6) spd *= 0.35;
  if (e.stun > 0) spd = 0;
  const acc = def.mass < 10 ? 30 : def.mass < 100 ? 14 : 9;
  e.speed += clamp(spd - e.speed, -acc * 1.5 * dt, acc * dt);
  let vx = Math.sin(e.yaw) * e.speed;
  let vz = Math.cos(e.yaw) * e.speed;
  if (e.kx || e.kz) {
    vx += e.kx;
    vz += e.kz;
    e.kx *= Math.pow(0.03, dt);
    e.kz *= Math.pow(0.03, dt);
    if (Math.abs(e.kx) + Math.abs(e.kz) < 0.1) e.kx = e.kz = 0;
  }
  let nx = e.x + vx * dt;
  let nz = e.z + vz * dt;
  // cliffs
  const h0 = T.height(e.x, e.z);
  const h1 = T.height(nx, nz);
  if (h1 > h0 + 0.05 && T.normal(nx, nz).y < 0.6) {
    nx = e.x;
    nz = e.z;
    e.speed *= 0.5;
  }
  sim.colliders.query(nx, nz, e.r + 3, (c) => {
    const dx = nx - c.x;
    const dz = nz - c.z;
    const d = Math.hypot(dx, dz);
    const min = c.r + e.r;
    if (d < min && d > 1e-4) {
      nx = c.x + (dx / d) * min;
      nz = c.z + (dz / d) * min;
    }
  });
  // keep off the player
  const p = sim.player;
  if (!p.dead && p.mode !== "air") {
    const dx = nx - p.x;
    const dz = nz - p.z;
    const min = (sim.def.size.r + e.r) * 0.85;
    const d2 = dx * dx + dz * dz;
    if (d2 < min * min && d2 > 1e-6) {
      const d = Math.sqrt(d2);
      const push = (min - d) * (e.def.mass > 100 ? 0.5 : 0.8);
      nx += (dx / d) * push;
      nz += (dz / d) * push;
    }
  }
  nx = clamp(nx, -HALF + 10, HALF - 10);
  nz = clamp(nz, -HALF + 10, HALF - 10);
  const moved = Math.hypot(nx - e.x, nz - e.z);
  e.x = nx;
  e.z = nz;
  const g = T.height(e.x, e.z);
  const swimY = WATER - e.h * 0.55;
  if (g < swimY) {
    e.y += (swimY - e.y) * Math.min(1, dt * 5);
    e.swim = true;
  } else {
    e.swim = false;
    if (e.vy || e.y > g + 0.05) {
      e.vy = (e.vy || 0) - 22 * dt;
      e.y += e.vy * dt;
      if (e.y <= g) {
        e.y = g;
        e.vy = 0;
      }
    } else e.y = g;
  }
  e.anim.spd = moved / Math.max(1e-4, dt);
  const stride = Math.max(0.25, e.def.r * 3.2 * e.scale * (e.speed > e.def.walk * 2.5 ? 1.5 : 1));
  e.anim.phase += (moved / stride) * Math.PI;
  return moved;
}

function moveFlyer(sim, e, yaw, spd, targetY, dt) {
  const diff = angTo(e.yaw, yaw);
  const tr = e.type === "bird" ? 5 : 1.8;
  e.yaw = wrapA(e.yaw + clamp(diff, -tr * dt, tr * dt));
  e.anim.turn += (clamp(diff, -1, 1) - e.anim.turn) * Math.min(1, dt * 4);
  e.speed += clamp(spd - e.speed, -10 * dt, 8 * dt);
  e.x = clamp(e.x + Math.sin(e.yaw) * e.speed * dt, -HALF + 10, HALF - 10);
  e.z = clamp(e.z + Math.cos(e.yaw) * e.speed * dt, -HALF + 10, HALF - 10);
  const g = sim.terrain.surface(e.x, e.z);
  const ty = Math.max(targetY, g + 1.5);
  const vy = clamp((ty - e.y) * 1.5, -14, 7);
  e.y += vy * dt;
  if (e.y < g + 0.2) e.y = g + 0.2;
  e.climb = vy;
  e.anim.spd = e.speed;
  e.anim.flap += dt * (vy > 0.5 || e.speed < 8 ? 10 : 2.5);
  e.anim.phase += dt * 3;
}

/* ------------------------------------------------------------------ combat */
function faceTo(e, t) {
  return Math.atan2(t.x - e.x, t.z - e.z);
}
function startAiAttack(sim, e, tgt) {
  e.atk = { t: 0, done: false, tgt, windup: e.def.mass > 100 ? 0.38 : 0.26, dur: e.def.mass > 100 ? 0.85 : 0.6 };
  e.atkCd = (e.def.atkCd || 1.2) * (e.role === "companion" ? 0.9 : 1);
  sim.emit("aiAttack", { animal: e.type, x: e.x, z: e.z, toPlayer: tgt === "player" });
}
function stepAiAttack(sim, e, dt) {
  const a = e.atk;
  a.t += dt;
  e.anim.atk = Math.min(1, a.t / a.dur);
  if (!a.done && a.t >= a.windup) {
    a.done = true;
    const t = a.tgt;
    if (tgtAlive(sim, t)) {
      const tp = tgtPos(sim, t);
      const d = Math.hypot(tp.x - e.x, tp.z - e.z);
      const ang = Math.abs(angTo(e.yaw, faceTo(e, tp)));
      const dy = Math.abs((tp.y || 0) - e.y);
      const reach = (e.def.atkRange || 1.2) * Math.max(0.8, e.scale) + e.r + tgtR(sim, t) + 0.25;
      if (d <= reach && ang < 1.1 && dy < 2.4) {
        let dmg = e.dmg * (e.weakT > 0 ? 0.6 : 1) * (e.buffT > 0 ? 1.4 : 1);
        if (e.role === "companion" && sim.hasPerk("prideStrength")) dmg *= 1.3;
        if (t === "player") sim.hurtPlayer(dmg, e, { knock: e.def.mass > 100 ? 5 : 2.5 });
        else {
          if (t.role === "companion") e.harmedFamily = true;
          const died = sim.hurtEnt(t, dmg, e, { knock: 2 });
          if (died && t.def.kind === "prey") {
            e.state = "eat";
            e.target = t;
            e.stateT = 18 + sim.rand() * 8;
          }
          if (e.role === "companion" && died) sim.emit("note", { text: `${e.name} brought down a ${t.def.name.toLowerCase()}!` });
        }
        sim.emit("aiHit", { animal: e.type, x: e.x, z: e.z });
      }
    }
  }
  if (a.t >= a.dur) e.atk = null;
}
/** Chase & attack `t` (player or entity). Returns the distance. */
function engage(sim, e, t, dt, sprint = true) {
  const tp = tgtPos(sim, t);
  const d = Math.hypot(tp.x - e.x, tp.z - e.z);
  const reach = (e.def.atkRange || 1.2) * Math.max(0.8, e.scale) + e.r + tgtR(sim, t);
  let spd = d > reach * 0.9 ? (sprint ? e.def.sprint || e.def.run : e.def.run) : 0;
  if (e.buffT > 0) spd *= 1.25;
  if (e.cub) spd = e.def.run * 0.7;
  if (e.atk) spd *= 0.3;
  moveGround(sim, e, faceTo(e, tp), spd, dt, { swim: true });
  if (!e.atk && e.atkCd <= 0 && d <= reach && !e.cub) {
    e.yaw = faceTo(e, tp);
    startAiAttack(sim, e, t);
  }
  return d;
}

/* ------------------------------------------------------------------ prey */
function threatsFor(sim, e) {
  const list = [];
  const p = sim.player;
  if (!p.dead && isThreat(sim.k.power, sim.species, e.def)) {
    let vis = p.vis;
    if (p.mode === "air") {
      const agl = p.y - sim.terrain.surface(p.x, p.z);
      vis *= e.def.size === "small" ? (agl > 25 ? 0.35 : 0.8) : 0.15;
    }
    list.push({ src: "player", x: p.x, z: p.z, vis, speed: p.speed });
  }
  for (const o of sim.ents) {
    if (o === e || o.dead || o.gone || o.def.kind === "prey" || o.cub) continue;
    if (!isThreat(o.power || o.def.power || 0, o.type, e.def)) continue;
    const hunting = o.state === "hunt" || o.state === "fight" || (o.role === "companion" && o.target);
    list.push({ src: o, x: o.x, z: o.z, vis: hunting ? 0.9 : 0.45, speed: o.speed });
  }
  return list;
}
function preyThink(sim, e) {
  const night = sim.isNight();
  const W = sim.weather;
  let best = null;
  let bd = Infinity;
  const base = e.def.detect * (e.sleeping ? 0.55 : 1) * (night ? 0.8 : 1) * (1 - 0.3 * W.fog);
  for (const t of threatsFor(sim, e)) {
    const d = Math.hypot(t.x - e.x, t.z - e.z);
    const R = base * t.vis;
    if (d < R) {
      const closing = t.speed > 6 ? 2 : 1;
      e.alert += 0.25 * (1 + 3 * (1 - d / R)) * closing;
      if (d < R * 0.35) e.alert = 2;
      if (d < bd) {
        bd = d;
        best = t;
      }
    }
  }
  if (!best) e.alert = Math.max(0, e.alert - 0.05);
  if (best && e.alert >= 1 && e.state !== "flee") {
    startFlee(sim, e, best.src);
    // herd alarm
    for (const o of sim.ents) {
      if (o !== e && !o.dead && o.def.kind === "prey" && o.state !== "flee" && Math.hypot(o.x - e.x, o.z - e.z) < 25) {
        o.alert = 1.5;
        startFlee(sim, o, best.src);
      }
    }
  }
}
function startFlee(sim, e, src) {
  e.state = "flee";
  e.fleeFrom = src;
  e.stateT = 6 + sim.rand() * 5;
  e.sleeping = false;
  e.anim.head = 0;
  if (e.type === "bird") {
    e.flying = true;
    e.alt = 6 + sim.rand() * 10;
  }
  if (src === "player" || src?.role === "companion") sim.emit("preyFlee", { animal: e.type });
}
function preyUpdate(sim, e, dt, think) {
  const def = e.def;
  if (think && e.state !== "dead") preyThink(sim, e);
  const night = sim.isNight();
  e.anim.head += ((e.state === "graze" || e.state === "drink" ? 1 : 0) - e.anim.head) * Math.min(1, dt * 4);
  e.anim.lie += ((e.sleeping ? 1 : 0) - e.anim.lie) * Math.min(1, dt * 2);
  switch (e.state) {
    case "flee": {
      const s = e.fleeFrom;
      const sp = s === "player" ? sim.player : s;
      if (!sp || (s !== "player" && (s.dead || s.gone))) {
        e.state = "idle";
        e.stateT = 2;
        break;
      }
      let away = Math.atan2(e.x - sp.x, e.z - sp.z);
      if (e.type === "rabbit" || e.type === "gazelle") away += Math.sin(sim.t * 3 + e.id) * 0.6;
      // tire over a long chase
      e.fleeStam = Math.max(0, e.fleeStam - dt / (def.size === "small" ? 8 : def.size === "medium" ? 9 : 11));
      // tired and wounded prey slow down
      const spd = def.run * (0.55 + 0.45 * Math.min(1, e.fleeStam * 2.2)) * (0.6 + 0.4 * (e.hp / e.maxHp));
      // zebras kick back when something is right behind them
      if (def.kick && e.kickCd <= 0 && s === "player") {
        const p = sim.player;
        const d = Math.hypot(p.x - e.x, p.z - e.z);
        const behind = Math.abs(angTo(e.yaw, Math.atan2(p.x - e.x, p.z - e.z))) > 2.1;
        if (d < e.r + sim.def.size.r + 1.2 && behind) {
          e.kickCd = 2.5;
          e.anim.atk = 1;
          sim.hurtPlayer(def.kick, e, { knock: 6 });
          sim.emit("kick");
        }
      }
      e.kickCd = (e.kickCd || 0) - dt;
      if (e.type === "bird" && e.flying) {
        moveFlyer(sim, e, away, def.run, sim.terrain.surface(e.x, e.z) + e.alt, dt);
      } else moveGround(sim, e, away, spd, dt, { swim: e.alert > 1.5 });
      e.stateT -= dt;
      const d = Math.hypot(sp.x - e.x, sp.z - e.z);
      if (e.stateT <= 0 && d > def.detect * 1.6) {
        e.state = "idle";
        e.stateT = 2;
        e.alert = 0.3;
        e.home = { x: e.x, z: e.z };
      }
      break;
    }
    case "graze":
    case "drink":
    case "idle":
      if (e.type === "bird" && e.flying) {
        // land
        e.alt = Math.max(0, e.alt - dt * 6);
        moveFlyer(sim, e, e.yaw, 5, sim.terrain.height(e.x, e.z) + e.alt, dt);
        if (e.alt <= 0.05) {
          e.flying = false;
          e.y = sim.terrain.height(e.x, e.z);
        }
        break;
      }
      moveGround(sim, e, e.yaw, 0, dt);
      e.stateT -= dt;
      if (e.state === "drink" && e.stateT > 0 && e.stateT % 1 < dt) e.anim.head = 1;
      if (e.stateT <= 0) pickIdleState(sim, e, night);
      break;
    case "rest":
      moveGround(sim, e, e.yaw, 0, dt);
      e.stateT -= dt;
      if (e.stateT <= 0) {
        e.sleeping = false;
        pickIdleState(sim, e, night);
      }
      break;
    case "wander":
    case "toWater": {
      const d = Math.hypot(e.wx - e.x, e.wz - e.z);
      const spd = e.state === "toWater" ? def.walk * 1.4 : def.walk * (e.type === "rabbit" ? 2.2 : 1);
      moveGround(sim, e, Math.atan2(e.wx - e.x, e.wz - e.z), spd, dt);
      e.stateT -= dt;
      if (d < 1.5 + e.r || e.stateT <= 0) {
        if (e.state === "toWater" && sim.terrain.waterNear(e.x + Math.sin(e.yaw) * 1.5, e.z + Math.cos(e.yaw) * 1.5, 1.5)) {
          e.state = "drink";
          e.stateT = 4 + sim.rand() * 4;
        } else pickIdleState(sim, e, night);
      }
      break;
    }
    default:
      e.state = "idle";
  }
  e.fleeStam = e.state === "flee" ? e.fleeStam : Math.min(1, e.fleeStam + dt * 0.08);
}
function pickIdleState(sim, e, night) {
  const r = sim.rand();
  const storm = sim.weather.storm > 0.5 || sim.weather.rain > 0.8;
  if (night && e.type !== "rabbit" && r < 0.55) {
    e.state = "rest";
    e.sleeping = true;
    e.stateT = 20 + sim.rand() * 30;
    return;
  }
  if (storm && r < 0.4) {
    e.state = "rest";
    e.sleeping = false;
    e.stateT = 8 + sim.rand() * 10;
    return;
  }
  if (r < 0.12) {
    // look for water nearby
    for (let a = 0; a < 8; a++) {
      const an = (a / 8) * TAU;
      for (const dist of [12, 24, 36]) {
        const x = e.x + Math.cos(an) * dist;
        const z = e.z + Math.sin(an) * dist;
        if (sim.terrain.height(x, z) < WATER - 0.2) {
          e.state = "toWater";
          // stop at the shore
          e.wx = e.x + Math.cos(an) * (dist - 3);
          e.wz = e.z + Math.sin(an) * (dist - 3);
          e.stateT = 25;
          return;
        }
      }
    }
  }
  if (r < 0.5) {
    e.state = "graze";
    e.stateT = 4 + sim.rand() * 7;
  } else if (r < 0.88) {
    const a = sim.rand() * TAU;
    const d = 6 + sim.rand() * 18;
    e.wx = e.home.x + Math.cos(a) * d;
    e.wz = e.home.z + Math.sin(a) * d;
    e.state = "wander";
    e.stateT = 15;
  } else {
    e.state = "idle";
    e.stateT = 1.5 + sim.rand() * 3;
  }
}

/* ------------------------------------------------------------------ fish */
function fishUpdate(sim, e, dt, think) {
  const T = sim.terrain;
  const p = sim.player;
  if (think) {
    const d = Math.hypot(p.x - e.x, p.z - e.z);
    if (!p.dead && (sim.species === "bear" || sim.species === "eagle") && d < e.def.detect * (p.mode === "air" ? 0.6 : 1) * (p.stalking ? 0.5 : 1)) {
      e.state = "flee";
      e.stateT = 1.5;
      e.fleeFrom = "player";
    } else if (e.stateT <= 0) {
      e.state = "swim";
      e.stateT = 2 + sim.rand() * 4;
      e.wyaw = e.yaw + (sim.rand() - 0.5) * 2;
    }
  }
  e.stateT -= dt;
  let yaw = e.state === "flee" ? Math.atan2(e.x - p.x, e.z - p.z) : e.wyaw ?? e.yaw;
  const spd = e.state === "flee" ? e.def.run : e.def.walk;
  // stay in water deeper than 0.7 m
  for (let i = 0; i < 6; i++) {
    const nx = e.x + Math.sin(yaw) * 2;
    const nz = e.z + Math.cos(yaw) * 2;
    if (T.height(nx, nz) < -0.8) break;
    yaw += 1.1;
    e.wyaw = yaw;
  }
  e.yaw = wrapA(e.yaw + clamp(angTo(e.yaw, yaw), -4 * dt, 4 * dt));
  e.speed += (spd - e.speed) * Math.min(1, dt * 3);
  const nx = e.x + Math.sin(e.yaw) * e.speed * dt;
  const nz = e.z + Math.cos(e.yaw) * e.speed * dt;
  if (T.height(nx, nz) < -0.7) {
    e.x = nx;
    e.z = nz;
  }
  const depth = -T.height(e.x, e.z);
  e.y = -Math.min(0.35 + 0.25 * Math.sin(sim.t * 0.7 + e.id), depth * 0.6);
  e.anim.phase += dt * (3 + e.speed * 3);
  e.anim.spd = e.speed;
}

/* ------------------------------------------------------------------ predators */
function hostileToPlayer(sim, e) {
  const p = sim.player;
  if (p.dead || e.fearT > 0) return false;
  const d = distP(sim, e);
  const pp = sim.k.power;
  const ownedHere = sim.ownedAt(p.x, p.z);
  if (e.role === "rival") {
    const T = TERRITORIES.find((t) => t.id === e.terr);
    return d < 26 || Math.hypot(p.x - T.x, p.z - T.z) < T.r * 0.85;
  }
  if (e.role === "intruder") return d < 30;
  if (e.role === "recruit") return false;
  if (p.mode === "air" && e.type !== "eagle") return false;
  if (p.sleeping && ownedHere) return false;
  if (e.type === sim.species) return d < 4 && e.power >= pp && sim.rand() < 0.3;
  const sense = (e.def.detect || 20) * p.vis * (e.def.nocturnal && sim.isNight() ? 1.3 : 1);
  if (d > sense) return false;
  if (e.def.kind === "predator" && e.power >= pp * 1.8 && (e.hunger > 0.4 || sim.isNight())) return true;
  if (e.def.territorial && d < e.def.territorial && e.power >= pp * 0.8) return true;
  if (e.ambusher) return true;
  return false;
}
function fearsPlayer(sim, e) {
  const p = sim.player;
  if (p.dead || e.role === "rival" || e.role === "intruder") return false;
  if (p.mode === "air" && e.type !== "eagle") return false;
  return sim.k.power >= e.power * 1.6 && distP(sim, e) < 14 * p.vis + 4;
}
function predThink(sim, e) {
  const p = sim.player;
  const night = sim.isNight();
  const def = e.def;
  if (e.fearT > 0) {
    if (e.state !== "flee") {
      e.state = "flee";
      e.fleeFrom = "player";
    }
    return;
  }
  // low health → back off (rivals fight to the end; intruders flee)
  if (e.hp < e.maxHp * 0.22 && e.role !== "rival" && e.state !== "flee") {
    e.state = "flee";
    e.fleeFrom = e.lastAttacker === "player" ? "player" : e.lastAttacker || "player";
    e.fleeing = true;
    e.stateT = 12;
    e.target = null;
    return;
  }
  if (e.state === "fight" && tgtAlive(sim, e.target)) {
    const tp = tgtPos(sim, e.target);
    const d = Math.hypot(tp.x - e.x, tp.z - e.z);
    const leash = e.role === "rival" ? 60 : e.role === "intruder" ? 50 : 40;
    if (d > leash || (e.target === "player" && p.mode === "air" && e.type !== "eagle" && p.y - sim.terrain.surface(p.x, p.z) > 4)) {
      e.target = null;
      e.state = "idle";
      e.stateT = 2;
    }
    return;
  }
  if (e.state === "eat" || e.state === "flee") return;
  if (hostileToPlayer(sim, e)) {
    e.target = "player";
    e.state = "fight";
    e.stateT = 25;
    if (e.role !== "rival") sim.emit("threat", { name: def.name, animal: e.type });
    return;
  }
  if (fearsPlayer(sim, e)) {
    e.state = "flee";
    e.fleeFrom = "player";
    e.stateT = 5;
    return;
  }
  // defend against companions that hassle us
  if (e.role === "rival" || e.role === "intruder") {
    for (const c of sim.ents) {
      if (c.role === "companion" && !c.dead && !c.cub && Math.hypot(c.x - e.x, c.z - e.z) < 8) {
        e.target = c;
        e.state = "fight";
        return;
      }
    }
  }
  if (e.role !== "wild") return;
  // hungry hunters pick prey — or an unguarded cub
  const resting = (def.nocturnal && !night && sim.rand() < 0.5) || (def.siesta && sim.time > 0.42 && sim.time < 0.62);
  if (e.hunger > 0.45 && !resting && e.state !== "hunt") {
    let best = null;
    let bd = 70;
    for (const o of sim.ents) {
      if (o.dead || o.gone) continue;
      let ok = false;
      if (o.def.kind === "prey" && def.hunts && def.hunts.includes(o.type)) ok = true;
      if (o.role === "companion" && o.cub && e.power >= 2.5) ok = true;
      if (!ok) continue;
      if (o.flying || (o.def.water && e.type !== "bear" && e.type !== "eagle")) continue;
      const d = Math.hypot(o.x - e.x, o.z - e.z);
      if (d < bd) {
        bd = d;
        best = o;
      }
    }
    if (best) {
      e.state = "hunt";
      e.target = best;
      e.stateT = 22;
      e.chaseT = 0;
      return;
    }
  }
  if (e.state === "idle" || e.state === "wander" || e.state === "rest") {
    if (e.stateT > 0) return;
    if (resting || (night && !def.nocturnal)) {
      e.state = "rest";
      e.sleeping = true;
      e.stateT = 15 + sim.rand() * 20;
    } else if (sim.rand() < 0.6) {
      const a = sim.rand() * TAU;
      const d = 10 + sim.rand() * 30;
      e.wx = e.home.x + Math.cos(a) * d;
      e.wz = e.home.z + Math.sin(a) * d;
      e.state = "wander";
      e.sleeping = false;
      e.stateT = 20;
    } else {
      e.state = "idle";
      e.sleeping = false;
      e.stateT = 2 + sim.rand() * 4;
    }
  }
}
function predUpdate(sim, e, dt, think) {
  const def = e.def;
  e.hunger = Math.min(1, e.hunger + dt / 240);
  if (think) predThink(sim, e);
  e.anim.lie += ((e.sleeping ? 1 : 0) - e.anim.lie) * Math.min(1, dt * 2);
  e.anim.head += ((e.state === "eat" ? 1 : 0) - e.anim.head) * Math.min(1, dt * 4);
  if (e.flying) return flyerPredUpdate(sim, e, dt, think);
  const p = sim.player;
  switch (e.state) {
    case "fight": {
      if (!tgtAlive(sim, e.target)) {
        e.state = "idle";
        e.target = null;
        e.stateT = 2;
        break;
      }
      engage(sim, e, e.target, dt);
      break;
    }
    case "hunt": {
      const t = e.target;
      if (!tgtAlive(sim, t)) {
        if (t && t.dead && t.meat > 0) {
          e.state = "eat";
          e.stateT = 18;
        } else {
          e.state = "idle";
          e.target = null;
          e.stateT = 3;
        }
        break;
      }
      const d = Math.hypot(t.x - e.x, t.z - e.z);
      e.chaseT += dt;
      if (d > 16 && t.state !== "flee") {
        // stalk
        moveGround(sim, e, faceTo(e, t), def.walk * 1.5, dt);
      } else {
        e.sleeping = false;
        engage(sim, e, t, dt);
      }
      if (e.chaseT > 16 || d > 90) {
        e.state = "rest";
        e.target = null;
        e.stateT = 10;
        e.hunger = Math.max(0.2, e.hunger - 0.15);
      }
      break;
    }
    case "eat": {
      const t = e.target;
      if (!t || !(t.meat > 0) || t.gone) {
        e.state = "rest";
        e.sleeping = sim.rand() < 0.5;
        e.stateT = 12;
        e.target = null;
        break;
      }
      const d = Math.hypot(t.x - e.x, t.z - e.z);
      if (d > e.r + t.r + 0.8) moveGround(sim, e, faceTo(e, t), def.walk * 2, dt);
      else {
        moveGround(sim, e, faceTo(e, t), 0, dt);
        const bite = Math.min(t.meat, 3 * dt);
        t.meat -= bite;
        e.hunger = Math.max(0, e.hunger - bite / 60);
        e.anim.head = 1;
      }
      e.stateT -= dt;
      if (e.stateT <= 0) {
        e.state = "rest";
        e.stateT = 15;
        e.target = null;
      }
      break;
    }
    case "flee": {
      const s = e.fleeFrom === "player" ? p : e.fleeFrom;
      if (!s || s.dead) {
        e.state = "idle";
        e.stateT = 2;
        break;
      }
      moveGround(sim, e, Math.atan2(e.x - s.x, e.z - s.z), def.sprint || def.run, dt, { swim: true });
      e.stateT -= dt;
      if (e.stateT <= 0 && e.fearT <= 0 && Math.hypot(s.x - e.x, s.z - e.z) > 30) {
        e.state = "idle";
        e.stateT = 2;
        if (e.hp > e.maxHp * 0.22) e.fleeing = false;
      }
      break;
    }
    case "wander": {
      let tx = e.wx;
      let tz = e.wz;
      if (e.role === "intruder") {
        const T = TERRITORIES.find((t) => t.id === e.terr);
        tx = T.x;
        tz = T.z;
      }
      const d = Math.hypot(tx - e.x, tz - e.z);
      moveGround(sim, e, Math.atan2(tx - e.x, tz - e.z), d > 2 ? def.walk * (e.role === "intruder" ? 2.2 : 1) : 0, dt);
      e.stateT -= dt;
      if ((d < 2 && e.role !== "intruder") || e.stateT <= 0) {
        e.state = "idle";
        e.stateT = 2 + sim.rand() * 3;
      }
      break;
    }
    case "rest":
    case "idle":
    default: {
      moveGround(sim, e, e.yaw, 0, dt);
      e.stateT -= dt;
      if (e.role === "intruder") {
        e.state = "wander";
        e.stateT = 30;
      }
      if (e.role === "rival") {
        // patrol around the marker; return if dragged too far
        const T = TERRITORIES.find((t) => t.id === e.terr);
        const d = Math.hypot(T.x - e.x, T.z - e.z);
        if (e.stateT <= 0 || d > T.r * 0.7) {
          const a = sim.rand() * TAU;
          e.wx = T.x + Math.cos(a) * T.r * 0.35;
          e.wz = T.z + Math.sin(a) * T.r * 0.35;
          e.state = "wander";
          e.stateT = 20;
          e.hp = Math.min(e.maxHp, e.hp + e.maxHp * 0.1);
        }
      }
      if (e.state === "rest" && e.stateT <= 0) e.sleeping = false;
    }
  }
}
function flyerPredUpdate(sim, e, dt) {
  const p = sim.player;
  const g = sim.terrain.surface(e.x, e.z);
  if (e.state === "fight" && tgtAlive(sim, e.target)) {
    const tp = tgtPos(sim, e.target);
    const d = Math.hypot(tp.x - e.x, tp.z - e.z);
    const ty = (tp.y || 0) + (d > 6 ? 3 : 0.4);
    moveFlyer(sim, e, faceTo(e, tp), d > 5 ? 20 : 12, ty, dt);
    const d3 = Math.hypot(tp.x - e.x, (tp.y || 0) - e.y, tp.z - e.z);
    if (!e.atk && e.atkCd <= 0 && d3 < 2.6 + e.r) startAiAttack(sim, e, e.target);
    return;
  }
  if (e.state === "hunt" && tgtAlive(sim, e.target)) {
    const t = e.target;
    const d = Math.hypot(t.x - e.x, t.z - e.z);
    moveFlyer(sim, e, faceTo(e, t), d > 20 ? 18 : 14, d > 25 ? g + 20 : t.y + 0.3, dt);
    if (Math.hypot(t.x - e.x, t.y - e.y, t.z - e.z) < 1.6) {
      sim.hurtEnt(t, 99, e, {});
      t.gone = true; // carried off
      e.state = "wander";
      e.hunger = 0;
      e.alt = 35;
    }
    e.chaseT = (e.chaseT || 0) + dt;
    if (e.chaseT > 14) {
      e.state = "wander";
      e.target = null;
    }
    return;
  }
  if (e.state === "flee") {
    moveFlyer(sim, e, Math.atan2(e.x - p.x, e.z - p.z), 22, g + 40, dt);
    e.stateT -= dt;
    if (e.stateT <= 0 && e.fearT <= 0) e.state = "wander";
    return;
  }
  // circle the home area
  const cx = e.role === "rival" ? TERRITORIES.find((t) => t.id === e.terr).x : e.home.x;
  const cz = e.role === "rival" ? TERRITORIES.find((t) => t.id === e.terr).z : e.home.z;
  const ang = Math.atan2(e.x - cx, e.z - cz) + 0.5;
  const R = 35;
  const tx = cx + Math.sin(ang) * R;
  const tz = cz + Math.cos(ang) * R;
  moveFlyer(sim, e, Math.atan2(tx - e.x, tz - e.z), 13, g + (e.role === "rival" ? 22 : e.alt), dt);
}

/* ------------------------------------------------------------------ companions */
function companionHome(sim) {
  const A = sim.A;
  const p = sim.player;
  const owned = TERRITORIES.filter((t) => A.owned.includes(t.id));
  if (owned.length) {
    owned.sort((a, b) => Math.hypot(a.x - p.x, a.z - p.z) - Math.hypot(b.x - p.x, b.z - p.z));
    return owned[0];
  }
  return SPECIES[sim.species].home;
}
function companionUpdate(sim, e, dt, think) {
  const p = sim.player;
  const A = sim.A;
  const fam = A.family.find((f) => f.id === e.famId);
  if (!fam) {
    e.gone = true;
    return;
  }
  e.buffT = Math.max(0, e.buffT - dt);
  e.combatT = (e.combatT || 0) + dt;
  if (e.hurtT > 0) e.combatT = 0;
  if (e.combatT > 8 && e.hp < e.maxHp) e.hp = Math.min(e.maxHp, e.hp + e.maxHp * 0.012 * dt);
  e.anim.lie += ((e.sleeping ? 1 : 0) - e.anim.lie) * Math.min(1, dt * 2);
  e.anim.head += (((p.eating && !e.cub) || e.eatT > 0 ? 1 : 0) - e.anim.head) * Math.min(1, dt * 4);
  // eagle chicks stay in the nest
  if (sim.species === "eagle" && e.cub) {
    const T = A.nest ? TERRITORIES.find((t) => t.id === A.nest.t) : null;
    if (!T) return;
    e.x = T.x + Math.sin(e.id) * 0.5;
    e.z = T.z + Math.cos(e.id) * 0.5;
    e.y = sim.terrain.height(T.x, T.z) + 0.35;
    e.yaw += dt * 0.3 * Math.sin(sim.t + e.id);
    e.anim.flap += dt * (Math.sin(sim.t * 0.8 + e.id) > 0.7 ? 8 : 0);
    return;
  }
  const dP = Math.hypot(p.x - e.x, p.z - e.z);
  // badly hurt → head home to recover
  if (!e.cub && e.hp < e.maxHp * 0.25 && e.state !== "retreat") {
    e.state = "retreat";
    e.target = null;
    sim.emit("note", { text: `${e.name} is badly hurt and limps home.` });
  }
  if (e.state === "retreat") {
    const H = companionHome(sim);
    moveGround(sim, e, Math.atan2(H.x - e.x, H.z - e.z), e.def.run, dt, { swim: true });
    if (dP > 70 || Math.hypot(H.x - e.x, H.z - e.z) < 10) {
      fam.home = true;
      fam.homeUntil = sim.t + 90;
      fam.hp = 0.5;
      e.gone = true;
    }
    return;
  }
  // catch up if left far behind (they find their way)
  if (dP > 110 && p.mode !== "air") {
    const a = p.yaw + Math.PI + (sim.rand() - 0.5);
    const pos = sim.findDry(p.x + Math.sin(a) * 25, p.z + Math.cos(a) * 25);
    e.x = pos.x;
    e.z = pos.z;
    e.y = sim.terrain.height(e.x, e.z);
  }
  // pick a fight to help with
  if (think && !e.cub) {
    let t = null;
    if (p.lastHit && !p.lastHit.dead && !p.lastHit.gone && p.lastHitT < 8 && Math.hypot(p.lastHit.x - p.x, p.lastHit.z - p.z) < 35) t = p.lastHit;
    if (!t) {
      for (const o of sim.ents) {
        if (o.dead || o.gone || o.role === "companion") continue;
        if ((o.target === "player" || (o.target && o.target.role === "companion")) && Math.hypot(o.x - p.x, o.z - p.z) < 28) {
          t = o;
          break;
        }
      }
    }
    if (t && t.flying && sim.species !== "eagle") t = null;
    e.target = t;
  }
  if (e.cub) {
    // cubs scurry to you when danger is near
    let danger = false;
    for (const o of sim.ents) if (!o.dead && o.def.kind !== "prey" && o.role !== "companion" && Math.hypot(o.x - e.x, o.z - e.z) < 12) danger = true;
    e.sleeping = p.sleeping;
  }
  if (e.target && tgtAlive(sim, e.target) && !e.cub) {
    e.sleeping = false;
    if (sim.species === "eagle") {
      const tp = tgtPos(sim, e.target);
      moveFlyer(sim, e, faceTo(e, tp), 18, tp.y + 0.5, dt);
      if (!e.atk && e.atkCd <= 0 && Math.hypot(tp.x - e.x, tp.y - e.y, tp.z - e.z) < 2.4) startAiAttack(sim, e, e.target);
    } else engage(sim, e, e.target, dt);
    return;
  }
  e.target = null;
  // follow in formation behind the player
  const slots = e.cub ? [[-1.2, -1.6], [1.2, -1.6], [0, -2.6]] : [[-2.4, -2.2], [2.4, -2.2], [-3.6, -4.4], [3.6, -4.4], [0, -5.6]];
  const idx = e.slot ?? 0;
  const [sx, sz] = slots[idx % slots.length];
  const scale = sim.def.size.len / 1.6;
  const cy = Math.cos(p.yaw);
  const syw = Math.sin(p.yaw);
  const tx = p.x + (sx * cy + sz * syw) * scale;
  const tz = p.z + (-sx * syw + sz * cy) * scale;
  if (sim.species === "eagle") {
    // mate (and fledged young) fly with you or perch beside you
    if (p.mode === "air") {
      e.flying = true;
      moveFlyer(sim, e, Math.atan2(tx - e.x, tz - e.z), Math.max(8, Math.min(30, p.speed + (Math.hypot(tx - e.x, tz - e.z) - 2) * 0.8)), p.y + 1 + idx, dt);
    } else {
      const g = sim.terrain.height(tx, tz);
      const d = Math.hypot(tx - e.x, tz - e.z);
      if (d > 1.5 || e.y > g + 0.3) {
        e.flying = true;
        moveFlyer(sim, e, Math.atan2(tx - e.x, tz - e.z), Math.min(14, d * 1.2 + 2), d < 6 ? g : g + 6, dt);
        if (d < 1.6 && e.y < g + 0.5) {
          e.flying = false;
          e.y = g;
        }
      } else {
        e.flying = false;
        e.speed = 0;
        e.y = g;
        e.anim.spd = 0;
      }
    }
    return;
  }
  const d = Math.hypot(tx - e.x, tz - e.z);
  let spd = 0;
  if (d > 1.2) {
    const def = e.def;
    spd = d > 12 ? def.sprint || def.run * 1.6 : d > 4 ? Math.max(def.run, p.speed) : Math.min(def.run, d * 1.2 + p.speed * 0.6);
    if (e.cub) spd = Math.min(spd, def.run * 1.1);
    if (e.buffT > 0) spd *= 1.25;
  }
  e.sleeping = p.sleeping && d < 6;
  const yaw = d > 1.2 ? Math.atan2(tx - e.x, tz - e.z) : p.yaw;
  moveGround(sim, e, yaw, spd, dt, { swim: true });
  e.eatT = p.eating && d < 6 ? 1 : 0;
}

/* ------------------------------------------------------------------ recruits */
function recruitUpdate(sim, e, dt, think) {
  if (e.flying) {
    const g = sim.terrain.surface(e.x, e.z);
    const ang = Math.atan2(e.x - e.home.x, e.z - e.home.z) + 0.6;
    moveFlyer(sim, e, Math.atan2(e.home.x + Math.sin(ang) * 18 - e.x, e.home.z + Math.cos(ang) * 18 - e.z), 10, g + 10, dt);
    return;
  }
  e.stateT -= dt;
  if (e.state === "wander") {
    const d = Math.hypot(e.wx - e.x, e.wz - e.z);
    moveGround(sim, e, Math.atan2(e.wx - e.x, e.wz - e.z), e.def.walk, dt);
    if (d < 1.5 || e.stateT <= 0) {
      e.state = "idle";
      e.stateT = 3 + sim.rand() * 4;
    }
  } else {
    // face the player when near
    const p = sim.player;
    const near = Math.hypot(p.x - e.x, p.z - e.z) < 12;
    moveGround(sim, e, near ? Math.atan2(p.x - e.x, p.z - e.z) : e.yaw, 0, dt);
    if (e.stateT <= 0 && !near) {
      const a = sim.rand() * TAU;
      e.wx = e.home.x + Math.cos(a) * 10;
      e.wz = e.home.z + Math.sin(a) * 10;
      e.state = "wander";
      e.stateT = 12;
    }
  }
}

/* ------------------------------------------------------------------ main update */
export function updateEntities(sim, dt) {
  const p = sim.player;
  for (const e of sim.ents) {
    if (e.gone) continue;
    e.hurtT = Math.max(0, e.hurtT - dt);
    e.anim.hurt = Math.max(0, e.anim.hurt - dt * 3);
    if (e.dead) {
      e.deathT += dt;
      e.anim.lie = Math.min(1, e.anim.lie + dt * 2);
      e.speed = 0;
      e.atk = null;
      // dead fliers drop
      const g = e.def.water ? Math.min(-0.05, e.y + dt) : sim.terrain.height(e.x, e.z);
      if (e.y > g + 0.01) e.y = Math.max(g, e.y - dt * 9);
      else if (e.def.water) e.y = Math.min(-0.05, e.y + dt * 0.5);
      continue;
    }
    // far animals think and move at a lower rate
    const d = Math.hypot(e.x - p.x, e.z - p.z);
    let step = dt;
    if (d > 150 && e.role === "wild") {
      e.acc += dt;
      if (e.acc < 0.2) continue;
      step = Math.min(e.acc, 0.25);
      e.acc = 0;
    }
    e.stun = Math.max(0, e.stun - step);
    e.fearT = Math.max(0, e.fearT - step);
    e.weakT = Math.max(0, e.weakT - step);
    e.atkCd = Math.max(0, e.atkCd - step);
    e.think -= step;
    const think = e.think <= 0;
    if (think) e.think = 0.2 + sim.rand() * 0.15;
    if (e.atk) stepAiAttack(sim, e, step);
    else e.anim.atk = Math.max(0, e.anim.atk - step * 3);
    if (e.role === "companion") companionUpdate(sim, e, step, think);
    else if (e.role === "recruit") recruitUpdate(sim, e, step, think);
    else if (e.def.water) fishUpdate(sim, e, step, think);
    else if (e.def.kind === "prey") preyUpdate(sim, e, step, think);
    else predUpdate(sim, e, step, think);
  }
  // soft separation between nearby ground animals
  const E = sim.ents;
  for (let i = 0; i < E.length; i++) {
    const a = E[i];
    if (a.dead || a.gone || a.flying || a.def.water) continue;
    for (let j = i + 1; j < E.length; j++) {
      const b = E[j];
      if (b.dead || b.gone || b.flying || b.def.water) continue;
      const dx = b.x - a.x;
      const dz = b.z - a.z;
      const min = (a.r + b.r) * 0.85;
      const d2 = dx * dx + dz * dz;
      if (d2 < min * min && d2 > 1e-6) {
        const d = Math.sqrt(d2);
        const push = (min - d) * 0.5;
        const wa = b.def.mass / (a.def.mass + b.def.mass);
        a.x -= (dx / d) * push * wa;
        a.z -= (dz / d) * push * wa;
        b.x += (dx / d) * push * (1 - wa);
        b.z += (dz / d) * push * (1 - wa);
      }
    }
  }
}

/* ------------------------------------------------------------------ population */
const SPAWN_TYPES = ["rabbit", "bird", "deer", "gazelle", "zebra", "wolf", "lion", "tiger", "bear", "fox", "eagle"];
function pickType(sim, x, z) {
  biomeWeights(x, z, BW);
  const night = sim.isNight();
  const W = sim.weather;
  const owned = sim.ownedAt(x, z);
  let total = 0;
  const w = [];
  for (const t of SPAWN_TYPES) {
    const def = WILD[t];
    let v = 0;
    for (const b in def.biomes) v += (BW[b] || 0) * def.biomes[b];
    if (def.kind !== "prey") {
      v *= night ? (def.nocturnal ? 1.7 : 0.6) : def.nocturnal ? 0.7 : 1;
      if (owned) v *= 0.25;
    } else {
      if (owned) v *= 1.6;
      if (night) v *= 0.85;
    }
    if (t === "bird") v *= 1 - 0.6 * W.rain;
    w.push(v);
    total += v;
  }
  let r = sim.rand() * total;
  for (let i = 0; i < SPAWN_TYPES.length; i++) {
    r -= w[i];
    if (r <= 0) return SPAWN_TYPES[i];
  }
  return "rabbit";
}
function okSpot(sim, x, z) {
  const T = sim.terrain;
  if (Math.abs(x) > HALF - 20 || Math.abs(z) > HALF - 20) return false;
  if (T.height(x, z) < 0.6) return false;
  if (T.normal(x, z).y < 0.8) return false;
  return !sim.blocked(x, z, 1);
}
let groupId = 1;
export function spawnTick(sim, dt, initial = false) {
  const p = sim.player;
  const A = sim.A;
  // cull
  sim.ents = sim.ents.filter((e) => {
    if (e.gone) return false;
    const d = Math.hypot(e.x - p.x, e.z - p.z);
    if (e.role === "companion") return true;
    if (e.role === "rival") return !(e.dead && e.deathT > 60);
    if (e.dead) return !(e.deathT > 200 || (e.meat <= 0 && e.deathT > 25) || d > 300);
    if (e.role === "intruder") return d < 400;
    return d < DESPAWN;
  });
  // companions & recruits are respawned elsewhere
  let wild = 0;
  let fish = 0;
  let hunters = 0;
  for (const e of sim.ents) {
    if (e.dead || e.role !== "wild") continue;
    if (e.def.water) fish++;
    else wild++;
    if (e.def.kind !== "prey") hunters++;
  }
  const cap = MAX_WILD;
  const tries = initial ? 3 : 1;
  for (let k = 0; k < tries && wild < cap; k++) {
    const a = sim.rand() * TAU;
    const dist = initial ? 35 + sim.rand() * 200 : 120 + sim.rand() * 150;
    const x = p.x + Math.cos(a) * dist;
    const z = p.z + Math.sin(a) * dist;
    if (!okSpot(sim, x, z)) continue;
    let type = pickType(sim, x, z);
    const def = WILD[type];
    if (def.kind !== "prey" && hunters >= MAX_HUNTERS) continue;
    // keep the player's own kind rare in the wild (they get recruits & rivals instead)
    if (type === sim.species && sim.rand() < 0.6) continue;
    const n = def.group[0] + Math.floor(sim.rand() * (def.group[1] - def.group[0] + 1));
    const g = groupId++;
    for (let i = 0; i < n; i++) {
      const xx = x + (sim.rand() - 0.5) * 10;
      const zz = z + (sim.rand() - 0.5) * 10;
      if (!okSpot(sim, xx, zz)) continue;
      if (Math.hypot(xx - p.x, zz - p.z) < 30) continue;
      sim.ents.push(makeEntity(sim, type, xx, zz, { group: g }));
      wild++;
      if (def.kind !== "prey") hunters++;
    }
  }
  // fish
  if (fish < MAX_FISH) {
    for (let k = 0; k < 4; k++) {
      const a = sim.rand() * TAU;
      const dist = 25 + sim.rand() * 110;
      const x = p.x + Math.cos(a) * dist;
      const z = p.z + Math.sin(a) * dist;
      if (sim.terrain.height(x, z) < -1.4) {
        const n = 2 + Math.floor(sim.rand() * 2);
        for (let i = 0; i < n; i++) {
          const xx = x + (sim.rand() - 0.5) * 3;
          const zz = z + (sim.rand() - 0.5) * 3;
          if (sim.terrain.height(xx, zz) < -1) sim.ents.push(makeEntity(sim, "fish", xx, zz));
        }
        break;
      }
    }
  }
  // a dangerous visitor while you sleep out in the open at night
  if (!initial && p.sleeping && sim.isNight() && !sim.ownedAt(p.x, p.z) && !p.inCave && sim.rand() < 0.04 * dt) {
    const types = ["wolf", "lion", "tiger", "bear"].filter((t) => WILD[t].power >= sim.k.power * 0.9 && t !== sim.species);
    if (types.length) {
      const t = types[Math.floor(sim.rand() * types.length)];
      const a = sim.rand() * TAU;
      const pos = sim.findDry(p.x + Math.cos(a) * 60, p.z + Math.sin(a) * 60);
      const e = makeEntity(sim, t, pos.x, pos.z);
      e.ambusher = true;
      e.state = "fight";
      e.target = "player";
      sim.ents.push(e);
    }
  }
  // recruits / potential mates
  const fam = SPECIES[sim.species].family;
  sim.recruitTimer -= dt;
  if (sim.recruit && (sim.recruit.gone || sim.recruit.dead || sim.recruit.role !== "recruit")) sim.recruit = null;
  if (sim.recruit && Math.hypot(sim.recruit.x - p.x, sim.recruit.z - p.z) > 330) {
    sim.recruit.gone = true;
    sim.recruit = null;
  }
  const minLvl = fam.mate ? 3 : 2;
  if (!sim.recruit && fam.recruit && sim.recruitTimer <= 0 && A.level >= minLvl && sim.familyRoom() && !p.dead) {
    sim.recruitTimer = 40 + sim.rand() * 40;
    const owned = TERRITORIES.filter((t) => A.owned.includes(t.id) && Math.hypot(t.x - p.x, t.z - p.z) < 300);
    let x;
    let z;
    if (owned.length && sim.rand() < 0.75) {
      const T = owned[Math.floor(sim.rand() * owned.length)];
      x = T.x + (sim.rand() - 0.5) * T.r;
      z = T.z + (sim.rand() - 0.5) * T.r;
    } else {
      const a = sim.rand() * TAU;
      x = p.x + Math.cos(a) * (60 + sim.rand() * 60);
      z = p.z + Math.sin(a) * (60 + sim.rand() * 60);
    }
    const pos = sim.findDry(x, z);
    const e = makeEntity(sim, sim.species, pos.x, pos.z, { role: "recruit" });
    if (sim.species === "eagle") {
      e.flying = true;
      e.y = sim.terrain.surface(pos.x, pos.z) + 10;
    }
    sim.ents.push(e);
    sim.recruit = e;
    sim.emit("recruitNear", { name: e.name, mate: fam.mate && !sim.hasMate() });
  }
  // homecoming companions
  for (const f of A.family) {
    if (f.home && (f.homeUntil == null || sim.t > f.homeUntil || sim.ownedAt(p.x, p.z))) {
      f.home = false;
      f.hp = Math.max(f.hp, 0.6);
    }
  }
}

/** Make sure every family member that should be with you has an entity. */
export function syncFamily(sim, force) {
  const A = sim.A;
  const p = sim.player;
  let slotA = 0;
  let slotC = 0;
  for (const f of A.family) {
    let e = sim.ents.find((x) => x.famId === f.id && !x.gone);
    if (e && e.dead) continue;
    if (f.home) {
      if (e) e.gone = true;
      continue;
    }
    const cub = f.role === "cub";
    if (sim.species === "eagle" && cub) {
      const T = A.nest ? TERRITORIES.find((t) => t.id === A.nest.t) : null;
      if (!T || Math.hypot(T.x - p.x, T.z - p.z) > 260) {
        if (e) e.gone = true;
        continue;
      }
    }
    if (!e) {
      const a = p.yaw + Math.PI + (sim.rand() - 0.5) * 1.2;
      const dd = force ? 4 + sim.rand() * 3 : 18;
      const pos = sim.findDry(p.x + Math.sin(a) * dd, p.z + Math.cos(a) * dd);
      e = makeEntity(sim, sim.species, pos.x, pos.z, { role: "companion", famId: f.id, famRole: f.role, cub, growth: f.growth, name: f.name });
      e.hp = Math.max(1, e.maxHp * (f.hp || 1));
      e.state = "follow";
      if (sim.species === "eagle" && !cub) {
        e.flying = p.mode === "air";
        e.y = p.mode === "air" ? p.y : sim.terrain.height(pos.x, pos.z);
      }
      sim.ents.push(e);
    }
    if (cub) {
      const s = 0.42 + 0.35 * f.growth;
      if (Math.abs(e.scale - s) > 0.01) {
        e.scale = s;
        e.r = e.def.r * s;
        e.h = e.def.h * s;
      }
      e.slot = slotC++;
    } else e.slot = slotA++;
  }
  // remove entities whose family entry vanished
  for (const e of sim.ents) if (e.role === "companion" && !A.family.some((f) => f.id === e.famId)) e.gone = true;
}
export function placeFamilyNear(sim) {
  const p = sim.player;
  for (const e of sim.ents) {
    if (e.role !== "companion" || e.dead || (sim.species === "eagle" && e.cub)) continue;
    const a = p.yaw + Math.PI + (sim.rand() - 0.5);
    const pos = sim.findDry(p.x + Math.sin(a) * 5, p.z + Math.cos(a) * 5);
    e.x = pos.x;
    e.z = pos.z;
    e.y = sim.terrain.height(e.x, e.z);
    e.target = null;
    e.state = "follow";
  }
}
