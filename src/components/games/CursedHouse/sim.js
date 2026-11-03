/**
 * The Cursed House: Escape — pure simulation (no Three.js, no DOM).
 *
 *  - LAYOUT (built once from data.js): wall / lintel / furniture / slab boxes
 *    in a spatial hash, doors, floors (flat + ramps), a waypoint graph whose
 *    edges are proven walkable by the same collision code the enemy uses.
 *  - createGame(seed): one run. update(dt, input) moves the player with
 *    collision, stamina, crouch, aiming at interactables, hiding, the
 *    three keys and the front door, and runs the widow's state machine:
 *      patrol → (noise) investigate → search → patrol
 *      patrol/search/investigate → (sight) alert → chase → (lost) search
 *      chase → (seen hiding) pull · chase → (in reach) catch → respawn
 *    Things the UI/audio react to are pushed onto `game.events`.
 *
 * Sight is a 3D segment test against every sight-blocking box (walls,
 * lintels, closed doors, floor slabs, tall furniture), so she never sees
 * through walls or floors. She navigates waypoints and opens closed doors.
 */
import {
  LEVEL, STOREY, WALL_T, DOOR_H, PLAYER_R, PLAYER_H, CROUCH_H, EYE, CROUCH_EYE, ENEMY_R, ENEMY_H, STEP_UP, SPEED, ENEMY_SPEED,
  LIVES, WALLS, DOORS, FLOORS, FURNITURE, HIDES, CONTAINERS, KEY_SPOTS, NODES, START, ENEMY_START, ENEMY_RESPAWNS, EXIT_Z,
} from "./data.js";

export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const wrapAngle = (a) => {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
};
const d2 = (ax, az, bx, bz) => Math.hypot(bx - ax, bz - az);

/* ======================================================================== layout */
function buildLayout() {
  const boxes = []; // every static box (solid and/or sight-blocking)
  const doors = {};
  const add = (b) => {
    b.i = boxes.length;
    boxes.push(b);
    return b;
  };
  const H = WALL_T / 2;

  // walls → boxes (+ lintels over gaps) and door definitions
  for (const [lv, axis, fixed, from, to, gaps, opts = {}] of WALLS) {
    const y0 = LEVEL[lv];
    const y1 = y0 + (opts.h || STOREY);
    const segs = [];
    let s = from;
    const gl = (gaps || []).slice().sort((a, b) => a.c - b.c);
    for (const g of gl) {
      segs.push([s, g.c - g.w / 2]);
      s = g.c + g.w / 2;
      // lintel
      const lt = { y0: y0 + DOOR_H, y1, sight: true, solid: false, kind: "lintel", lv };
      if (axis === "x") Object.assign(lt, { x0: g.c - g.w / 2, x1: g.c + g.w / 2, z0: fixed - H, z1: fixed + H });
      else Object.assign(lt, { z0: g.c - g.w / 2, z1: g.c + g.w / 2, x0: fixed - H, x1: fixed + H });
      add(lt);
      if (g.door) {
        const def = DOORS[g.door];
        const d = {
          id: g.door, name: def.name, axis, fixed, c: g.c, w: g.w, lv, y0, y1: y0 + DOOR_H,
          swing: def.swing, hinge: def.hinge, locked0: !!def.locked, open0: !!def.open,
        };
        d.cx = axis === "x" ? g.c : fixed;
        d.cz = axis === "x" ? fixed : g.c;
        // collider while closed (slightly thinner than the wall)
        d.box = axis === "x"
          ? { x0: g.c - g.w / 2, x1: g.c + g.w / 2, z0: fixed - 0.05, z1: fixed + 0.05, y0, y1: y0 + DOOR_H, sight: true, solid: true, kind: "door", door: g.door }
          : { z0: g.c - g.w / 2, z1: g.c + g.w / 2, x0: fixed - 0.05, x1: fixed + 0.05, y0, y1: y0 + DOOR_H, sight: true, solid: true, kind: "door", door: g.door };
        // wall normal (unit) for side nodes
        d.nx = axis === "x" ? 0 : 1;
        d.nz = axis === "x" ? 1 : 0;
        doors[g.door] = d;
      }
    }
    segs.push([s, to]);
    for (const [a, b] of segs) {
      if (b - a < 0.01) continue;
      const ext0 = Math.abs(a - from) < 1e-6 ? H : 0, ext1 = Math.abs(b - to) < 1e-6 ? H : 0;
      const bx = { y0, y1, sight: opts.kind !== "rail", solid: true, kind: opts.kind || "wall", lv, axis };
      if (axis === "x") Object.assign(bx, { x0: a - ext0, x1: b + ext1, z0: fixed - H, z1: fixed + H });
      else Object.assign(bx, { z0: a - ext0, z1: b + ext1, x0: fixed - H, x1: fixed + H });
      if (opts.kind === "rail") bx.y1 = y0 + 2; // invisible tall collider over a low porch rail
      add(bx);
    }
  }

  // furniture
  const furn = FURNITURE.map((f, i) => {
    const y0 = LEVEL[f.l] + (f.y0 || 0);
    const b = {
      x0: f.r[0], z0: f.r[1], x1: f.r[2], z1: f.r[3], y0, y1: y0 + f.h,
      solid: !f.noCollide, sight: f.h > 1.6 && !f.noSight, kind: "furn", furn: i, lv: f.l,
    };
    add(b);
    return { ...f, i, box: b, y0 };
  });

  // floor slabs (sight only) — under every flat floor
  for (const f of FLOORS) {
    if (f.ramp || f.room === "porch") continue;
    add({ x0: f.r[0], z0: f.r[1], x1: f.r[2], z1: f.r[3], y0: f.y - 0.15, y1: f.y - 0.01, sight: true, solid: false, kind: "slab" });
  }
  // the roof / top ceiling and the earth under the ground floor block sight too
  add({ x0: 0, z0: 0, x1: 12, z1: 12, y0: 6, y1: 6.2, sight: true, solid: false, kind: "slab" });

  const solids = boxes.filter((b) => b.solid);
  const sights = boxes.filter((b) => b.sight);

  // spatial hash for solids (1 m cells)
  const CELL = 1;
  const hash = new Map();
  const key = (ix, iz) => (ix + 64) * 256 + (iz + 64);
  for (const b of solids) {
    for (let ix = Math.floor(b.x0 / CELL); ix <= Math.floor(b.x1 / CELL); ix++)
      for (let iz = Math.floor(b.z0 / CELL); iz <= Math.floor(b.z1 / CELL); iz++) {
        const k = key(ix, iz);
        if (!hash.has(k)) hash.set(k, []);
        hash.get(k).push(b);
      }
  }
  let stamp = 1;
  const seen = new Uint32Array(boxes.length);
  function near(x, z, r, out) {
    out.length = 0;
    stamp++;
    for (let ix = Math.floor((x - r) / CELL); ix <= Math.floor((x + r) / CELL); ix++)
      for (let iz = Math.floor((z - r) / CELL); iz <= Math.floor((z + r) / CELL); iz++) {
        const l = hash.get(key(ix, iz));
        if (!l) continue;
        for (const b of l) {
          if (seen[b.i] === stamp) continue;
          seen[b.i] = stamp;
          out.push(b);
        }
      }
    return out;
  }

  const L = { boxes, solids, sights, doors, furn, near, nodes: [], edges: [] };
  return L;
}

export const LAYOUT = buildLayout();

/* ======================================================================== geometry queries */
function floorHeight(f, x, z) {
  if (!f.ramp) return f.y;
  const t = (z - f.r[1]) / (f.r[3] - f.r[1]);
  return f.ya + (f.yb - f.ya) * clamp(t, 0, 1);
}
/** Highest walkable floor under (x, z) no higher than feet + STEP_UP; null if none. */
export function floorAt(x, z, feet) {
  let best = -Infinity, found = null;
  for (const f of FLOORS) {
    const r = f.r;
    if (x < r[0] - 1e-4 || x > r[2] + 1e-4 || z < r[1] - 1e-4 || z > r[3] + 1e-4) continue;
    const h = floorHeight(f, x, z);
    if (h <= feet + STEP_UP && h > best) {
      best = h;
      found = f;
    }
  }
  return found ? best : null;
}
export function floorInfo(x, z, feet) {
  let best = -Infinity, found = null;
  for (const f of FLOORS) {
    const r = f.r;
    if (x < r[0] - 1e-4 || x > r[2] + 1e-4 || z < r[1] - 1e-4 || z > r[3] + 1e-4) continue;
    const h = floorHeight(f, x, z);
    if (h <= feet + STEP_UP && h > best) {
      best = h;
      found = f;
    }
  }
  return found;
}
export function roomAt(x, y, z) {
  const f = floorInfo(x, z, y + 0.2);
  return f ? f.room : null;
}

const tmpList = [];
/** Push a circle out of solid boxes (and closed doors). Returns [x, z]. */
function resolve(x, z, y, h, r, doorState) {
  const lo = y + 0.35, hi = y + h;
  for (let it = 0; it < 4; it++) {
    let moved = false;
    const list = LAYOUT.near(x, z, r + 0.05, tmpList);
    const n = list.length;
    if (doorState) for (const id in LAYOUT.doors) if (!doorState[id].open) list.push(LAYOUT.doors[id].box);
    for (let i = 0; i < list.length; i++) {
      const b = list[i];
      if (b.y1 <= lo || b.y0 >= hi) continue;
      const cx = clamp(x, b.x0, b.x1), cz = clamp(z, b.z0, b.z1);
      let dx = x - cx, dz = z - cz;
      const dd = dx * dx + dz * dz;
      if (dd >= r * r) continue;
      if (dd > 1e-10) {
        const d = Math.sqrt(dd);
        x = cx + (dx / d) * r;
        z = cz + (dz / d) * r;
      } else {
        // centre inside the box: leave along the shortest axis
        const pl = x - b.x0, pr = b.x1 - x, pu = z - b.z0, pd = b.z1 - z;
        const m = Math.min(pl, pr, pu, pd);
        if (m === pl) x = b.x0 - r;
        else if (m === pr) x = b.x1 + r;
        else if (m === pu) z = b.z0 - r;
        else z = b.z1 + r;
      }
      moved = true;
    }
    list.length = n;
    if (!moved) break;
  }
  return [x, z];
}
/** Deepest penetration (m) of a circle into solids / closed doors; 0 when clear. */
function penetration(x, y, z, r, h, doorState) {
  const lo = y + 0.35, hi = y + h;
  const list = LAYOUT.near(x, z, r, tmpList);
  const n = list.length;
  if (doorState) for (const id in LAYOUT.doors) if (!doorState[id].open) list.push(LAYOUT.doors[id].box);
  let worst = 0;
  for (let i = 0; i < list.length; i++) {
    const b = list[i];
    if (b.y1 <= lo || b.y0 >= hi) continue;
    const cx = clamp(x, b.x0, b.x1), cz = clamp(z, b.z0, b.z1);
    const d = Math.hypot(x - cx, z - cz);
    if (d < r) worst = Math.max(worst, r - d);
  }
  list.length = n;
  return worst;
}
/** Does a circle at (x, y, z) overlap any solid (optionally closed doors)? */
export function overlaps(x, y, z, r, h, doorState, slack = 0.005) {
  const lo = y + 0.35, hi = y + h;
  const list = LAYOUT.near(x, z, r, tmpList);
  const all = doorState ? list.concat(Object.keys(LAYOUT.doors).filter((id) => !doorState[id].open).map((id) => LAYOUT.doors[id].box)) : list;
  for (const b of all) {
    if (b.y1 <= lo || b.y0 >= hi) continue;
    const cx = clamp(x, b.x0, b.x1), cz = clamp(z, b.z0, b.z1);
    const dd = (x - cx) ** 2 + (z - cz) ** 2;
    if (dd < (r - slack) * (r - slack)) return b;
  }
  return null;
}

/** Move an entity {x,y,z} by (dx, dz) with sliding collision. Returns distance moved. */
export function moveEntity(e, dx, dz, r, h, doorState) {
  const dist = Math.hypot(dx, dz);
  if (dist < 1e-6) return 0;
  const steps = Math.ceil(dist / 0.07);
  const sx = dx / steps, sz = dz / steps;
  const ox = e.x, oz = e.z;
  for (let i = 0; i < steps; i++) {
    if (!tryStep(e, sx, sz, r, h, doorState) && !tryStep(e, sx, 0, r, h, doorState)) tryStep(e, 0, sz, r, h, doorState);
  }
  return Math.hypot(e.x - ox, e.z - oz);
}
function tryStep(e, sx, sz, r, h, doorState) {
  if (sx === 0 && sz === 0) return false;
  let [nx, nz] = resolve(e.x + sx, e.z + sz, e.y, h, r, doorState);
  let fh = floorAt(nx, nz, e.y);
  if (fh === null || fh < e.y - 0.7) return false;
  if (Math.abs(fh - e.y) > 0.01) {
    [nx, nz] = resolve(nx, nz, fh, h, r, doorState);
    fh = floorAt(nx, nz, fh);
    if (fh === null) return false;
  }
  // never accept a push that teleports, or that ends wedged inside geometry
  // (push-outs between two close pieces may not converge) — unless it at
  // least gets us out of a pre-existing overlap
  if (Math.hypot(nx - e.x, nz - e.z) > 0.35) return false;
  const pen = penetration(nx, fh, nz, r, h, doorState);
  if (pen > 0.004 && pen >= penetration(e.x, e.y, e.z, r, h, doorState) - 1e-4) return false;
  e.x = nx;
  e.z = nz;
  e.y = fh;
  return true;
}

/** 3D segment vs sight boxes (+ closed doors). ignore: Set of box objects. */
export function lineOfSight(ax, ay, az, bx, by, bz, doorState, ignore) {
  const dx = bx - ax, dy = by - ay, dz = bz - az;
  const mnx = Math.min(ax, bx), mxx = Math.max(ax, bx), mny = Math.min(ay, by), mxy = Math.max(ay, by), mnz = Math.min(az, bz), mxz = Math.max(az, bz);
  const test = (b) => {
    if (b.x1 < mnx || b.x0 > mxx || b.y1 < mny || b.y0 > mxy || b.z1 < mnz || b.z0 > mxz) return false;
    if (ignore && ignore.has(b)) return false;
    let t0 = 0, t1 = 1;
    const ax_ = [ax, ay, az], d_ = [dx, dy, dz], lo = [b.x0, b.y0, b.z0], hi = [b.x1, b.y1, b.z1];
    for (let k = 0; k < 3; k++) {
      if (Math.abs(d_[k]) < 1e-9) {
        if (ax_[k] < lo[k] || ax_[k] > hi[k]) return false;
      } else {
        let ta = (lo[k] - ax_[k]) / d_[k], tb = (hi[k] - ax_[k]) / d_[k];
        if (ta > tb) [ta, tb] = [tb, ta];
        if (ta > t0) t0 = ta;
        if (tb < t1) t1 = tb;
        if (t0 > t1) return false;
      }
    }
    return true;
  };
  for (const b of LAYOUT.sights) if (test(b)) return false;
  if (doorState) for (const id in LAYOUT.doors) if (!doorState[id].open && test(LAYOUT.doors[id].box)) return false;
  return true;
}

/** 2D segment vs door gap rectangle (expanded). */
function segHitsRect(ax, az, bx, bz, b, pad) {
  const x0 = b.x0 - pad, x1 = b.x1 + pad, z0 = b.z0 - pad, z1 = b.z1 + pad;
  let t0 = 0, t1 = 1;
  const dx = bx - ax, dz = bz - az;
  for (const [p, d, lo, hi] of [[ax, dx, x0, x1], [az, dz, z0, z1]]) {
    if (Math.abs(d) < 1e-9) {
      if (p < lo || p > hi) return false;
    } else {
      let ta = (lo - p) / d, tb = (hi - p) / d;
      if (ta > tb) [ta, tb] = [tb, ta];
      t0 = Math.max(t0, ta);
      t1 = Math.min(t1, tb);
      if (t0 > t1) return false;
    }
  }
  return true;
}

/**
 * Can a circle of radius r walk straight from a (with height a.y) to b?
 * Doors are ignored when doorState is null (they can be opened), otherwise
 * closed doors block. Returns { ok, y, doors }.
 */
export function walkClear(a, b, r, doorState = null) {
  const dx = b.x - a.x, dz = b.z - a.z;
  const len = Math.hypot(dx, dz);
  const n = Math.max(1, Math.ceil(len / 0.12));
  let y = a.y;
  for (let i = 1; i <= n; i++) {
    const t = i / n;
    const x = a.x + dx * t, z = a.z + dz * t;
    const fh = floorAt(x, z, y);
    if (fh === null || fh < y - 0.7) return { ok: false };
    y = fh;
    if (overlaps(x, y, z, r, ENEMY_H, doorState, 0.01)) return { ok: false };
  }
  if (b.y !== undefined && Math.abs(y - b.y) > 0.6) return { ok: false };
  const doors = [];
  for (const id in LAYOUT.doors) {
    const d = LAYOUT.doors[id];
    if (Math.abs(d.y0 - Math.min(a.y, y)) > 1.6 && Math.abs(d.y0 - Math.max(a.y, y)) > 1.6) continue;
    if (segHitsRect(a.x, a.z, b.x, b.z, d.box, 0.05)) doors.push(id);
  }
  return { ok: true, y, doors };
}

/* ======================================================================== navigation graph */
function buildGraph() {
  const nodes = [];
  const addNode = (x, z, lv, tag) => {
    let y;
    if (lv === "S") {
      const ramp = FLOORS.find((f) => f.ramp && x >= f.r[0] && x <= f.r[2] && z >= f.r[1] && z <= f.r[3]);
      y = floorHeight(ramp, x, z);
    } else y = floorAt(x, z, LEVEL[lv] + 0.1);
    if (y === null || y === undefined) throw new Error(`node off-floor ${x},${z},${lv}`);
    for (const o of nodes) if (Math.abs(o.y - y) < 0.5 && d2(o.x, o.z, x, z) < 0.3) return o;
    const n = { i: nodes.length, x, y, z, room: roomAt(x, y, z), tag, adj: [] };
    nodes.push(n);
    return n;
  };
  for (const [x, z, lv] of NODES) addNode(x, z, lv, "wp");
  for (const id in LAYOUT.doors) {
    if (id === "front") continue;
    const d = LAYOUT.doors[id];
    const lv = d.y0 === LEVEL.U ? "U" : d.y0 === LEVEL.B ? "B" : "G";
    for (const s of [-1, 1]) addNode(d.cx + d.nx * 0.72 * s, d.cz + d.nz * 0.72 * s, lv, "door:" + id);
  }
  const edges = [];
  for (let i = 0; i < nodes.length; i++)
    for (let j = i + 1; j < nodes.length; j++) {
      const a = nodes[i], b = nodes[j];
      const len = d2(a.x, a.z, b.x, b.z);
      if (len > 7.5 || Math.abs(a.y - b.y) > 3.2) continue;
      const w = walkClear(a, b, ENEMY_R + 0.02);
      if (!w.ok) continue;
      const w2 = walkClear(b, a, ENEMY_R + 0.02);
      if (!w2.ok) continue;
      const cost = Math.hypot(len, b.y - a.y);
      a.adj.push({ to: j, cost, doors: w.doors });
      b.adj.push({ to: i, cost, doors: w.doors });
      edges.push([i, j]);
    }
  LAYOUT.nodes = nodes;
  LAYOUT.edges = edges;
}
buildGraph();

/** Nearest nodes from p that can be walked to/from in a straight line. */
function anchorNodes(p, max = 4, fromP = true, r = ENEMY_R) {
  const cand = LAYOUT.nodes
    .filter((n) => Math.abs(n.y - p.y) < 2.2)
    .map((n) => ({ n, d: Math.hypot(n.x - p.x, n.z - p.z, (n.y - p.y) * 2) }))
    .sort((a, b) => a.d - b.d);
  const out = [];
  for (const c of cand) {
    if (c.d > 9) break;
    const w = fromP ? walkClear(p, c.n, r) : walkClear(c.n, p, r);
    if (w.ok) out.push({ n: c.n, d: c.d, doors: w.doors });
    if (out.length >= max) break;
  }
  return out;
}

/** Waypoint path from a to b: [{x,y,z,doors}] ending at b. null if unreachable. */
export function planPath(a, b, r = ENEMY_R) {
  const direct = walkClear(a, b, r);
  if (direct.ok) return [{ x: b.x, y: direct.y, z: b.z, doors: direct.doors }];
  let starts = anchorNodes(a, 4, true, r);
  if (!starts.length) {
    // squeezed against furniture: fall back to the nearest node on this level
    const n = nearestNode(a);
    if (n) starts = [{ n, d: Math.hypot(n.x - a.x, n.z - a.z), doors: [] }];
  }
  const goals = anchorNodes(b, 4, false, r);
  if (!starts.length) return null;
  const N = LAYOUT.nodes.length;
  const dist = new Float64Array(N).fill(Infinity);
  const prev = new Int32Array(N).fill(-1);
  const prevDoors = new Array(N);
  const done = new Uint8Array(N);
  for (const s of starts) {
    if (s.d < dist[s.n.i]) {
      dist[s.n.i] = s.d;
      prevDoors[s.n.i] = s.doors;
    }
  }
  const goalCost = new Map(goals.map((g) => [g.n.i, g]));
  let bestGoal = -1, bestCost = Infinity;
  for (;;) {
    let u = -1, du = Infinity;
    for (let i = 0; i < N; i++) if (!done[i] && dist[i] < du) {
      du = dist[i];
      u = i;
    }
    if (u < 0 || du >= bestCost) break;
    done[u] = 1;
    const g = goalCost.get(u);
    if (g && du + g.d < bestCost) {
      bestCost = du + g.d;
      bestGoal = u;
    }
    for (const e of LAYOUT.nodes[u].adj) {
      const nd = du + e.cost;
      if (nd < dist[e.to]) {
        dist[e.to] = nd;
        prev[e.to] = u;
        prevDoors[e.to] = e.doors;
      }
    }
  }
  let end = bestGoal;
  let tail = null;
  if (end < 0) {
    // target not reachable from a node in a straight line: go to the node closest to it
    let bd = Infinity;
    for (let i = 0; i < N; i++) {
      if (dist[i] === Infinity) continue;
      const n = LAYOUT.nodes[i];
      const dd = Math.hypot(n.x - b.x, n.z - b.z, (n.y - b.y) * 2);
      if (dd < bd) {
        bd = dd;
        end = i;
      }
    }
    if (end < 0) return null;
  } else tail = goalCost.get(end);
  const out = [];
  for (let u = end; u >= 0; u = prev[u]) {
    const n = LAYOUT.nodes[u];
    out.unshift({ x: n.x, y: n.y, z: n.z, doors: prevDoors[u] || [], node: u });
  }
  if (tail) out.push({ x: b.x, y: b.y, z: b.z, doors: tail.doors });
  return out;
}
export function nearestNode(p) {
  let best = null, bd = Infinity;
  for (const n of LAYOUT.nodes) {
    const d = Math.hypot(n.x - p.x, n.z - p.z, (n.y - p.y) * 2.5);
    if (d < bd) {
      bd = d;
      best = n;
    }
  }
  return best;
}
/** Path length (m) between two points along the graph, Infinity if none. */
export function pathLength(a, b) {
  const p = planPath(a, b);
  if (!p) return Infinity;
  let L = 0, x = a.x, z = a.z, y = a.y;
  for (const q of p) {
    L += Math.hypot(q.x - x, q.z - z, q.y - y);
    x = q.x;
    z = q.z;
    y = q.y;
  }
  return L;
}

/* ======================================================================== the game */
const HIDE_IDS = Object.keys(HIDES);

export function createGame(seed = (Math.random() * 1e9) | 0, opts = {}) {
  const rand = mulberry32(seed);
  const pick = (arr) => arr[Math.floor(rand() * arr.length)];

  // one key spot per group
  const keySpots = [0, 1, 2].map((g) => {
    const list = KEY_SPOTS.filter((k) => k.group === g);
    return opts.keySpots ? KEY_SPOTS.find((k) => k.id === opts.keySpots[g]) : pick(list);
  });

  const doors = {};
  for (const id in LAYOUT.doors) {
    const d = LAYOUT.doors[id];
    doors[id] = { open: d.open0, locked: d.locked0, anim: d.open0 ? 1 : 0 };
  }
  const containers = {};
  for (const id in CONTAINERS) containers[id] = { open: false, anim: 0 };

  const sy = LEVEL[START.l];
  const player = {
    x: START.x, y: sy, z: START.z, yaw: START.yaw, pitch: -0.05,
    vx: 0, vz: 0, crouch: false, sprinting: false, stamina: 100, exhausted: false, staminaT: 0,
    light: true, hidden: null, moving: 0, stepAcc: 0, eyeH: EYE, speed: 0,
  };
  const ey = LEVEL[ENEMY_START.l];
  const enemy = {
    x: ENEMY_START.x, y: ey, z: ENEMY_START.z, yaw: 0, mode: "patrol", path: null, pi: 0,
    speed: 0, awareness: 0, sees: false, visT: 0, lastSeen: null, lostT: 0, knowsHide: null,
    timer: 2.5, grace: opts.noEnemy ? 1e9 : 4, stepAcc: 0, walk: 0, reach: 0, doorWait: 0, doorId: null,
    stuckT: 0, stuckRef: { x: ENEMY_START.x, z: ENEMY_START.z }, repathT: 0, searchT: 0, inspectT: 0, inspectId: null,
    lastInspect: {}, look: 0, humT: 3, chaseT: 0, dist: 99, disabled: !!opts.noEnemy, alertT: 0, cornerT: 0,
  };

  const g = {
    seed, t: 0, state: "play", stateT: 0,
    player, enemy, doors, containers, keySpots,
    keys: [], lives: LIVES, captures: 0,
    events: [], aim: null, message: null, noises: [],
    caughtFrom: null,

    look(dx, dy, sens = 1) {
      if (g.state !== "play") return;
      const P = player;
      const k = 0.0022 * sens;
      P.yaw = wrapAngle(P.yaw - dx * k);
      P.pitch = clamp(P.pitch - dy * k, -1.35, 1.35);
      if (P.hidden) {
        const h = HIDES[P.hidden];
        const lim = h.kind === "bed" ? 1.0 : 0.75;
        P.yaw = h.yaw + clamp(wrapAngle(P.yaw - h.yaw), -lim, lim);
        P.pitch = h.kind === "bed" ? clamp(P.pitch, -0.25, 0.3) : clamp(P.pitch, -0.6, 0.5);
      }
    },
    toggleLight() {
      if (g.state !== "play") return;
      player.light = !player.light;
      g.events.push({ type: "light", on: player.light });
    },
    toggleCrouch() {
      if (g.state !== "play" || player.hidden) return;
      player.crouch = !player.crouch;
      g.events.push({ type: "crouch", on: player.crouch });
    },
    interact() {
      if (g.state !== "play") return;
      interact();
    },
    update(dt, input = null) {
      dt = Math.min(dt, 0.05);
      g.t += dt;
      g.stateT += dt;
      for (const id in doors) {
        const d = doors[id];
        d.anim = clamp(d.anim + (d.open ? 1 : -1) * dt * 2.6, 0, 1);
      }
      for (const id in containers) {
        const c = containers[id];
        c.anim = clamp(c.anim + (c.open ? 1 : -1) * dt * 3, 0, 1);
      }
      if (g.state === "play") {
        updatePlayer(dt, input || {});
        if (g.state === "play") updateEnemy(dt);
      } else if (g.state === "caught") {
        if (g.stateT > 2.4) {
          g.lives--;
          if (g.lives <= 0) {
            g.state = "over";
            g.stateT = 0;
            g.events.push({ type: "gameover" });
          } else {
            g.state = "respawn";
            g.stateT = 0;
            respawn();
          }
        }
      } else if (g.state === "respawn") {
        if (g.stateT > 1.3) {
          g.state = "play";
          g.stateT = 0;
          g.events.push({ type: "respawned", lives: g.lives });
        }
      }
      g.noises = [];
    },
    /** debug/test helpers */
    teleport(x, z, lv) {
      player.x = x;
      player.z = z;
      player.y = floorAt(x, z, LEVEL[lv] + 0.1);
      player.hidden = null;
    },
    collectAll() {
      for (const s of keySpots) if (!g.keys.includes(s.id)) g.keys.push(s.id);
    },
  };

  /* ------------------------------------------------------------------ noise */
  function noise(x, y, z, radius, kind) {
    g.noises.push({ x, y, z, radius, kind });
    const E = enemy;
    if (E.disabled || E.grace > 0) return;
    if (E.mode === "chase" || E.mode === "alert" || E.mode === "pull" || E.mode === "caught") return;
    const dy = Math.abs(E.y - y);
    const eff = radius * (dy > 1.5 ? 0.6 : 1);
    const d = Math.hypot(E.x - x, E.z - z, dy);
    if (d > eff) return;
    E.mode = "investigate";
    E.target = { x, y, z };
    E.path = planPath(E, E.target);
    E.pi = 0;
    E.timer = 0;
    E.searchT = 0;
    g.events.push({ type: "heard", kind });
  }
  g.noise = noise;

  /* ------------------------------------------------------------------ interactables */
  const eyePos = () => {
    const P = player;
    if (P.hidden) {
      const h = HIDES[P.hidden];
      return [h.cam[0], LEVEL[h.l] + h.cam[1], h.cam[2]];
    }
    return [P.x, P.y + P.eyeH, P.z];
  };
  function interactables() {
    const out = [];
    for (const id in LAYOUT.doors) {
      const d = LAYOUT.doors[id];
      out.push({ type: "door", id, p: [d.cx, d.y0 + 1.1, d.cz], size: 0.55, ignore: d.box });
    }
    for (const id in CONTAINERS) {
      const c = CONTAINERS[id];
      const f = LAYOUT.furn.find((x) => x.container === id);
      out.push({ type: "container", id, p: [c.point[0], LEVEL[c.l] + c.point[1], c.point[2]], size: 0.32, ignore: f.box });
    }
    for (const s of keySpots) {
      if (g.keys.includes(s.id)) continue;
      if (s.inside && !containers[s.inside].open) continue;
      const kp = [s.pos[0], LEVEL[s.l] + s.pos[1], s.pos[2]];
      // the piece it rests in/on (shelf, fridge…) must not hide it from view
      const f = s.inside
        ? LAYOUT.furn.find((x) => x.container === s.inside)
        : LAYOUT.furn.find((x) => kp[0] > x.box.x0 - 0.05 && kp[0] < x.box.x1 + 0.05 && kp[2] > x.box.z0 - 0.05 && kp[2] < x.box.z1 + 0.05 && kp[1] > x.box.y0 - 0.05 && kp[1] < x.box.y1 + 0.1);
      out.push({ type: "key", id: s.id, p: kp, size: 0.2, ignore: f ? f.box : null, prio: 1 });
    }
    for (const id of HIDE_IDS) {
      const h = HIDES[id];
      const f = LAYOUT.furn.find((x) => x.hide === id);
      out.push({ type: "hide", id, p: [h.point[0], LEVEL[h.l] + h.point[1], h.point[2]], size: 0.5, ignore: f.box });
    }
    return out;
  }
  const ALL_IA = interactables;
  function findAim() {
    const P = player;
    if (P.hidden) return { type: "unhide", id: P.hidden };
    const [ex, ey_, ez] = eyePos();
    const cp = Math.cos(P.pitch);
    const fx = -Math.sin(P.yaw) * cp, fy = Math.sin(P.pitch), fz = -Math.cos(P.yaw) * cp;
    let best = null, bestScore = 1;
    for (const it of ALL_IA()) {
      const dx = it.p[0] - ex, dy = it.p[1] - ey_, dz = it.p[2] - ez;
      const dist = Math.hypot(dx, dy, dz);
      if (dist > 2.2 || dist < 0.05) continue;
      const cos = (dx * fx + dy * fy + dz * fz) / dist;
      const ang = Math.acos(clamp(cos, -1, 1));
      const tol = Math.atan2(it.size, dist) + 0.12;
      let score = ang / tol;
      if (it.prio) score *= 0.6;
      if (score >= bestScore) continue;
      const ign = new Set();
      if (it.ignore) ign.add(it.ignore);
      if (it.type === "door") {
        if (!lineOfSight(ex, ey_, ez, it.p[0], it.p[1], it.p[2], null, ign)) continue;
      } else if (!lineOfSight(ex, ey_, ez, it.p[0], it.p[1], it.p[2], doors, ign)) continue;
      best = it;
      bestScore = score;
    }
    return best ? { type: best.type, id: best.id } : null;
  }
  g.describeAim = (a = g.aim) => {
    if (!a) return "";
    switch (a.type) {
      case "unhide":
        return "[E]  Leave hiding";
      case "door": {
        const d = doors[a.id];
        if (a.id === "front" && d.locked) return g.keys.length >= 3 ? "[E]  Unlock the front door" : `Front door — locked (${g.keys.length}/3 keys)`;
        return `[E]  ${d.open ? "Close" : "Open"} ${LAYOUT.doors[a.id].name.toLowerCase()}`;
      }
      case "container":
        return `[E]  ${containers[a.id].open ? "Close" : "Search"} the ${CONTAINERS[a.id].name}`;
      case "key":
        return "[E]  Take the key";
      case "hide":
        return HIDES[a.id].kind === "bed" ? `[E]  Hide under the ${HIDES[a.id].name}` : "[E]  Hide in the wardrobe";
      default:
        return "";
    }
  };

  function doorOccupied(id) {
    const b = LAYOUT.doors[id].box;
    const hit = (x, y, z, r) => {
      if (y + 1.9 < b.y0 || y > b.y1) return false;
      const cx = clamp(x, b.x0, b.x1), cz = clamp(z, b.z0, b.z1);
      return Math.hypot(x - cx, z - cz) < r + 0.04;
    };
    return (!player.hidden && hit(player.x, player.y, player.z, PLAYER_R)) || (!enemy.disabled && hit(enemy.x, enemy.y, enemy.z, ENEMY_R));
  }

  function interact() {
    const P = player;
    const a = findAim();
    if (!a) return;
    if (a.type === "unhide") {
      unhide();
      return;
    }
    if (a.type === "door") {
      const d = doors[a.id], L = LAYOUT.doors[a.id];
      if (a.id === "front" && d.locked) {
        if (g.keys.length >= 3) {
          d.locked = false;
          d.open = true;
          g.events.push({ type: "unlock" });
          noise(P.x, P.y, P.z, 13, "unlock");
        } else {
          g.events.push({ type: "locked", count: g.keys.length });
          noise(P.x, P.y, P.z, 9, "rattle");
        }
        return;
      }
      if (d.open && doorOccupied(a.id)) {
        g.events.push({ type: "blocked" });
        return;
      }
      d.open = !d.open;
      g.events.push({ type: "door", id: a.id, open: d.open, by: "player", x: L.cx, y: L.y0, z: L.cz });
      noise(P.x, P.y, P.z, P.crouch ? 4.5 : 7, "door");
      return;
    }
    if (a.type === "container") {
      const c = containers[a.id];
      c.open = !c.open;
      const inside = keySpots.find((s) => s.inside === a.id && !g.keys.includes(s.id));
      g.events.push({ type: "container", id: a.id, open: c.open, found: c.open && !!inside, empty: c.open && !inside });
      noise(P.x, P.y, P.z, P.crouch ? 3 : 5, "container");
      return;
    }
    if (a.type === "key") {
      g.keys.push(a.id);
      g.events.push({ type: "key", id: a.id, count: g.keys.length });
      noise(P.x, P.y, P.z, 3, "key");
      return;
    }
    if (a.type === "hide") hide(a.id);
  }

  function hide(id) {
    const P = player, E = enemy, h = HIDES[id];
    // she only knows where you went if she can see you getting in
    // (same vision test as always: range, field of view, walls, light)
    const watching = !E.disabled && E.grace <= 0 && (E.mode === "chase" || E.mode === "alert" || E.awareness > 0.6) && canSeePlayer();
    P.hidden = id;
    P.crouch = false;
    P.vx = P.vz = 0;
    P.preHide = { x: P.x, y: P.y, z: P.z };
    P.x = h.cam[0];
    P.z = h.cam[2];
    P.y = LEVEL[h.l];
    P.yaw = h.yaw;
    P.pitch = h.kind === "bed" ? 0.05 : -0.05;
    const pre = P.preHide;
    E.knowsHide = watching ? id : null;
    g.events.push({ type: "hide", id, kind: h.kind, seen: watching });
    noise(pre.x, pre.y, pre.z, 2.5, "hide");
    if (watching) {
      E.mode = "pull";
      E.path = planPath(E, { x: h.exit[0], y: LEVEL[h.l], z: h.exit[1] });
      E.pi = 0;
    }
  }
  function unhide() {
    const P = player, h = HIDES[P.hidden];
    const id = P.hidden;
    P.hidden = null;
    P.x = h.exit[0];
    P.z = h.exit[1];
    P.y = floorAt(P.x, P.z, LEVEL[h.l] + 0.1);
    P.yaw = h.yaw;
    P.pitch = 0;
    // safety: if somehow inside geometry, push out
    const [nx, nz] = resolve(P.x, P.z, P.y, PLAYER_H, PLAYER_R, doors);
    P.x = nx;
    P.z = nz;
    g.events.push({ type: "unhide", id, kind: h.kind });
    noise(P.x, P.y, P.z, 2.5, "hide");
  }

  /* ------------------------------------------------------------------ player */
  function updatePlayer(dt, inp) {
    const P = player;
    // eye height smoothing (crouch)
    const eyeT = P.crouch ? CROUCH_EYE : EYE;
    P.eyeH += (eyeT - P.eyeH) * Math.min(1, dt * 10);
    if (P.hidden) {
      P.sprinting = false;
      P.moving = 0;
      P.stamina = Math.min(100, P.stamina + dt * 18);
      if (P.exhausted && P.stamina > 35) P.exhausted = false;
      g.aim = { type: "unhide", id: P.hidden };
      return;
    }
    let mx = (inp.r ? 1 : 0) - (inp.l ? 1 : 0);
    let mz = (inp.f ? 1 : 0) - (inp.b ? 1 : 0);
    const ml = Math.hypot(mx, mz);
    if (ml > 0) {
      mx /= ml;
      mz /= ml;
    }
    const wantSprint = !!inp.sprint && mz > 0.2 && !P.crouch && !P.exhausted && P.stamina > 0;
    P.sprinting = wantSprint && ml > 0;
    const sp = P.crouch ? SPEED.crouch : P.sprinting ? SPEED.sprint : SPEED.walk;
    const fx = -Math.sin(P.yaw), fz = -Math.cos(P.yaw);
    const rx = Math.cos(P.yaw), rz = -Math.sin(P.yaw);
    const tvx = (fx * mz + rx * mx) * sp, tvz = (fz * mz + rz * mx) * sp;
    const k = Math.min(1, dt * (ml > 0 ? 10 : 14));
    P.vx += (tvx - P.vx) * k;
    P.vz += (tvz - P.vz) * k;
    const moved = moveEntity(P, P.vx * dt, P.vz * dt, PLAYER_R, P.crouch ? CROUCH_H : PLAYER_H, doors);
    P.speed = dt > 0 ? moved / dt : 0;
    P.moving = P.speed > 0.3 ? 1 : 0;
    // stamina
    if (P.sprinting) {
      P.stamina = Math.max(0, P.stamina - dt * 21);
      P.staminaT = 0.9;
      if (P.stamina <= 0) P.exhausted = true;
    } else {
      P.staminaT -= dt;
      if (P.staminaT <= 0) P.stamina = Math.min(100, P.stamina + dt * (P.moving ? 11 : 16));
    }
    if (P.exhausted && P.stamina > 35) P.exhausted = false;
    // footsteps
    if (P.moving) {
      P.stepAcc += moved;
      const stride = P.sprinting ? 0.85 : P.crouch ? 0.55 : 0.68;
      if (P.stepAcc >= stride) {
        P.stepAcc = 0;
        const f = floorInfo(P.x, P.z, P.y + 0.1);
        const surface = f ? f.s : "wood";
        g.events.push({ type: "step", sprint: P.sprinting, crouch: P.crouch, surface });
        if (P.sprinting) noise(P.x, P.y, P.z, 10, "sprint");
        else if (!P.crouch) noise(P.x, P.y, P.z, 3.0, "walk");
      }
    }
    g.aim = findAim();
    // escape
    if (!doors.front.locked && P.z > EXIT_Z) {
      g.state = "won";
      g.stateT = 0;
      g.events.push({ type: "win" });
    }
  }

  function respawn() {
    const P = player, E = enemy;
    P.hidden = null;
    P.x = START.x;
    P.z = START.z;
    P.y = LEVEL[START.l];
    P.yaw = START.yaw;
    P.pitch = -0.05;
    P.vx = P.vz = 0;
    P.crouch = false;
    P.stamina = 100;
    P.exhausted = false;
    // she goes back to the spot farthest (by walking) from the bedroom
    let best = ENEMY_RESPAWNS[0], bd = -1;
    for (const r of ENEMY_RESPAWNS) {
      const pt = { x: r[0], z: r[1], y: LEVEL[r[2]] };
      const L = pathLength(pt, P);
      if (L > bd && L < Infinity) {
        bd = L;
        best = r;
      }
    }
    Object.assign(E, {
      x: best[0], z: best[1], y: LEVEL[best[2]], mode: "patrol", path: null, pi: 0, awareness: 0, sees: false,
      knowsHide: null, timer: 2, grace: 6, lastSeen: null, lostT: 0, doorWait: 0, doorId: null, reach: 0, chaseT: 0, cornerT: 0,
      stuckT: 0, stuckRef: { x: best[0], z: best[1] },
    });
  }

  /* ------------------------------------------------------------------ the widow */
  function setMode(m) {
    const E = enemy;
    if (E.mode === m) return;
    const was = E.mode;
    E.mode = m;
    E.timer = 0;
    if (m === "chase" && was !== "chase") g.events.push({ type: "chase" });
    if (was === "chase" && m !== "chase" && m !== "pull") g.events.push({ type: "lost" });
  }

  function canSeePlayer() {
    const P = player, E = enemy;
    if (P.hidden) return false;
    const dx = P.x - E.x, dz = P.z - E.z, dy = P.y - E.y;
    const dist = Math.hypot(dx, dz, dy);
    let range = P.light ? 12 : 7;
    if (P.crouch) range *= 0.7;
    if (E.mode === "chase" || E.mode === "alert") range = 18;
    if (dist > range) return false;
    if (dist > 2.2) {
      const fx = -Math.sin(E.yaw), fz = -Math.cos(E.yaw);
      const cos = (dx * fx + dz * fz) / (Math.hypot(dx, dz) || 1);
      if (cos < Math.cos((E.mode === "chase" ? 150 : 115) * Math.PI / 360)) return false;
    }
    const chest = P.y + (P.crouch ? 0.75 : 1.3);
    return lineOfSight(E.x, E.y + 1.55, E.z, P.x, chest, P.z, doors) ||
      lineOfSight(E.x, E.y + 1.55, E.z, P.x, P.y + P.eyeH - 0.05, P.z, doors);
  }

  function pickPatrolTarget() {
    const E = enemy, P = player;
    const nodes = LAYOUT.nodes.filter((n) => n.tag === "wp" && Math.hypot(n.x - E.x, n.z - E.z, n.y - E.y) > 3);
    // keep the pressure on: often wander toward the floor the player is on
    const sameFloor = nodes.filter((n) => Math.abs(n.y - P.y) < 1.6);
    const pool = rand() < 0.35 && sameFloor.length ? sameFloor : nodes;
    return pick(pool);
  }

  function followPath(dt, speed) {
    const E = enemy;
    if (!E.path || E.pi >= E.path.length) {
      E.speed = 0;
      return true;
    }
    const q = E.path[E.pi];
    // open a closed door in the way
    if (E.doorWait > 0) {
      E.doorWait -= dt;
      E.speed = 0;
      if (E.doorWait <= 0 && E.doorId) {
        const d = doors[E.doorId], L = LAYOUT.doors[E.doorId];
        if (!d.open && !d.locked) {
          d.open = true;
          g.events.push({ type: "door", id: E.doorId, open: true, by: "enemy", x: L.cx, y: L.y0, z: L.cz });
        }
        E.doorId = null;
      }
      return false;
    }
    for (const id in LAYOUT.doors) {
      const d = doors[id];
      if (d.open || id === "front") continue;
      const L = LAYOUT.doors[id];
      if (Math.abs(L.y0 - E.y) > 1.6) continue;
      if (Math.hypot(L.cx - E.x, L.cz - E.z) > 1.25) continue;
      if (segHitsRect(E.x, E.z, q.x, q.z, L.box, 0.3)) {
        E.doorWait = 0.55;
        E.doorId = id;
        E.yaw = Math.atan2(-(L.cx - E.x), -(L.cz - E.z));
        g.events.push({ type: "doorHandle", id });
        return false;
      }
    }
    const dx = q.x - E.x, dz = q.z - E.z;
    const dist = Math.hypot(dx, dz);
    E.speed = 0;
    if (dist < 0.22 && Math.abs(q.y - E.y) < 0.8) {
      E.pi++;
      return E.pi >= E.path.length;
    }
    const step = Math.min(dist, speed * dt);
    const want = Math.atan2(-dx, -dz);
    E.yaw += wrapAngle(want - E.yaw) * Math.min(1, dt * 8);
    const moved = moveEntity(E, (dx / dist) * step, (dz / dist) * step, ENEMY_R, ENEMY_H, doors);
    E.speed = moved / dt;
    E.stepAcc += moved;
    E.walk += moved * 2.2;
    const stride = speed > 2.6 ? 0.9 : 0.7;
    if (E.stepAcc > stride) {
      E.stepAcc = 0;
      g.events.push({ type: "enemyStep", chase: E.mode === "chase", x: E.x, y: E.y, z: E.z });
    }
    // stuck watchdog
    E.stuckT += dt;
    if (E.stuckT > 1.4) {
      const prog = Math.hypot(E.x - E.stuckRef.x, E.z - E.stuckRef.z);
      E.stuckT = 0;
      E.stuckRef = { x: E.x, z: E.z };
      if (prog < 0.25) {
        E.stuckCount = (E.stuckCount || 0) + 1;
        if (E.stuckCount >= 3 && !E.sees) {
          // last resort while unseen: step onto the nearest waypoint
          const n = nearestNode(E);
          E.x = n.x;
          E.z = n.z;
          E.y = n.y;
          E.stuckCount = 0;
        }
        const goal = E.path[E.path.length - 1];
        E.path = planPath(E, goal);
        E.pi = 0;
      } else E.stuckCount = 0;
    }
    return false;
  }

  function goTo(p) {
    const E = enemy;
    E.path = planPath(E, p);
    E.pi = 0;
    return !!E.path;
  }

  function capture() {
    const P = player, E = enemy;
    if (P.hidden) {
      const h = HIDES[P.hidden];
      P.hidden = null;
      P.x = h.exit[0];
      P.z = h.exit[1];
      P.y = LEVEL[h.l];
    }
    // she ends up right in front of you
    const dx = E.x - P.x, dz = E.z - P.z;
    const d = Math.hypot(dx, dz) || 1;
    E.x = P.x + (dx / d) * 0.78;
    E.z = P.z + (dz / d) * 0.78;
    E.y = P.y;
    E.yaw = Math.atan2(dx / d, dz / d);
    g.caughtFrom = { yaw: P.yaw, pitch: P.pitch };
    g.captures++;
    g.state = "caught";
    g.stateT = 0;
    E.mode = "caught";
    E.path = null;
    g.events.push({ type: "caught", lives: g.lives - 1 });
  }

  function updateEnemy(dt) {
    const E = enemy, P = player;
    if (E.disabled) return;
    E.grace -= dt;
    E.dist = Math.hypot(P.x - E.x, P.z - E.z, P.y - E.y);
    E.reach += ((E.mode === "chase" || E.mode === "pull" ? 1 : 0) - E.reach) * Math.min(1, dt * 4);

    // vision (10 Hz)
    E.visT -= dt;
    if (E.visT <= 0) {
      E.visT = 0.1;
      E.sees = E.grace <= 0 && canSeePlayer();
    }
    if (E.sees) {
      E.lastSeen = { x: P.x, y: P.y, z: P.z, t: g.t, vx: P.vx, vz: P.vz };
      if (E.mode !== "chase" && E.mode !== "alert" && E.mode !== "pull") {
        const near = E.dist < 3 ? 5.5 : 1.8 * (1 - E.dist / 14) + 0.5;
        E.awareness = Math.min(1, E.awareness + near * dt * (P.moving ? 1.2 : 0.8));
        if (E.awareness >= 1) {
          setMode("alert");
          E.path = null;
          g.events.push({ type: "spotted" });
        }
      }
    } else if (E.mode !== "chase" && E.mode !== "alert") E.awareness = Math.max(0, E.awareness - dt * 0.35);

    E.timer += dt;
    E.humT -= dt;
    if (E.humT <= 0 && (E.mode === "patrol" || E.mode === "search")) {
      E.humT = 7 + rand() * 9;
      g.events.push({ type: "hum", x: E.x, y: E.y, z: E.z });
    }

    switch (E.mode) {
      case "patrol": {
        E.speed = 0;
        if (!E.path || E.pi >= E.path.length) {
          // linger, glancing around, then pick somewhere new
          E.look += dt;
          E.yaw += Math.sin(E.look * 1.3) * dt * 0.8;
          if (E.timer > (E.pause ?? 1.5)) {
            goTo(pickPatrolTarget());
            E.timer = 0;
          }
        } else if (followPath(dt, ENEMY_SPEED.patrol)) {
          E.path = null;
          E.timer = 0;
          E.pause = 1.4 + rand() * 2.4;
        }
        break;
      }
      case "investigate": {
        if (!E.path || followPath(dt, ENEMY_SPEED.investigate)) {
          setMode("search");
          E.searchT = 0;
          E.path = null;
        }
        break;
      }
      case "alert": {
        // a shriek and a beat of stillness — the player's cue to run
        E.speed = 0;
        const want = Math.atan2(-(P.x - E.x), -(P.z - E.z));
        E.yaw += wrapAngle(want - E.yaw) * Math.min(1, dt * 10);
        if (E.timer > 0.7) {
          setMode("chase");
          E.repathT = 0;
          E.chaseT = 0;
          E.lostT = 0;
        }
        break;
      }
      case "chase": {
        E.chaseT += dt;
        if (P.hidden) {
          if (E.knowsHide) {
            setMode("pull");
            goTo({ x: HIDES[E.knowsHide].exit[0], y: LEVEL[HIDES[E.knowsHide].l], z: HIDES[E.knowsHide].exit[1] });
          } else E.sees = false;
        }
        if (E.sees) {
          E.lostT = 0;
          const flat = Math.hypot(P.x - E.x, P.z - E.z);
          // catch: within arm's reach, same level, with sight
          if (flat < 1.05 && Math.abs(P.y - E.y) < 1.0) {
            capture();
            return;
          }
          // cornered somewhere too tight for her body: she reaches in
          if (flat < 1.8 && Math.abs(P.y - E.y) < 1.0 && E.speed < 0.6) E.cornerT += dt;
          else E.cornerT = Math.max(0, E.cornerT - dt);
          if (E.cornerT > 1.0) {
            capture();
            return;
          }
          E.repathT -= dt;
          if (flat < 2.5 && Math.abs(P.y - E.y) < 1.0 && lineOfSight(E.x, E.y + 1.0, E.z, P.x, P.y + 1.0, P.z, doors)) {
            // close and nothing tall between: lunge straight at them, sliding along furniture
            E.path = [{ x: P.x, y: P.y, z: P.z, doors: [] }];
            E.pi = 0;
            E.repathT = 0;
          } else if (E.repathT <= 0) {
            E.repathT = 0.25;
            const direct = walkClear(E, P, ENEMY_R, doors);
            E.path = direct.ok ? [{ x: P.x, y: P.y, z: P.z, doors: [] }] : planPath(E, P);
            E.pi = 0;
          }
        } else {
          E.lostT += dt;
          if (E.lostT < dt * 1.5 || !E.path) {
            // head for where she last saw you, plus a guess along your heading
            const ls = E.lastSeen || P;
            let tx = ls.x + clamp(ls.vx || 0, -4, 4) * 0.5, tz = ls.z + clamp(ls.vz || 0, -4, 4) * 0.5;
            if (!walkClear(ls, { x: tx, z: tz }, ENEMY_R).ok) {
              tx = ls.x;
              tz = ls.z;
            }
            goTo({ x: tx, y: ls.y, z: tz });
          }
        }
        const done = followPath(dt, ENEMY_SPEED.chase);
        if (!E.sees && (done || E.lostT > 9)) {
          setMode("search");
          E.searchT = 0;
          E.path = null;
          E.awareness = 0.4;
        }
        break;
      }
      case "pull": {
        const id = E.knowsHide;
        if (!P.hidden || P.hidden !== id) {
          // they slipped out — chase if she can see them, otherwise search
          E.knowsHide = null;
          setMode(E.sees ? "chase" : "search");
          E.searchT = 0;
          E.path = null;
          break;
        }
        if (followPath(dt, ENEMY_SPEED.chase) || Math.hypot(HIDES[id].exit[0] - E.x, HIDES[id].exit[1] - E.z) < 0.4) {
          E.speed = 0;
          if (E.timer > 0.4) capture();
        } else E.timer = 0;
        break;
      }
      case "search": {
        E.searchT += dt;
        if (E.inspectT > 0) {
          // standing in front of a hiding place, listening
          E.inspectT -= dt;
          E.speed = 0;
          if (E.inspectT <= 0) E.path = null;
          break;
        }
        if (!E.path || E.pi >= E.path.length) {
          E.speed = 0;
          E.look += dt;
          E.yaw += Math.sin(E.look * 2.1) * dt * 1.6;
          if (E.inspectId) {
            E.inspectT = 1.8;
            E.lastInspect[E.inspectId] = g.t;
            g.events.push({ type: "inspect", id: E.inspectId });
            E.inspectId = null;
            break;
          }
          if (E.timer > 1.4) {
            E.timer = 0;
            if (E.searchT > 11) {
              setMode("patrol");
              E.path = null;
              E.timer = 0;
              E.pause = 1;
              break;
            }
            // maybe check a nearby hiding place (she cannot find you unless she saw you get in)
            const hideNear = HIDE_IDS.filter((id) => {
              const h = HIDES[id];
              return Math.abs(LEVEL[h.l] - E.y) < 1.5 && Math.hypot(h.exit[0] - E.x, h.exit[1] - E.z) < 6.5 && g.t - (E.lastInspect[id] ?? -99) > 25;
            });
            if (hideNear.length && rand() < 0.55) {
              const id = pick(hideNear);
              E.inspectId = id;
              goTo({ x: HIDES[id].exit[0], y: LEVEL[HIDES[id].l], z: HIDES[id].exit[1] });
            } else {
              const near = LAYOUT.nodes.filter((n) => n.tag === "wp" && Math.abs(n.y - E.y) < 1.5 && Math.hypot(n.x - E.x, n.z - E.z) < 7 && Math.hypot(n.x - E.x, n.z - E.z) > 1.5);
              if (near.length) goTo(pick(near));
            }
          }
        } else if (followPath(dt, ENEMY_SPEED.search)) {
          E.path = null;
          E.timer = 0;
        }
        break;
      }
      default:
        break;
    }
  }

  return g;
}

/** Hiding-spot geometry, exported for tests and the renderer. */
export function hideExitClear(id) {
  const h = HIDES[id];
  const y = floorAt(h.exit[0], h.exit[1], LEVEL[h.l] + 0.1);
  if (y === null) return false;
  return !overlaps(h.exit[0], y, h.exit[1], PLAYER_R, PLAYER_H, null);
}
