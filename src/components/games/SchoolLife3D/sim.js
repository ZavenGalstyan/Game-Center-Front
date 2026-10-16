/**
 * School Life Simulator 3D — the simulation (no Three.js, no React).
 *
 * Sim.step(input, dt) advances everything with delta time:
 *   - the player (acceleration, turning, collision vs AABB colliders, stairs
 *     as ramps, jumping, sitting) and in-world activities (basketball,
 *     penalties, track / PE checkpoint races) with simple ball physics
 *   - the school clock: blocks, bells, attendance, lesson triggers, end of day
 *   - teachers, students and staff: schedule-driven goals → A* routes over two
 *     nav grids (ground + first floor) joined by stair waypoints, doors that
 *     open as they walk up, seats, queues, groups, following the player
 *   - stats, XP/levels, grades, homework deadlines, exams, missions
 * The React shell reads `events` (drained each frame) to play sounds, show
 * toasts and open overlays (dialogue, lessons, cafeteria…), then calls the
 * finish* / talk / buy methods with the results.
 */
import {
  DAY_START, SCHOOL_END, DAY_CUTOFF, CLASS_LEN, ON_TIME_GRACE, LATE_LIMIT, ACTIVITY_AT, DAY_SPEED, BLOCKS, BELLS, blockAt, fmtTime,
  SUBJECTS, ACADEMIC, EXAM, daySchedule, examSubjects, isExamDay, nextExamDay, subjectInfo, letter, GRADE_WEIGHT,
  STUDENTS, TEACHERS, STAFF, PERSONALITIES, FOOD, VENDING, ACTIVITIES, MAX_LEVEL, xpToNext, XP, LEVEL_UNLOCKS, MISSIONS,
  FRIEND_AT, friendTier, NOTEBOOK_SPOTS, OUTFITS, HAIR_STYLES, HAIR_COLORS, ACCESSORIES, unlocked,
} from "./data.js";
import { buildLayout, F1, STEP, BOUNDS, zoneAt, isIndoor, roomById } from "./layout.js";
import { HOMEWORK_TEXT, FEEDBACK } from "./questions.js";
import { respond, AMBIENT, TEACHER_LINES, FAVORS } from "./social.js";
import { sanitizeLook } from "./progress.js";

const TAU = Math.PI * 2;
export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const angDiff = (a, b) => {
  let d = (b - a) % TAU;
  if (d > Math.PI) d -= TAU;
  if (d < -Math.PI) d += TAU;
  return d;
};
export const lerpAngle = (a, b, t) => a + angDiff(a, b) * t;
export const yawTo = (ax, az, bx, bz) => Math.atan2(bx - ax, bz - az);
export function mulberry(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

let LAYOUT = null;
export function getLayout() {
  if (!LAYOUT) LAYOUT = buildLayout();
  return LAYOUT;
}

/* ===================================================================== tuning */
export const PLAYER_R = 0.32;
export const PLAYER_H = 1.72;
const WALK = 3.0;
const RUN = 5.8;
const ACCEL = 11;
const DECEL = 14;
const GRAV = 15;
const JUMP_V = 4.5;
const NPC_R = 0.3;
export const HOOP_R = 0.23;
const BALL_R = 0.12;
const FLOOR = (y) => (y > F1 * 0.5 + 0.2 ? 1 : 0);

/* ===================================================================== space */
/** Static colliders + walkable surfaces in a 2 m spatial hash. */
export class Space {
  constructor(L) {
    this.cell = 2;
    this.x0 = BOUNDS.x1 - 4;
    this.z0 = BOUNDS.z1 - 4;
    this.nx = Math.ceil((BOUNDS.x2 - BOUNDS.x1 + 8) / this.cell);
    this.nz = Math.ceil((BOUNDS.z2 - BOUNDS.z1 + 8) / this.cell);
    this.cols = L.cols;
    this.surfs = L.surfs;
    this.ramps = L.ramps;
    this.cg = Array.from({ length: this.nx * this.nz }, () => []);
    this.sg = Array.from({ length: this.nx * this.nz }, () => []);
    this.cols.forEach((b, i) => this.insert(this.cg, b, i));
    this.surfs.forEach((b, i) => this.insert(this.sg, b, i));
    this.stamp = new Uint32Array(this.cols.length);
    this.run = 0;
  }
  insert(grid, b, i) {
    const i0 = clamp(Math.floor((b.x1 - this.x0) / this.cell), 0, this.nx - 1);
    const i1 = clamp(Math.floor((b.x2 - this.x0) / this.cell), 0, this.nx - 1);
    const k0 = clamp(Math.floor((b.z1 - this.z0) / this.cell), 0, this.nz - 1);
    const k1 = clamp(Math.floor((b.z2 - this.z0) / this.cell), 0, this.nz - 1);
    for (let k = k0; k <= k1; k++) for (let ii = i0; ii <= i1; ii++) grid[k * this.nx + ii].push(i);
  }
  forCols(x1, x2, z1, z2, fn) {
    const run = ++this.run;
    const i0 = clamp(Math.floor((x1 - this.x0) / this.cell), 0, this.nx - 1);
    const i1 = clamp(Math.floor((x2 - this.x0) / this.cell), 0, this.nx - 1);
    const k0 = clamp(Math.floor((z1 - this.z0) / this.cell), 0, this.nz - 1);
    const k1 = clamp(Math.floor((z2 - this.z0) / this.cell), 0, this.nz - 1);
    for (let k = k0; k <= k1; k++) {
      for (let ii = i0; ii <= i1; ii++) {
        for (const idx of this.cg[k * this.nx + ii]) {
          if (this.stamp[idx] === run) continue;
          this.stamp[idx] = run;
          if (fn(this.cols[idx]) === false) return;
        }
      }
    }
  }
  /** Highest walkable height at (x,z) not above y + STEP. Ground plane = 0. */
  groundAt(x, z, y) {
    let best = 0;
    const lim = y + STEP + 1e-3;
    const i = clamp(Math.floor((x - this.x0) / this.cell), 0, this.nx - 1);
    const k = clamp(Math.floor((z - this.z0) / this.cell), 0, this.nz - 1);
    for (const idx of this.sg[k * this.nx + i]) {
      const s = this.surfs[idx];
      if (x >= s.x1 && x <= s.x2 && z >= s.z1 && z <= s.z2 && s.top <= lim && s.top > best) best = s.top;
    }
    for (const r of this.ramps) {
      if (x >= r.x1 && x <= r.x2 && z >= r.z1 - 0.05 && z <= r.z2 + 0.05) {
        const h = r.ya + ((r.yb - r.ya) * clamp((z - r.z1) / (r.z2 - r.z1), 0, 1));
        if (h <= lim && h > best) best = h;
      }
    }
    return best;
  }
  /** Push a circle at (x,z) out of boxes overlapping the vertical span [ya, yb]. */
  resolve(pos, r, ya, yb, extra) {
    let hit = false;
    const test = (b) => {
      if (b.y2 <= ya || b.y1 >= yb) return;
      const cx = clamp(pos.x, b.x1, b.x2);
      const cz = clamp(pos.z, b.z1, b.z2);
      let dx = pos.x - cx;
      let dz = pos.z - cz;
      const d2 = dx * dx + dz * dz;
      if (d2 >= r * r) return;
      hit = true;
      if (d2 > 1e-9) {
        const d = Math.sqrt(d2);
        pos.x = cx + (dx / d) * r;
        pos.z = cz + (dz / d) * r;
      } else {
        // centre inside the box: leave by the nearest side
        const l = pos.x - b.x1;
        const rr = b.x2 - pos.x;
        const n = pos.z - b.z1;
        const s = b.z2 - pos.z;
        const m = Math.min(l, rr, n, s);
        if (m === l) pos.x = b.x1 - r;
        else if (m === rr) pos.x = b.x2 + r;
        else if (m === n) pos.z = b.z1 - r;
        else pos.z = b.z2 + r;
      }
    };
    for (let it = 0; it < 3; it++) {
      this.forCols(pos.x - r - 0.1, pos.x + r + 0.1, pos.z - r - 0.1, pos.z + r + 0.1, test);
      if (extra) for (const b of extra) test(b);
    }
    return hit;
  }
  /** Is there a box (overlapping [ya,yb]) touching a circle at (x,z)? */
  blocked(x, z, r, ya, yb) {
    let hit = false;
    this.forCols(x - r, x + r, z - r, z + r, (b) => {
      if (b.y2 <= ya || b.y1 >= yb) return;
      const cx = clamp(x, b.x1, b.x2);
      const cz = clamp(z, b.z1, b.z2);
      if ((x - cx) ** 2 + (z - cz) ** 2 < r * r) {
        hit = true;
        return false;
      }
    });
    return hit;
  }
  /** Fraction t∈[0,1] along a→b of the first camera-blocking box (1 = clear). */
  raycast(ax, ay, az, bx, by, bz, extra) {
    let best = 1;
    const dx = bx - ax;
    const dy = by - ay;
    const dz = bz - az;
    const test = (b) => {
      if (b.cam === false) return;
      let t0 = 0;
      let t1 = best;
      for (const [o, d, lo, hi] of [[ax, dx, b.x1, b.x2], [ay, dy, b.y1, b.y2], [az, dz, b.z1, b.z2]]) {
        if (Math.abs(d) < 1e-9) {
          if (o < lo || o > hi) return;
        } else {
          let ta = (lo - o) / d;
          let tb = (hi - o) / d;
          if (ta > tb) [ta, tb] = [tb, ta];
          if (ta > t0) t0 = ta;
          if (tb < t1) t1 = tb;
          if (t0 > t1) return;
        }
      }
      if (t0 < best && t0 >= 0) best = t0;
    };
    this.forCols(Math.min(ax, bx), Math.max(ax, bx), Math.min(az, bz), Math.max(az, bz), test);
    if (extra) for (const b of extra) test(b);
    return best;
  }
}

/* ===================================================================== nav */
const NAV = 0.5;
const NAV_R = 0.26;
class Grid {
  constructor(x1, z1, x2, z2) {
    this.x1 = x1;
    this.z1 = z1;
    this.nx = Math.round((x2 - x1) / NAV);
    this.nz = Math.round((z2 - z1) / NAV);
    const n = this.nx * this.nz;
    this.block = new Uint8Array(n);
    this.g = new Float32Array(n);
    this.f = new Float32Array(n);
    this.from = new Int32Array(n);
    this.seen = new Uint32Array(n);
    this.closed = new Uint32Array(n);
    this.run = 0;
  }
  mark(b, r, v) {
    const i1 = Math.max(0, Math.floor((b.x1 - r - this.x1) / NAV));
    const i2 = Math.min(this.nx - 1, Math.floor((b.x2 + r - this.x1) / NAV));
    const k1 = Math.max(0, Math.floor((b.z1 - r - this.z1) / NAV));
    const k2 = Math.min(this.nz - 1, Math.floor((b.z2 + r - this.z1) / NAV));
    for (let k = k1; k <= k2; k++) {
      for (let i = i1; i <= i2; i++) {
        const cx = this.x1 + (i + 0.5) * NAV;
        const cz = this.z1 + (k + 0.5) * NAV;
        if (cx > b.x1 - r && cx < b.x2 + r && cz > b.z1 - r && cz < b.z2 + r) this.block[k * this.nx + i] = v;
      }
    }
  }
  idx(x, z) {
    const i = clamp(Math.floor((x - this.x1) / NAV), 0, this.nx - 1);
    const k = clamp(Math.floor((z - this.z1) / NAV), 0, this.nz - 1);
    return k * this.nx + i;
  }
  pos(c) {
    return [this.x1 + ((c % this.nx) + 0.5) * NAV, this.z1 + (Math.floor(c / this.nx) + 0.5) * NAV];
  }
  nearestFree(x, z) {
    const c0 = this.idx(x, z);
    if (!this.block[c0]) return c0;
    const ci = c0 % this.nx;
    const ck = Math.floor(c0 / this.nx);
    for (let r = 1; r <= 8; r++) {
      let best = -1;
      let bd = 1e9;
      for (let k = ck - r; k <= ck + r; k++) {
        for (let i = ci - r; i <= ci + r; i++) {
          if (i < 0 || k < 0 || i >= this.nx || k >= this.nz) continue;
          const c = k * this.nx + i;
          if (this.block[c]) continue;
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
  clear(ax, az, bx, bz) {
    const d = Math.hypot(bx - ax, bz - az);
    const n = Math.ceil(d / (NAV * 0.45));
    for (let s = 1; s < n; s++) {
      const t = s / n;
      if (this.block[this.idx(ax + (bx - ax) * t, az + (bz - az) * t)]) return false;
    }
    return true;
  }
  path(ax, az, bx, bz, maxIter = 60000) {
    const s = this.nearestFree(ax, az);
    const e = this.nearestFree(bx, bz);
    if (s < 0 || e < 0) return null;
    if (s === e) return [[bx, bz]];
    if (this.clear(ax, az, bx, bz) && !this.block[this.idx(bx, bz)]) return [[bx, bz]];
    const run = ++this.run;
    const nx = this.nx;
    const ex = e % nx;
    const ez = Math.floor(e / nx);
    const h = (c) => {
      const dx = Math.abs((c % nx) - ex);
      const dz = Math.abs(Math.floor(c / nx) - ez);
      return dx + dz + (Math.SQRT2 - 2) * Math.min(dx, dz);
    };
    const heap = [s];
    this.g[s] = 0;
    this.f[s] = h(s);
    this.seen[s] = run;
    this.from[s] = -1;
    const f = this.f;
    const push = (c) => {
      heap.push(c);
      let i = heap.length - 1;
      while (i > 0) {
        const p = (i - 1) >> 1;
        if (f[heap[p]] <= f[heap[i]]) break;
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
          if (l < heap.length && f[heap[l]] < f[heap[m]]) m = l;
          if (r < heap.length && f[heap[r]] < f[heap[m]]) m = r;
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
          if (this.closed[n] === run || this.block[n]) continue;
          if (di && dk && (this.block[ck * nx + i] || this.block[k * nx + ci])) continue;
          const g = this.g[c] + (di && dk ? Math.SQRT2 : 1);
          if (this.seen[n] !== run || g < this.g[n]) {
            this.seen[n] = run;
            this.g[n] = g;
            f[n] = g + h(n);
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
    const pts = cells.map((c) => this.pos(c));
    pts[pts.length - 1] = [bx, bz];
    const out = [];
    let cur = [ax, az];
    let i = 0;
    while (i < pts.length - 1) {
      let j = pts.length - 1;
      while (j > i + 1 && !this.clear(cur[0], cur[1], pts[j][0], pts[j][1])) j--;
      out.push(pts[j]);
      cur = pts[j];
      i = j;
    }
    if (!out.length) out.push([bx, bz]);
    return out;
  }
}

export class Nav {
  constructor(L) {
    this.L = L;
    const g0 = new Grid(BOUNDS.x1, BOUNDS.z1, BOUNDS.x2, BOUNDS.z2);
    for (const b of L.cols) if (b.y2 > 0.3 && b.y1 < 1.8) g0.mark(b, NAV_R, 1);
    // stairwells are crossed with scripted waypoints, never by the grid
    for (const [x1, x2] of [[-22, -16], [16, 22]]) g0.mark({ x1, x2, z1: 3.5, z2: 14 }, 0, 1);
    const g1 = new Grid(-41, -15, 41, 15);
    g1.block.fill(1);
    for (const s of L.surfs) if (Math.abs(s.top - F1) < 0.05) g1.mark({ x1: s.x1, x2: s.x2, z1: s.z1, z2: s.z2 }, -0.01, 0);
    for (const b of L.cols) if (b.y2 > F1 + 0.3 && b.y1 < F1 + 1.8) g1.mark(b, NAV_R, 1);
    for (const [x1, x2] of [[-22, -16], [16, 22]]) g1.mark({ x1, x2, z1: 3.5, z2: 14 }, 0, 1);
    this.grids = [g0, g1];
    this.stairs = L.stairs;
  }
  /** Route between two points (any floors) → [{x,z,stair?}] or null. */
  route(a, b) {
    const fa = FLOOR(a.y);
    const fb = FLOOR(b.y);
    const seg = (fl, ax, az, bx, bz) => {
      const p = this.grids[fl].path(ax, az, bx, bz);
      return p ? p.map(([x, z]) => ({ x, z })) : null;
    };
    if (fa === fb) return seg(fa, a.x, a.z, b.x, b.z);
    let best = null;
    let bd = 1e9;
    for (const s of this.stairs) {
      const [sx, sz] = fa === 0 ? s.bottom : s.top;
      const [ex, ez] = fa === 0 ? s.top : s.bottom;
      const d = Math.hypot(sx - a.x, sz - a.z) + Math.hypot(ex - b.x, ez - b.z);
      if (d < bd) {
        bd = d;
        best = s;
      }
    }
    const s = best;
    const [sx, sz] = fa === 0 ? s.bottom : s.top;
    const [ex, ez] = fa === 0 ? s.top : s.bottom;
    const p1 = seg(fa, a.x, a.z, sx, sz);
    const p2 = seg(fb, ex, ez, b.x, b.z);
    if (!p1 || !p2) return null;
    const wp = (fa === 0 ? s.up : s.up.slice().reverse()).map(([x, z]) => ({ x, z, stair: true }));
    wp[wp.length - 1].stairEnd = true;
    return [...p1, ...wp, ...p2];
  }
  free(x, z, y) {
    const g = this.grids[FLOOR(y)];
    return !g.block[g.idx(x, z)];
  }
}

/* ===================================================================== helpers */
const pick = (rng, arr) => arr[Math.floor(rng() * arr.length)];
const dist2 = (a, b) => (a.x - b.x) ** 2 + (a.z - b.z) ** 2;
const ROOM_OF = (subj) => (subj === "exam" ? "exam103" : SUBJECTS[subj]?.room || null);
const GROUPS = {
  fountain: { x: -6, z: 27, y: 0, r: 4.1, n: 8 },
  plaza: { x: 0, z: -19.5, y: 0, r: 1.5, n: 5 },
  lockers: { x: -12.5, z: 5.3, y: 0, r: 1.2, n: 5 },
  lobby: { x: -3, z: -8.5, y: 0, r: 1.3, n: 5 },
  gardenG: { x: -33, z: 22.2, y: 0, r: 1.2, n: 4 },
  court: { x: 13, z: 26.5, y: 0, r: 2.6, n: 6 },
  field: { x: -8, z: 78, y: 0, r: 3.0, n: 6 },
  lounge: { x: -9, z: 8.6, y: F1, r: 1.3, n: 5 },
  hall0: { x: 22, z: 0, y: 0, r: 1.3, n: 4 },
  art: { x: 13.4, z: 10.6, y: F1, r: 1.0, n: 4 },
  track: { x: 0, z: 53, y: 0, r: 1.5, n: 4 },
  frontG: { x: -14, z: -25, y: 0, r: 1.4, n: 4 },
};
const LIKE_TO = {
  courtyard: ["fountain", "benchC", "plaza"],
  cafeteria: ["cafeSeat"],
  library: ["library"],
  garden: ["gardenG", "benchG"],
  court: ["court"],
  field: ["field"],
  computer: ["computer"],
  art: ["art"],
};

/* ===================================================================== Sim */
export class Sim {
  constructor({ save, seed = 1, fresh = false, startTime = null } = {}) {
    this.L = getLayout();
    this.space = new Space(this.L);
    this.nav = new Nav(this.L);
    this.save = save;
    this.rng = mulberry(seed);
    this.events = [];
    this.t = 0;
    this.hudT = 0;
    this.missionT = 0;
    this.prompt = null;
    this.target = null;
    this.talking = null;
    this.activity = null;
    this.lessonOpen = null;
    this.dayOver = false;
    this.paused = false;
    this.doors = this.L.doors.map((d) => ({ ...d, open: 0, target: 0, hold: 0, byPlayer: false }));
    this.seats = this.L.seats;
    this.seatById = new Map(this.seats.map((s) => [s.id, s]));
    this.seats.forEach((s) => (s.occ = null));
    this.queue = [];
    this.ballFx = [];
    this.buildNPCs();
    this.startTime = startTime;
    this.startDay(fresh || !save.dayState);
  }

  emit(type, data = {}) {
    this.events.push({ type, ...data });
  }
  get day() {
    return this.save.day;
  }
  get look() {
    return this.save.look;
  }

  /* ------------------------------------------------------------- people */
  buildNPCs() {
    const rng = mulberry(77);
    this.npcs = [];
    STUDENTS.forEach((s, i) => this.npcs.push(this.mkNPC({ ...s, type: "student", idx: i, speedMul: 0.92 + rng() * 0.18 })));
    TEACHERS.forEach((t, i) => this.npcs.push(this.mkNPC({ ...t, type: "teacher", idx: i, speedMul: 0.95 + rng() * 0.1 })));
    STAFF.forEach((t, i) => this.npcs.push(this.mkNPC({ ...t, type: "staff", idx: i, speedMul: 1 })));
    this.npcById = new Map(this.npcs.map((n) => [n.id, n]));
    // fixed class seats: each student keeps a seat per classroom; 4 seats per room stay free for the player
    const seatRng = mulberry(4242);
    this.classSeat = {};
    for (const [room, seats] of Object.entries(this.L.classSeats)) {
      const order = seats.map((_, i) => i);
      for (let i = order.length - 1; i > 0; i--) {
        const j = Math.floor(seatRng() * (i + 1));
        [order[i], order[j]] = [order[j], order[i]];
      }
      this.classSeat[room] = {};
      STUDENTS.forEach((s, i) => (this.classSeat[room][s.id] = seats[order[i]]));
      seats.forEach((st) => (st.reserved = null));
      STUDENTS.forEach((s, i) => (seats[order[i]].reserved = s.id));
    }
  }
  mkNPC(o) {
    return {
      ...o,
      x: 0, y: 0, z: 0, yaw: 0,
      vx: 0, vz: 0, speed: 0,
      path: [], goal: null, planKey: "", think: 0, wait: 0,
      pose: "stand", poseT: 0, seat: null, stairLock: false,
      hidden: false, bubble: null, bubbleT: 0, chatT: 2 + Math.random() * 6,
      state: "idle", follow: false, followUntil: 0, stuckT: 0, lastD: 0, hurry: false,
      greetT: 0, tray: false, mood: null, moodT: 0, anim: 0, talkLock: false, wanderT: 0,
    };
  }

  /* ------------------------------------------------------------- day setup */
  startDay(fresh) {
    const S = this.save;
    this.sched = daySchedule(S.day);
    const st = S.dayState;
    if (!fresh && st) {
      this.time = clamp(st.time, DAY_START, DAY_CUTOFF);
      this.ds = st;
    } else {
      this.time = this.startTime ?? DAY_START;
      this.startTime = null;
      this.ds = {
        day: S.day,
        time: DAY_START,
        classes: this.sched.map((subject, slot) => ({ slot, subject, room: subject === "activities" ? null : ROOM_OF(subject), status: "upcoming", arrived: null, score: null, grade: null, warned: 0, late: false })),
        startXp: S.totalXp,
        startPoints: S.points,
        startLevel: S.level,
        startRep: S.rep,
        energy: 100,
        talked: {},
        helpedToday: {},
        missionsToday: [],
        studySessions: 0,
        homeworkToday: 0,
        warnings: 0,
        lates: 0,
        nurseUsed: false,
        focus: null,
        tips: {},
        player: null,
        events: [],
        sportsToday: 0,
        mealsToday: 0,
      };
      S.dayState = this.ds;
      this.checkDeadlines();
      // a few classmates need help today
      const r = mulberry(S.day * 97 + 13);
      this.ds.needHelp = STUDENTS.filter(() => r() < 0.35).map((s) => s.id);
    }
    this.ds.needHelp = this.ds.needHelp || [];
    this.lastBell = this.time;
    this.blockId = blockAt(this.time).id;
    this.dayOver = false;
    // player
    const p = this.ds.player;
    this.player = {
      x: p ? p.x : 0, y: p ? p.y : 0, z: p ? p.z : -43, yaw: p ? p.yaw : 0,
      vx: 0, vz: 0, vy: 0, onGround: true, speed: 0, running: false,
      seat: null, sitT: 0, carry: null, eatT: 0, anim: { phase: 0, celebrate: 0, interact: 0, kick: 0, shoot: 0, wave: 0 },
      zone: null, prevZone: null, lastSafe: null,
    };
    if (p && !this.space.blocked(p.x, p.z, PLAYER_R, p.y + STEP, p.y + PLAYER_H)) Object.assign(this.player, { x: p.x, y: p.y, z: p.z });
    else if (p) Object.assign(this.player, { x: 0, y: 0, z: -43, yaw: 0 });
    // NPCs: place them where their routine says they should be right now
    this.seats.forEach((s) => (s.occ = null));
    this.queue = [];
    for (const n of this.npcs) {
      Object.assign(n, { path: [], goal: null, planKey: "", seat: null, hidden: false, follow: false, talkLock: false, stairLock: false, tray: false, pose: "stand", bubble: null });
      this.placeAtStart(n, fresh || !st);
    }
    this.notebookItem = null;
    if (S.notebook.state === 1) this.spawnNotebook();
    this.emit("dayStart", { day: S.day, fresh: fresh || !st });
  }
  placeAtStart(n, freshDay) {
    const rng = this.rng;
    const plan = this.planFor(n);
    if (n.type === "student" && freshDay && this.time < DAY_START + 5) {
      // arriving through the gate in a loose stream
      n.x = -3 + rng() * 6;
      n.z = -44 - rng() * 1.5;
      n.y = 0;
      n.yaw = 0;
      n.planKey = "";
      n.think = n.idx * 0.9 + rng() * 2;
      return;
    }
    // straight to the goal position (recovery-style placement on load / day start)
    this.setGoal(n, plan, true);
  }

  /* ------------------------------------------------------------- clock */
  speedMul() {
    const b = blockAt(this.time);
    const p = this.player;
    if (b.kind === "pass") return 0.35;
    if (b.kind === "class" && p.seat) {
      const c = this.ds.classes[b.slot];
      if (c && c.room && this.seatById.get(p.seat)?.room === c.room) return c.status === "done" ? 8 : 2.4;
    }
    if (b.kind === "after") return 1.2;
    return 1;
  }
  advanceClock(dt) {
    if (this.dayOver) return;
    const secPerMin = DAY_SPEED[this.save.settings.dayLength] || DAY_SPEED.normal;
    const prev = this.time;
    this.time = Math.min(DAY_CUTOFF, this.time + (dt / secPerMin) * this.speedMul());
    for (const b of BELLS) if (prev < b && this.time >= b) this.emit("bell", { at: b, end: b === SCHOOL_END });
    const blk = blockAt(this.time);
    if (blk.id !== this.blockId) {
      const old = this.blockId;
      this.blockId = blk.id;
      this.onBlockChange(old, blk);
    }
    if (this.time >= DAY_CUTOFF && !this.dayOver) this.finishDay("cutoff");
  }
  onBlockChange(oldId, blk) {
    // close the class that just ended
    const old = BLOCKS.find((b) => b.id === oldId);
    if (old && old.kind === "class") this.closeClass(old);
    if (blk.kind === "class") {
      const c = this.ds.classes[blk.slot];
      if (c && c.status === "upcoming") c.status = "open";
      const info = subjectInfo(c.subject);
      this.emit("block", { block: blk, subject: c.subject, text: c.subject === "activities" ? "Activities time! Play sports, study or explore." : `${info.name} has started${c.room ? ` — ${roomById(c.room)?.short || ""}` : ""}.` });
      // followers go to class
      for (const n of this.npcs) if (n.follow && c.subject !== "activities") this.stopFollow(n, "class");
    } else this.emit("block", { block: blk, text: blk.kind === "break" ? "Break time! Visit the courtyard or the court." : blk.kind === "lunch" ? "Lunch time! The cafeteria is open." : blk.kind === "after" ? "School's out! Head to the gate to finish the day." : blk.kind === "pass" ? "Passing time — get to your next class." : "" });
    if (blk.kind === "after") this.emit("schoolOut");
  }

  /** Attendance counters also tracked per day so "restart day" can roll them back. */
  att(field, d = 1) {
    this.save.att[field] = (this.save.att[field] || 0) + d;
    const A = (this.ds.attDelta = this.ds.attDelta || {});
    A[field] = (A[field] || 0) + d;
  }

  /* ------------------------------------------------------------- schedule info */
  currentClass() {
    const b = blockAt(this.time);
    return b.kind === "class" ? this.ds.classes[b.slot] : null;
  }
  /** The class you should be heading to / sitting in right now. */
  nextClass() {
    for (const b of BLOCKS) {
      if (b.kind !== "class" || b.end <= this.time) continue;
      const c = this.ds.classes[b.slot];
      if (!c) continue;
      if (b.start <= this.time && (c.status === "done" || c.status === "absent" || c.status === "skipped")) continue;
      return { block: b, cls: c };
    }
    return null;
  }
  schedInfo() {
    const b = blockAt(this.time);
    const cur = this.currentClass();
    const nxt = BLOCKS.find((x) => x.kind === "class" && x.start > this.time);
    return {
      time: this.time,
      clock: fmtTime(this.time),
      block: b,
      activity: cur ? subjectInfo(cur.subject).name : b.label,
      room: cur?.room ? roomById(cur.room)?.short : null,
      next: nxt ? { at: fmtTime(nxt.start), name: subjectInfo(this.ds.classes[nxt.slot].subject).name, room: this.ds.classes[nxt.slot].room ? roomById(this.ds.classes[nxt.slot].room)?.short : "Anywhere", in: Math.ceil(nxt.start - this.time) } : null,
      remaining: Math.max(0, Math.ceil(b.end - this.time)),
    };
  }

  /* ------------------------------------------------------------- main step */
  step(inp, dt) {
    dt = Math.min(dt, 0.1);
    this.t += dt;
    if (!this.paused) this.advanceClock(dt);
    this.updatePlayer(inp || {}, dt);
    this.updateActivity(inp || {}, dt);
    this.updateDoors(dt);
    this.updateNPCs(dt);
    this.updateClass(dt);
    this.updateStats(dt);
    this.hudT -= dt;
    if (this.hudT <= 0) {
      this.hudT = 0.1;
      this.updateZone();
      this.updatePrompt();
    }
    this.missionT -= dt;
    if (this.missionT <= 0) {
      this.missionT = 0.5;
      this.checkMissions();
    }
    if (inp && inp.interact) this.interact();
    if (inp && inp.sit) this.toggleSit();
    if (inp && inp.raise) this.raiseHand();
  }

  /* ------------------------------------------------------------- player */
  energyOk() {
    return this.ds.energy > 12;
  }
  updatePlayer(inp, dt) {
    const p = this.player;
    const A = p.anim;
    A.celebrate = Math.max(0, A.celebrate - dt);
    A.interact = Math.max(0, A.interact - dt);
    A.kick = Math.max(0, A.kick - dt);
    A.shoot = Math.max(0, A.shoot - dt);
    A.wave = Math.max(0, A.wave - dt);
    if (p.seat) {
      const s = this.seatById.get(p.seat);
      p.x = s.x;
      p.z = s.z;
      p.y = s.y - 0.47;
      p.yaw = s.yaw;
      p.speed = 0;
      p.vx = p.vz = p.vy = 0;
      p.sitT += dt;
      if (p.eatT > 0) {
        p.eatT -= dt;
        if (p.eatT <= 0) this.finishEating();
      }
      return;
    }
    if (this.talking) {
      p.vx *= 0.8;
      p.vz *= 0.8;
      p.speed = Math.hypot(p.vx, p.vz);
      return;
    }
    let mx = clamp(inp.mx || 0, -1, 1);
    let mz = clamp(inp.mz || 0, -1, 1);
    const ml = Math.hypot(mx, mz);
    if (ml > 1) {
      mx /= ml;
      mz /= ml;
    }
    const cy = inp.camYaw ?? p.yaw;
    const fx = Math.sin(cy);
    const fz = Math.cos(cy);
    const dirX = fx * mz - fz * mx;
    const dirZ = fz * mz + fx * mx;
    const moving = ml > 0.05;
    const act = this.activity;
    const lockMove = act && act.lock;
    const canRun = this.energyOk() && !(act && act.kind === "basketball" && act.charging);
    p.running = moving && !!inp.run && canRun && !lockMove;
    let spd = (p.running ? RUN : WALK) * (this.ds.energy <= 0 ? 0.72 : 1);
    if (lockMove) spd = 0;
    const tx = moving ? dirX * spd : 0;
    const tz = moving ? dirZ * spd : 0;
    const k = Math.min(1, (moving ? ACCEL : DECEL) * dt);
    p.vx += (tx - p.vx) * k;
    p.vz += (tz - p.vz) * k;
    p.speed = Math.hypot(p.vx, p.vz);
    if (p.speed > 0.3) p.yaw = lerpAngle(p.yaw, Math.atan2(p.vx, p.vz), Math.min(1, 11 * dt));
    else if (act && act.faceYaw != null) p.yaw = lerpAngle(p.yaw, act.faceYaw, Math.min(1, 8 * dt));
    if (inp.jump && p.onGround && !lockMove) {
      p.vy = JUMP_V;
      p.onGround = false;
      this.ds.energy = Math.max(0, this.ds.energy - 0.4);
      this.emit("jump");
    }
    // horizontal move + collision (substeps keep fast movement from tunnelling)
    const steps = Math.max(1, Math.ceil((p.speed * dt) / 0.12));
    const doorBoxes = this.doorBoxes();
    for (let i = 0; i < steps; i++) {
      p.x += (p.vx * dt) / steps;
      p.z += (p.vz * dt) / steps;
      const pos = { x: p.x, z: p.z };
      this.space.resolve(pos, PLAYER_R, p.y + STEP, p.y + PLAYER_H, doorBoxes);
      this.pushFromNPCs(pos);
      p.x = clamp(pos.x, BOUNDS.x1 + 1, BOUNDS.x2 - 1);
      p.z = clamp(pos.z, BOUNDS.z1 + 1, BOUNDS.z2 - 1);
    }
    // vertical
    const g = this.space.groundAt(p.x, p.z, p.y);
    p.vy -= GRAV * dt;
    let ny = p.y + p.vy * dt;
    if (p.vy > 0) {
      // ceiling
      let ceil = Infinity;
      this.space.forCols(p.x - 0.2, p.x + 0.2, p.z - 0.2, p.z + 0.2, (b) => {
        if (p.x >= b.x1 && p.x <= b.x2 && p.z >= b.z1 && p.z <= b.z2 && b.y1 >= p.y + PLAYER_H - 0.05 && b.y1 < ceil) ceil = b.y1;
      });
      if (ny + PLAYER_H > ceil) {
        ny = ceil - PLAYER_H;
        p.vy = 0;
      }
    }
    const wasGround = p.onGround;
    if (ny <= g) {
      if (!wasGround && p.vy < -6) this.emit("land", { impact: -p.vy });
      ny = g;
      p.vy = 0;
      p.onGround = true;
    } else if (wasGround && p.vy <= 0 && ny - g < 0.45) {
      ny = g;
      p.vy = 0;
      p.onGround = true;
    } else p.onGround = false;
    p.y = ny;
    if (p.y < -3) Object.assign(p, { x: 0, y: 0, z: -40, vy: 0 });
    // gait + energy
    if (p.onGround && p.speed > 0.2) p.anim.phase += dt * p.speed * (p.running ? 2.0 : 2.6);
    if (p.running && p.speed > 2) this.ds.energy = Math.max(0, this.ds.energy - dt * 0.55);
    // following friends don't block the player in tight rooms
  }
  doorBoxes() {
    const out = [];
    for (const d of this.doors) {
      if (d.open > 0.55) continue;
      const half = d.w / 2;
      if (d.axis === "x") out.push({ x1: d.x - half, x2: d.x + half, z1: d.z - 0.1, z2: d.z + 0.1, y1: d.y, y2: d.y + d.h, cam: true });
      else out.push({ x1: d.x - 0.1, x2: d.x + 0.1, z1: d.z - half, z2: d.z + half, y1: d.y, y2: d.y + d.h, cam: true });
    }
    return out;
  }
  pushFromNPCs(pos) {
    const p = this.player;
    for (const n of this.npcs) {
      if (n.hidden || n.seat || Math.abs(n.y - p.y) > 1.2) continue;
      const dx = pos.x - n.x;
      const dz = pos.z - n.z;
      const d2 = dx * dx + dz * dz;
      const rr = PLAYER_R + NPC_R;
      if (d2 < rr * rr && d2 > 1e-6) {
        const d = Math.sqrt(d2);
        pos.x = n.x + (dx / d) * rr;
        pos.z = n.z + (dz / d) * rr;
      }
    }
  }

  /* ------------------------------------------------------------- doors */
  updateDoors(dt) {
    const p = this.player;
    for (const d of this.doors) {
      d.hold = Math.max(0, d.hold - dt);
      // NPCs walking up open the door; close again when nobody is near
      let near = false;
      const dp = Math.hypot(p.x - d.x, p.z - d.z);
      if (dp < 1.6 && Math.abs(p.y - d.y) < 1.2) near = true;
      if (!d.byPlayer && d.hold <= 0 && !near && d.target > 0) d.target = 0;
      if (d.byPlayer && d.hold <= 0 && dp > 3 && !this.npcNearDoor(d)) {
        d.byPlayer = false;
        d.target = 0;
      }
      const prev = d.open;
      d.open = clamp(d.open + Math.sign(d.target - d.open) * dt * 2.6, 0, 1);
      if (prev === 0 && d.open > 0) this.emit("door", { id: d.id, open: true, x: d.x, z: d.z, y: d.y });
      if (prev > 0 && d.open === 0) this.emit("door", { id: d.id, open: false, x: d.x, z: d.z, y: d.y, soft: true });
    }
  }
  npcNearDoor(d) {
    for (const n of this.npcs) if (!n.hidden && Math.abs(n.y - d.y) < 1.2 && Math.hypot(n.x - d.x, n.z - d.z) < 2) return true;
    return false;
  }
  openDoorFor(d, byPlayer = false) {
    d.target = 1;
    d.hold = byPlayer ? 8 : 2.5;
    if (byPlayer) d.byPlayer = true;
  }

  /* ------------------------------------------------------------- zone / prompt */
  updateZone() {
    const p = this.player;
    const z = zoneAt(p.x, p.z, p.y);
    if (!p.zone || p.zone.id !== z.id) {
      p.prevZone = p.zone;
      p.zone = z;
      this.onEnterZone(z);
    }
  }
  onEnterZone(z) {
    const S = this.save;
    const F = S.flags;
    if (!z.outdoor && !F.enteredBuilding) {
      F.enteredBuilding = true;
    }
    if (z.id === "library") F.library = true;
    if (z.id === "lab") F.labVisited = true;
    if (z.id === "principal") F.principalRoom = true;
    if (z.id === "cafeteria") F.cafeteriaVisited = true;
    const next = this.nextClass();
    const today = this.ds.classes.map((c) => c.room);
    if (z.id && today.includes(z.id)) F.foundClassroom = true;
    if (next && next.cls.room === z.id) F.foundClassroom = true;
    this.emit("zone", { id: z.id, name: z.name });
    // walking out through the gate after school ends the day
    if (z.id === "gate" && this.time >= SCHOOL_END && !this.dayOver) this.finishDay("gate");
  }
  /** Picks the interaction target in front of the player and the prompt text. */
  updatePrompt() {
    const p = this.player;
    this.target = null;
    this.prompt = null;
    if (this.talking || this.dayOver) return;
    const act = this.activity;
    if (act) {
      this.prompt = act.prompt || null;
      return;
    }
    if (p.seat) {
      const s = this.seatById.get(p.seat);
      const cls = this.currentClass();
      if (p.eatT > 0) this.prompt = { key: "", text: "Eating…" };
      else if (this.ds.teacherQ && this.ds.teacherQ.t > 0) this.prompt = { key: "E", text: "Raise your hand to answer!" };
      else if (cls && cls.room === s.room && cls.status !== "done") this.prompt = { key: "F", text: this.lessonState() };
      else if (s.station === "study") this.prompt = { key: "E", text: this.openHomework().length ? "Do homework / study  ·  F stand up" : "Study  ·  F stand up", act: "study" };
      else if (s.station === "computer") this.prompt = { key: "E", text: this.save.level >= ACTIVITIES.computer.level ? "Coding challenge  ·  F stand up" : `Coding challenges unlock at level ${ACTIVITIES.computer.level}  ·  F stand up`, act: "computer" };
      else this.prompt = { key: "F", text: "Stand up" };
      this.target = { kind: "seat", seat: s };
      return;
    }
    const fx = Math.sin(p.yaw);
    const fz = Math.cos(p.yaw);
    const score = (x, z, y, r) => {
      if (Math.abs(y - p.y) > 1.6) return -1;
      const dx = x - p.x;
      const dz = z - p.z;
      const d = Math.hypot(dx, dz);
      if (d > r) return -1;
      const facing = d < 0.01 ? 1 : (dx * fx + dz * fz) / d;
      if (facing < -0.2 && d > 0.9) return -1;
      return (r - d) / r + facing * 0.5;
    };
    let best = null;
    let bs = 0;
    for (const n of this.npcs) {
      if (n.hidden) continue;
      const s = score(n.x, n.z, n.y, 2.3);
      if (s > bs) {
        bs = s;
        best = { kind: "npc", npc: n };
      }
    }
    for (const it of this.L.inter) {
      const s = score(it.x, it.z, it.y - 1, it.r);
      if (s > bs) {
        bs = s;
        best = { kind: "inter", it };
      }
    }
    if (this.notebookItem && !this.notebookItem.taken) {
      const nb = this.notebookItem;
      const s = score(nb.x, nb.z, nb.y, 1.8);
      if (s > bs + 0.2) {
        bs = s + 1;
        best = { kind: "notebook" };
      }
    }
    for (const d of this.doors) {
      const s = score(d.x, d.z, d.y, 2.0);
      if (s > bs - 0.25 && s > 0) {
        if (!best || best.kind !== "npc" || s > bs) {
          if (s > bs) {
            bs = s;
            best = { kind: "door", door: d };
          }
        }
      }
    }
    // the nearest free seat for F
    let seat = null;
    let sd = 1.5;
    for (const s of this.seats) {
      if (s.occ || Math.abs(s.y - 0.47 - p.y) > 0.6) continue;
      const d = Math.hypot(s.x - p.x, s.z - p.z);
      if (d < sd) {
        sd = d;
        seat = s;
      }
    }
    this.target = best;
    this.nearSeat = seat;
    const parts = [];
    if (best) {
      if (best.kind === "npc") {
        const n = best.npc;
        parts.push({ key: "E", text: `Talk to ${n.name}` });
      } else if (best.kind === "inter") parts.push({ key: "E", text: this.interLabel(best.it) });
      else if (best.kind === "door") parts.push({ key: "E", text: `${best.door.open > 0.5 ? "Close" : "Open"} ${best.door.label}` });
      else if (best.kind === "notebook") parts.push({ key: "E", text: "Pick up Lily's notebook" });
    }
    if (seat) parts.push({ key: "F", text: seat.kind === "cafe" && p.carry ? "Sit & eat" : seat.kind === "desk" ? "Sit at desk" : "Sit" });
    if (!parts.length && p.carry && p.carry.food) parts.push({ key: "E", text: `Eat ${p.carry.name} (or sit at a table)` });
    this.prompt = parts.length ? { key: parts[0].key, text: parts[0].text, alt: parts[1] || null } : null;
  }
  interLabel(it) {
    switch (it.kind) {
      case "counter": {
        const b = blockAt(this.time);
        return b.kind === "class" ? "Cafeteria counter (closed during class)" : "Order food";
      }
      case "basketball":
      case "football":
      case "running": {
        const a = ACTIVITIES[it.activity];
        if (this.save.level < a.level) return `${a.name} — unlocks at level ${a.level}`;
        return `Start: ${a.name}`;
      }
      default:
        return it.label;
    }
  }
  lessonState() {
    const cls = this.currentClass();
    if (!cls) return "Stand up";
    const teacher = this.teacherFor(cls.subject);
    if (teacher && !this.teacherInRoom(teacher, cls.room)) return "Waiting for the teacher…  ·  F stand up";
    const b = blockAt(this.time);
    const startAt = b.start + ACTIVITY_AT;
    if (this.time < startAt) return `Lesson in progress — activity at ${fmtTime(startAt)}`;
    return "Get ready for the activity…";
  }

  /* ------------------------------------------------------------- interaction */
  interact() {
    if (this.dayOver || this.talking) return;
    const p = this.player;
    if (this.activity) return;
    if (p.seat) {
      if (this.ds.teacherQ && this.ds.teacherQ.t > 0) return this.raiseHand();
      const s = this.seatById.get(p.seat);
      const cls = this.currentClass();
      if (cls && cls.room === s.room && cls.status !== "done") return;
      if (s.station === "study") return this.emit("open", { what: "study", seat: s.id });
      if (s.station === "computer") {
        if (this.save.level < ACTIVITIES.computer.level) return this.emit("toast", { text: `Coding challenges unlock at level ${ACTIVITIES.computer.level}.`, kind: "bad" });
        return this.emit("open", { what: "computer" });
      }
      return;
    }
    const t = this.target;
    if (!t) {
      if (p.carry && p.carry.food) this.eatNow();
      return;
    }
    p.anim.interact = 0.5;
    if (t.kind === "npc") return this.beginTalk(t.npc);
    if (t.kind === "door") {
      const d = t.door;
      if (d.open > 0.5) {
        d.target = 0;
        d.byPlayer = false;
        d.hold = 0;
      } else this.openDoorFor(d, true);
      return;
    }
    if (t.kind === "notebook") {
      this.notebookItem.taken = true;
      this.save.notebook.state = 2;
      p.carry = { item: "notebook", name: "Lily's notebook" };
      this.emit("pickup", { text: "You found Lily's notebook! Bring it back to her." });
      return;
    }
    if (t.kind === "inter") {
      const it = t.it;
      switch (it.kind) {
        case "counter": {
          const b = blockAt(this.time);
          if (b.kind === "class") return this.emit("toast", { text: "The cafeteria counter is closed during classes.", kind: "bad" });
          return this.emit("open", { what: "food", menu: "counter" });
        }
        case "vending":
          return this.emit("open", { what: "food", menu: "vending" });
        case "locker":
          // turn around so the wardrobe camera has room in front of you
          p.yaw = yawTo(it.x, it.z, p.x, p.z);
          p.vx = p.vz = 0;
          return this.emit("open", { what: "locker" });
        case "mapboard":
          return this.emit("open", { what: "map" });
        case "microscope":
          if (!this.save.flags.microscope) {
            this.save.flags.microscope = true;
            this.addXP(8, "Microscope");
          }
          return this.emit("toast", { text: "🔬 You see onion skin cells — neat rows of tiny boxes!", kind: "good" });
        case "bed":
          if (this.ds.nurseUsed) return this.emit("toast", { text: "Nurse Grace: You've rested once today already.", kind: "bad" });
          this.ds.nurseUsed = true;
          this.ds.energy = Math.min(100, this.ds.energy + 35);
          this.time = Math.min(DAY_CUTOFF, this.time + 10);
          this.emit("toast", { text: "You rest for 10 minutes. +35 energy.", kind: "good" });
          return;
        case "piano":
          p.anim.interact = 1.4;
          this.save.happy = clamp(this.save.happy + (this.ds.pianoT > this.t ? 0 : 3), 0, 100);
          this.ds.pianoT = this.t + 60;
          this.emit("piano");
          return;
        case "basketball":
        case "football":
        case "running":
          return this.startActivity(it.activity, it);
        default:
      }
    }
  }
  toggleSit() {
    const p = this.player;
    if (this.talking || this.activity || this.dayOver) return;
    if (p.seat) return this.standUp();
    const s = this.nearSeat;
    if (!s) return;
    if (s.occ) return this.emit("toast", { text: "That seat is taken.", kind: "bad" });
    if (s.reserved && this.isClassTime(s.room)) {
      const owner = this.npcById.get(s.reserved);
      if (owner && !owner.hidden) return this.emit("toast", { text: `That's ${owner.name.split(" ")[0]}'s seat. Find a free desk (they glow).`, kind: "bad" });
    }
    s.occ = "player";
    p.seat = s.id;
    p.sitT = 0;
    p.vx = p.vz = 0;
    this.emit("sit", { seat: s.id });
    if (s.kind === "cafe" && p.carry && p.carry.food) this.startEating();
    this.onPlayerSeated(s);
  }
  standUp() {
    const p = this.player;
    const s = this.seatById.get(p.seat);
    if (!s) {
      p.seat = null;
      return;
    }
    if (p.eatT > 0) {
      p.eatT = 0;
      this.finishEating(true);
    }
    s.occ = null;
    p.seat = null;
    const [sx, sz] = s.stand || s.approach[s.approach.length - 1];
    p.x = sx;
    p.z = sz;
    p.y = s.y - 0.47;
    p.vy = 0;
    this.emit("stand");
    // standing up in the middle of a lesson
    const cls = this.currentClass();
    if (cls && cls.room === s.room && cls.status !== "done" && (cls.status === "ontime" || cls.status === "late")) {
      const t = this.teacherFor(cls.subject);
      if (t && this.teacherInRoom(t, cls.room)) this.warn(t, "sitDown", 1);
    }
  }
  isClassTime(room) {
    const b = blockAt(this.time);
    const c = b.kind === "class" ? this.ds.classes[b.slot] : b.kind === "pass" ? this.ds.classes[(BLOCKS[BLOCKS.indexOf(b) + 1] || {}).slot] : null;
    return !!(c && c.room === room);
  }

  /* ------------------------------------------------------------- food */
  buyFood(id, menu = "counter") {
    const list = menu === "vending" ? VENDING : FOOD;
    const f = list.find((x) => x.id === id);
    if (!f) return { ok: false, msg: "Unknown item" };
    if (this.save.points < f.cost) return { ok: false, msg: "Not enough school points." };
    if (menu === "counter" && this.player.carry && this.player.carry.food) return { ok: false, msg: "You're already carrying food — eat it first." };
    this.save.points -= f.cost;
    this.save.counters.foodBought = (this.save.counters.foodBought || 0) + 1;
    if (menu === "vending") {
      this.applyFood(f, 1);
      this.emit("eat", { name: f.name, energy: f.energy });
      return { ok: true, msg: `${f.icon} ${f.name}: +${f.energy} energy` };
    }
    this.player.carry = { food: true, ...f };
    this.emit("buy", { name: f.name });
    return { ok: true, msg: `${f.icon} ${f.name} — find a seat (F) to eat it.` };
  }
  applyFood(f, mul) {
    this.ds.energy = clamp(this.ds.energy + f.energy * mul, 0, 100);
    this.save.happy = clamp(this.save.happy + f.happy * mul, 0, 100);
    if (f.focus) this.ds.focus = { t: 1, by: f.name };
    this.ds.mealsToday++;
    // favour: snack for a friend
  }
  startEating() {
    this.player.eatT = 3.5;
    this.emit("eatStart");
  }
  finishEating(interrupted) {
    const c = this.player.carry;
    if (!c || !c.food) return;
    if (this.save.favor && this.save.favor.kind === "snack" && !this.save.favor.ready && !interrupted) {
      // keep the food for the friend instead? no — eating it is your choice; friends want a separate snack
    }
    this.applyFood(c, interrupted ? 0.5 : 1);
    this.player.carry = null;
    this.player.eatT = 0;
    this.emit("eat", { name: c.name, energy: Math.round(c.energy * (interrupted ? 0.5 : 1)) });
  }
  eatNow() {
    const c = this.player.carry;
    if (!c || !c.food) return;
    this.applyFood(c, 0.7);
    this.player.carry = null;
    this.emit("eat", { name: c.name, energy: Math.round(c.energy * 0.7), standing: true });
  }

  /* ------------------------------------------------------------- talking */
  situation() {
    const b = blockAt(this.time);
    if (b.kind === "class") {
      const c = this.ds.classes[b.slot];
      if (c && c.room && c.status !== "done" && zoneAt(this.player.x, this.player.z, this.player.y).id === c.room) return "class";
    }
    return b.kind === "lunch" ? "lunch" : b.kind === "break" ? "break" : "free";
  }
  beginTalk(n) {
    if (n.type === "student" && n.seat && this.situation() === "class") {
      // whispering in class still counts as talking — and disrupts
    }
    this.talking = n;
    n.talkLock = true;
    n.yaw = yawTo(n.x, n.z, this.player.x, this.player.z);
    this.player.yaw = yawTo(this.player.x, this.player.z, n.x, n.z);
    this.save.met[n.id] = true;
    if (n.type === "teacher") {
      this.save.counters.talkedTeacher = (this.save.counters.talkedTeacher || 0) + (n.subject ? 1 : 0);
      if (n.id === "adebayo") this.save.flags.metPrincipal = true;
    }
    if (n.type === "student" && n.id === "lily" && this.save.notebook.state === 0) {
      this.save.notebook.state = 1;
      this.spawnNotebook();
    }
    this.emit("open", { what: "talk", npc: n.id });
  }
  endTalk() {
    if (this.talking) {
      this.talking.talkLock = false;
      this.talking = null;
    }
  }
  /** Dialogue options for an NPC (students get the full set; staff a short one). */
  talkOptions(n) {
    if (n.type === "student") {
      const opts = [
        { id: "greet", label: "Greet", icon: "👋" },
        { id: "school", label: "Ask about school", icon: "🏫" },
        { id: "class", label: "Discuss class", icon: "📚" },
        { id: "help", label: this.save.favor && this.save.favor.npc === n.id && this.favorReady() ? "Deliver favour" : "Offer help", icon: "🤝" },
        { id: "invite", label: n.follow ? "Stop following me" : "Invite to activity", icon: "🎯" },
      ];
      if (n.id === "lily" && this.player.carry && this.player.carry.item === "notebook") opts.unshift({ id: "notebook", label: "Give back the notebook", icon: "📓" });
      opts.push({ id: "end", label: "End conversation", icon: "✖" });
      return opts;
    }
    if (n.type === "teacher") {
      const opts = [{ id: "greet", label: "Greet", icon: "👋" }];
      if (n.subject && n.subject !== "pe") opts.push({ id: "homework", label: "Ask about homework", icon: "📝" }, { id: "tip", label: "Ask for a study tip", icon: "💡" });
      if (n.id === "adebayo") opts.push({ id: "progress", label: "Report on my progress", icon: "📈" });
      if (n.subject === "pe") opts.push({ id: "tip", label: "Ask for training tips", icon: "💡" });
      opts.push({ id: "end", label: "End conversation", icon: "✖" });
      return opts;
    }
    const opts = [{ id: "greet", label: "Greet", icon: "👋" }, { id: "ask", label: n.id === "kim" ? "Ask for directions" : n.id === "bruno" ? "What's good today?" : n.id === "novak" ? "Recommend a book" : "Ask for a check-up", icon: "❓" }, { id: "end", label: "End conversation", icon: "✖" }];
    return opts;
  }
  /** Apply a dialogue choice; returns { text, friend, rep, mood, end }. */
  talk(n, opt) {
    const S = this.save;
    const D = this.ds;
    const you = S.look.name;
    const counts = (D.talked[n.id] = D.talked[n.id] || { total: 0 });
    const out = { text: "", friend: 0, rep: 0, mood: "neutral", end: opt === "end" };
    if (n.type === "student") {
      if (opt === "notebook") {
        S.notebook.state = 3;
        this.player.carry = null;
        S.flags.notebookReturned = true;
        out.text = `My notebook! ${you}, you saved my life — all my history notes are in here. Thank you!`;
        this.changeFriend(n, 15);
        this.changeRep(3);
        out.friend = 15;
        out.mood = "love";
        n.mood = "love";
        n.moodT = 3;
        return out;
      }
      if (opt === "invite" && n.follow) {
        this.stopFollow(n, "asked");
        out.text = "Okay! See you later.";
        return out;
      }
      const favor = S.favor && S.favor.npc === n.id ? { ...S.favor, ready: this.favorReady(), thanks: FAVORS.find((f) => f.kind === S.favor.kind)?.thanks || "Thanks!" } : null;
      const r = respond({
        opt, npc: n, friend: S.friends[n.id], rep: S.rep, youName: you, rng: this.rng, situation: this.situation(),
        counts, total: counts.total, needsHelp: D.needHelp.includes(n.id) && !D.helpedToday[n.id], lastClass: this.lastClassResult(), favor,
      });
      if (opt !== "end") {
        counts[opt] = (counts[opt] || 0) + 1;
        counts.total++;
      }
      out.text = r.text;
      out.mood = r.mood;
      n.mood = r.mood;
      n.moodT = 2.5;
      if (r.friend) out.friend = this.changeFriend(n, r.friend);
      if (r.rep) this.changeRep(r.rep);
      out.rep = r.rep;
      if (r.happy) S.happy = clamp(S.happy + r.happy, 0, 100);
      if (r.effect === "disrupt") {
        const cls = this.currentClass();
        const t = cls && this.teacherFor(cls.subject);
        if (t) this.warn(t, "disrupt", 0);
      }
      if (r.effect === "helped") {
        D.helpedToday[n.id] = true;
        S.counters.helped = (S.counters.helped || 0) + 1;
        this.addXP(XP.help, "Helped a classmate");
      }
      if (r.effect === "favorDone") {
        if (S.favor.kind === "snack") this.player.carry = null;
        S.counters.favors = (S.counters.favors || 0) + 1;
        S.counters.helped = (S.counters.helped || 0) + 1;
        S.favor = null;
        this.addXP(XP.favor, "Favour for a friend");
        S.points += 8;
      }
      if (r.effect === "follow") this.startFollow(n);
      // friends sometimes ask for a favour
      if (opt === "greet" && !S.favor && S.friends[n.id] >= FRIEND_AT && this.rng() < 0.45) {
        const f = pick(this.rng, FAVORS);
        S.favor = { npc: n.id, kind: f.kind, day: S.day, base: f.kind === "baskets" ? 0 : f.kind === "study" ? D.studySessions : 0, done: false };
        out.text += `  ${f.ask}`;
        this.emit("favor", { npc: n.id, text: `${n.name.split(" ")[0]} asked you a favour.` });
      }
      return out;
    }
    if (n.type === "teacher") {
      const first = !counts[opt];
      counts[opt] = (counts[opt] || 0) + 1;
      if (opt === "greet") out.text = pick(this.rng, TEACHER_LINES.greet).replace(/\{you\}/g, you) + (first && S.rep >= 60 ? " Your teachers speak well of you." : "");
      else if (opt === "homework") {
        const hw = S.homework.filter((h) => h.subject === n.subject && h.status === "open");
        out.text = hw.length ? `You have ${hw.length} ${SUBJECTS[n.subject].name} assignment${hw.length > 1 ? "s" : ""}: “${hw[0].desc}”, due day ${hw[0].due}. Do it at a library table or a study station.` : `No open ${SUBJECTS[n.subject].name} homework right now. Keep it up!`;
      } else if (opt === "tip") {
        if (D.tips[n.subject]) out.text = "I already gave you my best tip today — now go practise!";
        else {
          D.tips[n.subject] = true;
          out.text = n.subject === "pe" ? "Cut the corners close and save your sprint for the straights. (+5 on your next PE run)" : `Review your notes before class — it really helps. (+5 bonus on your next ${SUBJECTS[n.subject].name} activity)`;
          this.addXP(3, "Study tip");
        }
      } else if (opt === "progress") {
        const ac = this.academics();
        if (first) this.changeRep(1);
        out.text = ac == null ? "Attend your classes and the grades will come. My door is always open." : ac >= 85 && this.attendancePct() >= 90 ? `An average of ${Math.round(ac)} and great attendance — you're on track for the Honor Roll!` : `Your average is ${Math.round(ac)} and attendance ${Math.round(this.attendancePct())}%. Aim for 85 and 90% to become an Honor Student.`;
      } else out.text = "Have a good day.";
      return out;
    }
    // staff
    if (opt === "greet") out.text = n.id === "kim" ? `Welcome to Maplewood High, ${you}!` : n.id === "bruno" ? "Hungry? The counter's right here!" : n.id === "novak" ? "Welcome to the library. Please keep your voice down." : "Hello! Feeling alright?";
    else if (opt === "ask") {
      if (n.id === "kim") {
        const nx = this.nextClass();
        out.text = nx && nx.cls.room ? `Your next class is ${subjectInfo(nx.cls.subject).name} in ${roomById(nx.cls.room).name}. ${roomById(nx.cls.room).f === 1 ? "That's upstairs — take the stairs at either end of the hallway." : "It's on this floor, along the main hallway."}` : "Classes are done for now. The courtyard is lovely this time of day!";
      } else if (n.id === "bruno") out.text = "The Lunch Combo gives the most energy. Cookies make you happy — I won't tell!";
      else if (n.id === "novak") {
        if (!D.tips.book) {
          D.tips.book = true;
          out.text = "Try “A Short History of Nearly Everything”. Reading boosts your next study session!";
          this.addXP(3, "Library");
        } else out.text = "Enjoy your book!";
      } else {
        if (!D.tips.nurse) {
          D.tips.nurse = true;
          D.energy = Math.min(100, D.energy + 10);
          out.text = "You look a little tired. Drink some water — and here, have a granola bar. (+10 energy)";
        } else out.text = "You're fine! Remember to eat lunch.";
      }
    } else out.text = "Bye!";
    return out;
  }
  favorReady() {
    const F = this.save.favor;
    if (!F) return false;
    if (F.kind === "snack") return !!(this.player.carry && this.player.carry.food);
    if (F.kind === "baskets") return !!F.done;
    if (F.kind === "study") return this.ds.studySessions > (F.base || 0);
    return false;
  }
  lastClassResult() {
    const done = this.ds.classes.filter((c) => c.score != null && c.subject !== "activities");
    return done.length ? { subject: done[done.length - 1].subject === "exam" ? "math" : done[done.length - 1].subject, score: done[done.length - 1].score } : null;
  }
  changeFriend(n, d) {
    const S = this.save;
    const before = S.friends[n.id];
    let delta = d;
    if (d > 0 && S.rep >= 70) delta = Math.round(d * 1.15);
    S.friends[n.id] = clamp(before + delta, 0, 100);
    if (before < FRIEND_AT && S.friends[n.id] >= FRIEND_AT) {
      this.addXP(XP.friendMade, `New friend: ${n.name}`);
      S.happy = clamp(S.happy + 6, 0, 100);
      this.emit("friendMade", { npc: n.id, name: n.name });
    }
    return S.friends[n.id] - before;
  }
  changeRep(d) {
    const S = this.save;
    const k = d > 0 && S.happy < 30 ? 0.5 : 1;
    S.rep = clamp(S.rep + d * k, 0, 100);
    if (d) this.emit("rep", { d });
  }
  friendsCount() {
    return STUDENTS.filter((s) => this.save.friends[s.id] >= FRIEND_AT).length;
  }
  startFollow(n) {
    n.follow = true;
    n.followUntil = this.time + 120;
    n.planKey = "";
    this.emit("toast", { text: `${n.name.split(" ")[0]} is joining you!`, kind: "good" });
  }
  stopFollow(n, why) {
    if (!n.follow) return;
    n.follow = false;
    n.planKey = "";
    if (why === "class") this.emit("toast", { text: `${n.name.split(" ")[0]} heads to class.`, kind: "info" });
  }
  followers() {
    return this.npcs.filter((n) => n.follow && !n.hidden);
  }

  /* ------------------------------------------------------------- notebook quest */
  spawnNotebook() {
    const S = this.save;
    if (!S.notebook.spot || !NOTEBOOK_SPOTS.includes(S.notebook.spot)) S.notebook.spot = NOTEBOOK_SPOTS[Math.floor(this.rng() * NOTEBOOK_SPOTS.length)];
    const sp = this.L.spots[S.notebook.spot];
    this.notebookItem = { x: sp.x, z: sp.z, y: sp.y, taken: false, spot: S.notebook.spot };
    this.emit("quest", { text: "Lily lost her notebook somewhere around school. Look for it (marked on the map)!" });
  }

  /* ------------------------------------------------------------- classes */
  teacherFor(subject) {
    if (subject === "exam") return this.npcById.get("adebayo");
    const s = SUBJECTS[subject];
    return s ? this.npcById.get(s.teacher) : null;
  }
  teacherInRoom(t, room) {
    if (!t || t.hidden) return false;
    const z = zoneAt(t.x, t.z, t.y);
    return z.id === room;
  }
  playerInClass(cls) {
    const p = this.player;
    if (!cls.room) return false;
    if (cls.subject === "pe") return zoneAt(p.x, p.z, p.y).id === "gym" || (this.activity && this.activity.kind === "pe");
    if (!p.seat) return false;
    return this.seatById.get(p.seat)?.room === cls.room;
  }
  onPlayerSeated(s) {
    const b = blockAt(this.time);
    const cls = b.kind === "class" ? this.ds.classes[b.slot] : null;
    if (cls && cls.room === s.room) this.markArrival(cls, b);
  }
  markArrival(cls, b) {
    if (cls.arrived != null || cls.status === "absent" || cls.status === "done" || cls.status === "skipped") return;
    cls.arrived = this.time;
    const S = this.save;
    const t = this.teacherFor(cls.subject);
    const grace = ON_TIME_GRACE + (S.rep >= 75 ? 2 : 0);
    if (this.time <= b.start + grace) {
      cls.status = "ontime";
      this.att("onTime");
      S.counters.onTime = (S.counters.onTime || 0) + 1;
      this.addXP(XP.onTime, null);
      this.changeRep(0.5);
    } else {
      cls.status = "late";
      cls.late = true;
      this.att("late");
      this.ds.lates++;
      this.changeRep(this.ds.lates >= 3 ? -3 : -1);
      if (t) this.say(t, pick(this.rng, TEACHER_LINES.late), "teacher");
      this.emit("late", { subject: cls.subject, by: Math.round(this.time - b.start) });
      if (this.ds.lates === 3) this.emit("warning", { text: "Late three times today — your reputation is suffering.", teacher: t?.name });
    }
  }
  /** Attendance / lesson triggers for the running class. */
  updateClass(dt) {
    const D = this.ds;
    if (D.teacherQ) {
      D.teacherQ.t -= dt;
      if (D.teacherQ.t <= 0) D.teacherQ = null;
    }
    const b = blockAt(this.time);
    // a seat taken during passing time counts for the coming class
    if (b.kind === "pass") {
      const nb = BLOCKS[BLOCKS.indexOf(b) + 1];
      const c = nb && D.classes[nb.slot];
      if (c && c.status === "upcoming" && this.playerInClass(c)) {
        c.preSeated = true;
      }
      return;
    }
    if (b.kind !== "class") return;
    const cls = D.classes[b.slot];
    if (!cls || cls.subject === "activities") return;
    if (cls.status === "upcoming") cls.status = "open";
    const present = this.playerInClass(cls);
    if (present && cls.arrived == null && cls.status === "open") this.markArrival(cls, b);
    if (cls.status === "open" && this.time > b.start + LATE_LIMIT) this.markAbsent(cls, "absent");
    const teacher = this.teacherFor(cls.subject);
    // recovery: a teacher stuck somewhere is moved into the room
    if (teacher && this.time > b.start + ACTIVITY_AT + 2 && !this.teacherInRoom(teacher, cls.room) && cls.status !== "done") {
      const tp = this.teacherPost(teacher, cls);
      if (tp) {
        Object.assign(teacher, { x: tp.x, z: tp.z, y: tp.y, path: [], stairLock: false });
        teacher.arrived = true;
      }
    }
    if (!(cls.status === "ontime" || cls.status === "late")) return;
    if (this.lessonOpen != null || this.activity) return;
    if (!present) return;
    if (!this.teacherInRoom(teacher, cls.room)) return;
    // teacher asks the class a question while you wait
    if (!cls.asked && this.time > b.start + 3 && this.time < b.start + ACTIVITY_AT - 1 && cls.subject !== "pe" && cls.subject !== "exam") {
      cls.asked = true;
      D.teacherQ = { t: 6, subject: cls.subject };
      this.say(teacher, pick(this.rng, TEACHER_LINES.question), "teacher");
      this.emit("teacherQ");
    }
    if (this.time >= b.start + ACTIVITY_AT || cls.arrived >= b.start + ACTIVITY_AT) {
      this.lessonOpen = b.slot;
      this.say(teacher, pick(this.rng, TEACHER_LINES.activity), "teacher");
      if (cls.subject === "pe") this.startActivity("pe");
      else this.emit("open", { what: cls.subject === "exam" ? "exam" : "lesson", slot: b.slot, subject: cls.subject, subjects: cls.subject === "exam" ? examSubjects(this.save.day) : null });
    }
  }
  raiseHand() {
    const D = this.ds;
    if (!D.teacherQ || D.teacherQ.t <= 0) return;
    D.teacherQ = null;
    const cls = this.currentClass();
    if (!cls) return;
    cls.participation = true;
    this.player.anim.wave = 1.6;
    this.changeRep(1);
    this.addXP(3, "Participation");
    const t = this.teacherFor(cls.subject);
    if (t) this.say(t, `Yes, ${this.save.look.name}? …Correct! Well done.`, "teacher");
    this.emit("participate");
  }
  markAbsent(cls, kind) {
    const S = this.save;
    cls.status = kind;
    this.att("total");
    this.att("absent");
    this.changeRep(kind === "absent" ? -4 : -3);
    S.happy = clamp(S.happy - 3, 0, 100);
    if (cls.subject !== "exam" && SUBJECTS[cls.subject]) this.addMark(cls.subject, "absent", 35, `d${S.day}s${cls.slot}`);
    else if (cls.subject === "exam") examSubjects(S.day).forEach((s) => this.addMark(s, "exam", 30, `d${S.day}exam`));
    const t = this.teacherFor(cls.subject);
    this.emit("warning", { text: `${kind === "absent" ? "Absent" : "Left early"}: ${subjectInfo(cls.subject).name}. ${t ? t.name : "The teacher"} noted it — a make-up assignment was added.`, teacher: t?.name });
    if (SUBJECTS[cls.subject] && cls.subject !== "pe") this.addHomework(cls.subject, true);
  }
  closeClass(block) {
    const cls = this.ds.classes[block.slot];
    if (!cls) return;
    if (this.lessonOpen === block.slot && cls.status !== "done") {
      // overlay still open when the bell rang — let it finish (finishLesson accepts late results)
      return;
    }
    if (cls.subject === "activities") {
      cls.status = "done";
      return;
    }
    if (cls.status === "open" || cls.status === "upcoming") this.markAbsent(cls, "absent");
    else if (cls.status === "ontime" || cls.status === "late") this.markAbsent(cls, "skipped");
    if (this.activity && this.activity.kind === "pe") this.endActivity(true);
  }
  /** Called by the lesson overlay with { score 0-100, correct, total }. */
  finishLesson(slot, res) {
    const S = this.save;
    const cls = this.ds.classes[slot];
    this.lessonOpen = null;
    if (!cls || cls.status === "done") return null;
    let score = clamp(Math.round(res.score), 0, 100);
    if (cls.participation) score = Math.min(100, score + 4);
    if (this.ds.tips[cls.subject] === true) {
      score = Math.min(100, score + 5);
      this.ds.tips[cls.subject] = "used";
    }
    cls.score = score;
    cls.grade = letter(score);
    cls.status = "done";
    this.att("attended");
    this.att("total");
    S.counters.lessons = (S.counters.lessons || 0) + 1;
    this.addMark(cls.subject, "lesson", score, `d${S.day}s${slot}`);
    this.addXP(Math.round(XP.lessonBase + score * XP.lessonPerPoint), `${SUBJECTS[cls.subject].name} lesson`);
    S.points += 4 + Math.round(score / 20);
    this.ds.energy = Math.max(0, this.ds.energy - 5);
    if (score >= 90) S.flags.gotA = true;
    if (cls.subject === "math" && score >= 70) S.flags.mathPass = true;
    if (cls.subject === "cs" && score >= 60) S.flags.csPass = true;
    if (cls.subject === "pe") {
      S.counters.sportsDone = (S.counters.sportsDone || 0) + 1;
      if (score >= 70) S.counters.sportWins = (S.counters.sportWins || 0) + 1;
    }
    this.changeRep(score >= 60 ? 1.5 : -0.5);
    S.happy = clamp(S.happy + (score >= 80 ? 4 : score < 50 ? -3 : 1), 0, 100);
    const t = this.teacherFor(cls.subject);
    const fb = pick(this.rng, FEEDBACK[cls.grade]);
    if (t) this.say(t, fb, "teacher");
    let hw = null;
    if (cls.subject !== "pe") hw = this.addHomework(cls.subject, false);
    this.ds.focus = null;
    this.emit("grade", { subject: cls.subject, score, grade: cls.grade, feedback: fb, teacher: t?.name, homework: hw });
    return { score, grade: cls.grade, feedback: fb, homework: hw };
  }
  finishExam(res) {
    const S = this.save;
    const slot = this.ds.classes.findIndex((c) => c.subject === "exam");
    const cls = this.ds.classes[slot];
    this.lessonOpen = null;
    if (!cls || cls.status === "done") return null;
    const score = clamp(Math.round(res.score), 0, 100);
    cls.score = score;
    cls.grade = letter(score);
    cls.status = "done";
    this.att("attended");
    this.att("total");
    // each covered subject gets an exam mark from its own questions
    for (const [subj, r] of Object.entries(res.bySubject || {})) {
      const sc = r.total ? Math.round((r.correct / r.total) * 100) : score;
      this.addMark(subj, "exam", sc, `d${S.day}exam`);
      if (subj === "math" && sc >= 70) S.flags.mathPass = true;
    }
    S.exams.push({ day: S.day, score, grade: cls.grade, correct: res.correct, total: res.total });
    if (score >= 90) S.flags.gotA = true;
    S.counters.exams = (S.counters.exams || 0) + 1;
    this.addXP(Math.round(XP.examBase + score * XP.examPerPoint), "Exam");
    S.points += 8 + Math.round(score / 10);
    this.changeRep(score >= 70 ? 3 : score < 50 ? -2 : 0);
    S.happy = clamp(S.happy + (score >= 80 ? 6 : score < 50 ? -5 : 0), 0, 100);
    this.ds.energy = Math.max(0, this.ds.energy - 8);
    const fb = pick(this.rng, FEEDBACK[cls.grade]);
    const t = this.teacherFor("exam");
    if (t) this.say(t, fb, "teacher");
    this.emit("grade", { subject: "exam", score, grade: cls.grade, feedback: fb, teacher: t?.name });
    return { score, grade: cls.grade, feedback: fb };
  }
  focusMul() {
    let m = 1;
    if (this.ds.energy < 25) m *= 0.8;
    if (this.ds.focus) m *= 1.15;
    if (this.save.happy >= 75) m *= 1.05;
    return m;
  }
  /** Friends who can whisper a hint in the current lesson (friendship ≥ 60, in the same room). */
  lessonHelpers() {
    const cls = this.currentClass();
    if (!cls || !cls.room) return [];
    return this.npcs.filter((n) => n.type === "student" && this.save.friends[n.id] >= 60 && n.seat && this.seatById.get(n.seat)?.room === cls.room).map((n) => n.name.split(" ")[0]);
  }

  /* ------------------------------------------------------------- grades */
  addMark(subject, kind, score, key) {
    const list = this.save.grades[subject];
    if (!list) return;
    const i = key ? list.findIndex((m) => m.key === key && m.kind === kind) : -1;
    const m = { key: key || "", kind, score: clamp(score, 0, 100), day: this.save.day };
    if (i >= 0) list[i] = m;
    else list.push(m);
    if (list.length > 80) list.shift();
  }
  subjectAverage(subject) {
    const list = this.save.grades[subject] || [];
    let w = 0;
    let s = 0;
    for (const m of list) {
      const k = GRADE_WEIGHT[m.kind] ?? 1;
      w += k;
      s += m.score * k;
    }
    return w ? s / w : null;
  }
  academics() {
    const avgs = ACADEMIC.concat(["pe"]).map((s) => this.subjectAverage(s)).filter((v) => v != null);
    return avgs.length ? avgs.reduce((a, b) => a + b, 0) / avgs.length : null;
  }
  markCount() {
    return Object.values(this.save.grades).reduce((n, l) => n + l.length, 0);
  }
  attendancePct() {
    const A = this.save.att;
    return A.total ? (A.attended / A.total) * 100 : 100;
  }

  /* ------------------------------------------------------------- homework */
  addHomework(subject, makeup) {
    const S = this.save;
    const open = S.homework.filter((h) => h.status === "open");
    if (open.length >= 6) return null;
    const txt = makeup ? `Make-up assignment: ${SUBJECTS[subject].name} review` : pick(this.rng, HOMEWORK_TEXT[subject]);
    const due = S.day + (isExamDay(S.day + 1) ? 1 : 2) - (makeup ? 0 : 0);
    const hw = { id: `hw${S.day}_${subject}_${Math.floor(this.rng() * 1e6)}`, subject, desc: txt, assigned: S.day, due, xp: makeup ? 15 : XP.homework, pts: makeup ? 4 : 6, status: "open", score: null, makeup: !!makeup };
    S.homework.push(hw);
    if (S.homework.length > 40) S.homework.splice(0, S.homework.length - 40);
    this.ds.homeworkToday++;
    this.emit("homework", { hw });
    return hw;
  }
  openHomework() {
    return this.save.homework.filter((h) => h.status === "open");
  }
  finishHomework(id, res) {
    const S = this.save;
    const hw = S.homework.find((h) => h.id === id);
    if (!hw || hw.status !== "open") return null;
    const score = clamp(Math.round(res.score), 0, 100);
    hw.status = "done";
    hw.score = score;
    hw.doneDay = S.day;
    this.addMark(hw.subject, "homework", score, hw.id);
    S.counters.homework = (S.counters.homework || 0) + 1;
    this.ds.studySessions++;
    this.addXP(Math.round(hw.xp * (0.6 + score / 250)), `Homework: ${SUBJECTS[hw.subject].name}`);
    S.points += hw.pts;
    this.changeRep(1);
    this.ds.energy = Math.max(0, this.ds.energy - 3);
    if (score >= 90) S.flags.gotA = true;
    if (hw.subject === "math" && score >= 70) S.flags.mathPass = true;
    this.emit("homeworkDone", { hw, score });
    return { score, grade: letter(score) };
  }
  finishStudy(subject, res) {
    const S = this.save;
    const score = clamp(Math.round(res.score), 0, 100);
    this.addMark(subject, "study", score, `d${S.day}study${this.ds.studySessions}`);
    this.ds.studySessions++;
    S.counters.study = (S.counters.study || 0) + 1;
    if (!this.ds.tips[subject]) this.ds.tips[subject] = true;
    this.addXP(XP.study + (this.ds.tips.book === true ? 4 : 0), "Study session");
    S.happy = clamp(S.happy + 1, 0, 100);
    this.ds.energy = Math.max(0, this.ds.energy - 3);
    this.emit("studyDone", { subject, score });
    return { score };
  }
  finishComputer(res) {
    const S = this.save;
    const score = clamp(Math.round(res.score), 0, 100);
    S.counters.computer = (S.counters.computer || 0) + 1;
    if (score >= 60) S.flags.csPass = true;
    this.addMark("cs", "study", score, `d${S.day}comp${S.counters.computer}`);
    this.addXP(Math.round(10 + score * 0.2), "Coding challenge");
    S.points += Math.round(score / 15);
    this.ds.energy = Math.max(0, this.ds.energy - 3);
    this.emit("computerDone", { score });
    return { score };
  }
  /** Missed deadlines at the start of a day. */
  checkDeadlines() {
    const S = this.save;
    let missed = 0;
    for (const h of S.homework) {
      if (h.status === "open" && h.due < S.day) {
        h.status = "missed";
        this.addMark(h.subject, "homework", 25, h.id);
        missed++;
      }
    }
    if (missed) {
      this.changeRep(-2 * missed);
      this.emit("warning", { text: `${missed} homework assignment${missed > 1 ? "s" : ""} missed the deadline — marked F.` });
    }
  }

  /* ------------------------------------------------------------- XP */
  addXP(n, why) {
    const S = this.save;
    let k = 1;
    if (S.happy >= 70) k = 1.15;
    else if (S.happy < 30) k = 0.85;
    const v = Math.max(1, Math.round(n * k));
    S.totalXp += v;
    if (S.level >= MAX_LEVEL) {
      if (why) this.emit("xp", { n: v, why });
      return;
    }
    S.xp += v;
    if (why) this.emit("xp", { n: v, why });
    while (S.level < MAX_LEVEL && S.xp >= xpToNext(S.level)) {
      S.xp -= xpToNext(S.level);
      S.level++;
      this.emit("levelUp", { level: S.level, unlocks: LEVEL_UNLOCKS[S.level] || [] });
    }
    if (S.level >= MAX_LEVEL) S.xp = 0;
  }

  /* ------------------------------------------------------------- missions */
  missionDone(id) {
    return this.save.missions[id] != null;
  }
  missionCheck(id) {
    const S = this.save;
    const C = S.counters;
    const F = S.flags;
    switch (id) {
      case "welcome": return !!F.enteredBuilding;
      case "classroom": return !!F.foundClassroom;
      case "teacher": return (C.talkedTeacher || 0) >= 1;
      case "lesson": return (C.lessons || 0) >= 1;
      case "friend": return this.friendsCount() >= 1;
      case "library": return !!F.library;
      case "homework": return (C.homework || 0) >= 1;
      case "cafeteria": return (C.foodBought || 0) >= 1;
      case "basketball": return (C.baskets || 0) >= 1;
      case "help": return (C.helped || 0) >= 1;
      case "ontime": return (C.onTime || 0) >= 3;
      case "mathtest": return !!F.mathPass;
      case "lab": return !!F.labVisited && !!F.microscope;
      case "sport": return (C.sportsDone || 0) >= 1;
      case "principal": return !!F.metPrincipal;
      case "notebook": return !!F.notebookReturned;
      case "grades": return this.markCount() >= 4 && (this.academics() ?? 0) >= 75;
      case "friends3": return this.friendsCount() >= 3;
      case "computer": return !!F.csPass;
      case "fullday": return (C.daysCompleted || 0) >= 1;
      case "excellent": return !!F.gotA;
      case "assign5": return (C.homework || 0) >= 5;
      case "sportwin": return (C.sportWins || 0) >= 1;
      case "reputation": return S.rep >= 80;
      case "honor": return S.level >= 8 && (this.academics() ?? 0) >= 85 && this.attendancePct() >= 90 && S.att.total >= 8;
      case "marathon": return this.ds.studySessions >= 3;
      case "captain": return (C.teamWins || 0) >= 3;
      case "butterfly": return this.friendsCount() >= 6;
      default: return false;
    }
  }
  /** Progress [have, need] for the journal. */
  missionProgress(id) {
    const S = this.save;
    const C = S.counters;
    switch (id) {
      case "ontime": return [Math.min(3, C.onTime || 0), 3];
      case "friend": return [Math.min(FRIEND_AT, Math.max(...STUDENTS.map((s) => S.friends[s.id]))), FRIEND_AT];
      case "friends3": return [Math.min(3, this.friendsCount()), 3];
      case "assign5": return [Math.min(5, C.homework || 0), 5];
      case "reputation": return [Math.min(80, Math.round(S.rep)), 80];
      case "grades": return [Math.min(75, Math.round(this.academics() ?? 0)), 75];
      case "marathon": return [Math.min(3, this.ds.studySessions), 3];
      case "captain": return [Math.min(3, C.teamWins || 0), 3];
      case "butterfly": return [Math.min(6, this.friendsCount()), 6];
      case "honor": return [Math.min(8, S.level), 8];
      case "lab": return [(S.flags.labVisited ? 1 : 0) + (S.flags.microscope ? 1 : 0), 2];
      case "notebook": return [S.notebook.state >= 3 ? 3 : S.notebook.state, 3];
      default: return [this.missionDone(id) ? 1 : 0, 1];
    }
  }
  checkMissions() {
    const S = this.save;
    for (const m of MISSIONS) {
      if (S.missions[m.id] != null) continue;
      if (m.level && S.level < m.level) continue;
      if (!this.missionCheck(m.id)) continue;
      S.missions[m.id] = S.day;
      this.ds.missionsToday.push(m.id);
      S.points += m.pts;
      this.emit("mission", { id: m.id, title: m.title, xp: m.xp, pts: m.pts });
      this.addXP(m.xp, null);
    }
  }
  /** The HUD objective: the schedule first (when a class needs you), then the next mission. */
  objective() {
    const b = blockAt(this.time);
    const p = this.player;
    if (this.dayOver) return { title: "Day complete", desc: "Review your daily report.", kind: "day" };
    if (this.activity) return { title: this.activity.title, desc: this.activity.desc || "", kind: "activity" };
    if (b.kind === "after") return { title: "School's out!", desc: "Walk out through the main gate to finish the day.", kind: "schedule", target: this.L.spots.gate };
    const nx = this.nextClass();
    if (nx && nx.cls.subject !== "activities") {
      const c = nx.cls;
      const blk = nx.block;
      const soon = blk.start - this.time <= 12 || b.kind === "pass" || b.kind === "class";
      if (soon && c.status !== "done" && c.status !== "absent" && c.status !== "skipped") {
        const r = roomById(c.room);
        const here = this.playerInClass(c);
        const info = subjectInfo(c.subject);
        if (!here)
          return {
            title: `${info.name} — ${r.short}`,
            desc: c.subject === "pe" ? `Go to the Gymnasium (east end of the main hallway) before ${fmtTime(blk.start + ON_TIME_GRACE)}.` : `Go to ${r.name}${r.f === 1 ? " (first floor — take the stairs)" : ""} and sit at a free glowing desk (F) before ${fmtTime(blk.start + ON_TIME_GRACE)}.`,
            kind: "schedule",
            room: c.room,
            target: this.L.entries[c.room]?.inside,
          };
        return { title: `${info.name} — in class`, desc: c.subject === "pe" ? "Stay in the gym — Coach Harris starts the course soon." : "Stay seated. The lesson activity starts soon.", kind: "schedule", room: c.room };
      }
    }
    if (b.kind === "class" && this.ds.classes[b.slot].subject === "activities") return { title: "Activities", desc: "Shoot hoops on the court, take penalties on the field, race the track or study in the library.", kind: "schedule", target: this.L.spots.court };
    for (const m of MISSIONS) {
      if (this.missionDone(m.id) || (m.level && this.save.level < m.level)) continue;
      const room = m.room === "@next" ? nx?.cls.room : m.room;
      let target = room ? this.L.entries[room]?.inside || this.L.spots[room] : null;
      if (m.id === "notebook") {
        if (this.save.notebook.state === 1 && this.notebookItem) target = this.notebookItem;
        else {
          const lily = this.npcById.get("lily");
          target = lily && !lily.hidden ? lily : null;
        }
      }
      if (m.id === "principal") target = this.npcById.get("adebayo");
      if (m.id === "teacher") {
        const t = this.npcs.filter((n) => n.type === "teacher" && n.subject && !n.hidden).sort((a, c) => dist2(a, p) - dist2(c, p))[0];
        target = t || null;
      }
      return { title: m.title, desc: m.desc, kind: "mission", id: m.id, room, target: target ? { x: target.x, z: target.z, y: target.y } : null };
    }
    return { title: "Enjoy school life!", desc: "Keep your grades up, make friends and try every activity.", kind: "free" };
  }

  /* ------------------------------------------------------------- stats */
  updateStats(dt) {
    const S = this.save;
    // happiness drifts toward 55 (+ friends lift it a little)
    const target = 55 + Math.min(15, this.friendsCount() * 3);
    S.happy += (target - S.happy) * Math.min(1, dt * 0.004);
    // favour: baskets
    if (S.favor && S.favor.kind === "baskets" && !S.favor.done && this.lastShootout && this.lastShootout.made >= 6 && this.lastShootout.day === S.day) S.favor.done = true;
  }

  /* ------------------------------------------------------------- speech */
  say(n, text, kind = "npc", dur = 3.6) {
    n.bubble = text.replace(/\{you\}/g, this.save.look.name);
    n.bubbleT = dur;
    n.bubbleKind = kind;
    this.emit("say", { npc: n.id, name: n.name, text: n.bubble, kind });
  }
  warn(t, kind, repLoss) {
    const D = this.ds;
    D.warnings++;
    this.say(t, pick(this.rng, TEACHER_LINES[kind]), "teacher");
    this.changeRep(-(repLoss + 1));
    this.emit("warning", { text: `${t.name}: ${t.bubble}`, teacher: t.name });
    if (D.warnings === 3) {
      // an extra task instead of harsher punishment
      const subj = (this.currentClass() && SUBJECTS[this.currentClass().subject] && this.currentClass().subject !== "pe") ? this.currentClass().subject : "english";
      const hw = this.addHomework(subj, true);
      if (hw) hw.desc = "Extra task: reflection essay on classroom behaviour";
      this.emit("warning", { text: "Three warnings today — you've been given an extra task (see Journal)." });
    }
  }

  /* ===================================================================== NPC AI */
  planFor(n) {
    const b = blockAt(this.time);
    const day = this.save.day;
    const rng = mulberry(day * 1000 + n.idx * 31 + BLOCKS.indexOf(b) * 7 + (n.type === "teacher" ? 500 : 0));
    if (n.type === "staff") return { key: `staff`, goal: { kind: "spot", spot: this.L.spots[STAFF.find((s) => s.id === n.id).spot], pose: n.id === "kim" || n.id === "novak" ? "type" : "idle" } };
    if (n.type === "teacher") return this.planTeacher(n, b, rng);
    if (n.follow && b.kind !== "after") {
      const c = b.kind === "class" ? this.ds.classes[b.slot] : null;
      if (!c || c.subject === "activities") return { key: "follow", goal: { kind: "follow" } };
    }
    return this.planStudent(n, b, rng);
  }
  nextClassBlock(b) {
    const i = BLOCKS.indexOf(b);
    for (let k = i + 1; k < BLOCKS.length; k++) if (BLOCKS[k].kind === "class") return BLOCKS[k];
    return null;
  }
  classGoal(n, c, slot) {
    if (!c || c.subject === "activities") return null;
    if (c.subject === "pe") {
      const k = STUDENTS.findIndex((s) => s.id === n.id);
      return { key: `pe${slot}`, goal: { kind: "spot", spot: this.L.spots[`pe${k}`], pose: "idle", hurry: true } };
    }
    const seat = this.classSeat[c.room]?.[n.id];
    return { key: `class${slot}`, goal: { kind: "seat", seat, hurry: true, pose: "sitClass" } };
  }
  planStudent(n, b, rng) {
    const P = PERSONALITIES[n.pers];
    if (b.kind === "after") return { key: "leave", goal: { kind: "leave" } };
    if (b.kind === "class") {
      const c = this.ds.classes[b.slot];
      if (c.subject === "activities") return { key: `act${b.slot}`, goal: this.socialGoal(n, P.activity === "study" ? "library" : P.activity === "computer" ? "computer" : P.activity === "football" ? "field" : "court", rng) };
      return this.classGoal(n, c, b.slot);
    }
    const nb = this.nextClassBlock(b);
    const nc = nb ? this.ds.classes[nb.slot] : null;
    const headOff = n.idx % 4; // stagger who leaves first
    // game minutes needed to walk there (hurrying ≈ 3 m/s, stairs add ~20 m)
    let travel = 6;
    const ent = nc && nc.room ? this.L.entries[nc.room] : null;
    if (ent) {
      const dd = Math.hypot(ent.inside.x - n.x, ent.inside.z - n.z) * 1.3 + (FLOOR(ent.inside.y) !== FLOOR(n.y) ? 22 : 0);
      travel = Math.max(4, dd / 3 / (DAY_SPEED[this.save.settings.dayLength] || 1.35) + 2.5);
    }
    if (nb && (b.kind === "pass" || nb.start - this.time <= travel + headOff * 0.5)) {
      const g = this.classGoal(n, nc, nb.slot);
      if (g) return g;
    }
    if (b.kind === "lunch") {
      if (this.time < b.start + 38 - (n.idx % 5)) return { key: "lunch", goal: { kind: "lunch" } };
      return { key: "lunch2", goal: this.socialGoal(n, pick(rng, P.likes), rng) };
    }
    if (b.kind === "arrival") {
      if (this.time < DAY_START + 12) return { key: "arr", goal: this.socialGoal(n, n.idx % 3 === 0 ? "lockers" : n.idx % 3 === 1 ? "lobby" : "plaza", rng) };
      return { key: "arr2", goal: this.socialGoal(n, pick(rng, ["lockers", "hall0", ...P.likes.filter((l) => l !== "court" && l !== "field")]), rng) };
    }
    if (b.kind === "break") return { key: "break", goal: this.socialGoal(n, pick(rng, P.likes), rng) };
    return { key: "idle", goal: this.socialGoal(n, "fountain", rng) };
  }
  socialGoal(n, like, rng) {
    const opts = LIKE_TO[like] || [like];
    const choice = pick(rng, opts);
    const free = (list) => {
      const fl = list.filter((s) => !s.occ);
      return fl.length ? fl[Math.floor(rng() * fl.length)] : null;
    };
    switch (choice) {
      case "cafeSeat": {
        const s = free(this.L.cafSeats);
        if (s) return { kind: "seat", seat: s, pose: "sitTalk" };
        break;
      }
      case "library": {
        const s = free(this.L.libSeats);
        if (s) return { kind: "seat", seat: s, pose: "sitRead" };
        break;
      }
      case "computer": {
        const s = free(this.L.classSeats.comp);
        if (s && !this.isClassTime("comp")) return { kind: "seat", seat: s, pose: "sitType" };
        break;
      }
      case "benchC": {
        const s = free(this.seats.filter((x) => x.room === "courtyard"));
        if (s) return { kind: "seat", seat: s, pose: "sitTalk" };
        break;
      }
      case "benchG": {
        const s = free(this.seats.filter((x) => x.room === "garden"));
        if (s) return { kind: "seat", seat: s, pose: "sitTalk" };
        break;
      }
      default:
    }
    const gid = GROUPS[choice] ? choice : "fountain";
    return { kind: "group", group: gid, pose: gid === "court" ? "shoot" : gid === "field" ? "kick" : gid === "track" ? "stretch" : "talk" };
  }
  planTeacher(t, b, rng) {
    const sched = this.ds.classes;
    const roomPost = (c) => this.teacherPost(t, c);
    if (t.id === "adebayo") {
      const ex = sched.find((c) => c.subject === "exam");
      if (ex) {
        const eb = BLOCKS.find((x) => x.slot === ex.slot);
        if ((b === eb) || (b.end === eb.start && b.kind === "pass")) return { key: `exam`, goal: { kind: "spot", spot: roomPost(ex), pose: "teach", teach: true } };
      }
      if (b.kind === "break") return { key: "patrol", goal: { kind: "patrol", pts: [{ x: -30, z: 0, y: 0 }, { x: 0, z: 0, y: 0 }, { x: 30, z: 0, y: 0 }] } };
      if (b.kind === "lunch") return { key: "lunchP", goal: { kind: "spot", spot: { x: -27, z: 8.4, y: 0, yaw: 0 }, pose: "idle" } };
      return { key: "office", goal: { kind: "spot", spot: this.L.spots.principal, pose: "type" } };
    }
    if (t.subject === "pe") {
      const c = b.kind === "class" ? sched[b.slot] : null;
      if (c && c.subject === "activities") return { key: "coachAct", goal: { kind: "spot", spot: { x: 20, z: 17.8, y: 0, yaw: 0 }, pose: "idle" } };
      return { key: "coach", goal: { kind: "spot", spot: this.L.spots.coach, pose: c && c.subject === "pe" ? "teach" : "idle", teach: !!(c && c.subject === "pe") } };
    }
    const myRoom = SUBJECTS[t.subject].room;
    const cur = b.kind === "class" ? sched[b.slot] : null;
    if (cur && cur.subject === t.subject) return { key: `teach${b.slot}`, goal: { kind: "spot", spot: roomPost(cur), pose: "teach", teach: true, hurry: true } };
    const nb = this.nextClassBlock(b);
    const nc = nb ? sched[nb.slot] : null;
    if (nc && nc.subject === t.subject && nb.start - this.time <= 14) return { key: `toClass${nb.slot}`, goal: { kind: "spot", spot: roomPost(nc), pose: "idle", hurry: true, waiting: true } };
    const patrolT = TEACHERS[(this.save.day + 1) % 5];
    if (b.kind === "break" && t.id === patrolT.id) return { key: "patrolT", goal: { kind: "patrol", pts: [{ x: -25, z: 0, y: F1 }, { x: 25, z: 0, y: F1 }] } };
    if (b.kind === "lunch" || b.kind === "after") {
      const s = this.L.loungeSeats[t.idx % this.L.loungeSeats.length];
      return { key: "lounge", goal: { kind: "seat", seat: s, pose: "sitTalk" } };
    }
    // otherwise grading at the desk in their own room
    const tp = this.L.teach[myRoom];
    return { key: "desk", goal: { kind: "spot", spot: tp ? tp.desk : this.L.spots.tloungeIn, pose: "write" } };
  }
  teacherPost(t, c) {
    if (c.subject === "pe" || t.subject === "pe") return this.L.spots.coach;
    const tp = this.L.teach[c.room];
    return tp ? tp.board : null;
  }
  /** Turn a goal into a route. `place` = put the NPC straight at the destination. */
  setGoal(n, plan, place = false) {
    n.planKey = plan.key;
    const g = plan.goal;
    // release previous seat / queue spot (leaving a seat walks the approach backwards)
    let exitPts = [];
    let from = n;
    if (n.goalSeat && n.goalSeat.occ === n.id && !n.seat) n.goalSeat.occ = null;
    if (n.seat) {
      const s = this.seatById.get(n.seat);
      if (s && s.occ === n.id) s.occ = null;
      n.seat = null;
      if (s && !place) {
        const [sx, sz] = s.stand || s.approach[s.approach.length - 1];
        n.x = sx;
        n.z = sz;
        n.y = s.y - 0.47;
        exitPts = s.approach.slice(0, -1).reverse().map(([x, z]) => ({ x, z, direct: true }));
        if (exitPts.length) from = { x: exitPts[exitPts.length - 1].x, z: exitPts[exitPts.length - 1].z, y: n.y };
      }
    }
    n.goalSeat = null;
    this.queue = this.queue.filter((id) => id !== n.id);
    n.goal = g;
    n.hurry = !!g.hurry;
    n.pose = "stand";
    n.arrived = false;
    n.tray = false;
    n.state = n.type === "teacher" ? (g.teach ? "toClass" : g.waiting ? "toClass" : g.kind === "patrol" ? "monitoring" : "toOffice") : "walking";
    let dest = null;
    let finalPts = [];
    if (g.kind === "seat") {
      let s = g.seat;
      if (!s || (s.occ && s.occ !== n.id)) s = (s && this.freeNear(s)) || null;
      if (!s) {
        n.goal = { kind: "group", group: "fountain", pose: "talk" };
        return this.setGoal(n, { key: plan.key + "x", goal: n.goal }, place);
      }
      s.occ = n.id;
      n.goalSeat = s;
      const ap = s.approach;
      dest = { x: ap[0][0], z: ap[0][1], y: s.y - 0.47 };
      finalPts = ap.slice(1).map(([x, z]) => ({ x, z, direct: true }));
      finalPts.push({ x: s.x, z: s.z, direct: true, seat: s.id });
    } else if (g.kind === "spot") {
      if (!g.spot) {
        n.goal = { kind: "group", group: "hall0", pose: "talk" };
        return this.setGoal(n, { key: plan.key + "x", goal: n.goal }, place);
      }
      dest = { x: g.spot.x, z: g.spot.z, y: g.spot.y || 0 };
    } else if (g.kind === "group") {
      const G = GROUPS[g.group];
      const members = this.npcs.filter((m) => m !== n && m.goal && m.goal.kind === "group" && m.goal.group === g.group);
      const used = new Set(members.map((m) => m.goal.slot));
      let slot = 0;
      while (used.has(slot)) slot++;
      g.slot = slot;
      const a = (slot / Math.max(G.n, slot + 1)) * TAU + (G.x * 0.1);
      const r = G.r + Math.floor(slot / G.n) * 0.9;
      dest = { x: G.x + Math.cos(a) * r, z: G.z + Math.sin(a) * r, y: G.y };
      g.face = { x: G.x, z: G.z };
      if (!this.nav.free(dest.x, dest.z, dest.y)) {
        dest.x = G.x + Math.cos(a) * (r * 0.6);
        dest.z = G.z + Math.sin(a) * (r * 0.6);
      }
    } else if (g.kind === "lunch") {
      if (!this.queue.includes(n.id)) this.queue.push(n.id);
      const qi = this.queue.indexOf(n.id);
      const qs = this.L.spots[`queue${Math.min(5, qi)}`];
      dest = { x: qs.x + (qi > 5 ? (qi - 5) * 0.2 : 0), z: qs.z + (qi > 5 ? (qi - 5) * 0.9 : 0), y: 0 };
      n.qIndex = qi;
    } else if (g.kind === "leave") {
      dest = { x: -2 + this.rng() * 4, z: -44.5, y: 0 };
    } else if (g.kind === "patrol") {
      g.i = 0;
      dest = g.pts[0];
    } else if (g.kind === "follow") {
      dest = this.followPoint(n);
    }
    if (!dest) return;
    n.dest = dest;
    if (place) {
      const last = finalPts.length ? finalPts[finalPts.length - 1] : dest;
      n.x = last.x;
      n.z = last.z;
      n.y = dest.y;
      n.path = [];
      n.stairLock = false;
      this.arrive(n);
      return;
    }
    const route = this.nav.route(from, dest);
    if (route) n.path = exitPts.concat(route, finalPts);
    else n.path = [...exitPts, { x: dest.x, z: dest.z, direct: true }, ...finalPts];
    n.stuckT = 0;
    n.stuckN = 0;
  }
  freeNear(s) {
    const cands = this.seats.filter((x) => x.room === s.room && x.kind === s.kind && !x.occ && !(x.reserved && x.reserved !== s.reserved && this.isClassTime(x.room)));
    cands.sort((a, b) => dist2(a, s) - dist2(b, s));
    return cands[0] || null;
  }
  followPoint(n) {
    const p = this.player;
    const i = this.followers().indexOf(n);
    const a = p.yaw + Math.PI + (i - 0.5) * 0.9;
    return { x: p.x + Math.sin(a) * 1.6, z: p.z + Math.cos(a) * 1.6, y: p.y };
  }
  arrive(n) {
    const g = n.goal;
    n.arrived = true;
    n.path = [];
    n.stairLock = false;
    if (!g) return;
    if (g.kind === "seat" && n.goalSeat) {
      const s = n.goalSeat;
      n.seat = s.id;
      n.x = s.x;
      n.z = s.z;
      n.y = s.y - 0.47;
      n.yaw = s.yaw;
      n.pose = g.pose || "sit";
      if (n.tray) n.pose = "eat";
      n.state = n.type === "teacher" ? "idle" : "seated";
    } else if (g.kind === "spot") {
      n.yaw = g.spot.yaw ?? n.yaw;
      n.pose = g.pose || "idle";
      if (n.type === "teacher") n.state = g.teach ? (this.classRunning(n) ? "teaching" : "waiting") : g.waiting ? "waiting" : n.state === "toOffice" ? "idle" : "idle";
    } else if (g.kind === "group") {
      n.yaw = yawTo(n.x, n.z, g.face.x, g.face.z);
      n.pose = g.pose || "talk";
      n.state = "chatting";
    } else if (g.kind === "lunch") {
      n.yaw = -Math.PI / 2;
      n.pose = "idle";
      n.state = "queue";
    } else if (g.kind === "leave") {
      n.hidden = true;
      n.state = "gone";
    } else if (g.kind === "patrol") {
      n.state = "monitoring";
    }
  }
  classRunning(t) {
    const c = this.currentClass();
    return !!(c && (this.teacherFor(c.subject) === t));
  }
  updateNPCs(dt) {
    const p = this.player;
    const aiTick = (this.aiT = (this.aiT || 0) - dt) <= 0;
    if (aiTick) this.aiT = 0.25;
    for (const n of this.npcs) {
      if (n.bubbleT > 0) {
        n.bubbleT -= dt;
        if (n.bubbleT <= 0) n.bubble = null;
      }
      if (n.moodT > 0) n.moodT -= dt;
      if (n.hidden) {
        // gone home — back at the start of the next day
        continue;
      }
      if (n.talkLock) {
        n.speed = 0;
        n.yaw = lerpAngle(n.yaw, yawTo(n.x, n.z, p.x, p.z), Math.min(1, 6 * dt));
        continue;
      }
      if (aiTick) this.thinkNPC(n);
      this.moveNPC(n, dt);
      this.animNPC(n, dt);
    }
    if (aiTick) {
      this.serveQueue();
      this.recoverLate();
    }
  }
  /** Students still far from their class 6 minutes after the bell are moved there
   *  (only when the player is nowhere near, so nobody sees them pop in). */
  recoverLate() {
    const b = blockAt(this.time);
    if (b.kind !== "class" || this.time < b.start + 6) return;
    const p = this.player;
    for (const n of this.npcs) {
      if (n.type !== "student" || n.hidden || n.arrived || !n.goal || n.follow) continue;
      if (!(n.planKey.startsWith("class") || n.planKey.startsWith("pe"))) continue;
      const last = n.path.length ? n.path[n.path.length - 1] : null;
      if (!last) continue;
      if (Math.hypot(n.x - p.x, n.z - p.z) < 25 || Math.hypot(last.x - p.x, last.z - p.z) < 18) continue;
      n.x = last.x;
      n.z = last.z;
      n.y = n.dest ? n.dest.y : n.y;
      if (n.goalSeat) n.y = n.goalSeat.y - 0.47;
      n.path = [];
      this.arrive(n);
      this.recovered = (this.recovered || 0) + 1;
    }
  }
  thinkNPC(n) {
    if (n.think > 0) {
      n.think -= 0.25;
      return;
    }
    const plan = this.planFor(n);
    if (plan.key !== n.planKey) {
      if (n.stairLock) return;
      // students react to a change with a short, random delay
      if (n.pendingKey !== plan.key) {
        n.pendingKey = plan.key;
        n.think = n.type === "student" ? this.rng() * (plan.goal.hurry ? 1.2 : 3.0) : this.rng() * 1.0;
        return;
      }
      n.pendingKey = null;
      this.setGoal(n, plan);
      return;
    }
    const g = n.goal;
    if (!g) return;
    // follow: refresh the route when the player has moved away
    if (g.kind === "follow") {
      if (this.time > n.followUntil) {
        this.stopFollow(n, "time");
        return;
      }
      const d = Math.hypot(n.x - p_(this).x, n.z - p_(this).z);
      if (Math.abs(n.y - this.player.y) > 2.5 && FLOOR(n.y) === FLOOR(this.player.y) && d > 4) {
        // fell behind on another level — catch up
      }
      if (d > 3.2 && (!n.path.length || n.repathT <= this.t)) {
        n.repathT = this.t + 1.2;
        const dest = this.followPoint(n);
        const route = this.nav.route(n, dest);
        n.path = route || [{ x: dest.x, z: dest.z, direct: true }];
        n.arrived = false;
      }
      if (d > 30) {
        const fp = this.followPoint(n);
        Object.assign(n, { x: fp.x, z: fp.z, y: fp.y, path: [] });
      }
      return;
    }
    if (g.kind === "patrol" && n.arrived) {
      n.wait = (n.wait || 0) + 0.25;
      if (n.wait > 3) {
        n.wait = 0;
        g.i = (g.i + 1) % g.pts.length;
        const route = this.nav.route(n, g.pts[g.i]);
        n.path = route || [];
        n.arrived = false;
        n.pose = "stand";
      }
    }
    // teachers: teaching → monitoring after the activity starts
    if (n.type === "teacher" && g.teach && n.arrived) {
      const c = this.currentClass();
      const mine = c && this.teacherFor(c.subject) === n;
      if (mine) {
        const b = blockAt(this.time);
        if (n.state === "waiting") n.state = "teaching";
        if (n.introSlot !== b.slot && c.subject !== "activities") {
          n.introSlot = b.slot;
          this.say(n, pick(this.rng, TEACHER_LINES.intro[c.subject] || TEACHER_LINES.intro.math), "teacher", 4.5);
        }
        if (this.time > b.start + ACTIVITY_AT + 1 && c.room && this.L.teach[c.room] && n.state !== "monitoring") {
          n.state = "monitoring";
          n.monI = 0;
        }
        if (n.state === "monitoring" && this.L.teach[c.room]) {
          n.wait = (n.wait || 0) + 0.25;
          if (n.wait > 5 && !n.path.length) {
            n.wait = 0;
            const ai = this.L.teach[c.room].aisle;
            const pt = n.monI % 2 === 0 ? ai[(n.monI / 2) % ai.length] : this.L.teach[c.room].board;
            n.monI++;
            const route = this.nav.route(n, pt);
            n.path = route || [];
            n.pose = "stand";
          }
        }
        if (this.time > b.end - 3 && !n.dismissed) {
          n.dismissed = true;
          this.say(n, pick(this.rng, TEACHER_LINES.dismiss), "teacher");
        }
      } else n.dismissed = false;
    }
    // ambient chatter near the player
    n.chatT -= 0.25;
    if (n.chatT <= 0 && n.type === "student") {
      n.chatT = 6 + this.rng() * 12;
      const d = Math.hypot(n.x - this.player.x, n.z - this.player.z);
      if (d < 14 && !n.bubble) {
        const S = this.save;
        if (S.friends[n.id] >= FRIEND_AT && d < 7 && n.greetT <= this.t && !this.talking) {
          n.greetT = this.t + 90;
          this.say(n, pick(this.rng, AMBIENT.friendGreet), "friend", 3);
          n.wave = 1.5;
        } else {
          const kind = n.state === "walking" && n.hurry ? "hurry" : n.goal?.kind === "lunch" || n.pose === "eat" ? "lunch" : n.pose === "shoot" || n.pose === "kick" ? "sport" : n.pose === "sitRead" ? "study" : n.goal?.kind === "leave" ? "leave" : n.state === "chatting" || n.pose === "sitTalk" ? "chat" : null;
          if (kind && this.rng() < 0.6) this.say(n, pick(this.rng, AMBIENT[kind]), "npc", 2.6);
        }
      }
    }
  }
  serveQueue() {
    // the student at the front gets food after a short wait, then finds a table
    const front = this.queue[0] && this.npcById.get(this.queue[0]);
    if (!front) return;
    if (!front.arrived) return;
    front.serveT = (front.serveT || 0) + 0.25;
    if (front.serveT < 2.5) return;
    front.serveT = 0;
    this.queue.shift();
    const rng = this.rng;
    const s = this.L.cafSeats.filter((x) => !x.occ);
    const seat = s.length ? s[Math.floor(rng() * s.length)] : null;
    if (seat) {
      this.setGoal(front, { key: "lunch", goal: { kind: "seat", seat, pose: "eat" } });
      front.tray = true;
      front.goal.kind = "seat";
    }
    // everyone else moves up
    this.queue.forEach((id, i) => {
      const m = this.npcById.get(id);
      if (!m) return;
      const qs = this.L.spots[`queue${Math.min(5, i)}`];
      m.qIndex = i;
      m.path = [{ x: qs.x, z: qs.z + (i > 5 ? (i - 5) * 0.9 : 0), direct: true }];
      m.arrived = false;
    });
  }
  moveNPC(n, dt) {
    const p = this.player;
    if (!n.path.length) {
      n.speed = 0;
      if (n.goal && n.goal.kind === "follow" && !n.arrived) n.arrived = true;
      return;
    }
    const pt = n.path[0];
    const dx = pt.x - n.x;
    const dz = pt.z - n.z;
    const d = Math.hypot(dx, dz);
    const base = n.type === "teacher" ? 1.55 : 1.7;
    const urgent = n.hurry && blockAt(this.time).kind !== "lunch";
    let spd = (urgent ? (d > 6 ? 3.5 : 2.8) : n.goal?.kind === "follow" ? (d > 4 ? 4.2 : 2.6) : n.goal?.kind === "lunch" || n.goal?.kind === "leave" ? 2.6 : base) * n.speedMul;
    if (pt.seat || (pt.direct && n.path.length <= 2)) spd = Math.min(spd, 1.2);
    const stepLen = spd * dt;
    if (d <= Math.max(0.12, stepLen)) {
      n.x = pt.x;
      n.z = pt.z;
      n.stairLock = !!(pt.stair && !pt.stairEnd);
      n.path.shift();
      if (!n.path.length) this.arrive(n);
      n.y = this.space.groundAt(n.x, n.z, n.y);
      return;
    }
    let mx = dx / d;
    let mz = dz / d;
    // separation from other walkers and the player
    if (!pt.seat) {
      let sx = 0;
      let sz = 0;
      const push = (ox, oz, r) => {
        const ex = n.x - ox;
        const ez = n.z - oz;
        const e2 = ex * ex + ez * ez;
        if (e2 < r * r && e2 > 1e-6) {
          const e = Math.sqrt(e2);
          sx += (ex / e) * (r - e);
          sz += (ez / e) * (r - e);
        }
      };
      for (const m of this.npcs) if (m !== n && !m.hidden && !m.seat && Math.abs(m.y - n.y) < 1 && Math.abs(m.x - n.x) < 1 && Math.abs(m.z - n.z) < 1) push(m.x, m.z, 0.62);
      if (Math.abs(p.y - n.y) < 1) push(p.x, p.z, 0.75);
      if (sx || sz) {
        mx += sx * 1.6;
        mz += sz * 1.6;
        const l = Math.hypot(mx, mz);
        mx /= l;
        mz /= l;
      }
    }
    n.x += mx * stepLen;
    n.z += mz * stepLen;
    n.speed = spd;
    n.yaw = lerpAngle(n.yaw, Math.atan2(mx, mz), Math.min(1, 9 * dt));
    n.y = this.space.groundAt(n.x, n.z, n.y);
    // doors open for NPCs walking up
    n.doorT = (n.doorT || 0) - dt;
    if (n.doorT <= 0) {
      n.doorT = 0.2;
      for (const dd of this.doors) if (Math.abs(dd.y - n.y) < 1.4 && Math.abs(dd.x - n.x) < 2.2 && Math.abs(dd.z - n.z) < 2.2) this.openDoorFor(dd);
    }
    // stuck detection → re-route, and finally a recovery hop to the next waypoint
    n.stuckT += dt;
    if (n.stuckT > 1) {
      const moved = Math.abs(n.lastD - d);
      n.lastD = d;
      n.stuckT = 0;
      if (moved < 0.15) {
        n.stuckN = (n.stuckN || 0) + 1;
        if (n.stuckN >= 6) {
          n.stuckN = 0;
          n.x = pt.x;
          n.z = pt.z;
          n.y = this.space.groundAt(n.x, n.z, pt.stair ? n.y + 1 : n.y);
        }
      } else n.stuckN = 0;
    }
  }
  animNPC(n, dt) {
    if (n.speed > 0.1) n.anim += dt * n.speed * 2.6;
    if (n.wave > 0) n.wave -= dt;
  }

  /* ===================================================================== activities */
  startActivity(kind, it) {
    const S = this.save;
    const p = this.player;
    if (kind !== "pe") {
      const a = ACTIVITIES[kind];
      if (S.level < a.level) return this.emit("toast", { text: `${a.name} unlocks at level ${a.level}.`, kind: "bad" });
      const b = blockAt(this.time);
      if (b.kind === "class") {
        const c = this.ds.classes[b.slot];
        if (c.subject !== "activities" && c.status !== "done") this.emit("toast", { text: "You're supposed to be in class right now…", kind: "bad" });
      }
      if (this.ds.energy < 8) return this.emit("toast", { text: "Too tired for sports — eat something first.", kind: "bad" });
    }
    const team = this.followers().length > 0;
    if (kind === "basketball") {
      const hoop = this.L.hoops.find((h) => h.id === it.hoop);
      this.activity = { kind, title: "Basketball Shootout", desc: "Hold Left-click (or E) to charge, release in the green zone. 60 seconds!", hoop, time: ACTIVITIES.basketball.time, score: 0, made: 0, shots: 0, charging: false, power: 0, pdir: 1, ball: null, cool: 0, team, countdown: 2.5, prompt: null };
      p.x = it.x;
      p.z = it.z;
      p.vx = p.vz = 0;
      p.yaw = yawTo(p.x, p.z, hoop.x, hoop.z);
      this.activity.faceYaw = p.yaw;
    } else if (kind === "football") {
      const G = this.L.goal;
      this.activity = { kind, title: "Penalty Practice", desc: "Aim with the mouse, hold Left-click (or E) and release to kick. Hit the corner targets for bonus points!", goal: G, shots: ACTIVITIES.football.shots, taken: 0, score: 0, goals: 0, charging: false, power: 0, pdir: 1, ball: null, keeper: { z: G.z, v: 2.2, dive: 0 }, cool: 0, team, countdown: 2, lock: true, aim: 0 };
      p.x = G.spot.x - 1.2;
      p.z = G.spot.z;
      p.vx = p.vz = 0;
      p.yaw = Math.PI / 2;
      this.activity.faceYaw = Math.PI / 2;
      this.activity.ballRest = { x: G.spot.x, y: BALL_R, z: G.spot.z };
    } else if (kind === "running" || kind === "pe") {
      const course = kind === "pe" ? this.L.peCourse.concat(this.L.peCourse) : this.L.trackCourse;
      let len = 0;
      const start = kind === "pe" ? this.L.spots.peStart : this.L.spots.trackStart;
      let prev = start;
      for (const c of course) {
        len += Math.hypot(c.x - prev.x, c.z - prev.z);
        prev = c;
      }
      const par = Math.round((len / (kind === "pe" ? 4.4 : 4.9)) * (this.ds.tips.pe === true && kind === "pe" ? 1.08 : 1));
      this.activity = { kind, title: kind === "pe" ? "PE — Timed Course" : "Track Sprint", desc: `Run through every checkpoint ring. Par time: ${par}s. Hold Shift to sprint!`, course, idx: 0, t: 0, par, len, team, countdown: 3, lock: true };
      p.x = start.x;
      p.z = start.z;
      p.y = 0;
      p.vx = p.vz = 0;
      p.yaw = yawTo(p.x, p.z, course[0].x, course[0].z);
      this.activity.faceYaw = p.yaw;
    }
    this.emit("activityStart", { kind, title: this.activity.title, desc: this.activity.desc });
  }
  /** Ideal launch speed for a basketball from the hand to the rim at a fixed angle. */
  idealShot(fromX, fromY, fromZ, hoop) {
    const d = Math.hypot(hoop.x - fromX, hoop.z - fromZ);
    const h = hoop.y - fromY;
    const th = (52 * Math.PI) / 180;
    const c = Math.cos(th);
    const den = 2 * c * c * (d * Math.tan(th) - h);
    if (den <= 0) return { v: 12, d };
    return { v: Math.sqrt((9.81 * d * d) / den), d };
  }
  shotPowerWindow() {
    const a = this.activity;
    const p = this.player;
    const { v } = this.idealShot(p.x, p.y + 2.05, p.z, a.hoop);
    const pIdeal = clamp((v - 5) / (13 - 5), 0.05, 0.98);
    return { ideal: pIdeal, width: 0.075 };
  }
  updateActivity(inp, dt) {
    const a = this.activity;
    if (!a) return;
    const p = this.player;
    if (a.countdown > 0) {
      a.countdown -= dt;
      a.prompt = { key: "", text: `Get ready… ${Math.ceil(a.countdown)}` };
      if (a.countdown <= 0) {
        a.lock = a.kind === "football";
        this.emit("go");
      }
      return;
    }
    // leaving the activity
    if (inp.cancel) return this.endActivity(true);
    if (a.kind === "basketball") {
      a.time -= dt;
      a.cool -= dt;
      const hoop = a.hoop;
      const dHoop = Math.hypot(p.x - hoop.x, p.z - hoop.z);
      if (dHoop > 11) {
        // wandered off the court → back to the line
        const ang = yawTo(hoop.x, hoop.z, p.x, p.z);
        p.x = hoop.x + Math.sin(ang) * 10.5;
        p.z = hoop.z + Math.cos(ang) * 10.5;
      }
      a.faceYaw = yawTo(p.x, p.z, hoop.x, hoop.z);
      const holding = !a.ball && a.cool <= 0;
      if (holding && (inp.actionDown || (inp.action && !a.charging && a.armed))) {
        a.charging = true;
        a.power = 0;
        a.pdir = 1;
      }
      a.armed = !inp.action;
      if (a.charging) {
        a.power += a.pdir * dt * 0.95;
        if (a.power >= 1) {
          a.power = 1;
          a.pdir = -1;
        }
        if (a.power <= 0) {
          a.power = 0;
          a.pdir = 1;
        }
        if (inp.actionUp || !inp.action) {
          a.charging = false;
          this.shootBasketball();
        }
      }
      if (a.ball) this.stepBasketball(dt);
      const pts = a.score;
      a.prompt = { key: "", text: `🏀 ${pts} pts · ${a.made}/${a.shots} · ${Math.max(0, Math.ceil(a.time))}s  —  ${a.charging ? "release in the green!" : holding ? "hold Left-click / E to shoot" : "…"}` };
      if (a.time <= 0 && !a.ball) this.endActivity(false);
    } else if (a.kind === "football") {
      const G = a.goal;
      a.cool -= dt;
      // aim follows the camera yaw (clamped toward the goal)
      const base = Math.PI / 2;
      a.aim = clamp(angDiff(base, inp.camYaw ?? base), -0.42, 0.42);
      a.faceYaw = base + a.aim;
      p.yaw = a.faceYaw;
      // keeper shuffles across the line
      const K = a.keeper;
      if (!a.ball || a.ball.done) {
        K.z += K.v * dt;
        if (Math.abs(K.z - G.z) > 2.6) K.v = -K.v;
        K.z = clamp(K.z, G.z - 2.7, G.z + 2.7);
        K.dive = Math.max(0, K.dive - dt);
      }
      const ready = (!a.ball || a.ball.done) && a.cool <= 0 && a.taken < a.shots;
      if (ready && inp.actionDown) {
        a.charging = true;
        a.power = 0;
        a.pdir = 1;
      }
      if (a.charging) {
        a.power += a.pdir * dt * 0.85;
        if (a.power >= 1) {
          a.power = 1;
          a.pdir = -1;
        }
        if (a.power <= 0.05) a.pdir = 1;
        if (inp.actionUp || !inp.action) {
          a.charging = false;
          this.kickBall();
        }
      }
      if (a.ball && !a.ball.done) this.stepFootball(dt);
      a.prompt = { key: "", text: `⚽ ${a.score} pts · shot ${Math.min(a.taken + (a.ball && !a.ball.done ? 0 : 1), a.shots)}/${a.shots}  —  ${a.charging ? "release to kick!" : ready ? "aim with the mouse, hold Left-click / E" : "…"}` };
      if (a.taken >= a.shots && (!a.ball || a.ball.done) && a.cool <= 0) this.endActivity(false);
    } else if (a.kind === "running" || a.kind === "pe") {
      a.t += dt;
      a.lock = false;
      const cp = a.course[a.idx];
      if (cp && Math.hypot(p.x - cp.x, p.z - cp.z) < (a.kind === "pe" ? 1.9 : 3.2)) {
        a.idx++;
        this.emit("checkpoint", { i: a.idx, n: a.course.length });
        if (a.idx >= a.course.length) return this.endActivity(false);
      }
      a.prompt = { key: "", text: `⏱ ${a.t.toFixed(1)}s · par ${a.par}s · checkpoint ${a.idx + 1}/${a.course.length}` };
      if (a.t > a.par * 3) this.endActivity(false, true);
    }
  }
  shootBasketball() {
    const a = this.activity;
    const p = this.player;
    const hoop = a.hoop;
    const from = { x: p.x + Math.sin(p.yaw) * 0.3, y: p.y + 2.05, z: p.z + Math.cos(p.yaw) * 0.3 };
    const v = 5 + a.power * 8;
    const th = (52 * Math.PI) / 180;
    // aim assist: the throw goes at the hoop horizontally
    const yaw = yawTo(from.x, from.z, hoop.x, hoop.z);
    const dist = Math.hypot(hoop.x - p.x, hoop.z - p.z);
    a.ball = { x: from.x, y: from.y, z: from.z, vx: Math.sin(yaw) * Math.cos(th) * v, vy: Math.sin(th) * v, vz: Math.cos(yaw) * Math.cos(th) * v, t: 0, scored: false, three: dist >= 6.75, bounces: 0 };
    a.shots++;
    p.anim.shoot = 0.6;
    this.ds.energy = Math.max(0, this.ds.energy - 0.25);
    this.emit("shoot");
  }
  stepBasketball(dt) {
    const a = this.activity;
    const b = a.ball;
    const hoop = a.hoop;
    const sub = 4;
    for (let i = 0; i < sub; i++) {
      const h = dt / sub;
      const py = b.y;
      b.vy -= 9.81 * h;
      b.x += b.vx * h;
      b.y += b.vy * h;
      b.z += b.vz * h;
      b.t += h;
      // backboard plane
      const bd = hoop.board;
      const side = (b.x - bd.x) * bd.dir;
      if (side < 0.0 && b.y > 2.85 && b.y < 4.0 && Math.abs(b.z - hoop.z) < 0.92 && !b.boarded) {
        b.vx = -b.vx * 0.55;
        b.x = bd.x + bd.dir * 0.02;
        b.boarded = true;
        this.emit("board");
      }
      // rim crossing (downwards through the hoop plane)
      if (!b.scored && py >= hoop.y && b.y < hoop.y && b.vy < 0) {
        const r = Math.hypot(b.x - hoop.x, b.z - hoop.z);
        if (r < HOOP_R - BALL_R * 0.35) {
          b.scored = true;
          const pts = b.three ? 3 : 2;
          a.score += pts;
          a.made++;
          this.save.counters.baskets = (this.save.counters.baskets || 0) + 1;
          b.vx *= 0.3;
          b.vz *= 0.3;
          this.player.anim.celebrate = 0.8;
          this.emit("basket", { pts, swish: !b.boarded });
        } else if (r < HOOP_R + BALL_R + 0.03) {
          // rim: bounce out
          const ang = Math.atan2(b.z - hoop.z, b.x - hoop.x);
          b.vx = Math.cos(ang) * 1.8 + b.vx * 0.2;
          b.vz = Math.sin(ang) * 1.8 + b.vz * 0.2;
          b.vy = Math.abs(b.vy) * 0.45;
          b.y = hoop.y + 0.01;
          this.emit("rim");
        }
      }
      if (b.y < BALL_R) {
        b.y = BALL_R;
        b.vy = Math.abs(b.vy) * 0.62;
        b.vx *= 0.8;
        b.vz *= 0.8;
        b.bounces++;
        if (b.vy > 1) this.emit("bounce", { x: b.x, z: b.z, v: b.vy });
      }
    }
    if (b.t > 2.6 || (b.bounces > 3 && b.t > 1.2)) {
      a.ball = null;
      a.cool = 0.35;
    }
  }
  kickBall() {
    const a = this.activity;
    const G = a.goal;
    const r = a.ballRest;
    const yaw = Math.PI / 2 + a.aim;
    const pw = a.power;
    const speed = 13 + pw * 15;
    const elev = ((3 + pw * 15) * Math.PI) / 180;
    a.ball = { x: r.x, y: r.y, z: r.z, vx: Math.sin(yaw) * Math.cos(elev) * speed, vy: Math.sin(elev) * speed, vz: Math.cos(yaw) * Math.cos(elev) * speed, t: 0, done: false };
    a.taken++;
    this.player.anim.kick = 0.6;
    this.ds.energy = Math.max(0, this.ds.energy - 0.5);
    // the keeper guesses a side
    const K = a.keeper;
    const guess = this.rng();
    const zAtGoal = r.z + Math.tan(a.aim) * (G.x - r.x);
    K.target = guess < 0.5 ? zAtGoal + (this.rng() - 0.5) * 2.2 : K.z + (this.rng() - 0.5) * 4;
    K.dive = 0.9;
    this.emit("kick");
  }
  stepFootball(dt) {
    const a = this.activity;
    const b = a.ball;
    const G = a.goal;
    const K = a.keeper;
    if (K.target != null && K.dive > 0) K.z += clamp(K.target - K.z, -4.5 * dt, 4.5 * dt);
    const sub = 3;
    for (let i = 0; i < sub && !b.done; i++) {
      const h = dt / sub;
      const px = b.x;
      b.vy -= 9.81 * h;
      b.vx *= 1 - 0.08 * h;
      b.vz *= 1 - 0.08 * h;
      b.x += b.vx * h;
      b.y += b.vy * h;
      b.z += b.vz * h;
      b.t += h;
      if (b.y < BALL_R) {
        b.y = BALL_R;
        b.vy = Math.abs(b.vy) * 0.4;
        b.vx *= 0.9;
        b.vz *= 0.9;
      }
      // keeper block (a box around the keeper on the goal line)
      if (px < G.x - 0.6 && b.x >= G.x - 0.6) {
        const reach = K.dive > 0 ? 1.15 : 0.7;
        if (Math.abs(b.z - K.z) < reach && b.y < 2.0) {
          b.vx = -Math.abs(b.vx) * 0.4;
          b.vz += (b.z - K.z) * 2;
          b.done = true;
          b.result = "saved";
          this.emit("saved");
          a.cool = 1.2;
          break;
        }
      }
      if (px < G.x && b.x >= G.x) {
        const inMouth = Math.abs(b.z - G.z) < G.w / 2 - BALL_R && b.y < G.h - BALL_R;
        if (inMouth) {
          let pts = 2;
          const tgt = [G.z - 2.85, G.z + 2.85].some((tz) => Math.hypot(b.z - tz, b.y - 1.9) < 0.62);
          if (tgt) pts = 4;
          a.score += pts;
          a.goals++;
          b.vx *= 0.15;
          b.done = true;
          b.result = tgt ? "target" : "goal";
          this.player.anim.celebrate = 1;
          this.emit("goal", { pts, target: tgt });
        } else {
          b.done = true;
          b.result = "miss";
          this.emit("miss");
        }
        a.cool = 1.2;
      }
    }
    if (!b.done && b.t > 3) {
      b.done = true;
      b.result = "miss";
      a.cool = 0.6;
      this.emit("miss");
    }
  }
  endActivity(cancelled, timedOut = false) {
    const a = this.activity;
    if (!a) return;
    this.activity = null;
    const S = this.save;
    const C = S.counters;
    if (cancelled && a.kind !== "pe") {
      this.emit("activityEnd", { kind: a.kind, cancelled: true, title: a.title });
      return;
    }
    let win = false;
    let summary = "";
    let score = 0;
    if (a.kind === "basketball") {
      win = a.score >= ACTIVITIES.basketball.win;
      summary = `${a.made} baskets from ${a.shots} shots — ${a.score} points.`;
      this.lastShootout = { made: a.made, day: S.day };
      if (S.favor && S.favor.kind === "baskets" && a.made >= 6) S.favor.done = true;
      score = a.score;
    } else if (a.kind === "football") {
      win = a.score >= ACTIVITIES.football.win;
      summary = `${a.goals} goals from ${a.shots} penalties — ${a.score} points.`;
      score = a.score;
    } else if (a.kind === "running") {
      const t = timedOut ? Infinity : a.t;
      win = t <= a.par;
      summary = timedOut ? "You ran out of time." : `Lap time ${a.t.toFixed(1)}s (par ${a.par}s).`;
      score = timedOut ? 0 : a.t;
    } else if (a.kind === "pe") {
      const t = cancelled || timedOut ? a.par * 2.5 : a.t;
      const sc = clamp(Math.round(100 * Math.min(1.08, a.par / Math.max(1, t)) - (a.idx < a.course.length ? 30 : 0)), 0, 100);
      summary = cancelled ? "PE ended before you finished the course." : `Course time ${a.t.toFixed(1)}s (par ${a.par}s).`;
      const slot = this.ds.classes.findIndex((c) => c.subject === "pe");
      if (slot >= 0) {
        this.lessonOpen = slot;
        const r = this.finishLesson(slot, { score: sc });
        this.emit("activityEnd", { kind: "pe", win: sc >= 70, summary, score: sc, grade: r?.grade, feedback: r?.feedback, title: a.title });
      }
      this.ds.energy = Math.max(0, this.ds.energy - 8);
      return;
    }
    C.sportsDone = (C.sportsDone || 0) + 1;
    this.ds.sportsToday++;
    this.ds.energy = Math.max(0, this.ds.energy - 8);
    this.addXP(win ? XP.activityWin : XP.activityPlay, a.title);
    S.points += win ? 12 : 4;
    S.happy = clamp(S.happy + (win ? 8 : 3), 0, 100);
    if (win) {
      C.sportWins = (C.sportWins || 0) + 1;
      this.changeRep(2);
      if (a.team) C.teamWins = (C.teamWins || 0) + 1;
    }
    // a friend who joined you enjoys it too
    for (const n of this.followers()) {
      this.changeFriend(n, win ? 6 : 3);
      this.stopFollow(n, "done");
    }
    this.player.anim.celebrate = win ? 2 : 0;
    this.emit("activityEnd", { kind: a.kind, win, summary, score, title: a.title, team: a.team });
  }

  /* ===================================================================== end of day */
  finishDay(why) {
    if (this.dayOver) return;
    // close remaining classes
    for (const b of BLOCKS) if (b.kind === "class" && b.end <= this.time) {
      const c = this.ds.classes[b.slot];
      if (c && (c.status === "open" || c.status === "upcoming")) this.closeClass(b);
    }
    if (this.activity) this.endActivity(true);
    this.dayOver = true;
    const S = this.save;
    S.counters.daysCompleted = (S.counters.daysCompleted || 0) + 1;
    this.checkMissions();
    const D = this.ds;
    const att = D.classes.filter((c) => c.subject !== "activities");
    const summary = {
      day: S.day,
      why,
      classes: D.classes.map((c) => ({ subject: c.subject, status: c.status, score: c.score, grade: c.grade, late: !!c.late })),
      attended: att.filter((c) => c.status === "done").length,
      total: att.length,
      xp: S.totalXp - D.startXp,
      points: S.points - D.startPoints,
      levelFrom: D.startLevel,
      levelTo: S.level,
      repFrom: Math.round(D.startRep),
      repTo: Math.round(S.rep),
      missions: D.missionsToday.slice(),
      homeworkDue: S.homework.filter((h) => h.status === "open").length,
      friends: this.friendsCount(),
      academics: this.academics(),
    };
    S.history.push(summary);
    if (S.history.length > 30) S.history.shift();
    this.summary = summary;
    this.emit("dayEnd", { summary });
  }
  /** Advance to the next school day (call after the report). */
  nextDay() {
    const S = this.save;
    S.day++;
    S.dayState = null;
    this.startDay(true);
  }
  /** Write the live day into the save (call before persisting). */
  exportState() {
    const p = this.player;
    this.ds.time = this.time;
    this.ds.player = this.dayOver ? null : { x: p.seat ? (this.seatById.get(p.seat)?.stand?.[0] ?? p.x) : p.x, y: p.y, z: p.seat ? (this.seatById.get(p.seat)?.stand?.[1] ?? p.z) : p.z, yaw: p.yaw };
    this.save.dayState = this.dayOver ? null : this.ds;
  }
  /** Restart the current day from 08:00 (progression is kept). */
  restartDay() {
    const D = this.ds;
    const S = this.save;
    for (const [k, v] of Object.entries(D.attDelta || {})) S.att[k] = Math.max(0, (S.att[k] || 0) - v);
    // homework handed out today is handed out again
    S.homework = S.homework.filter((h) => !(h.assigned === S.day && h.status === "open"));
    S.dayState = null;
    if (this.player.seat) {
      const s = this.seatById.get(this.player.seat);
      if (s) s.occ = null;
    }
    this.activity = null;
    this.lessonOpen = null;
    this.talking = null;
    this.startDay(true);
  }
  setLook(look) {
    this.save.look = sanitizeLook(look);
  }
  /** Items the player may wear at the current level. */
  wardrobe() {
    const L = this.save.level;
    return {
      outfits: OUTFITS.filter((o) => unlocked(o, L)),
      hair: HAIR_STYLES.filter((o) => unlocked(o, L)),
      colors: HAIR_COLORS.filter((o) => unlocked(o, L)),
      acc: ACCESSORIES.filter((o) => unlocked(o, L)),
    };
  }
  /** Markers for the map / minimap. */
  markers() {
    const out = [];
    const ob = this.objective();
    if (ob && ob.target) out.push({ x: ob.target.x, z: ob.target.z, y: ob.target.y || 0, kind: "objective", label: ob.title });
    if (this.notebookItem && !this.notebookItem.taken && this.save.notebook.state === 1) out.push({ ...this.notebookItem, kind: "notebook", label: "Lost notebook" });
    for (const m of MISSIONS) {
      if (this.missionDone(m.id) || !m.room || m.room === "@next" || (m.level && this.save.level < m.level)) continue;
      const e = this.L.entries[m.room] || this.L.spots[m.room];
      const pt = e?.inside || e;
      if (pt) out.push({ x: pt.x, z: pt.z, y: pt.y || 0, kind: "mission", label: m.title });
    }
    return out;
  }
}
const p_ = (sim) => sim.player;

export { FLOOR, ROOM_OF, CLASS_LEN, nextExamDay, EXAM, isIndoor };
