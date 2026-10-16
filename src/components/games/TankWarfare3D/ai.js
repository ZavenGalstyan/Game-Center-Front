/**
 * Tank Warfare 3D — NPC brains (enemy tanks, allied tanks, convoy and supply
 * trucks, training targets).
 *
 * Every armed unit runs the same combat state machine:
 *   patrol/guard/hold/hunt/assault…  (order behaviour while no target)
 *   detect → approach → attack → (cover | reposition) → attack …
 *   retreat when badly damaged (once), then fight back from cover
 *
 * Perception runs at 5 Hz: hostiles within sight range with a clear line of
 * sight (terrain, obstacles and smoke block it) are noticed after a
 * difficulty-dependent reaction time. Being shot reveals the shooter.
 * Movement uses the nav-grid A* (map.js) with waypoint following, tank
 * separation steering and stuck recovery, so units go around buildings and
 * each other. Aiming leads moving targets (difficulty `lead`) and carries a
 * per-shot random error (difficulty `aimErr`), so nobody is perfectly accurate.
 *
 * Steering convention (see sim.driveTank): steer +1 = turn right = heading decreases.
 */
import { AMMO } from "./data.js";

const TAU = Math.PI * 2;
const wrapPi = (a) => {
  a = (a + Math.PI) % TAU;
  if (a < 0) a += TAU;
  return a - Math.PI;
};
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

export function createBrain(sim, t, o = {}) {
  const b = {
    order: o.order || "guard",
    state: "idle",
    stateT: 0,
    home: [t.x, t.z],
    patrol: o.patrol || null,
    pIdx: o.pIdx || 0,
    zone: o.zone || null,
    path: null,
    pi: 0,
    goal: null,
    replanT: 0,
    target: null,
    visible: false,
    seeT: 0,
    lostT: 99,
    lastSeen: null,
    aware: false,
    thinkT: sim.rand() * 0.2,
    err: { x: 0, y: 0, z: 0 },
    errT: 0,
    stuckT: 0,
    backT: 0,
    backSteer: 1,
    dur: 4,
    cover: null,
    repo: null,
    retreated: false,
    progress: 0,
    route: null,
    ri: 0,
    slot: o.slot || 0,
    huntT: 0,
  };
  if (o.route === "road") {
    b.route = sim.map.roads[0].pts.slice().reverse();
    b.ri = 1;
  }
  if (o.order === "convoy") {
    b.route = o.path;
    b.ri = 1;
  }
  if (o.order === "follow") b.slot = sim.tanks.filter((x) => x.brain && x.brain.order === "follow").length;
  return b;
}

/** Called by the sim when the unit takes damage. */
export function aiNotifyHit(sim, t, from) {
  const b = t.brain;
  if (!b || !from || from.side === t.side || !from.alive) return;
  if (!b.target || !b.aware || b.target !== from) {
    if (!b.target || !b.visible || Math.hypot(from.x - t.x, from.z - t.z) < Math.hypot(b.target.x - t.x, b.target.z - t.z)) {
      b.target = from;
      b.lastSeen = [from.x, from.z];
      b.lostT = 0;
    }
  }
  if (!b.aware) {
    b.aware = true;
    b.seeT = 99;
    if (b.state === "idle") setState(b, "detect");
  }
  if (t.hidden) t.revealT = Math.max(t.revealT, 5);
  const hpF = t.hp / t.maxHp;
  if (!t.boss && !b.retreated && hpF < 0.32 && b.order !== "hold" && !t.unarmed && b.order !== "escape") {
    b.retreated = true;
    setState(b, "retreat");
  } else if ((b.state === "attack" || b.state === "approach") && hpF < 0.65 && sim.rand() < sim.diff.cover * 0.5 && b.order !== "hold") {
    setState(b, "cover");
  }
}

function setState(b, s) {
  if (b.state === s) return;
  b.state = s;
  b.stateT = 0;
  b.path = null;
  b.cover = null;
  b.repo = null;
  b.dur = 3 + Math.random() * 4;
}

/* ------------------------------------------------------------------ perception */
function hostilesOf(sim, t) {
  const out = [];
  for (const o of sim.tanks) {
    if (!o.alive || o === t || o.escaped) continue;
    if (t.side === "enemy" ? o.side === "player" || o.side === "ally" : o.side === "enemy" && o.type !== "dummy") out.push(o);
  }
  return out;
}

function perceive(sim, t, b) {
  // camouflaged units only spring their ambush on what comes close
  const sight = (t.hidden ? 95 : t.st.sight || 140) * (t.side === "enemy" ? sim.diff.sightMul : 1);
  const ey = t.y + (t.L.ty || 1.6) * t.scale + 0.4;
  const cands = [];
  for (const o of hostilesOf(sim, t)) {
    const d = Math.hypot(o.x - t.x, o.z - t.z);
    if (d > sight) continue;
    let score = d;
    if (o === b.target) score *= 0.7;
    if (b.order === "convoyAttack" && o.type === "convoy") score *= 0.45;
    if (o.side === "player") score *= 0.9;
    if (o.type === "convoy" && b.order !== "convoyAttack") score *= 1.6;
    cands.push([score, d, o]);
  }
  cands.sort((a, c) => a[0] - c[0]);
  let found = null;
  for (let k = 0; k < Math.min(3, cands.length); k++) {
    const o = cands[k][2];
    const oy = o.y + o.L.top * o.scale * 0.85;
    if (sim.los(t.x, ey, t.z, o.x, oy, o.z)) {
      found = o;
      break;
    }
  }
  const react = t.side === "enemy" ? sim.diff.react : 0.6;
  if (found) {
    if (found !== b.target) {
      if (b.target !== found && b.aware && b.target && b.visible) b.seeT = Math.max(b.seeT, react * 0.6);
      b.target = found;
    }
    b.visible = true;
    b.lostT = 0;
    b.seeT += 0.2;
    b.lastSeen = [found.x, found.z];
    if (b.seeT >= react) b.aware = true;
  } else {
    b.visible = false;
    b.lostT += 0.2;
    b.seeT = Math.max(0, b.seeT - 0.1);
    if (b.target && !b.target.alive) {
      b.target = null;
      b.aware = false;
    }
    if (b.lostT > 14 && b.order !== "hunt") {
      b.target = null;
      b.aware = false;
    }
  }
  // hunters always have a rough idea where the player is
  if ((b.order === "hunt" || b.order === "assault" || b.order === "convoyAttack") && t.side === "enemy") {
    b.huntT -= 0.2;
    if (b.huntT <= 0) {
      b.huntT = 2.5;
      let prey = sim.player.alive ? sim.player : null;
      if (b.order === "convoyAttack") {
        const trucks = sim.tanks.filter((o) => o.alive && o.type === "convoy" && !o.arrived);
        if (trucks.length) prey = trucks.reduce((a, c) => (Math.hypot(c.x - t.x, c.z - t.z) < Math.hypot(a.x - t.x, a.z - t.z) ? c : a));
      }
      if (prey && !b.visible && b.order !== "assault") {
        b.lastSeen = [prey.x + (sim.rand() - 0.5) * 20, prey.z + (sim.rand() - 0.5) * 20];
        if (!b.target) b.target = prey;
      }
    }
  }
}

/* ------------------------------------------------------------------ movement */
function steerTo(sim, t, b, wx, wz, speed, c) {
  const dx = wx - t.x;
  const dz = wz - t.z;
  const dist = Math.hypot(dx, dz);
  const desired = Math.atan2(dx, dz);
  let diff = wrapPi(desired - t.heading);
  let steer = clamp(-diff * 2.2, -1, 1);
  let thr = speed * clamp(1 - Math.abs(diff) / 1.3, 0, 1);
  if (Math.abs(diff) > 1.15) thr = 0.08;
  if (dist < 4) thr *= dist / 4;
  // separation from other vehicles ahead
  const fx = Math.sin(t.heading);
  const fz = Math.cos(t.heading);
  for (const o of sim.tanks) {
    if (o === t || !o.alive) continue;
    const ox = o.x - t.x;
    const oz = o.z - t.z;
    const d = Math.hypot(ox, oz);
    if (d > 13 || d < 0.01) continue;
    const ahead = (ox * fx + oz * fz) / d;
    if (ahead < 0.25) continue;
    // o to the left (cross > 0 means left in this frame) → steer right
    const cross = fx * oz - fz * ox;
    const left = cross < 0 ? 1 : -1;
    steer += left * 0.9 * (1 - d / 13) * ahead;
    if (d < 7.5 && ahead > 0.6) thr *= 0.35;
  }
  // wrecks ahead
  for (const w of sim.wrecks) {
    const ox = w.x - t.x;
    const oz = w.z - t.z;
    const d = Math.hypot(ox, oz);
    if (d > w.r + 9) continue;
    const ahead = (ox * fx + oz * fz) / Math.max(0.01, d);
    if (ahead < 0.4) continue;
    const cross = fx * oz - fz * ox;
    steer += (cross < 0 ? 1 : -1) * 0.8 * ahead;
  }
  c.steer = clamp(steer, -1, 1);
  c.throttle = thr;
  // stuck recovery
  if (thr > 0.3 && Math.abs(t.speed) < 0.6) {
    b.stuckT += 1 / 60;
    if (b.stuckT > 1.3) {
      b.stuckT = 0;
      b.backT = 1.2 + sim.rand() * 0.6;
      b.backSteer = sim.rand() < 0.5 ? -1 : 1;
      b.replanT = 0;
    }
  } else b.stuckT = Math.max(0, b.stuckT - 1 / 120);
  return dist;
}

/** Follow an A* path to (x,z). Returns the remaining straight distance. */
function moveTo(sim, t, b, x, z, speed, c) {
  const nav = sim.map.nav;
  b.replanT -= 1 / 60;
  const goalMoved = !b.goal || Math.hypot(b.goal[0] - x, b.goal[1] - z) > 8;
  if (!b.path || b.replanT <= 0 || goalMoved) {
    b.goal = [x, z];
    b.path = nav.findPath(t.x, t.z, x, z, 26000) || [[x, z]];
    b.pi = 0;
    b.replanT = 3 + sim.rand() * 1.5;
  }
  while (b.pi < b.path.length - 1 && Math.hypot(b.path[b.pi][0] - t.x, b.path[b.pi][1] - t.z) < 5) b.pi++;
  const wp = b.path[Math.min(b.pi, b.path.length - 1)];
  steerTo(sim, t, b, wp[0], wp[1], speed, c);
  return Math.hypot(x - t.x, z - t.z);
}

function faceTarget(t, tx, tz, c) {
  const diff = wrapPi(Math.atan2(tx - t.x, tz - t.z) - t.heading);
  c.throttle = 0;
  c.steer = Math.abs(diff) > 0.5 ? clamp(-diff * 1.5, -1, 1) : 0;
}

/* ------------------------------------------------------------------ cover / reposition points */
function findCover(sim, t, from) {
  const map = sim.map;
  const nav = map.nav;
  const list = map.query(t.x - 50, t.z - 50, t.x + 50, t.z + 50, []);
  let best = null;
  let bd = Infinity;
  const fy = from.y + 2;
  for (const o of list) {
    if (!o.cover || !sim.obAlive[o.i] || o.h < 2.2) continue;
    const vx = o.x - from.x;
    const vz = o.z - from.z;
    const vl = Math.hypot(vx, vz) || 1;
    const back = o.shape === "cyl" ? o.r + 4.2 : Math.min(o.hx, o.hz) + 4.6;
    const px = o.x + (vx / vl) * back;
    const pz = o.z + (vz / vl) * back;
    if (!nav.inMain(px, pz)) continue;
    if (Math.hypot(px - from.x, pz - from.z) < 28) continue;
    const d = Math.hypot(px - t.x, pz - t.z);
    if (d > 55 || d >= bd) continue;
    if (sim.los(px, map.groundAt(px, pz) + 2.2, pz, from.x, fy, from.z)) continue;
    best = [px, pz];
    bd = d;
  }
  return best;
}

function findReposition(sim, t, target, pref) {
  const nav = sim.map.nav;
  const base = Math.atan2(t.x - target.x, t.z - target.z);
  for (let k = 0; k < 6; k++) {
    const side = sim.rand() < 0.5 ? -1 : 1;
    const ang = base + side * (0.6 + sim.rand() * 0.8);
    const d = pref * (0.8 + sim.rand() * 0.4);
    const px = target.x + Math.sin(ang) * d;
    const pz = target.z + Math.cos(ang) * d;
    if (Math.abs(px) > 185 || Math.abs(pz) > 185) continue;
    if (!nav.inMain(px, pz)) continue;
    return [px, pz];
  }
  return null;
}

/* ------------------------------------------------------------------ aiming */
function aimAt(sim, t, b, tgt, c) {
  const d = Math.hypot(tgt.x - t.x, tgt.z - t.z);
  const v = AMMO.ap.speed * (t.st.shellSpeed || 1);
  const tf = d / v;
  const lead = t.side === "enemy" ? sim.diff.lead : 0.7;
  b.errT -= 1 / 60;
  if (b.rangeOn !== tgt) {
    b.rangeOn = tgt;
    b.ranging = 0;
  }
  if (b.errT <= 0) {
    // ranging: the first shots at a new target are wide, then they bracket in
    const D = sim.diff;
    const ranging = t.side === "enemy" ? Math.max(D.rangeFloor, 1.6 - b.ranging * 0.3) : 0.9;
    const base = (t.side === "enemy" ? sim.diff.aimErr : 0.03) * ranging;
    const moving = Math.min(1, Math.abs(t.speed) / 6) * 0.9 + Math.min(1, Math.hypot(tgt.vx || 0, tgt.vz || 0) / 8) * 0.5;
    const mag = (d * base * (1 + moving) + (t.side === "enemy" ? D.errMin : 0.6)) * (t.boss ? 0.8 : 1);
    // error perpendicular to the line of fire: lateral + vertical (depth barely matters for a flat shot)
    const a = sim.rand() * TAU;
    const r = (0.3 + sim.rand() * 0.7) * mag;
    b.err.x = Math.cos(a) * r; // lateral
    b.err.y = Math.sin(a) * r * 0.45; // vertical
    b.errT = 1.1 + sim.rand() * 0.8;
  }
  const ty = tgt.y + (tgt.L ? tgt.L.top * tgt.scale * 0.6 : 1.2);
  const ux = d > 0.1 ? (tgt.z - t.z) / d : 1;
  const uz = d > 0.1 ? -(tgt.x - t.x) / d : 0;
  c.aim = { x: tgt.x + (tgt.vx || 0) * tf * lead + ux * b.err.x, y: ty + b.err.y, z: tgt.z + (tgt.vz || 0) * tf * lead + uz * b.err.x };
  // fire when the gun is on the solution
  const yawErr = Math.abs(wrapPi(t.aimYaw - (t.heading + t.tLocal)));
  const elErr = Math.abs(t.aimElev - t.elev);
  const range = t.st.range || 150;
  if (t.reload <= 0 && yawErr < 0.03 && elErr < 0.03 && d < range && b.aware && (b.visible || b.lostT < 0.3)) c.fire = true;
  return d;
}

function aimAtStruct(t, s, c) {
  c.aim = { x: s.x, y: (s.y0 + s.y1) / 2, z: s.z };
  const yawErr = Math.abs(wrapPi(t.aimYaw - (t.heading + t.tLocal)));
  const elErr = Math.abs(t.aimElev - t.elev);
  if (t.reload <= 0 && yawErr < 0.04 && elErr < 0.04) c.fire = true;
}

/* ------------------------------------------------------------------ think */
export function thinkAI(sim, t, dt) {
  const b = t.brain;
  const c = { throttle: 0, steer: 0, aim: null, fire: false, boost: false };
  if (!b) return c;
  b.stateT += dt;
  if (b.order === "dummy") return c;
  if (b.order === "mover") {
    const q = b.patrol[b.pIdx];
    if (Math.hypot(q[0] - t.x, q[1] - t.z) < 6) b.pIdx = (b.pIdx + 1) % b.patrol.length;
    steerTo(sim, t, b, q[0], q[1], 0.55, c);
    return c;
  }
  // backing out of a jam
  if (b.backT > 0) {
    b.backT -= dt;
    c.throttle = -0.7;
    c.steer = b.backSteer;
    if (b.target && b.aware && !t.unarmed) aimAt(sim, t, b, b.target, c);
    return c;
  }
  if (b.order === "escape") return thinkEscape(sim, t, b, c);
  if (b.order === "convoy") return thinkConvoy(sim, t, b, c);

  b.thinkT -= dt;
  if (b.thinkT <= 0) {
    b.thinkT = 0.2;
    perceive(sim, t, b);
  }
  const tgt = b.target && b.target.alive ? b.target : null;
  if (!tgt && b.state !== "idle" && b.state !== "retreat") setState(b, "idle");
  if (tgt && b.aware && b.state === "idle") setState(b, "detect");

  const pref = t.st.pref || 70;
  const hold = b.order === "hold";
  const anchor = allyAnchor(sim, t, b);

  // defendHQ assault: shoot the HQ when no tank threat is close
  const hqStage = sim.mode === "campaign" && sim.stage?.def.type === "defendHQ" ? sim.stage.hq : null;
  if (hqStage && hqStage.alive && b.order === "assault" && t.side === "enemy") {
    const dHQ = Math.hypot(hqStage.x - t.x, hqStage.z - t.z);
    const threatClose = tgt && b.visible && Math.hypot(tgt.x - t.x, tgt.z - t.z) < 45;
    if (!threatClose) {
      if (dHQ > 70) moveTo(sim, t, b, hqStage.x, hqStage.z, 0.8, c);
      else if (!sim.los(t.x, t.y + 2.2, t.z, hqStage.x, (hqStage.y0 + hqStage.y1) / 2, hqStage.z)) moveTo(sim, t, b, hqStage.x, hqStage.z, 0.6, c);
      else faceTarget(t, hqStage.x, hqStage.z, c);
      if (dHQ < 140 && sim.los(t.x, t.y + 2.2, t.z, hqStage.x, (hqStage.y0 + hqStage.y1) / 2, hqStage.z)) aimAtStruct(t, hqStage, c);
      else if (tgt && b.aware) aimAt(sim, t, b, tgt, c);
      return c;
    }
  }

  switch (b.state) {
    case "idle":
      idleOrder(sim, t, b, c, anchor);
      break;
    case "detect":
      // stop and bring the gun around
      if (tgt) {
        aimAt(sim, t, b, tgt, c);
        c.fire = false;
        if (b.stateT > 0.5) setState(b, !hold && (!b.visible || Math.hypot(tgt.x - t.x, tgt.z - t.z) > pref * 1.3) ? "approach" : "attack");
      }
      break;
    case "approach": {
      if (!tgt) break;
      const goal = b.visible ? [tgt.x, tgt.z] : b.lastSeen || [tgt.x, tgt.z];
      let gx = goal[0];
      let gz = goal[1];
      if (anchor) {
        // allies stay leashed to their anchor
        const ad = Math.hypot(gx - anchor[0], gz - anchor[1]);
        if (ad > 55) {
          gx = anchor[0] + ((gx - anchor[0]) / ad) * 55;
          gz = anchor[1] + ((gz - anchor[1]) / ad) * 55;
        }
      }
      const d = moveTo(sim, t, b, gx, gz, 0.85, c);
      aimAt(sim, t, b, tgt, c);
      const dt2 = Math.hypot(tgt.x - t.x, tgt.z - t.z);
      if (b.visible && dt2 < pref * (0.85 + sim.diff.aggression * 0.2)) setState(b, "attack");
      else if (d < 6 && !b.visible) {
        if (b.lostT > 10) setState(b, "idle");
      }
      if (hold) setState(b, "attack");
      break;
    }
    case "attack": {
      if (!tgt) break;
      const d = aimAt(sim, t, b, tgt, c);
      if (!hold) {
        if (d < pref * 0.4) {
          // too close — back off while keeping the front towards them
          const diff = wrapPi(Math.atan2(tgt.x - t.x, tgt.z - t.z) - t.heading);
          c.throttle = -0.6;
          c.steer = clamp(-diff * 1.2, -1, 1);
        } else faceTarget(t, tgt.x, tgt.z, c);
        if (t.sniper || t.st.sniper) c.steer *= 0.6;
      } else {
        const diff = wrapPi(Math.atan2(tgt.x - t.x, tgt.z - t.z) - t.heading);
        // tank destroyers swing the hull when the target leaves the turret arc
        if (Math.abs(diff) > 1.1) c.steer = clamp(-diff, -1, 1);
      }
      if (!b.visible && b.lostT > 1.6 && !hold) setState(b, "approach");
      else if (d > (t.st.range || 150) * 0.95 && !hold) setState(b, "approach");
      else if (b.stateT > b.dur && !hold) {
        const r = sim.rand();
        const hpF = t.hp / t.maxHp;
        if (t.side === "enemy" && r < sim.diff.cover * (1.1 - hpF) && b.reloadCover !== false) setState(b, "cover");
        else if (r < sim.diff.aggression * 0.55) setState(b, "reposition");
        else b.stateT = 0;
      }
      break;
    }
    case "cover": {
      if (!tgt) break;
      if (!b.cover && b.stateT < 0.3) b.cover = findCover(sim, t, tgt) || "none";
      if (b.cover === "none") {
        setState(b, "reposition");
        break;
      }
      if (b.cover) {
        const d = moveTo(sim, t, b, b.cover[0], b.cover[1], 1, c);
        if (b.visible) aimAt(sim, t, b, tgt, c);
        else c.aim = { x: tgt.x, y: tgt.y + 1.4, z: tgt.z };
        if (d < 3.5) {
          c.throttle = 0;
          c.steer = 0;
          if (!b.coverT) b.coverT = b.stateT;
        }
        if ((b.coverT && b.stateT - b.coverT > 3 + sim.rand() * 2) || b.stateT > 14) {
          b.coverT = 0;
          setState(b, "approach");
        }
      }
      break;
    }
    case "reposition": {
      if (!tgt) break;
      if (!b.repo) b.repo = findReposition(sim, t, tgt, pref) || "none";
      if (b.repo === "none") {
        setState(b, "attack");
        break;
      }
      const d = moveTo(sim, t, b, b.repo[0], b.repo[1], 0.9, c);
      aimAt(sim, t, b, tgt, c);
      if (d < 5 || b.stateT > 9) setState(b, "attack");
      break;
    }
    case "retreat": {
      const from = tgt || sim.player;
      if (!b.repo) {
        const ax = t.x - from.x;
        const az = t.z - from.z;
        const l = Math.hypot(ax, az) || 1;
        const [rx, rz] = sim.map.nav.nearestFree(clamp(t.x + (ax / l) * 70, -180, 180), clamp(t.z + (az / l) * 70, -180, 180));
        b.repo = [rx, rz];
      }
      const d = moveTo(sim, t, b, b.repo[0], b.repo[1], 1, c);
      c.boost = true;
      if (tgt && b.visible) aimAt(sim, t, b, tgt, c);
      if (d < 5 || b.stateT > 12) setState(b, tgt ? "attack" : "idle");
      break;
    }
    default:
      setState(b, "idle");
  }
  return c;
}

/** Allies anchor on the player (follow) or a zone (defend). */
function allyAnchor(sim, t, b) {
  if (t.side !== "ally") return null;
  if (b.order === "follow") return [sim.player.x, sim.player.z];
  if (b.order === "defend" && b.zone) return b.zone;
  return null;
}

function idleOrder(sim, t, b, c, anchor) {
  switch (b.order) {
    case "patrol": {
      if (!b.patrol) break;
      const q = b.patrol[b.pIdx];
      const d = moveTo(sim, t, b, q[0], q[1], 0.55, c);
      if (d < 7) {
        b.pIdx = (b.pIdx + 1) % b.patrol.length;
        b.path = null;
      }
      break;
    }
    case "guard": {
      const d = Math.hypot(b.home[0] - t.x, b.home[1] - t.z);
      if (d > 12) moveTo(sim, t, b, b.home[0], b.home[1], 0.5, c);
      else {
        // scan the turret slowly
        const a = t.heading + Math.sin(sim.t * 0.4 + t.id) * 1.2;
        c.aim = { x: t.x + Math.sin(a) * 60, y: t.y + 2, z: t.z + Math.cos(a) * 60 };
      }
      break;
    }
    case "hold": {
      const a = t.heading + Math.sin(sim.t * 0.3 + t.id) * 0.7;
      c.aim = { x: t.x + Math.sin(a) * 80, y: t.y + 2, z: t.z + Math.cos(a) * 80 };
      break;
    }
    case "hunt":
    case "convoyAttack": {
      if (b.lastSeen) moveTo(sim, t, b, b.lastSeen[0], b.lastSeen[1], 0.8, c);
      break;
    }
    case "assault": {
      const z = b.zone || defendZoneOf(sim);
      if (z) {
        const d = moveTo(sim, t, b, z[0], z[1], 0.78, c);
        if (d < 8) {
          c.throttle = 0;
          c.steer = 0;
        }
      } else if (b.lastSeen) moveTo(sim, t, b, b.lastSeen[0], b.lastSeen[1], 0.8, c);
      break;
    }
    case "follow": {
      const p = sim.player;
      const slots = [[-9, -12], [9, -12], [0, -22], [-16, -24], [16, -24]];
      const [ox, oz] = slots[b.slot % slots.length];
      const cx = Math.cos(p.heading);
      const sx = Math.sin(p.heading);
      // slot in the player's frame (right = (−cos, sin))
      const gx = p.x - cx * ox + sx * oz;
      const gz = p.z + sx * ox + cx * oz;
      const d = Math.hypot(gx - t.x, gz - t.z);
      if (d > 6) moveTo(sim, t, b, gx, gz, d > 25 ? 1 : 0.7, c);
      if (d > 30) c.boost = true;
      break;
    }
    case "defend": {
      const z = anchor || b.home;
      const d = Math.hypot(z[0] - t.x, z[1] - t.z);
      if (d > 16) moveTo(sim, t, b, z[0], z[1], 0.6, c);
      break;
    }
    default:
  }
}

function defendZoneOf(sim) {
  const d = sim.stage?.def;
  if (!d) return null;
  if (d.type === "defendZone") return d.zone;
  return null;
}

/* ------------------------------------------------------------------ trucks */
function thinkEscape(sim, t, b, c) {
  const r = b.route;
  const end = r[r.length - 1];
  const q = r[Math.min(b.ri, r.length - 1)];
  if (Math.hypot(q[0] - t.x, q[1] - t.z) < 9 && b.ri < r.length - 1) {
    b.ri++;
    b.path = null;
  }
  moveTo(sim, t, b, q[0], q[1], 1, c);
  if (Math.hypot(end[0] - t.x, end[1] - t.z) < 16 || (b.ri >= r.length - 1 && Math.abs(t.x) > 178)) {
    t.escaped = true;
    t.alive = false;
    sim.stage.escaped = (sim.stage.escaped || 0) + 1;
    sim.ev("escaped", { target: t, n: sim.stage.escaped });
  }
  return c;
}

function thinkConvoy(sim, t, b, c) {
  const r = b.route;
  if (t.arrived) return c;
  const q = r[Math.min(b.ri, r.length - 1)];
  if (Math.hypot(q[0] - t.x, q[1] - t.z) < 8 && b.ri < r.length - 1) {
    b.ri++;
    b.path = null;
  }
  // progress along the route
  let done = 0;
  let total = 0;
  for (let i = 0; i < r.length - 1; i++) {
    const L = Math.hypot(r[i + 1][0] - r[i][0], r[i + 1][1] - r[i][1]);
    if (i < b.ri - 1) done += L;
    total += L;
  }
  const prev = r[b.ri - 1] || r[0];
  done += Math.max(0, Math.hypot(r[b.ri][0] - prev[0], r[b.ri][1] - prev[1]) - Math.hypot(r[b.ri][0] - t.x, r[b.ri][1] - t.z));
  b.progress = Math.min(1, done / total);
  const end = r[r.length - 1];
  if (b.ri >= r.length - 1 && Math.hypot(end[0] - t.x, end[1] - t.z) < 10 + b.slot * 7) {
    t.arrived = true;
    sim.ev("convoyArrived", { target: t });
    return c;
  }
  // halt when enemies are close, or the truck ahead is too near
  let threat = false;
  for (const o of sim.tanks) if (o.alive && o.side === "enemy" && Math.hypot(o.x - t.x, o.z - t.z) < 48) threat = true;
  let ahead = false;
  for (const o of sim.tanks) {
    if (o === t || !o.alive || o.type !== "convoy" || o.arrived) continue;
    if ((o.brain.progress || 0) > b.progress && Math.hypot(o.x - t.x, o.z - t.z) < 12) ahead = true;
  }
  // keep up with the player: wait if the escort falls far behind
  const far = Math.hypot(sim.player.x - t.x, sim.player.z - t.z) > 85;
  if (threat || ahead || far) {
    c.throttle = 0;
    c.steer = 0;
    if (threat && !b.halted) sim.ev("convoyHalt", {});
    b.halted = threat;
    return c;
  }
  b.halted = false;
  moveTo(sim, t, b, q[0], q[1], 0.85, c);
  return c;
}
