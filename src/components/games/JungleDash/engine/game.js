/**
 * Jungle Dash — framework-free simulation (no Three.js, no DOM).
 *
 * World: +Y up, levels run from z ≈ 0 toward −z, the camera sits behind the
 * player (+z). Everything that blocks is an axis-aligned box ("solid"):
 * static ground, moving platforms, falling platforms and crates. The player
 * is a box too (feet at p.y), moved one axis at a time and pushed out of
 * whatever it overlaps, so collisions are exact and order-independent of
 * frame rate as long as a step is ≤ 1/120 s (see MAX_STEP).
 *
 * step(dt, input) advances the world and returns the events of that step
 * (sounds / particles / HUD toasts are driven from them by the shell).
 */
import { LEVELS } from "../data/levels.js";

export const MAX_STEP = 1 / 120;
export const PL = {
  hw: 0.32, // half width of the player box
  h: 1.15, // player height
  run: 6.8,
  accG: 62,
  accA: 30,
  dec: 58,
  grav: -32,
  jumpV: 11.6,
  cut: 0.45, // vy multiplier when Space is released early
  maxFall: -24,
  coyote: 0.1,
  buffer: 0.14,
  spinT: 0.42,
  spinCd: 0.16,
  spinR: 1.35,
  invuln: 1.5,
  hurtLock: 0.35,
  maxHp: 3,
  bounce: 8.5, // after landing on (and breaking) a crate
  spring: 14.2, // bounce crate
  stomp: 9.5,
};
export const SCORE = { fruit: 10, crate: 50, enemy: 100, secret: 250, boss: 2000, finish: 1000, flawless: 500, timeBonus: 20 };
const ENEMY = {
  crab: { r: 0.55, h: 0.7, hp: 1, stomp: true },
  thorn: { r: 0.6, h: 0.85, hp: 2, stomp: false },
  plant: { r: 0.5, h: 1.25, hp: 1, stomp: true },
};
const EPS = 1e-4;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const smooth = (u) => 0.5 - 0.5 * Math.cos(Math.PI * u);

function mkSolid(b, kind, m, ref) {
  return { x0: b[0], y0: b[1], z0: b[2], x1: b[3], y1: b[4], z1: b[5], kind, m, ref, on: true, dx: 0, dy: 0, dz: 0 };
}
/** ping-pong position along a 2-point path; `hold` = fraction of the cycle spent resting at each end */
export function pathPos(path, period, t, phase = 0, hold = 0.12) {
  const u = (((t / period + phase) % 1) + 1) % 1;
  const half = 0.5;
  let s;
  if (u < half) s = clamp((u / half - hold) / (1 - 2 * hold), 0, 1);
  else s = 1 - clamp(((u - half) / half - hold) / (1 - 2 * hold), 0, 1);
  s = smooth(s);
  const a = path[0], b = path[1];
  return [a[0] + (b[0] - a[0]) * s, a[1] + (b[1] - a[1]) * s, a[2] + (b[2] - a[2]) * s];
}
/** timed hazards: is it "on" at time t?  `warn` = seconds of warning before it turns on */
export function cycle(h, t) {
  const P = h.period;
  const u = ((((t + (h.phase || 0) * P) % P) + P) % P) / P;
  const on = u < h.on;
  const toOn = on ? 0 : (1 - u) * P;
  return { u, on, warn: !on && toOn < (h.warn ?? 0.6), toOn };
}

export class Game {
  constructor(levelId = 1, opts = {}) {
    const L = LEVELS.find((l) => l.id === levelId) || LEVELS[0];
    this.level = L;
    this.t = 0;
    this.status = "play"; // play | dying | complete | gameover
    this.events = [];
    this.score = 0;
    this.stats = { fruits: 0, crates: 0, kills: 0, secrets: 0, damage: 0, deaths: 0, bounces: 0 };
    this.result = null;

    // --- solids
    this.solids = [];
    this.statics = [];
    for (const s of L.solids) {
      const o = mkSolid(s.b, "static", s.m || "grass");
      this.solids.push(o);
      this.statics.push(o);
    }
    this.movers = (L.movers || []).map((d, i) => {
      const p = pathPos(d.path, d.period, 0, d.phase || 0, d.hold);
      const [w, h, dd] = d.size;
      const o = mkSolid([p[0] - w / 2, p[1] - h, p[2] - dd / 2, p[0] + w / 2, p[1], p[2] + dd / 2], "mover", d.m || "wood", i);
      o.def = d;
      this.solids.push(o);
      return o;
    });
    this.fallers = (L.fallers || []).map((d, i) => {
      const o = mkSolid(d.b, "faller", d.m || "stone", i);
      o.def = d;
      o.home = [...d.b];
      o.state = "idle";
      o.st = 0;
      o.vy = 0;
      this.solids.push(o);
      return o;
    });
    this.crates = (L.crates || []).map((c, i) => {
      const [x, y, z] = c.p;
      const o = mkSolid([x - 0.5, y, z - 0.5, x + 0.5, y + 1, z + 0.5], "crate", c.t || "n", i);
      o.type = c.t || "n";
      o.left = o.type === "b" || o.type === "n" ? 5 : 0; // fruit still inside
      o.broken = false;
      o.squash = 0;
      this.solids.push(o);
      return o;
    });
    this.crateTotal = this.crates.filter((c) => c.type !== "s").length;
    this.crateFall = true;
    this.secretTotal = this.crates.filter((c) => c.type === "s").length + (L.secretZones || []).length;
    this.secretZones = (L.secretZones || []).map((b) => ({ b, found: false }));

    // --- pickups
    this.fruits = (L.fruits || []).map(([x, y, z]) => ({ x, y, z, got: false }));
    this.hearts = (L.hearts || []).map(([x, y, z]) => ({ x, y, z, got: false }));
    this.fruitTotal = this.fruits.length + this.crates.reduce((a, c) => a + c.left, 0);

    // --- hazards
    this.hazards = (L.hazards || []).map((d, i) => ({ ...d, i, active: d.t === "spikes", warn: false, cur: d.b ? [...d.b] : null, pos: d.path ? [...d.path[0]] : d.p ? [...d.p] : null, k: 0 }));
    this.kills = (L.kills || []).map((k) => ({ ...k }));

    // --- enemies
    this.enemies = (L.enemies || []).map((d, i) => {
      const def = ENEMY[d.t];
      const p = d.p || d.a;
      return { i, t: d.t, def, d, x: p[0], y: p[1], z: p[2], yaw: d.yaw ?? 0, hp: def.hp, alive: true, state: "idle", st: 0, dir: 1, deadT: 0, hitT: 0, stun: 0, vx: 0, vz: 0, flyY: 0, cool: (d.delay ?? 0.4) };
    });
    this.shots = [];

    // --- checkpoints, portal
    this.checkpoints = (L.checkpoints || []).map(([x, y, z]) => ({ x, y, z, on: false }));
    this.respawn = [...L.spawn];
    this.portal = L.portal ? { x: L.portal[0], y: L.portal[1], z: L.portal[2], open: !L.boss } : null;

    // --- player
    const [sx, sy, sz] = L.spawn;
    this.player = {
      x: sx, y: sy, z: sz, vx: 0, vy: 0, vz: 0, yaw: Math.PI,
      grounded: true, ground: null, coyote: 0, buffer: 0, jumpHeld: false, jumping: false,
      spin: 0, spinCd: 0, spinId: 0, airSpin: false, invuln: 0, lock: 0, hp: Math.min(PL.maxHp, opts.hp ?? PL.maxHp),
      anim: "idle", animT: 0, landT: 0, speed: 0, dyingT: 0, deathKind: null, lastSafe: [sx, sy, sz],
    };

    // --- boss
    this.boss = L.boss ? makeBoss(L.boss) : null;
    this.cam = null; // filled by engine/camera.js
  }

  emit(type, o = {}) {
    this.events.push({ type, ...o });
  }

  /* -------------------------------------------------------------- queries */
  /** highest solid top at (x,z) that is ≤ y + 0.05 (for blob shadows / bots) */
  groundBelow(x, z, y, hw = 0.05) {
    let best = -Infinity;
    for (const s of this.solids) {
      if (!s.on) continue;
      if (x + hw <= s.x0 || x - hw >= s.x1 || z + hw <= s.z0 || z - hw >= s.z1) continue;
      if (s.y1 <= y + 0.05 && s.y1 > best) best = s.y1;
    }
    return best;
  }
  pointInSolid(x, y, z, statOnly = false) {
    const L = statOnly ? this.statics : this.solids;
    for (const s of L) if (s.on && x > s.x0 && x < s.x1 && y > s.y0 && y < s.y1 && z > s.z0 && z < s.z1) return s;
    return null;
  }
  overlapP(s, x = this.player.x, y = this.player.y, z = this.player.z) {
    return s.on && x + PL.hw > s.x0 + EPS && x - PL.hw < s.x1 - EPS && y + PL.h > s.y0 + EPS && y < s.y1 - EPS && z + PL.hw > s.z0 + EPS && z - PL.hw < s.z1 - EPS;
  }
  playerBoxHits(b, pad = 0) {
    const p = this.player;
    return p.x + PL.hw > b[0] - pad && p.x - PL.hw < b[3] + pad && p.y + PL.h > b[1] - pad && p.y < b[4] + pad && p.z + PL.hw > b[2] - pad && p.z - PL.hw < b[5] + pad;
  }
  totalFruitPct() {
    return this.fruitTotal ? this.stats.fruits / this.fruitTotal : 1;
  }

  /* -------------------------------------------------------------- main step */
  step(dt, inp = {}) {
    this.events = [];
    if (this.status === "complete" || this.status === "gameover") {
      this.t += dt;
      this.animate(dt);
      return this.events;
    }
    this.t += dt;
    const p = this.player;
    this.updateMovers(dt);
    this.settleCrates(dt);
    this.updateHazards(dt);

    if (this.status === "dying") {
      p.dyingT += dt;
      if (p.deathKind === "fall") {
        p.vy = Math.max(PL.maxFall, p.vy + PL.grav * dt);
        p.y += p.vy * dt * 0.3;
      }
      if (p.dyingT > 1.0) {
        if (p.hp <= 0) {
          this.status = "gameover";
          this.emit("gameover");
        } else this.doRespawn();
      }
      this.updateEnemies(dt);
      this.updateBoss(dt);
      this.animate(dt);
      return this.events;
    }

    // ride whatever we stood on last step
    const g = p.ground;
    if (g && g.on && (g.dx || g.dy || g.dz)) {
      p.x += g.dx;
      p.y += g.dy;
      p.z += g.dz;
    }
    this.depenetrate();
    this.control(dt, inp);
    this.physics(dt);
    this.interact(dt, inp);
    this.updateEnemies(dt);
    this.updateShots(dt);
    this.updateBoss(dt);
    this.animate(dt);
    return this.events;
  }

  updateMovers(dt) {
    const t = this.t;
    for (const m of this.movers) {
      const d = m.def;
      const p = pathPos(d.path, d.period, t, d.phase || 0, d.hold);
      const [w, h, dd] = d.size;
      const nx0 = p[0] - w / 2, ny1 = p[1], nz0 = p[2] - dd / 2;
      m.dx = nx0 - m.x0;
      m.dy = ny1 - m.y1;
      m.dz = nz0 - m.z0;
      m.x0 = nx0; m.x1 = nx0 + w; m.y1 = ny1; m.y0 = ny1 - h; m.z0 = nz0; m.z1 = nz0 + dd;
    }
    for (const f of this.fallers) {
      f.dx = f.dy = f.dz = 0;
      f.st += dt;
      if (f.state === "shake" && f.st > (f.def.delay ?? 0.55)) {
        f.state = "fall";
        f.st = 0;
        f.vy = 0;
        this.emit("fallerDrop", { i: f.ref });
      } else if (f.state === "fall") {
        f.vy = Math.max(-20, f.vy - 26 * dt);
        f.dy = f.vy * dt;
        f.y0 += f.dy;
        f.y1 += f.dy;
        if (f.st > 1.3) {
          f.on = false;
          f.state = "gone";
          f.st = 0;
        }
      } else if (f.state === "gone" && f.st > (f.def.respawn ?? 3)) {
        const h = f.home;
        const p = this.player;
        const blocked = p.x + PL.hw > h[0] && p.x - PL.hw < h[3] && p.z + PL.hw > h[2] && p.z - PL.hw < h[5] && p.y < h[4] + 0.5 && p.y + PL.h > h[1];
        if (!blocked) {
          [f.x0, f.y0, f.z0, f.x1, f.y1, f.z1] = h;
          f.on = true;
          f.state = "idle";
          f.st = 0;
          this.emit("fallerBack", { i: f.ref });
        }
      }
    }
  }

  /** unsupported crates (the one below was broken) drop onto whatever is under them */
  settleCrates(dt) {
    if (!this.crateFall) return;
    let any = false;
    for (const c of this.crates) {
      c.dx = c.dy = c.dz = 0;
      if (c.broken) continue;
      let sup = -Infinity;
      for (const s of this.solids) {
        if (s === c || !s.on) continue;
        if (s.x1 <= c.x0 + 0.05 || s.x0 >= c.x1 - 0.05 || s.z1 <= c.z0 + 0.05 || s.z0 >= c.z1 - 0.05) continue;
        if (s.y1 <= c.y0 + 0.01 && s.y1 > sup) sup = s.y1;
      }
      if (sup === -Infinity || sup >= c.y0 - 1e-3) {
        c.vy = 0;
        continue;
      }
      c.vy = (c.vy || 0) - 30 * dt;
      const ny = Math.max(sup, c.y0 + c.vy * dt);
      c.dy = ny - c.y0;
      c.y0 = ny;
      c.y1 = ny + 1;
      if (ny === sup) {
        c.vy = 0;
        this.emit("crateLand", { x: (c.x0 + c.x1) / 2, z: (c.z0 + c.z1) / 2 });
      }
      any = true; // one more pass next step clears this step's dy
    }
    this.crateFall = any;
  }

  updateHazards() {
    const t = this.t;
    for (const h of this.hazards) {
      if (h.t === "tspikes" || h.t === "jet") {
        const c = cycle(h, t);
        if (c.on && !h.active) this.emit(h.t === "jet" ? "jet" : "spikeUp", { i: h.i, x: h.b ? (h.b[0] + h.b[3]) / 2 : h.p[0], z: h.b ? (h.b[2] + h.b[5]) / 2 : h.p[2] });
        h.active = c.on;
        h.warn = c.warn;
        h.k = c.u;
      } else if (h.t === "slider") {
        h.pos = pathPos(h.path, h.period, t, h.phase || 0, h.hold ?? 0.05);
        h.active = true;
      } else if (h.t === "crusher") {
        // up (wait) → shake → slam → down → rise
        const P = h.period;
        const u = ((((t + (h.phase || 0) * P) % P) + P) % P) / P;
        const top = h.b[4], drop = h.drop;
        let k; // 0 = up, 1 = fully down
        const S = 0.42, F = 0.5, D = 0.62; // phase marks: shake starts, slam ends, rise starts
        if (u < S) k = 0;
        else if (u < F - 0.06) k = 0;
        else if (u < F) k = (u - (F - 0.06)) / 0.06;
        else if (u < D) k = 1;
        else k = 1 - smooth((u - D) / (1 - D));
        h.warn = u >= S && u < F - 0.06;
        if (k >= 1 && h.k < 1) this.emit("crush", { i: h.i, x: (h.b[0] + h.b[3]) / 2, z: (h.b[2] + h.b[5]) / 2 });
        h.k = k;
        h.cur = [h.b[0], h.b[1] - drop * k, h.b[2], h.b[3], top - drop * k, h.b[5]];
        h.active = k > 0.35;
      }
    }
  }

  /** a moving solid slid into the player: push the player out the short way */
  depenetrate() {
    const p = this.player;
    for (const s of this.solids) {
      if (!this.overlapP(s)) continue;
      if (s.kind === "static" || s.kind === "crate") continue; // only things that move
      const pens = [
        [(p.x + PL.hw) - s.x0, -1, 0, 0],
        [s.x1 - (p.x - PL.hw), 1, 0, 0],
        [(p.z + PL.hw) - s.z0, 0, 0, -1],
        [s.z1 - (p.z - PL.hw), 0, 0, 1],
        [s.y1 - p.y, 0, 1, 0],
        [(p.y + PL.h) - s.y0, 0, -1, 0],
      ];
      pens[4][0] *= 0.6; // prefer being lifted onto a rising platform
      pens.sort((a, b) => a[0] - b[0]);
      const [d, ax, ay, az] = pens[0];
      p.x += ax * (d + EPS);
      p.y += ay * (d + EPS);
      p.z += az * (d + EPS);
      if (ay > 0) {
        p.vy = Math.max(p.vy, 0);
        p.ground = s;
        p.grounded = true;
      }
    }
  }

  control(dt, inp) {
    const p = this.player;
    p.invuln = Math.max(0, p.invuln - dt);
    p.lock = Math.max(0, p.lock - dt);
    p.spinCd = Math.max(0, p.spinCd - dt);
    if (p.spin > 0) {
      p.spin -= dt;
      if (p.spin <= 0) {
        p.spin = 0;
        p.spinCd = PL.spinCd;
      }
    }
    let mx = inp.mx || 0, mz = inp.mz || 0;
    const ml = Math.hypot(mx, mz);
    if (ml > 1) (mx /= ml), (mz /= ml);
    if (p.lock > 0) mx = mz = 0;
    // camera looks along −z: "forward" (mz>0) is −z, "right" (mx>0) is +x
    const tx = mx * PL.run, tz = -mz * PL.run;
    const acc = p.grounded ? (ml > 0.05 ? PL.accG : PL.dec) : PL.accA;
    const dvx = tx - p.vx, dvz = tz - p.vz;
    const dl = Math.hypot(dvx, dvz);
    const mv = acc * dt;
    if (dl <= mv) (p.vx = tx), (p.vz = tz);
    else (p.vx += (dvx / dl) * mv), (p.vz += (dvz / dl) * mv);
    p.speed = Math.hypot(p.vx, p.vz);
    if (ml > 0.1 && p.lock <= 0) {
      const want = Math.atan2(tx, tz);
      let d = want - p.yaw;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      p.yaw += d * Math.min(1, dt * 16);
    }

    // jump (buffered + coyote time)
    if (inp.jump) p.buffer = PL.buffer;
    else p.buffer = Math.max(0, p.buffer - dt);
    p.coyote = p.grounded ? PL.coyote : Math.max(0, p.coyote - dt);
    p.jumpHeld = !!inp.jumpHeld || !!inp.jump;
    if (p.buffer > 0 && p.coyote > 0 && p.lock <= 0) {
      p.vy = PL.jumpV;
      p.grounded = false;
      p.ground = null;
      p.coyote = 0;
      p.buffer = 0;
      p.jumping = true;
      this.emit("jump");
    }
    if (p.jumping && !p.jumpHeld && p.vy > 3) {
      p.vy *= PL.cut;
      p.jumping = false;
    }
    if (p.vy <= 0) p.jumping = false;

    // spin
    if (inp.spin && p.spin <= 0 && p.spinCd <= 0 && p.lock <= 0) {
      p.spin = PL.spinT;
      p.spinId++;
      this.emit("spin");
      if (!p.grounded && !p.airSpin) {
        p.airSpin = true;
        if (p.vy < 2) p.vy = Math.max(p.vy, 2);
      }
    }
    // a little float while spinning in the air
    const g = p.spin > 0 && !p.grounded && p.vy < 0 ? PL.grav * 0.35 : PL.grav;
    p.vy = Math.max(PL.maxFall, p.vy + g * dt);
  }

  physics(dt) {
    const p = this.player;
    const wasGrounded = p.grounded;
    const vyBefore = p.vy;
    // X then Z (with a small step-up), then Y
    this.moveH("x", p.vx * dt, wasGrounded);
    this.moveH("z", p.vz * dt, wasGrounded);
    p.grounded = false;
    p.ground = null;
    const dy = p.vy * dt;
    p.y += dy;
    for (const s of this.solids) {
      if (!this.overlapP(s)) continue;
      if (dy <= 0) {
        p.y = s.y1;
        if (s.kind === "crate" && !s.broken) {
          if (this.landOnCrate(s, vyBefore)) continue;
        }
        p.vy = 0;
        p.grounded = true;
        p.ground = s;
      } else {
        p.y = s.y0 - PL.h;
        p.vy = Math.min(0, p.vy);
        p.jumping = false;
        if (s.kind === "crate" && (s.type === "n" || s.type === "h")) this.breakCrate(s, "head");
      }
    }
    if (p.grounded) {
      p.airSpin = false;
      if (!wasGrounded && vyBefore < -6) p.landT = 0.18;
      if (!wasGrounded && vyBefore < -2) this.emit("land", { hard: vyBefore < -14 });
      if (p.ground.kind === "faller" && p.ground.state === "idle") {
        p.ground.state = "shake";
        p.ground.st = 0;
        this.emit("fallerShake", { i: p.ground.ref });
      }
      if (p.ground.kind === "static") p.lastSafe = [p.x, p.y, p.z];
    }
    p.landT = Math.max(0, p.landT - dt);
  }

  moveH(ax, d, grounded) {
    if (!d) return;
    const p = this.player;
    p[ax] += d;
    for (const s of this.solids) {
      if (!this.overlapP(s)) continue;
      // small step up (seams, low ledges) when walking
      const rise = s.y1 - p.y;
      if (grounded && rise > 0 && rise <= 0.3 && !this.blockedAt(p.x, s.y1, p.z, s)) {
        p.y = s.y1;
        continue;
      }
      const lo = ax === "x" ? s.x0 : s.z0;
      const hi = ax === "x" ? s.x1 : s.z1;
      if (d > 0) p[ax] = lo - PL.hw - EPS;
      else p[ax] = hi + PL.hw + EPS;
      if (ax === "x") p.vx = 0;
      else p.vz = 0;
    }
  }
  blockedAt(x, y, z, except) {
    for (const s of this.solids) if (s !== except && this.overlapP(s, x, y, z)) return true;
    return false;
  }

  /** returns true when the landing bounced us (so we are not grounded) */
  landOnCrate(c, vyBefore) {
    const p = this.player;
    if (c.type === "b") {
      p.vy = p.jumpHeld ? PL.spring : PL.spring * 0.85;
      p.jumping = p.jumpHeld;
      c.squash = 1;
      this.stats.bounces++;
      if (c.left > 0) {
        c.left--;
        this.gainFruit(1, c);
      }
      this.emit("spring", { x: (c.x0 + c.x1) / 2, y: c.y1, z: (c.z0 + c.z1) / 2 });
      return true;
    }
    if (c.type === "s" || vyBefore > -2) return false;
    this.breakCrate(c, "land");
    p.vy = p.jumpHeld ? PL.bounce * 1.15 : PL.bounce;
    p.jumping = p.jumpHeld;
    return true;
  }

  gainFruit(n, at) {
    this.stats.fruits += n;
    this.score += n * SCORE.fruit;
    if (at) this.emit("fruit", { n, x: (at.x0 + at.x1) / 2, y: at.y1, z: (at.z0 + at.z1) / 2, fromCrate: true });
  }

  breakCrate(c, how) {
    if (c.broken) return;
    c.broken = true;
    c.on = false;
    this.crateFall = true;
    const x = (c.x0 + c.x1) / 2, y = (c.y0 + c.y1) / 2, z = (c.z0 + c.z1) / 2;
    if (c.type === "s") {
      this.stats.secrets++;
      this.score += SCORE.secret;
      this.emit("secret", { x, y, z, wall: true });
      this.emit("crate", { x, y, z, kind: "s", how });
      return;
    }
    this.stats.crates++;
    this.score += SCORE.crate;
    if (c.left > 0) {
      this.gainFruit(c.left, c);
      c.left = 0;
    }
    if (c.type === "h") this.heal(x, y, z);
    this.emit("crate", { x, y, z, kind: c.type, how });
  }

  heal(x, y, z) {
    const p = this.player;
    if (p.hp < PL.maxHp) p.hp++;
    this.emit("heart", { x, y, z, full: p.hp >= PL.maxHp });
  }

  hurt(sx, sz, why = "hit") {
    const p = this.player;
    if (p.invuln > 0 || this.status !== "play") return false;
    p.hp--;
    this.stats.damage++;
    this.emit("hurt", { why, x: p.x, y: p.y, z: p.z });
    let dx = p.x - sx, dz = p.z - sz;
    const l = Math.hypot(dx, dz);
    if (l < 1e-3) (dx = 0), (dz = 1);
    else (dx /= l), (dz /= l);
    p.vx = dx * 6.5;
    p.vz = dz * 6.5;
    p.vy = 7.5;
    p.grounded = false;
    p.ground = null;
    p.spin = 0;
    p.lock = PL.hurtLock;
    p.invuln = PL.invuln;
    p.animT = 0;
    if (p.hp <= 0) this.die("ko");
    return true;
  }

  die(kind) {
    const p = this.player;
    if (this.status !== "play") return;
    if (kind !== "ko") {
      p.hp--;
      this.stats.damage++;
    }
    this.stats.deaths++;
    this.status = "dying";
    p.dyingT = 0;
    p.deathKind = kind;
    p.spin = 0;
    if (kind !== "fall") (p.vx = p.vz = 0), (p.vy = 0);
    this.emit("die", { kind, x: p.x, y: p.y, z: p.z, out: p.hp <= 0 });
  }

  doRespawn() {
    const p = this.player;
    const [x, y, z] = this.respawn;
    Object.assign(p, { x, y, z, vx: 0, vy: 0, vz: 0, yaw: Math.PI, grounded: true, ground: null, spin: 0, spinCd: 0, lock: 0, invuln: PL.invuln, dyingT: 0, deathKind: null, buffer: 0, jumping: false });
    this.status = "play";
    this.shots.length = 0;
    if (this.boss) resetBossForRespawn(this.boss);
    this.emit("respawn", { x, y, z });
  }

  /** Game Over → "Continue": back to the last checkpoint with full health */
  continueFromCheckpoint() {
    if (this.status !== "gameover") return;
    this.player.hp = PL.maxHp;
    this.doRespawn();
  }

  interact(dt) {
    const p = this.player;
    const cx = p.x, cy = p.y + PL.h * 0.5, cz = p.z;
    // spin hits
    if (p.spin > 0) {
      for (const c of this.crates) {
        if (c.broken) continue;
        const ccx = (c.x0 + c.x1) / 2, ccy = (c.y0 + c.y1) / 2, ccz = (c.z0 + c.z1) / 2;
        if (Math.abs(ccy - cy) < 1.1 && Math.hypot(ccx - cx, ccz - cz) < PL.spinR + 0.45) this.breakCrate(c, "spin");
      }
    }
    // fruit + hearts
    for (const f of this.fruits) {
      if (f.got) continue;
      const dx = f.x - cx, dy = f.y - cy, dz = f.z - cz;
      if (dx * dx + dy * dy + dz * dz < 0.85 * 0.85) {
        f.got = true;
        this.stats.fruits++;
        this.score += SCORE.fruit;
        this.emit("fruit", { n: 1, x: f.x, y: f.y, z: f.z });
      }
    }
    for (const h of this.hearts) {
      if (h.got) continue;
      if (Math.hypot(h.x - cx, h.y - cy, h.z - cz) < 0.95) {
        h.got = true;
        this.heal(h.x, h.y, h.z);
      }
    }
    // checkpoints
    for (const c of this.checkpoints) {
      if (c.on) continue;
      if (Math.hypot(c.x - p.x, c.z - p.z) < 1.6 && Math.abs(c.y - p.y) < 2.5) {
        c.on = true;
        this.respawn = [c.x, c.y, c.z];
        this.emit("checkpoint", { x: c.x, y: c.y, z: c.z });
      }
    }
    // secret zones (hidden rewards found by walking in)
    for (const s of this.secretZones) {
      if (!s.found && this.playerBoxHits(s.b)) {
        s.found = true;
        this.stats.secrets++;
        this.score += SCORE.secret;
        this.emit("secret", { x: p.x, y: p.y, z: p.z });
      }
    }
    // hazards
    for (const h of this.hazards) {
      if (!h.active) continue;
      let hit = false, hx = p.x, hz = p.z;
      if (h.t === "spikes" || h.t === "tspikes") {
        hit = this.playerBoxHits(h.b, -0.05);
        // knocked back against the way we were moving (toward the camera when standing)
        hx = p.x + p.vx * 0.1;
        hz = p.z + p.vz * 0.1 - (Math.hypot(p.vx, p.vz) < 0.5 ? 0.1 : 0);
      } else if (h.t === "slider") {
        const [w, hh, d] = h.size;
        const q = h.pos;
        hit = this.playerBoxHits([q[0] - w / 2, q[1], q[2] - d / 2, q[0] + w / 2, q[1] + hh, q[2] + d / 2], -0.05);
        hx = q[0];
        hz = q[2];
      } else if (h.t === "jet") {
        const dx = p.x - h.p[0], dz = p.z - h.p[2];
        hit = dx * dx + dz * dz < (h.r ?? 0.6) ** 2 + 0.1 && p.y < h.p[1] + (h.h ?? 3) && p.y + PL.h > h.p[1];
        hx = h.p[0];
        hz = h.p[2] + 1;
      } else if (h.t === "crusher") {
        hit = this.playerBoxHits(h.cur, -0.05);
        hx = p.x;
        hz = (h.cur[2] + h.cur[5]) / 2;
      }
      if (hit) this.hurt(hx, hz, h.t);
    }
    // kill volumes (lava pools, water) and the kill plane
    for (const k of this.kills) {
      if (this.playerBoxHits(k.b, -0.1)) {
        this.die(k.kind || "lava");
        return;
      }
    }
    if (p.y < this.level.killY) {
      this.die(this.level.liquid === "lava" ? "lava" : this.level.liquid === "water" ? "water" : "fall");
      return;
    }
    // portal
    const P = this.portal;
    if (P && P.open && Math.hypot(P.x - p.x, P.z - p.z) < 1.25 && p.y > P.y - 0.6 && p.y < P.y + 2.4) this.complete();
  }

  complete() {
    if (this.status !== "play") return;
    this.status = "complete";
    const L = this.level;
    const timeBonus = Math.max(0, Math.round((L.par - this.t) * SCORE.timeBonus));
    const flawless = this.stats.damage === 0 ? SCORE.flawless : 0;
    const base = this.score;
    this.score = base + SCORE.finish + timeBonus + flawless;
    const fruitPct = this.totalFruitPct();
    const allCrates = this.stats.crates >= this.crateTotal;
    const stars = 1 + (fruitPct >= 0.8 ? 1 : 0) + (allCrates ? 1 : 0);
    this.result = {
      level: L.id,
      time: this.t,
      fruits: this.stats.fruits,
      fruitTotal: this.fruitTotal,
      crates: this.stats.crates,
      crateTotal: this.crateTotal,
      kills: this.stats.kills,
      secrets: this.stats.secrets,
      secretTotal: this.secretTotal,
      damage: this.stats.damage,
      base,
      finish: SCORE.finish,
      timeBonus,
      flawless,
      score: this.score,
      stars,
    };
    const p = this.player;
    p.vx = p.vz = 0;
    p.anim = "win";
    p.animT = 0;
    this.emit("complete", { result: this.result });
  }

  /* -------------------------------------------------------------- enemies */
  updateEnemies(dt) {
    const p = this.player;
    const alive = this.status === "play";
    const pcy = p.y + PL.h * 0.5;
    for (const e of this.enemies) {
      e.hitT = Math.max(0, e.hitT - dt);
      if (!e.alive) {
        e.deadT += dt;
        // knocked away: fly off and shrink (render only)
        e.x += e.vx * dt;
        e.z += e.vz * dt;
        e.flyY += (6 - e.deadT * 18) * dt;
        continue;
      }
      if (e.stun > 0) {
        e.stun -= dt;
        e.x += e.vx * dt;
        e.z += e.vz * dt;
        e.vx *= Math.max(0, 1 - dt * 6);
        e.vz *= Math.max(0, 1 - dt * 6);
      } else if (e.t === "crab" || e.t === "thorn") {
        const a = e.d.a, b = e.d.b;
        const tgt = e.dir > 0 ? b : a;
        const dx = tgt[0] - e.x, dz = tgt[2] - e.z;
        const l = Math.hypot(dx, dz);
        const sp = e.d.speed ?? (e.t === "thorn" ? 2.6 : 1.8);
        if (l < 0.05) {
          e.st += dt;
          if (e.st > (e.d.pause ?? 0.4)) {
            e.dir *= -1;
            e.st = 0;
          }
        } else {
          const m = Math.min(l, sp * dt);
          e.x += (dx / l) * m;
          e.z += (dz / l) * m;
          e.yaw = Math.atan2(dx, dz);
          e.state = "walk";
        }
      } else if (e.t === "plant") {
        this.plantAI(e, dt);
      }
      // contact with the player
      if (!alive) continue;
      const ddx = p.x - e.x, ddz = p.z - e.z;
      const hd = Math.hypot(ddx, ddz);
      const def = e.def;
      // spin
      if (p.spin > 0) {
        // a spinning player can't be hurt by touching enemies
        if (e.spinId !== p.spinId && hd < PL.spinR + def.r * 0.6 && Math.abs(pcy - (e.y + def.h * 0.5)) < 1.3) {
          e.spinId = p.spinId;
          this.hitEnemy(e, ddx, ddz, "spin");
        }
        continue;
      }
      // (a stunned enemy is dazed and harmless until it recovers)
      if (e.stun <= 0 && hd < def.r + PL.hw && p.y < e.y + def.h && p.y + PL.h > e.y) {
        const above = p.y > e.y + def.h * 0.45 && p.vy < 0;
        if (above && def.stomp) {
          this.hitEnemy(e, ddx, ddz, "stomp");
          p.vy = p.jumpHeld ? PL.stomp * 1.15 : PL.stomp;
          p.jumping = p.jumpHeld;
          p.grounded = false;
          p.y = Math.max(p.y, e.y + def.h * 0.5);
        } else if (above && !def.stomp) {
          // spiky back: ouch, and bounce off
          if (this.hurt(e.x, e.z, "spikes")) p.vy = 8;
        } else this.hurt(e.x, e.z, e.t);
      }
    }
  }

  plantAI(e, dt) {
    const p = this.player;
    const dx = p.x - e.x, dz = p.z - e.z;
    const d = Math.hypot(dx, dz);
    const range = e.d.range ?? 10;
    const inRange = d < range && Math.abs(p.y - e.y) < 4 && this.status === "play";
    if (inRange) {
      let a = Math.atan2(dx, dz) - e.yaw;
      a = Math.atan2(Math.sin(a), Math.cos(a));
      e.yaw += a * Math.min(1, dt * 5);
    }
    e.st += dt;
    if (e.state === "idle" || e.state === "walk") {
      e.cool -= dt;
      if (inRange && e.cool <= 0) {
        e.state = "windup";
        e.st = 0;
        this.emit("plantWindup", { i: e.i, x: e.x, z: e.z });
      }
    } else if (e.state === "windup") {
      if (e.st > (e.d.windup ?? 0.8)) {
        e.state = "fire";
        e.st = 0;
        const sp = e.d.shot ?? 7;
        const tx = p.x, tz = p.z;
        const l = Math.hypot(tx - e.x, tz - e.z) || 1;
        const vx = ((tx - e.x) / l) * sp, vz = ((tz - e.z) / l) * sp;
        this.shots.push({ x: e.x + (vx / sp) * 0.6, y: e.y + 0.95, z: e.z + (vz / sp) * 0.6, vx, vz, t: 0, fire: !!e.d.fire, dead: false });
        this.emit("shoot", { i: e.i, x: e.x, z: e.z, fire: !!e.d.fire });
      }
    } else if (e.state === "fire") {
      if (e.st > 0.3) {
        e.state = "idle";
        e.st = 0;
        e.cool = e.d.cool ?? 1.6;
      }
    }
  }

  hitEnemy(e, dx, dz, how) {
    if (!e.alive || e.hitT > 0) return;
    const l = Math.hypot(dx, dz) || 1;
    e.hp--;
    e.hitT = 0.35;
    if (e.hp <= 0) {
      e.alive = false;
      e.deadT = 0;
      e.state = "dead";
      const k = how === "spin" ? 7 : 0;
      e.vx = (-dx / l) * k;
      e.vz = (-dz / l) * k;
      this.stats.kills++;
      this.score += SCORE.enemy;
      this.emit("enemyDie", { i: e.i, t: e.t, x: e.x, y: e.y, z: e.z, how });
    } else {
      // survives (thornbacks): recoil in place, the player is pushed clear
      e.stun = 0.8;
      e.vx = e.vz = 0;
      const p = this.player;
      p.vx = (dx / l) * 6;
      p.vz = (dz / l) * 6;
      if (p.grounded) p.vy = 4;
      this.emit("enemyHit", { i: e.i, t: e.t, x: e.x, y: e.y, z: e.z });
    }
  }

  updateShots(dt) {
    const p = this.player;
    const pcy = p.y + PL.h * 0.5;
    for (const s of this.shots) {
      if (s.dead) continue;
      s.t += dt;
      s.x += s.vx * dt;
      s.z += s.vz * dt;
      if (s.t > 3.2 || this.pointInSolid(s.x, s.y, s.z)) {
        s.dead = true;
        this.emit("shotPop", { x: s.x, y: s.y, z: s.z, fire: s.fire });
        continue;
      }
      const d = Math.hypot(s.x - p.x, s.y - pcy, s.z - p.z);
      if (this.status === "play" && d < (p.spin > 0 ? 1.25 : 0.62)) {
        s.dead = true;
        if (p.spin > 0) this.emit("shotPop", { x: s.x, y: s.y, z: s.z, fire: s.fire, deflect: true });
        else {
          this.hurt(s.x - s.vx, s.z - s.vz, "shot");
          this.emit("shotPop", { x: s.x, y: s.y, z: s.z, fire: s.fire });
        }
      }
    }
    if (this.shots.length > 24) this.shots = this.shots.filter((s) => !s.dead);
  }

  /* -------------------------------------------------------------- boss */
  updateBoss(dt) {
    if (this.boss) bossStep(this, this.boss, dt);
  }

  /* -------------------------------------------------------------- animation state */
  animate(dt) {
    const p = this.player;
    let a;
    if (this.status === "complete") a = "win";
    else if (this.status === "dying" || this.status === "gameover") a = p.deathKind === "fall" ? "fall" : "ko";
    else if (p.lock > 0) a = "hit";
    else if (p.spin > 0) a = "spin";
    else if (!p.grounded) a = p.vy > 0 ? "jump" : "fall";
    else if (p.speed > 0.6) a = "run";
    else a = "idle";
    if (a !== p.anim) {
      p.anim = a;
      p.animT = 0;
    } else p.animT += dt;
  }
}

/* ======================================================================
   Boss — Mossjaw, the Jungle Guardian
   Pattern loop: slam → boulders → charge. Each attack is telegraphed
   (raised fists + red ring / target circles / a charge lane). After each
   attack it is tired (or dizzy after hitting the arena wall): only then can
   a spin or a stomp on its head hurt it.
   ====================================================================== */
const BOSS = { r: 1.5, h: 3.6, maxHp: 5 };
const ORDER = ["slam", "boulders", "charge"];

function makeBoss(d) {
  return {
    x: d.p[0], y: d.p[1], z: d.p[2], home: [...d.p], yaw: 0, arena: d.arena,
    hp: BOSS.maxHp, maxHp: BOSS.maxHp, r: BOSS.r, h: BOSS.h,
    state: "sleep", st: 0, ai: 0, phase: 1, inv: 0, active: false,
    rings: [], boulders: [], targets: [], chargeDir: [0, 1], vulnerable: false, flash: 0, defeated: false, deadT: 0,
  };
}
function resetBossForRespawn(B) {
  if (B.defeated) return;
  B.rings.length = 0;
  B.boulders.length = 0;
  if (B.active) {
    B.state = "idle";
    B.st = -1; // a breather after the player respawns
    B.x = B.home[0];
    B.z = B.home[2];
  }
}
function setB(g, B, s) {
  B.state = s;
  B.st = 0;
  B.vulnerable = s === "tired" || s === "dizzy";
  if (s !== "sleep" && s !== "intro" && s !== "idle" && s !== "hurt" && s !== "defeat" && s !== "tired" && s !== "dizzy") g.emit("bossState", { state: s });
}
function bossStep(g, B, dt) {
  const p = g.player;
  const A = B.arena; // [x0, z0, x1, z1]
  B.st += dt;
  B.inv = Math.max(0, B.inv - dt);
  B.flash = Math.max(0, B.flash - dt);
  const fast = B.phase === 2;
  const inArena = p.x > A[0] && p.x < A[2] && p.z > A[1] && p.z < A[3];
  const face = (k) => {
    let a = Math.atan2(p.x - B.x, p.z - B.z) - B.yaw;
    a = Math.atan2(Math.sin(a), Math.cos(a));
    B.yaw += a * Math.min(1, dt * k);
  };

  // shockwave rings
  for (const r of B.rings) {
    if (r.delay > 0) {
      r.delay -= dt;
      continue;
    }
    r.r += r.speed * dt;
    const d = Math.hypot(p.x - r.x, p.z - r.z);
    if (g.status === "play" && Math.abs(d - r.r) < 0.55 && p.y - B.y < 0.55) g.hurt(r.x, r.z, "shock");
  }
  B.rings = B.rings.filter((r) => r.r < 16);
  // boulders
  for (const b of B.boulders) {
    b.t += dt;
    const k = Math.min(1, b.t / b.T);
    b.x = b.sx + (b.tx - b.sx) * k;
    b.z = b.sz + (b.tz - b.sz) * k;
    b.y = b.sy + (B.y + 0.5 - b.sy) * k + Math.sin(Math.PI * k) * 6;
    if (k >= 1 && !b.done) {
      b.done = true;
      g.emit("boulder", { x: b.tx, z: b.tz });
      if (g.status === "play" && Math.hypot(p.x - b.tx, p.z - b.tz) < 1.55 && p.y - B.y < 1.4) g.hurt(b.tx, b.tz, "boulder");
    }
  }
  B.boulders = B.boulders.filter((b) => !b.done || b.t < b.T + 0.05);

  if (B.defeated) {
    B.deadT += dt;
    return;
  }
  switch (B.state) {
    case "sleep":
      if (inArena && p.z < A[3] - 1.5) {
        B.active = true;
        setB(g, B, "intro");
        g.emit("bossWake");
      }
      return;
    case "intro":
      face(3);
      if (B.st > 2.2) setB(g, B, "idle");
      break;
    case "idle":
      face(4);
      // drift back toward home between attacks
      {
        const hx = B.home[0] - B.x, hz = B.home[2] - B.z;
        const l = Math.hypot(hx, hz);
        if (l > 0.3) {
          const m = Math.min(l, 3 * dt);
          B.x += (hx / l) * m;
          B.z += (hz / l) * m;
        }
      }
      if (B.st > (fast ? 0.6 : 1.0)) {
        const next = ORDER[B.ai % ORDER.length];
        B.ai++;
        setB(g, B, next + "Tele");
        if (next === "charge") {
          const dx = p.x - B.x, dz = p.z - B.z;
          const l = Math.hypot(dx, dz) || 1;
          B.chargeDir = [dx / l, dz / l];
        }
      }
      break;
    case "slamTele":
      face(3);
      if (B.st > (fast ? 0.75 : 1.05)) {
        setB(g, B, "slam");
        B.rings.push({ x: B.x, z: B.z, r: 1.4, speed: fast ? 9.5 : 8 });
        if (fast) B.rings.push({ x: B.x, z: B.z, r: 1.4, speed: 9.5, delay: 0.75 });
        g.emit("bossSlam", { x: B.x, z: B.z });
      }
      break;
    case "slam":
      if (B.st > (fast ? 1.4 : 0.9)) setB(g, B, "tired");
      break;
    case "bouldersTele":
      face(4);
      if (B.st > 0.65) {
        setB(g, B, "boulders");
        B.thrown = 0;
      }
      break;
    case "boulders": {
      face(5);
      const n = fast ? 5 : 3;
      const gap = fast ? 0.42 : 0.55;
      if (B.thrown < n && B.st > B.thrown * gap) {
        // aim where the player is heading, inside the arena
        const lead = 0.45 + B.thrown * 0.05;
        const tx = clamp(p.x + p.vx * lead, A[0] + 1, A[2] - 1);
        const tz = clamp(p.z + p.vz * lead, A[1] + 1, A[3] - 1);
        B.boulders.push({ sx: B.x, sy: B.y + 4.2, sz: B.z, tx, tz, x: B.x, y: B.y + 4.2, z: B.z, t: 0, T: fast ? 1.0 : 1.15, done: false });
        B.thrown++;
        g.emit("bossThrow");
      }
      if (B.thrown >= n && B.st > n * gap + 1.2) setB(g, B, "tired");
      break;
    }
    case "chargeTele": {
      // aim during the first part of the wind-up, then the lane is locked
      if (B.st < (fast ? 0.35 : 0.55)) {
        const dx = p.x - B.x, dz = p.z - B.z;
        const l = Math.hypot(dx, dz) || 1;
        B.chargeDir = [dx / l, dz / l];
        B.yaw = Math.atan2(B.chargeDir[0], B.chargeDir[1]);
      }
      if (B.st > (fast ? 0.85 : 1.15)) setB(g, B, "charge");
      break;
    }
    case "charge": {
      const sp = fast ? 16 : 13;
      B.x += B.chargeDir[0] * sp * dt;
      B.z += B.chargeDir[1] * sp * dt;
      const m = B.r + 0.3;
      if (B.x < A[0] + m || B.x > A[2] - m || B.z < A[1] + m || B.z > A[3] - m || B.st > 2.5) {
        B.x = clamp(B.x, A[0] + m, A[2] - m);
        B.z = clamp(B.z, A[1] + m, A[3] - m);
        setB(g, B, "dizzy");
        g.emit("bossWall", { x: B.x, z: B.z });
      }
      break;
    }
    case "tired":
      if (B.st > (fast ? 1.9 : 2.4)) setB(g, B, "idle");
      break;
    case "dizzy":
      if (B.st > (fast ? 2.6 : 3.2)) setB(g, B, "idle");
      break;
    case "hurt":
      if (B.st > 1.0) {
        if (B.hp <= 0) {
          setB(g, B, "defeat");
        } else setB(g, B, "idle");
      }
      break;
    case "defeat":
      if (B.st > 3.2) {
        B.defeated = true;
        B.deadT = 0;
        B.rings.length = 0;
        if (g.portal) g.portal.open = true;
        g.stats.kills++;
        g.score += SCORE.boss;
        g.emit("bossDefeated", { x: B.x, z: B.z });
      }
      break;
    default:
      break;
  }

  // --- contact with the player
  if (g.status !== "play" || B.state === "sleep" || B.state === "defeat") return;
  const dx = p.x - B.x, dz = p.z - B.z;
  const d = Math.hypot(dx, dz) || 1e-3;
  const reach = B.r + PL.hw;
  const top = B.y + (B.vulnerable ? 2.4 : B.h);
  // spin hits (only while it's tired / dizzy)
  if (B.vulnerable && B.inv <= 0 && p.spin > 0 && d < reach + 1.0 && p.y < top + 0.5) return hitBoss(g, B, dx / d, dz / d);
  if (d < reach && p.y < top && p.y + PL.h > B.y) {
    const above = p.y > top - 0.7 && p.vy < 0;
    if (above) {
      if (B.vulnerable && B.inv <= 0) return hitBoss(g, B, dx / d, dz / d, true);
      p.vy = 9; // bounced off its head
      p.grounded = false;
      p.vx += (dx / d) * 4;
      p.vz += (dz / d) * 4;
      return;
    }
    // solid body: push out
    p.x = B.x + (dx / d) * (reach + 0.01);
    p.z = B.z + (dz / d) * (reach + 0.01);
    if (B.state === "charge") g.hurt(B.x, B.z, "boss");
  }
}
function hitBoss(g, B, nx, nz, stomp = false) {
  const p = g.player;
  B.hp--;
  B.inv = 1.2;
  B.flash = 0.5;
  if (B.hp <= Math.ceil(B.maxHp / 2) && B.phase === 1) {
    B.phase = 2;
    g.emit("bossPhase2");
  }
  setB(g, B, "hurt");
  B.vulnerable = false;
  g.score += 200;
  g.emit("bossHit", { x: B.x, y: B.y + 2.5, z: B.z, hp: B.hp });
  // knock the player clear so the next attack starts fair
  p.vx = nx * 9;
  p.vz = nz * 9;
  p.vy = stomp ? 12 : 8;
  p.grounded = false;
  p.spin = 0;
  p.lock = 0.25;
  if (B.hp <= 0) {
    B.rings.length = 0;
    B.boulders.length = 0;
    g.emit("bossDown", { x: B.x, z: B.z });
  }
}
export { BOSS };
