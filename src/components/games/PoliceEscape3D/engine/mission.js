/**
 * Police Escape 3D — one mission attempt: the single authoritative simulation.
 *
 *   COUNTDOWN         3 · 2 · 1 · GO — police idle with lights on behind you
 *   PLAYING           the pursuit: player, police (FSM), traffic, roadblocks,
 *                     pickups, checkpoints, the escape zone
 *   BUSTED            integrity 0, boxed in by police (bust meter full) or
 *                     the time limit ran out — the run stops, nothing advances
 *   MISSION_COMPLETE  drove into the open escape zone
 * (MENU / MISSION_SELECT / GARAGE / PAUSED live in the React shell; pausing
 * simply stops stepping the run.)
 *
 * Mission types: escape · time (limit) · survive (zone opens after N s) ·
 * checkpoint (ordered checkpoints, then the zone) · roadblock (barriers on the
 * routes) · final (checkpoints + survive + zone).
 *
 * Pursuit intensity 1–3 (2 / 3 / 4 police; roadblocks at 3) rises over time
 * per mission. Police that lose you leave the chase (evaded) and are replaced
 * later from out of view — never ahead of you.
 *
 * Fixed 120 Hz steps, seeded randomness: the same inputs replay the same run.
 */
import { buildCity, locate, fieldFrom, sourcesAt, lineOfSight, edgePoint, nearestNode } from "./city.js";
import { createCar, paramsFor, stepCar, impactDamage, placeCar, CAR_R, AXLE } from "./car.js";
import { createPolice, policeThink, placePolice, PSTATE } from "./police.js";
import { createTraffic, stepTraffic, knockTraffic } from "./traffic.js";
import { mulberry32, clamp, wrapAngle } from "./util.js";

export const STEP = 1 / 120;
export const STATE = Object.freeze({ COUNTDOWN: "COUNTDOWN", PLAYING: "PLAYING", BUSTED: "BUSTED", COMPLETE: "MISSION_COMPLETE" });
const COUNT = 3.2;
const DIRS = { E: Math.PI / 2, W: -Math.PI / 2, S: 0, N: Math.PI };
const BUST_TIME = 2.4;
const CP_R = 13;
const NITRO_R = 3.2;
const NITRO_REGEN = 18;

const cityCache = new Map();
export function cityFor(def) {
  if (!cityCache.has(def)) {
    if (cityCache.size > 6) cityCache.delete(cityCache.keys().next().value);
    cityCache.set(def, buildCity({ ...def.city, zone: def.zone }));
  }
  return cityCache.get(def);
}

/** Starting pose: a node, then 16 m down the road in `dir`, right lane. */
export function startPose(city, def) {
  const n = city.intNode(def.start.node[0], def.start.node[1]);
  const node = city.nodes[n];
  const h = DIRS[def.start.dir];
  const fx = Math.sin(h);
  const fz = Math.cos(h);
  const adj = node.adj.find((a) => {
    const m = city.nodes[a.to];
    const dx = m.x - node.x;
    const dz = m.z - node.z;
    const L = Math.hypot(dx, dz);
    return (dx * fx + dz * fz) / L > 0.9;
  });
  const e = adj ? city.edges[adj.e] : null;
  const lane = e ? Math.min(3.4, e.w / 4) : 0;
  const d = def.start.at ?? 22;
  return { x: node.x + fx * d - Math.cos(h) * lane, z: node.z + fz * d + Math.sin(h) * lane, h, node: n, edge: e };
}

/** Roadblock rectangles + prop layout on an edge (always leaves a gap). */
export function roadblockOn(city, e, at, gapSide = "L", id = 0) {
  const p = edgePoint(city, e, e.len * at, 0);
  const gap = 6.2;
  const w = e.w;
  const half = w / 2;
  // lateral span (+ = left of a→b) that is blocked
  const lo = gapSide === "L" ? -half - 1 : -half + gap;
  const hi = gapSide === "L" ? half - gap : half + 1;
  const depth = 3.2;
  const ux = Math.sin(p.h);
  const uz = Math.cos(p.h);
  const lx = uz;
  const lz = -ux;
  const corners = [];
  for (const s of [-depth / 2, depth / 2]) for (const l of [lo, hi]) corners.push([p.x + ux * s + lx * l, p.z + uz * s + lz * l]);
  const rect = { x0: Math.min(...corners.map((c) => c[0])), x1: Math.max(...corners.map((c) => c[0])), z0: Math.min(...corners.map((c) => c[1])), z1: Math.max(...corners.map((c) => c[1])), kind: "roadblock" };
  return { id, e: e.id, at, x: p.x, z: p.z, h: p.h, lo, hi, gapSide, rect, passed: false, hit: false };
}

export function createMission(def, carDef, opts = {}) {
  const city = opts.city || cityFor(def);
  const rand = mulberry32((def.id || 1) * 7919 + (opts.seed || 0));
  const sp = startPose(city, def);
  const player = createCar(paramsFor(carDef.stats), sp.x, sp.z, sp.h);
  player.nitro = 0.6;
  const pol = def.police || {};
  const run = {
    def,
    city,
    carDef,
    player,
    rand,
    state: STATE.COUNTDOWN,
    countdown: COUNT,
    clock: 0,
    time: 0,
    acc: 0,
    events: [],
    paused: false,
    integrity: 100,
    graceUntil: 0,
    bust: 0,
    police: [],
    nextCopId: 0,
    intensity: 1,
    traffic: createTraffic(city, opts.traffic ?? def.traffic ?? 10, rand),
    roadblocks: [],
    nitros: (def.nitros || []).map(([spec, at], i) => {
      const es = city.segEdges(spec);
      const e = es[Math.floor(es.length / 2)] || city.edges[0];
      const p = edgePoint(city, e, e.len * at, 0);
      return { id: i, x: p.x, z: p.z, taken: -99 };
    }),
    checkpoints: (def.checkpoints || []).map(([i, j]) => {
      const n = city.nodes[city.intNode(i, j)];
      return { x: n.x, z: n.z, node: n.id, done: false };
    }),
    cpIndex: 0,
    zoneOpen: false,
    fieldP: null,
    fieldI: null,
    fieldAge: 99,
    nextBlockT: 20,
    stats: { distance: 0, nitroUsed: 0, evaded: 0, roadblocksAvoided: 0, hits: 0, nearMisses: 0, copsDisabled: 0 },
    results: null,
    ai: opts.ai || null,
    lastCount: 4,
    nearCool: new Map(),
    fieldCache: new Map(),
    stuckT: 0,
    resetCool: 0,
  };
  run.zoneOpen = zoneOpenFor(run);
  // static roadblocks (edges with a roadblock are routed around by AI)
  for (const e of city.edges) e.blocked = false;
  for (const rb of def.roadblocks || []) {
    const es = city.segEdges(rb.seg);
    const e = es[Math.floor(es.length / 2)];
    if (e) {
      e.blocked = true;
      run.roadblocks.push(roadblockOn(city, e, rb.at ?? 0.5, rb.gap || "L", run.roadblocks.length));
    }
  }
  // police start behind the player, lights on
  const n0 = pol.start ?? 2;
  for (let k = 0; k < n0; k++) spawnCop(run, "start");
  run.tick = (dt, input) => tick(run, dt, input);
  run.drain = () => {
    const e = run.events;
    run.events = [];
    return e;
  };
  run.stepN = (n, input) => {
    for (let i = 0; i < n; i++) step(run, input);
  };
  run.fieldTo = (node) => {
    if (!run.fieldCache.has(node)) {
      if (run.fieldCache.size > 24) run.fieldCache.delete(run.fieldCache.keys().next().value);
      run.fieldCache.set(node, fieldFrom(city, [{ node, cost: 0 }]));
    }
    return run.fieldCache.get(node);
  };
  return run;
}

function zoneOpenFor(run) {
  const t = run.def.type;
  run.heatLock = false;
  if (run.cpIndex < run.checkpoints.length) return false;
  if ((t === "survive" || t === "final") && run.time < (run.def.survive || 0)) return false;
  // "lose the police first": no pursuer within def.clear metres that can
  // SEE you (break line of sight in an alley / round a corner and you're in)
  if (run.def.clear && run.state === STATE.PLAYING) {
    for (const c of run.police) {
      if (c.state === PSTATE.LOST || c.state === PSTATE.DISABLED) continue;
      if (c.sees && Math.hypot(c.car.x - run.player.x, c.car.z - run.player.z) < run.def.clear) {
        run.heatLock = true;
        return false;
      }
    }
  }
  return true;
}

/** Spawn a police car: at the start (behind the player) or later from out of view. */
function spawnCop(run, why, relax = false) {
  const { city, player } = run;
  const pol = run.def.police || {};
  const fx = Math.sin(player.h);
  const fz = Math.cos(player.h);
  const pq = locate(city, player.x, player.z);
  const fieldP = fieldFrom(city, sourcesAt(city, pq));
  const cands = [];
  for (const n of city.nodes) {
    if (n.kind === "zone") continue;
    const gd = fieldP[n.id];
    const dx = n.x - player.x;
    const dz = n.z - player.z;
    const d = Math.hypot(dx, dz);
    const ahead = (dx * fx + dz * fz) / Math.max(1, d);
    if (why === "start") {
      // tier 0: behind, close · tier 1: beside, a bit further · tier 2: anywhere
      // on the roads 40–320 m away (corner starts), least-ahead first
      if (relax === 2) {
        if (gd < 40 || gd > 320) continue;
      } else if (gd < 45 || gd > (relax ? 220 : 150) || ahead > (relax ? 0.5 : -0.2)) continue;
    } else {
      if (gd < 150 || gd > 300 || ahead > 0.3 || lineOfSight(city, n.x, n.z, player.x, player.z)) continue;
    }
    if (run.police.some((c) => c.state !== PSTATE.LOST && Math.hypot(c.car.x - n.x, c.car.z - n.z) < 20)) continue;
    cands.push({ n, score: gd + run.rand() * 40, ahead });
  }
  if (!cands.length) return why === "start" && relax !== 2 ? spawnCop(run, why, relax ? 2 : 1) : null;
  if (relax === 2) for (const c of cands) c.score = c.ahead * 400 + c.score;
  cands.sort((a, b) => a.score - b.score);
  const pick = cands[Math.min(cands.length - 1, run.police.length % 2)].n;
  const skill = { speed: pol.speed ?? 0.93, accel: pol.accel ?? 1 };
  const cop = createPolice(run.nextCopId++, city, pick.x, pick.z, 0, skill);
  // face toward the player's side of the graph
  let best = null;
  for (const a of pick.adj) if (!best || fieldP[a.to] < fieldP[best.to]) best = a;
  placePolice(city, cop, pick.id, best ? best.to : -1);
  cop.state = why === "start" ? PSTATE.PATROL : PSTATE.PURSUIT;
  run.police.push(cop);
  run.events.push({ type: "copSpawn", id: cop.id });
  return cop;
}

function activeCops(run) {
  return run.police.filter((c) => c.state !== PSTATE.LOST);
}

function tick(run, dt, input) {
  if (run.paused) return;
  run.acc = Math.min(run.acc + dt, 0.25);
  while (run.acc >= STEP) {
    run.acc -= STEP;
    step(run, input);
  }
}

const IDLE = { throttle: 0, brake: 0, steer: 0, handbrake: false, nitro: false, reset: false };

function step(run, input) {
  const dt = STEP;
  const { city, player } = run;
  const ev = run.events;
  if (run.state === STATE.BUSTED || run.state === STATE.COMPLETE) {
    // the world keeps idling a little behind the result card (cars coast)
    stepCar(player, city, { brake: 1 }, dt, { extra: run.roadblocks.map((r) => r.rect) });
    return;
  }
  run.clock += dt;
  const inp = run.ai ? run.ai(run) : input ? input.frame() : IDLE;

  if (run.state === STATE.COUNTDOWN) {
    run.countdown -= dt;
    const n = Math.ceil(run.countdown - 0.2);
    if (n < run.lastCount && n >= 1) {
      run.lastCount = n;
      ev.push({ type: "count", n });
    }
    stepTrafficAll(run, dt);
    if (run.countdown <= 0) {
      run.state = STATE.PLAYING;
      for (const c of run.police) c.state = PSTATE.PURSUIT;
      ev.push({ type: "go" });
    }
    return;
  }

  // --- PLAYING ----------------------------------------------------------------------
  run.time += dt;
  run.resetCool = Math.max(0, run.resetCool - dt);
  // reset if stuck (R): back on the nearest road, facing along it
  if (inp.reset && run.resetCool <= 0) {
    run.resetCool = 2;
    const q = locate(city, player.x, player.z, 60);
    const e = city.edges[q.e];
    const p = edgePoint(city, e, clamp(q.t, 6, e.len - 6), 0);
    const fwdA = Math.cos(wrapAngle(player.h - p.h)) >= 0;
    placeCar(player, p.x, p.z, fwdA ? p.h : wrapAngle(p.h + Math.PI));
    ev.push({ type: "reset" });
  }
  const px0 = player.x;
  const pz0 = player.z;
  const rbRects = run.roadblocks.map((r) => r.rect);
  const imp = stepCar(player, city, inp, dt, { extra: rbRects });
  run.stats.nitroUsed += player.nitroOn ? dt : 0;
  const moved = Math.hypot(player.x - px0, player.z - pz0);
  run.stats.distance += moved;
  player.nitro = Math.min(1, player.nitro + moved / 900); // refills slowly with distance
  for (const h of imp) {
    const dmg = impactDamage(h.vn, player.p, h.kind === "roadblock" ? 1.3 : 1);
    damage(run, dmg, h);
    if (h.kind === "roadblock") markRoadblockHit(run, h.x, h.z);
  }

  // --- police --------------------------------------------------------------------------
  run.fieldAge += dt;
  const pq = locate(city, player.x, player.z, 30);
  if (pq && run.fieldAge > 0.3) {
    run.fieldAge = 0;
    run.fieldP = fieldFrom(city, sourcesAt(city, pq));
    // intercept target: two nodes ahead along the direction of travel
    const e = city.edges[pq.e];
    const A = city.nodes[e.a];
    const B = city.nodes[e.b];
    const goingB = (B.x - A.x) * player.vx + (B.z - A.z) * player.vz >= 0;
    let node = goingB ? e.b : e.a;
    let prev = goingB ? e.a : e.b;
    for (let k = 0; k < 1; k++) {
      const n = city.nodes[node];
      const fx = n.x - city.nodes[prev].x;
      const fz = n.z - city.nodes[prev].z;
      let best = null;
      let bd = -Infinity;
      for (const a of n.adj) {
        if (a.to === prev) continue;
        const m = city.nodes[a.to];
        const dot = (m.x - n.x) * fx + (m.z - n.z) * fz;
        if (dot > bd) {
          bd = dot;
          best = a.to;
        }
      }
      if (best == null) break;
      prev = node;
      node = best;
    }
    run.fieldI = run.fieldTo(node);
    run.interceptNode = node;
  }
  const ctx = {
    city,
    player,
    fieldP: run.fieldP,
    fieldI: run.fieldI,
    active: true,
    rand: run.rand,
    fieldTo: run.fieldTo,
    respawnBehind: (cop) => respawnBehind(run, cop),
    others: run.police,
  };
  for (const cop of run.police) {
    if (cop.state === PSTATE.LOST) continue;
    const ci = policeThink(cop, ctx, dt);
    const ims = stepCar(cop.car, city, ci, dt, { extra: rbRects });
    for (const h of ims) if (h.vn > 17 && cop.state !== PSTATE.DISABLED) disableCop(run, cop, h.vn);
    if (cop.state === PSTATE.LOST) {
      run.stats.evaded++;
      ev.push({ type: "copLost", id: cop.id });
    }
  }
  // --- traffic ---------------------------------------------------------------------------
  stepTrafficAll(run, dt);
  // --- car ↔ car -------------------------------------------------------------------------
  carContacts(run);

  // --- intensity / spawns -------------------------------------------------------------------
  const pol = run.def.police || {};
  const ramp = pol.ramp || [60, 120];
  const maxI = pol.max ?? 1;
  const wantI = Math.min(maxI, 1 + (run.time > ramp[0] ? 1 : 0) + (run.time > ramp[1] ? 1 : 0));
  if (wantI !== run.intensity) {
    run.intensity = wantI;
    ev.push({ type: "intensity", level: wantI });
  }
  const wantCops = Math.min(4, (pol.start ?? 2) + (run.intensity - 1));
  const live = activeCops(run).length;
  run.spawnT = (run.spawnT ?? 6) - dt;
  if (live < wantCops && run.spawnT <= 0) {
    run.spawnT = 8;
    spawnCop(run, "later");
  }
  // dynamic roadblocks at full intensity (or roadblock missions)
  if ((run.intensity >= 3 || run.def.dynamicBlocks) && run.time > run.nextBlockT) {
    run.nextBlockT = run.time + (run.def.dynamicBlocks ? 18 : 26);
    placeDynamicRoadblock(run, pq);
  }
  roadblockProgress(run);

  // --- bust meter: boxed in by police while (nearly) stopped ----------------------------------
  let boxed = 0;
  for (const cop of activeCops(run)) if (cop.state !== PSTATE.DISABLED && Math.hypot(cop.car.x - player.x, cop.car.z - player.z) < 8.5) boxed++;
  if (boxed && Math.abs(player.fwd) < 4.5) run.bust = Math.min(1, run.bust + (dt / BUST_TIME) * (boxed > 1 ? 1.4 : 1));
  else run.bust = Math.max(0, run.bust - dt / 1.2);

  // --- pickups / checkpoints / zone -------------------------------------------------------------
  for (const nt of run.nitros) {
    if (run.clock - nt.taken < NITRO_REGEN) continue;
    if (Math.hypot(nt.x - player.x, nt.z - player.z) < NITRO_R) {
      nt.taken = run.clock;
      player.nitro = Math.min(1, player.nitro + 0.4);
      ev.push({ type: "nitro" });
    }
  }
  if (run.cpIndex < run.checkpoints.length) {
    const cp = run.checkpoints[run.cpIndex];
    if (Math.hypot(cp.x - player.x, cp.z - player.z) < CP_R) {
      cp.done = true;
      run.cpIndex++;
      player.nitro = Math.min(1, player.nitro + 0.15);
      ev.push({ type: "checkpoint", n: run.cpIndex, of: run.checkpoints.length });
    }
  }
  const open = zoneOpenFor(run);
  if (open && !run.zoneOpen && !run.zoneAnnounced) {
    run.zoneAnnounced = true;
    ev.push({ type: "zoneOpen" });
  }
  run.zoneOpen = open;
  const z = city.zone;
  if (open && z && z.rect && player.x > z.rect.x0 && player.x < z.rect.x1 && player.z > z.rect.z0 && player.z < z.rect.z1) {
    finish(run);
    return;
  }
  // --- failure ----------------------------------------------------------------------------------
  if (run.def.timeLimit && run.time >= run.def.timeLimit) bust(run, "time");
  else if (run.integrity <= 0) bust(run, "wrecked");
  else if (run.bust >= 1) bust(run, "caught");
}

function stepTrafficAll(run, dt) {
  const actors = [run.player, ...activeCops(run).map((c) => c.car)];
  stepTraffic(run.traffic, dt, run.player, actors, run.clock);
}

function damage(run, dmg, h) {
  dmg = Math.min(dmg, 24); // one impact never wrecks a healthy car
  // a short grace after a big hit: a pile-up costs a little more, not a wreck
  if (run.time < run.graceUntil) dmg *= 0.35;
  else if (dmg >= 10) run.graceUntil = run.time + 2;
  if (dmg > 0) {
    run.integrity = Math.max(0, run.integrity - dmg);
    run.stats.hits++;
  }
  run.events.push({ type: "hit", vn: h.vn, x: h.x, z: h.z, kind: h.kind, dmg });
  run.player.bump = Math.min(1, run.player.bump + h.vn / 20);
}

function disableCop(run, cop, vn) {
  cop.state = PSTATE.DISABLED;
  cop.disabledT = 2.2 + Math.min(2, vn / 15);
  run.stats.copsDisabled++;
  run.events.push({ type: "copDisabled", id: cop.id, x: cop.car.x, z: cop.car.z });
}

function respawnBehind(run, cop) {
  const { city, player } = run;
  const fx = Math.sin(player.h);
  const fz = Math.cos(player.h);
  let best = null;
  for (const n of city.nodes) {
    if (n.kind === "zone") continue;
    const dx = n.x - player.x;
    const dz = n.z - player.z;
    const d = Math.hypot(dx, dz);
    if (d < 120 || d > 260 || (dx * fx + dz * fz) / d > 0 || lineOfSight(city, n.x, n.z, player.x, player.z)) continue;
    if (!best || d < best.d) best = { n, d };
  }
  if (best) placePolice(city, cop, best.n.id, best.n.adj[0]?.to ?? -1);
}

/** Circle-pair contacts: player, police, traffic (kinematic, gets knocked). */
function carContacts(run) {
  const { player } = run;
  const dyn = [{ car: player, kind: "player", m: player.p.mass }];
  for (const c of activeCops(run)) dyn.push({ car: c.car, kind: "police", m: 1.25, cop: c });
  const circles = (car) => {
    const s = Math.sin(car.h);
    const c = Math.cos(car.h);
    return [
      [car.x + s * AXLE, car.z + c * AXLE],
      [car.x - s * AXLE, car.z - c * AXLE],
    ];
  };
  const R2 = CAR_R * 2;
  // dynamic ↔ dynamic
  for (let i = 0; i < dyn.length; i++)
    for (let j = i + 1; j < dyn.length; j++) {
      const A = dyn[i];
      const B = dyn[j];
      if (Math.abs(A.car.x - B.car.x) > 7 || Math.abs(A.car.z - B.car.z) > 7) continue;
      let best = null;
      for (const a of circles(A.car))
        for (const b of circles(B.car)) {
          const dx = b[0] - a[0];
          const dz = b[1] - a[1];
          const d = Math.hypot(dx, dz);
          if (d < R2 && (!best || d < best.d)) best = { d, nx: dx / (d || 1), nz: dz / (d || 1) };
        }
      if (!best) continue;
      const pen = R2 - best.d;
      const mt = A.m + B.m;
      A.car.x -= best.nx * pen * (B.m / mt);
      A.car.z -= best.nz * pen * (B.m / mt);
      B.car.x += best.nx * pen * (A.m / mt);
      B.car.z += best.nz * pen * (A.m / mt);
      const rv = (B.car.vx - A.car.vx) * best.nx + (B.car.vz - A.car.vz) * best.nz;
      if (rv < 0) {
        const j = (-(1 + 0.25) * rv) / (1 / A.m + 1 / B.m);
        A.car.vx -= (j / A.m) * best.nx;
        A.car.vz -= (j / A.m) * best.nz;
        B.car.vx += (j / B.m) * best.nx;
        B.car.vz += (j / B.m) * best.nz;
        const vn = -rv;
        if (A.kind === "player" || B.kind === "player") {
          const other = A.kind === "player" ? B : A;
          if (other.cop.hitCool <= 0 || vn > 6) {
            other.cop.hitCool = 0.5;
            const dmg = impactDamage(vn, player.p, 0.75);
            damage(run, dmg, { vn, x: (A.car.x + B.car.x) / 2, z: (A.car.z + B.car.z) / 2, kind: "police" });
          }
          if (vn > 15 && other.cop.state !== PSTATE.DISABLED) disableCop(run, other.cop, vn);
        } else if (vn > 28) {
          if (A.cop.state !== PSTATE.DISABLED) disableCop(run, A.cop, vn);
          if (B.cop.state !== PSTATE.DISABLED) disableCop(run, B.cop, vn);
        }
      }
    }
  // dynamic ↔ traffic
  for (const t of run.traffic.cars) {
    if (!t.active) continue;
    for (const A of dyn) {
      if (Math.abs(A.car.x - t.x) > 7 || Math.abs(A.car.z - t.z) > 7) continue;
      let best = null;
      for (const a of circles(A.car))
        for (const b of circles(t)) {
          const dx = b[0] - a[0];
          const dz = b[1] - a[1];
          const d = Math.hypot(dx, dz);
          if (d < R2 && (!best || d < best.d)) best = { d, nx: dx / (d || 1), nz: dz / (d || 1) };
        }
      if (!best) {
        // near miss: fast pass close by without touching
        if (A.kind === "player" && Math.abs(player.fwd) > 18) {
          const d = Math.hypot(t.x - player.x, t.z - player.z);
          const k = `t${t.id}`;
          if (d < 4.6 && (run.nearCool.get(k) ?? -9) < run.clock - 3) {
            run.nearCool.set(k, run.clock);
            player.nitro = Math.min(1, player.nitro + 0.06);
            run.stats.nearMisses++;
            run.events.push({ type: "nearMiss" });
          }
        }
        continue;
      }
      const pen = R2 - best.d;
      // the dynamic car takes most of the separation; traffic gets shoved
      A.car.x -= best.nx * pen * 0.7;
      A.car.z -= best.nz * pen * 0.7;
      const tvx = Math.sin(t.h) * t.v;
      const tvz = Math.cos(t.h) * t.v;
      const rv = (tvx - A.car.vx) * best.nx + (tvz - A.car.vz) * best.nz;
      if (rv < 0) {
        const vn = -rv;
        A.car.vx += rv * best.nx * 0.9;
        A.car.vz += rv * best.nz * 0.9;
        knockTraffic(t, best.nx * Math.min(3, vn * 0.12 + pen), best.nz * Math.min(3, vn * 0.12 + pen), (run.rand() - 0.5) * Math.min(0.8, vn * 0.04));
        if (A.kind === "player") damage(run, impactDamage(vn, player.p, 0.8), { vn, x: t.x, z: t.z, kind: "traffic" });
        else if (vn > 16) disableCop(run, A.cop, vn);
      }
    }
  }
  // near misses with police
  for (const c of activeCops(run)) {
    const d = Math.hypot(c.car.x - player.x, c.car.z - player.z);
    const k = `p${c.id}`;
    if (d > 4.4 && d < 6 && Math.abs(player.fwd) > 18 && (run.nearCool.get(k) ?? -9) < run.clock - 4) {
      run.nearCool.set(k, run.clock);
      player.nitro = Math.min(1, player.nitro + 0.05);
      run.stats.nearMisses++;
      run.events.push({ type: "nearMiss" });
    }
  }
}

function markRoadblockHit(run, x, z) {
  for (const r of run.roadblocks) if (Math.hypot(r.x - x, r.z - z) < 14) r.hit = true;
}

function roadblockProgress(run) {
  const { player } = run;
  for (const r of run.roadblocks) {
    if (r.passed) continue;
    const ux = Math.sin(r.h);
    const uz = Math.cos(r.h);
    const along = (player.x - r.x) * ux + (player.z - r.z) * uz;
    const lat = Math.abs((player.x - r.x) * uz - (player.z - r.z) * ux);
    if (Math.abs(along) > 6 && Math.abs(along) < 9 && lat < 12) {
      if (r.lastSide != null && Math.sign(along) !== r.lastSide) {
        r.passed = true;
        if (!r.hit) {
          run.stats.roadblocksAvoided++;
          run.events.push({ type: "roadblockPassed" });
        }
      }
    }
    if (Math.abs(along) > 6) r.lastSide = Math.sign(along);
    // warning when approaching (ahead, within 160 m, in view down the road)
    const d = Math.hypot(player.x - r.x, player.z - r.z);
    const fx = Math.sin(player.h);
    const fz = Math.cos(player.h);
    const ahead = ((r.x - player.x) * fx + (r.z - player.z) * fz) / Math.max(1, d);
    if (!r.warned && d < 170 && ahead > 0.6) {
      r.warned = true;
      run.events.push({ type: "roadblockWarn", gap: r.gapSide });
    }
  }
}

/**
 * A fair roadblock: on a road edge whose near end is 120–230 m ahead of the
 * player along the road they're heading down, never on their current edge,
 * always with a gap. Max 3 live dynamic blocks (oldest removed).
 */
function placeDynamicRoadblock(run, pq) {
  const { city, player } = run;
  if (!pq) return;
  const fx = Math.sin(player.h);
  const fz = Math.cos(player.h);
  const field = fieldFrom(city, sourcesAt(city, pq));
  const cands = city.edges.filter((e) => {
    if (e.kind === "drive" || e.kind === "alley" || e.len < 50 || e.id === pq.e) return false;
    const mid = edgePoint(city, e, e.len / 2, 0);
    const d = Math.min(field[e.a], field[e.b]);
    const dx = mid.x - player.x;
    const dz = mid.z - player.z;
    const ahead = (dx * fx + dz * fz) / Math.max(1, Math.hypot(dx, dz));
    return d > 120 && d < 230 && ahead > 0.55 && !run.roadblocks.some((r) => r.e === e.id);
  });
  if (!cands.length) return;
  const e = cands[Math.floor(run.rand() * cands.length)];
  const dyn = run.roadblocks.filter((r) => r.dynamic);
  if (dyn.length >= 3) {
    city.edges[dyn[0].e].blocked = false;
    run.roadblocks.splice(run.roadblocks.indexOf(dyn[0]), 1);
  }
  run.fieldCache.clear(); // routes change with the roadblocks
  const rb = roadblockOn(city, e, 0.5, run.rand() < 0.5 ? "L" : "R", run.roadblocks.length + 100);
  rb.dynamic = true;
  e.blocked = true; // police / traffic route around it
  run.roadblocks.push(rb);
  run.events.push({ type: "roadblockSpawn" });
}

function finish(run) {
  run.state = STATE.COMPLETE;
  const time = Math.round(run.time * 100) / 100;
  const s = run.def.stars || {};
  const target = s.time ?? Infinity;
  const stars = 1 + (time <= target ? 1 : 0) + (time <= target && run.integrity >= (s.integrity ?? 50) ? 1 : 0);
  run.results = { time, stars, integrity: Math.round(run.integrity), stats: { ...run.stats, time } };
  run.events.push({ type: "complete", results: run.results });
}

function bust(run, why) {
  run.state = STATE.BUSTED;
  run.bustWhy = why;
  run.player.nitroOn = false;
  run.events.push({ type: "busted", why });
}

export { nearestNode };
