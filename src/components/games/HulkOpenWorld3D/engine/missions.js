/**
 * Hulk: Open World 3D — mission / activity runtime (framework-free).
 *
 * A scenario is a list of steps (data/missions.js). Each step type has a
 * start() that spawns what it needs and an update() that checks REAL world
 * state (enemy hit points, prop damage states, hero position / height,
 * civilian survival, zone integrity, convoy progress) and returns
 * "done", "fail:<reason>" or nothing. info() feeds the HUD: objective text,
 * progress, timer and world markers.
 */
import { MISSIONS, ACTIVITIES } from "../data/missions.js";
import { makeCivilian } from "./ambient.js";
import { HERO } from "./config.js";

/* ---------------------------------------------------------------- positions */
export function resolveAt(sim, spec, { snap = true, r = 4 } = {}) {
  if (!spec) return null;
  const s = sim.city.sites[spec.s];
  if (!s) throw new Error(`unknown site ${spec.s}`);
  const x = s.x + (spec.dx || 0);
  const z = s.z + (spec.dz || 0);
  if (s.y != null && !spec.dx && !spec.dz) return { x, z, y: s.y };
  if (!snap) return { x, z, y: sim.city.terrainH(x, z) };
  return sim.safeSpot(x, z, r);
}

/** rooftop chain: each roof reachable from the previous one with a super leap */
export function roofChain(sim, near, n, seedOff = 0) {
  const C = sim.city;
  const s = C.sites[near];
  const roofs = [];
  for (const b of C.buildings) {
    if (b.roof !== "flat") continue;
    const t = b.tiers[b.tiers.length - 1];
    const top = t.y1;
    if (top < 9 || top > 34) continue;
    const w = t.x1 - t.x0;
    const d = t.z1 - t.z0;
    if (w < 9 || d < 9) continue;
    roofs.push({ x: (t.x0 + t.x1) / 2, z: (t.z0 + t.z1) / 2, y: top, b: b.id, w, d });
  }
  // depth-first search for a chain of n roofs, each a comfortable super leap from the last
  const cands = (cur, used) => {
    const list = [];
    for (const r of roofs) {
      if (used.has(r.b)) continue;
      const d = Math.hypot(r.x - cur.x, r.z - cur.z);
      if (d < 16 || d > 64) continue;
      if (r.y - cur.y > 17) continue; // a full leap rises ~23 m
      const away = Math.hypot(r.x - s.x, r.z - s.z);
      list.push({ r, sc: Math.abs(d - 34) - away * 0.12 + (((r.b * 7 + seedOff) % 11) - 5) });
    }
    return list.sort((a, b) => a.sc - b.sc).slice(0, 5).map((c) => c.r);
  };
  let best = [];
  let budget = 4000;
  const dfs = (cur, used, chain) => {
    if (chain.length > best.length) best = chain.slice();
    if (chain.length >= n || --budget <= 0) return chain.length >= n;
    for (const r of cands(cur, used)) {
      used.add(r.b);
      chain.push(r);
      if (dfs(r, used, chain)) return true;
      chain.pop();
      used.delete(r.b);
    }
    return false;
  };
  dfs({ x: s.x, z: s.z, y: 0 }, new Set(), []);
  return best.map((r) => clearRoofSpot(sim, r));
}
function clearRoofSpot(sim, r) {
  for (const [dx, dz] of [[0, 0], [2.5, 0], [-2.5, 0], [0, 2.5], [0, -2.5], [3.5, 3.5], [-3.5, -3.5]]) {
    const x = r.x + dx;
    const z = r.z + dz;
    const g = sim.col.groundAt(x, z, r.y + 0.5, 0.6, 1, false);
    if (Math.abs(g.y - r.y) < 0.05) return { x, z, y: r.y };
  }
  return { x: r.x, z: r.z, y: r.y };
}

/* ---------------------------------------------------------------- scenario */
export function startScenario(sim, kind, id) {
  const def = kind === "mission" ? MISSIONS.find((m) => m.id === id) : ACTIVITIES.find((a) => a.id === id);
  if (!def) throw new Error(`no ${kind} ${id}`);
  const sc = { kind, def, stepI: -1, st: null, t: 0, done: false, failed: null, score: 0, lost: 0, best: 0 };
  sim.scenario = sc;
  if (kind === "mission") {
    if (def.rageStart) {
      sim.hero.rage = sim.hero.st.rageMax;
    }
    nextStep(sim, sc);
  } else startActivity(sim, sc);
  return sc;
}

function nextStep(sim, sc) {
  sc.stepI++;
  const step = sc.def.steps[sc.stepI];
  if (!step) {
    sc.done = true;
    sim.events.push({ type: "scenarioDone", sc });
    return;
  }
  sc.st = { step, t: 0, markers: [], units: [], props: [], civs: [] };
  STEP[step.type].start(sim, sc.st, sc);
  sim.events.push({ type: "step", label: step.label, i: sc.stepI, n: sc.def.steps.length });
}

export function updateScenario(sim, dt) {
  const sc = sim.scenario;
  if (!sc || sc.done || sc.failed) return;
  sc.t += dt;
  if (sc.kind === "activity") {
    updateActivity(sim, sc, dt);
    return;
  }
  const st = sc.st;
  st.t += dt;
  const r = STEP[st.step.type].update(sim, st, dt, sc);
  if (r === "done") {
    sim.events.push({ type: "objective", label: st.step.label });
    nextStep(sim, sc);
  } else if (r && r.startsWith("fail:")) {
    sc.failed = r.slice(5);
    sim.events.push({ type: "scenarioFailed", reason: sc.failed });
  }
}

export function scenarioInfo(sim) {
  const sc = sim.scenario;
  if (!sc) return null;
  if (sc.kind === "activity") return activityInfo(sim, sc);
  if (!sc.st) return null;
  const st = sc.st;
  const i = STEP[st.step.type].info(sim, st, sc) || {};
  return { title: sc.def.title, label: st.step.label, step: `${Math.min(sc.stepI + 1, sc.def.steps.length)}/${sc.def.steps.length}`, ...i, markers: st.markers };
}

/* ---------------------------------------------------------------- spawning helpers */
function spawnGroups(sim, st, groups, extra = {}) {
  const out = [];
  for (const g of groups || []) {
    const [type, n, at, o = {}] = g;
    const c = resolveAt(sim, at, { r: 6 });
    for (let i = 0; i < n; i++) {
      const a = (i / Math.max(1, n)) * Math.PI * 2 + 0.4;
      const rr = n > 1 ? (type === "apc" ? 9 : type === "heavyRobot" ? 4 : 3.2) : 0;
      const s = sim.safeSpot(c.x + Math.sin(a) * rr, c.z + Math.cos(a) * rr, 5, type === "apc" || type === "heavyRobot");
      const opts = { ...extra, tag: "mission" };
      if (o.aggro) opts.aggro = true;
      if (o.patrol) opts.patrol = [[s.x + 12, s.z], [s.x, s.z + 12], [s.x - 12, s.z], [s.x, s.z - 12]];
      if (type === "turret") opts.fixed = true;
      const e = sim.spawnEnemy(type, s.x, s.z, opts);
      out.push(e);
      st.units.push(e);
    }
  }
  return out;
}
const aliveOf = (list) => list.filter((e) => !e.dead);
const markerAt = (st, p, label, kind = "obj", extra = {}) => {
  const m = { x: p.x, y: p.y ?? 0, z: p.z, label, kind, ...extra };
  st.markers.push(m);
  return m;
};
function enemyMarkers(st, list) {
  st.markers = st.markers.filter((m) => m.kind !== "enemy");
  for (const e of aliveOf(list)) st.markers.push({ x: e.x, y: e.y + e.def.h + 1, z: e.z, kind: "enemy", ref: e });
}
function wavesRuntime(sim, st, waves, extra) {
  // returns true when every wave has spawned and been defeated
  st.wave = st.wave ?? 0;
  st.waveT = st.waveT ?? 0;
  st.waveT += sim.dtStep;
  while (st.wave < waves.length) {
    const w = waves[st.wave];
    const prevClear = !st.lastWave || aliveOf(st.lastWave).length === 0;
    const ready = w.after ? prevClear && st.waveT > 1.5 : st.t >= w.delay;
    if (!ready) break;
    st.lastWave = spawnGroups(sim, st, w.spawn, typeof extra === "function" ? extra(st.wave) : extra);
    st.wave++;
    st.waveT = 0;
    sim.events.push({ type: "wave", n: st.wave, of: waves.length });
  }
  return st.wave >= waves.length && aliveOf(st.units).length === 0;
}

/* ---------------------------------------------------------------- step types */
const STEP = {
  reach: {
    start(sim, st) {
      const p = resolveAt(sim, st.step.at);
      st.p = p;
      markerAt(st, p, st.step.roof ? "Roof" : "Go", st.step.roof ? "roof" : "obj");
    },
    update(sim, st) {
      const h = sim.hero;
      const d = Math.hypot(h.x - st.p.x, h.z - st.p.z);
      if (d > st.step.r) return null;
      if (st.step.minY != null && (h.y < st.step.minY - 0.6 || !h.grounded)) return null;
      return "done";
    },
    info(sim, st) {
      const d = Math.hypot(sim.hero.x - st.p.x, sim.hero.z - st.p.z);
      return { prog: `${Math.round(d)} m` };
    },
  },
  destroyAny: {
    start(sim, st) {
      st.base = sim.stats.destroyed;
    },
    update(sim, st) {
      return sim.stats.destroyed - st.base >= st.step.n ? "done" : null;
    },
    info(sim, st) {
      const n = Math.min(st.step.n, sim.stats.destroyed - st.base);
      return { prog: `${n} / ${st.step.n}`, frac: n / st.step.n };
    },
  },
  defeat: {
    start(sim, st) {
      if (!st.step.spawn || !st.step.spawn.length) st.units = sim.enemies.filter((e) => !e.dead && e.tag === "mission");
      else spawnGroups(sim, st, st.step.spawn);
      if (st.step.marker) markerAt(st, resolveAt(sim, st.step.marker), "Target", "area");
      st.total = st.units.length;
    },
    update(sim, st) {
      enemyMarkers(st, st.units);
      if (st.step.time && st.t > st.step.time) return "fail:Time ran out";
      return aliveOf(st.units).length === 0 ? "done" : null;
    },
    info(sim, st) {
      const left = aliveOf(st.units).length;
      return { prog: `${st.total - left} / ${st.total} defeated`, frac: (st.total - left) / Math.max(1, st.total), timer: st.step.time ? st.step.time - st.t : null };
    },
  },
  smashUse: {
    start(sim, st) {
      spawnGroups(sim, st, st.step.spawn);
      st.base = sim.counters.smashHits;
      st.total = st.units.length;
    },
    update(sim, st) {
      enemyMarkers(st, st.units);
      const n = sim.counters.smashHits - st.base;
      if (n >= st.step.n) return "done";
      return aliveOf(st.units).length === 0 ? "done" : null;
    },
    info(sim, st) {
      const n = Math.min(st.step.n, sim.counters.smashHits - st.base);
      return { prog: `${n} / ${st.step.n} smash hits`, frac: n / st.step.n };
    },
  },
  destroy: {
    start(sim, st) {
      const step = st.step;
      if (step.targets) {
        for (const [type, at] of step.targets) {
          const p = resolveAt(sim, at, { r: 4 });
          st.props.push(sim.spawnProp(type, p.x, p.z, { tag: "obj", clear: true }));
        }
      }
      if (step.tag) {
        for (const p of sim.props) {
          if (p.tag !== step.tag || p.mode === "gone") continue;
          if (step.arm) p.inert = false;
          st.props.push(p);
        }
      }
      spawnGroups(sim, st, step.spawn);
      if (step.marker) markerAt(st, resolveAt(sim, step.marker), "Target", "area");
      st.total = st.props.length;
    },
    update(sim, st) {
      st.markers = st.markers.filter((m) => m.kind !== "target");
      for (const p of st.props) if (p.state < 2 && p.mode !== "gone") st.markers.push({ x: p.x, y: p.y + p.def.hy * 2 + 1.5, z: p.z, kind: "target", ref: p });
      return st.props.every((p) => p.state === 2 || p.mode === "gone") ? "done" : null;
    },
    info(sim, st) {
      const n = st.props.filter((p) => p.state === 2 || p.mode === "gone").length;
      return { prog: `${n} / ${st.total} destroyed`, frac: n / Math.max(1, st.total) };
    },
  },
  protect: {
    start(sim, st) {
      for (const [at, n] of st.step.civs) {
        const c = resolveAt(sim, at);
        for (let i = 0; i < n; i++) {
          const s = sim.safeSpot(c.x + (i - (n - 1) / 2) * 1.6, c.z + (i % 2) * 1.2, 3);
          const civ = makeCivilian(sim, s.x, s.z, { critical: true, state: "cower", hp: 70 });
          sim.civilians.push(civ);
          st.civs.push(civ);
        }
      }
      st.lostBase = 0;
    },
    update(sim, st) {
      let k = 0;
      const live = st.civs.filter((c) => !c.dead);
      const done = wavesRuntime(sim, st, st.step.waves, () => ({ target: live.length ? live[k++ % live.length] : null }));
      // retarget attackers whose civilian died
      for (const e of st.units) if (!e.dead && e.target && e.target.dead) e.target = live.length ? live[(e.id % live.length)] : null;
      enemyMarkers(st, st.units);
      st.markers = st.markers.filter((m) => m.kind !== "civ");
      for (const c of live) st.markers.push({ x: c.x, y: c.y + 2.6, z: c.z, kind: "civ", ref: c });
      const lost = st.civs.length - live.length;
      if (lost >= st.step.maxLost) return "fail:Too many civilians were lost";
      return done ? "done" : null;
    },
    info(sim, st) {
      const live = st.civs.filter((c) => !c.dead).length;
      return { prog: `Civilians ${live} / ${st.civs.length} · Wave ${st.wave || 0}/${st.step.waves.length}`, frac: (st.wave || 0) / st.step.waves.length, danger: 1 - live / st.civs.length, dangerLabel: `Lost ${st.civs.length - live} of max ${st.step.maxLost - 1}` };
    },
  },
  defend: {
    start(sim, st) {
      const z = resolveAt(sim, st.step.zone, { snap: false });
      st.zone = { x: z.x, y: z.y || 0, z: z.z, r: st.step.r, hp: 100, dead: false, isZone: true };
      markerAt(st, st.zone, "Defend", "zone", { r: st.step.r });
    },
    update(sim, st, dt) {
      const done = wavesRuntime(sim, st, st.step.waves, { target: st.zone });
      let inside = 0;
      for (const e of st.units) if (!e.dead && Math.hypot(e.x - st.zone.x, e.z - st.zone.z) < st.zone.r) inside += e.type === "apc" || e.type === "heavyRobot" ? 3 : 1;
      if (inside) {
        st.zone.hp -= inside * 2.2 * dt;
        st.zoneHit = true;
      }
      enemyMarkers(st, st.units);
      if (st.zone.hp <= 0) return "fail:The zone was overrun";
      return done ? "done" : null;
    },
    info(sim, st) {
      return { prog: `Wave ${st.wave || 0}/${st.step.waves.length} · Zone ${Math.max(0, Math.round(st.zone.hp))}%`, frac: (st.wave || 0) / st.step.waves.length, danger: 1 - Math.max(0, st.zone.hp) / 100, dangerLabel: "Zone integrity" };
    },
  },
  waves: {
    start() {},
    update(sim, st) {
      const done = wavesRuntime(sim, st, st.step.waves, { aggro: true });
      enemyMarkers(st, st.units);
      return done ? "done" : null;
    },
    info(sim, st) {
      const left = aliveOf(st.units).length;
      return { prog: `Wave ${st.wave || 0}/${st.step.waves.length} · ${left} enemies left`, frac: (st.wave || 0) / st.step.waves.length };
    },
  },
  convoy: {
    start(sim, st) {
      const from = resolveAt(sim, st.step.from, { snap: false });
      const route = st.step.route;
      st.convoy = [];
      for (let i = 0; i < st.step.n; i++) {
        const x = Math.max(from.x, route[0][0]) - i * 16;
        const e = sim.spawnEnemy("apc", Math.max(3, route[0][0] - i * 16), route[0][1], { tag: "mission", route: route.map((p) => [p[0], p[1]]), heading: Math.PI / 2 });
        e.routeSpeed = 0.75;
        e.x = Math.max(-6, x);
        st.convoy.push(e);
        st.units.push(e);
      }
      spawnGroups(sim, st, st.step.escorts, { aggro: false });
      const end = route[route.length - 1];
      markerAt(st, { x: end[0], z: end[1] }, "Gate", "danger");
    },
    update(sim, st) {
      enemyMarkers(st, st.convoy);
      if (st.convoy.some((e) => e.escaped && !e.dead)) return "fail:The convoy reached the military zone";
      return st.convoy.every((e) => e.dead) ? "done" : null;
    },
    info(sim, st) {
      const left = st.convoy.filter((e) => !e.dead).length;
      // distance of the lead vehicle to the gate
      const end = st.step.route[st.step.route.length - 1];
      let lead = Infinity;
      for (const e of st.convoy) if (!e.dead) lead = Math.min(lead, Math.hypot(end[0] - e.x, end[1] - e.z));
      return { prog: `${st.convoy.length - left} / ${st.convoy.length} vehicles destroyed`, frac: (st.convoy.length - left) / st.convoy.length, danger: left ? 1 - Math.min(1, lead / 570) : 0, dangerLabel: left ? `Lead vehicle ${Math.round(lead)} m from the gate` : "" };
    },
  },
  rescue: {
    start(sim, st) {
      st.groups = [];
      for (const at of st.step.groups) {
        const c = resolveAt(sim, at, { r: 6 });
        const g = { x: c.x, z: c.z, civs: [], debris: [], freed: false };
        for (let i = 0; i < st.step.per; i++) {
          const civ = makeCivilian(sim, c.x + (i - 0.5) * 1.2, c.z, { critical: true, state: "trapped", hp: 80 });
          sim.civilians.push(civ);
          g.civs.push(civ);
          st.civs.push(civ);
        }
        for (const [dx, dz, rot] of [[0, 3.4, 0], [0, -3.4, 0], [3.6, 0, Math.PI / 2], [-3.6, 0, Math.PI / 2]]) g.debris.push(sim.spawnProp("debris", c.x + dx, c.z + dz, { rot, tag: "obj", clear: true }));
        st.groups.push(g);
      }
      st.safe = resolveAt(sim, st.step.safe);
      markerAt(st, st.safe, "Safe zone", "safe", { r: 6 });
      spawnGroups(sim, st, st.step.spawn);
    },
    update(sim, st) {
      for (const g of st.groups) {
        if (!g.freed && g.debris.every((p) => p.state === 2 || p.mode === "gone")) {
          g.freed = true;
          for (const c of g.civs) {
            if (c.dead) continue;
            c.state = "run";
            c.goal = { x: st.safe.x, z: st.safe.z };
          }
          sim.events.push({ type: "freed" });
        }
      }
      st.markers = st.markers.filter((m) => m.kind !== "civ" && m.kind !== "enemy");
      for (const g of st.groups) if (!g.freed) st.markers.push({ x: g.x, y: 3.5, z: g.z, kind: "civ", label: "Trapped" });
      for (const c of st.civs) if (!c.dead && c.state === "run") st.markers.push({ x: c.x, y: c.y + 2.6, z: c.z, kind: "civ", ref: c });
      const lost = st.civs.filter((c) => c.dead).length;
      if (lost >= st.step.maxLost + 1) return "fail:Too many civilians were lost";
      const pending = st.civs.filter((c) => !c.dead && !c.safe).length;
      return pending === 0 ? "done" : null;
    },
    info(sim, st) {
      const safe = st.civs.filter((c) => c.safe).length;
      const lost = st.civs.filter((c) => c.dead).length;
      const freed = st.groups.filter((g) => g.freed).length;
      return { prog: `Freed ${freed}/${st.groups.length} · Safe ${safe}/${st.civs.length}`, frac: safe / st.civs.length, danger: lost / (st.step.maxLost + 1), dangerLabel: `Lost ${lost} of max ${st.step.maxLost}` };
    },
  },
  roofs: {
    start(sim, st) {
      st.chain = roofChain(sim, st.step.near, st.step.n);
      st.i = 0;
      st.chain.forEach((p, i) => markerAt(st, p, `${i + 1}`, "roof", { idx: i }));
      // snipers on later roofs
      const n = st.step.snipers || 0;
      for (let k = 0; k < n && k + 1 < st.chain.length; k++) {
        const p = st.chain[st.chain.length - 1 - k * 2];
        if (!p) continue;
        const e = sim.spawnEnemy("soldier", p.x + 3, p.z + 3, { tag: "mission", fixed: true, y: p.y });
        st.units.push(e);
      }
    },
    update(sim, st) {
      const h = sim.hero;
      if (st.t > st.step.time) return "fail:Time ran out";
      const p = st.chain[st.i];
      if (!p) return "done";
      st.markers.forEach((m) => (m.active = m.idx === st.i));
      if (Math.hypot(h.x - p.x, h.z - p.z) < 7.5 && h.y > p.y - 0.8 && h.grounded) {
        st.i++;
        sim.events.push({ type: "checkpoint", n: st.i, of: st.chain.length });
        st.markers = st.markers.filter((m) => m.idx == null || m.idx >= st.i);
      }
      return st.i >= st.chain.length ? "done" : null;
    },
    info(sim, st) {
      return { prog: `Beacon ${Math.min(st.i + 1, st.chain.length)} / ${st.chain.length}`, frac: st.i / st.chain.length, timer: st.step.time - st.t };
    },
  },
  boss: {
    start(sim, st) {
      const p = resolveAt(sim, st.step.at, { r: 8 });
      st.boss = sim.spawnBoss(st.step.boss, p.x, p.z, { hpMul: st.step.hpMul, name: st.step.name, heading: Math.atan2(sim.hero.x - p.x, sim.hero.z - p.z) });
    },
    update(sim, st) {
      st.markers = st.markers.filter((m) => m.kind !== "enemy");
      for (const e of sim.enemies) if (!e.dead && e.tag === "bossAdd") st.markers.push({ x: e.x, y: e.y + e.def.h + 1, z: e.z, kind: "enemy", ref: e });
      if (st.boss.shield) for (const g of st.boss.gens) if (g.state < 2 && g.mode !== "gone") st.markers.push({ x: g.x, y: g.y + 5, z: g.z, kind: "enemy", ref: g, label: "Generator" });
      return st.boss.dead && st.boss.deadT > 3.3 ? "done" : null;
    },
    info(sim, st) {
      const b = st.boss;
      return { prog: b.shield ? `Shield up — destroy the generators (${b.gens.filter((g) => g.state === 2 || g.mode === "gone").length}/3)` : `${b.name} · Phase ${b.phase}`, frac: 1 - b.hp / b.maxHp, boss: b };
    },
  },
};

/* ================================================================ activities */
function startActivity(sim, sc) {
  const def = sc.def;
  const site = resolveAt(sim, def.site);
  sc.site = site;
  sc.markers = [];
  sc.units = [];
  sc.timeLeft = def.time || 0;
  switch (def.id) {
    case "destruction": {
      sc.base = sim.stats.destruction;
      // fresh material to wreck
      for (let i = 0; i < 18; i++) {
        const a = (i / 18) * Math.PI * 2;
        const r = 8 + (i % 3) * 6;
        const s = sim.safeSpot(site.x + Math.sin(a) * r, site.z + Math.cos(a) * r, 3);
        sim.spawnProp(["car", "barrel", "crate", "concrete", "van", "barrel"][i % 6], s.x, s.z, { rot: a, red: true, color: i * 7919, clear: true });
      }
      sc.markers.push({ x: site.x, y: 0, z: site.z, kind: "zone", r: 26, label: "Wreck it" });
      break;
    }
    case "longjump":
      sc.tries = 0;
      sc.best = 0;
      sc.pad = { x: site.x, z: site.z, y: site.y || 0 };
      sc.markers.push({ x: site.x, y: 0, z: site.z, kind: "pad", r: 5, label: "Launch pad" });
      for (const d of [40, 55, 70]) sc.markers.push({ x: site.x + d, y: 0, z: site.z, kind: "line", label: `${d} m`, len: 30 });
      break;
    case "arena":
      sc.kills0 = sim.stats.kills;
      sc.markers.push({ x: site.x, y: 0, z: site.z, kind: "zone", r: 30, label: "Arena" });
      break;
    case "rooftop":
      sc.chain = roofChain(sim, "dtEast", def.n, 3);
      sc.i = 0;
      sc.chain.forEach((p, i) => sc.markers.push({ x: p.x, y: p.y, z: p.z, kind: "roof", idx: i, label: `${i + 1}` }));
      break;
    case "throwing":
      sc.throws = 0;
      sc.rings = [30, 45, 60].map((d) => ({ x: site.x + d, z: site.z, d, pts: d === 30 ? 60 : d === 45 ? 80 : 100 }));
      for (const r of sc.rings) sc.markers.push({ x: r.x, y: 0, z: r.z, kind: "ring", r: 4, label: `${r.pts}` });
      sc.markers.push({ x: site.x, y: 0, z: site.z, kind: "pad", r: 8, label: "Throw from here" });
      for (let i = 0; i < 6; i++) {
        const s = sim.safeSpot(site.x - 10, site.z - 15 + i * 6, 3);
        sim.spawnProp(i % 3 === 2 ? "van" : "car", s.x, s.z, { rot: Math.PI / 2, color: i * 1234567, clear: true });
      }
      sc.pending = new Map();
      break;
    default:
  }
  sim.events.push({ type: "activityStart", id: def.id });
}

function finishActivity(sim, sc, success, reason) {
  sc.done = true;
  sc.success = success;
  sc.reason = reason;
  sim.events.push({ type: "activityDone", sc, success });
}

function updateActivity(sim, sc, dt) {
  const def = sc.def;
  const h = sim.hero;
  if (!h.alive) {
    finishActivity(sim, sc, false, "You were defeated");
    return;
  }
  if (def.time) sc.timeLeft = Math.max(0, def.time - sc.t);
  switch (def.id) {
    case "destruction":
      sc.score = Math.round(sim.stats.destruction - sc.base);
      if (sc.timeLeft <= 0) finishActivity(sim, sc, sc.score >= def.target, sc.score >= def.target ? "Target smashed!" : "Not enough destruction");
      break;
    case "longjump":
      for (const e of sim.events) {
        if (e.type === "leap" && Math.hypot(h.x - sc.pad.x, h.z - sc.pad.z) < 6) {
          sc.inJump = true;
          sc.tries++;
        }
        if (e.type === "leapLand" && sc.inJump) {
          sc.inJump = false;
          const d = Math.hypot(e.x - sc.pad.x, e.z - sc.pad.z);
          sc.last = d;
          sc.best = Math.max(sc.best, d);
          sc.score = Math.round(sc.best);
          sim.events.push({ type: "jumpScore", d });
          if (sc.tries >= def.tries) finishActivity(sim, sc, sc.best >= def.target, sc.best >= def.target ? "Huge leap!" : "Not far enough");
        }
      }
      break;
    case "arena": {
      sc.score = sim.stats.kills - sc.kills0;
      sc.spawnT = (sc.spawnT || 0) - dt;
      const alive = sc.units.filter((e) => !e.dead).length;
      const lvl = Math.min(4, Math.floor(sc.t / 20));
      if (alive < 3 + lvl && sc.spawnT <= 0 && sc.timeLeft > 4) {
        sc.spawnT = 2.5;
        const types = [["soldier"], ["soldier", "heavy"], ["soldier", "robot", "heavy"], ["robot", "heavy", "robot"], ["robot", "heavyRobot", "heavy"]][lvl];
        const a = sim.rand() * Math.PI * 2;
        const s = sim.safeSpot(sc.site.x + Math.sin(a) * 34, sc.site.z + Math.cos(a) * 34, 6);
        const t = types[Math.floor(sim.rand() * types.length)];
        if (t !== "heavyRobot" || !sc.units.some((e) => !e.dead && e.type === "heavyRobot")) sc.units.push(sim.spawnEnemy(t, s.x, s.z, { aggro: true, tag: "activity" }));
      }
      sc.markers = sc.markers.filter((m) => m.kind !== "enemy");
      if (sc.timeLeft <= 0) {
        for (const e of sc.units) if (!e.dead) sim.despawnEnemy(e);
        finishActivity(sim, sc, sc.score >= def.target, sc.score >= def.target ? "Arena champion!" : "Not enough defeats");
      }
      break;
    }
    case "rooftop": {
      const p = sc.chain[sc.i];
      sc.markers.forEach((m) => (m.active = m.idx === sc.i));
      if (p && Math.hypot(h.x - p.x, h.z - p.z) < 7.5 && h.y > p.y - 0.8 && h.grounded) {
        sc.i++;
        sim.events.push({ type: "checkpoint", n: sc.i, of: sc.chain.length });
        sc.markers = sc.markers.filter((m) => m.idx == null || m.idx >= sc.i);
      }
      sc.score = sc.i;
      if (sc.i >= sc.chain.length) finishActivity(sim, sc, true, `All checkpoints with ${sc.timeLeft.toFixed(1)} s to spare`);
      else if (sc.timeLeft <= 0) finishActivity(sim, sc, false, "Out of time");
      break;
    }
    case "throwing": {
      for (const e of sim.events) {
        if (e.type === "throw" && Math.hypot(h.x - sc.site.x, h.z - sc.site.z) < 16) {
          sc.throws++;
          sc.pending.set(e.prop, sc.throws);
        }
        if (e.type === "propLanded" && sc.pending.has(e.prop)) {
          sc.pending.delete(e.prop);
          let pts = 0;
          for (const r of sc.rings) {
            const d = Math.hypot(e.x - r.x, e.z - r.z);
            if (d < 4.5) pts = Math.max(pts, r.pts);
            else if (d < 9) pts = Math.max(pts, Math.round(r.pts / 2));
          }
          sc.score += pts;
          sim.events.push({ type: "throwScore", pts });
        }
      }
      if (sc.throws >= def.throws && sc.pending.size === 0) finishActivity(sim, sc, sc.score >= def.target, sc.score >= def.target ? "Bullseye!" : "Not enough points");
      break;
    }
    default:
  }
}

function activityInfo(sim, sc) {
  const def = sc.def;
  let prog = "";
  let frac = 0;
  switch (def.id) {
    case "destruction":
      prog = `Score ${sc.score} / ${def.target}`;
      frac = sc.score / def.target;
      break;
    case "longjump":
      prog = `Try ${Math.min(def.tries, sc.tries + (sc.inJump ? 0 : 1))}/${def.tries} · Best ${Math.round(sc.best)} m (need ${def.target} m)`;
      frac = sc.best / def.target;
      break;
    case "arena":
      prog = `Defeats ${sc.score} / ${def.target}`;
      frac = sc.score / def.target;
      break;
    case "rooftop":
      prog = `Checkpoint ${Math.min(sc.i + 1, sc.chain.length)} / ${sc.chain.length}`;
      frac = sc.i / sc.chain.length;
      break;
    case "throwing":
      prog = `Throws ${sc.throws}/${def.throws} · ${sc.score} pts (need ${def.target})`;
      frac = sc.score / def.target;
      break;
    default:
  }
  return { title: def.name, label: def.rules, prog, frac, timer: def.time ? sc.timeLeft : null, markers: sc.markers, step: "" };
}

export { HERO };
