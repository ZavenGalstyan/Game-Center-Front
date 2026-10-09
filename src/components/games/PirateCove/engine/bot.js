/**
 * Pirate Cove — autopilot that plays an adventure through the real engine
 * input (no shortcuts): used by tools/simTest.mjs to prove every adventure is
 * completable, and by the dev test hooks for browser QA.
 *
 *   at sea    A* over a coarse navigable grid → follow waypoints; in a "sink"
 *             step it holds the enemy abeam and fires the side whose arc
 *             contains it; slows for docking and presses Interact.
 *   ashore    A* over a fine walkability grid built from the same ground /
 *             collider rules the pirate uses; fights foes that come close,
 *             presses Interact on the objective.
 */
import { MODE } from "./constants.js";
import { groundAt, pushOut, STEP_UP, PIRATE_R } from "./onfoot.js";
import { gunRange } from "./cannons.js";
import { wrapAngle, clamp } from "./rng.js";
import { caveSDF } from "./cave.js";

// ------------------------------------------------------------------ A*

function astar(grid, sx, sz, tx, tz) {
  const { w, h, ok } = grid;
  const idx = (x, z) => z * w + x;
  const start = idx(sx, sz);
  const goal = idx(tx, tz);
  const g = new Float32Array(w * h).fill(Infinity);
  const came = new Int32Array(w * h).fill(-1);
  const open = [start];
  const inOpen = new Uint8Array(w * h);
  const f = new Float32Array(w * h).fill(Infinity);
  g[start] = 0;
  f[start] = Math.hypot(tx - sx, tz - sz);
  inOpen[start] = 1;
  const dirs = [
    [1, 0, 1],
    [-1, 0, 1],
    [0, 1, 1],
    [0, -1, 1],
    [1, 1, 1.414],
    [1, -1, 1.414],
    [-1, 1, 1.414],
    [-1, -1, 1.414],
  ];
  let iter = 0;
  while (open.length && iter++ < 200000) {
    // binary-heap-free: pick min f (open lists stay small with a good heuristic)
    let bi = 0;
    for (let i = 1; i < open.length; i++) if (f[open[i]] < f[open[bi]]) bi = i;
    const cur = open[bi];
    open[bi] = open[open.length - 1];
    open.pop();
    inOpen[cur] = 0;
    if (cur === goal) break;
    const cx = cur % w;
    const cz = (cur / w) | 0;
    for (const [dx, dz, c] of dirs) {
      const nx = cx + dx;
      const nz = cz + dz;
      if (nx < 0 || nz < 0 || nx >= w || nz >= h) continue;
      const ni = idx(nx, nz);
      if (!ok[ni]) continue;
      if (dx && dz && (!ok[idx(cx + dx, cz)] || !ok[idx(cx, cz + dz)])) continue;
      if (grid.edge && !grid.edge(cur, ni)) continue;
      const ng = g[cur] + c;
      if (ng < g[ni]) {
        g[ni] = ng;
        came[ni] = cur;
        f[ni] = ng + Math.hypot(tx - nx, tz - nz);
        if (!inOpen[ni]) {
          inOpen[ni] = 1;
          open.push(ni);
        }
      }
    }
  }
  if (came[goal] === -1 && goal !== start) return null;
  const path = [];
  let c = goal;
  while (c !== -1) {
    path.push(c);
    c = came[c];
  }
  path.reverse();
  return path;
}

function nearestOk(grid, x, z, maxR = 12) {
  const { w, h, ok } = grid;
  if (x >= 0 && z >= 0 && x < w && z < h && ok[z * w + x]) return [x, z];
  for (let r = 1; r <= maxR; r++) {
    for (let dz = -r; dz <= r; dz++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
        const nx = x + dx;
        const nz = z + dz;
        if (nx >= 0 && nz >= 0 && nx < w && nz < h && ok[nz * w + nx]) return [nx, nz];
      }
    }
  }
  return null;
}

// ------------------------------------------------------------------ grids

function seaGrid(game) {
  if (game._seaGrid) return game._seaGrid;
  const R = game.world.radius - 60;
  const cell = 8;
  const w = Math.ceil((2 * R) / cell);
  const ok = new Uint8Array(w * w);
  const T = game.T;
  for (let z = 0; z < w; z++) {
    for (let x = 0; x < w; x++) {
      const wx = -R + (x + 0.5) * cell;
      const wz = -R + (z + 0.5) * cell;
      if (Math.hypot(wx, wz) > R) continue;
      let bad = false;
      for (const [ox, oz] of [
        [0, 0],
        [9, 0],
        [-9, 0],
        [0, 9],
        [0, -9],
        [6, 6],
        [-6, 6],
        [6, -6],
        [-6, -6],
      ]) {
        if (T.height(wx + ox, wz + oz) > -2.6) {
          bad = true;
          break;
        }
      }
      ok[z * w + x] = bad ? 0 : 1;
    }
  }
  game._seaGrid = { w, h: w, ok, cell, ox: -R, oz: -R };
  return game._seaGrid;
}

function landGrid(game, islandId, area) {
  const key = `${islandId}|${area}|${game.landItems.filter((i) => i.kind === "gate" && i.open).map((i) => i.id).join(",")}`;
  game._landGrids = game._landGrids || new Map();
  if (game._landGrids.has(key)) return game._landGrids.get(key);
  const isl = game.world.byId.get(islandId);
  const land = game.world.landFor(islandId);
  const cell = 0.7;
  let x0;
  let z0;
  let size;
  if (area === "out") {
    size = isl.I.maxR * 2 + 50;
    x0 = isl.I.x - size / 2;
    z0 = isl.I.z - size / 2;
  } else {
    const C = isl.cave;
    const b = C.bounds;
    size = Math.max(b.maxX - b.minX, b.maxZ - b.minZ) + 4;
    x0 = C.origin.x + b.minX - 2;
    z0 = C.origin.z + b.minZ - 2;
  }
  const w = Math.ceil(size / cell);
  const ok = new Uint8Array(w * w);
  const hgt = new Float32Array(w * w);
  const plat = new Uint8Array(w * w);
  for (let z = 0; z < w; z++) {
    for (let x = 0; x < w; x++) {
      const wx = x0 + (x + 0.5) * cell;
      const wz = z0 + (z + 0.5) * cell;
      if (area !== "out") {
        const C = isl.cave;
        if (caveSDF(C, wx - C.origin.x, wz - C.origin.z) > -PIRATE_R - 0.15) continue;
      }
      // probe from high up so platforms count; then from terrain for the solid test
      let g = groundAt(land, area, wx, wz, 60);
      const gl = groundAt(land, area, wx, wz, g.h);
      if (gl.water || gl.wall) continue;
      g = gl;
      const p = pushOut(land, area, wx, wz, PIRATE_R + 0.12, g.h);
      if (Math.hypot(p.x - wx, p.z - wz) > 0.05) continue;
      ok[z * w + x] = 1;
      hgt[z * w + x] = g.h;
      plat[z * w + x] = g.plat ? 1 : 0;
    }
  }
  const grid = {
    w,
    h: w,
    ok,
    cell,
    ox: x0,
    oz: z0,
    edge: (a, b) => {
      const dh = hgt[b] - hgt[a];
      if (dh > STEP_UP - 0.05) return false;
      if (!plat[b] && dh > 0.12 && dh / cell > 1.25) return false;
      return true;
    },
  };
  game._landGrids.set(key, grid);
  return grid;
}

function planPath(grid, fx, fz, tx, tz) {
  const c = grid.cell;
  const s = nearestOk(grid, Math.floor((fx - grid.ox) / c), Math.floor((fz - grid.oz) / c));
  const t = nearestOk(grid, Math.floor((tx - grid.ox) / c), Math.floor((tz - grid.oz) / c), 20);
  if (!s || !t) return null;
  const p = astar(grid, s[0], s[1], t[0], t[1]);
  if (!p) return null;
  const pts = p.map((i) => ({ x: grid.ox + ((i % grid.w) + 0.5) * c, z: grid.oz + (((i / grid.w) | 0) + 0.5) * c }));
  // thin the path (keep every few cells)
  const step = grid.cell > 4 ? 2 : 3;
  const out = pts.filter((_, i) => i % step === 0 || i === pts.length - 1);
  out.push({ x: tx, z: tz });
  return out;
}

// ------------------------------------------------------------------ bot

export function createBot(game, opts = {}) {
  const presses = new Set();
  const input = {
    ship: { throttle: 0, steer: 0, setThrottle: null },
    foot: { mx: 0, mz: 0, sprint: false, block: false },
    camYaw: null,
    take(k) {
      if (presses.has(k)) {
        presses.delete(k);
        return true;
      }
      return false;
    },
    consumeLook: () => [0, 0],
  };
  const st = { path: null, pathKey: "", pathAt: -99, lastPos: null, stuckT: 0, interactCD: 0, attackCD: 0, log: [] };

  function press(k) {
    presses.add(k);
  }

  function follow(path, fx, fz, reach) {
    while (path && path.length > 1 && Math.hypot(path[0].x - fx, path[0].z - fz) < reach) path.shift();
    return path && path.length ? path[0] : null;
  }

  function seaStep() {
    const P = game.player;
    const step = game.currentStep();
    input.foot.mx = input.foot.mz = 0;
    input.camYaw = null;
    let target = game.objectivePos();
    const sinking = step && step.k === "sink";
    let fighting = null;
    // fight anything that's engaging us, or the step's target
    let bestD = Infinity;
    for (const s of game.ships) {
      if (s.team !== "enemy" || !s.alive) continue;
      const d = Math.hypot(s.x - P.x, s.z - P.z);
      const engaged = s.ai && s.ai.state !== "PATROL";
      if ((sinking && s.group === step.group) || (engaged && d < 220)) {
        if (d < bestD) {
          bestD = d;
          fighting = s;
        }
      }
    }
    if (fighting) {
      const range = gunRange(P.stats);
      const dx = fighting.x - P.x;
      const dz = fighting.z - P.z;
      const d = Math.hypot(dx, dz);
      const bearing = Math.atan2(dx, dz);
      // fire whichever side has it
      for (const side of ["left", "right"]) {
        if (game.targets[side] && game.targets[side].ship === fighting) press(side === "left" ? "fireLeft" : "fireRight");
      }
      if (d > range * 0.85) {
        target = { x: fighting.x, z: fighting.z };
      } else {
        // hold it abeam: choose the ready side with the smaller turn
        const lt = Math.abs(wrapAngle(bearing - Math.PI / 2 - P.heading));
        const rt = Math.abs(wrapAngle(bearing + Math.PI / 2 - P.heading));
        const lReady = P.reload.left <= game.time;
        const rReady = P.reload.right <= game.time;
        let side = lt < rt ? "left" : "right";
        if (lReady && !rReady) side = "left";
        if (rReady && !lReady) side = "right";
        let h = side === "left" ? bearing - Math.PI / 2 : bearing + Math.PI / 2;
        const corr = clamp((d - range * 0.55) / (range * 0.55), -0.5, 0.5) * 0.8;
        h += side === "left" ? corr : -corr;
        steerTo(h, 0.75, true);
        return;
      }
    }
    if (!target) {
      input.ship.steer = 0;
      input.ship.setThrottle = 0.3;
      return;
    }
    const dist = Math.hypot(target.x - P.x, target.z - P.z);
    // docking: arrive slowly, then press F
    const wantDock = step && (step.k === "dock" || target.via === "dock");
    const dockIsland = step?.k === "dock" ? step.island : target.island;
    if (wantDock && game.dockable && game.dockable.ok && game.dockable.island.id === dockIsland) {
      press("interact");
      input.ship.setThrottle = 0;
      input.ship.steer = 0;
      return;
    }
    const grid = seaGrid(game);
    const key = `${Math.round(target.x / 10)},${Math.round(target.z / 10)}`;
    if (!st.path || st.pathKey !== key || game.time - st.pathAt > 6) {
      st.path = planPath(grid, P.x, P.z, target.x, target.z);
      st.pathKey = key;
      st.pathAt = game.time;
    }
    const wp = follow(st.path, P.x, P.z, 22) || target;
    const h = Math.atan2(wp.x - P.x, wp.z - P.z);
    let thr = 1;
    if (wantDock && dist < 90) thr = dist < 40 ? 0.22 : 0.4;
    if (target.marker) thr = 1;
    steerTo(h, thr, false);
  }

  function steerTo(h, thr, combat) {
    const P = game.player;
    const diff = wrapAngle(h - P.heading);
    input.ship.steer = Math.abs(diff) < 0.03 ? 0 : clamp(diff * 2.5, -1, 1);
    input.ship.setThrottle = Math.abs(diff) > 1.6 && !combat ? Math.min(thr, 0.5) : thr;
    // stuck at sea: back off
    if (P.grounded > 1) {
      input.ship.setThrottle = -0.2;
      input.ship.steer = diff > 0 ? -1 : 1;
    }
  }

  function footStep() {
    const p = game.pirate;
    input.ship.setThrottle = null;
    input.ship.steer = 0;
    if (!p || p.state === "dead") return;
    const step = game.currentStep();
    // nearest live foe close by → fight it
    let foe = null;
    let fd = Infinity;
    for (const f of game.foes) {
      if (!f.alive || f.area !== game.area || f.island !== game.island.id) continue;
      const d = Math.hypot(f.x - p.x, f.z - p.z);
      const relevant = (step?.k === "defeat" && f.group === step.group) || f.state === "CHASE" || f.state === "ATTACK" || d < 7;
      if (relevant && d < fd) {
        fd = d;
        foe = f;
      }
    }
    if (foe && fd < 16) {
      const yaw = Math.atan2(foe.x - p.x, foe.z - p.z);
      input.camYaw = yaw;
      const reach = 1.6 + foe.T.r;
      if (fd > reach) {
        // approach along a path if needed
        moveToward(foe.x, foe.z, 0.6, false);
      } else {
        input.foot.mx = 0;
        input.foot.mz = 0;
        // block a telegraphed swing sometimes, otherwise attack
        const winding = foe.state === "ATTACK" && foe.stateT < foe.T.windup && foe.stateT > foe.T.windup * 0.35;
        input.foot.block = !!(opts.block && winding);
        if (!input.foot.block) press("attack");
      }
      return;
    }
    input.foot.block = false;
    const t = game.objectivePos();
    if (!t) {
      input.foot.mx = input.foot.mz = 0;
      return;
    }
    const d = Math.hypot(t.x - p.x, t.z - p.z);
    const f = game.focus;
    const wantsInteract =
      (t.via === "ship" || t.via === "cave" || ["take", "open", "dig", "gate", "enter", "board", "leaveCave"].includes(step?.k)) && f && !f.locked;
    if (wantsInteract && d < 3.4) {
      const matches = f.kind === "board" ? t.via === "ship" || step?.k === "board" : true;
      if (matches && st.interactCD <= 0 && p.state === "move") {
        press("interact");
        st.interactCD = 0.5;
      }
    }
    if (d > 1.1) moveToward(t.x, t.z, 1.1, false);
    else {
      input.foot.mx = input.foot.mz = 0;
    }
  }

  function moveToward(tx, tz, reach, sprint) {
    const p = game.pirate;
    const grid = landGrid(game, game.island.id, game.area);
    const key = `${game.area}:${Math.round(tx)},${Math.round(tz)}`;
    if (!st.path || st.pathKey !== key || game.time - st.pathAt > 3) {
      st.path = planPath(grid, p.x, p.z, tx, tz);
      st.pathKey = key;
      st.pathAt = game.time;
      if (!st.path) st.log.push({ t: game.time, warn: "no land path", from: [p.x, p.z], to: [tx, tz], area: game.area });
    }
    const wp = follow(st.path, p.x, p.z, 0.9) || { x: tx, z: tz };
    const yaw = Math.atan2(wp.x - p.x, wp.z - p.z);
    input.camYaw = yaw;
    input.foot.mz = 1;
    input.foot.mx = 0;
    input.foot.sprint = sprint;
    // unstick: jump if we haven't moved
    if (st.lastPos && Math.hypot(st.lastPos.x - p.x, st.lastPos.z - p.z) < 0.01) {
      st.stuckT += 1 / 60;
      if (st.stuckT > 1) {
        press("jump");
        st.path = null;
        st.stuckT = 0;
      }
    } else st.stuckT = 0;
    st.lastPos = { x: p.x, z: p.z };
  }

  return {
    input,
    state: st,
    tick() {
      st.interactCD -= 1 / 60;
      if (game.mode === MODE.SAILING) seaStep();
      else if (game.mode === MODE.ISLAND) footStep();
      else {
        input.ship.steer = 0;
        input.foot.mx = input.foot.mz = 0;
      }
      return input;
    },
  };
}
