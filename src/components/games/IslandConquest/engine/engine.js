/**
 * Island Conquest — the ONE authoritative simulation.
 *
 * Islands, fleets, AI and the battle clock all live here. React, the 3D scene,
 * the HUD labels and the AI only READ this state (or call `send`), so they can
 * never disagree about who owns an island or how many troops it holds.
 *
 *  - Fixed-step (STEP) and delta-time based. Real frame time is clamped to
 *    MAX_FRAME before it is scaled by game speed, so returning from another tab
 *    or a debugger pause never produces a burst of troops: this is not an idle
 *    game. Hidden tab / pause / result screen → no steps at all.
 *  - Production is one central loop over islands — no per-island intervals.
 *  - Every send is validated at execution time (owner, troops, active battle)
 *    and deducts troops + creates the fleet in the same synchronous call, so a
 *    double click can never duplicate an army.
 *  - Fleets that reach their target are removed from the active list BEFORE
 *    they are resolved, in a stable order, so a fleet resolves exactly once.
 *    The outcome depends on the target's owner AT ARRIVAL (an attack on an
 *    island your other fleet already took becomes a reinforcement).
 *  - Combat is plain, predictable arithmetic (see resolveCombat). No dice.
 *
 * No React and no Three.js imports: the same file runs in tools/simTest.mjs.
 */
import {
  PLAYER,
  NEUTRAL,
  ENEMIES,
  ISLAND_TYPES,
  STEP,
  MAX_FRAME,
  FLEET_SPEED,
  CAPTURE_GRACE,
  RESULT_DELAY,
  ROUTE_CLEAR,
  SHORE_GAP,
  isEnemy,
} from "./constants.js";
import { createAI } from "./ai.js";

/* ================================================================ combat */
/**
 * `attackers` arrive at an island held by `defenders`, each defender worth
 * `defense` attackers (1 normally, 1.5 on a Fortress).
 *   attackers > defenders × defense → captured, survivors = the difference
 *   otherwise                       → defenders hold, losing attackers ÷ defense
 * A tie leaves the island with its owner and zero troops.
 */
export function resolveCombat(attackers, defenders, defense = 1) {
  const strength = defenders * defense;
  if (attackers > strength + 1e-9) {
    const remaining = Math.floor(attackers - strength + 1e-9);
    return { captured: true, remaining, attackerLost: attackers - remaining, defenderLost: defenders };
  }
  const remaining = Math.max(0, Math.ceil(defenders - attackers / defense - 1e-9));
  return { captured: false, remaining, attackerLost: attackers, defenderLost: defenders - remaining };
}

/** troops sent for a 25/50/100% order (never 0 while the island has any) */
export function sendAmount(troops, fraction) {
  if (troops < 1) return 0;
  if (fraction >= 1) return troops;
  return Math.max(1, Math.min(troops, Math.floor(troops * fraction)));
}

/* ================================================================ routes */
const ROUTE_SAMPLES = 40;
const CURVES = [0.08, 0.2, -0.1, 0.32, -0.22, 0.46, -0.34, 0.6, -0.48, 0.75, -0.62];
const CUBIC = [0, 0.12, -0.12, 0.24, -0.24, 0.36, -0.36, 0.5, -0.5];

function bezier(p0x, p0z, p1x, p1z, p2x, p2z, t) {
  const u = 1 - t;
  return [u * u * p0x + 2 * u * t * p1x + t * t * p2x, u * u * p0z + 2 * u * t * p1z + t * t * p2z];
}

/**
 * Sea route from island `a` to island `b`: a gentle quadratic curve leaving
 * and landing radially at the shorelines, bent further around any island in
 * the way. Returns arc-length samples so movement speed is constant.
 */
export function buildRoute(a, b, islands) {
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const L = Math.hypot(dx, dz) || 1;
  const nx = -dz / L;
  const nz = dx / L;
  let best = null;
  for (const c of CURVES) {
    const cx = (a.x + b.x) / 2 + nx * c * L;
    const cz = (a.z + b.z) / 2 + nz * c * L;
    const da = Math.hypot(cx - a.x, cz - a.z) || 1;
    const db = Math.hypot(cx - b.x, cz - b.z) || 1;
    const p0x = a.x + ((cx - a.x) / da) * (a.r + SHORE_GAP);
    const p0z = a.z + ((cz - a.z) / da) * (a.r + SHORE_GAP);
    const p2x = b.x + ((cx - b.x) / db) * (b.r + SHORE_GAP);
    const p2z = b.z + ((cz - b.z) / db) * (b.r + SHORE_GAP);
    const xs = new Float32Array(ROUTE_SAMPLES + 1);
    const zs = new Float32Array(ROUTE_SAMPLES + 1);
    let clear = Infinity;
    for (let i = 0; i <= ROUTE_SAMPLES; i++) {
      const [x, z] = bezier(p0x, p0z, cx, cz, p2x, p2z, i / ROUTE_SAMPLES);
      xs[i] = x;
      zs[i] = z;
      for (const o of islands) {
        if (o === a || o === b) {
          // the curve must not cut back across its own endpoints' islands
          if (i > 2 && i < ROUTE_SAMPLES - 2) clear = Math.min(clear, Math.hypot(x - o.x, z - o.z) - o.r - 0.05);
          continue;
        }
        clear = Math.min(clear, Math.hypot(x - o.x, z - o.z) - o.r - ROUTE_CLEAR);
      }
    }
    if (!best || clear > best.clear) best = { xs, zs, clear, curve: c };
    if (clear >= 0) break;
  }
  // crowded maps: a single bend is not enough — try S-curves (cubic) that
  // weave between islands, gentlest first
  if (best.clear < 0) {
    const opts = [];
    for (const c1 of CUBIC) for (const c2 of CUBIC) opts.push([c1, c2]);
    opts.sort((p, q) => Math.abs(p[0]) + Math.abs(p[1]) - Math.abs(q[0]) - Math.abs(q[1]));
    for (const [c1, c2] of opts) {
      const k1x = a.x + dx / 3 + nx * c1 * L;
      const k1z = a.z + dz / 3 + nz * c1 * L;
      const k2x = a.x + (2 * dx) / 3 + nx * c2 * L;
      const k2z = a.z + (2 * dz) / 3 + nz * c2 * L;
      const d1 = Math.hypot(k1x - a.x, k1z - a.z) || 1;
      const d2 = Math.hypot(k2x - b.x, k2z - b.z) || 1;
      const p0x = a.x + ((k1x - a.x) / d1) * (a.r + SHORE_GAP);
      const p0z = a.z + ((k1z - a.z) / d1) * (a.r + SHORE_GAP);
      const p3x = b.x + ((k2x - b.x) / d2) * (b.r + SHORE_GAP);
      const p3z = b.z + ((k2z - b.z) / d2) * (b.r + SHORE_GAP);
      const xs = new Float32Array(ROUTE_SAMPLES + 1);
      const zs = new Float32Array(ROUTE_SAMPLES + 1);
      let clear = Infinity;
      for (let i = 0; i <= ROUTE_SAMPLES && clear > best.clear; i++) {
        const t = i / ROUTE_SAMPLES;
        const u = 1 - t;
        const x = u * u * u * p0x + 3 * u * u * t * k1x + 3 * u * t * t * k2x + t * t * t * p3x;
        const z = u * u * u * p0z + 3 * u * u * t * k1z + 3 * u * t * t * k2z + t * t * t * p3z;
        xs[i] = x;
        zs[i] = z;
        for (const o of islands) {
          if (o === a || o === b) {
            if (i > 2 && i < ROUTE_SAMPLES - 2) clear = Math.min(clear, Math.hypot(x - o.x, z - o.z) - o.r - 0.05);
            continue;
          }
          clear = Math.min(clear, Math.hypot(x - o.x, z - o.z) - o.r - ROUTE_CLEAR);
        }
      }
      if (clear > best.clear) best = { xs, zs, clear, curve: c1 };
      if (clear >= 0) break;
    }
  }
  const cum = new Float32Array(ROUTE_SAMPLES + 1);
  for (let i = 1; i <= ROUTE_SAMPLES; i++) cum[i] = cum[i - 1] + Math.hypot(best.xs[i] - best.xs[i - 1], best.zs[i] - best.zs[i - 1]);
  return { xs: best.xs, zs: best.zs, cum, len: cum[ROUTE_SAMPLES], clear: best.clear >= 0, curve: best.curve };
}

/** position + heading at distance `d` along a route (writes into `out`) */
export function routePoint(route, d, out) {
  const { xs, zs, cum, len } = route;
  const dd = d <= 0 ? 0 : d >= len ? len : d;
  let i = 1;
  while (i < ROUTE_SAMPLES && cum[i] < dd) i++;
  const seg = cum[i] - cum[i - 1] || 1;
  const t = (dd - cum[i - 1]) / seg;
  out.x = xs[i - 1] + (xs[i] - xs[i - 1]) * t;
  out.z = zs[i - 1] + (zs[i] - zs[i - 1]) * t;
  out.hx = (xs[i] - xs[i - 1]) / seg;
  out.hz = (zs[i] - zs[i - 1]) / seg;
  return out;
}

/* ================================================================ rng */
export function rng(seed) {
  let s = seed >>> 0 || 1;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

const freshRun = () => ({
  time: 0,
  islandsCaptured: 0,
  neutralCaptured: 0,
  enemyCaptured: 0,
  islandsLost: 0,
  troopsGenerated: 0,
  troopsSent: 0,
  troopsLost: 0,
  enemyDefeated: 0,
  reinforcements: 0,
  largestArmy: 0,
  fleetsSent: 0,
});

/* ================================================================ engine */
export class Engine {
  constructor() {
    this.mode = "idle"; // idle | play | demo
    this.level = null;
    this.islands = [];
    this.byId = new Map();
    this.fleets = [];
    this.events = [];
    this.ais = [];
    this.speed = 1;
    this.paused = false;
    this.hidden = false;
    this.ended = false;
    this.result = null;
    this.pending = null;
    this.acc = 0;
    this.alpha = 0;
    this.nextFleetId = 1;
    this.hudT = 0;
    this.demoT = 0;
    this.run = freshRun();
    this.routes = new Map();
    this.cb = {};
    this.generation = 0;
  }

  get active() {
    return (this.mode === "play" || this.mode === "demo") && !this.ended;
  }

  /**
   * Build the authoritative state for a level. Everything from a previous
   * battle (fleets, AI timers, pending result, clock) is discarded here, so a
   * Restart can never leave an old fleet or a second AI loop behind.
   */
  load(level, { demo = false } = {}) {
    this.generation++;
    this.level = level;
    this.mode = demo ? "demo" : "play";
    this.islands = level.islands.map((d, idx) => {
      const T = ISLAND_TYPES[d.type];
      return {
        id: d.id,
        idx,
        type: d.type,
        x: d.x,
        z: d.z,
        r: T.r * (d.scale || 1),
        owner: d.owner,
        troops: Math.floor(d.troops),
        cap: d.cap ?? T.cap,
        rate: d.rate ?? T.rate,
        defense: T.defense,
        travel: T.travel,
        acc: 0,
        grace: 0,
        variant: d.variant ?? idx * 7 + level.id * 13,
        capturedAt: -10,
        lastOwner: d.owner,
      };
    });
    this.byId = new Map(this.islands.map((i) => [i.id, i]));
    this.routes = new Map();
    this.fleets = [];
    this.events = [];
    this.nextFleetId = 1;
    this.ended = false;
    this.result = null;
    this.pending = null;
    this.paused = false;
    this.acc = 0;
    this.alpha = 0;
    this.hudT = 0;
    this.demoT = 0;
    this.run = freshRun();
    this.eliminated = new Set();
    this.factionsInLevel = [...new Set(this.islands.map((i) => i.owner).filter((o) => o !== NEUTRAL))];
    const seed = level.seed ?? level.id * 7919;
    this.rand = rng(seed);
    const aiFactions = demo ? this.factionsInLevel : this.factionsInLevel.filter((f) => f !== PLAYER);
    this.ais = aiFactions.map((f, i) => {
      const cfg = demo ? { level: "normal" } : level.ai?.[f] || level.ai || { level: "normal" };
      return createAI(f, cfg, rng(seed + 101 * (i + 1)));
    });
  }

  unload() {
    this.generation++;
    this.mode = "idle";
    this.level = null;
    this.islands = [];
    this.byId = new Map();
    this.fleets = [];
    this.events = [];
    this.ais = [];
    this.routes = new Map();
    this.ended = false;
    this.pending = null;
  }

  setSpeed(s) {
    this.speed = s === 2 ? 2 : 1;
  }
  setPaused(p) {
    this.paused = !!p;
  }
  setHidden(h) {
    this.hidden = !!h;
  }

  island(id) {
    return this.byId.get(id) || null;
  }

  route(a, b) {
    const key = `${a.id}>${b.id}`;
    let r = this.routes.get(key);
    if (!r) {
      r = buildRoute(a, b, this.islands);
      this.routes.set(key, r);
    }
    return r;
  }

  /** seconds a fleet from `a` needs to reach `b` */
  travelTime(a, b) {
    return this.route(a, b).len / (FLEET_SPEED * a.travel);
  }

  /* ------------------------------------------------------------ orders */
  /**
   * Launch troops from `fromId` to `toId`. Exactly one of `fraction`
   * (0.25 / 0.5 / 1) or `count` decides the size. Validated against the
   * CURRENT state — a stale selection (island lost meanwhile) simply fails.
   */
  send(owner, fromId, toId, { fraction, count } = {}) {
    if (!this.active) return { ok: false, reason: "inactive" };
    if (this.mode === "play" && owner === PLAYER && this.paused) return { ok: false, reason: "paused" };
    const a = this.byId.get(fromId);
    const b = this.byId.get(toId);
    if (!a || !b) return { ok: false, reason: "missing" };
    if (a === b) return { ok: false, reason: "same" };
    if (a.owner !== owner) return { ok: false, reason: "owner" };
    if (a.troops < 1) return { ok: false, reason: "empty" };
    let n = count != null ? Math.floor(count) : sendAmount(a.troops, fraction ?? 0.5);
    n = Math.min(n, a.troops);
    if (n < 1) return { ok: false, reason: "empty" };
    // deduct + create in one synchronous step
    a.troops -= n;
    const route = this.route(a, b);
    const fleet = {
      id: this.nextFleetId++,
      owner,
      from: a.id,
      to: b.id,
      troops: n,
      d: 0,
      len: route.len,
      speed: FLEET_SPEED * a.travel,
      route,
      launchedAt: this.run.time,
      hostileTo: b.owner,
    };
    this.fleets.push(fleet);
    if (this.mode === "play" && owner === PLAYER) {
      this.run.troopsSent += n;
      this.run.fleetsSent++;
      this.run.largestArmy = Math.max(this.run.largestArmy, n);
      if (b.owner === PLAYER) this.run.reinforcements++;
    }
    this.events.push({ type: "launch", fleet: fleet.id, owner, from: a.id, to: b.id, troops: n, targetOwner: b.owner });
    return { ok: true, fleet, amount: n };
  }

  /* ------------------------------------------------------------ frame */
  /** real seconds → fixed steps (clamped, speed-scaled, paused-aware) */
  frame(realDt) {
    if (!this.active || this.paused || this.hidden) {
      if (this.mode === "demo" && this.ended && !this.hidden) this.demoTick(Math.min(realDt, MAX_FRAME));
      return;
    }
    const dt = Math.min(Math.max(realDt, 0), MAX_FRAME) * this.speed;
    this.acc += dt;
    let n = 0;
    while (this.acc >= STEP && n < 12) {
      this.step(STEP);
      this.acc -= STEP;
      n++;
      if (!this.active) break;
    }
    if (n >= 12) this.acc = 0;
    this.alpha = this.acc / STEP;
    this.hudT -= dt;
    if (this.hudT <= 0) {
      this.hudT = 0.12;
      if (this.cb.hud) this.cb.hud(this.hud());
    }
  }

  demoTick(dt) {
    this.demoT += dt;
    if (this.demoT > 2.5 && this.level) this.load(this.level, { demo: true });
  }

  step(h) {
    if (!this.active) return;
    const run = this.run;
    run.time += h;

    // 1. production (central loop, owned islands only)
    for (const i of this.islands) {
      if (i.owner === NEUTRAL) continue;
      if (i.grace > 0) {
        i.grace -= h;
        continue;
      }
      if (i.troops >= i.cap) {
        i.acc = 0;
        continue;
      }
      i.acc += i.rate * h;
      while (i.acc >= 1 - 1e-9 && i.troops < i.cap) {
        i.troops++;
        i.acc -= 1;
        if (i.owner === PLAYER && this.mode === "play") run.troopsGenerated++;
      }
    }

    // 2. fleets: advance, then pull arrivals out BEFORE resolving them
    let arrived = null;
    for (const f of this.fleets) {
      f.d += f.speed * h;
      if (f.d >= f.len) (arrived || (arrived = [])).push(f);
    }
    if (arrived) {
      this.fleets = this.fleets.filter((f) => f.d < f.len);
      // earliest arrival first (largest overshoot), then launch order
      arrived.sort((p, q) => (q.d - q.len) / q.speed - (p.d - p.len) / p.speed || p.id - q.id);
      for (const f of arrived) this.arrive(f);
    }

    // 3. AI (each on its own decision timer — never per frame)
    for (const ai of this.ais) ai.tick(this, h);

    // 4. result
    this.checkResult(h);
  }

  arrive(f) {
    if (f.resolved) return; // belt and braces: a fleet resolves once
    f.resolved = true;
    const t = this.byId.get(f.to);
    if (!t) return;
    const run = this.run;
    const play = this.mode === "play";
    if (t.owner === f.owner) {
      t.troops += f.troops;
      this.events.push({ type: "arrive", kind: "reinforce", fleet: f.id, owner: f.owner, island: t.id, troops: f.troops });
      return;
    }
    const prev = t.owner;
    const c = resolveCombat(f.troops, t.troops, t.defense);
    if (play) {
      if (f.owner === PLAYER) {
        run.troopsLost += c.attackerLost;
        if (isEnemy(prev)) run.enemyDefeated += c.defenderLost;
      } else if (prev === PLAYER) {
        run.troopsLost += c.defenderLost;
        if (isEnemy(f.owner)) run.enemyDefeated += c.attackerLost;
      }
    }
    if (c.captured) {
      // atomic ownership change
      t.owner = f.owner;
      t.troops = c.remaining;
      t.acc = 0;
      t.grace = CAPTURE_GRACE;
      t.lastOwner = prev;
      t.capturedAt = run.time;
      if (play) {
        if (f.owner === PLAYER) {
          run.islandsCaptured++;
          if (prev === NEUTRAL) run.neutralCaptured++;
          else run.enemyCaptured++;
        } else if (prev === PLAYER) run.islandsLost++;
      }
      this.events.push({ type: "arrive", kind: "capture", fleet: f.id, owner: f.owner, island: t.id, troops: f.troops, defenders: c.defenderLost });
      this.events.push({ type: "capture", island: t.id, from: prev, to: f.owner, troops: c.remaining });
      this.checkEliminated(prev);
    } else {
      t.troops = c.remaining;
      this.events.push({ type: "arrive", kind: "repelled", fleet: f.id, owner: f.owner, island: t.id, troops: f.troops, defenders: t.troops, defOwner: prev });
    }
  }

  alive(faction) {
    for (const i of this.islands) if (i.owner === faction) return true;
    for (const f of this.fleets) if (f.owner === faction) return true;
    return false;
  }

  checkEliminated(faction) {
    if (faction === NEUTRAL || this.eliminated.has(faction)) return;
    if (!this.alive(faction)) {
      this.eliminated.add(faction);
      this.events.push({ type: "eliminated", faction });
    }
  }

  /**
   * Victory: no enemy island AND no enemy fleet at sea. Defeat: no player
   * island AND no player fleet. Both are re-checked when the short delay
   * runs out, against the current authoritative state.
   */
  checkResult(h) {
    if (this.ended) return;
    const playerAlive = this.alive(PLAYER);
    let enemiesAlive = false;
    for (const e of ENEMIES) if (this.alive(e)) enemiesAlive = true;
    for (const e of ENEMIES) if (this.factionsInLevel.includes(e)) this.checkEliminated(e);
    let want = null;
    if (!playerAlive) want = "lost";
    else if (!enemiesAlive) want = "won";
    if (this.mode === "demo") {
      // demo backdrop: any one faction left standing → restart the show
      const left = this.factionsInLevel.filter((f) => this.alive(f));
      want = left.length <= 1 ? "demo" : null;
    }
    if (!want) {
      this.pending = null;
      return;
    }
    if (!this.pending || this.pending.result !== want) this.pending = { result: want, t: RESULT_DELAY };
    this.pending.t -= h;
    if (this.pending.t > 0) return;
    this.finish(want);
  }

  finish(result) {
    if (this.ended) return;
    this.ended = true;
    this.result = result;
    this.pending = null;
    if (this.mode === "demo") {
      this.demoT = 0;
      return;
    }
    const summary = this.summary(result);
    this.events.push({ type: "over", result });
    if (this.cb.hud) this.cb.hud(this.hud());
    if (this.cb.over) this.cb.over(summary);
  }

  summary(result) {
    const L = this.level;
    const t = this.run.time;
    let stars = 0;
    if (result === "won") stars = t <= L.stars[1] ? 3 : t <= L.stars[0] ? 2 : 1;
    const enemyLeft = this.islands.filter((i) => isEnemy(i.owner)).length;
    return { result, levelId: L.id, stars, time: t, enemyIslandsLeft: enemyLeft, run: { ...this.run } };
  }

  /* ------------------------------------------------------------ hud */
  hud() {
    const own = { player: 0, red: 0, purple: 0, neutral: 0 };
    const troops = { player: 0, red: 0, purple: 0, neutral: 0 };
    const rate = { player: 0, red: 0, purple: 0 };
    for (const i of this.islands) {
      own[i.owner]++;
      troops[i.owner] += i.troops;
      if (i.owner !== NEUTRAL) rate[i.owner] += i.rate;
    }
    for (const f of this.fleets) troops[f.owner] += f.troops;
    return {
      time: this.run.time,
      own,
      troops,
      rate,
      speed: this.speed,
      ended: this.ended,
      result: this.result,
      factions: this.factionsInLevel,
      total: this.islands.length,
    };
  }
}
