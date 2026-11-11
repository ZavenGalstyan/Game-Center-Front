/**
 * Portal Shift — deterministic simulation. No Three.js, no DOM: the React
 * shell feeds it input, render/world.js draws it, tools/*.mjs run it in Node.
 *
 * World: a voxel grid of 2 m cells (constants.js). Bodies (player, cubes) are
 * axis-aligned boxes swept one axis at a time against the solid cells plus the
 * dynamic boxes (doors, platforms, cubes, switch pedestals).
 *
 * Portals cover one whole cell face. While both are open, the solid cell
 * behind each one stops being solid for a body whose cross-section fits
 * entirely inside the opening — so a body can only ever enter a portal
 * through the hole, never clip into the surrounding wall. Once the body's
 * leading point crosses the portal plane it is mapped to the other portal
 * (position, velocity and view), placed fully in front of the exit surface
 * and checked for overlaps; a body that bounces between portals too often is
 * ejected beside the exit, so no teleport loop can trap it.
 */
import { CELL, EMPTY, WHITE, GLASS, GOO, PLAYER, CUBE, BEAM_H, isSolidValue } from "./constants.js";
import { FACES, axisOf, dot, cross, snapHorizontal, mapVec, mapPoint, lookVector, yawOf } from "./portalMath.js";

const EPS = 1e-5;
const OTHER = { blue: "orange", orange: "blue" };
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

export function createSim(level) {
  const { nx, ny, nz } = level;
  const grid = level.grid;
  const idx = (i, j, k) => i + nx * (j + ny * k);
  const inBounds = (i, j, k) => i >= 0 && j >= 0 && k >= 0 && i < nx && j < ny && k < nz;
  const cellAt = (i, j, k) => (inBounds(i, j, k) ? grid[idx(i, j, k)] : 1);

  const S = {
    level,
    t: 0,
    state: "play", // play | complete
    events: [],
    stats: { portals: 0, teleports: 0, deaths: 0 },
    yaw: level.spawn.yaw,
    pitch: 0,
    portals: { blue: null, orange: null },
    lastFire: null,
    held: null,
    respawn: { pos: [...level.spawn.pos], yaw: level.spawn.yaw },
    checkpoint: -1,
    beams: [],
    signals: new Map(),
    focus: null, // what E would act on: { kind: 'cube'|'switch'|'drop', ref }
  };

  const player = {
    kind: "player",
    pos: [...level.spawn.pos],
    vel: [0, 0, 0],
    hw: PLAYER.hw,
    h: PLAYER.h,
    grounded: false,
    groundRef: null,
    tpLog: [],
  };
  S.player = player;

  S.cubes = level.cubes.map((c, n) => ({
    id: c.id || `cube${n}`,
    kind: c.kind || "cube",
    dir: [...(c.dir || [0, 0, -1])],
    spawn: [...c.pos],
    spawnDir: [...(c.dir || [0, 0, -1])],
    powered: false,
    body: { kind: "cube", pos: [...c.pos], vel: [0, 0, 0], hw: CUBE.hw, h: CUBE.h, grounded: false, groundRef: null, tpLog: [] },
  }));
  for (const c of S.cubes) c.body.ref = c;

  S.doors = level.doors.map((d) => ({ ...d, open: d.inputs.length ? 0 : 1 }));
  S.plates = level.plates.map((p) => ({ ...p, on: false }));
  S.switches = level.switches.map((s) => ({ ...s, t: 0, on: false }));
  S.receivers = level.receivers.map((r) => ({ ...r, on: false, idx: idx(...r.cell) }));
  S.emitters = level.emitters.map((e) => ({ ...e }));
  S.platforms = level.platforms.map((p) => ({ ...p, cur: [...p.a], toB: true, wait: 0, moving: false }));
  S.pads = (level.pads || []).map((p) => ({ ...p, cool: 0 }));

  /* -------------------------------------------------------------- portals */
  function makePortal(color, cell, n, up, fixed = false) {
    const ax = axisOf(n);
    const center = [cell[0] * CELL + 1, cell[1] * CELL + 1, cell[2] * CELL + 1];
    center[ax] += n[ax];
    const right = cross(up, n);
    const lo = [cell[0] * CELL, cell[1] * CELL, cell[2] * CELL];
    return { color, cell: [...cell], idx: idx(...cell), n: [...n], up: [...up], right, center, axis: ax, lo, hi: [lo[0] + CELL, lo[1] + CELL, lo[2] + CELL], fixed, age: 0 };
  }
  for (const color of ["blue", "orange"]) {
    const f = level.fixedPortals?.[color];
    if (f) S.portals[color] = makePortal(color, f.cell, FACES[f.face], f.up ? FACES[f.up] : f.face === "py" || f.face === "ny" ? [0, 0, -1] : [0, 1, 0], true);
  }
  const linked = () => S.portals.blue && S.portals.orange;

  /* -------------------------------------------------------------- geometry helpers */
  const bmin = (b) => [b.pos[0] - b.hw, b.pos[1], b.pos[2] - b.hw];
  const bmax = (b) => [b.pos[0] + b.hw, b.pos[1] + b.h, b.pos[2] + b.hw];
  const center = (b) => [b.pos[0], b.pos[1] + b.h / 2, b.pos[2]];
  const ext = (b, ax) => (ax === 1 ? b.h / 2 : b.hw);

  function inAperture(b, p) {
    const mn = bmin(b), mx = bmax(b);
    for (let a = 0; a < 3; a++) {
      if (a === p.axis) continue;
      if (mn[a] < p.lo[a] - 1e-4 || mx[a] > p.hi[a] + 1e-4) return false;
    }
    // must be entering from the open side (not deep inside the wall)
    const c = center(b);
    return (c[p.axis] - p.center[p.axis]) * p.n[p.axis] > -1.4;
  }

  function solidFor(i, j, k, b) {
    const v = cellAt(i, j, k);
    if (!isSolidValue(v)) return false;
    if (b && !b.noHoles && linked()) {
      const id = idx(i, j, k);
      for (const c of ["blue", "orange"]) {
        const p = S.portals[c];
        if (p.idx === id && inAperture(b, p)) return false;
      }
    }
    return true;
  }

  function doorBox(d) {
    const [i, j, k] = d.cell;
    const y0 = j * CELL + d.open * CELL, y1 = j * CELL + CELL;
    if (y1 - y0 < 0.02) return null;
    const cx = i * CELL + 1, cz = k * CELL + 1;
    if (d.axis === 0) return { min: [cx - 0.16, y0, k * CELL], max: [cx + 0.16, y1, k * CELL + CELL], ref: d };
    return { min: [i * CELL, y0, cz - 0.16], max: [i * CELL + CELL, y1, cz + 0.16], ref: d };
  }
  const platBox = (p) => ({ min: [p.cur[0] - p.size[0] / 2, p.cur[1], p.cur[2] - p.size[2] / 2], max: [p.cur[0] + p.size[0] / 2, p.cur[1] + p.size[1], p.cur[2] + p.size[2] / 2], ref: p });
  const switchBox = (s) => ({ min: [s.pos[0] - 0.25, s.pos[1], s.pos[2] - 0.25], max: [s.pos[0] + 0.25, s.pos[1] + 1.05, s.pos[2] + 0.25], ref: s });
  const bodyBox = (b) => ({ min: bmin(b), max: bmax(b), ref: b.ref || b });

  /** Every solid box near [mn, mx] that body b collides with. */
  function gather(mn, mx, b, skip) {
    const out = [];
    const i0 = Math.floor(mn[0] / CELL - EPS), i1 = Math.floor(mx[0] / CELL + EPS);
    const j0 = Math.floor(mn[1] / CELL - EPS), j1 = Math.floor(mx[1] / CELL + EPS);
    const k0 = Math.floor(mn[2] / CELL - EPS), k1 = Math.floor(mx[2] / CELL + EPS);
    for (let k = k0; k <= k1; k++)
      for (let j = j0; j <= j1; j++)
        for (let i = i0; i <= i1; i++)
          if (solidFor(i, j, k, b)) out.push({ min: [i * CELL, j * CELL, k * CELL], max: [i * CELL + CELL, j * CELL + CELL, k * CELL + CELL], ref: null });
    for (const d of S.doors) {
      const bx = doorBox(d);
      if (bx) out.push(bx);
    }
    for (const p of S.platforms) if (p !== skip) out.push(platBox(p));
    for (const s of S.switches) out.push(switchBox(s));
    for (const c of S.cubes) {
      if (c.body === b || c === S.held) continue;
      out.push(bodyBox(c.body));
    }
    if (b && b.kind === "cube" && !b.ignorePlayer) out.push(bodyBox(player));
    return out;
  }

  const overlaps = (a, b, skipAx) => {
    for (let x = 0; x < 3; x++) {
      if (x === skipAx) continue;
      if (!(a.min[x] < b.max[x] - EPS && a.max[x] > b.min[x] + EPS)) return false;
    }
    return true;
  };

  /** Sweep body b by d along axis; returns { moved, hit } where hit is the blocking box. */
  function moveAxis(b, ax, d, skip) {
    if (d === 0) return { moved: 0, hit: null };
    const mn = bmin(b), mx = bmax(b);
    const qmn = [...mn], qmx = [...mx];
    if (d > 0) qmx[ax] += d;
    else qmn[ax] += d;
    const boxes = gather(qmn, qmx, b, skip);
    const me = { min: mn, max: mx };
    let dd = d, hit = null;
    for (const bx of boxes) {
      if (!overlaps(me, bx, ax)) continue;
      if (d > 0 && bx.min[ax] >= mx[ax] - 1e-4) {
        const lim = bx.min[ax] - mx[ax];
        if (lim < dd) (dd = Math.max(0, lim)), (hit = bx);
      } else if (d < 0 && bx.max[ax] <= mn[ax] + 1e-4) {
        const lim = bx.max[ax] - mn[ax];
        if (lim > dd) (dd = Math.min(0, lim)), (hit = bx);
      }
    }
    b.pos[ax] += dd;
    return { moved: dd, hit };
  }

  function penetrating(b, skip) {
    const me = { min: bmin(b), max: bmax(b) };
    for (const bx of gather(me.min, me.max, b, skip)) if (overlaps(me, bx, -1)) return bx;
    return null;
  }

  /* -------------------------------------------------------------- teleport */
  function tryTeleport(b) {
    if (!linked()) return false;
    for (const color of ["blue", "orange"]) {
      const pin = S.portals[color];
      if (!inAperture(b, pin)) continue;
      const c = center(b);
      const e = ext(b, pin.axis);
      const lead = (c[pin.axis] - pin.center[pin.axis]) * pin.n[pin.axis] - (e - 0.1);
      if (lead >= 0) continue;
      if (teleport(b, pin, S.portals[OTHER[color]])) return true;
    }
    return false;
  }

  function teleport(b, pin, pout) {
    const c = mapPoint(pin, pout, center(b));
    const ax = pout.axis;
    // fully in front of the exit surface
    const e = ext(b, ax);
    const s = (c[ax] - pout.center[ax]) * pout.n[ax];
    if (s < e + 0.02) c[ax] += pout.n[ax] * (e + 0.02 - s);
    // cross-section inside the opening (= inside the empty cell in front)
    for (let a = 0; a < 3; a++) {
      if (a === ax) continue;
      const ea = ext(b, a);
      c[a] = clamp(c[a], pout.lo[a] + ea + 0.01, pout.hi[a] - ea - 0.01);
    }
    const old = [...b.pos];
    let ok = false;
    for (let tries = 0; tries < 5 && !ok; tries++) {
      b.pos = [c[0], c[1] - b.h / 2, c[2]];
      b.pos[ax] += pout.n[ax] * tries * 0.2;
      ok = !penetrating(b);
    }
    if (!ok) {
      b.pos = old;
      return false;
    }
    let v = mapVec(pin, pout, b.vel);
    // floor → floor: coming out higher than you went in must not add energy
    if (pin.n[1] > 0 && pout.n[1] > 0 && v[1] > 0) {
      const rise = b.pos[1] - pout.center[1] + (pin.center[1] - old[1]);
      if (rise > 0) v[1] = Math.sqrt(Math.max(0, v[1] * v[1] - 2 * PLAYER.gravity * rise));
    }
    // loop guard: a body cycling between portals (rapidly, or without ever
    // touching the ground) is set down beside the exit
    b.tpLog = b.tpLog.filter((t) => S.t - t < 1.4);
    b.tpLog.push(S.t);
    b.airTp = (b.airTp || 0) + 1;
    if ((b.tpLog.length >= 5 || b.airTp >= 4) && eject(b, pout)) {
      v = [0, 0, 0];
      b.tpLog = [];
      b.airTp = 0;
      S.events.push({ type: "eject", kind: b.kind });
    }
    const sp = Math.hypot(v[0], v[1], v[2]);
    if (sp > PLAYER.maxSpeed) v = v.map((x) => (x * PLAYER.maxSpeed) / sp);
    b.vel = v;
    b.grounded = false;
    b.groundRef = null;
    if (b === player) {
      S.stats.teleports++;
      const L = mapVec(pin, pout, lookVector(S.yaw, S.pitch));
      const U = mapVec(pin, pout, [0, 1, 0]);
      const h = Math.hypot(L[0], L[2]);
      if (h > 0.3) S.yaw = yawOf(L);
      else S.yaw = yawOf(L[1] > 0 ? [-U[0], 0, -U[2]] : [U[0], 0, U[2]]);
      S.pitch = clamp(Math.asin(clamp(L[1], -1, 1)), -1.25, 1.25);
      if (S.held) placeHeld(true);
    }
    S.events.push({ type: "teleport", kind: b.kind, from: pin.color, to: pout.color });
    return true;
  }

  /** Set a body down on solid floor next to the exit portal's front cell. */
  function eject(b, p) {
    const f = [p.cell[0] + p.n[0], p.cell[1] + p.n[1], p.cell[2] + p.n[2]];
    const cand = [];
    for (const [di, dk] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      for (const dj of [0, -1, 1]) {
        const i = f[0] + di, j = f[1] + dj, k = f[2] + dk;
        if (cellAt(i, j, k) !== EMPTY || !isSolidValue(cellAt(i, j - 1, k))) continue;
        const below = idx(i, j - 1, k);
        if (S.portals.blue?.idx === below || S.portals.orange?.idx === below) continue;
        cand.push([i, j, k]);
      }
    }
    for (const [i, j, k] of cand) {
      const old = b.pos;
      b.pos = [i * CELL + 1, j * CELL + 0.01, k * CELL + 1];
      if (!penetrating(b)) return true;
      b.pos = old;
    }
    return false;
  }

  /* -------------------------------------------------------------- body motion */
  function moveBody(b, dt, isPlayer) {
    b.grounded = false;
    const disp = Math.max(Math.abs(b.vel[0]), Math.abs(b.vel[1]), Math.abs(b.vel[2])) * dt;
    const n = clamp(Math.ceil(disp / 0.2), 1, 10);
    const h = dt / n;
    let groundRef = null;
    for (let s = 0; s < n; s++) {
      for (const ax of [0, 2]) {
        const d = b.vel[ax] * h;
        if (!d) continue;
        const r = moveAxis(b, ax, d);
        if (r.hit && Math.abs(r.moved - d) > 1e-6) {
          // step up onto low ledges (plates, platforms) while walking
          if (isPlayer && b.wasGrounded && r.hit.max[1] - b.pos[1] <= PLAYER.step + 1e-3 && r.hit.max[1] > b.pos[1]) {
            const save = [...b.pos];
            const up = moveAxis(b, 1, PLAYER.step + 0.01);
            const fw = moveAxis(b, ax, d - r.moved);
            if (Math.abs(fw.moved) > 1e-4) {
              moveAxis(b, 1, -up.moved);
              continue;
            }
            b.pos = save;
          }
          b.vel[ax] = 0;
        }
      }
      const dy = b.vel[1] * h;
      const r = moveAxis(b, 1, dy);
      if (r.hit) {
        if (dy < 0) {
          b.grounded = true;
          groundRef = r.hit.ref;
        }
        b.vel[1] = 0;
      }
      if (tryTeleport(b)) break;
    }
    b.groundRef = b.grounded ? groundRef : null;
    b.wasGrounded = b.grounded;
    if (b.grounded) b.airTp = 0;
  }

  /* -------------------------------------------------------------- held cube */
  function eyePos() {
    return [player.pos[0], player.pos[1] + PLAYER.eye, player.pos[2]];
  }
  function holdTarget() {
    const e = eyePos();
    const L = lookVector(S.yaw, Math.min(S.pitch, 0.9));
    const t = [e[0] + L[0] * CUBE.hold, e[1] + L[1] * CUBE.hold - CUBE.h / 2, e[2] + L[2] * CUBE.hold];
    t[1] = Math.max(t[1], player.pos[1] + 0.02);
    return t;
  }
  function placeHeld(snap) {
    const c = S.held;
    if (!c) return;
    const b = c.body;
    b.noHoles = true;
    b.ignorePlayer = true;
    const tgt = holdTarget();
    if (snap) {
      const old = b.pos;
      b.pos = tgt;
      if (penetrating(b)) b.pos = [player.pos[0], player.pos[1] + 0.05, player.pos[2]];
      void old;
      b.vel = [0, 0, 0];
      return;
    }
    const prev = [...b.pos];
    for (const ax of [1, 0, 2]) moveAxis(b, ax, tgt[ax] - b.pos[ax]);
    for (const ax of [0, 2, 1]) moveAxis(b, ax, tgt[ax] - b.pos[ax]);
    if (Math.hypot(tgt[0] - b.pos[0], tgt[1] - b.pos[1], tgt[2] - b.pos[2]) > CUBE.dropDist) drop(true);
    else b.vel = [(b.pos[0] - prev[0]) * 60, (b.pos[1] - prev[1]) * 60, (b.pos[2] - prev[2]) * 60];
  }
  function snapDir(c) {
    if (c.kind === "reflector") c.dir = snapHorizontal(lookVector(S.yaw, 0));
  }
  function drop(forced = false) {
    const c = S.held;
    if (!c) return;
    S.held = null;
    const b = c.body;
    b.noHoles = false;
    b.ignorePlayer = false;
    const sp = Math.hypot(b.vel[0], b.vel[1], b.vel[2]);
    if (sp > 6) b.vel = b.vel.map((x) => (x * 6) / sp);
    snapDir(c);
    // never leave a cube inside the player
    if (penetrating(b)) {
      const old = b.pos;
      b.pos = holdTarget();
      if (penetrating(b)) b.pos = old;
    }
    S.events.push({ type: forced ? "dropForced" : "drop" });
  }

  /* -------------------------------------------------------------- ray casts */
  function rayBox(o, d, bx) {
    let t0 = 0, t1 = Infinity, nAx = -1, nSign = 0;
    for (let a = 0; a < 3; a++) {
      if (Math.abs(d[a]) < 1e-12) {
        if (o[a] < bx.min[a] || o[a] > bx.max[a]) return null;
        continue;
      }
      let ta = (bx.min[a] - o[a]) / d[a], tb = (bx.max[a] - o[a]) / d[a];
      let s = -1;
      if (ta > tb) {
        [ta, tb] = [tb, ta];
        s = 1;
      }
      if (ta > t0) {
        t0 = ta;
        nAx = a;
        nSign = s;
      }
      t1 = Math.min(t1, tb);
      if (t0 > t1) return null;
    }
    return { t: t0, nAx, nSign };
  }

  /** Voxel DDA: first solid cell along the ray (any solid, incl. glass). */
  function rayGrid(o, d, maxT) {
    let i = Math.floor(o[0] / CELL), j = Math.floor(o[1] / CELL), k = Math.floor(o[2] / CELL);
    const step = d.map((x) => (x > 0 ? 1 : x < 0 ? -1 : 0));
    const tMax = [0, 1, 2].map((a) => {
      if (!step[a]) return Infinity;
      const c = [i, j, k][a];
      const edge = (step[a] > 0 ? c + 1 : c) * CELL;
      return (edge - o[a]) / d[a];
    });
    const tDelta = [0, 1, 2].map((a) => (step[a] ? CELL / Math.abs(d[a]) : Infinity));
    let t = 0, lastAx = -1;
    for (let n = 0; n < 400 && t <= maxT; n++) {
      const v = cellAt(i, j, k);
      if (isSolidValue(v)) {
        const nrm = [0, 0, 0];
        if (lastAx >= 0) nrm[lastAx] = -step[lastAx];
        return { t, cell: [i, j, k], v, n: nrm };
      }
      const a = tMax[0] < tMax[1] ? (tMax[0] < tMax[2] ? 0 : 2) : tMax[1] < tMax[2] ? 1 : 2;
      t = tMax[a];
      tMax[a] += tDelta[a];
      if (a === 0) i += step[0];
      else if (a === 1) j += step[1];
      else k += step[2];
      lastAx = a;
    }
    return null;
  }

  function dynamicBoxes(exclude) {
    const out = [];
    for (const d of S.doors) {
      const bx = doorBox(d);
      if (bx) out.push(bx);
    }
    for (const p of S.platforms) out.push(platBox(p));
    for (const s of S.switches) out.push(switchBox(s));
    for (const c of S.cubes) if (c !== exclude && c !== S.held) out.push(bodyBox(c.body));
    return out;
  }

  /** What a portal shot from the eye would hit. */
  function aimPortal() {
    const o = eyePos();
    const d = lookVector(S.yaw, S.pitch);
    const g = rayGrid(o, d, 160);
    let best = g ? { t: g.t, grid: g } : null;
    for (const bx of dynamicBoxes()) {
      const r = rayBox(o, d, bx);
      if (r && r.t > 0 && (!best || r.t < best.t)) best = { t: r.t, box: bx };
    }
    if (!best) return null;
    const point = [o[0] + d[0] * best.t, o[1] + d[1] * best.t, o[2] + d[2] * best.t];
    if (best.box) return { ok: false, point, reason: "blocked" };
    const { cell, v, n } = best.grid;
    if (!n.some((x) => x)) return { ok: false, point, reason: "surface" };
    if (v !== WHITE) return { ok: false, point, n, reason: v === GLASS ? "glass" : "surface" };
    const front = [cell[0] + n[0], cell[1] + n[1], cell[2] + n[2]];
    if (cellAt(...front) !== EMPTY) return { ok: false, point, n, reason: "surface" };
    return { ok: true, point, n, cell, dir: d };
  }

  function fire(color) {
    if (S.state !== "play") return;
    if (level.locked?.includes(color)) {
      S.events.push({ type: "portalLocked", color });
      return;
    }
    S.lastFire = color;
    const a = aimPortal();
    if (!a || !a.ok) {
      S.events.push({ type: "portalFail", color, point: a?.point || null, n: a?.n || null, reason: a?.reason || "surface" });
      return;
    }
    const other = S.portals[OTHER[color]];
    const id = idx(...a.cell);
    if (other && other.idx === id && dot(other.n, a.n) > 0.5) {
      S.events.push({ type: "portalFail", color, point: a.point, n: a.n, reason: "occupied" });
      return;
    }
    const isFloor = a.n[1] !== 0;
    const up = isFloor ? snapHorizontal(a.dir) : [0, 1, 0];
    S.portals[color] = makePortal(color, a.cell, a.n, up);
    S.stats.portals++;
    S.events.push({ type: "portal", color, point: a.point, linked: !!linked() });
  }

  /* -------------------------------------------------------------- interaction */
  function findFocus() {
    if (S.held) return { kind: "drop", ref: S.held };
    const o = eyePos();
    const d = lookVector(S.yaw, S.pitch);
    let best = null;
    for (const c of S.cubes) {
      if (player.groundRef === c) continue;
      const r = rayBox(o, d, bodyBox(c.body));
      if (r && r.t < PLAYER.reach && (!best || r.t < best.t)) best = { t: r.t, kind: "cube", ref: c };
    }
    for (const s of S.switches) {
      const r = rayBox(o, d, { min: [s.pos[0] - 0.4, s.pos[1], s.pos[2] - 0.4], max: [s.pos[0] + 0.4, s.pos[1] + 1.4, s.pos[2] + 0.4] });
      if (r && r.t < PLAYER.reach && (!best || r.t < best.t)) best = { t: r.t, kind: "switch", ref: s };
    }
    if (best) {
      // a wall between the eye and the target hides it
      const g = rayGrid(o, d, best.t);
      if (g && g.t < best.t - 0.05) best = null;
    }
    if (!best) {
      // forgiving pick-up: a cube right in front of you
      for (const c of S.cubes) {
        if (player.groundRef === c) continue;
        const cc = center(c.body);
        const v = [cc[0] - o[0], cc[1] - o[1], cc[2] - o[2]];
        const dist = Math.hypot(...v);
        if (dist < 1.9 && dot(v, d) / dist > 0.8 && (!best || dist < best.t)) best = { t: dist, kind: "cube", ref: c };
      }
    }
    return best;
  }

  function use() {
    if (S.state !== "play") return;
    if (S.held) return drop();
    const f = findFocus();
    if (!f) {
      S.events.push({ type: "useNothing" });
      return;
    }
    if (f.kind === "cube") {
      S.held = f.ref;
      S.held.body.vel = [0, 0, 0];
      S.events.push({ type: "pickup", kind: f.ref.kind });
    } else if (f.kind === "switch") {
      const s = f.ref;
      if (s.time > 0) s.t = s.time;
      else s.on = !s.on;
      S.events.push({ type: "switch", timed: s.time > 0, on: s.time > 0 || s.on });
    }
  }

  /* -------------------------------------------------------------- logic */
  const active = (id) => !!S.signals.get(id);
  function condition(o) {
    if (!o.inputs || !o.inputs.length) return true;
    return o.any ? o.inputs.some(active) : o.inputs.every(active);
  }

  function updatePlates() {
    for (const p of S.plates) {
      const [i, j, k] = p.cell;
      const x0 = i * CELL + 0.3, x1 = i * CELL + CELL - 0.3, z0 = k * CELL + 0.3, z1 = k * CELL + CELL - 0.3, y = j * CELL;
      const on = (b) => b.pos[0] + b.hw > x0 && b.pos[0] - b.hw < x1 && b.pos[2] + b.hw > z0 && b.pos[2] - b.hw < z1 && b.pos[1] > y - 0.05 && b.pos[1] < y + 0.45;
      let hit = !p.cubeOnly && on(player);
      for (const c of S.cubes) if (!hit && c !== S.held && on(c.body)) hit = true;
      if (hit !== p.on) S.events.push({ type: hit ? "plateOn" : "plateOff" });
      p.on = hit;
    }
  }

  function traceBeams() {
    S.beams = [];
    for (const c of S.cubes) c.powered = false;
    const lit = new Set();
    for (const e of S.emitters) {
      if (!condition(e)) continue;
      const n = FACES[e.face];
      const [i, j, k] = e.cell;
      const o = [i * CELL + 1 + n[0] * 1.02, j * CELL + 1 + n[1] * 1.02, k * CELL + 1 + n[2] * 1.02];
      if (n[1] === 0) o[1] = j * CELL + BEAM_H;
      trace(o, n, 0, null, lit);
    }
    for (const r of S.receivers) {
      const on = lit.has(`${r.idx}|${r.face}`);
      if (on !== r.on) S.events.push({ type: on ? "receiverOn" : "receiverOff" });
      r.on = on;
    }
  }
  const faceName = (n) => (n[0] > 0 ? "px" : n[0] < 0 ? "nx" : n[1] > 0 ? "py" : n[1] < 0 ? "ny" : n[2] > 0 ? "pz" : "nz");

  function trace(o, d, depth, skipCube, lit) {
    if (depth > 14) return;
    const ax = axisOf(d), s = d[ax];
    // grid: march along the axis
    let c = [Math.floor(o[0] / CELL), Math.floor(o[1] / CELL), Math.floor(o[2] / CELL)];
    let tGrid = Infinity, hitCell = null;
    for (let n = 0; n < 200; n++) {
      const v = cellAt(c[0], c[1], c[2]);
      if (isSolidValue(v) && v !== GLASS) {
        const face = s > 0 ? c[ax] * CELL : c[ax] * CELL + CELL;
        tGrid = (face - o[ax]) * s;
        hitCell = [...c];
        break;
      }
      c[ax] += s;
    }
    let tBox = Infinity, box = null;
    for (const bx of dynamicBoxes()) {
      if (skipCube && bx.ref === skipCube) continue;
      let inside = true;
      for (let a = 0; a < 3; a++) if (a !== ax && (o[a] <= bx.min[a] || o[a] >= bx.max[a])) inside = false;
      if (!inside) continue;
      const t = s > 0 ? bx.min[ax] - o[ax] : o[ax] - bx.max[ax];
      if (t >= -1e-6 && t < tBox) (tBox = t), (box = bx);
    }
    const t = Math.min(tGrid, tBox);
    if (!Number.isFinite(t)) return;
    const end = [o[0] + d[0] * t, o[1] + d[1] * t, o[2] + d[2] * t];
    if (box && tBox <= tGrid) {
      const cube = S.cubes.find((cc) => cc === box.ref);
      if (cube && cube.kind === "reflector") {
        const cc = center(cube.body);
        const p = [...o];
        p[ax] = cc[ax];
        S.beams.push([o, p]);
        cube.powered = true;
        trace(p, cube.dir, depth + 1, cube, lit);
        return;
      }
      S.beams.push([o, end, "block"]);
      return;
    }
    S.beams.push([o, end, "wall"]);
    const id = idx(...hitCell);
    const n = [0, 0, 0];
    n[ax] = -s;
    if (linked()) {
      for (const color of ["blue", "orange"]) {
        const p = S.portals[color];
        if (p.idx === id && p.n[ax] === n[ax]) {
          const q = S.portals[OTHER[color]];
          const np = mapPoint(p, q, end);
          const nd = mapVec(p, q, d).map((x) => Math.round(x));
          np[q.axis] += q.n[q.axis] * 0.01;
          trace(np, nd, depth + 1, null, lit);
          return;
        }
      }
    }
    lit.add(`${id}|${faceName(n)}`);
  }

  function updateSignals() {
    const sig = S.signals;
    for (const p of S.plates) sig.set(p.id, p.on);
    for (const s of S.switches) sig.set(s.id, s.time > 0 ? s.t > 0 : s.on);
    for (const r of S.receivers) sig.set(r.id, r.on);
  }

  function updateDoors(dt) {
    for (const d of S.doors) {
      if (d.latch && d.open >= 1) d.latched = true;
      const want = d.latched || condition(d) ? 1 : 0;
      if (want === d.open) continue;
      const prev = d.open;
      d.open = want > d.open ? Math.min(1, d.open + dt * 2.4) : Math.max(0, d.open - dt * 2.4);
      if (want === 0) {
        const bx = doorBox(d);
        const bodies = [player, ...S.cubes.map((c) => c.body)];
        if (bx && bodies.some((b) => overlaps({ min: bmin(b), max: bmax(b) }, bx, -1))) d.open = prev; // never close on someone
      }
      if (prev === 0 || prev === 1) S.events.push({ type: want ? "doorOpen" : "doorClose", exit: !!d.exit });
    }
  }

  function updatePlatforms(dt) {
    for (const p of S.platforms) {
      let target;
      if (p.loop) {
        if (p.wait > 0) {
          p.wait -= dt;
          p.moving = false;
          continue;
        }
        if (p.inputs?.length && !condition(p)) {
          p.moving = false;
          continue;
        }
        target = p.toB ? p.b : p.a;
      } else target = condition(p) ? p.b : p.a;
      const dv = [target[0] - p.cur[0], target[1] - p.cur[1], target[2] - p.cur[2]];
      const dist = Math.hypot(...dv);
      if (dist < 1e-5) {
        p.moving = false;
        if (p.loop) {
          p.toB = !p.toB;
          p.wait = p.pause ?? 1.2;
        }
        continue;
      }
      const stepLen = Math.min(dist, p.speed * dt);
      const delta = dv.map((x) => (x / dist) * stepLen);
      const old = [...p.cur];
      const bodies = [player, ...S.cubes.filter((c) => c !== S.held).map((c) => c.body)];
      const riders = bodies.filter((b) => b.groundRef === p);
      p.cur = [p.cur[0] + delta[0], p.cur[1] + delta[1], p.cur[2] + delta[2]];
      for (const b of riders) for (const ax of [1, 0, 2]) if (delta[ax]) moveAxis(b, ax, delta[ax], p);
      // push anyone the platform moved into
      const pb = platBox(p);
      let blocked = false;
      for (const b of bodies) {
        if (riders.includes(b)) continue;
        const bb = { min: bmin(b), max: bmax(b) };
        if (!overlaps(bb, pb, -1)) continue;
        for (const ax of [0, 1, 2]) {
          if (!delta[ax]) continue;
          const need = delta[ax] > 0 ? pb.max[ax] - bb.min[ax] : pb.min[ax] - bb.max[ax];
          moveAxis(b, ax, need + Math.sign(need) * 1e-4, p);
        }
        if (overlaps({ min: bmin(b), max: bmax(b) }, pb, -1)) blocked = true;
      }
      if (blocked) p.cur = old;
      p.moving = !blocked;
    }
  }

  /* -------------------------------------------------------------- hazards / zones */
  function inGoo(b) {
    const i0 = Math.floor((b.pos[0] - b.hw) / CELL), i1 = Math.floor((b.pos[0] + b.hw) / CELL);
    const k0 = Math.floor((b.pos[2] - b.hw) / CELL), k1 = Math.floor((b.pos[2] + b.hw) / CELL);
    const j = Math.floor((b.pos[1] + 0.01) / CELL);
    for (let i = i0; i <= i1; i++)
      for (let k = k0; k <= k1; k++) if (cellAt(i, j, k) === GOO && b.pos[1] < j * CELL + 0.4) return true;
    return false;
  }

  function respawnPlayer(reason) {
    if (S.held) drop(true);
    player.pos = [...S.respawn.pos];
    player.vel = [0, 0, 0];
    player.tpLog = [];
    S.yaw = S.respawn.yaw;
    S.pitch = 0;
    S.stats.deaths++;
    S.events.push({ type: "respawn", reason });
  }

  function respawnCube(c) {
    if (S.held === c) drop(true);
    c.body.pos = [...c.spawn];
    c.body.vel = [0, 0, 0];
    c.dir = [...c.spawnDir];
    // if something sits on the dispenser spot, drop the cube from above it
    for (let n = 0; n < 6 && penetrating(c.body); n++) c.body.pos[1] += 0.9;
    S.events.push({ type: "cubeRespawn" });
  }

  function updateZones() {
    const pc = center(player);
    const ci = Math.floor(pc[0] / CELL), cj = Math.floor(player.pos[1] / CELL + 0.01), ck = Math.floor(pc[2] / CELL);
    level.checkpoints.forEach((cp, n) => {
      if (n <= S.checkpoint) return;
      if (cp.cell[0] === ci && cp.cell[1] === cj && cp.cell[2] === ck) {
        S.checkpoint = n;
        S.respawn = { pos: [ci * CELL + 1, cj * CELL + 0.01, ck * CELL + 1], yaw: cp.yaw };
        S.events.push({ type: "checkpoint" });
      }
    });
    const g = level.exit.goal;
    if (ci === g[0] && ck === g[2] && Math.abs(player.pos[1] - g[1] * CELL) < 1.2) {
      S.state = "complete";
      if (S.held) drop(true);
      S.events.push({ type: "complete" });
    }
  }

  function updatePads(dt) {
    for (const p of S.pads) {
      p.cool = Math.max(0, p.cool - dt);
      if (p.cool > 0) continue;
      const [i, j, k] = p.cell;
      const bodies = [player, ...S.cubes.filter((c) => c !== S.held).map((c) => c.body)];
      for (const b of bodies) {
        if (Math.floor(b.pos[0] / CELL) !== i || Math.floor(b.pos[2] / CELL) !== k) continue;
        if (b.pos[1] > j * CELL + 0.3 || b.pos[1] < j * CELL - 0.05 || b.vel[1] > 0.1) continue;
        b.vel = [...p.vel];
        b.grounded = false;
        p.cool = 0.4;
        S.events.push({ type: "pad" });
      }
    }
  }

  /* -------------------------------------------------------------- step */
  function update(dt, input = {}) {
    if (S.state !== "play") return;
    S.t += dt;
    if (input.lookX || input.lookY) {
      S.yaw -= input.lookX || 0;
      S.pitch = clamp(S.pitch - (input.lookY || 0), -1.52, 1.52);
    }
    if (input.yaw !== undefined) S.yaw = input.yaw;
    if (input.pitch !== undefined) S.pitch = clamp(input.pitch, -1.52, 1.52);

    // timers
    for (const s of S.switches) {
      if (s.time > 0 && s.t > 0) {
        const before = Math.ceil(s.t);
        s.t = Math.max(0, s.t - dt);
        if (Math.ceil(s.t) !== before) S.events.push({ type: s.t > 0 ? "tick" : "timerEnd", left: Math.ceil(s.t) });
      }
    }

    updatePlatforms(dt);
    updatePads(dt);

    // player
    const fw = [-Math.sin(S.yaw), 0, -Math.cos(S.yaw)];
    const rt = [Math.cos(S.yaw), 0, -Math.sin(S.yaw)];
    let wx = fw[0] * (input.mz || 0) + rt[0] * (input.mx || 0);
    let wz = fw[2] * (input.mz || 0) + rt[2] * (input.mx || 0);
    const wl = Math.hypot(wx, wz);
    if (wl > 1) (wx /= wl), (wz /= wl);
    const v = player.vel;
    if (player.wasGrounded) {
      const tx = wx * PLAYER.speed, tz = wz * PLAYER.speed;
      const dx = tx - v[0], dz = tz - v[2];
      const dl = Math.hypot(dx, dz), mx = PLAYER.groundAccel * dt;
      if (dl <= mx) (v[0] = tx), (v[2] = tz);
      else (v[0] += (dx / dl) * mx), (v[2] += (dz / dl) * mx);
      if (input.jump) {
        v[1] = PLAYER.jumpV;
        player.wasGrounded = false;
        S.events.push({ type: "jump" });
      }
    } else if (wl > 0.01) {
      const wn = Math.min(1, wl);
      const dx = wx / Math.max(wl, 1e-6), dz = wz / Math.max(wl, 1e-6);
      const cur = v[0] * dx + v[2] * dz;
      const add = PLAYER.speed * wn - cur;
      if (add > 0) {
        const a = Math.min(add, PLAYER.airAccel * dt);
        v[0] += dx * a;
        v[2] += dz * a;
      }
    }
    v[1] = Math.max(-PLAYER.maxFall, v[1] - PLAYER.gravity * dt);
    const wasAir = !player.wasGrounded;
    const fallV = v[1];
    moveBody(player, dt, true);
    if (player.grounded && wasAir && fallV < -9) S.events.push({ type: "land", v: -fallV });

    if (input.fire) fire(input.fire);
    if (input.use) use();

    // cubes
    if (S.held) placeHeld(false);
    for (const c of S.cubes) {
      if (c === S.held) continue;
      const b = c.body;
      b.vel[1] = Math.max(-PLAYER.maxFall, b.vel[1] - PLAYER.gravity * dt);
      if (b.wasGrounded) {
        const f = Math.exp(-10 * dt);
        b.vel[0] *= f;
        b.vel[2] *= f;
      }
      if (Math.abs(b.vel[0]) < 1e-3) b.vel[0] = 0;
      if (Math.abs(b.vel[2]) < 1e-3) b.vel[2] = 0;
      moveBody(b, dt, false);
      // a cube whose centre hangs over empty space tips off the ledge it rests on
      if (b.grounded && b.groundRef === null) {
        const ci = Math.floor(b.pos[0] / CELL), ck = Math.floor(b.pos[2] / CELL), cj = Math.floor((b.pos[1] - 0.05) / CELL);
        if (!solidFor(ci, cj, ck, b)) {
          for (const ax of [0, 2]) {
            const lo = Math.floor((b.pos[ax] - b.hw) / CELL), hi = Math.floor((b.pos[ax] + b.hw) / CELL);
            if (lo === hi) continue;
            const other = [ci, cj, ck];
            const mine = ax === 0 ? ci : ck;
            other[ax] = mine === lo ? hi : lo;
            if (solidFor(other[0], other[1], other[2], b)) b.vel[ax] = (mine === lo ? -1 : 1) * 1.6;
          }
        }
      }
      // reflector cubes glide onto the floor grid so beams line up with cell centres
      if (c.kind === "reflector" && b.grounded) {
        for (const ax of [0, 2]) {
          const tgt = Math.floor(b.pos[ax] / CELL) * CELL + 1;
          const d = tgt - b.pos[ax];
          if (Math.abs(d) > 1e-4) moveAxis(b, ax, Math.sign(d) * Math.min(Math.abs(d), 3 * dt));
        }
      }
      if (inGoo(b) || b.pos[1] < -6) respawnCube(c);
    }

    updatePlates();
    traceBeams();
    updateSignals();
    updateDoors(dt);

    if (inGoo(player)) respawnPlayer("goo");
    else if (player.pos[1] < -6) respawnPlayer("fall");
    updateZones();

    for (const c of ["blue", "orange"]) if (S.portals[c]) S.portals[c].age += dt;
    S.focus = findFocus();
  }

  /* -------------------------------------------------------------- queries for the UI / renderer */
  S.update = update;
  S.aimPortal = aimPortal;
  S.eye = eyePos;
  S.look = () => lookVector(S.yaw, S.pitch);
  S.linked = () => !!linked();
  S.active = active;
  S.condition = condition;
  S.doorBox = doorBox;
  S.timers = () => S.switches.filter((s) => s.time > 0 && s.t > 0).map((s) => ({ id: s.id, left: s.t, total: s.time }));
  S.exitOpen = () => {
    const d = S.doors.find((x) => x.exit);
    return !d || d.open >= 0.999;
  };
  S.cellAt = cellAt;
  S.penetrating = (b = player) => penetrating(b);
  S.respawnPlayer = respawnPlayer;
  S.setPortal = (color, cell, face, up) => {
    S.portals[color] = makePortal(color, cell, FACES[face], up ? FACES[up] : face === "py" || face === "ny" ? [0, 0, -1] : [0, 1, 0]);
  };
  S.clearPortal = (color) => {
    S.portals[color] = null;
  };
  return S;
}
