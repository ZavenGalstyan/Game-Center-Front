/**
 * Prison Escape 3D — the game simulation (no Three.js, no DOM).
 *
 * `Game` owns everything that matters for play: the player controller and its
 * collisions, doors, inventory, interactions, guards (patrol → suspicious →
 * investigate → chase → return), wall cameras, searchlights, missions, the
 * capture/checkpoint flow and save data. The renderer only reads it, and
 * the headless tests in tools/ drive it directly.
 */
import {
  WALLS, PROPS, PROP_DEFS, DOORS, DOOR_BY_ID, ZONES, zoneAt, ROLLCALL, FREEDOM_Z, PLAYER, BOUNDS, T, H_IN,
  CROUCH_HEIGHT, STAND_HEIGHT, ITEMS, ITEM_IDS, MISSIONS, ROUTE_STEPS, ROUTES, GUARDS, INMATES, CELLS, PLAYER_CELL,
  CAMERAS, SEARCHLIGHTS, SPOTS, HIDES, FACING, CHECKPOINT, BREAKER_ORDER, NOTES, SAVE_VERSION, GLYPHS,
} from "./data.js";

const TAU = Math.PI * 2;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const angDiff = (a, b) => Math.atan2(Math.sin(a - b), Math.cos(a - b));
/** Yaw that looks from (ax,az) toward (bx,bz); yaw 0 = north (−z). */
export const yawTo = (ax, az, bx, bz) => Math.atan2(-(bx - ax), -(bz - az));

/* ===================================================================== boxes */
function sizeOf(p) {
  const d = PROP_DEFS[p.t];
  const w = (p.w ?? d.w) * (p.n || 1);
  const dd = p.d ?? d.d;
  const ew = p.f === "e" || p.f === "w";
  return { sx: ew ? dd : w, sz: ew ? w : dd, h: p.h ?? d.h, def: d };
}
/** Collision/sight boxes for one prop. */
export function propBoxes(p) {
  const { sx, sz, h, def } = sizeOf(p);
  if (def.deco) return [];
  const base = { y1: 0, y2: h, opaque: !def.see, owner: p.id || null, prop: p.t };
  if (p.t === "detector") {
    const ew = p.f === "e" || p.f === "w";
    const off = (ew ? sz : sx) / 2 - 0.1;
    return [-1, 1].map((s) => ({
      ...base,
      x1: p.x + (ew ? 0 : s * off) - 0.12, x2: p.x + (ew ? 0 : s * off) + 0.12,
      z1: p.z + (ew ? s * off : 0) - sz / 2 * (ew ? 0.1 : 1), z2: p.z + (ew ? s * off : 0) + sz / 2 * (ew ? 0.1 : 1),
    }));
  }
  if (p.t === "tower") {
    const o = sx / 2 - 0.2;
    return [[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([a, b]) => ({ ...base, x1: p.x + a * o - 0.15, x2: p.x + a * o + 0.15, z1: p.z + b * o - 0.15, z2: p.z + b * o + 0.15 }));
  }
  return [{ ...base, x1: p.x - sx / 2, x2: p.x + sx / 2, z1: p.z - sz / 2, z2: p.z + sz / 2 }];
}
export { sizeOf as propSize };

/** Static colliders: walls + props. */
function buildStatic() {
  const list = [];
  for (const w of WALLS) {
    list.push({ x1: w.x1, z1: w.z1, x2: w.x2, z2: w.z2, y1: w.y1, y2: w.h, opaque: w.kind !== "bars" && w.kind !== "fence" && w.kind !== "invisible", wall: w.kind, owner: null });
  }
  for (const p of PROPS) list.push(...propBoxes(p));
  return list;
}

/** Uniform grid over boxes for fast neighbourhood queries. */
class BoxGrid {
  constructor(boxes, cell = 4) {
    this.boxes = boxes;
    this.cell = cell;
    this.nx = Math.ceil((BOUNDS.x2 - BOUNDS.x1) / cell) + 1;
    this.nz = Math.ceil((BOUNDS.z2 - BOUNDS.z1) / cell) + 1;
    this.cells = Array.from({ length: this.nx * this.nz }, () => []);
    this.stamp = new Uint32Array(boxes.length);
    this.q = 0;
    boxes.forEach((b, i) => {
      const [a, c] = this.range(b.x1, b.z1, b.x2, b.z2);
      for (let z = a[1]; z <= c[1]; z++) for (let x = a[0]; x <= c[0]; x++) this.cells[z * this.nx + x].push(i);
    });
  }
  range(x1, z1, x2, z2) {
    const c = this.cell;
    return [
      [clamp(Math.floor((x1 - BOUNDS.x1) / c), 0, this.nx - 1), clamp(Math.floor((z1 - BOUNDS.z1) / c), 0, this.nz - 1)],
      [clamp(Math.floor((x2 - BOUNDS.x1) / c), 0, this.nx - 1), clamp(Math.floor((z2 - BOUNDS.z1) / c), 0, this.nz - 1)],
    ];
  }
  /** Calls fn(box) once for every box overlapping the rect. */
  query(x1, z1, x2, z2, fn) {
    const q = ++this.q;
    const [a, c] = this.range(x1, z1, x2, z2);
    for (let z = a[1]; z <= c[1]; z++) {
      for (let x = a[0]; x <= c[0]; x++) {
        for (const i of this.cells[z * this.nx + x]) {
          if (this.stamp[i] === q) continue;
          this.stamp[i] = q;
          if (fn(this.boxes[i]) === true) return true;
        }
      }
    }
    return false;
  }
}

/** Segment (a→b) vs AABB slab test (3D). */
function segHitsBox(ax, ay, az, bx, by, bz, b) {
  let t0 = 0;
  let t1 = 1;
  const d = [bx - ax, by - ay, bz - az];
  const o = [ax, ay, az];
  const mn = [b.x1, b.y1, b.z1];
  const mx = [b.x2, b.y2, b.z2];
  for (let k = 0; k < 3; k++) {
    if (Math.abs(d[k]) < 1e-9) {
      if (o[k] < mn[k] || o[k] > mx[k]) return false;
    } else {
      let ta = (mn[k] - o[k]) / d[k];
      let tb = (mx[k] - o[k]) / d[k];
      if (ta > tb) [ta, tb] = [tb, ta];
      if (ta > t0) t0 = ta;
      if (tb < t1) t1 = tb;
      if (t0 > t1) return false;
    }
  }
  return true;
}

/* ===================================================================== nav */
const NAV = 0.5;
const NAV_R = 0.27;
export class Nav {
  constructor(boxes, r = NAV_R, maxY = 1.8) {
    this.r = r;
    this.nx = Math.round((BOUNDS.x2 - BOUNDS.x1) / NAV);
    this.nz = Math.round((BOUNDS.z2 - BOUNDS.z1) / NAV);
    const n = this.nx * this.nz;
    this.block = new Uint8Array(n);
    this.door = new Int16Array(n).fill(-1);
    for (const b of boxes) {
      if (b.y1 > maxY) continue;
      this.mark(b, r, (i) => (this.block[i] = 1));
    }
    DOORS.forEach((d, di) => {
      const b = doorBox(d);
      this.mark(b, r, (i) => {
        if (!this.block[i]) this.door[i] = di;
      });
    });
    this.g = new Float32Array(n);
    this.f = new Float32Array(n);
    this.from = new Int32Array(n);
    this.seen = new Uint32Array(n);
    this.closed = new Uint32Array(n);
    this.run = 0;
  }
  mark(b, r, fn) {
    const i1 = Math.max(0, Math.floor((b.x1 - r - BOUNDS.x1) / NAV));
    const i2 = Math.min(this.nx - 1, Math.floor((b.x2 + r - BOUNDS.x1) / NAV));
    const k1 = Math.max(0, Math.floor((b.z1 - r - BOUNDS.z1) / NAV));
    const k2 = Math.min(this.nz - 1, Math.floor((b.z2 + r - BOUNDS.z1) / NAV));
    for (let k = k1; k <= k2; k++) {
      for (let i = i1; i <= i2; i++) {
        const cx = BOUNDS.x1 + (i + 0.5) * NAV;
        const cz = BOUNDS.z1 + (k + 0.5) * NAV;
        if (cx > b.x1 - r && cx < b.x2 + r && cz > b.z1 - r && cz < b.z2 + r) fn(k * this.nx + i);
      }
    }
  }
  idx(x, z) {
    const i = clamp(Math.floor((x - BOUNDS.x1) / NAV), 0, this.nx - 1);
    const k = clamp(Math.floor((z - BOUNDS.z1) / NAV), 0, this.nz - 1);
    return k * this.nx + i;
  }
  pos(c) {
    return [BOUNDS.x1 + ((c % this.nx) + 0.5) * NAV, BOUNDS.z1 + (Math.floor(c / this.nx) + 0.5) * NAV];
  }
  free(c, pass) {
    if (this.block[c]) return false;
    const d = this.door[c];
    return d < 0 || pass(d);
  }
  /** Nearest free cell to (x,z) within a few cells. */
  nearestFree(x, z, pass) {
    const c0 = this.idx(x, z);
    if (this.free(c0, pass)) return c0;
    const ci = c0 % this.nx;
    const ck = Math.floor(c0 / this.nx);
    for (let r = 1; r <= 6; r++) {
      let best = -1;
      let bd = 1e9;
      for (let k = ck - r; k <= ck + r; k++) {
        for (let i = ci - r; i <= ci + r; i++) {
          if (i < 0 || k < 0 || i >= this.nx || k >= this.nz) continue;
          const c = k * this.nx + i;
          if (!this.free(c, pass)) continue;
          const [px, pz] = this.pos(c);
          const d = (px - x) ** 2 + (pz - z) ** 2;
          if (d < bd) {
            bd = d;
            best = c;
          }
        }
      }
      if (best >= 0) return best;
    }
    return -1;
  }
  /** Straight walkable line between two points on the grid. */
  clear(ax, az, bx, bz, pass) {
    const d = Math.hypot(bx - ax, bz - az);
    const n = Math.ceil(d / (NAV * 0.5));
    for (let s = 1; s < n; s++) {
      const t = s / n;
      if (!this.free(this.idx(ax + (bx - ax) * t, az + (bz - az) * t), pass)) return false;
    }
    return true;
  }
  /** A* → smoothed list of [x,z] points (excluding start), or null. */
  path(ax, az, bx, bz, pass, maxIter = 40000) {
    const s = this.nearestFree(ax, az, pass);
    const e = this.nearestFree(bx, bz, pass);
    if (s < 0 || e < 0) return null;
    if (s === e) return [[bx, bz]];
    const run = ++this.run;
    const nx = this.nx;
    const [ex, ez] = [e % nx, Math.floor(e / nx)];
    const h = (c) => {
      const dx = Math.abs((c % nx) - ex);
      const dz = Math.abs(Math.floor(c / nx) - ez);
      return (dx + dz + (Math.SQRT2 - 2) * Math.min(dx, dz));
    };
    const heap = [s];
    this.g[s] = 0;
    this.f[s] = h(s);
    this.seen[s] = run;
    this.from[s] = -1;
    const push = (c) => {
      heap.push(c);
      let i = heap.length - 1;
      while (i > 0) {
        const p = (i - 1) >> 1;
        if (this.f[heap[p]] <= this.f[heap[i]]) break;
        [heap[p], heap[i]] = [heap[i], heap[p]];
        i = p;
      }
    };
    const pop = () => {
      const top = heap[0];
      const last = heap.pop();
      if (heap.length) {
        heap[0] = last;
        let i = 0;
        for (;;) {
          const l = i * 2 + 1;
          const r = l + 1;
          let m = i;
          if (l < heap.length && this.f[heap[l]] < this.f[heap[m]]) m = l;
          if (r < heap.length && this.f[heap[r]] < this.f[heap[m]]) m = r;
          if (m === i) break;
          [heap[m], heap[i]] = [heap[i], heap[m]];
          i = m;
        }
      }
      return top;
    };
    let iter = 0;
    let found = false;
    while (heap.length && iter++ < maxIter) {
      const c = pop();
      if (this.closed[c] === run) continue;
      this.closed[c] = run;
      if (c === e) {
        found = true;
        break;
      }
      const ci = c % nx;
      const ck = Math.floor(c / nx);
      for (let dk = -1; dk <= 1; dk++) {
        for (let di = -1; di <= 1; di++) {
          if (!di && !dk) continue;
          const i = ci + di;
          const k = ck + dk;
          if (i < 0 || k < 0 || i >= nx || k >= this.nz) continue;
          const n = k * nx + i;
          if (this.closed[n] === run || !this.free(n, pass)) continue;
          if (di && dk && (!this.free(ck * nx + i, pass) || !this.free(k * nx + ci, pass))) continue;
          const g = this.g[c] + (di && dk ? Math.SQRT2 : 1);
          if (this.seen[n] !== run || g < this.g[n]) {
            this.seen[n] = run;
            this.g[n] = g;
            this.f[n] = g + h(n);
            this.from[n] = c;
            push(n);
          }
        }
      }
    }
    if (!found) return null;
    const cells = [];
    for (let c = e; c >= 0; c = this.from[c]) cells.push(c);
    cells.reverse();
    // string-pull: keep only the corners we can't see past
    const pts = cells.map((c) => this.pos(c));
    pts[pts.length - 1] = [bx, bz];
    const out = [];
    let cur = [ax, az];
    let i = 0;
    while (i < pts.length - 1) {
      let j = pts.length - 1;
      while (j > i + 1 && !this.clear(cur[0], cur[1], pts[j][0], pts[j][1], pass)) j--;
      out.push(pts[j]);
      cur = pts[j];
      i = j;
    }
    if (!out.length) out.push([bx, bz]);
    return out;
  }
}

/** Collider for a door's gap. */
export function doorBox(d) {
  const h = d.kind === "vent" ? 0.95 : d.kind === "fencepanel" ? 1.15 : d.z < -40 && d.kind === "gate" ? 3.2 : H_IN;
  return d.axis === "x"
    ? { x1: d.x - d.w / 2, x2: d.x + d.w / 2, z1: d.z - T / 2 - 0.02, z2: d.z + T / 2 + 0.02, y1: 0, y2: h }
    : { x1: d.x - T / 2 - 0.02, x2: d.x + T / 2 + 0.02, z1: d.z - d.w / 2, z2: d.z + d.w / 2, y1: 0, y2: h };
}
const SEE_THROUGH = new Set(["cellgate", "gate", "fencepanel"]);

/* ===================================================================== save */
const STEP_IDS = new Set([...MISSIONS.flatMap((m) => m.steps.map((s) => s.id)), ...ROUTE_STEPS.A.map((s) => s.id), ...ROUTE_STEPS.B.map((s) => s.id)]);
const EXTRA_FLAGS = ["storagedoor", "logbook", "floodpanel"];
const KNOWN_FLAGS = new Set([...STEP_IDS, ...EXTRA_FLAGS]);

/** Reads + validates a save; returns a clean object or null. */
export function readSave(storage, key) {
  try {
    const raw = storage?.getItem(key);
    if (!raw) return null;
    return validateSave(JSON.parse(raw));
  } catch {
    return null;
  }
}
export function validateSave(s) {
  if (!s || typeof s !== "object" || s.v !== SAVE_VERSION) return null;
  const mission = Number.isInteger(s.mission) && s.mission >= 0 && s.mission < MISSIONS.length ? s.mission : null;
  if (mission == null) return null;
  const strs = (a, ok) => (Array.isArray(a) ? [...new Set(a.filter((x) => typeof x === "string" && ok(x)))] : []);
  const flags = strs(s.flags, (f) => KNOWN_FLAGS.has(f));
  if (flags.includes("free")) return null; // a finished run isn't continued
  const inv = strs(s.inv, (i) => ITEM_IDS.includes(i));
  const got = strs(s.got, (i) => ITEM_IDS.includes(i));
  for (const i of inv) if (!got.includes(i)) got.push(i);
  const route = s.route === "A" || s.route === "B" ? s.route : null;
  if (!route) flags.splice(0, flags.length, ...flags.filter((f) => f !== "route"));
  const out = {
    v: SAVE_VERSION,
    mission: mission === 7 && !route ? 6 : mission,
    flags,
    inv,
    got,
    sel: inv.includes(s.sel) ? s.sel : inv[0] || null,
    route,
    doors: {},
    puzzle: {
      seq: strs(s.puzzle?.seq, (b) => BREAKER_ORDER.includes(b)).slice(0, 2),
      keypadWrong: Number.isInteger(s.puzzle?.keypadWrong) ? clamp(s.puzzle.keypadWrong, 0, 99) : 0,
      breakerWrong: Number.isInteger(s.puzzle?.breakerWrong) ? clamp(s.puzzle.breakerWrong, 0, 99) : 0,
    },
    timesCaught: Number.isInteger(s.timesCaught) ? clamp(s.timesCaught, 0, 9999) : 0,
    time: Number.isFinite(s.time) ? clamp(s.time, 0, 1e7) : 0,
    intel: !!s.intel,
    flashlight: !!s.flashlight,
    player: null,
    checkpoint: null,
  };
  if (s.doors && typeof s.doors === "object") {
    for (const [id, v] of Object.entries(s.doors)) if (DOOR_BY_ID[id] && typeof v === "boolean") out.doors[id] = v;
  }
  const P = s.player;
  if (P && [P.x, P.z, P.yaw].every(Number.isFinite) && P.x > BOUNDS.x1 && P.x < BOUNDS.x2 && P.z > BOUNDS.z1 && P.z < BOUNDS.z2) {
    out.player = { x: P.x, z: P.z, yaw: P.yaw, crouch: !!P.crouch };
  }
  const C = s.checkpoint;
  if (C && [C.x, C.z, C.yaw].every(Number.isFinite)) out.checkpoint = { x: C.x, z: C.z, yaw: C.yaw };
  return out;
}

/* ===================================================================== game */
const BARKS = {
  suspicious: ["Hm?", "Who's there?", "Something moved over there…", "Huh?"],
  chase: ["Hey! Stop right there!", "Inmate out of bounds!", "Freeze!", "Got a runner!"],
  investigate: ["I heard something.", "What was that?", "Checking it out."],
  return: ["Must've been rats.", "Nothing. Back to my rounds.", "Huh. Must be hearing things."],
  run: ["Walk, inmate!", "No running!", "Slow down!"],
  lost: ["Where'd he go?", "Lost him…", "Come out, wherever you are."],
  talk: ["Keep moving, inmate.", "Something you need? No? Then move along.", "Eyes front."],
};
const pickLine = (list, r) => list[Math.floor(r() * list.length) % list.length];


let SHARED = null; // static colliders + grid + nav are identical for every game
function shared() {
  if (!SHARED) {
    const boxes = buildStatic();
    SHARED = { boxes, grid: new BoxGrid(boxes), nav: new Nav(boxes) };
  }
  return SHARED;
}

export class Game {
  constructor(save = null, { seed = 1 } = {}) {
    const S = shared();
    this.boxes = S.boxes;
    this.grid = S.grid;
    this.nav = S.nav;
    this.rs = seed >>> 0; // RNG state (plain number, so snapshots can copy it)
    this.events = [];
    this.time = 0;
    this.clock = 0; // world clock (for sweeps), not saved
    this.mission = 0;
    this.flags = new Set();
    this.inv = [];
    this.got = new Set();
    this.sel = null;
    this.route = null;
    this.timesCaught = 0;
    this.intel = false;
    this.flashlight = false;
    this.puzzle = { seq: [], keypadWrong: 0, breakerWrong: 0, keypad: [] };
    this.player = { x: CHECKPOINT.x, z: CHECKPOINT.z, yaw: CHECKPOINT.yaw, pitch: 0, vx: 0, vz: 0, crouch: false, cb: 0, stamina: 100, exhausted: false, restT: 0, hidden: null, moving: 0, sprinting: false, stepAcc: 0, speed: 0 };
    this.checkpoint = { ...CHECKPOINT };
    this.doors = DOORS.map((d) => ({ id: d.id, def: d, open: 0, want: false, locked: !!d.lock, lock: d.lock, box: doorBox(d) }));
    this.doorById = Object.fromEntries(this.doors.map((d) => [d.id, d]));
    this.doorIndex = Object.fromEntries(DOORS.map((d, i) => [d.id, i]));
    this.guards = GUARDS.map((def) => ({ id: def.id, name: def.name, def, active: false, x: 0, z: 0, yaw: 0, state: "patrol", wp: 0, path: null, pi: 0, pause: 0, base: 0, aware: 0, seen: false, losT: 0, lastSeen: null, lostT: 0, lookT: 0, repath: 0, barkT: 0, speed: 0, phase: 0, target: null, hideTarget: null, run: false }));
    this.inmates = INMATES.map((def) => ({ id: def.id, name: def.name, def, x: 0, z: 0, yaw: 0, pose: "stand", walk: null, wi: 0, speed: 0, phase: 0, line: 0, faceT: 0, faceYaw: 0 }));
    this.cams = CAMERAS.map((c) => ({ ...c, base: yawTo(c.x, c.z, c.look[0], c.look[1]), yaw: 0, aware: 0, seen: false, cool: 0, active: false }));
    this.lights = SEARCHLIGHTS.map((s) => ({ ...s, cx: 0, cz: 0, aware: 0, on: false, hit: false, cool: 0 }));
    this.capture = null;
    this.transition = null;
    this.ended = null;
    this.channel = null;
    this.target = null;
    this.stepT = 0; // time on the current objective (hints)
    this.hintNow = false;
    this.vis = 1;
    this.zone = ZONES[0];
    this.alert = 0;
    this.dirty = false;
    this.stats = { maxGuards: 0 };

    if (save) this.load(save);
    else this.setPhase(this.phaseFor(0), true);
  }

  /* ------------------------------------------------------------ basics */
  rand() {
    this.rs = (this.rs + 0x6d2b79f5) | 0;
    let t = Math.imul(this.rs ^ (this.rs >>> 15), 1 | this.rs);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  emit(type, o = {}) {
    this.events.push({ type, ...o });
  }
  has(item) {
    return this.inv.includes(item);
  }
  give(item, msg) {
    if (this.has(item)) return;
    this.inv.push(item);
    this.got.add(item);
    this.sel = item;
    this.emit("pickup", { item, msg: msg || `Picked up: ${ITEMS[item].name}` });
    this.dirty = true;
  }
  take(item) {
    this.inv = this.inv.filter((i) => i !== item);
    if (this.sel === item) this.sel = this.inv[this.inv.length - 1] || null;
    if (item === "flashlight") this.flashlight = false;
  }
  select(item) {
    if (item == null || this.has(item)) this.sel = item;
  }
  cycleItem(dir = 1) {
    if (!this.inv.length) return;
    const i = this.inv.indexOf(this.sel);
    this.sel = this.inv[(i + dir + this.inv.length) % this.inv.length];
  }
  phaseFor(m) {
    return m === 0 ? "night1" : m >= 7 ? "night2" : "day";
  }
  get phase() {
    return this._phase;
  }
  get night() {
    return this._phase !== "day";
  }

  /* ------------------------------------------------------------ missions */
  steps(m = this.mission) {
    if (m === 7) return ROUTE_STEPS[this.route || "B"];
    return MISSIONS[m]?.steps || [];
  }
  currentStep() {
    return this.steps().find((s) => !this.flags.has(s.id)) || null;
  }
  flag(id) {
    if (this.flags.has(id)) return false;
    this.flags.add(id);
    this.dirty = true;
    const st = this.steps().find((s) => s.id === id);
    if (st) {
      this.stepT = 0;
      this.hintNow = false;
      this.emit("step", { id, text: st.text });
    }
    this.checkMission();
    return true;
  }
  checkMission() {
    let guard = 0;
    while (this.mission < MISSIONS.length && !this.ended && guard++ < 10) {
      const steps = this.steps();
      if (!steps.length || !steps.every((s) => this.flags.has(s.id))) return;
      if (this.mission === 7) return; // Breakout ends via the escape trigger
      const done = MISSIONS[this.mission];
      this.mission++;
      this.stepT = 0;
      this.hintNow = false;
      this.emit("mission", { title: done.title, next: MISSIONS[this.mission].title, index: this.mission });
      const want = this.phaseFor(this.mission);
      if (want !== this._phase) {
        this.transition = { kind: want === "day" ? "morning" : "night", t: 0, dur: 3.6, applied: false };
        return;
      }
    }
  }
  missionView() {
    const m = MISSIONS[this.mission];
    const steps = this.steps();
    const cur = this.currentStep();
    return {
      index: this.mission,
      total: MISSIONS.length,
      title: m.title,
      brief: this.mission === 7 ? `Escape tonight — ${ROUTES[this.route || "B"].name}.` : m.brief,
      steps: steps.map((s) => ({ id: s.id, text: s.text, done: this.flags.has(s.id), cur: cur && cur.id === s.id })),
      hint: cur && (this.hintNow || this.stepT > 45) ? cur.hint : null,
      target: cur ? cur.at : null,
      route: this.route,
    };
  }
  routeReady(r) {
    return ROUTES[r].needs.filter((i) => !this.has(i));
  }

  /* ------------------------------------------------------------ phases */
  setPhase(phase, initial = false) {
    this._phase = phase;
    const night = phase !== "day";
    for (const d of this.doors) {
      const id = d.id;
      if (id.startsWith("cell") && id !== `cell${PLAYER_CELL}`) {
        d.locked = night;
        d.want = !night;
        if (initial) d.open = d.want ? 1 : 0;
      }
    }
    this.deriveLocks();
    const block = this.doorById.block;
    const mine = this.doorById[`cell${PLAYER_CELL}`];
    if (phase === "night2") {
      block.want = this.flags.has("blockgate");
      mine.want = false;
      mine.open = 0;
      block.open = block.want ? 1 : 0;
    } else if (phase === "day") {
      block.want = this.flags.has("rollcall");
      mine.want = this.flags.has("unlock");
    } else {
      block.want = false;
      mine.want = false;
    }
    if (initial) for (const d of this.doors) d.open = d.want ? 1 : 0;
    // NPCs
    for (const g of this.guards) {
      const route = g.def.routes[phase];
      g.active = !!route;
      if (route) this.resetGuard(g);
    }
    for (const n of this.inmates) this.placeInmate(n);
    for (const c of this.cams) {
      c.active = c.phases.includes(phase);
      c.aware = 0;
    }
    for (const l of this.lights) {
      l.on = phase === "night2";
      l.aware = 0;
    }
    this.dirty = true;
  }
  /** Locks follow progress — saves only need to remember open/closed. */
  deriveLocks() {
    const F = this.flags;
    const set = (id, locked, lock) => {
      const d = this.doorById[id];
      d.locked = locked;
      if (lock !== undefined) d.lock = lock;
      if (locked) d.want = false;
    };
    set(`cell${PLAYER_CELL}`, !F.has("unlock"));
    if (this._phase === "night2") set("block", !F.has("blockgate"), "cellkey");
    else set("block", this._phase === "night1" || !F.has("rollcall"), "rollcall");
    set("storage", !F.has("storagedoor"));
    set("check", !F.has("checkpoint"));
    set("yard", !F.has("yarddoor"));
    set("vent", !F.has("vent"));
    set("maint", !F.has("keypad"));
    set("tunnel", !F.has("power"));
    set("exitA", !F.has("gateA"));
    set("fence", !F.has("fence"));
  }
  resetGuard(g) {
    const r = g.def.routes[this._phase];
    g.x = r[0][0];
    g.z = r[0][1];
    g.wp = 0;
    g.state = "patrol";
    g.pause = r[0][2] || 0;
    g.base = r[0][3] ?? (r.length > 1 ? yawTo(r[0][0], r[0][1], r[1][0], r[1][1]) : 0);
    g.yaw = g.base;
    g.path = null;
    g.aware = 0;
    g.seen = false;
    g.lastSeen = null;
    g.hideTarget = null;
    g.target = null;
    g.run = false;
    g.retWp = null;
  }
  placeInmate(n) {
    const night = this._phase !== "day";
    n.walk = null;
    if (night) {
      const c = CELLS[n.def.pos.night];
      n.x = c.x1 + 1.35;
      n.z = 26.2;
      n.yaw = -Math.PI / 2;
      n.pose = "sit";
    } else if (n.def.walk?.day) {
      n.walk = n.def.walk.day;
      n.wi = 1;
      [n.x, n.z] = n.walk[0];
      n.pose = "stand";
    } else {
      const [x, z, yaw, pose] = n.def.pos.day;
      Object.assign(n, { x, z, yaw, pose });
    }
    n.faceT = 0;
  }

  /* ------------------------------------------------------------ collision */
  heightNow() {
    return this.player.crouch ? CROUCH_HEIGHT : STAND_HEIGHT;
  }
  blocks(b, height) {
    return b.y1 < height && b.y2 > 0.05;
  }
  /** Push a circle out of every collider; returns the corrected position. */
  resolve(x, z, r, height = STAND_HEIGHT, npcs = true) {
    for (let it = 0; it < 3; it++) {
      let moved = false;
      const push = (b) => {
        if (!this.blocks(b, height)) return;
        const cx = clamp(x, b.x1, b.x2);
        const cz = clamp(z, b.z1, b.z2);
        const dx = x - cx;
        const dz = z - cz;
        const d2 = dx * dx + dz * dz;
        if (d2 >= r * r) return;
        if (d2 > 1e-10) {
          const d = Math.sqrt(d2);
          x = cx + (dx / d) * r;
          z = cz + (dz / d) * r;
        } else {
          // centre inside the box — leave along the shallowest side
          const opts = [[b.x1 - r - x, 0], [b.x2 + r - x, 0], [0, b.z1 - r - z], [0, b.z2 + r - z]];
          opts.sort((a, c) => Math.abs(a[0] + a[1]) - Math.abs(c[0] + c[1]));
          x += opts[0][0];
          z += opts[0][1];
        }
        moved = true;
      };
      this.grid.query(x - r - 0.1, z - r - 0.1, x + r + 0.1, z + r + 0.1, push);
      for (const d of this.doors) if (this.doorSolid(d)) push(d.box);
      if (npcs) {
        for (const n of this.inmates) {
          const dx = x - n.x;
          const dz = z - n.z;
          const d = Math.hypot(dx, dz);
          const rr = r + 0.3;
          if (d < rr && d > 1e-6) {
            x = n.x + (dx / d) * rr;
            z = n.z + (dz / d) * rr;
            moved = true;
          }
        }
      }
      if (!moved) break;
    }
    return [x, z];
  }
  inDoorway(d) {
    const b = d.box;
    const p = this.player;
    const cx = clamp(p.x, b.x1, b.x2);
    const cz = clamp(p.z, b.z1, b.z2);
    return (p.x - cx) ** 2 + (p.z - cz) ** 2 < (PLAYER.r + 0.08) ** 2;
  }
  doorSolid(d) {
    return d.open < 0.9 || !d.want;
  }
  overlapsAny(x, z, r, height) {
    const hit = (b) => {
      if (!this.blocks(b, height)) return false;
      const cx = clamp(x, b.x1, b.x2);
      const cz = clamp(z, b.z1, b.z2);
      return (x - cx) ** 2 + (z - cz) ** 2 < r * r - 1e-4;
    };
    if (this.grid.query(x - r, z - r, x + r, z + r, hit)) return true;
    return this.doors.some((d) => this.doorSolid(d) && hit(d.box));
  }
  /** Line of sight between two 3D points (walls, closed doors, tall props). */
  los(ax, ay, az, bx, by, bz, ignore = null) {
    const hit = (b) => b.opaque && (!ignore || b.owner !== ignore) && segHitsBox(ax, ay, az, bx, by, bz, b);
    if (this.grid.query(Math.min(ax, bx), Math.min(az, bz), Math.max(ax, bx), Math.max(az, bz), hit)) return false;
    for (const d of this.doors) {
      if (d.open > 0.6 || SEE_THROUGH.has(d.def.kind) || d.id === ignore) continue;
      if (segHitsBox(ax, ay, az, bx, by, bz, d.box)) return false;
    }
    return true;
  }
  doorPass(i) {
    const d = this.doors[i];
    if (d.def.crawl) return false;
    return !d.locked || d.open > 0.9;
  }

  /* ------------------------------------------------------------ player */
  toggleCrouch(force) {
    const p = this.player;
    if (p.hidden) return;
    const want = force ?? !p.crouch;
    if (!want && this.overlapsAny(p.x, p.z, PLAYER.r * 0.95, STAND_HEIGHT)) {
      this.emit("deny", { msg: "Not enough room to stand up here.", quiet: true });
      return;
    }
    p.crouch = want;
  }
  stepPlayer(inp, dt) {
    const p = this.player;
    if (p.hidden || this.capture || this.transition || this.ended) {
      p.vx = p.vz = 0;
      p.moving = 0;
      p.sprinting = false;
      return;
    }
    let fx = (inp.r ? 1 : 0) - (inp.l ? 1 : 0);
    let fz = (inp.b ? 1 : 0) - (inp.f ? 1 : 0);
    const len = Math.hypot(fx, fz);
    if (len > 0) {
      fx /= len;
      fz /= len;
    }
    if (inp.sprint && p.crouch && len > 0 && fz < 0) this.toggleCrouch(false);
    const wantSprint = inp.sprint && len > 0 && fz < 0.2 && !p.crouch && !p.exhausted && p.stamina > 0;
    p.sprinting = wantSprint;
    if (wantSprint) {
      p.stamina = Math.max(0, p.stamina - PLAYER.staminaDrain * dt);
      p.restT = 0;
      if (p.stamina <= 0) p.exhausted = true;
    } else {
      p.restT += dt;
      if (p.restT > 0.8) p.stamina = Math.min(100, p.stamina + PLAYER.staminaRegen * dt);
      if (p.exhausted && p.stamina > 30) p.exhausted = false;
    }
    const speed = p.crouch ? PLAYER.crouch : wantSprint ? PLAYER.sprint : PLAYER.walk;
    // camera-relative: forward = (−sin yaw, −cos yaw), right = (cos yaw, −sin yaw)
    const s = Math.sin(p.yaw);
    const c = Math.cos(p.yaw);
    const tx = (fx * c + fz * s) * speed;
    const tz = (-fx * s + fz * c) * speed;
    const k = 1 - Math.exp(-dt * (len > 0 ? 11 : 14));
    p.vx += (tx - p.vx) * k;
    p.vz += (tz - p.vz) * k;
    const sp = Math.hypot(p.vx, p.vz);
    const h = this.heightNow();
    const n = Math.max(1, Math.ceil((sp * dt) / 0.15));
    const ox = p.x;
    const oz = p.z;
    for (let i = 0; i < n; i++) {
      [p.x, p.z] = this.resolve(p.x + (p.vx * dt) / n, p.z + (p.vz * dt) / n, PLAYER.r, h);
    }
    p.x = clamp(p.x, BOUNDS.x1 + 1, BOUNDS.x2 - 1);
    p.z = clamp(p.z, BOUNDS.z1 + 1, BOUNDS.z2 - 1);
    const moved = Math.hypot(p.x - ox, p.z - oz);
    // real velocity after collisions (sliding along walls)
    if (dt > 0) {
      p.vx = (p.x - ox) / dt;
      p.vz = (p.z - oz) / dt;
    }
    p.speed = moved / Math.max(dt, 1e-6);
    p.moving = p.speed > 0.3 ? (wantSprint ? 3 : p.crouch ? 1 : 2) : 0;
    p.cb += ((p.crouch ? 1 : 0) - p.cb) * (1 - Math.exp(-dt * 10));
    // footsteps + noise
    p.stepAcc += moved;
    const stride = wantSprint ? 0.95 : p.crouch ? 0.62 : 0.72;
    if (p.stepAcc > stride) {
      p.stepAcc = 0;
      const surface = this.zone.outdoor ? "gravel" : this.zone.id === "tunnel" || this.zone.id === "maint" ? "metal" : "concrete";
      this.emit("footstep", { surface, sprint: wantSprint, crouch: p.crouch });
      this.noise(p.x, p.z, wantSprint ? 9 : p.crouch ? 1.1 : 3.6, "steps");
    }
  }
  eyeHeight() {
    return PLAYER.eye + (PLAYER.eyeCrouch - PLAYER.eye) * this.player.cb;
  }
  headY() {
    return this.player.hidden ? 1.2 : this.player.crouch ? 0.8 : 1.55;
  }

  /* ------------------------------------------------------------ stealth */
  trespassing() {
    if (this._phase === "night2") return this.zone.id !== "mycell";
    if (this._phase === "night1") return this.zone.id !== "mycell";
    return !!this.zone.restricted;
  }
  lightAt() {
    const z = this.zone;
    const night = this.night;
    let v = night ? z.light.night : z.light.day;
    if (z.id === "yard" && night) v = this.flags.has("floods") ? 0.42 : 1.0;
    if (z.id === "maint" && this.flags.has("power")) v = Math.max(v, 0.75);
    return v;
  }
  computeVis() {
    const p = this.player;
    if (p.hidden) return 0;
    let v = this.lightAt();
    if (this.flashlight) v = Math.min(1.25, v + 0.55);
    if (this.lights.some((l) => l.hit)) v = 1.6;
    v *= p.crouch ? 0.55 : 1;
    v *= p.moving === 3 ? 1.3 : p.moving ? 1 : 0.8;
    return v;
  }
  noise(x, z, r, kind) {
    if (r <= 0) return;
    const tres = this.trespassing() || kind === "loud";
    for (const g of this.guards) {
      if (!g.active || g.state === "chase") continue;
      const d = Math.hypot(g.x - x, g.z - z);
      if (d > r) continue;
      const clear = this.los(g.x, 1.6, g.z, x, 1.0, z);
      if (!clear && d > r * 0.5) continue;
      if (!tres) continue;
      if (kind === "steps" && g.state === "investigate") {
        g.target = [x, z];
        g.path = null;
        continue;
      }
      this.investigate(g, x, z, kind === "loud");
      this.bark(g, "investigate");
    }
  }
  investigate(g, x, z, run = false) {
    g.state = "investigate";
    g.target = [x, z];
    g.path = null;
    g.lookT = 0;
    g.run = run;
    g.pause = 0;
  }
  bark(g, kind, force = false) {
    if (!force && g.barkT > 0) return;
    g.barkT = 5;
    const d = Math.hypot(g.x - this.player.x, g.z - this.player.z);
    if (d > 22) return;
    this.emit("bark", { who: g.name, text: pickLine(BARKS[kind], () => this.rand()), kind, dist: d });
  }
  alarm(x, z, by, n = 2) {
    const cand = this.guards.filter((g) => g.active && g.state !== "chase").map((g) => ({ g, d: Math.hypot(g.x - x, g.z - z) })).filter((o) => o.d < 45).sort((a, b) => a.d - b.d).slice(0, n);
    for (const { g } of cand) {
      this.investigate(g, x, z, true);
      g.aware = Math.max(g.aware, 0.6);
    }
    this.emit("alarm", { by, msg: by === "camera" ? "A camera spotted you — guards are on the way!" : "Searchlight! The yard guards are coming!" });
  }

  updateGuards(dt) {
    if (this.ghost) return; // headless tests: logic-only playthroughs
    const p = this.player;
    const tres = this.trespassing();
    const headY = this.headY();
    let active = 0;
    for (const g of this.guards) {
      if (!g.active) continue;
      active++;
      g.barkT -= dt;
      // ---- perception (sight checks are throttled)
      const dx = p.x - g.x;
      const dz = p.z - g.z;
      const d = Math.hypot(dx, dz);
      g.losT -= dt;
      if (g.losT <= 0) {
        g.losT = 0.08 + this.rand() * 0.04;
        let seen = false;
        if (!p.hidden && d < 24) {
          const ang = Math.abs(angDiff(yawTo(g.x, g.z, p.x, p.z), g.yaw));
          let vis = this.vis;
          if (this.night && ang < 0.32 && d < 12) vis = Math.max(vis, 0.85 * (p.crouch ? 0.55 : 1)); // flashlight beam
          const range = 15 * Math.max(vis, 0.12);
          g.vis = vis;
          g.range = range;
          if (d < range && (ang < 0.96 || d < 1.6)) seen = this.los(g.x, 1.65, g.z, p.x, headY, p.z);
        }
        g.seen = seen;
      }
      if (g.seen) {
        const vis = g.vis ?? this.vis;
        if (tres) {
          const k = 1 - d / Math.max(g.range || 1, 0.01);
          let gain = vis * (0.25 + 1.35 * k * k) + (d < 2.5 ? 1.4 : 0);
          if (g.state === "chase" || g.state === "investigate") gain *= 1.8;
          g.aware = Math.min(1, g.aware + gain * dt);
          g.lastSeen = [p.x, p.z];
        } else if (!this.night && p.sprinting && d < 10) {
          if (g.aware < 0.5) g.aware = Math.min(0.5, g.aware + 0.9 * dt);
          this.bark(g, "run");
        } else g.aware = Math.max(0, g.aware - 0.3 * dt);
      } else if (g.state !== "chase") g.aware = Math.max(0, g.aware - 0.2 * dt);

      // bumping straight into a guard where you shouldn't be
      if (tres && !p.hidden && d < 0.95) return this.caughtBy(g);

      // ---- state machine
      switch (g.state) {
        case "patrol":
        case "return":
          if (g.aware > 0.35) {
            g.state = "suspicious";
            g.lookT = 0;
            g.path = null;
            this.bark(g, "suspicious");
            if (tres) this.emit("spotted", { who: g.name, level: 1 });
          }
          break;
        case "suspicious":
          if (g.aware >= 1) this.startChase(g);
          else if (!g.seen) {
            g.lookT += dt;
            if (g.lookT > 1.6) {
              if (g.lastSeen && g.aware > 0.15 && tres) this.investigate(g, g.lastSeen[0], g.lastSeen[1]);
              else if (g.aware < 0.12) this.toReturn(g);
            }
          } else g.lookT = 0;
          if (!tres && g.aware < 0.08) this.toReturn(g, true);
          break;
        case "investigate":
          if (g.aware >= 1) this.startChase(g);
          break;
        case "chase":
          if (g.seen) {
            g.lostT = 0;
            g.target = [p.x, p.z];
            if (d < 1.15) return this.caughtBy(g);
          } else {
            g.lostT += dt;
            if (g.hideTarget) {
              const h = HIDES.find((x) => x.id === g.hideTarget);
              g.target = [h.x + FACING[h.f][0] * 0.8, h.z + FACING[h.f][1] * 0.8];
              if (Math.hypot(g.x - g.target[0], g.z - g.target[1]) < 0.9 && p.hidden === g.hideTarget) return this.caughtBy(g, "hide");
              if (p.hidden !== g.hideTarget) g.hideTarget = null;
            } else if (g.lostT > 3.2) {
              const ls = g.lastSeen || [g.x, g.z];
              this.investigate(g, ls[0], ls[1]);
              g.aware = 0.6;
              this.bark(g, "lost", true);
              this.emit("lost", { who: g.name });
            }
          }
          if (!tres && !g.hideTarget) {
            g.aware = 0.3;
            this.toReturn(g);
          }
          break;
        default:
      }
      this.moveGuard(g, dt);
    }
    this.stats.maxGuards = Math.max(this.stats.maxGuards, active);
  }
  startChase(g) {
    if (g.state === "chase") return;
    g.state = "chase";
    g.aware = 1;
    g.path = null;
    g.repath = 0;
    g.lostT = 0;
    g.target = [this.player.x, this.player.z];
    this.bark(g, "chase", true);
    this.emit("alert", { who: g.name });
    // radio the nearest colleague
    const other = this.guards.filter((o) => o !== g && o.active && o.state !== "chase").map((o) => ({ o, d: Math.hypot(o.x - g.x, o.z - g.z) })).sort((a, b) => a.d - b.d)[0];
    if (other && other.d < 22) this.investigate(other.o, this.player.x, this.player.z, true);
  }
  toReturn(g, quiet = false) {
    g.state = "return";
    g.path = null;
    g.target = null;
    g.run = false;
    g.hideTarget = null;
    g.retWp = null;
    if (!quiet) this.bark(g, "return");
  }
  moveGuard(g, dt) {
    const route = g.def.routes[this._phase];
    let speed = 0;
    let goal = null;
    const pass = (i) => this.doorPass(i);
    if (g.state === "patrol") {
      if (g.pause > 0) {
        g.pause -= dt;
        g.lookT += dt;
        const wp = route[g.wp];
        const base = wp[3] ?? g.base;
        g.yaw = lerpAngle(g.yaw, base + Math.sin(g.lookT * 1.1) * 1.05, 1 - Math.exp(-dt * 4));
        g.speed = 0;
        if (g.pause <= 0) {
          g.wp = (g.wp + 1) % route.length;
          g.path = null;
        }
        return;
      }
      goal = route[g.wp];
      speed = 1.45;
    } else if (g.state === "return") {
      // head back to the nearest waypoint, then resume the loop from there
      if (g.retWp == null) {
        let best = 0;
        let bd = 1e9;
        route.forEach((w, i) => {
          const d = Math.hypot(w[0] - g.x, w[1] - g.z);
          if (d < bd) {
            bd = d;
            best = i;
          }
        });
        g.retWp = best;
      }
      goal = route[g.retWp];
      speed = 1.7;
    } else if (g.state === "investigate") {
      goal = g.target;
      speed = g.run ? 3.6 : 2.1;
    } else if (g.state === "chase") {
      goal = g.target;
      speed = 4.3;
    } else if (g.state === "suspicious") {
      const t = g.lastSeen || [this.player.x, this.player.z];
      g.yaw = lerpAngle(g.yaw, yawTo(g.x, g.z, t[0], t[1]), 1 - Math.exp(-dt * 5));
      g.speed = 0;
      return;
    }
    if (!goal) return;
    // (re)plan
    g.repath -= dt;
    const far = Math.hypot(goal[0] - g.x, goal[1] - g.z);
    if (!g.path || (g.state === "chase" && g.repath <= 0)) {
      g.repath = 0.45;
      g.path = this.nav.path(g.x, g.z, goal[0], goal[1], pass);
      g.pi = 0;
      if (!g.path) {
        if (g.state === "investigate" || g.state === "chase") return this.toReturn(g);
        // patrol leg blocked (locked door): skip to the next waypoint
        if (g.state === "patrol") {
          g.wp = (g.wp + 1) % route.length;
          g.pause = 1;
          return;
        }
        this.resetGuard(g);
        return;
      }
    }
    if (far < 0.35 || g.pi >= g.path.length) {
      this.arrive(g, route);
      return;
    }
    const [tx, tz] = g.path[g.pi];
    const dx = tx - g.x;
    const dz = tz - g.z;
    const d = Math.hypot(dx, dz);
    if (d < 0.2) {
      g.pi++;
      return;
    }
    // open unlocked doors in the way
    for (const door of this.doors) {
      if (!door.want && !door.locked && !door.def.crawl && Math.hypot(door.def.x - g.x, door.def.z - g.z) < 1.5) {
        door.want = true;
        this.emit("door", { id: door.id, kind: door.def.kind, open: true, x: door.def.x, z: door.def.z, by: "guard" });
      }
    }
    const blocked = this.doors.some((door) => this.doorSolid(door) && !door.locked && Math.hypot(door.def.x - g.x, door.def.z - g.z) < 0.9);
    const step = Math.min(d, speed * dt * (blocked ? 0.15 : 1));
    g.x += (dx / d) * step;
    g.z += (dz / d) * step;
    g.speed = step / Math.max(dt, 1e-6);
    g.phase += step * 2.4;
    g.yaw = lerpAngle(g.yaw, yawTo(0, 0, dx, dz), 1 - Math.exp(-dt * 7));
  }
  arrive(g, route) {
    g.path = null;
    g.speed = 0;
    if (g.state === "patrol") {
      const wp = route[g.wp];
      g.pause = wp[2] || 0.01;
      g.base = wp[3] ?? g.yaw;
      g.lookT = 0;
    } else if (g.state === "return") {
      g.state = "patrol";
      g.wp = g.retWp;
      g.retWp = null;
      g.pause = 0.5;
      g.base = g.yaw;
    } else if (g.state === "investigate") {
      g.state = "searching";
      g.lookT = 0;
      g.base = g.yaw;
    }
  }

  updateSearching(dt) {
    for (const g of this.guards) {
      if (!g.active || g.state !== "searching") continue;
      g.lookT += dt;
      g.yaw = lerpAngle(g.yaw, g.base + Math.sin(g.lookT * 1.6) * 1.4, 1 - Math.exp(-dt * 4));
      if (g.aware >= 1) this.startChase(g);
      else if (g.lookT > 4.5) this.toReturn(g);
    }
  }

  updateSecurity(dt) {
    if (this.ghost) return;
    const p = this.player;
    const tres = this.trespassing();
    const headY = this.headY();
    for (const c of this.cams) {
      if (!c.active) continue;
      c.yaw = c.base + Math.sin((this.clock / c.period) * TAU) * c.sweep;
      c.cool -= dt;
      let seen = false;
      if (!p.hidden && tres) {
        const d = Math.hypot(p.x - c.x, p.z - c.z);
        const range = c.range * Math.max(this.vis, 0.1);
        if (d < range && Math.abs(angDiff(yawTo(c.x, c.z, p.x, p.z), c.yaw)) < c.fov) {
          seen = this.los(c.x, c.y - 0.2, c.z, p.x, headY, p.z);
          if (seen) {
            const k = 1 - d / range;
            c.aware = Math.min(1, c.aware + this.vis * (0.5 + 1.2 * k * k) * dt);
          }
        }
      }
      c.seen = seen;
      if (!seen) c.aware = Math.max(0, c.aware - 0.12 * dt);
      if (c.aware >= 1 && c.cool <= 0) {
        c.cool = 8;
        c.aware = 0.35;
        this.alarm(p.x, p.z, "camera");
      }
    }
    for (const l of this.lights) {
      if (!l.on) {
        l.hit = false;
        continue;
      }
      [l.cx, l.cz] = l.path(this.clock);
      l.cool -= dt;
      const d = Math.hypot(p.x - l.cx, p.z - l.cz);
      l.hit = !p.hidden && this.zone.outdoor && d < l.r && this.los(l.x, l.y, l.z, p.x, headY, p.z);
      if (l.hit) l.aware = Math.min(1, l.aware + (p.crouch ? 1.6 : 2.2) * dt);
      else l.aware = Math.max(0, l.aware - 0.45 * dt);
      if (l.aware >= 1 && l.cool <= 0) {
        l.cool = 7;
        l.aware = 0.4;
        this.alarm(p.x, p.z, "searchlight", 2);
      }
    }
  }

  caughtBy(g, how = "") {
    if (this.capture) return;
    const p = this.player;
    this.capture = { t: 0, by: g.name, how, line: how === "hide" ? "Nice try. Out you come." : pickLine(["Gotcha. Back to your cell.", "That's far enough, inmate.", "Hands where I can see them!"], () => this.rand()) };
    p.vx = p.vz = 0;
    this.channel = null;
    g.yaw = yawTo(g.x, g.z, p.x, p.z);
    g.speed = 0;
    this.emit("caught", { who: g.name, line: this.capture.line });
  }
  respawn() {
    const p = this.player;
    this.capture = null;
    this.timesCaught++;
    let msg = "You were dragged back to your cell.";
    if (this.has("ration") && !this.flags.has("deliver")) {
      this.take("ration");
      this.got.delete("ration");
      this.flags.delete("ration");
      msg += " They confiscated the ration bar.";
    }
    Object.assign(p, { x: this.checkpoint.x, z: this.checkpoint.z, yaw: this.checkpoint.yaw, pitch: 0, vx: 0, vz: 0, hidden: null, crouch: false, cb: 0, stamina: 100, exhausted: false });
    for (const g of this.guards) if (g.active) this.resetGuard(g);
    for (const c of this.cams) c.aware = 0;
    for (const l of this.lights) l.aware = 0;
    const mine = this.doorById[`cell${PLAYER_CELL}`];
    if (this.night) {
      mine.want = false;
      mine.open = 0;
    }
    this.emit("respawn", { msg, caught: this.timesCaught });
    this.dirty = true;
  }

  /* ------------------------------------------------------------ hiding */
  hide(h) {
    const p = this.player;
    if (p.hidden) return;
    p.hidden = h.id;
    p.hideFrom = { x: p.x, z: p.z };
    p.x = h.x;
    p.z = h.z;
    p.vx = p.vz = 0;
    p.yaw = yawTo(0, 0, FACING[h.f][0], FACING[h.f][1]);
    p.crouch = h.kind !== "locker";
    // a chasing guard who sees you climb in knows exactly where you are
    for (const g of this.guards) if (g.active && g.state === "chase" && g.seen) g.hideTarget = h.id;
    this.emit("hide", { kind: h.kind, on: true });
  }
  unhide() {
    const p = this.player;
    if (!p.hidden) return;
    const h = HIDES.find((x) => x.id === p.hidden);
    const [fx, fz] = FACING[h.f];
    let pos = null;
    for (const dist of [0.85, 1.05, 0.7]) {
      const x = h.x + fx * dist;
      const z = h.z + fz * dist;
      if (!this.overlapsAny(x, z, PLAYER.r, h.kind === "locker" ? STAND_HEIGHT : CROUCH_HEIGHT)) {
        pos = [x, z];
        break;
      }
    }
    if (!pos) pos = p.hideFrom ? [p.hideFrom.x, p.hideFrom.z] : [h.x + fx, h.z + fz];
    p.hidden = null;
    [p.x, p.z] = pos;
    this.emit("hide", { kind: h.kind, on: false });
  }

  /* ------------------------------------------------------------ interaction */
  interactables() {
    if (!this._staticIts) this._staticIts = this.buildStaticIts();
    const list = this._staticIts.slice();
    for (const n of this.inmates) list.push({ key: n.id, kind: "inmate", x: n.x, y: n.pose === "sit" ? 1.05 : 1.45, z: n.z, r: 0.42, label: n.name, owner: null, npc: n });
    for (const g of this.guards) if (g.active) list.push({ key: g.id, kind: "guard", x: g.x, y: 1.45, z: g.z, r: 0.42, label: g.name, owner: null, guard: g });
    return list;
  }
  buildStaticIts() {
    const list = [];
    for (const s of SPOTS) list.push({ key: s.id, kind: "spot", x: s.x, y: s.y, z: s.z, r: s.r, label: s.label, owner: s.owner || null, spot: s });
    for (const d of this.doors) {
      const D = d.def;
      if (D.id.startsWith("cell") && D.id !== `cell${PLAYER_CELL}`) continue;
      const y = D.kind === "vent" ? 0.45 : D.kind === "fencepanel" ? 0.6 : 1.25;
      const r = D.kind === "vent" ? 0.45 : D.w > 2 ? 1.0 : 0.62;
      let x = D.x;
      let z = D.z;
      // readers/keypads sit beside the frame
      if (D.lock === "keypad") z = D.z + 1.05;
      if (D.id === "exitA") x = 39.4;
      list.push({ key: D.id, kind: "door", x, y, z, r, label: D.label, owner: D.id, door: d });
    }
    for (const h of HIDES) {
      const [fx, fz] = FACING[h.f];
      const y = h.kind === "locker" ? 1.2 : 0.75;
      const off = h.kind === "locker" ? 0.22 : h.kind === "cart" ? 0.1 : 0.35;
      list.push({ key: h.id, kind: "hide", x: h.x + fx * off, y, z: h.z + fz * off, r: h.kind === "locker" ? 0.4 : 0.55, label: h.kind === "locker" ? "Locker" : h.kind === "cart" ? "Laundry cart" : "Dumpster", owner: h.id, hide: h });
    }
    return list;
  }
  /** Interactable under the crosshair (eye + unit dir), or null. */
  pick(eye, dir) {
    if (this.player.hidden) {
      const h = HIDES.find((x) => x.id === this.player.hidden);
      return { key: h.id, kind: "hide", hide: h, label: "Hiding", x: h.x, y: 1, z: h.z, r: 0.5 };
    }
    let best = null;
    let bt = 1e9;
    for (const it of this.interactables()) {
      const ox = it.x - eye.x;
      const oy = it.y - eye.y;
      const oz = it.z - eye.z;
      const reach = it.kind === "inmate" || it.kind === "guard" ? 3.2 : 2.5;
      const t = ox * dir.x + oy * dir.y + oz * dir.z;
      if (t < 0 || t > reach + it.r) continue;
      const d2 = ox * ox + oy * oy + oz * oz - t * t;
      if (d2 > it.r * it.r) continue;
      const th = t - Math.sqrt(it.r * it.r - d2);
      if (th > reach || th >= bt) continue;
      const k = Math.max(0, th - 0.06);
      if (!this.los(eye.x, eye.y, eye.z, eye.x + dir.x * k, eye.y + dir.y * k, eye.z + dir.z * k, it.owner)) continue;
      best = it;
      bt = th;
    }
    return best;
  }

  /** Prompt for the HUD: {verb, text, ok, hold}. */
  describe(it) {
    if (!it) return null;
    const F = this.flags;
    const has = (i) => this.has(i);
    const P = (verb, ok = true, sub = "", hold = 0) => ({ verb, text: it.label, ok, sub, hold });
    switch (it.kind) {
      case "hide":
        return this.player.hidden ? { verb: "Leave", text: "hiding spot", ok: true, sub: "Guards can't see you in here" } : P("Hide in", true, "Hidden from view");
      case "inmate":
        return P("Talk to");
      case "guard":
        return P("Talk to", true, it.guard.state === "chase" ? "He's after you — run!" : "");
      case "door":
        return this.describeDoor(it.door);
      default:
    }
    const s = it.spot;
    switch (s.id) {
      case "poster":
        return P(this.got.has("note") ? "Inspect" : "Inspect", true);
      case "sink":
        return P(this.got.has("cellkey") ? "Inspect" : this.got.has("note") ? "Search under" : "Inspect");
      case "rationshelf":
        return P(this.got.has("ration") || F.has("deliver") ? "Inspect" : F.has("ray") ? "Take ration bar from" : "Inspect", true, F.has("ray") && !this.got.has("ration") ? "Restricted — don't get seen" : "");
      case "storagedesk":
      case "toolshelf":
      case "passlocker":
      case "gsdesk":
        return P("Search");
      case "fusebox":
        if (F.has("fuse")) return P("Inspect", true, "Fuse bridged");
        if (has("wire") && this._phase === "night2") return P("Use Copper wire on", true, "Bridge the burnt fuse", 1.6);
        return P("Inspect", true, has("wire") ? "" : "Needs copper wire");
      case "floodbox":
        if (F.has("floods")) return P("Inspect", true, "Floodlights off");
        if (F.has("floodpanel")) return P("Pull switch —", true, "Cut the yard floodlights");
        return has("screwdriver") ? P("Use Screwdriver on", true, "Unscrew the panel", 1.6) : P("Inspect", false, "Screwed shut — needs a screwdriver");
      case "release":
        return P(F.has("yarddoor") ? "Inspect" : "Press", true, F.has("yarddoor") ? "Yard door released" : "Opens the yard door");
      case "cctv":
        return P("Watch");
      case "logbook":
      case "monitors":
      case "rulebook":
        return P("Read");
      default:
    }
    if (s.breaker) {
      const up = this.puzzle.seq.includes(s.breaker) || F.has("power");
      return P(up ? "Inspect" : "Flip", true, up ? "ON" : "OFF");
    }
    if (s.id.startsWith("dryer")) return P("Search");
    return P("Inspect");
  }
  describeDoor(d) {
    const D = d.def;
    const has = (i) => this.has(i);
    const out = (verb, ok, sub = "", hold = 0) => ({ verb, text: D.label, ok, sub, hold });
    if (!d.locked) {
      if (D.kind === "vent" || D.kind === "fencepanel") return out("Crawl through", true, this.player.crouch ? "" : "Crouch (C) to fit");
      if (D.kind === "shutter" || D.id === "exitA" || D.id === "yard") return out("", true, "Open");
      return out(d.want ? "Close" : "Open", true);
    }
    switch (d.lock) {
      case "never":
        return out("", false, "Locked");
      case "cellkey":
        if (has("cellkey")) return out("Use Cell key on", true, "", D.id === "block" ? 1.4 : 0.6);
        return out("", false, this._phase === "night1" ? "Locked for the night" : "Locked — jammed shut");
      case "rollcall":
        return out("", false, this._phase === "night1" ? "Locked for the night" : "Opens after roll call");
      case "inside":
        return this.player.z < D.z ? out("Unlock", true, "From the inside") : out("", false, "Locked — opens from the inside");
      case "keycard":
        return has("keycard") ? out("Swipe Keycard at", true, this._phase === "night2" ? "" : "Staffed during the day") : out("", false, "Keycard required");
      case "release":
        return out("", false, "Released from the checkpoint desk");
      case "screwdriver":
        return has("screwdriver") ? out("Use Screwdriver on", true, "Unscrew the cover", 2.0) : out("", false, "Screwed shut");
      case "keypad":
        return out("Use keypad —", true, has("accessnote") ? "Your access note has the sequence" : "Glyph sequence required");
      case "power":
        return out("", false, this.flags.has("fuse") ? "No power — breakers are off" : "No power");
      case "pass":
        return has("pass") ? out("Swipe Maintenance pass at", true) : out("", false, "Scanner: maintenance pass required");
      case "unbolt":
        if (!has("screwdriver")) return out("", false, "Bolted — needs a screwdriver");
        if (!this.flags.has("floods")) return out("", false, "Under the floodlight — cut the floods first");
        return out("Use Screwdriver on", true, "Unbolt the panel (noisy)", 3.0);
      default:
        return out("", false, "Locked");
    }
  }

  /**
   * Press E on a target. Returns {panel} when the UI should open something
   * (note, dialogue, keypad, cctv); hold interactions start a channel.
   */
  interact(it) {
    if (!it || this.capture || this.transition || this.ended) return null;
    const desc = this.describe(it);
    if (desc?.hold && desc.ok) {
      this.channel = { key: it.key, t: 0, dur: desc.hold, label: desc.verb + " " + desc.text, noiseT: 0 };
      this.emit("channel", { on: true, key: it.key });
      return null;
    }
    return this.activate(it);
  }
  /** Progress a hold interaction; `holding` = E still down on the same target. */
  updateChannel(dt, holding) {
    const ch = this.channel;
    if (!ch) return;
    if (!holding || !this.target || this.target.key !== ch.key) {
      this.channel = null;
      this.emit("channel", { on: false, cancel: true });
      return;
    }
    ch.t += dt;
    ch.noiseT -= dt;
    if (ch.noiseT <= 0) {
      ch.noiseT = 0.9;
      const loud = ch.key === "fence" ? 6.5 : ch.key === "block" ? 4 : 3;
      this.noise(this.player.x, this.player.z, loud, "work");
      this.emit("work", { key: ch.key });
    }
    if (ch.t >= ch.dur) {
      this.channel = null;
      this.emit("channel", { on: false });
      this.activate(this.target, true);
    }
  }

  activate(it, held = false) {
    const F = this.flags;
    const info = (msg) => this.emit("info", { msg });
    const deny = (msg) => this.emit("deny", { msg });
    switch (it.kind) {
      case "hide":
        if (this.player.hidden) this.unhide();
        else this.hide(it.hide);
        return null;
      case "inmate":
        return { panel: this.talk(it.npc) };
      case "guard": {
        const g = it.guard;
        if (g.state === "chase") return null;
        this.bark(g, "talk", true);
        return null;
      }
      case "door":
        return this.useDoor(it.door, held);
      default:
    }
    const s = it.spot;
    if (s.breaker) return this.flipBreaker(s.breaker);
    if (s.id.startsWith("dryer")) {
      if (s.id === "dryer3") {
        if (!this.got.has("screwdriver")) {
          this.give("screwdriver", "Behind the lint filter of the 'broken' dryer: a screwdriver!");
          this.flag("screwdriver");
        } else info("The lint filter hides nothing else.");
      } else info(pickLine(["Warm towels. Nothing useful.", "Someone's socks. Nothing here.", "Damp uniforms. Nothing hidden."], () => this.rand()));
      return null;
    }
    switch (s.id) {
      case "poster":
        if (!this.got.has("note")) {
          this.give("note", "Behind the poster, a loose brick — and a folded note!");
          this.flag("note");
          return { panel: { type: "note", id: "note" } };
        }
        info("The loose brick behind the poster. The hiding place is empty now.");
        return null;
      case "sink":
        if (this.got.has("cellkey")) info("Just the sink. The tape that held the key is still stuck underneath.");
        else if (this.got.has("note")) {
          this.give("cellkey", "Taped under the sink: the spare key!");
          this.flag("key");
        } else info("A cold steel sink. The drain gurgles.");
        return null;
      case "bunk":
        info("Your bunk. A thin mattress, a scratchy blanket. Nothing hidden in it.");
        return null;
      case "toilet":
        info("Stainless steel. Let's not.");
        return null;
      case "rulebook":
        return { panel: { type: "note", id: "rulebook" } };
      case "rationshelf":
        if (this.got.has("ration") || F.has("deliver")) info("Rows of counted ration bars. You've taken enough.");
        else if (!F.has("ray")) info("Ration bars, every one of them counted. Not worth the risk without a reason.");
        else {
          this.give("ration", "You pocket a ration bar. Now get out unseen.");
          this.flag("ration");
          this.noise(this.player.x, this.player.z, 2.2, "work");
        }
        return null;
      case "storagedesk":
        if (!this.got.has("accessnote")) {
          this.give("accessnote", "A clipboard: the new maintenance door sequence!");
          this.flag("accessnote");
          return { panel: { type: "note", id: "accessnote" } };
        }
        info("Inventory forms and an empty coffee cup.");
        return null;
      case "toolshelf":
        if (!this.got.has("wire")) this.give("wire", "In a toolbox: a coil of copper wire.");
        else info("Rusty spanners and some tape. Nothing else you need.");
        return null;
      case "gsdesk":
        if (!this.got.has("keycard")) {
          this.give("keycard", "Hale's keycard — got it!");
          this.flag("keycard");
          this.noise(this.player.x, this.player.z, 1.5, "work");
        } else info("Paperwork and a cold coffee.");
        return null;
      case "monitors":
        info("Feeds from the block and corridors. A roster is taped on: 'HALE — rounds: station → restricted corridor and back.'");
        return null;
      case "passlocker":
        if (!this.got.has("pass")) this.give("pass", "An unlocked locker — a maintenance pass on a lanyard!");
        else info("Overalls and a hard hat.");
        return null;
      case "cctv":
        return { panel: { type: "cctv" } };
      case "logbook":
        F.add("logbook");
        return { panel: { type: "note", id: "logbook" } };
      case "release":
        if (F.has("yarddoor")) info("The yard door is already released.");
        else {
          const d = this.doorById.yard;
          d.locked = false;
          d.want = true;
          this.flag("yarddoor");
          this.emit("door", { id: "yard", kind: "gate", open: true, x: d.def.x, z: d.def.z });
          this.emit("info", { msg: "A buzzer sounds — the yard door slides open." });
          this.noise(16, -8, 7, "loud");
        }
        return null;
      case "fusebox":
        if (F.has("fuse")) info("Fuse F2 is bridged with your wire. It hums.");
        else if (this._phase !== "night2") info(this.has("wire") ? "Fuse F2 is burnt out. Messing with the power in daylight? Wait for your escape night." : "Fuse F2 on the tunnel circuit is burnt out. Something conductive could bridge it.");
        else if (!this.has("wire")) deny("Fuse F2 is burnt out. You need copper wire to bridge it.");
        else if (held) {
          this.take("wire");
          this.flag("fuse");
          this.emit("spark", { x: 44.7, z: -9.5, small: true });
          info("You bridge fuse F2 with the copper wire. Now restart the breakers.");
        }
        return null;
      case "floodbox":
        if (F.has("floods")) info("The floodlights are dead.");
        else if (!F.has("floodpanel")) {
          if (!this.has("screwdriver")) deny("The panel is screwed shut. You need a screwdriver.");
          else if (held) {
            F.add("floodpanel");
            this.dirty = true;
            info("Panel off. A big red switch: FLOODLIGHTS.");
          }
        } else {
          this.flag("floods");
          this.emit("floods", { on: false });
          info("Clunk. The yard floodlights die. Only the searchlights remain.");
        }
        return null;
      default:
        info("Nothing interesting.");
        return null;
    }
  }

  useDoor(d, held) {
    const D = d.def;
    const info = (msg) => this.emit("info", { msg });
    const deny = (msg) => this.emit("deny", { msg });
    const open = (flag) => {
      d.locked = false;
      d.want = true;
      if (flag) this.flag(flag);
      this.emit("door", { id: D.id, kind: D.kind, open: true, x: D.x, z: D.z });
    };
    if (!d.locked) {
      if (D.kind === "vent" || D.kind === "fencepanel") {
        info(this.player.crouch ? "Crawl through — keep low." : "Crouch (C) to crawl through.");
        return null;
      }
      if (D.kind === "shutter" || D.id === "exitA" || D.id === "yard") return null;
      if (d.want && this.inDoorway(d)) return null; // don't shut it on yourself
      d.want = !d.want;
      this.emit("door", { id: D.id, kind: D.kind, open: d.want, x: D.x, z: D.z });
      this.dirty = true;
      return null;
    }
    switch (d.lock) {
      case "never":
        deny(this._phase === "day" ? "Not your cell." : "Locked for the night.");
        return null;
      case "cellkey":
        if (!this.has("cellkey")) {
          deny(this._phase === "night1" ? "Locked for the night." : "Your door's jammed — it didn't open with the others. The note mentioned a spare key…");
          return null;
        }
        if (D.id === "block") {
          if (!held) return null;
          open("blockgate");
          info("The spare key turns. The block gate slides open.");
        } else {
          open("unlock");
          info("The spare key turns stiffly. Your cell door slides open.");
        }
        return null;
      case "rollcall":
        deny(this._phase === "night1" ? "Locked for the night." : "The block gate opens after morning roll call — stand on the yellow line.");
        return null;
      case "inside":
        if (this.player.z < D.z) {
          open("storagedoor");
          info("You unlock the storage door from the inside. A shortcut back.");
        } else deny("Locked. No keyhole on this side — it only opens from inside.");
        return null;
      case "keycard":
        if (!this.has("keycard")) deny("Keycard reader: ACCESS DENIED.");
        else if (this._phase !== "night2") deny("The checkpoint is staffed all day. Not now — wait for your escape night.");
        else {
          open("checkpoint");
          info("Beep. The checkpoint door slides open.");
        }
        return null;
      case "release":
        deny("The yard door is opened remotely — from the checkpoint desk.");
        return null;
      case "screwdriver":
        if (!this.has("screwdriver")) deny("The vent cover is screwed shut. You'd need a screwdriver.");
        else if (held) {
          open("vent");
          info("The vent cover comes off. Crouch (C) to crawl through.");
        }
        return null;
      case "keypad":
        this.puzzle.keypad = [];
        return { panel: { type: "keypad" } };
      case "power":
        deny(this.flags.has("fuse") ? "The shutter motor is dead. Restart the breakers." : "The shutter motor is dead. No power on the tunnel circuit.");
        return null;
      case "pass":
        if (!this.has("pass")) deny("Scanner: MAINTENANCE PASS REQUIRED.");
        else {
          open("gateA");
          info("Scanner: ACCESS GRANTED. The gate rattles open.");
        }
        return null;
      case "unbolt":
        if (!this.has("screwdriver")) deny("The panel is bolted to the posts.");
        else if (!this.flags.has("floods")) deny("The floodlight is right on this panel — you'd be spotted instantly. Cut the floodlights first.");
        else if (held) {
          open("fence");
          info("The last bolt gives. The lower panel swings free — crouch and crawl through.");
        }
        return null;
      default:
        deny("Locked.");
        return null;
    }
  }

  flipBreaker(b) {
    const F = this.flags;
    if (F.has("power")) {
      this.emit("info", { msg: "The board is live. The tunnel shutter is open." });
      return null;
    }
    if (this._phase !== "night2") {
      this.emit("info", { msg: "Messing with the power in broad daylight? Wait for your escape night." });
      return null;
    }
    if (!F.has("fuse")) {
      this.emit("deny", { msg: "Clunk… nothing. The tunnel circuit's fuse is burnt out." });
      this.emit("breaker", { b, up: false });
      return null;
    }
    const seq = this.puzzle.seq;
    if (seq.includes(b)) return null;
    if (BREAKER_ORDER[seq.length] === b) {
      seq.push(b);
      this.emit("breaker", { b, up: true });
      this.dirty = true;
      if (seq.length === BREAKER_ORDER.length) {
        this.flag("power");
        const d = this.doorById.tunnel;
        d.locked = false;
        d.want = true;
        this.emit("power", {});
        this.emit("door", { id: "tunnel", kind: "shutter", open: true, x: d.def.x, z: d.def.z });
        this.emit("info", { msg: "The board hums to life. The service tunnel shutter rolls up!" });
      }
    } else {
      seq.length = 0;
      this.puzzle.breakerWrong++;
      this.hintNow = true;
      this.emit("spark", { x: 44.7, z: -6 });
      this.emit("deny", { msg: "BANG — the board trips and every breaker drops! Someone will have heard that…" });
      this.noise(44.5, -6, 16, "loud");
      this.dirty = true;
    }
    return null;
  }

  /** Keypad glyph press; returns 'ok' | 'wrong' | 'more'. */
  keypadPress(glyph) {
    if (!GLYPHS.includes(glyph) || !this.doorById.maint.locked) return "ok";
    const k = this.puzzle.keypad;
    k.push(glyph);
    if (k.length < 4) return "more";
    const ok = k.every((g, i) => g === NOTES.accessnote.glyphs[i]);
    this.puzzle.keypad = [];
    if (ok) {
      const d = this.doorById.maint;
      d.locked = false;
      d.want = true;
      this.emit("door", { id: "maint", kind: "slide", open: true, x: d.def.x, z: d.def.z });
      this.flag("keypad");
      return "ok";
    }
    this.puzzle.keypadWrong++;
    this.hintNow = true;
    this.noise(this.player.x, this.player.z, 3, "work");
    this.dirty = true;
    return "wrong";
  }

  /** Called by the CCTV panel once the player has watched for a moment. */
  watchCctv() {
    this.intel = true;
    this.flag("cctv");
    this.dirty = true;
  }

  /* ------------------------------------------------------------ dialogue */
  talk(n) {
    n.faceT = 3;
    n.faceYaw = yawTo(n.x, n.z, this.player.x, this.player.z);
    if (n.def.helper) return this.talkRay();
    const night = this.night;
    const line = night ? "Shh! Lights out, man. You'll get us both in the hole." : n.def.lines[n.line++ % n.def.lines.length];
    return { type: "dialogue", npc: n.id, speaker: n.name, lines: [line], choices: [] };
  }
  talkRay() {
    const F = this.flags;
    const D = (lines, choices = []) => ({ type: "dialogue", npc: "ray", speaker: "Ray", lines, choices });
    if (this.night) return D(this.mission >= 7 ? ["(whispering through the bars) Go, kid. Don't look back."] : ["(snoring)"]);
    if (this.mission < 2) return D(["Not now, new fish. Eat your breakfast."]);
    if (this.mission === 2) {
      if (!F.has("ray")) {
        this.flag("ray");
        return D([
          "So you're the one in M's old cell. M. left you a note, huh? Smart man. Didn't make it, though.",
          "You want out? Everybody does. I can help — but nothing's free in here.",
          "Brandt keeps the ration bars on the kitchen's back shelf. Bring me one. Go in at the west end of the counter, keep low, and move when he's down by the fridges with his back turned.",
        ]);
      }
      if (this.has("ration")) {
        this.take("ration");
        this.flag("deliver");
        this.give("flashlight", "Ray gave you a flashlight (press F).");
        return D([
          "Ha! Right under Brandt's nose. You've got guts, kid.",
          "Here — a flashlight. Press F. You'll need it where you're going.",
          "Next: the laundry. The THIRD DRYER from the left is 'broken'. It isn't. Check behind the lint filter.",
        ]);
      }
      return D(["The ration bar, kid. Kitchen, back shelf, west end. Crouch behind the counter and wait for Brandt to turn."]);
    }
    if (this.mission === 3) return D(["Laundry room. Third dryer from the left. Behind the lint filter."]);
    if (this.mission === 4) return D([
      "That screwdriver opens the vent cover low on the laundry's east wall. It leads to the storage room — crouch to crawl.",
      "Storage is pitch black; use the flashlight. Somewhere in there is the new sequence for the maintenance door keypad.",
      "The maintenance door is in the Restricted Corridor. There's a camera and Hale walks it. Be patient.",
    ]);
    if (this.mission === 5) return D([
      "You got into maintenance? Respect.",
      "There's a CCTV desk in there. Watch how the guards move — learn the pattern.",
      "Then lift Hale's keycard off the guard station desk while he's doing his rounds.",
    ]);
    if (this.mission === 6) {
      const a = this.routeReady("A");
      const b = this.routeReady("B");
      const miss = (l) => l.map((i) => ITEMS[i].name).join(", ");
      return D(
        [
          "Tonight's the night, if you're ready. Two ways out.",
          "MAINTENANCE: bridge the burnt tunnel fuse with copper wire, restart the breakers, walk the dark tunnel and swipe a maintenance pass at the gate.",
          "COURTYARD: keycard through the checkpoint, release the yard door, kill the floodlights, unbolt the loose fence panel and crawl out the drain. Mind the searchlights.",
          "Which is it?",
        ],
        [
          { id: "A", label: "Maintenance Route", disabled: a.length > 0, sub: a.length ? `Missing: ${miss(a)}` : "Wire • Maintenance pass • Flashlight" },
          { id: "B", label: "Courtyard Route", disabled: b.length > 0, sub: b.length ? `Missing: ${miss(b)}` : "Keycard • Screwdriver" },
          { id: "wait", label: "Not yet", sub: "Keep preparing" },
        ],
      );
    }
    return D(["Go, kid."]);
  }
  choose(npc, id) {
    if (npc !== "ray" || this.mission !== 6) return null;
    if (id === "A" || id === "B") {
      if (this.routeReady(id).length) return null;
      this.route = id;
      const lines = id === "A"
        ? ["The maintenance way. Quiet and dark. Fuse first, then the breakers — the logbook has the order.", "Lights out is at 22:00. Your spare key opens the block gate. Good luck."]
        : ["The courtyard. Bold. Watch the searchlights and kill the floods before you touch that fence.", "Lights out is at 22:00. Your spare key opens the block gate. Good luck."];
      this.flag("route");
      return { type: "dialogue", npc: "ray", speaker: "Ray", lines, choices: [] };
    }
    return null;
  }

  /* ------------------------------------------------------------ main update */
  update(dt) {
    dt = Math.min(dt, 0.1);
    this.clock += dt;
    if (this.ended) return;
    if (this.transition) {
      const tr = this.transition;
      tr.t += dt;
      if (!tr.applied && tr.t >= tr.dur * 0.45) {
        tr.applied = true;
        if (tr.kind === "morning") {
          this.setPhase("day");
          this.emit("pa", { text: "Good morning, Block C. Cell doors opening. Roll call on the yellow line." });
          this.emit("info", { msg: "Your cell door didn't open with the others — it's jammed. The note mentioned a spare key…" });
        } else {
          this.setPhase("night2");
          const p = this.player;
          Object.assign(p, { x: CHECKPOINT.x, z: CHECKPOINT.z, yaw: CHECKPOINT.yaw, hidden: null, crouch: false, vx: 0, vz: 0 });
          this.emit("pa", { text: "22:00. Lights out, Block C. Anyone out of their cell will be detained." });
        }
        this.dirty = true;
      }
      if (tr.t >= tr.dur) this.transition = null;
      this.updateDoors(dt);
      return;
    }
    if (this.capture) {
      this.capture.t += dt;
      if (this.capture.t > 2.9) this.respawn();
      return;
    }
    this.time += dt;
    this.stepT += dt;
    const p = this.player;
    this.zone = zoneAt(p.x, p.z);
    this.vis = this.computeVis();
    this.updateDoors(dt);
    this.updateInmates(dt);
    this.updateGuards(dt);
    if (this.capture) return;
    this.updateSearching(dt);
    this.updateSecurity(dt);
    // triggers
    if (this.mission === 1 && this.flags.has("unlock") && !this.flags.has("rollcall") && p.x > ROLLCALL.x1 && p.x < ROLLCALL.x2 && p.z > ROLLCALL.z1 && p.z < ROLLCALL.z2) {
      this.flag("rollcall");
      const d = this.doorById.block;
      d.locked = false;
      d.want = true;
      this.emit("pa", { text: "Roll call complete. Breakfast is served — proceed to the cafeteria." });
      this.emit("door", { id: "block", kind: "gate", open: true, x: d.def.x, z: d.def.z });
    }
    if (this.mission === 1 && this.flags.has("rollcall") && this.zone.id === "cafeteria") this.flag("cafeteria");
    if (p.z < FREEDOM_Z && !this.ended) {
      this.flags.add("free");
      const route = p.x > 30 ? "A" : "B";
      this.ended = { route, routeName: ROUTES[route].name, time: this.time, caught: this.timesCaught };
      this.emit("escape", this.ended);
    }
    let alert = 0;
    let level = 0;
    for (const g of this.guards) {
      if (!g.active) continue;
      alert = Math.max(alert, g.aware);
      level = Math.max(level, g.state === "chase" ? 3 : g.state === "investigate" || g.state === "searching" ? 2 : g.state === "suspicious" ? 1 : 0);
    }
    for (const c of this.cams) if (c.active) alert = Math.max(alert, c.aware);
    for (const l of this.lights) if (l.on) alert = Math.max(alert, l.aware);
    this.alert = alert;
    this.alertLevel = level;
  }
  updateDoors(dt) {
    for (const d of this.doors) {
      const goal = d.want ? 1 : 0;
      if (d.open === goal) continue;
      const rate = d.def.kind === "door" ? 2.2 : d.def.kind === "shutter" ? 0.6 : d.def.kind === "vent" || d.def.kind === "fencepanel" ? 3 : 1.25;
      if (goal < d.open && this.inDoorway(d)) continue; // don't close on the player
      d.open = goal > d.open ? Math.min(1, d.open + rate * dt) : Math.max(0, d.open - rate * dt);
    }
  }
  updateInmates(dt) {
    for (const n of this.inmates) {
      if (n.faceT > 0) {
        n.faceT -= dt;
        n.yaw = lerpAngle(n.yaw, n.faceYaw, 1 - Math.exp(-dt * 6));
        n.speed = 0;
        continue;
      }
      if (n.walk) {
        const [tx, tz] = n.walk[n.wi];
        const dx = tx - n.x;
        const dz = tz - n.z;
        const d = Math.hypot(dx, dz);
        if (d < 0.1) {
          n.wi = (n.wi + 1) % n.walk.length;
          continue;
        }
        // don't walk into the player
        const pd = Math.hypot(this.player.x - n.x, this.player.z - n.z);
        const step = pd < 0.9 ? 0 : Math.min(d, 1.05 * dt);
        n.x += (dx / d) * step;
        n.z += (dz / d) * step;
        n.speed = step / Math.max(dt, 1e-6);
        n.phase += step * 2.4;
        n.yaw = lerpAngle(n.yaw, yawTo(0, 0, dx, dz), 1 - Math.exp(-dt * 6));
      } else n.speed = 0;
    }
  }

  /* ------------------------------------------------------------ save */
  serialize() {
    const p = this.player;
    const doors = {};
    for (const d of this.doors) if (!d.id.startsWith("cell") || d.id === `cell${PLAYER_CELL}`) doors[d.id] = d.want;
    const safe = !p.hidden && !this.capture && !this.transition;
    return {
      v: SAVE_VERSION,
      mission: this.mission,
      flags: [...this.flags],
      inv: [...this.inv],
      got: [...this.got],
      sel: this.sel,
      route: this.route,
      doors,
      puzzle: { seq: [...this.puzzle.seq], keypadWrong: this.puzzle.keypadWrong, breakerWrong: this.puzzle.breakerWrong },
      timesCaught: this.timesCaught,
      time: Math.round(this.time * 10) / 10,
      intel: this.intel,
      flashlight: this.flashlight,
      player: safe ? { x: +p.x.toFixed(2), z: +p.z.toFixed(2), yaw: +p.yaw.toFixed(3), crouch: p.crouch } : null,
      checkpoint: this.checkpoint,
      savedAt: Date.now(),
    };
  }
  load(s) {
    this.mission = s.mission;
    this.flags = new Set(s.flags);
    this.inv = [...s.inv];
    this.got = new Set(s.got);
    this.sel = s.sel;
    this.route = s.route;
    this.timesCaught = s.timesCaught;
    this.time = s.time;
    this.intel = s.intel || this.flags.has("cctv");
    this.flashlight = s.flashlight && this.has("flashlight");
    this.puzzle.seq = this.flags.has("power") ? [...BREAKER_ORDER] : [...s.puzzle.seq];
    if (!this.flags.has("fuse")) this.puzzle.seq = [];
    this.puzzle.keypadWrong = s.puzzle.keypadWrong;
    this.puzzle.breakerWrong = s.puzzle.breakerWrong;
    // a step that belongs to a mission we haven't reached is fine; steps of the
    // current mission that are done may complete it (e.g. items found early)
    this.setPhase(this.phaseFor(this.mission), true);
    for (const d of this.doors) {
      if (d.id in s.doors && !d.locked) {
        d.want = s.doors[d.id];
        d.open = d.want ? 1 : 0;
      }
    }
    const p = this.player;
    const P = s.player;
    if (P && !this.overlapsAny(P.x, P.z, PLAYER.r, P.crouch ? CROUCH_HEIGHT : STAND_HEIGHT)) {
      Object.assign(p, { x: P.x, z: P.z, yaw: P.yaw, crouch: P.crouch, cb: P.crouch ? 1 : 0 });
    }
    this.zone = zoneAt(p.x, p.z);
    this.checkMission();
  }
}

function lerpAngle(a, b, t) {
  return a + angDiff(b, a) * t;
}
export { lerpAngle, angDiff };
