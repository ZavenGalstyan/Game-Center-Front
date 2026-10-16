/**
 * Tank Warfare 3D — the simulation (pure JS, fixed step, runs in Node).
 *
 * One Sim = one mission / survival run / training session. `step(input, dt)`
 * advances everything: vehicle physics on the terrain, independent turret
 * traverse and gun elevation with a ballistic solve, ballistic shells with
 * swept (segment) collision against terrain, obstacles, wrecks, structures and
 * tank hit boxes, the armour/damage model, destructible props, smoke screens,
 * the enemy/ally AI (ai.js) and the mission state machine.
 *
 * The renderer only reads: tanks, shells, smokes, structs, obAlive, fx[]
 * (drained by the renderer) and events[] (drained by the UI/audio).
 */
import { buildMap, BOUND, rng, toLocal } from "./map.js";
import { AMMO, AMMO_ORDER, UNITS, LOOKS, STRUCTURES, DESTRUCT, DIFFICULTY, G, MISSIONS, SURVIVAL, TRAINING, survivalWave, tankStats } from "./data.js";
import { createBrain, thinkAI, aiNotifyHit } from "./ai.js";

const TAU = Math.PI * 2;
export const wrapPi = (a) => {
  a = (a + Math.PI) % TAU;
  if (a < 0) a += TAU;
  return a - Math.PI;
};
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const ELEV_MIN = -0.2;
export const ELEV_MAX = 0.34;
const SHELL_LIFE = 6;

/** Gun elevation that lands a shell of speed v on a point `d` metres away and `dy` higher. */
export function solveElev(d, dy, v) {
  const v2 = v * v;
  const disc = v2 * v2 - G * (G * d * d + 2 * dy * v2);
  if (disc < 0) return ELEV_MAX;
  return Math.atan2(v2 - Math.sqrt(disc), G * Math.max(0.5, d));
}

/* ------------------------------------------------------------------ geometry tests */
/** Segment p0→p1 vs AABB in local coords. Returns entry t ∈ [0,1] and axis, or null. */
function segAabb(ox, oy, oz, dx, dy, dz, minx, miny, minz, maxx, maxy, maxz) {
  let t0 = 0;
  let t1 = 1;
  let axis = -1;
  let sign = 0;
  const o = [ox, oy, oz];
  const d = [dx, dy, dz];
  const mn = [minx, miny, minz];
  const mx = [maxx, maxy, maxz];
  for (let k = 0; k < 3; k++) {
    if (Math.abs(d[k]) < 1e-9) {
      if (o[k] < mn[k] || o[k] > mx[k]) return null;
      continue;
    }
    const inv = 1 / d[k];
    let ta = (mn[k] - o[k]) * inv;
    let tb = (mx[k] - o[k]) * inv;
    let s = -1;
    if (ta > tb) {
      const tmp = ta;
      ta = tb;
      tb = tmp;
      s = 1;
    }
    if (ta > t0) {
      t0 = ta;
      axis = k;
      sign = s;
    }
    if (tb < t1) t1 = tb;
    if (t0 > t1) return null;
  }
  return { t: t0, axis, sign };
}
/** Segment vs vertical cylinder (centre x,z radius r, y0..y1). */
function segCyl(px, py, pz, dx, dy, dz, cx, cz, r, y0, y1) {
  const fx = px - cx;
  const fz = pz - cz;
  const a = dx * dx + dz * dz;
  const b = 2 * (fx * dx + fz * dz);
  const c = fx * fx + fz * fz - r * r;
  let t;
  if (c <= 0) t = 0;
  else {
    if (a < 1e-9) return null;
    const disc = b * b - 4 * a * c;
    if (disc < 0) return null;
    t = (-b - Math.sqrt(disc)) / (2 * a);
    if (t < 0 || t > 1) return null;
  }
  const y = py + dy * t;
  if (y >= y0 && y <= y1) return t;
  // could still enter through the top cap
  if (py > y1 && py + dy < y1 && dy < 0) {
    const tc = (y1 - py) / dy;
    const qx = fx + dx * tc;
    const qz = fz + dz * tc;
    if (qx * qx + qz * qz <= r * r && tc >= 0 && tc <= 1) return tc;
  }
  return null;
}
function segSphere(px, py, pz, dx, dy, dz, cx, cy, cz, r) {
  const fx = px - cx;
  const fy = py - cy;
  const fz = pz - cz;
  const a = dx * dx + dy * dy + dz * dz;
  const b = 2 * (fx * dx + fy * dy + fz * dz);
  const c = fx * fx + fy * fy + fz * fz - r * r;
  if (c <= 0) return true;
  const disc = b * b - 4 * a * c;
  if (disc < 0) return false;
  const s = Math.sqrt(disc);
  const t1 = (-b - s) / (2 * a);
  const t2 = (-b + s) / (2 * a);
  return (t1 >= 0 && t1 <= 1) || (t2 >= 0 && t2 <= 1);
}

/* ================================================================== Sim */
export class Sim {
  /**
   * @param {object} o
   *  mode: 'campaign' | 'survival' | 'training'
   *  mission: campaign mission id; world: survival world
   *  tank: player tank id; up: upgrade levels for it
   *  difficulty: 'easy' | 'medium' | 'hard'; seed; god (tests)
   */
  constructor(o = {}) {
    this.mode = o.mode || "campaign";
    this.def = this.mode === "campaign" ? MISSIONS.find((m) => m.id === o.mission) || MISSIONS[0] : null;
    this.world = this.mode === "campaign" ? this.def.world : this.mode === "training" ? TRAINING.world : o.world || "desert";
    this.map = buildMap(this.world);
    this.diff = DIFFICULTY[o.difficulty] || DIFFICULTY.medium;
    this.rand = rng(o.seed ?? 12345);
    this.god = !!o.god;
    this.t = 0;
    this.nextId = 1;
    this.tanks = [];
    this.shells = [];
    this.smokes = [];
    this.structs = [];
    this.events = [];
    this.fx = [];
    this.markersOut = [];
    this.result = null;
    this.endT = 0;
    this.obAlive = new Uint8Array(this.map.obstacles.length).fill(1);
    this.obHp = new Float32Array(this.map.obstacles.length);
    for (const ob of this.map.obstacles) if (ob.destruct) this.obHp[ob.i] = DESTRUCT[ob.destruct].hp;
    this.wrecks = [];
    this.stats = { kills: 0, shots: 0, hits: 0, dmgDealt: 0, dmgTaken: 0, destroyed: 0 };
    this.tmpList = [];
    this.spotT = 0;
    this.warnT = 0;
    this.escaped = 0;
    this.wave = 0;

    const tankId = o.tank || "fox";
    const st = tankStats(tankId, o.up || {});
    const start = this.mode === "campaign" ? this.def.start : this.mode === "training" ? TRAINING.start : SURVIVAL.starts[this.world];
    const [sx, sz] = this.map.nav.nearestFree(start[0], start[1]);
    this.player = this.addTank({ side: "player", look: tankId, st, x: sx, z: sz, heading: start[2] || 0 });
    this.player.ammo = { ap: AMMO.ap.count, he: AMMO.he.count, smoke: AMMO.smoke.count };
    this.player.kits = st.kits;
    this.player.name = st.name;
    this.playerTankId = tankId;

    if (this.mode === "campaign") {
      for (const a of this.def.allies || []) this.spawnUnit(a.type, a.at[0], a.at[1], { side: "ally", order: a.order, zone: a.zone, heading: start[2] || 0 });
      this.stageIdx = -1;
      this.nextStage();
    } else if (this.mode === "survival") {
      this.waveT = 3;
      this.waveActive = false;
      this.stage = { def: { type: "survival", label: "Survive the endless assault" }, t: 0, units: [] };
    } else {
      this.taskIdx = -1;
      this.stage = { def: { type: "training", label: "" }, t: 0, units: [] };
      this.nextTask();
    }
  }

  /* ------------------------------------------------------------ entities */
  addTank({ side, look, st, x, z, heading = 0, type = null, name = null }) {
    const L = LOOKS[look] || LOOKS.fox;
    const sc = st.scale || 1;
    const t = {
      id: this.nextId++,
      side,
      look,
      type: type || look,
      name: name || st.name,
      st,
      L,
      scale: sc,
      x,
      z,
      y: this.map.groundAt(x, z),
      heading,
      speed: 0,
      angVel: 0,
      accel: 0,
      pitch: 0,
      roll: 0,
      vx: 0,
      vz: 0,
      tLocal: 0, // turret yaw relative to the hull
      elev: 0,
      aimYaw: heading,
      aimElev: 0,
      reload: 0,
      reloadMax: st.reload,
      ammoSel: "ap",
      loaded: "ap",
      ammo: { ap: 9999, he: 9999, smoke: 0 },
      kits: 0,
      kitCd: 0,
      hp: st.hp,
      maxHp: st.hp,
      alive: true,
      deadT: 0,
      comp: { tracks: 0, turret: 0, engine: 0 },
      boost: 1,
      boosting: false,
      bloom: st.dispersion || 0.01,
      fireT: 9,
      hitT: 9,
      dmgTaken: 0,
      lastAttacker: null,
      trackL: 0,
      trackR: 0,
      turretMoving: 0,
      spotted: side !== "enemy",
      spotT: 0,
      revealT: 0,
      hidden: false,
      unarmed: !!st.unarmed,
      crit: false,
      brain: null,
    };
    this.tanks.push(t);
    return t;
  }

  /** Spawn an NPC unit of `type` near (x,z). */
  spawnUnit(type, x, z, o = {}) {
    const U = UNITS[type];
    if (!U) return null;
    const st = { ...U, hp: o.hp || U.hp, dispersion: 0.008, kits: 0, boost: 1, scale: o.scale || 1 };
    const [fx, fz] = this.map.nav.nearestFree(x, z);
    const side = o.side || (type === "convoy" || type === "ally" ? "ally" : "enemy");
    const heading = o.heading ?? Math.atan2(this.player ? this.player.x - fx : 0, this.player ? this.player.z - fz : 1);
    const t = this.addTank({ side, look: U.look, st, x: fx, z: fz, heading, type, name: o.name || U.name });
    t.boss = !!o.boss;
    t.hidden = !!o.hidden;
    t.aimYaw = heading;
    t.brain = createBrain(this, t, o);
    t.stageTag = o.tag ?? null;
    return t;
  }

  /** Spawn a data-defined group; returns the units. */
  spawnGroup(g, tag) {
    const out = [];
    const n = g.n || 1;
    for (let k = 0; k < n; k++) {
      let x = g.at[0];
      let z = g.at[1];
      if (g.spread && n > 1) {
        const ang = (k / n) * TAU + this.rand() * 0.6;
        x += Math.cos(ang) * g.spread * (0.5 + this.rand() * 0.5);
        z += Math.sin(ang) * g.spread * (0.5 + this.rand() * 0.5);
      }
      if (g.route === "road" && g.gap) {
        // trucks queue up along the road behind the first one
        const pts = this.map.roads[0].pts;
        const p = pointAlong(pts.slice().reverse(), 18 + k * g.gap);
        x = p[0];
        z = p[1];
      }
      // keep units apart
      for (let tries = 0; tries < 6; tries++) {
        const clash = this.tanks.some((o) => o.alive && Math.hypot(o.x - x, o.z - z) < 7.5);
        if (!clash) break;
        x += (this.rand() - 0.5) * 12;
        z += (this.rand() - 0.5) * 12;
      }
      const u = this.spawnUnit(g.type, x, z, { ...g, tag });
      if (u) out.push(u);
    }
    return out;
  }

  addStruct(kind, x, z, a = 0) {
    const S = STRUCTURES[kind];
    const g = this.map.groundAt(x, z);
    const s = {
      id: this.nextId++,
      kind,
      name: S.name,
      x,
      z,
      hx: S.hx,
      hz: S.hz,
      a,
      c: Math.cos(a),
      s: Math.sin(a),
      y0: g - 0.5,
      y1: g + S.h,
      base: g,
      hp: S.hp,
      maxHp: S.hp,
      alive: true,
      friendly: !!S.friendly,
      r: Math.hypot(S.hx, S.hz),
    };
    this.structs.push(s);
    return s;
  }

  ev(type, o = {}) {
    this.events.push({ type, ...o });
  }
  emit(type, x, y, z, o = {}) {
    if (this.fx.length < 400) this.fx.push({ type, x, y, z, ...o });
  }

  /* ------------------------------------------------------------ world queries */
  muzzle(t, out = {}) {
    const L = t.L;
    const s = t.scale;
    const yaw = t.heading + t.tLocal;
    const ce = Math.cos(t.elev);
    // turret pivot (hull-relative tz offset)
    const px = t.x + Math.sin(t.heading) * L.tz * s;
    const pz = t.z + Math.cos(t.heading) * L.tz * s;
    const py = t.y + L.ty * s;
    out.px = px;
    out.py = py;
    out.pz = pz;
    out.dx = Math.sin(yaw) * ce;
    out.dy = Math.sin(t.elev);
    out.dz = Math.cos(yaw) * ce;
    const b = L.barrel * s;
    out.x = px + out.dx * b;
    out.y = py + out.dy * b + 0.12;
    out.z = pz + out.dz * b;
    return out;
  }

  /** Is the point inside any smoke cloud? */
  inSmoke(x, y, z) {
    for (const c of this.smokes) if ((x - c.x) ** 2 + (y - c.y) ** 2 + (z - c.z) ** 2 < c.r * c.r * 0.7) return true;
    return false;
  }

  /**
   * Swept collision of the segment a→b (a + d·t, t∈[0,1]).
   * Returns the earliest hit {t,x,y,z,kind,ref,face,nx,ny,nz} or null.
   * opts: ignore (tank), side (shells skip tanks of that side), tanks (bool),
   *       terrain (bool), smoke (bool → smoke blocks, used for line of sight)
   */
  segCast(ax, ay, az, bx, by, bz, opts = {}) {
    const dx = bx - ax;
    const dy = by - ay;
    const dz = bz - az;
    let best = null;
    const take = (t, kind, ref, extra) => {
      if (best && t >= best.t) return;
      best = { t, kind, ref, ...extra };
    };
    const map = this.map;
    // terrain (and bridge decks via groundAt)
    if (opts.terrain !== false) {
      const len = Math.hypot(dx, dz) + Math.abs(dy);
      const n = Math.max(1, Math.ceil(len / 1.25));
      let prevT = 0;
      if (ay < map.groundAt(ax, az) - 0.05) take(0, "terrain", null);
      else {
        for (let k = 1; k <= n; k++) {
          const t = k / n;
          const x = ax + dx * t;
          const y = ay + dy * t;
          const z = az + dz * t;
          let gy = map.groundAt(x, z);
          if (map.water != null) gy = Math.max(gy, map.water);
          if (y < gy) {
            let lo = prevT;
            let hi = t;
            for (let it = 0; it < 7; it++) {
              const m = (lo + hi) / 2;
              const gx = ax + dx * m;
              const gz = az + dz * m;
              let gg = map.groundAt(gx, gz);
              if (map.water != null) gg = Math.max(gg, map.water);
              if (ay + dy * m < gg) hi = m;
              else lo = m;
            }
            const hx = ax + dx * hi;
            const hz = az + dz * hi;
            const water = map.water != null && map.groundAt(hx, hz) < map.water;
            take(hi, water ? "water" : "terrain", null);
            break;
          }
          prevT = t;
        }
      }
    }
    // static obstacles
    const pad = 0.5;
    const list = map.query(Math.min(ax, bx) - pad, Math.min(az, bz) - pad, Math.max(ax, bx) + pad, Math.max(az, bz) + pad, this.tmpList);
    for (const o of list) {
      if (!this.obAlive[o.i]) continue;
      // shells pass through foliage; trees only conceal over longer sight lines
      if (o.kind === "tree" && !opts.trees) continue;
      if (Math.max(ay, by) < o.y0 || Math.min(ay, by) > o.y1) continue;
      if (o.shape === "cyl") {
        const r = o.kind === "tree" ? o.r : o.r * 0.92;
        const t = segCyl(ax, ay, az, dx, dy, dz, o.x, o.z, r, o.y0, o.y1);
        if (t != null) take(t, "obstacle", o);
      } else {
        const [lx, lz] = toLocal(o, ax, az);
        const ldx = dx * o.c - dz * o.s;
        const ldz = dx * o.s + dz * o.c;
        const h = segAabb(lx, ay, lz, ldx, dy, ldz, -o.hx, o.y0, -o.hz, o.hx, o.y1, o.hz);
        if (h) take(h.t, "obstacle", o);
      }
    }
    // wrecks
    for (const w of this.wrecks) {
      const t = segCyl(ax, ay, az, dx, dy, dz, w.x, w.z, w.r, w.y0, w.y1);
      if (t != null) take(t, "wreck", w);
    }
    // structures
    for (const s of this.structs) {
      if (!s.alive) continue;
      const [lx, lz] = toLocal(s, ax, az);
      const ldx = dx * s.c - dz * s.s;
      const ldz = dx * s.s + dz * s.c;
      const h = segAabb(lx, ay, lz, ldx, dy, ldz, -s.hx, s.y0, -s.hz, s.hx, s.y1, s.hz);
      if (h) take(h.t, "struct", s);
    }
    // tanks (hull + turret boxes in the hull frame)
    if (opts.tanks !== false) {
      for (const tk of this.tanks) {
        if (!tk.alive || tk === opts.ignore) continue;
        if (opts.side && tk.side === opts.side) continue;
        if (opts.side === "enemy" && tk.side !== "player" && tk.side !== "ally") continue;
        if ((opts.side === "player" || opts.side === "ally") && tk.side !== "enemy") continue;
        const L = tk.L;
        const s = tk.scale;
        const rr = (L.hz + 1) * s;
        // cheap reject: segment AABB vs the tank's bounding square
        if (Math.max(ax, bx) < tk.x - rr || Math.min(ax, bx) > tk.x + rr || Math.max(az, bz) < tk.z - rr || Math.min(az, bz) > tk.z + rr) continue;
        const c = Math.cos(tk.heading);
        const sn = Math.sin(tk.heading);
        const ox = ax - tk.x;
        const oz = az - tk.z;
        const lx = ox * c - oz * sn;
        const lz = ox * sn + oz * c;
        const ldx = dx * c - dz * sn;
        const ldz = dx * sn + dz * c;
        const oy = ay - tk.y;
        const hull = segAabb(lx, oy, lz, ldx, dy, ldz, -L.hx * s, 0.35 * s, -L.hz * s, L.hx * s, L.top * s, L.hz * s);
        if (hull) {
          let face = "side";
          if (hull.axis === 2) face = hull.sign < 0 ? "rear" : "front";
          else if (hull.axis === 1) face = "side";
          // sign convention: entering the min face (−z) → sign −1 means coming from −z → rear
          take(hull.t, "tank", tk, { face, axis: hull.axis, ldx, ldy: dy, ldz });
        }
        if (L.tr) {
          const tzc = L.tz * s;
          const tur = segAabb(lx, oy, lz - tzc, ldx, dy, ldz, -L.tr * s, L.top * s - 0.05, -L.tr * s, L.tr * s, (L.ty + L.th * 0.6) * s, L.tr * s);
          if (tur) take(tur.t, "tank", tk, { face: "turret", axis: tur.axis, ldx, ldy: dy, ldz });
        }
      }
    }
    // smoke (line of sight only)
    if (opts.smoke) {
      for (const c of this.smokes) {
        if (segSphere(ax, ay, az, dx, dy, dz, c.x, c.y, c.z, c.r * 0.82)) take(0.5, "smoke", c);
      }
    }
    if (best) {
      best.x = ax + dx * best.t;
      best.y = ay + dy * best.t;
      best.z = az + dz * best.t;
    }
    return best;
  }

  /** Long ray (camera aim). Marches in chunks so the broadphase stays small. */
  raycast(ox, oy, oz, dx, dy, dz, maxD = 700, ignore = null) {
    const CH = 30;
    for (let d0 = 0; d0 < maxD; d0 += CH) {
      const d1 = Math.min(maxD, d0 + CH);
      const h = this.segCast(ox + dx * d0, oy + dy * d0, oz + dz * d0, ox + dx * d1, oy + dy * d1, oz + dz * d1, { ignore });
      if (h) {
        h.dist = d0 + (d1 - d0) * h.t;
        return h;
      }
    }
    return null;
  }

  /** Line of sight between two points (terrain, obstacles, smoke; tanks don't block). */
  los(ax, ay, az, bx, by, bz) {
    const far = Math.hypot(bx - ax, bz - az) > 90;
    return !this.segCast(ax, ay, az, bx, by, bz, { tanks: false, smoke: true, trees: far });
  }

  /**
   * Where would a shell fired right now land? Integrates the same ballistic
   * step as live shells. Returns {x,y,z,kind,ref,time} (or the last point).
   */
  predictImpact(t, ammoId = t.loaded) {
    const m = this.muzzle(t, this._mz || (this._mz = {}));
    const v = AMMO[ammoId].speed * (t.st.shellSpeed || 1);
    let x = m.x;
    let y = m.y;
    let z = m.z;
    let vx = m.dx * v;
    let vy = m.dy * v;
    let vz = m.dz * v;
    const dt = 1 / 60;
    const side = t.side === "player" ? "player" : t.side;
    for (let k = 0; k < 60 * 5; k++) {
      vy -= G * dt;
      const nx = x + vx * dt;
      const ny = y + vy * dt;
      const nz = z + vz * dt;
      const h = this.segCast(x, y, z, nx, ny, nz, { ignore: t, side });
      if (h) {
        h.time = k * dt;
        return h;
      }
      x = nx;
      y = ny;
      z = nz;
      if (Math.abs(x) > 340 || Math.abs(z) > 340) break;
    }
    return { x, y, z, kind: "none", time: 5 };
  }

  /* ------------------------------------------------------------ step */
  step(input = {}, dt = 1 / 60) {
    this.t += dt;
    if (this.result) this.endT += dt;
    this.stage && (this.stage.t += dt);
    const p = this.player;
    // player controls
    if (p.alive && !this.result) this.controlPlayer(p, input, dt);
    else if (p.alive) this.driveTank(p, { throttle: 0, steer: 0 }, dt);
    // NPCs
    for (const t of this.tanks) {
      if (t === p) continue;
      if (!t.alive) {
        t.deadT += dt;
        continue;
      }
      const c = this.result && !this.result.win ? { throttle: 0, steer: 0 } : thinkAI(this, t, dt);
      this.driveTank(t, c, dt);
      this.aimAndFire(t, c, dt);
    }
    if (!p.alive) p.deadT += dt;
    this.collideTanks(dt);
    this.updateShells(dt);
    this.updateSmoke(dt);
    this.updateSpotting(dt);
    if (!this.result) {
      if (this.mode === "campaign") this.updateStage(dt);
      else if (this.mode === "survival") this.updateSurvival(dt);
      else this.updateTraining(dt);
      if (!p.alive && !this.result) this.finish(false, "Your tank was destroyed");
    }
    // player warnings
    if (p.alive) {
      const crit = p.hp / p.maxHp < 0.3;
      if (crit && !p.crit) this.ev("critical");
      p.crit = crit;
    }
    // trim old wrecks
    if (this.wrecks.length > 14) this.wrecks.shift();
  }

  controlPlayer(p, inp, dt) {
    // ammo selection
    if (inp.ammo && AMMO[inp.ammo] && inp.ammo !== p.ammoSel) {
      p.ammoSel = inp.ammo;
      if (p.loaded !== inp.ammo) {
        p.loaded = inp.ammo;
        p.reloadMax = p.st.reload * AMMO[inp.ammo].reloadMul * 0.65;
        p.reload = Math.max(p.reload, p.reloadMax);
        this.ev("ammoSwitch", { ammo: inp.ammo });
      }
    }
    // repair kit
    p.kitCd = Math.max(0, p.kitCd - dt);
    if (inp.repair && p.kitCd <= 0) {
      const dmgd = p.hp < p.maxHp - 1 || p.comp.tracks > 0 || p.comp.turret > 0 || p.comp.engine > 0;
      if (p.kits > 0 && dmgd) {
        p.kits--;
        p.kitCd = 2;
        const before = p.hp;
        p.hp = Math.min(p.maxHp, p.hp + p.st.repair);
        p.comp.tracks = p.comp.turret = p.comp.engine = 0;
        this.ev("repair", { amount: p.hp - before, kits: p.kits });
      } else this.ev("repairDenied", { reason: p.kits <= 0 ? "No repair kits left" : "No damage to repair" });
    }
    this.driveTank(p, inp, dt);
    this.aimAndFire(p, inp, dt);
  }

  /* ------------------------------------------------------------ vehicle physics */
  driveTank(t, c, dt) {
    const st = t.st;
    const map = this.map;
    t.hitT += dt;
    for (const k of ["tracks", "turret", "engine"]) if (t.comp[k] > 0) t.comp[k] = Math.max(0, t.comp[k] - dt);
    let maxF = st.maxSpeed * (t.comp.tracks > 0 ? 0.45 : 1) * (t.comp.engine > 0 ? 0.62 : 1);
    let maxR = st.revSpeed * (t.comp.tracks > 0 ? 0.6 : 1);
    let accel = st.accel * (t.comp.engine > 0 ? 0.6 : 1);
    t.boosting = false;
    if (c.boost && t.boost > 0.02 && (c.throttle || 0) > 0.1) {
      t.boosting = true;
      maxF *= st.boost || 1.35;
      accel *= 1.5;
      t.boost = Math.max(0, t.boost - dt / 4);
    } else t.boost = Math.min(1, t.boost + dt / 9);
    const thr = clamp(c.throttle || 0, -1, 1);
    const target = thr > 0 ? thr * maxF : thr < 0 ? thr * maxR : 0;
    const prev = t.speed;
    if (target > t.speed) t.speed = Math.min(target, t.speed + (t.speed < 0 ? accel * 2.4 : accel) * dt);
    else if (target < t.speed) t.speed = Math.max(target, t.speed - (t.speed > 0 ? (thr < 0 ? accel * 2.4 : accel * 1.2) : accel) * dt);
    // gravity along the slope
    t.speed -= G * Math.sin(t.pitch) * 0.5 * dt;
    if (Math.abs(t.speed) > maxF * 1.05 && t.speed > 0) t.speed -= (t.speed - maxF) * 2 * dt;
    t.accel = (t.speed - prev) / dt;
    // turning (neutral steer allowed); car-like steering in reverse.
    // steer +1 = right. Heading grows to the LEFT (forward = (sin h, cos h) in a right-handed frame).
    let steer = clamp(c.steer || 0, -1, 1);
    if (t.speed < -0.5 && thr < 0) steer = -steer;
    const turnMax = st.turn * (t.comp.tracks > 0 ? 0.55 : 1) * (1 - 0.3 * Math.min(1, Math.abs(t.speed) / Math.max(1, st.maxSpeed)));
    const targetW = -steer * turnMax;
    t.angVel += clamp(targetW - t.angVel, -4 * dt, 4 * dt);
    t.heading = wrapPi(t.heading + t.angVel * dt);
    // integrate position
    const sx = Math.sin(t.heading);
    const cz = Math.cos(t.heading);
    const ox = t.x;
    const oz = t.z;
    let nx = t.x + sx * t.speed * dt;
    let nz = t.z + cz * t.speed * dt;
    // terrain limits: water and cliffs block like a wall
    const probe = (x, z) => {
      const g = map.groundAt(x, z);
      if (map.water != null && g < map.water + 0.25) return false;
      const e = 1.6;
      const sl = Math.hypot(map.groundAt(x + e, z) - map.groundAt(x - e, z), map.groundAt(x, z + e) - map.groundAt(x, z - e)) / (2 * e);
      return sl < 0.62;
    };
    const fwd = t.speed >= 0 ? 1 : -1;
    const lead = t.L.hz * t.scale * 0.8 * fwd;
    if (!probe(nx + sx * lead, nz + cz * lead)) {
      nx = ox;
      nz = oz;
      t.speed *= -0.15;
    }
    nx = clamp(nx, -BOUND, BOUND);
    nz = clamp(nz, -BOUND, BOUND);
    t.x = nx;
    t.z = nz;
    // true drive velocity (collision push-outs must not read as speed)
    t.vx = sx * t.speed;
    t.vz = cz * t.speed;
    this.collideStatic(t);
    // track animation distances (left/right differ while turning)
    const half = t.L.hx * t.scale;
    t.trackL += (t.speed - t.angVel * half) * dt;
    t.trackR += (t.speed + t.angVel * half) * dt;
    // ground conform: height, pitch, roll
    const hl = t.L.hz * t.scale * 0.8;
    const hw = t.L.hx * t.scale * 0.85;
    const gF = map.groundAt(t.x + sx * hl, t.z + cz * hl);
    const gB = map.groundAt(t.x - sx * hl, t.z - cz * hl);
    // right = forward × up = (−cos h, 0, sin h)
    const gR = map.groundAt(t.x - cz * hw, t.z + sx * hw);
    const gL = map.groundAt(t.x + cz * hw, t.z - sx * hw);
    const gy = Math.max(map.groundAt(t.x, t.z), (gF + gB + gR + gL) / 4);
    const tp = Math.atan2(gF - gB, hl * 2);
    const tr = Math.atan2(gR - gL, hw * 2);
    const k = Math.min(1, dt * 10);
    t.pitch += (tp - t.pitch) * k;
    t.roll += (tr - t.roll) * k;
    t.y += (gy - t.y) * Math.min(1, dt * 14);
    if (t.y < gy - 0.3) t.y = gy - 0.3;
  }

  /** Push a tank out of static obstacles, wrecks and structures; crush light props. */
  collideStatic(t) {
    const map = this.map;
    const s = t.scale;
    const r = t.L.hx * s * 1.02;
    const off = Math.max(0, t.L.hz * s - r);
    const sx = Math.sin(t.heading);
    const cz = Math.cos(t.heading);
    const list = map.query(t.x - 9, t.z - 9, t.x + 9, t.z + 9, this.tmpList);
    let hitSpeed = 0;
    let totX = 0;
    let totZ = 0;
    for (let pass = 0; pass < 2; pass++) {
      for (const ci of [-1, 0, 1]) {
        let cx = t.x + sx * off * ci;
        let cz2 = t.z + cz * off * ci;
        let pushX = 0;
        let pushZ = 0;
        for (const o of list) {
          if (!this.obAlive[o.i]) continue;
          if (o.y1 < t.y + 0.4) continue; // low enough to drive over
          let px = 0;
          let pz = 0;
          let hit = false;
          if (o.shape === "cyl") {
            const rr = (o.tankR || o.r) + r;
            const dx = cx - o.x;
            const dz = cz2 - o.z;
            const d = Math.hypot(dx, dz);
            if (d < rr) {
              hit = true;
              const n = d > 1e-4 ? 1 / d : 0;
              px = dx * n * (rr - d);
              pz = dz * n * (rr - d);
            }
          } else {
            const [lx, lz] = toLocal(o, cx, cz2);
            const qx = clamp(lx, -o.hx, o.hx);
            const qz = clamp(lz, -o.hz, o.hz);
            let ex = lx - qx;
            let ez = lz - qz;
            let d = Math.hypot(ex, ez);
            if (d < r) {
              hit = true;
              let lpx;
              let lpz;
              if (d < 1e-4) {
                // centre inside the box: push out along the shallowest axis
                const dxp = o.hx - Math.abs(lx);
                const dzp = o.hz - Math.abs(lz);
                if (dxp < dzp) {
                  lpx = Math.sign(lx || 1) * (dxp + r);
                  lpz = 0;
                } else {
                  lpx = 0;
                  lpz = Math.sign(lz || 1) * (dzp + r);
                }
              } else {
                lpx = (ex / d) * (r - d);
                lpz = (ez / d) * (r - d);
              }
              // local → world (rotation only)
              px = lpx * o.c + lpz * o.s;
              pz = -lpx * o.s + lpz * o.c;
            }
          }
          if (!hit) continue;
          if (o.destruct && DESTRUCT[o.destruct].crush && Math.abs(t.speed) > 1.5) {
            this.destroyObstacle(o, t);
            t.speed *= 0.92;
            continue;
          }
          pushX += px;
          pushZ += pz;
          hitSpeed = Math.max(hitSpeed, Math.abs(t.speed));
        }
        // wrecks and structures (dynamic)
        for (const w of this.wrecks) {
          const rr = w.r + r;
          const dx = cx - w.x;
          const dz = cz2 - w.z;
          const d = Math.hypot(dx, dz);
          if (d < rr && d > 1e-4) {
            // wrecks are heavy but can be shoved aside, so a dead tank never seals a street
            const over = rr - d;
            pushX += (dx / d) * over * 0.65;
            pushZ += (dz / d) * over * 0.65;
            const mx = -(dx / d) * over * 0.35;
            const mz = -(dz / d) * over * 0.35;
            const nwx = w.x + mx;
            const nwz = w.z + mz;
            if (map.nav.walkable(nwx, nwz) || !map.nav.walkable(w.x, w.z)) {
              w.x = nwx;
              w.z = nwz;
              if (w.tank) {
                w.tank.x = nwx;
                w.tank.z = nwz;
              }
            }
            hitSpeed = Math.max(hitSpeed, Math.abs(t.speed) * 0.3);
          }
        }
        for (const st of this.structs) {
          if (!st.alive) continue;
          const [lx, lz] = toLocal(st, cx, cz2);
          const qx = clamp(lx, -st.hx, st.hx);
          const qz = clamp(lz, -st.hz, st.hz);
          const ex = lx - qx;
          const ez = lz - qz;
          const d = Math.hypot(ex, ez);
          if (d < r && d > 1e-4) {
            const lpx = (ex / d) * (r - d);
            const lpz = (ez / d) * (r - d);
            pushX += lpx * st.c + lpz * st.s;
            pushZ += -lpx * st.s + lpz * st.c;
          }
        }
        if (pushX || pushZ) {
          totX += pushX;
          totZ += pushZ;
          t.x += pushX;
          t.z += pushZ;
          cx += pushX;
          cz2 += pushZ;
        }
      }
    }
    t.collT = Math.max(0, (t.collT || 0) - 1 / 60);
    const tl = Math.hypot(totX, totZ);
    if (hitSpeed > 0 && tl > 1e-5) {
      // impact speed = velocity component into the contact normal
      const nx = totX / tl;
      const nz = totZ / tl;
      const vn = -(sx * t.speed * nx + cz * t.speed * nz);
      if (vn > 0) {
        if (vn > 9 && t.collT <= 0) {
          this.damage(t, (vn - 9) * 1.4, { kind: "collision" });
          t.collT = 1;
          this.emit("sparks", t.x - nx * t.L.hz, t.y + 0.8, t.z - nz * t.L.hz, { s: 0.7 });
          this.ev("crash", { tank: t, v: vn });
        }
        if (vn > 4) this.emit("dust", t.x - nx * t.L.hz, t.y + 0.6, t.z - nz * t.L.hz, { s: 0.8 });
        // head-on stops the tank; glancing contact only scrubs a little speed
        t.speed *= 1 - 0.85 * Math.min(1, vn / Math.max(0.5, Math.abs(t.speed)));
      }
    }
  }

  collideTanks() {
    const list = this.tanks;
    for (let i = 0; i < list.length; i++) {
      const a = list[i];
      if (!a.alive) continue;
      for (let j = i + 1; j < list.length; j++) {
        const b = list[j];
        if (!b.alive) continue;
        const dx = b.x - a.x;
        const dz = b.z - a.z;
        const ra = (a.L.hx + a.L.hz) * 0.55 * a.scale;
        const rb = (b.L.hx + b.L.hz) * 0.55 * b.scale;
        const rr = ra + rb;
        const d2 = dx * dx + dz * dz;
        if (d2 >= rr * rr) continue;
        const d = Math.sqrt(d2) || 0.01;
        const over = rr - d;
        const nx = dx / d;
        const nz = dz / d;
        // heavier tank moves less
        const ma = a.maxHp;
        const mb = b.maxHp;
        const wa = mb / (ma + mb);
        a.x -= nx * over * wa;
        a.z -= nz * over * wa;
        b.x += nx * over * (1 - wa);
        b.z += nz * over * (1 - wa);
        const rel = Math.abs((b.vx - a.vx) * nx + (b.vz - a.vz) * nz);
        if (rel > 6) {
          const dmg = (rel - 6) * 2.4;
          this.damage(a, dmg, { kind: "ram", from: b });
          this.damage(b, dmg, { kind: "ram", from: a });
          this.emit("sparks", (a.x + b.x) / 2, a.y + 1, (a.z + b.z) / 2, { s: 1 });
          this.ev("ram", { a, b });
        }
        a.speed *= 0.9;
        b.speed *= 0.9;
      }
    }
  }

  /* ------------------------------------------------------------ turret, gun, firing */
  aimAndFire(t, c, dt) {
    if (!t.L.tr) return; // trucks / dummies have no turret
    const st = t.st;
    const m = this.muzzle(t, this._m2 || (this._m2 = {}));
    // desired yaw/elevation from the aim point
    if (c.aim) {
      const dx = c.aim.x - m.px;
      const dz = c.aim.z - m.pz;
      const d = Math.hypot(dx, dz);
      if (d > 2) {
        t.aimYaw = Math.atan2(dx, dz);
        const v = AMMO[t.loaded].speed * (st.shellSpeed || 1);
        t.aimElev = solveElev(Math.max(1, d - t.L.barrel * t.scale * 0.6), c.aim.y - m.py, v);
      }
    }
    const trav = st.traverse * (t.comp.turret > 0 ? 0.35 : 1);
    const want = wrapPi(t.aimYaw - t.heading);
    const dl = wrapPi(want - t.tLocal);
    const stepY = clamp(dl, -trav * dt, trav * dt);
    t.tLocal = wrapPi(t.tLocal + stepY);
    t.turretMoving = Math.abs(stepY) / Math.max(1e-6, trav * dt);
    // elevation limits follow the hull's pitch along the gun
    const along = t.pitch * Math.cos(t.tLocal) - t.roll * Math.sin(t.tLocal);
    const lo = along + ELEV_MIN;
    const hi = along + ELEV_MAX;
    const we = clamp(t.aimElev, lo, hi);
    const de = we - t.elev;
    t.elev += clamp(de, -st.elevRate * dt, st.elevRate * dt);
    t.elev = clamp(t.elev, lo, hi);
    // dispersion bloom
    const base = st.dispersion || 0.008;
    const moveF = Math.min(1, Math.abs(t.speed) / Math.max(1, st.maxSpeed));
    const turnF = Math.min(1, Math.abs(t.angVel) / Math.max(0.1, st.turn));
    const bt = base * (1 + 2.6 * moveF + 1.4 * turnF + 1.1 * t.turretMoving);
    if (bt > t.bloom) t.bloom += (bt - t.bloom) * Math.min(1, dt * 6);
    else t.bloom += (bt - t.bloom) * Math.min(1, dt * (st.targeting ? 2.6 : 1.5));
    // reload
    t.fireT += dt;
    if (t.reload > 0) {
      t.reload = Math.max(0, t.reload - dt);
      if (t.reload === 0 && t.side === "player") this.ev("reloaded", { ammo: t.loaded });
    }
    if (c.fire && t.reload <= 0) {
      if ((t.ammo[t.loaded] || 0) <= 0) {
        if (t.side === "player" && !t.emptyWarned) {
          this.ev("empty", { ammo: t.loaded });
          t.emptyWarned = true;
          // auto-load the other lethal round so the gun never sits idle
          const alt = t.loaded === "ap" ? "he" : t.loaded === "he" ? "ap" : null;
          if (alt && t.ammo[alt] > 0) {
            t.ammoSel = t.loaded = alt;
            t.reloadMax = t.st.reload * AMMO[alt].reloadMul * 0.65;
            t.reload = t.reloadMax;
            t.emptyWarned = false;
            this.ev("ammoSwitch", { ammo: alt, auto: true });
          }
        }
        return;
      }
      t.emptyWarned = false;
      this.fire(t, m);
    }
  }

  fire(t, m) {
    const A = AMMO[t.loaded];
    t.ammo[t.loaded]--;
    t.reloadMax = t.st.reload * A.reloadMul * (t.enraged ? 0.72 : 1) * (t.side === "enemy" ? this.diff.fireMul : 1);
    t.reload = t.reloadMax;
    t.fireT = 0;
    t.shots = (t.shots || 0) + 1;
    // dispersion: random point in a cone of radius `bloom`
    const ang = this.rand() * TAU;
    const rad = Math.sqrt(this.rand()) * t.bloom;
    const yaw = t.heading + t.tLocal + Math.cos(ang) * rad;
    const el = t.elev + Math.sin(ang) * rad;
    const v = A.speed * (t.st.shellSpeed || 1);
    const ce = Math.cos(el);
    const sh = {
      id: this.nextId++,
      owner: t,
      side: t.side,
      ammo: A.id,
      x: m.x,
      y: m.y,
      z: m.z,
      px: m.x,
      py: m.y,
      pz: m.z,
      vx: Math.sin(yaw) * ce * v + t.vx * 0.5,
      vy: Math.sin(el) * v,
      vz: Math.cos(yaw) * ce * v + t.vz * 0.5,
      dmg: t.st.dmg * (t.side === "enemy" ? this.diff.dmgMul : 1),
      life: SHELL_LIFE,
      age: 0,
    };
    this.shells.push(sh);
    t.bloom += (t.st.dispersion || 0.008) * 1.6;
    if (t.brain) {
      // AI ranging: each shot at the same target brackets in; re-roll the error
      t.brain.ranging = (t.brain.ranging || 0) + 1;
      t.brain.errT = 0;
    }
    if (t.side === "player") {
      this.stats.shots++;
      if (this.mode === "training" && A.id === "smoke" && this.stage) this.stage.smoked = true;
    }
    this.emit("muzzle", m.x, m.y, m.z, { dx: m.dx, dy: m.dy, dz: m.dz, s: t.scale * (t.L.barrel / 4.6), ammo: A.id });
    this.ev("fire", { tank: t, ammo: A.id, x: m.x, y: m.y, z: m.z });
    if (t.revealT !== undefined) t.revealT = 6;
  }

  /* ------------------------------------------------------------ shells */
  updateShells(dt) {
    const out = [];
    for (const s of this.shells) {
      s.age += dt;
      s.life -= dt;
      s.px = s.x;
      s.py = s.y;
      s.pz = s.z;
      s.vy -= G * dt;
      const nx = s.x + s.vx * dt;
      const ny = s.y + s.vy * dt;
      const nz = s.z + s.vz * dt;
      const hit = this.segCast(s.x, s.y, s.z, nx, ny, nz, { ignore: s.owner, side: s.side });
      if (hit) {
        s.x = hit.x;
        s.y = hit.y;
        s.z = hit.z;
        this.impact(s, hit);
        continue;
      }
      s.x = nx;
      s.y = ny;
      s.z = nz;
      if (s.life <= 0 || Math.abs(s.x) > 340 || Math.abs(s.z) > 340 || s.y < -60) continue;
      out.push(s);
    }
    this.shells = out;
  }

  impact(s, hit) {
    const A = AMMO[s.ammo];
    const sp = Math.hypot(s.vx, s.vy, s.vz) || 1;
    const dirx = s.vx / sp;
    const diry = s.vy / sp;
    const dirz = s.vz / sp;
    const byPlayer = s.side === "player";
    if (A.id === "smoke") {
      this.smokes.push({ id: this.nextId++, x: hit.x, y: hit.y + 2.5, z: hit.z, r: 2, maxR: A.cloudR, life: A.cloudLife, max: A.cloudLife, age: 0 });
      this.emit("smokePop", hit.x, hit.y + 1, hit.z, { s: 1 });
      this.ev("smoke", { x: hit.x, z: hit.z, byPlayer });
      return;
    }
    let direct = null;
    if (hit.kind === "tank") {
      direct = hit.ref;
      const tk = hit.ref;
      let face = hit.face;
      // angle of incidence for AP ricochet / effective armour
      let cos = 1;
      if (face !== "turret") {
        const l = Math.hypot(hit.ldx, hit.ldy, hit.ldz) || 1;
        if (hit.axis === 0) cos = Math.abs(hit.ldx) / l;
        else if (hit.axis === 2) cos = Math.abs(hit.ldz) / l;
        else cos = Math.abs(hit.ldy) / l;
      } else cos = 0.85;
      // rear-weak heavies / side-weak TDs
      let mul = 1;
      const weak = tk.st.weak || {};
      if (weak[face]) mul *= weak[face];
      if (weak[A.id]) mul *= weak[A.id];
      if (hit.axis === 1) face = "side"; // roof hits use the side value
      if (A.id === "ap" && cos < 0.18 && !tk.unarmed) {
        this.emit("sparks", hit.x, hit.y, hit.z, { s: 0.8 });
        this.ev("ricochet", { target: tk, byPlayer, x: hit.x, y: hit.y, z: hit.z });
        return;
      }
      const armor = (tk.st.armor && tk.st.armor[face]) || 0.1;
      const eff = Math.min(0.88, (armor * A.armorUse) / Math.max(0.55, Math.sqrt(cos)));
      const dmg = s.dmg * A.dmgMul * (1 - eff) * mul * (0.92 + this.rand() * 0.16);
      this.damage(tk, dmg, { kind: "shell", from: s.owner, ammo: A.id, face, x: hit.x, y: hit.y, z: hit.z, dirx, dirz });
      this.emit(A.id === "he" ? "explosion" : "hitMetal", hit.x, hit.y, hit.z, { s: A.id === "he" ? 1.1 : 1, dirx: -dirx, diry: -diry, dirz: -dirz });
      if (byPlayer) this.stats.hits++;
      // component damage on solid hits
      if (dmg > 8 && tk.alive) {
        const r = this.rand();
        const low = hit.y - tk.y < 0.95 * tk.scale;
        let comp = null;
        if (face === "turret" && r < 0.28) comp = "turret";
        else if (face === "rear" && r < 0.32) comp = "engine";
        else if (low && face !== "turret" && r < 0.22) comp = "tracks";
        else if (r < 0.05) comp = "engine";
        if (comp && !tk.unarmed) {
          tk.comp[comp] = comp === "engine" ? 7 : 5;
          this.ev("component", { target: tk, comp, byPlayer });
        }
      }
    } else if (hit.kind === "obstacle") {
      const o = hit.ref;
      if (o.destruct) {
        this.obHp[o.i] -= s.dmg * (A.id === "he" ? 1.5 : 1);
        if (this.obHp[o.i] <= 0) this.destroyObstacle(o, s.owner);
      }
      const big = o.kind === "building" || o.kind === "factory" || o.kind === "silo";
      this.emit(A.id === "he" ? "explosion" : big || o.kind === "rock" ? "hitStone" : o.kind === "tree" ? "hitWood" : "hitStone", hit.x, hit.y, hit.z, { s: A.id === "he" ? 1 : 0.8, dirx: -dirx, diry: -diry, dirz: -dirz });
    } else if (hit.kind === "struct") {
      const st = hit.ref;
      this.damageStruct(st, s.dmg * A.structMul * (0.92 + this.rand() * 0.16), s.owner);
      this.emit(A.id === "he" ? "explosion" : "hitStone", hit.x, hit.y, hit.z, { s: A.id === "he" ? 1.1 : 0.9 });
      if (byPlayer && !st.friendly) this.stats.hits++;
    } else if (hit.kind === "wreck") {
      this.emit(A.id === "he" ? "explosion" : "hitMetal", hit.x, hit.y, hit.z, { s: 0.8 });
    } else if (hit.kind === "water") {
      this.emit("splash", hit.x, this.map.water, hit.z, { s: A.id === "he" ? 1.3 : 1 });
    } else {
      this.emit(A.id === "he" ? "explosion" : "hitDirt", hit.x, hit.y, hit.z, { s: A.id === "he" ? 1.1 : 0.9 });
    }
    this.ev("impact", { kind: hit.kind, ammo: A.id, x: hit.x, y: hit.y, z: hit.z, byPlayer });
    // splash
    if (A.splashR > 0) this.splash(hit.x, hit.y, hit.z, A.splashR, s.dmg * A.splashMul, s.owner, direct, A.id, A.structMul);
  }

  /** Area damage: tanks (by side), structures and destructible props. */
  splash(x, y, z, R, dmg, from, skip = null, ammoId = "he", structMul = 1) {
    const fromSide = from ? from.side : null;
    for (const t of this.tanks) {
      if (!t.alive || t === skip) continue;
      if (fromSide && fromSide === t.side) continue;
      if (fromSide && fromSide !== "enemy" && t.side !== "enemy") continue;
      const d = Math.hypot(t.x - x, t.y + 1.1 - y, t.z - z) - t.L.hx * t.scale * 0.6;
      if (d >= R) continue;
      const k = 1 - Math.max(0, d) / R;
      const a = t.st.armor ? (t.st.armor.side + t.st.armor.rear) / 2 : 0.1;
      let mul = 1;
      if (t.st.weak?.he && ammoId === "he") mul *= t.st.weak.he;
      this.damage(t, dmg * k * (1 - a * 0.5) * mul, { kind: "splash", from, ammo: ammoId, x, y, z });
    }
    for (const s of this.structs) {
      if (!s.alive) continue;
      const d = Math.hypot(s.x - x, s.z - z) - s.r * 0.7;
      if (d < R) this.damageStruct(s, dmg * structMul * 0.6 * (1 - Math.max(0, d) / R), from);
    }
    const list = this.map.query(x - R, z - R, x + R, z + R, []);
    for (const o of list) {
      if (!o.destruct || !this.obAlive[o.i]) continue;
      const d = Math.hypot(o.x - x, o.z - z) - o.r * 0.5;
      if (d >= R) continue;
      this.obHp[o.i] -= dmg * 1.4 * (1 - Math.max(0, d) / R);
      if (this.obHp[o.i] <= 0) this.destroyObstacle(o, from);
    }
  }

  destroyObstacle(o, by) {
    if (!this.obAlive[o.i]) return;
    this.obAlive[o.i] = 0;
    const D = DESTRUCT[o.destruct];
    this.emit("debris", o.x, o.base + o.h * 0.5, o.z, { n: D.debris, color: D.color, kind: o.destruct, s: o.kind === "tower" ? 1.6 : 1 });
    this.ev("destruct", { ob: o, byPlayer: by?.side === "player" });
    if (by?.side === "player") this.stats.destroyed++;
    if (D.explode) {
      this.emit("explosion", o.x, o.base + 0.8, o.z, { s: 1.2, fire: true });
      this.splash(o.x, o.base + 0.8, o.z, D.explode.r, D.explode.dmg, null, null, "he", 1);
    }
  }

  damageStruct(s, dmg, from) {
    if (!s.alive || dmg <= 0) return;
    if (s.friendly && from && from.side !== "enemy") return; // no friendly fire on the HQ
    s.hp -= dmg;
    s.hitT = 0;
    this.ev("structHit", { struct: s, dmg, byPlayer: from?.side === "player" });
    if (from?.side === "player") this.stats.dmgDealt += Math.min(dmg, s.hp + dmg);
    if (s.hp <= 0) {
      s.hp = 0;
      s.alive = false;
      const S = STRUCTURES[s.kind];
      this.emit("bigExplosion", s.x, s.base + 1.5, s.z, { s: S.explode });
      this.ev("structDestroyed", { struct: s, byPlayer: from?.side === "player" });
    }
  }

  /** Apply damage to a tank. */
  damage(t, dmg, info = {}) {
    if (!t.alive || dmg <= 0) return;
    if (t.side === "player" && this.god) dmg = 0;
    if (t.invuln) dmg = 0;
    const real = Math.min(t.hp, dmg);
    t.hp -= dmg;
    t.hitT = 0;
    t.dmgTaken += real;
    if (info.from) t.lastAttacker = info.from;
    const byPlayer = info.from?.side === "player";
    if (byPlayer && t.side === "enemy") this.stats.dmgDealt += real;
    if (t.side === "player") {
      this.stats.dmgTaken += real;
      let ang = null;
      if (info.from) ang = Math.atan2(info.from.x - t.x, info.from.z - t.z);
      else if (info.x != null) ang = Math.atan2(info.x - t.x, info.z - t.z);
      this.ev("playerHit", { dmg: real, ang, kind: info.kind, ammo: info.ammo });
    } else {
      this.ev("tankHit", { target: t, dmg: real, byPlayer, face: info.face, kind: info.kind });
      if (t.brain) aiNotifyHit(this, t, info.from);
    }
    if (t.hp <= 0) this.kill(t, info.from);
  }

  kill(t, by) {
    t.hp = 0;
    t.alive = false;
    t.deadT = 0;
    t.speed = 0;
    t.angVel = 0;
    const byPlayer = by?.side === "player";
    if (byPlayer && t.side === "enemy") this.stats.kills++;
    this.emit("tankDestroyed", t.x, t.y + 1.2, t.z, { s: t.scale * (t.boss ? 1.6 : 1), id: t.id });
    this.ev("kill", { target: t, byPlayer, by });
    this.wrecks.push({ x: t.x, z: t.z, r: (t.L.hx + t.L.hz) * 0.5 * t.scale, y0: t.y - 0.5, y1: t.y + t.L.top * t.scale, tank: t });
    // a dying tank's ammunition cooks off
    this.splash(t.x, t.y + 1, t.z, 5, 14, null, t, "he", 0.5);
  }

  /* ------------------------------------------------------------ smoke */
  updateSmoke(dt) {
    const out = [];
    for (const c of this.smokes) {
      c.age += dt;
      c.life -= dt;
      c.r = Math.min(c.maxR, c.r + dt * 7);
      if (c.life < 3) c.r *= 1 - dt * 0.05;
      if (c.life > 0) out.push(c);
    }
    this.smokes = out;
  }

  /** Which enemies the player can see (minimap / HUD markers). */
  updateSpotting(dt) {
    this.spotT -= dt;
    for (const t of this.tanks) if (t.revealT > 0) t.revealT -= dt;
    if (this.spotT > 0) return;
    this.spotT = 0.25;
    const p = this.player;
    const py = p.y + p.L.ty * p.scale + 0.3;
    for (const t of this.tanks) {
      if (t.side !== "enemy") continue;
      if (!t.alive) {
        t.spotted = false;
        continue;
      }
      const d = Math.hypot(t.x - p.x, t.z - p.z);
      let vis;
      if (t.hidden && t.revealT <= 0) vis = d < 55;
      else vis = d < 260 && (d < 45 || this.los(p.x, py, p.z, t.x, t.y + t.L.top * t.scale * 0.9, t.z));
      if (!vis && t.revealT > 0 && !t.hidden) vis = d < 300;
      if (!vis && t.hidden && t.revealT > 0) vis = true;
      if (vis) {
        if (!t.spotted && t.wasSpotted !== true) this.ev("spotted", { target: t });
        t.spotT = 4;
        t.spotted = true;
        t.wasSpotted = true;
        if (t.hidden && d < 55) t.revealT = Math.max(t.revealT, 8);
      } else {
        t.spotT -= 0.25;
        if (t.spotT <= 0) t.spotted = false;
      }
    }
  }

  /* ------------------------------------------------------------ results */
  finish(win, reason = "") {
    if (this.result) return;
    const p = this.player;
    this.result = {
      win,
      reason,
      time: this.t,
      kills: this.stats.kills,
      dmgDealt: Math.round(this.stats.dmgDealt),
      dmgTaken: Math.round(this.stats.dmgTaken),
      shots: this.stats.shots,
      hits: this.stats.hits,
      hpLeft: Math.max(0, p.hp / p.maxHp),
      wave: this.wave,
      destroyed: this.stats.destroyed,
      mode: this.mode,
      mission: this.def ? this.def.id : null,
      world: this.world,
    };
    for (const t of this.tanks) if (t.side === "player" || t.side === "ally") t.invuln = true;
    this.ev(win ? "complete" : "failed", { reason });
  }

  enemiesAlive(tag = undefined) {
    let n = 0;
    for (const t of this.tanks) if (t.alive && t.side === "enemy" && (tag === undefined || t.stageTag === tag)) n++;
    return n;
  }

  /* ------------------------------------------------------------ campaign stages */
  nextStage() {
    this.stageIdx++;
    const def = this.def.stages[this.stageIdx];
    if (!def) {
      this.finish(true, "All objectives complete");
      return;
    }
    const tag = this.stageIdx;
    const st = { def, t: 0, tag, units: [], targets: [], waveIdx: 0, hold: 0, cap: 0, escaped: 0, convoy: [], arrived: 0, lost: 0, ambushIdx: 0, bossCalled: false };
    this.stage = st;
    for (const g of def.spawn || []) st.units.push(...this.spawnGroup(g, tag));
    for (const tg of def.targets || []) st.targets.push(this.addStruct(tg.kind, tg.at[0], tg.at[1], tg.a || 0));
    if (def.type === "defendHQ") {
      st.hq = this.addStruct("hq", def.hq[0], def.hq[1], 0);
    }
    if (def.type === "escort") {
      const path = def.convoy.path;
      for (let k = 0; k < def.convoy.n; k++) {
        const back = pointAlong(path, Math.max(0, 0)) ;
        const u = this.spawnUnit("convoy", back[0], back[1] - k * 13, { side: "ally", order: "convoy", path, slot: k, heading: 0 });
        st.convoy.push(u);
      }
    }
    if (def.type === "destroy" && !(def.spawn || []).length) {
      // "clear the remaining" stages adopt the previous survivors
      for (const t of this.tanks) if (t.alive && t.side === "enemy") {
        t.stageTag = tag;
        if (t.brain) t.brain.order = t.brain.order === "hold" ? "hold" : "hunt";
      }
      this.ev("stage", { label: def.label });
      if (this.enemiesAlive(tag) === 0) {
        this.nextStage();
        return;
      }
      return;
    }
    this.ev("stage", { label: def.label, idx: this.stageIdx });
  }

  updateStage(dt) {
    const st = this.stage;
    const def = st.def;
    const p = this.player;
    const done = () => {
      this.ev("objective", { label: def.label });
      // field repairs between objectives
      if (this.stageIdx < this.def.stages.length - 1 && p.alive) {
        const before = p.hp;
        p.hp = Math.min(p.maxHp, p.hp + 20);
        p.ammo.ap = Math.min(AMMO.ap.count, p.ammo.ap + 10);
        p.ammo.he = Math.min(AMMO.he.count, p.ammo.he + 3);
        this.ev("fieldRepair", { amount: Math.round(p.hp - before) });
      }
      this.nextStage();
    };
    const spawnWaves = (waves) => {
      while (st.waveIdx < waves.length && st.t >= waves[st.waveIdx].at) {
        const w = waves[st.waveIdx++];
        for (const g of w.spawn) st.units.push(...this.spawnGroup(g, st.tag));
        if (st.waveIdx > 1) this.ev("wave", { n: st.waveIdx, of: waves.length });
      }
    };
    switch (def.type) {
      case "destroy":
        if (this.enemiesAlive(st.tag) === 0) done();
        break;
      case "boss": {
        const boss = st.units.find((u) => u.boss);
        if (boss && boss.alive && !st.bossCalled && boss.hp < boss.maxHp * 0.5) {
          st.bossCalled = true;
          boss.enraged = true;
          const far = farSpawn(this, boss);
          st.units.push(...this.spawnGroup({ type: "raider", n: 2, at: far, spread: 8, order: "hunt" }, st.tag));
          this.ev("bossPhase", { name: boss.name });
        }
        if (this.enemiesAlive(st.tag) === 0) done();
        break;
      }
      case "intercept": {
        const trucks = st.units.filter((u) => u.type === "truck");
        if (st.escaped >= def.maxEscape) this.finish(false, `${st.escaped} supply trucks escaped`);
        else if (trucks.every((u) => !u.alive || u.escaped)) {
          // escorts may still be alive; the stage only needs the trucks
          for (const u of st.units) if (u.alive && u.side === "enemy" && !u.escaped) u.brain.order = "hunt";
          done();
        }
        break;
      }
      case "targets":
        if (st.targets.every((s) => !s.alive)) done();
        break;
      case "reach":
        if (Math.hypot(p.x - def.point[0], p.z - def.point[1]) < def.r) done();
        break;
      case "survive":
        spawnWaves(def.waves);
        if (st.t >= def.time) done();
        break;
      case "defendZone": {
        spawnWaves(def.waves);
        let enemyIn = 0;
        let friendIn = 0;
        for (const t of this.tanks) {
          if (!t.alive) continue;
          const d = Math.hypot(t.x - def.zone[0], t.z - def.zone[1]);
          if (d < def.r) {
            if (t.side === "enemy") enemyIn++;
            else friendIn++;
          }
        }
        st.enemyIn = enemyIn;
        if (enemyIn > 0) st.hold += dt * (friendIn ? 0.5 : 1) * Math.min(2, enemyIn);
        if (st.hold >= def.maxHold) this.finish(false, "The enemy seized the bridge");
        else if (st.t >= def.time) done();
        break;
      }
      case "defendHQ":
        spawnWaves(def.waves);
        if (!st.hq.alive) this.finish(false, "The HQ was destroyed");
        else if (st.t >= def.time) done();
        break;
      case "capture": {
        const d = Math.hypot(p.x - def.zone[0], p.z - def.zone[1]);
        let enemyIn = 0;
        for (const t of this.tanks) if (t.alive && t.side === "enemy" && Math.hypot(t.x - def.zone[0], t.z - def.zone[1]) < def.r + 6) enemyIn++;
        st.enemyIn = enemyIn;
        st.inZone = d < def.r;
        if (st.inZone && enemyIn === 0) st.cap += dt;
        else if (!st.inZone) st.cap = Math.max(0, st.cap - dt * 0.5);
        if (st.cap >= def.time) {
          // remaining defenders flee or fight on as hunters in later stages
          done();
        }
        break;
      }
      case "escort": {
        const alive = st.convoy.filter((u) => u.alive);
        st.arrived = st.convoy.filter((u) => u.arrived).length;
        st.lost = st.convoy.length - alive.length;
        // ambushes trigger on the lead truck's progress
        const prog = Math.max(0, ...alive.map((u) => u.brain.progress || 0));
        st.progress = prog;
        while (st.ambushIdx < def.ambush.length && prog >= def.ambush[st.ambushIdx].at) {
          const a = def.ambush[st.ambushIdx++];
          for (const g of a.spawn) st.units.push(...this.spawnGroup(g, st.tag));
          this.ev("ambush", { n: st.ambushIdx });
        }
        if (st.convoy.length - st.lost < def.need) this.finish(false, "Too many convoy trucks were destroyed");
        else if (st.arrived >= def.need && alive.every((u) => u.arrived)) done();
        break;
      }
      default:
    }
  }

  /* ------------------------------------------------------------ survival */
  updateSurvival(dt) {
    if (this.waveActive) {
      if (this.enemiesAlive() === 0) {
        this.waveActive = false;
        this.waveT = SURVIVAL.break;
        const p = this.player;
        const before = p.hp;
        p.hp = Math.min(p.maxHp, p.hp + 25);
        p.ammo.ap = Math.min(AMMO.ap.count, p.ammo.ap + 12);
        p.ammo.he = Math.min(AMMO.he.count, p.ammo.he + 5);
        p.ammo.smoke = Math.min(AMMO.smoke.count, p.ammo.smoke + 1);
        if (this.wave % 2 === 0) p.kits = Math.min(p.st.kits + 2, p.kits + 1);
        this.ev("waveClear", { n: this.wave, heal: Math.round(p.hp - before) });
        // clear old wrecks so the field stays readable
        if (this.wrecks.length > 8) this.wrecks.splice(0, this.wrecks.length - 8);
      }
    } else {
      this.waveT -= dt;
      if (this.waveT <= 0) {
        this.wave++;
        this.waveActive = true;
        const list = survivalWave(this.wave);
        const pts = SURVIVAL.spawns[this.world].filter((q) => Math.hypot(q[0] - this.player.x, q[1] - this.player.z) > 110);
        const use = pts.length ? pts : SURVIVAL.spawns[this.world];
        list.forEach((type, k) => {
          const q = use[(k + this.wave) % use.length];
          const u = this.spawnGroup({ type, n: 1, at: [q[0] + (this.rand() - 0.5) * 16, q[1] + (this.rand() - 0.5) * 16], order: "hunt", boss: type === "warlord", name: type === "warlord" ? `Warlord Mk.${this.wave / 5}` : undefined, hp: type === "warlord" ? 300 + this.wave * 12 : undefined }, "w" + this.wave);
          // later waves hit harder
          for (const t of u) t.st = { ...t.st, dmg: t.st.dmg * (1 + Math.min(0.6, this.wave * 0.03)) };
        });
        this.ev("wave", { n: this.wave });
      }
    }
  }

  /* ------------------------------------------------------------ training */
  nextTask() {
    this.taskIdx++;
    const def = TRAINING.tasks[this.taskIdx];
    if (!def) {
      this.finish(true, "Training complete");
      return;
    }
    const st = { def, t: 0, gate: 0, units: [], usedHE: false, smoked: false };
    this.stage = st;
    const p = this.player;
    p.ammo.ap = AMMO.ap.count;
    p.ammo.he = AMMO.he.count;
    p.ammo.smoke = AMMO.smoke.count;
    if (def.dummies) for (const [x, z] of def.dummies) st.units.push(this.spawnUnit("dummy", x, z, { order: "dummy", tag: "t" + this.taskIdx, heading: 0 }));
    if (def.movers) {
      for (let k = 0; k < def.n; k++) {
        const q = def.movers[k % def.movers.length];
        st.units.push(this.spawnUnit("dummy", q[0], q[1], { order: "mover", patrol: def.movers, pIdx: (k + 1) % def.movers.length, tag: "t" + this.taskIdx }));
      }
    }
    if (def.cluster) {
      const [cx, cz] = def.cluster;
      for (const [ox, oz] of [[0, 0], [4.2, 2], [-3.6, 2.6]]) st.units.push(this.spawnUnit("dummy", cx + ox, cz + oz, { order: "dummy", hp: 12, tag: "t" + this.taskIdx, heading: 0.4 }));
    }
    this.ev("stage", { label: def.label, idx: this.taskIdx });
  }

  updateTraining() {
    const st = this.stage;
    const def = st.def;
    const p = this.player;
    const done = () => {
      this.ev("objective", { label: def.label });
      this.nextTask();
    };
    if (def.id === "drive") {
      const g = def.gates[st.gate];
      if (g && Math.hypot(p.x - g[0], p.z - g[1]) < 8) {
        st.gate++;
        this.ev("gate", { n: st.gate, of: def.gates.length });
        if (st.gate >= def.gates.length) done();
      }
    } else if (def.id === "smoke") {
      if (st.smoked) done();
    } else if (st.units.every((u) => !u.alive)) done();
  }

  /* ------------------------------------------------------------ HUD helpers */
  objective() {
    const st = this.stage;
    if (!st) return null;
    const def = st.def;
    const fmt = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
    if (this.mode === "survival") {
      const n = this.enemiesAlive();
      return { label: this.waveActive ? `Wave ${this.wave} — destroy all enemies` : `Next wave in ${Math.ceil(Math.max(0, this.waveT))}`, prog: this.waveActive ? `${n} left` : "", frac: 0 };
    }
    if (this.mode === "training") {
      if (def.id === "drive") return { label: def.label, prog: `${st.gate} / ${def.gates.length}`, frac: st.gate / def.gates.length, step: `Drill ${this.taskIdx + 1} / ${TRAINING.tasks.length}` };
      if (def.id === "smoke") return { label: def.label, prog: "", frac: 0, step: `Drill ${this.taskIdx + 1} / ${TRAINING.tasks.length}` };
      const dead = st.units.filter((u) => !u.alive).length;
      return { label: def.label, prog: `${dead} / ${st.units.length}`, frac: dead / Math.max(1, st.units.length), step: `Drill ${this.taskIdx + 1} / ${TRAINING.tasks.length}` };
    }
    const step = `Objective ${Math.min(this.stageIdx + 1, this.def.stages.length)} / ${this.def.stages.length}`;
    switch (def.type) {
      case "destroy":
      case "boss": {
        const all = this.tanks.filter((t) => t.side === "enemy" && t.stageTag === st.tag);
        const dead = all.filter((t) => !t.alive).length;
        return { label: def.label, prog: `${dead} / ${all.length}`, frac: all.length ? dead / all.length : 0, step };
      }
      case "intercept": {
        const trucks = st.units.filter((u) => u.type === "truck");
        const dead = trucks.filter((u) => !u.alive).length;
        return { label: def.label, prog: `${dead} / ${trucks.length} · escaped ${st.escaped}/${def.maxEscape}`, frac: dead / Math.max(1, trucks.length), step };
      }
      case "targets": {
        const dead = st.targets.filter((s) => !s.alive).length;
        return { label: def.label, prog: `${dead} / ${st.targets.length}`, frac: dead / st.targets.length, step };
      }
      case "reach":
        return { label: def.label, prog: `${Math.round(Math.hypot(this.player.x - def.point[0], this.player.z - def.point[1]))} m`, frac: 0, step };
      case "survive":
        return { label: def.label, prog: `${fmt(Math.max(0, def.time - st.t))} left`, frac: st.t / def.time, step };
      case "defendZone":
        return { label: def.label, prog: `${fmt(Math.max(0, def.time - st.t))} left`, frac: st.t / def.time, step, danger: st.hold / def.maxHold, dangerLabel: st.enemyIn ? "ENEMY ON THE BRIDGE" : "" };
      case "defendHQ":
        return { label: def.label, prog: `${fmt(Math.max(0, def.time - st.t))} left`, frac: st.t / def.time, step, danger: 1 - st.hq.hp / st.hq.maxHp, dangerLabel: `HQ ${Math.ceil((st.hq.hp / st.hq.maxHp) * 100)}%` };
      case "capture":
        return { label: def.label, prog: st.inZone ? (st.enemyIn ? "Contested — clear the zone" : `Capturing ${Math.floor((st.cap / def.time) * 100)}%`) : "Enter the zone", frac: st.cap / def.time, step };
      case "escort": {
        const alive = st.convoy.filter((u) => u.alive).length;
        return { label: def.label, prog: `${alive} / ${st.convoy.length} trucks · ${Math.round((st.progress || 0) * 100)}%`, frac: st.progress || 0, step, danger: st.lost / Math.max(1, st.convoy.length - def.need + 1) };
      }
      default:
        return { label: def.label, prog: "", frac: 0, step };
    }
  }

  /** World-space objective markers for the HUD & minimap. */
  markers() {
    const out = this.markersOut;
    out.length = 0;
    const st = this.stage;
    if (!st || this.result) return out;
    const def = st.def;
    const g = (x, z) => this.map.groundAt(x, z);
    if (this.mode === "training") {
      if (def.id === "drive") {
        const q = def.gates[st.gate];
        if (q) out.push({ kind: "point", x: q[0], y: g(q[0], q[1]), z: q[1], r: 8, label: `Gate ${st.gate + 1}` });
      }
      for (const u of st.units) if (u.alive) out.push({ kind: "target", x: u.x, y: u.y + 3.5, z: u.z, ref: u, label: "Target" });
      return out;
    }
    if (this.mode === "survival") return out;
    switch (def.type) {
      case "reach":
        out.push({ kind: "point", x: def.point[0], y: g(def.point[0], def.point[1]), z: def.point[1], r: def.r, label: "Waypoint" });
        break;
      case "targets":
        for (const s of st.targets) if (s.alive) out.push({ kind: "target", x: s.x, y: s.y1 + 2, z: s.z, ref: s, label: s.name });
        break;
      case "capture":
        out.push({ kind: "zone", x: def.zone[0], y: g(def.zone[0], def.zone[1]), z: def.zone[1], r: def.r, label: "Capture", frac: st.cap / def.time });
        break;
      case "defendZone":
        out.push({ kind: "zone", x: def.zone[0], y: g(def.zone[0], def.zone[1]) + 1, z: def.zone[1], r: def.r, label: "Defend", defend: true });
        break;
      case "defendHQ":
        if (st.hq.alive) out.push({ kind: "hq", x: st.hq.x, y: st.hq.y1 + 2, z: st.hq.z, ref: st.hq, label: "HQ" });
        break;
      case "escort":
        for (const u of st.convoy) if (u.alive && !u.arrived) out.push({ kind: "escort", x: u.x, y: u.y + 5, z: u.z, ref: u, label: "Convoy" });
        {
          const end = def.convoy.path[def.convoy.path.length - 1];
          out.push({ kind: "point", x: end[0], y: g(end[0], end[1]), z: end[1], r: 14, label: "Destination" });
        }
        break;
      case "intercept":
        for (const u of st.units) if (u.alive && u.type === "truck" && !u.escaped) out.push({ kind: "target", x: u.x, y: u.y + 5, z: u.z, ref: u, label: "Truck" });
        break;
      case "boss":
        for (const u of st.units) if (u.alive && u.boss) out.push({ kind: "boss", x: u.x, y: u.y + 6, z: u.z, ref: u, label: u.name });
        break;
      case "destroy":
        if (def.search) {
          for (const u of st.units) if (u.alive && u.hidden && !u.spotted) {
            // a fuzzy search circle around the hidden unit (seeded offset)
            const ox = ((u.id * 37) % 23) - 11;
            const oz = ((u.id * 53) % 23) - 11;
            out.push({ kind: "search", x: u.x + ox, y: g(u.x + ox, u.z + oz), z: u.z + oz, r: 34, label: "Search area" });
          }
        }
        break;
      default:
    }
    return out;
  }
}

/* ------------------------------------------------------------------ helpers */
/** Point `dist` metres along a polyline. */
export function pointAlong(pts, dist) {
  let rem = dist;
  for (let i = 0; i < pts.length - 1; i++) {
    const [ax, az] = pts[i];
    const [bx, bz] = pts[i + 1];
    const L = Math.hypot(bx - ax, bz - az);
    if (rem <= L) {
      const t = rem / L;
      return [ax + (bx - ax) * t, az + (bz - az) * t];
    }
    rem -= L;
  }
  return pts[pts.length - 1].slice();
}
export function polyLength(pts) {
  let L = 0;
  for (let i = 0; i < pts.length - 1; i++) L += Math.hypot(pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1]);
  return L;
}
function farSpawn(sim, from) {
  const p = sim.player;
  const cands = [[150, 150], [-150, 150], [150, -150], [-150, -150], [0, 170], [170, 0], [-170, 0]];
  let best = cands[0];
  let bd = -1;
  for (const c of cands) {
    const d = Math.hypot(c[0] - p.x, c[1] - p.z);
    const df = Math.hypot(c[0] - from.x, c[1] - from.z);
    if (d > 90 && df < 200 && d > bd) {
      bd = d;
      best = c;
    }
  }
  return best;
}
export { AMMO_ORDER };
