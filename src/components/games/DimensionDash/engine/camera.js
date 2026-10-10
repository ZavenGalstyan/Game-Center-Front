/**
 * Dimension Dash — unified camera controller (pure math; three/ only copies
 * the result onto a PerspectiveCamera).
 *
 * Modes (cam.label):
 *   SIDE_VIEW             2.5D zone: perpendicular to the plane, speed
 *                         look-ahead, dead-zone vertical tracking
 *   THIRD_PERSON          behind Sonic, mouse orbit, speed FOV, gentle
 *                         auto-recentre, collision pull-in
 *   CINEMATIC_TRANSITION  while blending between the two
 *   BOSS_CAMERA           frames Sonic + the boss (side or 3D arena)
 *
 * Both poses are computed every frame and expressed in ORBIT SPACE (focus,
 * yaw, pitch, distance, fov). The transition interpolates those parameters
 * (shortest-arc yaw), so the camera swings AROUND Sonic instead of cutting
 * through him, and never snaps. The mode is chosen by gameplay state only
 * (zone membership, rides, boss arena) — never by timers.
 */
import { insideTerrain, floorBelow } from "./geom.js";

const TRANSITION = 1.05; // seconds for a full side ⇄ third swing

export function createCamera() {
  return {
    mode: "third",
    label: "THIRD_PERSON",
    w: 1, // 0 = side pose, 1 = third pose
    yaw: 0,
    pitch: 0.28,
    pref: 7.6,
    sens: 1,
    invertY: false,
    idleT: 0,
    lastZone: null,
    side: { la: 0, fy: 0, fx: 0, fz: 0, init: false },
    third: { fx: 0, fy: 0, fz: 0, init: false },
    px: 0,
    py: 5,
    pz: -8,
    tx: 0,
    ty: 0,
    tz: 0,
    fov: 60,
    shake: 0,
    snap: true,
    distNow: 7.6,
  };
}

export function addShake(cam, k) {
  cam.shake = Math.min(1.2, cam.shake + k);
}

const ang = (a) => {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
};
const damp = (cur, want, rate, dt) => cur + (want - cur) * (1 - Math.exp(-rate * dt));
const smooth = (t) => t * t * (3 - 2 * t);

/** look = { dx, dy } mouse deltas (px) since last frame; settings = { sensitivity, invertY, camDistance, reducedMotion } */
export function updateCamera(W, dt, look, settings = {}) {
  const cam = W.cam;
  const p = W.player;
  const boss = W.boss && W.boss.active ? W.boss : null;
  dt = Math.min(dt, 0.05);

  // ---- which mode does gameplay ask for?
  let want = "third";
  let zone = null;
  if (p.mode === "side") zone = p.zone;
  else if ((p.mode === "ride" && p.ride && p.ride.from === "side") || (p.mode === "rail" && p.rail && p.rail.from === "side")) zone = (p.ride || p.rail).zone;
  if (zone) want = "side";
  if (boss && boss.arena === "side" && boss.zone) {
    zone = boss.zone;
    want = "side";
  }
  if (zone) cam.lastZone = zone;
  if (want !== cam.mode) {
    cam.mode = want;
    if (want === "third") {
      // swing in behind the direction of travel
      const sp = Math.hypot(p.vx, p.vz);
      cam.yaw = sp > 1 ? Math.atan2(p.vx, p.vz) : p.facing;
      cam.pitch = 0.26;
      cam.idleT = 2;
    }
  }
  const target = cam.mode === "third" ? 1 : 0;
  if (cam.snap) {
    cam.w = target;
  } else {
    const k = dt / TRANSITION;
    cam.w = target > cam.w ? Math.min(target, cam.w + k) : Math.max(target, cam.w - k);
  }

  // ---- mouse orbit (3D only; ignored while the side camera owns the view)
  const sens = 0.0026 * (settings.sensitivity ?? 1);
  const lookActive = cam.w > 0.5 && look && (look.dx || look.dy);
  if (lookActive) {
    cam.yaw = ang(cam.yaw - look.dx * sens);
    cam.pitch = Math.max(-0.25, Math.min(1.15, cam.pitch + look.dy * sens * (settings.invertY ? -1 : 1)));
    cam.idleT = 0;
  } else cam.idleT += dt;

  const S = sidePose(W, cam, cam.lastZone, dt, boss);
  const T = thirdPose(W, cam, dt, boss, settings);

  // ---- blend in orbit space
  const e = smooth(cam.w);
  const fx = S.fx + (T.fx - S.fx) * e;
  const fy = S.fy + (T.fy - S.fy) * e;
  const fz = S.fz + (T.fz - S.fz) * e;
  const yaw = S.yaw + ang(T.yaw - S.yaw) * e;
  const pitch = S.pitch + (T.pitch - S.pitch) * e;
  let dist = S.dist + (T.dist - S.dist) * e;
  // lift the camera a little mid-swing so it arcs over obstacles
  const arc = Math.sin(Math.PI * e) * 0.18;
  const fov = S.fov + (T.fov - S.fov) * e;

  // collision pull-in (strongest in 3D, harmless on the side)
  const cp = Math.cos(pitch + arc);
  const dirx = -Math.sin(yaw) * cp;
  const diry = Math.sin(pitch + arc);
  const dirz = -Math.cos(yaw) * cp;
  if (e > 0.05) dist = Math.min(dist, clearDistance(W, fx, fy, fz, dirx, diry, dirz, dist));
  cam.distNow = cam.snap ? dist : Math.min(dist, damp(cam.distNow, dist, dist < cam.distNow ? 30 : 4, dt));
  dist = cam.distNow;

  let px = fx + dirx * dist;
  let py = fy + diry * dist;
  let pz = fz + dirz * dist;
  // never below the ground under the camera
  const o = {};
  if (floorBelow(W.geom, px, pz, py + 2.5, py - 0.6, o)) py = Math.max(py, o.y + 0.6);

  // shake
  if (cam.shake > 0) {
    const k = cam.shake * (settings.reducedMotion ? 0.25 : 1) * 0.35;
    px += (Math.random() - 0.5) * k;
    py += (Math.random() - 0.5) * k;
    pz += (Math.random() - 0.5) * k;
    cam.shake = Math.max(0, cam.shake - dt * 2.4);
  }

  cam.px = px;
  cam.py = py;
  cam.pz = pz;
  cam.tx = fx;
  cam.ty = fy;
  cam.tz = fz;
  cam.fov = fov;
  // the yaw that "forward" means for WASD — the camera's view heading
  cam.viewYaw = yaw;
  cam.label = cam.w <= 0.001 ? (boss ? "BOSS_CAMERA" : "SIDE_VIEW") : cam.w >= 0.999 ? (boss ? "BOSS_CAMERA" : "THIRD_PERSON") : "CINEMATIC_TRANSITION";
  cam.snap = false;
  return cam;
}

function sidePose(W, cam, Z, dt, boss) {
  const p = W.player;
  const st = cam.side;
  if (!Z) {
    // no zone known yet: mirror the third-person pose
    return { fx: p.x, fy: p.y + 1.2, fz: p.z, yaw: cam.yaw, pitch: cam.pitch, dist: cam.pref, fov: 60 };
  }
  const vf = p.vx * Z.fx + p.vz * Z.fz;
  const laWant = Math.max(-6.5, Math.min(6.5, vf * 0.3));
  // focus point projected onto the plane
  const s = (p.x - Z.ox) * Z.fx + (p.z - Z.oz) * Z.fz;
  let fs = s;
  let dist = Z.cam.dist + Math.min(7, Math.abs(vf) * 0.12);
  if (boss && boss.arena === "side") {
    const bs = (boss.x - Z.ox) * Z.fx + (boss.z - Z.oz) * Z.fz;
    fs = (s + bs) / 2;
    dist = Math.max(dist, 17 + Math.abs(bs - s) * 0.45);
  }
  if (!st.init || cam.snap || st.zone !== Z) {
    st.la = laWant;
    st.fy = p.y + Z.cam.height;
    st.init = true;
    st.zone = Z;
  }
  st.la = damp(st.la, laWant, 2.2, dt);
  // vertical: dead-zone tracking — follow loosely while jumping, firmly when far / grounded
  const wantY = p.y + Z.cam.height;
  const dy = wantY - st.fy;
  const grounded = p.grounded || p.mode === "ride" || p.mode === "rail";
  const rate = grounded ? 5 : Math.abs(dy) > 2.6 ? 6 : dy < -0.5 ? 3 : 1.2;
  st.fy = damp(st.fy, wantY, rate, dt);
  const f = fs + st.la;
  const fx = Z.ox + Z.fx * f;
  const fz = Z.oz + Z.fz * f;
  // camera sits on the +N side looking along -N (so +F is screen-right)
  const yaw = Math.atan2(-Z.nx, -Z.nz);
  return { fx, fy: st.fy, fz, yaw, pitch: 0.1, dist, fov: 50 };
}

function thirdPose(W, cam, dt, boss, settings) {
  const p = W.player;
  const st = cam.third;
  let px = p.x;
  let py = p.y + 1.25;
  let pz = p.z;
  if (p.sw) {
    const k = p.sw.t / p.sw.T;
    px += p.sw.ox * k;
    py += p.sw.oy * k;
    pz += p.sw.oz * k;
  }
  const sp = Math.hypot(p.vx, p.vz);
  const ride3d = p.mode === "ride" && p.ride && p.ride.from === "free";
  if (ride3d) {
    // keep the loop framed: focus drifts toward the loop centre, yaw locked to its heading
    const e = p.ride.r.entry;
    py = py * 0.45 + (e.y + (p.ride.r.radius || 5)) * 0.55;
  }
  if (!st.init || cam.snap) {
    st.fx = px;
    st.fy = py;
    st.fz = pz;
    st.init = true;
  }
  st.fx = damp(st.fx, px, 18, dt);
  st.fy = damp(st.fy, py, p.grounded ? 10 : 5, dt);
  st.fz = damp(st.fz, pz, 18, dt);

  // auto-recentre behind the travel direction (gentle; mouse always wins)
  let yawWant = null;
  let rate = 0;
  if (ride3d) {
    const e = p.ride.r.entry;
    yawWant = Math.atan2(e.dx, e.dz);
    rate = 4;
  } else if (boss && boss.arena !== "side") {
    yawWant = Math.atan2(boss.x - p.x, boss.z - p.z);
    rate = cam.idleT > 0.6 ? 2.5 : 0;
  } else if (p.mode === "rail" && sp > 2) {
    yawWant = Math.atan2(p.vx, p.vz);
    rate = cam.idleT > 0.4 ? 3.2 : 0.8;
  } else if (sp > 6 && (p.grounded || p.mode === "ride")) {
    yawWant = Math.atan2(p.vx, p.vz);
    const auto = settings.camAssist === false ? 0 : 1;
    rate = auto * (cam.idleT > 1 ? 1.2 + Math.min(1.6, sp / 18) : 0.25 * Math.min(1, sp / 20));
  }
  if (yawWant != null && rate > 0) cam.yaw = cam.yaw + ang(yawWant - cam.yaw) * (1 - Math.exp(-rate * dt));
  if (cam.idleT > 1.5 && !boss) cam.pitch = damp(cam.pitch, 0.26, 0.8, dt);

  const pref = settings.camDistance ?? cam.pref;
  let dist = pref + Math.min(3.2, sp * 0.07);
  let fx = st.fx;
  let fy = st.fy;
  let fz = st.fz;
  if (boss && boss.arena !== "side") {
    fx = st.fx * 0.72 + boss.x * 0.28;
    fz = st.fz * 0.72 + boss.z * 0.28;
    fy = st.fy * 0.8 + (boss.y + 2) * 0.2;
    dist = Math.max(dist, 10 + Math.hypot(boss.x - p.x, boss.z - p.z) * 0.18);
  }
  if (ride3d) dist += 3;
  const fov = Math.min(82, 62 + sp * 0.5);
  return { fx, fy, fz, yaw: cam.yaw, pitch: cam.pitch + (ride3d ? 0.15 : 0), dist, fov };
}

/** march from the focus toward the desired camera spot; stop before solids / terrain */
function clearDistance(W, fx, fy, fz, dx, dy, dz, dist) {
  const n = 14;
  for (let i = 1; i <= n; i++) {
    const t = (i / n) * dist;
    const x = fx + dx * t;
    const y = fy + dy * t;
    const z = fz + dz * t;
    if (insideTerrain(W.geom, x, y, z) || insideBox(W, x, y, z)) return Math.max(1.6, t - dist / n - 0.3);
  }
  return dist;
}

function insideBox(W, x, y, z) {
  for (const b of W.geom.boxes) {
    if (!b.on || !b.solid) continue;
    if (y > b.y + b.hy + 0.3 || y < b.y - b.hy - 0.3) continue;
    const px = x - b.x;
    const pz = z - b.z;
    if (Math.abs(px) > b.hx + b.hz + 0.5 || Math.abs(pz) > b.hx + b.hz + 0.5) continue;
    const lx = px * b.c - pz * b.s;
    const lz = px * b.s + pz * b.c;
    if (Math.abs(lx) < b.hx + 0.3 && Math.abs(lz) < b.hz + 0.3) return true;
  }
  return false;
}
