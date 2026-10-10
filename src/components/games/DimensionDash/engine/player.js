/**
 * Dimension Dash — the hedgehog controller.
 *
 * Modes (p.mode):
 *   free  full 3D: camera-relative input, velocity turns toward the stick
 *   side  2.5D: velocity is projected onto the zone's plane axis F, depth is
 *         pulled back onto the plane, A/D are screen-left/right (= ∓F)
 *   ride  locked onto a loop / half loop / corkscrew curve (real ground speed,
 *         gravity along the tangent, falls off when too slow upside down)
 *   rail  grinding a rail (slope gravity, switching, jump off)
 *
 * Actions (p.action): none · ball (spin jump) · roll · crouch · charge ·
 * dash (3D spin-dash roll) · homing · spring · hurt · dead · victory.
 * Attacking = ball | roll | charge | dash | homing (or invincible).
 *
 * Both play modes share one collision world (geom.js) and one vertical /
 * landing routine, so switching modes never teleports the player.
 */
import { P, GRAVITY, POWER } from "./config.js";
import { floorBelow, pushOut, ceilingAbove } from "./geom.js";
import { sample, nearest } from "./curve.js";
import { fwd, right } from "./builder.js";

const fl = { y: 0, nx: 0, ny: 1, nz: 0, src: null };
const hit = { x: 0, z: 0, n: 0 };
const S = {};

export function createPlayer(spawn) {
  const p = {
    x: spawn.x,
    y: spawn.y,
    z: spawn.z,
    vx: 0,
    vy: 0,
    vz: 0,
    mode: "free",
    zone: null,
    grounded: true,
    floor: null,
    nx: 0,
    ny: 1,
    nz: 0,
    facing: spawn.h || 0,
    action: "none",
    coyote: 0,
    buffer: 0,
    jumped: false,
    jumpCut: false,
    jumpT: 0,
    airT: 0,
    rev: 0,
    dashCd: 0,
    dashT: 0,
    lockT: 0,
    hurtT: 0,
    invuln: 0,
    deadT: 0,
    homing: null,
    lock: null,
    ride: null,
    rail: null,
    railCd: 0,
    rideCd: new Map(),
    carry: null,
    sw: null,
    speed: 0,
    landT: 0,
    skid: false,
    stepDist: 0,
    sideSign: 1,
  };
  return p;
}

export const isAttacking = (p, W) => p.action === "ball" || p.action === "roll" || p.action === "charge" || p.action === "dash" || p.action === "homing" || (W && W.power.invincible > 0);
export const bodyHeight = (p) => (p.action === "ball" || p.action === "roll" || p.action === "charge" || p.action === "dash" || p.action === "homing" || p.action === "crouch" ? P.ballHeight : P.height);

function topSpeed(W, sprint) {
  let t = sprint ? P.sprintTop : P.topSpeed;
  if (W.power.speed > 0) t *= 1.3;
  return t;
}

/* ------------------------------------------------------------------ mode switching */

export function enterSide(W, p, Z, why = "zone") {
  p.mode = "side";
  p.zone = Z;
  const vf = p.vx * Z.fx + p.vz * Z.fz;
  p.vx = Z.fx * vf;
  p.vz = Z.fz * vf;
  if (Math.abs(vf) > 0.5) p.sideSign = Math.sign(vf);
  // keep holding W meaning "keep going the way you were going"
  p.carry = { kind: "toSide", sign: Math.abs(vf) > 0.5 ? Math.sign(vf) : p.sideSign };
  W.events.push({ type: "mode", mode: "side", zone: Z.idx, why });
}

export function exitSide(W, p, why = "zone") {
  const Z = p.zone;
  p.mode = "free";
  p.zone = null;
  const vf = Z ? p.vx * Z.fx + p.vz * Z.fz : 0;
  const sg = Math.abs(vf) > 0.5 ? Math.sign(vf) : p.sideSign;
  // holding D/A through the gate keeps running the same world direction
  if (Z) p.carry = { kind: "toFree", dx: Z.fx * sg, dz: Z.fz * sg, held: sg };
  W.events.push({ type: "mode", mode: "free", zone: Z ? Z.idx : -1, why });
}

/* ------------------------------------------------------------------ input mapping */

function sideInput(p, inp) {
  let mx = inp.mx;
  const c = p.carry;
  if (c && c.kind === "toSide") {
    if (inp.my > 0.5 && Math.abs(mx) < 0.1) mx = c.sign;
    else if (inp.my <= 0.5 || Math.abs(inp.mx) > 0.1) p.carry = null;
  } else if (c) p.carry = null;
  return mx;
}

function freeInput(p, inp, out) {
  const c = p.carry;
  if (c && c.kind === "toFree") {
    // world-forward screen key still held (D or A, whichever it was) and nothing else
    const sameKey = Math.sign(inp.mx) === c.held && Math.abs(inp.my) < 0.1;
    if (sameKey) {
      out.x = c.dx;
      out.z = c.dz;
      out.m = 1;
      return out;
    }
    p.carry = null;
  } else if (c) p.carry = null;
  const [fx, fz] = fwd(inp.camYaw || 0);
  const [rx, rz] = right(inp.camYaw || 0);
  out.x = fx * inp.my + rx * inp.mx;
  out.z = fz * inp.my + rz * inp.mx;
  const m = Math.hypot(out.x, out.z);
  out.m = Math.min(1, m);
  if (m > 1e-6) {
    out.x /= m;
    out.z /= m;
  }
  return out;
}

/* ------------------------------------------------------------------ main step */

const mv = { x: 0, z: 0, m: 0 };

export function stepPlayer(W, inp, dt) {
  const p = W.player;
  p.lockT = Math.max(0, p.lockT - dt);
  p.invuln = Math.max(0, p.invuln - dt);
  p.dashCd = Math.max(0, p.dashCd - dt);
  p.railCd = Math.max(0, p.railCd - dt);
  p.landT = Math.max(0, p.landT - dt);
  for (const [k, v] of p.rideCd) {
    if (v - dt <= 0) p.rideCd.delete(k);
    else p.rideCd.set(k, v - dt);
  }
  if (p.sw) {
    p.sw.t -= dt;
    if (p.sw.t <= 0) p.sw = null;
  }

  if (p.action === "dead") {
    p.deadT += dt;
    if (p.deadT < 0.5) p.vy -= GRAVITY * 0.5 * dt;
    p.y += p.vy * dt;
    return;
  }
  if (p.action === "victory") {
    // coast to a stop on the ground
    const k = Math.max(0, 1 - 4 * dt);
    p.vx *= k;
    p.vz *= k;
    if (p.mode === "ride" || p.mode === "rail") leaveCurve(W, p, 0);
    integrate(W, p, dt, false);
    return;
  }

  if (inp.jump) p.buffer = P.buffer;
  else p.buffer = Math.max(0, p.buffer - dt);

  if (p.mode === "ride") return stepRide(W, p, inp, dt);
  if (p.mode === "rail") return stepRail(W, p, inp, dt);

  if (p.action === "hurt") {
    p.hurtT -= dt;
    if (p.hurtT <= 0 && p.grounded) p.action = "none";
  }

  const side = p.mode === "side";
  const Z = p.zone;
  const sprint = !!inp.sprint;
  const top = topSpeed(W, sprint);
  const control = p.lockT <= 0 && p.action !== "hurt";

  /* ---------- charge (spin dash) */
  const crouchKey = side && inp.my < -0.5;
  const spinKey = !!inp.spin;
  if (p.grounded && control && p.dashCd <= 0) {
    const slow = Math.hypot(p.vx, p.vz) < 3;
    if (p.action === "charge") {
      p.rev = Math.min(1, p.rev + (inp.jump ? 0.24 : 0) + 0.5 * dt);
      if (inp.jump) {
        p.buffer = 0;
        W.events.push({ type: "rev", rev: p.rev });
      }
      const holding = spinKey || crouchKey;
      if (!holding) {
        releaseDash(W, p, inp, side);
      } else {
        // stand still while charging
        const k = Math.max(0, 1 - 14 * dt);
        p.vx *= k;
        p.vz *= k;
      }
    } else if ((spinKey && slow) || (crouchKey && slow && inp.jump)) {
      p.action = "charge";
      p.rev = inp.jump ? 0.24 : 0.05;
      p.buffer = 0;
      W.events.push({ type: "charge" });
    } else if (crouchKey && slow && p.action === "none") {
      p.action = "crouch";
    } else if (crouchKey && !slow && p.action === "none") {
      p.action = "roll";
      W.events.push({ type: "roll" });
    } else if (p.action === "crouch" && !crouchKey) p.action = "none";
  } else if (p.action === "charge" && !p.grounded) p.action = "ball";
  if (p.action === "crouch" && !p.grounded) p.action = "none";

  /* ---------- jump */
  const canJump = (p.grounded || p.coyote > 0) && p.action !== "charge" && p.action !== "hurt";
  if (p.buffer > 0 && canJump) doJump(W, p, side);
  if (!p.grounded) {
    p.coyote = Math.max(0, p.coyote - dt);
    p.airT += dt;
    p.jumpT += dt;
    if (p.jumped && !p.jumpCut && !inp.jumpHeld && p.vy > P.jumpCut && p.action === "ball") {
      p.vy = P.jumpCut;
      p.jumpCut = true;
    }
  }

  /* ---------- homing attack */
  if (!p.grounded && p.action !== "homing" && p.action !== "hurt" && p.lock && (inp.attack || (inp.jump && !canJump))) {
    startHoming(W, p, p.lock);
    p.buffer = 0;
  }
  if (p.action === "homing") {
    if (stepHoming(W, p, dt)) return;
  }

  /* ---------- horizontal */
  if (side) {
    const mx = control ? sideInput(p, inp) : 0;
    let vf = p.vx * Z.fx + p.vz * Z.fz;
    if (p.grounded) vf = sideGround(W, p, vf, mx, top, sprint, dt);
    else vf = sideAir(p, vf, mx, top, dt);
    if (Math.abs(mx) > 0.1 && p.action !== "charge") p.sideSign = Math.sign(mx);
    else if (Math.abs(vf) > 1) p.sideSign = Math.sign(vf);
    p.vx = Z.fx * vf;
    p.vz = Z.fz * vf;
    p.facing = p.sideSign > 0 ? Z.h : Z.h + Math.PI;
  } else {
    if (control) freeInput(p, inp, mv);
    else mv.m = 0;
    if (p.grounded) freeGround(W, p, mv, top, sprint, dt);
    else freeAir(p, mv, top, dt);
  }

  integrate(W, p, dt, side);

  if (p.action === "dash") {
    p.dashT -= dt;
    if (p.dashT <= 0 || (p.grounded && Math.hypot(p.vx, p.vz) < 6)) p.action = "none";
  }
  if (p.action === "roll" && p.grounded && Math.hypot(p.vx, p.vz) < P.rollMin) p.action = inp.my < -0.5 && side ? "crouch" : "none";
}

function doJump(W, p, side) {
  const jv = P.jumpV * (W.power.jump > 0 ? 1.28 : 1);
  // jump off the ground normal a little (classic feel on slopes), mostly up
  p.vx += p.nx * jv * 0.25;
  p.vz += p.nz * jv * 0.25;
  p.vy = Math.max(p.vy, 0) * 0.5 + jv * (0.75 + 0.25 * p.ny);
  if (side && p.zone) {
    const vf = p.vx * p.zone.fx + p.vz * p.zone.fz;
    p.vx = p.zone.fx * vf;
    p.vz = p.zone.fz * vf;
  }
  p.grounded = false;
  p.floor = null;
  p.coyote = 0;
  p.buffer = 0;
  p.jumped = true;
  p.jumpCut = false;
  p.jumpT = 0;
  p.airT = 0;
  p.action = "ball";
  W.stats.jumps++;
  W.events.push({ type: "jump" });
}

function releaseDash(W, p, inp, side) {
  const sp = P.dashMin + p.rev * (P.dashMax - P.dashMin);
  let dx;
  let dz;
  if (side) {
    dx = p.zone.fx * p.sideSign;
    dz = p.zone.fz * p.sideSign;
  } else {
    freeInput(p, inp, mv);
    if (mv.m > 0.2) {
      dx = mv.x;
      dz = mv.z;
    } else {
      dx = Math.sin(p.facing);
      dz = Math.cos(p.facing);
    }
    p.facing = Math.atan2(dx, dz);
  }
  p.vx = dx * sp;
  p.vz = dz * sp;
  p.action = side ? "roll" : "dash";
  p.dashT = P.dashRollTime;
  p.dashCd = P.dashRecover;
  p.rev = 0;
  W.stats.spinDashes++;
  W.events.push({ type: "dash", speed: sp });
}

/* ------------------------------------------------------------------ side mode */

const flatness = (p) => {
  const k = p.ny * p.ny;
  return k * k * k * k; // ny^8: 1 on flat, ~0.6 at 19°, ~0.3 at 30°
};

function sideGround(W, p, vf, mx, top, sprint, dt) {
  const Z = p.zone;
  // tangential gravity along F from the ground normal
  const gF = GRAVITY * p.ny * (p.nx * Z.fx + p.nz * Z.fz);
  const rolling = p.action === "roll";
  p.skid = false;
  if (p.action === "charge" || p.action === "crouch") {
    vf *= Math.max(0, 1 - 14 * dt);
    return vf + gF * 0.15 * dt;
  }
  vf += gF * (rolling ? P.rollSlope : P.slope) * dt;
  const sp = Math.abs(vf);
  const dir = Math.sign(vf);
  if (rolling) {
    const fr = P.rollFriction + (mx && Math.sign(mx) !== dir ? 8 : 0);
    vf = sp > fr * dt ? vf - dir * fr * dt : 0;
    return vf;
  }
  if (mx !== 0) {
    if (dir !== 0 && Math.sign(mx) !== dir && sp > 0.5) {
      // skid
      p.skid = sp > 6;
      vf -= dir * Math.min(sp, P.skid * dt);
    } else if (sp < top) {
      const a = P.accel * (1 - 0.55 * (sp / top)) * (sprint ? P.sprintAccel : 1);
      vf += Math.sign(mx) * a * dt;
      if (Math.abs(vf) > top) vf = Math.sign(vf) * top;
    } else vf -= dir * Math.min(sp - top, P.overspeedDrag * dt);
  } else {
    // less friction on slopes so letting go downhill still builds speed
    const fr = P.friction * flatness(p);
    vf = sp > fr * dt ? vf - dir * fr * dt : 0;
    // gentle slopes don't make an idle hedgehog creep
    if (Math.abs(vf) < 0.8 && p.ny > 0.97) vf = 0;
  }
  return vf;
}

function sideAir(p, vf, mx, top, dt) {
  if (p.action === "spring" && p.lockT > 0) return vf;
  const sp = Math.abs(vf);
  if (mx !== 0) {
    const want = Math.sign(mx);
    if (Math.sign(vf) === want || sp < 0.3) {
      if (sp < top) vf += want * P.airAccel * dt;
    } else vf += want * P.airAccel * 1.4 * dt;
  } else vf *= Math.max(0, 1 - P.airDrag * dt);
  return vf;
}

/* ------------------------------------------------------------------ free mode */

function rotateToward(ax, az, bx, bz, maxA) {
  // rotate unit (ax,az) toward unit (bx,bz) by at most maxA radians
  const cr = ax * bz - az * bx;
  const dt = ax * bx + az * bz;
  const ang = Math.atan2(cr, dt);
  const a = Math.max(-maxA, Math.min(maxA, ang));
  const c = Math.cos(a);
  const s = Math.sin(a);
  return [ax * c - az * s, ax * s + az * c];
}

function freeGround(W, p, m, top, sprint, dt) {
  let sp = Math.hypot(p.vx, p.vz);
  let dx = sp > 1e-4 ? p.vx / sp : Math.sin(p.facing);
  let dz = sp > 1e-4 ? p.vz / sp : Math.cos(p.facing);
  p.skid = false;
  if (p.action === "charge") {
    sp *= Math.max(0, 1 - 14 * dt);
    if (m.m > 0.2) p.facing = Math.atan2(m.x, m.z);
    p.vx = dx * sp;
    p.vz = dz * sp;
    return;
  }
  const rolling = p.action === "dash" || p.action === "roll";
  if (m.m > 0.1) {
    const dot = dx * m.x + dz * m.z;
    if (sp > 1 && dot < -0.55 && !rolling) {
      p.skid = sp > 7;
      sp = Math.max(0, sp - P.skid * dt);
      if (sp < 0.6) {
        dx = m.x;
        dz = m.z;
      }
    } else {
      const k = Math.min(1, sp / top);
      const turn = (P.turnLow + (P.turnHigh - P.turnLow) * k) * (rolling ? 0.45 : 1) * dt;
      if (sp < 0.5) {
        dx = m.x;
        dz = m.z;
      } else [dx, dz] = rotateToward(dx, dz, m.x, m.z, turn);
      if (!rolling) {
        if (sp < top) {
          const a = P.accel * (1 - 0.55 * k) * (sprint ? P.sprintAccel : 1) * m.m;
          sp = Math.min(top, sp + a * dt);
        } else sp = Math.max(top, sp - P.overspeedDrag * dt);
      }
    }
  } else if (!rolling) {
    sp = Math.max(0, sp - P.friction * flatness(p) * dt);
  }
  if (rolling) sp = Math.max(0, sp - P.rollFriction * dt);
  p.vx = dx * sp;
  p.vz = dz * sp;
  // slope: tangential gravity (horizontal part)
  const f = (rolling ? P.rollSlope : P.slope) * GRAVITY * p.ny;
  p.vx += p.nx * f * dt;
  p.vz += p.nz * f * dt;
  // tiny slopes shouldn't creep you while idle
  if (m.m < 0.1 && !rolling && Math.hypot(p.vx, p.vz) < 0.8 && p.ny > 0.94) {
    p.vx = 0;
    p.vz = 0;
  }
  const s2 = Math.hypot(p.vx, p.vz);
  if (s2 > 0.3) p.facing = Math.atan2(p.vx, p.vz);
}

function freeAir(p, m, top, dt) {
  if (p.action === "spring" && p.lockT > 0) return;
  let sp = Math.hypot(p.vx, p.vz);
  if (m.m > 0.1) {
    if (sp < 0.5) {
      p.vx += m.x * P.airAccel * dt;
      p.vz += m.z * P.airAccel * dt;
    } else {
      let dx = p.vx / sp;
      let dz = p.vz / sp;
      const dot = dx * m.x + dz * m.z;
      [dx, dz] = rotateToward(dx, dz, m.x, m.z, P.airTurn * dt * (sp < top ? 1.6 : 1));
      if (dot > 0 && sp < top) sp = Math.min(top, sp + P.airAccel * m.m * dt);
      else if (dot < -0.3) sp = Math.max(0, sp - P.airAccel * 1.3 * dt);
      p.vx = dx * sp;
      p.vz = dz * sp;
    }
  } else {
    const k = Math.max(0, 1 - P.airDrag * dt);
    p.vx *= k;
    p.vz *= k;
  }
  const s2 = Math.hypot(p.vx, p.vz);
  if (s2 > 1) p.facing = Math.atan2(p.vx, p.vz);
}

/* ------------------------------------------------------------------ integration + collision */

function integrate(W, p, dt, side) {
  const G = W.geom;
  if (!p.grounded) {
    p.vy = Math.max(-P.maxFall, p.vy - GRAVITY * dt);
  }
  // global speed cap
  const sp3 = Math.hypot(p.vx, p.vy, p.vz);
  if (sp3 > P.maxSpeed) {
    const k = P.maxSpeed / sp3;
    p.vx *= k;
    p.vz *= k;
    if (p.vy > 0) p.vy *= k;
  }
  const h = bodyHeight(p);
  const subs = Math.max(1, Math.ceil((Math.hypot(p.vx, p.vy, p.vz) * dt) / 0.22));
  const sdt = dt / subs;
  for (let s = 0; s < subs; s++) {
    // ride the platform we stand on
    if (p.grounded && p.floor && (p.floor.mover || p.floor.crumble)) {
      p.x += p.floor.dx / subs;
      p.y += p.floor.dy / subs;
      p.z += p.floor.dz / subs;
    }
    const ox = p.x;
    const oz = p.z;
    const oy = p.y;
    if (p.grounded) {
      // surface-following vertical speed
      p.vy = p.ny > 0.2 ? -(p.nx * p.vx + p.nz * p.vz) / p.ny : 0;
    }
    p.x += p.vx * sdt;
    p.z += p.vz * sdt;
    if (!p.grounded) p.y += p.vy * sdt;
    else p.y += p.vy * sdt;

    // ceilings (rising only)
    if (!p.grounded && p.vy > 0) {
      const c = ceilingAbove(G, p.x, p.z, P.radius, oy + h, p.y + h);
      if (Number.isFinite(c)) {
        p.y = c - h - 0.01;
        p.vy = 0;
        W.events.push({ type: "bonk" });
      }
    }

    // walls
    if (pushOut(G, p, P.radius, p.y + 0.05, p.y + h, P.stepUp, hit)) {
      const l = Math.hypot(hit.x, hit.z) || 1;
      const nx = hit.x / l;
      const nz = hit.z / l;
      const vn = p.vx * nx + p.vz * nz;
      if (vn < 0) {
        if (-vn > 14 && p.grounded) W.events.push({ type: "wallHit", speed: -vn });
        p.vx -= nx * vn;
        p.vz -= nz * vn;
        if (side) {
          const vf = p.vx * p.zone.fx + p.vz * p.zone.fz;
          p.vx = p.zone.fx * vf;
          p.vz = p.zone.fz * vf;
        }
        if (p.action === "homing") endHoming(p, 0.3);
      }
    }

    // side plane: pull depth back to the plane
    if (side && p.zone) {
      const Z = p.zone;
      const d = (p.x - Z.ox) * Z.nx + (p.z - Z.oz) * Z.nz;
      const want = p.depthT || 0;
      const nd = want + (d - want) * Math.exp(-10 * sdt);
      p.x += Z.nx * (nd - d);
      p.z += Z.nz * (nd - d);
      // closed ends are walls
      const a = (p.x - Z.ox) * Z.fx + (p.z - Z.oz) * Z.fz;
      const lo = Z.openStart ? -Infinity : Z.s0 + P.radius;
      const hi = Z.openEnd ? Infinity : Z.s1 - P.radius;
      if (a < lo || a > hi) {
        const na = Math.max(lo, Math.min(hi, a));
        p.x += Z.fx * (na - a);
        p.z += Z.fz * (na - a);
        p.vx = 0;
        p.vz = 0;
      }
    }

    if (p.grounded) {
      const snap = 0.25 + Math.hypot(p.vx, p.vz) * sdt * 1.6;
      if (floorBelow(G, p.x, p.z, p.y + P.stepUp, p.y - snap, fl)) {
        setFloor(p, fl);
        p.y = fl.y;
      } else {
        // ran off an edge (or a ramp lip): keep the surface vertical speed → launches
        p.grounded = false;
        p.floor = null;
        p.coyote = P.coyote;
        p.jumped = false;
        p.airT = 0;
        p.ny = 1;
        p.nx = p.nz = 0;
        if (p.action === "crouch" || p.action === "charge") p.action = "none";
      }
    } else if (p.vy <= 0) {
      // falling: also catch a ledge whose top is just above the feet (forgiving step-up)
      if (floorBelow(G, p.x, p.z, Math.max(oy, p.y) + 0.06 + 0.32, p.y - 0.02, fl)) land(W, p, fl);
    }
    void ox;
    void oz;
  }
  p.speed = Math.hypot(p.vx, p.vz);
}

function setFloor(p, f) {
  p.floor = f.src;
  // smooth the normal a little so seams don't jitter
  p.nx = f.nx;
  p.ny = f.ny;
  p.nz = f.nz;
  if (f.src && f.src.crumble && f.src.crumble.state === "idle") {
    f.src.crumble.state = "shake";
    f.src.crumble.t = 0.55;
  }
}

function land(W, p, f) {
  const impact = -p.vy;
  p.grounded = true;
  p.y = f.y;
  setFloor(p, f);
  p.coyote = 0;
  p.jumped = false;
  p.airT = 0;
  // convert some of the fall into slope speed (downhill landings feel fast)
  const vin = p.vx * f.nx + p.vy * f.ny + p.vz * f.nz;
  p.vx -= f.nx * vin;
  p.vz -= f.nz * vin;
  p.vy = 0;
  if (p.action === "ball" || p.action === "spring" || p.action === "homing") p.action = "none";
  if (p.action === "hurt" && p.hurtT <= 0) p.action = "none";
  p.lockT = Math.min(p.lockT, 0.05);
  p.homing = null;
  p.landT = 0.18;
  W.events.push({ type: "land", impact });
}

/* ------------------------------------------------------------------ homing */

function startHoming(W, p, t) {
  p.action = "homing";
  p.homing = { t: 0, target: t };
  p.lockT = 0;
  W.stats.homing++;
  W.events.push({ type: "homing", x: t.x, y: t.y, z: t.z });
}

function endHoming(p, keep) {
  p.vx *= keep;
  p.vz *= keep;
  p.vy = Math.min(p.vy * keep, 2);
  p.action = "ball";
  p.homing = null;
}

/** returns true when it handled the whole step */
function stepHoming(W, p, dt) {
  const h = p.homing;
  const t = h && h.target;
  h.t += dt;
  if (!t || t.dead || h.t > P.homingTime) {
    endHoming(p, 0.45);
    return false;
  }
  const ty = t.y + (t.hy || 0.5);
  const dx = t.x - p.x;
  const dy = ty - (p.y + 0.45);
  const dz = t.z - p.z;
  const d = Math.hypot(dx, dy, dz) || 1;
  if (d < 0.5 || !t.homable) {
    // arrived (or the target closed up): never hover inside a target
    bounce(W, p, false);
    return false;
  }
  p.vx = (dx / d) * P.homingSpeed;
  p.vy = (dy / d) * P.homingSpeed;
  p.vz = (dz / d) * P.homingSpeed;
  if (Math.hypot(dx, dz) > 0.2) p.facing = Math.atan2(dx, dz);
  // move without gravity; collisions still apply (wall → abort)
  const g = p.grounded;
  p.grounded = false;
  const svy = p.vy;
  p.vy = svy + GRAVITY * dt; // cancel integrate's gravity
  integrate(W, p, dt, p.mode === "side");
  if (p.action === "homing" && !p.grounded) p.vy = svy;
  void g;
  return true;
}

/** after a successful homing / stomp hit */
export function bounce(W, p, strong) {
  p.action = "ball";
  p.homing = null;
  const keep = p.mode === "side" ? 0.35 : 0.3;
  p.vx *= keep;
  p.vz *= keep;
  p.vy = strong ? P.homingBounce : P.homingBounce * 0.8;
  p.grounded = false;
  p.jumped = true;
  p.jumpCut = true;
  p.lockT = 0.08;
}

/** choose the homing target (called by world each step while airborne) */
export function pickTarget(W, p) {
  if (p.grounded || p.mode === "rail" || p.mode === "ride" || p.action === "hurt" || p.action === "dead" || p.action === "homing") {
    p.lock = p.action === "homing" ? p.lock : null;
    return;
  }
  let best = null;
  let bs = Infinity;
  const side = p.mode === "side";
  const fx = Math.sin(p.facing);
  const fz = Math.cos(p.facing);
  for (const t of W.targets) {
    if (t.dead || !t.homable) continue;
    const dx = t.x - p.x;
    const dy = t.y + (t.hy || 0.5) - (p.y + 0.45);
    const dz = t.z - p.z;
    const d = Math.hypot(dx, dy, dz);
    if (d > P.homingRange || d < 0.6) continue;
    if (dy > 4.5 || dy < -9) continue;
    const dh = Math.hypot(dx, dz) || 1e-6;
    let ahead;
    if (side) {
      if (t.zone !== undefined && t.zone !== p.zone.idx) continue;
      const a = dx * p.zone.fx + dz * p.zone.fz;
      ahead = a * p.sideSign;
      if (ahead < -0.5) continue;
      // targets must sit on the plane
      const dep = Math.abs((t.x - p.zone.ox) * p.zone.nx + (t.z - p.zone.oz) * p.zone.nz);
      if (dep > 2.5) continue;
    } else {
      ahead = (dx * fx + dz * fz) / dh;
      if (ahead < 0.15 && dh > 2) continue;
    }
    const score = d - (side ? 0 : ahead * 3);
    if (score >= bs) continue;
    if (W.losBlocked(p.x, p.y + 0.5, p.z, t.x, t.y + (t.hy || 0.5), t.z)) continue;
    bs = score;
    best = t;
  }
  p.lock = best;
}

/* ------------------------------------------------------------------ damage */

export function hurtPlayer(W, p, fromX, fromZ, kind = "hit") {
  if (p.action === "dead" || p.action === "victory") return false;
  if (kind !== "fall" && (p.invuln > 0 || W.power.invincible > 0)) return false;
  if (kind === "fall") {
    killPlayer(W, p, "fall");
    return true;
  }
  W.stats.hits++;
  if (W.power.shield > 0) {
    W.power.shield = 0;
    p.invuln = 1.2;
    knock(p, fromX, fromZ, 0.6);
    W.events.push({ type: "shieldLost" });
    return true;
  }
  if (W.rings > 0) {
    W.events.push({ type: "ringLoss", n: W.rings });
    W.scatterRings(Math.min(W.rings, P.maxScatter));
    W.rings = 0;
    p.invuln = P.invuln;
    knock(p, fromX, fromZ, 1);
    W.events.push({ type: "hurt" });
    return true;
  }
  killPlayer(W, p, kind);
  return true;
}

function knock(p, fromX, fromZ, k) {
  if (p.mode === "ride" || p.mode === "rail") leaveCurve(null, p, 0);
  let dx = p.x - fromX;
  let dz = p.z - fromZ;
  if (p.mode === "side" && p.zone) {
    const a = dx * p.zone.fx + dz * p.zone.fz;
    const sg = Math.sign(a) || -p.sideSign;
    dx = p.zone.fx * sg;
    dz = p.zone.fz * sg;
  }
  const l = Math.hypot(dx, dz) || 1;
  p.vx = (dx / l) * P.knockback * k;
  p.vz = (dz / l) * P.knockback * k;
  p.vy = P.knockUp * (0.6 + 0.4 * k);
  p.grounded = false;
  p.floor = null;
  p.action = "hurt";
  p.hurtT = P.hurtTime;
  p.homing = null;
}

export function killPlayer(W, p, why) {
  if (p.action === "dead") return;
  if (p.mode === "ride" || p.mode === "rail") leaveCurve(null, p, 0);
  p.action = "dead";
  p.deadT = 0;
  p.vx = 0;
  p.vz = 0;
  p.vy = why === "fall" ? 0 : 14;
  W.stats.deaths++;
  if (why === "fall") W.stats.falls++;
  W.events.push({ type: "die", why });
}

/* ------------------------------------------------------------------ springs / boosts */

export function launch(W, p, vx, vy, vz, lock, kind = "spring") {
  if (p.mode === "ride" || p.mode === "rail") leaveCurve(W, p, 0);
  if (p.mode === "side" && p.zone) {
    const vf = vx * p.zone.fx + vz * p.zone.fz;
    vx = p.zone.fx * vf;
    vz = p.zone.fz * vf;
    if (Math.abs(vf) > 0.5) p.sideSign = Math.sign(vf);
  }
  p.vx = vx;
  p.vy = vy;
  p.vz = vz;
  p.grounded = false;
  p.floor = null;
  p.coyote = 0;
  p.jumped = false;
  p.airT = 0;
  p.action = "spring";
  p.lockT = lock;
  p.homing = null;
  if (Math.hypot(vx, vz) > 1) p.facing = Math.atan2(vx, vz);
  W.events.push({ type: kind, power: Math.hypot(vx, vy, vz) });
}

export function boostAlong(W, p, h, speed) {
  const fx = Math.sin(h);
  const fz = Math.cos(h);
  if (p.mode === "side" && p.zone) {
    const s = fx * p.zone.fx + fz * p.zone.fz >= 0 ? 1 : -1;
    const vf = p.vx * p.zone.fx + p.vz * p.zone.fz;
    const nv = s * Math.max(Math.abs(vf) * (Math.sign(vf) === s ? 1 : 0), speed);
    p.vx = p.zone.fx * nv;
    p.vz = p.zone.fz * nv;
    p.sideSign = s;
  } else if (p.mode === "ride") {
    p.ride.gs = Math.max(p.ride.gs, speed);
  } else {
    const sp = Math.max(Math.hypot(p.vx, p.vz) * Math.max(0, (p.vx * fx + p.vz * fz) / (Math.hypot(p.vx, p.vz) || 1)), speed);
    p.vx = fx * sp;
    p.vz = fz * sp;
    p.facing = h;
    p.lockT = Math.max(p.lockT, 0.18);
  }
  W.events.push({ type: "boost" });
}

/* ------------------------------------------------------------------ rides (loops) */

export function tryRide(W, p, ox, oy, oz) {
  if (p.mode !== "side" && p.mode !== "free") return false;
  if (!p.grounded && p.airT > 0.12) return false;
  for (let i = 0; i < W.rides.length; i++) {
    const r = W.rides[i];
    if (p.rideCd.has(i)) continue;
    if (r.mode === "side" && (p.mode !== "side" || !p.zone || p.zone.idx !== r.zone)) continue;
    if (r.mode === "free" && p.mode !== "free") continue;
    const e = r.entry;
    const d0 = (ox - e.x) * e.dx + (oz - e.z) * e.dz;
    const d1 = (p.x - e.x) * e.dx + (p.z - e.z) * e.dz;
    if (!(d0 < 0 && d1 >= 0)) continue;
    const lat = Math.abs((p.x - e.x) * -e.dz + (p.z - e.z) * e.dx);
    if (lat > r.hw + 0.6) continue;
    if (Math.abs(p.y - e.y) > 1.3) continue;
    const vf = p.vx * e.dx + p.vz * e.dz;
    if (vf < 2) continue;
    p.ride = { i, r, u: Math.min(d1, 0.5), gs: Math.hypot(p.vx, p.vz), from: p.mode, zone: p.zone, depth: 0 };
    p.mode = "ride";
    p.grounded = true;
    p.homing = null;
    if (p.action === "charge" || p.action === "crouch") p.action = "none";
    W.events.push({ type: "rideStart", kind: r.kind });
    return true;
  }
  return false;
}

function stepRide(W, p, inp, dt) {
  const R = p.ride;
  const c = R.r.curve;
  sample(c, R.u, S);
  // tangential gravity
  R.gs += -GRAVITY * S.ty * P.rideSlope * dt;
  const wantGo = Math.abs(inp.mx) > 0.1 || inp.my > 0.1 || (p.carry && inp.my > 0.1);
  const top = topSpeed(W, inp.sprint);
  if (wantGo && R.gs > 0 && R.gs < top) R.gs += 8 * dt;
  R.gs -= Math.sign(R.gs) * Math.min(Math.abs(R.gs), 1.2 * dt);
  // jump off the surface
  if (p.buffer > 0) {
    p.buffer = 0;
    const jv = P.jumpV * 0.9;
    leaveCurve(W, p, 1, S.ux * jv, S.uy * jv, S.uz * jv);
    p.action = "ball";
    p.jumped = true;
    W.stats.jumps++;
    W.events.push({ type: "jump" });
    return;
  }
  // stay-attached test (upside-down part)
  const rad = R.r.radius || 5;
  if (S.uy < -0.05 && (R.gs * R.gs) / rad + GRAVITY * P.rideHold * S.uy < 0) {
    leaveCurve(W, p, 1);
    p.action = "none";
    W.events.push({ type: "rideFall" });
    return;
  }
  R.u += R.gs * dt;
  if (R.u >= c.len || R.u <= 0) {
    const end = R.u >= c.len;
    sample(c, end ? c.len : 0, S);
    p.x = S.x;
    p.y = S.y;
    p.z = S.z;
    leaveCurve(W, p, 1);
    // back on the ground right away
    if (floorBelow(W.geom, p.x, p.z, p.y + 0.6, p.y - 0.6, fl)) {
      p.grounded = true;
      p.y = fl.y;
      setFloor(p, fl);
      p.vy = 0;
    }
    W.events.push({ type: "rideEnd", kind: R.r.kind });
    return;
  }
  sample(c, R.u, S);
  p.x = S.x;
  p.y = S.y;
  p.z = S.z;
  const dir = R.gs >= 0 ? 1 : -1;
  p.vx = S.tx * R.gs;
  p.vy = S.ty * R.gs;
  p.vz = S.tz * R.gs;
  p.nx = S.ux;
  p.ny = S.uy;
  p.nz = S.uz;
  p.rideT = { tx: S.tx * dir, ty: S.ty * dir, tz: S.tz * dir };
  const th = Math.hypot(S.tx, S.tz);
  if (th > 0.2) p.facing = Math.atan2(S.tx * dir, S.tz * dir);
  p.speed = Math.abs(R.gs);
}

/** leave a ride / rail (vel optional override add) */
export function leaveCurve(W, p, keep, ax = 0, ay = 0, az = 0) {
  if (p.mode === "ride") {
    const R = p.ride;
    sample(R.r.curve, Math.max(0, Math.min(R.r.curve.len, R.u)), S);
    p.vx = S.tx * R.gs * keep + ax;
    p.vy = S.ty * R.gs * keep + ay;
    p.vz = S.tz * R.gs * keep + az;
    p.mode = R.from;
    p.zone = R.zone;
    p.rideCd.set(R.i, 0.7);
    p.ride = null;
  } else if (p.mode === "rail") {
    const Rl = p.rail;
    sample(Rl.r.curve, Math.max(0, Math.min(Rl.r.curve.len, Rl.u)), S);
    p.vx = S.tx * Rl.gs * Rl.dir * keep + ax;
    p.vy = S.ty * Rl.gs * Rl.dir * keep + ay;
    p.vz = S.tz * Rl.gs * Rl.dir * keep + az;
    p.mode = Rl.from;
    p.zone = Rl.zone;
    p.railCd = 0.35;
    p.lastRail = Rl.i;
    p.rail = null;
  }
  p.grounded = false;
  p.floor = null;
  p.nx = 0;
  p.ny = 1;
  p.nz = 0;
  p.airT = 0;
  p.coyote = 0;
  p.rideT = null;
  if (p.mode === "side" && p.zone) {
    const vf = p.vx * p.zone.fx + p.vz * p.zone.fz;
    p.vx = p.zone.fx * vf;
    p.vz = p.zone.fz * vf;
  }
  if (W) W.events.push({ type: "leaveCurve" });
}

/* ------------------------------------------------------------------ rails */

const nr = { u: 0, d: 0 };
export function tryRail(W, p) {
  if (p.mode !== "free" && p.mode !== "side") return false;
  if (p.action === "hurt" || p.action === "dead" || p.action === "homing") return false;
  for (let i = 0; i < W.rails.length; i++) {
    const r = W.rails[i];
    if (p.railCd > 0 && p.lastRail === i) continue;
    const b = r.box;
    if (p.x < b.x0 || p.x > b.x1 || p.z < b.z0 || p.z > b.z1 || p.y < b.y0 - 2 || p.y > b.y1 + 2) continue;
    const c = r.curve;
    nearest(c, p.x, p.y, p.z, nr);
    sample(c, nr.u, S);
    const hd = Math.hypot(p.x - S.x, p.z - S.z);
    const dy = p.y - S.y;
    if (hd > P.railCapture) continue;
    if (p.grounded) {
      if (dy < -1.1 || dy > 0.3) continue;
    } else if (p.vy > 4 || dy < -0.55 || dy > 0.9) continue;
    const along = p.vx * S.tx + p.vy * S.ty + p.vz * S.tz;
    const dir = along >= 0 ? 1 : -1;
    // never attach at the very end you are leaving from
    if ((dir > 0 && nr.u > c.len - 1) || (dir < 0 && nr.u < 1)) continue;
    p.rail = { i, r, u: nr.u, gs: Math.max(Math.abs(along), 10), dir, from: p.mode, zone: p.zone };
    // visual ease onto the rail (the engine position snaps, the render offset decays)
    p.sw = { ox: p.x - S.x, oy: p.y - (S.y + 0.12), oz: p.z - S.z, t: 0.12, T: 0.12 };
    p.x = S.x;
    p.y = S.y + 0.12;
    p.z = S.z;
    p.mode = "rail";
    p.grounded = true;
    p.homing = null;
    p.action = "none";
    p.lock = null;
    W.stats.grinds++;
    W.events.push({ type: "railOn" });
    return true;
  }
  return false;
}

function stepRail(W, p, inp, dt) {
  const R = p.rail;
  const c = R.r.curve;
  sample(c, R.u, S);
  const tdy = S.ty * R.dir;
  R.gs += -GRAVITY * tdy * P.railSlope * dt;
  if (inp.sprint && R.gs < P.railTop) R.gs += P.railAccel * dt;
  R.gs = Math.max(6, R.gs - P.railFriction * dt);
  R.gs = Math.min(P.maxSpeed, R.gs);
  // jump off
  if (p.buffer > 0) {
    p.buffer = 0;
    const jv = P.jumpV * 0.95;
    leaveCurve(W, p, 1, 0, jv, 0);
    p.action = "ball";
    p.jumped = true;
    p.jumpCut = false;
    W.stats.jumps++;
    W.events.push({ type: "jump", rail: true });
    return;
  }
  // switch rails (left / right relative to the travel direction)
  if (inp.leftE || inp.rightE) {
    const want = inp.rightE ? 1 : -1;
    const tx = S.tx * R.dir;
    const tz = S.tz * R.dir;
    const th = Math.hypot(tx, tz) || 1;
    const rx = -tz / th; // right(h) for forward (tx,tz): (-cos h, sin h) == (-fz, fx)
    const rz = tx / th;
    let best = -1;
    let bd = Infinity;
    for (let i = 0; i < W.rails.length; i++) {
      if (i === R.i) continue;
      const o = W.rails[i];
      nearest(o.curve, p.x, p.y, p.z, nr);
      if (nr.d > 6.5 || nr.d < 1.2) continue;
      const q = sample(o.curve, nr.u, {});
      const lat = (q.x - p.x) * rx + (q.z - p.z) * rz;
      if (Math.sign(lat) !== want || Math.abs(q.y - p.y) > 2.5) continue;
      if (nr.d < bd) {
        bd = nr.d;
        best = i;
      }
    }
    if (best >= 0) {
      const o = W.rails[best];
      nearest(o.curve, p.x, p.y, p.z, nr);
      const q = sample(o.curve, nr.u, {});
      const along = tx * q.tx + tz * q.tz;
      p.sw = { ox: p.x - q.x, oy: p.y - q.y, oz: p.z - q.z, t: 0.22, T: 0.22 };
      p.rail = { ...R, i: best, r: o, u: nr.u, dir: along >= 0 ? 1 : -1 };
      W.events.push({ type: "railSwitch" });
      return;
    }
  }
  R.u += R.gs * R.dir * dt;
  if (R.u >= c.len || R.u <= 0) {
    sample(c, R.u >= c.len ? c.len : 0, S);
    p.x = S.x;
    p.y = S.y + 0.12;
    p.z = S.z;
    leaveCurve(W, p, 1, 0, 3, 0);
    p.action = "none";
    W.events.push({ type: "railOff" });
    return;
  }
  sample(c, R.u, S);
  p.x = S.x;
  p.y = S.y + 0.12;
  p.z = S.z;
  p.vx = S.tx * R.gs * R.dir;
  p.vy = S.ty * R.gs * R.dir;
  p.vz = S.tz * R.gs * R.dir;
  p.nx = 0;
  p.ny = 1;
  p.nz = 0;
  if (Math.hypot(p.vx, p.vz) > 0.5) p.facing = Math.atan2(p.vx, p.vz);
  p.speed = R.gs;
}

export { POWER };
