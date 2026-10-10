/**
 * Web Hero — mission runtime. A mission is a list of sequential objective
 * steps (data/missions.js). Each step spawns what it needs when it starts,
 * reports progress + a waypoint for the HUD / minimap, and completes (or
 * fails) on clear conditions:
 *
 *   reach     get within r of a point
 *   defeat    defeat every enemy of the step's group
 *   rescue    reach each civilian and hold E
 *   protect   keep a target alive until the timer runs out / the waves are beaten
 *   disable   hold E on each device
 *   chase     catch a runner (touch, web pull/trap/strike) before it escapes
 *   collect   pick up every intel item
 *   boss      defeat the boss
 * Any step may carry `time` (seconds) → fail when it runs out.
 */
import { spawnEnemy } from "./enemies.js";
import { createBoss } from "./bosses.js";

export function startMission(W, spec) {
  W.mission = { spec, idx: -1, step: null, done: false, failed: null, stepT: 0 };
  // groups placed from the start (visible before their step begins)
  W.pre = {};
  for (const [name, group] of Object.entries(spec.pre || {})) W.pre[name] = spawnGroup(W, group, 0, {});
  nextStep(W);
}

function nextStep(W) {
  const M = W.mission;
  M.idx++;
  M.stepT = 0;
  if (M.idx >= M.spec.steps.length) {
    M.done = true;
    W.events.push({ type: "missionComplete" });
    return;
  }
  const s = M.spec.steps[M.idx];
  M.step = { ...s, progress: 0, total: 1, items: [] };
  const st = M.step;
  switch (s.type) {
    case "defeat":
    case "drones":
      st.ids = s.pre ? W.pre[s.pre] || [] : spawnGroup(W, s.group, M.idx, s);
      st.total = st.ids.length;
      if (s.pre) for (const e of W.enemies) if (st.ids.includes(e.id) && (e.state === "idle" || e.state === "patrol")) e.aggro = true;
      break;
    case "rescue":
      st.items = s.civs.map((c, i) => {
        const civ = { id: i, x: c.at.x, y: c.at.y, z: c.at.z, state: "cower", hold: 0, t: 0, label: c.label || "Civilian", tint: (i * 0.37 + M.idx * 0.13) % 1 };
        W.civilians.push(civ);
        return civ;
      });
      st.total = st.items.length;
      if (s.group) st.ids = spawnGroup(W, s.group, M.idx, s);
      break;
    case "disable":
      st.items = s.devices.map((d, i) => {
        const dev = { id: i, x: d.x, y: d.y, z: d.z, hold: 0, done: false };
        W.devices.push(dev);
        return dev;
      });
      st.total = st.items.length;
      if (s.group) st.ids = spawnGroup(W, s.group, M.idx, s);
      break;
    case "collect":
      st.items = s.items.map((p, i) => {
        const it = { id: i, x: p.x, y: p.y, z: p.z, got: false };
        W.intel.push(it);
        return it;
      });
      st.total = st.items.length;
      if (s.group) st.ids = spawnGroup(W, s.group, M.idx, s);
      break;
    case "protect":
      W.protect = { x: s.at.x, y: s.at.y, z: s.at.z, hp: s.hp || 100, maxHp: s.hp || 100, label: s.target || "Target" };
      st.wave = 0;
      st.ids = [];
      st.total = s.waves.length;
      spawnWave(W, st, s);
      break;
    case "chase": {
      const p0 = s.path[0];
      const e = spawnEnemy(W, "thug", p0.x, p0.y, p0.z, { group: `step${M.idx}`, state: "fleeing" });
      e.runner = { path: s.path, i: 1, speed: s.speed || 9.5, hop: 0 };
      e.hp = e.maxHp = 1;
      e.state = "flee";
      st.ids = [e.id];
      st.runner = e;
      if (s.group) st.ids.push(...spawnGroup(W, s.group, M.idx, s));
      break;
    }
    case "boss":
      W.boss = createBoss(W, s);
      W.events.push({ type: "bossIntro", name: W.boss.name });
      break;
    default:
      break;
  }
  W.events.push({ type: "objective", text: s.label, idx: M.idx });
}

function spawnGroup(W, group, idx, s) {
  const ids = [];
  if (!group) return ids;
  for (const g of group) {
    const n = g.n || 1;
    for (let k = 0; k < n; k++) {
      const a = (k / n) * Math.PI * 2 + idx;
      const rr = n > 1 ? g.spread ?? 3 : 0;
      const e = spawnEnemy(W, g.kind, g.at.x + Math.cos(a) * rr, g.at.y, g.at.z + Math.sin(a) * rr, { group: `step${idx}`, aggro: !!s.aggro || !!g.aggro, hpScale: W.hpScale, patrol: g.patrol, leash: g.leash });
      ids.push(e.id);
    }
  }
  return ids;
}

function spawnWave(W, st, s) {
  const wave = s.waves[st.wave];
  if (!wave) return;
  for (const g of wave) {
    for (let k = 0; k < (g.n || 1); k++) {
      const a = (k / (g.n || 1)) * Math.PI * 2;
      const e = spawnEnemy(W, g.kind, g.at.x + Math.cos(a) * 3, g.at.y, g.at.z + Math.sin(a) * 3, { group: "wave", aggro: true, hpScale: W.hpScale });
      e.objTarget = true;
      st.ids.push(e.id);
    }
  }
  W.events.push({ type: "wave", n: st.wave + 1, of: s.waves.length });
}

const alive = (W, ids) => (ids || []).filter((id) => W.enemies.some((e) => e.id === id && !e.dead && e.state !== "defeated")).length;

export function stepMission(W, dt, inp) {
  const M = W.mission;
  if (!M || M.done || M.failed) return;
  const st = M.step;
  const s = M.spec.steps[M.idx];
  const h = W.hero;
  M.stepT += dt;
  if (s.time && M.stepT > s.time) return fail(W, s.failText || "Out of time!");
  switch (s.type) {
    case "reach": {
      const d = Math.hypot(h.x - s.at.x, h.z - s.at.z);
      if (d < (s.r || 6) && Math.abs(h.y - s.at.y) < (s.dy || 6)) return nextStep(W);
      break;
    }
    case "defeat":
    case "drones": {
      st.progress = st.total - alive(W, st.ids);
      if (st.progress >= st.total) return nextStep(W);
      break;
    }
    case "rescue": {
      if (st.ids && alive(W, st.ids) > 0) {
        st.blocked = true;
      } else st.blocked = false;
      W.prompt = null;
      for (const c of st.items) {
        if (c.state !== "cower") continue;
        const d = Math.hypot(h.x - c.x, h.z - c.z);
        if (d < 2.4 && Math.abs(h.y - c.y) < 2.2) {
          if (st.blocked) {
            W.prompt = "Deal with the criminals first!";
            continue;
          }
          W.prompt = "Hold E to rescue";
          if (inp.interactHeld) {
            c.hold += dt;
            h.action = h.action === "none" ? "rescue" : h.action;
            h.actT = h.action === "rescue" ? h.actT : 0;
            if (c.hold > 0.8) {
              c.state = "rescued";
              c.t = 0;
              W.stats.rescues++;
              W.xp += 40;
              W.score += 400;
              W.gainEnergy(12);
              if (h.action === "rescue") h.action = "none";
              W.events.push({ type: "rescued", x: c.x, y: c.y, z: c.z });
            }
          } else {
            c.hold = Math.max(0, c.hold - dt * 2);
            if (h.action === "rescue") h.action = "none";
          }
        }
      }
      st.progress = st.items.filter((c) => c.state !== "cower").length;
      if (st.progress >= st.total) return nextStep(W);
      break;
    }
    case "disable": {
      W.prompt = null;
      for (const d of st.items) {
        if (d.done) continue;
        if (Math.hypot(h.x - d.x, h.z - d.z) < 2.6 && Math.abs(h.y - d.y) < 2.5) {
          W.prompt = "Hold E to disable";
          if (inp.interactHeld) {
            d.hold += dt;
            if (d.hold > 1.2) {
              d.done = true;
              W.xp += 30;
              W.score += 300;
              W.events.push({ type: "disabled", x: d.x, y: d.y, z: d.z });
            }
          } else d.hold = Math.max(0, d.hold - dt * 2);
        }
      }
      st.progress = st.items.filter((d) => d.done).length;
      if (st.progress >= st.total && alive(W, st.ids) === 0) return nextStep(W);
      if (st.progress >= st.total) st.label2 = "Defeat the guards";
      break;
    }
    case "collect": {
      for (const it of st.items) {
        if (it.got) continue;
        if (Math.hypot(h.x - it.x, h.y + 1 - it.y, h.z - it.z) < 2) {
          it.got = true;
          W.xp += 25;
          W.score += 250;
          W.events.push({ type: "intel", x: it.x, y: it.y, z: it.z });
        }
      }
      st.progress = st.items.filter((i) => i.got).length;
      if (st.progress >= st.total) return nextStep(W);
      break;
    }
    case "protect": {
      const P = W.protect;
      st.progress = st.wave;
      if (alive(W, st.ids) === 0) {
        st.wave++;
        if (st.wave >= s.waves.length) {
          W.protect = null;
          return nextStep(W);
        }
        spawnWave(W, st, s);
      }
      if (P.hp <= 0) return fail(W, `The ${P.label.toLowerCase()} was destroyed!`);
      break;
    }
    case "chase": {
      const e = st.runner;
      if (e.dead || e.state === "defeated") return nextStep(W);
      if (e.runner && e.runner.i >= e.runner.path.length) return fail(W, "The criminal got away!");
      break;
    }
    case "boss":
      if (W.boss && W.boss.defeated && W.boss.doneT > 2.5) return nextStep(W);
      break;
    default:
      return nextStep(W);
  }
}

export function fail(W, why) {
  if (W.mission.failed) return;
  W.mission.failed = why;
  W.events.push({ type: "missionFailed", why });
}

/** waypoint(s) for the HUD arrow + minimap */
export function waypoints(W) {
  const M = W.mission;
  if (!M || !M.step || M.done) return [];
  const s = M.spec.steps[M.idx];
  const st = M.step;
  switch (s.type) {
    case "reach":
      return [{ x: s.at.x, y: s.at.y, z: s.at.z }];
    case "defeat":
    case "drones":
    case "protect":
    case "chase": {
      const out = [];
      for (const e of W.enemies) if (!e.dead && e.state !== "defeated" && (st.ids || []).includes(e.id)) out.push({ x: e.x, y: e.y, z: e.z, enemy: true });
      if (W.protect) out.unshift({ x: W.protect.x, y: W.protect.y, z: W.protect.z, protect: true });
      return out;
    }
    case "rescue": {
      // guards first: while any are standing, THEY are the objective markers
      const guards = W.enemies.filter((e) => !e.dead && e.state !== "defeated" && (st.ids || []).includes(e.id));
      if (guards.length) return guards.map((e) => ({ x: e.x, y: e.y, z: e.z, enemy: true }));
      return st.items.filter((c) => c.state === "cower").map((c) => ({ x: c.x, y: c.y, z: c.z, civ: true }));
    }
    case "disable":
      return st.items.filter((d) => !d.done).map((d) => ({ x: d.x, y: d.y, z: d.z, device: true }));
    case "collect":
      return st.items.filter((d) => !d.got).map((d) => ({ x: d.x, y: d.y, z: d.z, intel: true }));
    case "boss":
      return W.boss ? [{ x: W.boss.e.x, y: W.boss.e.y, z: W.boss.e.z, enemy: true }] : [];
    default:
      return [];
  }
}

export function objectiveText(W) {
  const M = W.mission;
  if (!M || !M.step) return "";
  if (M.done) return "Mission complete!";
  const s = M.spec.steps[M.idx];
  const st = M.step;
  let t = s.label;
  if (st.label2) t = st.label2;
  if (["defeat", "drones", "rescue", "disable", "collect"].includes(s.type) && st.total > 1) t += ` (${st.progress}/${st.total})`;
  if (s.type === "protect") t += ` — wave ${Math.min(st.wave + 1, s.waves.length)}/${s.waves.length}`;
  return t;
}

/** runner logic (chase missions): follows its path, hops gaps on rooftops */
export function stepRunners(W, dt) {
  for (const e of W.enemies) {
    const r = e.runner;
    if (!r || e.dead || e.state === "defeated") continue;
    if (e.web > 0 || e.state === "stunned" || e.state === "down" || e.state === "airborne") continue;
    e.state = "flee";
    const p = r.path[Math.min(r.i, r.path.length - 1)];
    const dx = p.x - e.x;
    const dz = p.z - e.z;
    const d = Math.hypot(dx, dz);
    // the runner waits up for a hero who fell far behind (keeps it fair)
    const hd = Math.hypot(W.hero.x - e.x, W.hero.z - e.z);
    const sp = r.speed * (hd > 45 ? 0.35 : hd > 30 ? 0.7 : 1);
    if (d < 1) {
      r.i++;
      continue;
    }
    const step = Math.min(d, sp * dt);
    e.x += (dx / d) * step;
    e.z += (dz / d) * step;
    // height follows the path (rooftop hops arc between points)
    const prev = r.path[Math.max(0, r.i - 1)];
    const seg = Math.hypot(p.x - prev.x, p.z - prev.z) || 1;
    const u = 1 - d / seg;
    const lift = Math.abs(p.y - prev.y) > 0.5 || p.hop ? Math.sin(Math.PI * Math.max(0, Math.min(1, u))) * 3 : 0;
    e.y = prev.y + (p.y - prev.y) * Math.max(0, Math.min(1, u)) + lift;
    e.facing = Math.atan2(dx, dz);
    e.moving = true;
    // caught?
    if (hd < 1.8 && Math.abs(W.hero.y - e.y) < 2) {
      e.state = "stunned";
      e.stun = 99;
      e.runner = null;
      e.hp = 1;
      W.events.push({ type: "caught", x: e.x, y: e.y, z: e.z });
    }
  }
}
