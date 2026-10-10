/**
 * Web Hero — verification bot. It drives the SAME input object as the
 * keyboard/mouse (mx/my/camYaw/jump/light/heavy/dodge/web/ab1-5/interactHeld),
 * so a headless run exercises the real controller, combat and missions.
 *
 * Navigation: street-level A* on the city nav grid; rooftop targets are
 * reached by walking to the building and climbing its wall (ledge vault on
 * top); lower targets by stepping off the roof. Combat: approach, light/heavy
 * combos, dodge telegraphed attacks (aiming for perfect dodges + counters),
 * web abilities for guards, drones and runners.
 */
import { floorAt, boxesIn, overWater, raycast } from "./collide.js";
import { findAnchor } from "./hero.js";
import { waypoints } from "./missions.js";
import { bossBot } from "./bosses.js";
import { threatTime } from "./enemies.js";
import { ready } from "./combat.js";

const fl = {};

export function createBot() {
  return { path: null, pi: 0, goal: null, replanT: 0, stuckT: 0, last: null, alt: 0, atkT: 0, climbBox: null };
}

/* ------------------------------------------------------------------ nav */
function cellOf(nav, x, z) {
  return [Math.floor((x - nav.ox) / nav.size), Math.floor((z - nav.oz) / nav.size)];
}
function free(nav, gx, gz) {
  return gx >= 0 && gz >= 0 && gx < nav.w && gz < nav.h && !nav.block[gz * nav.w + gx];
}
function nearestFree(nav, gx, gz) {
  if (free(nav, gx, gz)) return [gx, gz];
  for (let r = 1; r < 12; r++) {
    for (let dz = -r; dz <= r; dz++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
        if (free(nav, gx + dx, gz + dz)) return [gx + dx, gz + dz];
      }
    }
  }
  return null;
}
function astar(nav, sx, sz, tx, tz) {
  const s = nearestFree(nav, ...cellOf(nav, sx, sz));
  const t = nearestFree(nav, ...cellOf(nav, tx, tz));
  if (!s || !t) return null;
  const W = nav.w;
  const N = nav.w * nav.h;
  const g = new Float32Array(N).fill(Infinity);
  const came = new Int32Array(N).fill(-1);
  const closed = new Uint8Array(N);
  const open = [];
  const si = s[1] * W + s[0];
  const ti = t[1] * W + t[0];
  g[si] = 0;
  open.push([Math.hypot(s[0] - t[0], s[1] - t[1]), si]);
  let iter = 0;
  while (open.length && iter++ < 60000) {
    // tiny binary-heap-less pop (lists stay small on a street grid)
    let bi = 0;
    for (let k = 1; k < open.length; k++) if (open[k][0] < open[bi][0]) bi = k;
    const [, cur] = open[bi];
    open[bi] = open[open.length - 1];
    open.pop();
    if (closed[cur]) continue;
    closed[cur] = 1;
    if (cur === ti) break;
    const cx = cur % W;
    const cz = (cur / W) | 0;
    for (let dz = -1; dz <= 1; dz++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dz) continue;
        const nx = cx + dx;
        const nz = cz + dz;
        if (!free(nav, nx, nz)) continue;
        if (dx && dz && (!free(nav, cx + dx, cz) || !free(nav, cx, cz + dz))) continue;
        const ni = nz * W + nx;
        const ng = g[cur] + (dx && dz ? 1.414 : 1);
        if (ng < g[ni]) {
          g[ni] = ng;
          came[ni] = cur;
          open.push([ng + Math.hypot(nx - t[0], nz - t[1]), ni]);
        }
      }
    }
  }
  if (!closed[ti]) return null;
  const out = [];
  for (let c = ti; c !== -1; c = came[c]) out.push({ x: nav.ox + ((c % W) + 0.5) * nav.size, z: nav.oz + (((c / W) | 0) + 0.5) * nav.size });
  out.reverse();
  // thin the path: keep every 3rd point
  return out.filter((_, i) => i % 3 === 0 || i === out.length - 1);
}

/** the building box a rooftop point sits on (+ the box to climb first) */
function supportBox(W, x, y, z) {
  if (!floorAt(W.geo, x, z, y + 0.3, y - 1.5, fl) || !fl.box) return null;
  let b = fl.box;
  // setbacks: climb the lowest box under this footprint first
  let base = b;
  boxesIn(W.geo, x - 0.5, z - 0.5, x + 0.5, z + 0.5, (o) => {
    if (o.y0 < 0.6 && o.y1 < base.y1 + 0.01 && o.y1 > 2 && x > o.x0 && x < o.x1 && z > o.z0 && z < o.z1 && o.climb) base = o;
  });
  return { top: b, base };
}

/* ------------------------------------------------------------------ main */
/** the bot never walks or dodges off a pier / island edge into open water */
export function botInput(W, bot, dt) {
  return waterGuard(W, unstick(W, bot, botInputRaw(W, bot, dt), dt));
}

/** wedged against a corner (roof gear, cars …) while trying to move: sidestep + hop */
function unstick(W, bot, inp, dt) {
  const h = W.hero;
  if (bot.unstuckT > 0) {
    bot.unstuckT -= dt;
    inp.mx = bot.unstuckDir;
    inp.my = 0.3;
    inp.jump = bot.unstuckT > 0.55;
    inp.jumpHeld = inp.jump;
    return inp;
  }
  const moving = (inp.mx || inp.my) && h.grounded && h.action === "none" && h.mode === "ground";
  const d = Math.hypot(h.x - (bot.ux ?? h.x), h.z - (bot.uz ?? h.z));
  bot.ux = h.x;
  bot.uz = h.z;
  if (moving && d < 0.01) bot.wedgeT = (bot.wedgeT || 0) + dt;
  else bot.wedgeT = 0;
  if (bot.wedgeT > 0.9) {
    bot.wedgeT = 0;
    bot.unstuckT = 0.7;
    bot.unstuckDir = (bot.unstuckN = (bot.unstuckN || 0) + 1) % 2 ? 1 : -1;
  }
  return inp;
}

const wg = {};
function waterGuard(W, inp) {
  const G = W.geo;
  const h = W.hero;
  if (!W.city.water || h.mode === "swing" || h.mode === "climb") return inp;
  const dry = (dist, mx, my) => {
    const f = Math.sin(inp.camYaw);
    const c = Math.cos(inp.camYaw);
    let x = f * my - c * mx;
    let z = c * my + Math.sin(inp.camYaw) * mx;
    const m = Math.hypot(x, z) || 1;
    x = h.x + (x / m) * dist;
    z = h.z + (z / m) * dist;
    return floorAt(G, x, z, h.y + 0.6, -2, wg) || !overWater(G, x, z);
  };
  if (inp.dodge) {
    const opts = [[inp.mx, inp.my], [-inp.mx, -inp.my], [1, 0], [-1, 0], [0, 1], [0, -1]];
    const ok = opts.find(([mx, my]) => (mx || my) && dry(5, mx, my));
    if (ok) [inp.mx, inp.my] = ok;
    else inp.dodge = false;
    return inp;
  }
  if (h.grounded && (inp.mx || inp.my) && !dry(1.6, inp.mx, inp.my)) {
    inp.mx = 0;
    inp.my = 0;
    inp.jump = false;
  }
  return inp;
}

function botInputRaw(W, bot, dt) {
  const h = W.hero;
  const inp = { mx: 0, my: 0, camYaw: W.cam ? W.cam.viewYaw ?? W.cam.yaw : 0, jump: false, jumpHeld: false, sprint: true, light: false, heavy: false, web: false, dodge: false, swing: false, special: false, ab1: false, ab2: false, ab3: false, ab4: false, ab5: false, interactHeld: false };
  if (W.state !== "play" || h.action === "defeated") return inp;
  bot.atkT = Math.max(0, bot.atkT - dt);

  // always: dodge what's about to hit us
  const tt = threatTime(W);
  if (tt < 0.16 && h.dodgeCd <= 0 && h.mode !== "climb") {
    inp.dodge = true;
  }
  // counter right after a perfect dodge
  if (h.counterT > 0 && h.counterT < 0.95) inp.light = true;
  // full meter: web storm when crowded
  if (W.energy >= 100 && W.enemies.filter((e) => !e.dead && e.state !== "defeated" && Math.hypot(e.x - h.x, e.z - h.z) < 12).length >= 3) inp.special = true;

  if (W.boss && !W.boss.defeated) {
    bossBot(W, inp, bot);
    if (inp.jump) inp.jumpHeld = true;
    return inp;
  }

  // ---- fight engaged enemies first (same level)
  const foe = nearestFoe(W, h);
  if (foe) {
    fight(W, bot, inp, foe, dt);
    if (inp.jump) inp.jumpHeld = true;
    return inp;
  }

  // ---- mission waypoint
  const wps = waypoints(W);
  const M = W.mission;
  const s = M.spec.steps[M.idx];
  if (!wps.length) return inp;
  let T = wps[0];
  let best = Infinity;
  for (const p of wps) {
    if (p.protect) continue;
    const d = Math.hypot(p.x - h.x, p.z - h.z) + Math.abs(p.y - h.y) * 2;
    if (d < best) {
      best = d;
      T = p;
    }
  }
  // floating pickups: aim for the floor they hover over
  if (T.intel) T = { ...T, y: T.y - 1.2 };
  // chase: web-pull the runner when in range
  if (s.type === "chase" && M.step.runner && !M.step.runner.dead) {
    const r = M.step.runner;
    const d = Math.hypot(r.x - h.x, r.z - h.z);
    if (d < 16 && ready(W, "pull")) inp.ab2 = true;
    else if (d < 24) inp.web = W.cool.shot <= 0;
    if (r.state === "stunned" && d < 3) inp.light = true;
  }
  // authored route hints (stairs, bridges): walk them in order first
  if (s.via) {
    if (bot.viaStep !== M.idx) {
      bot.viaStep = M.idx;
      bot.via = 0;
    }
    while (bot.via < s.via.length) {
      const v = s.via[bot.via];
      if (Math.hypot(v.x - h.x, v.z - h.z) < 2.2 && Math.abs(v.y - h.y) < 2.5) bot.via++;
      else break;
    }
    if (bot.via < s.via.length) {
      const v = s.via[bot.via];
      steer(inp, h, v.x, v.z);
      inp.sprint = false;
      if (h.mode === "climb") inp.jump = true;
      return inp;
    }
  }
  const dist = Math.hypot(T.x - h.x, T.z - h.z);
  // (the engine accepts E within 2.4 m of a civilian / 2.6 m of a device)
  const near = dist < (T.device ? 2.3 : 2.1) && Math.abs(T.y - h.y) < 2;
  if ((T.civ || T.device) && near) {
    inp.interactHeld = true;
    return inp;
  }
  goTo(W, bot, inp, T, dt);
  if (inp.jump) inp.jumpHeld = true;
  return inp;
}

function nearestFoe(W, h) {
  let best = null;
  let bd = Infinity;
  for (const e of W.enemies) {
    if (e.dead || e.state === "defeated" || e.runner) continue;
    if (e.state === "idle" || e.state === "patrol") {
      // only pick fights the mission wants (or that are right next to us)
      const d = Math.hypot(e.x - h.x, e.z - h.z);
      if (d > 5) continue;
    }
    const d = Math.hypot(e.x - h.x, e.z - h.z);
    const dy = Math.abs(e.y - h.y);
    if (d < 16 && dy < (e.fly ? 9 : 3) && d < bd) {
      bd = d;
      best = e;
    }
  }
  return best;
}

function fight(W, bot, inp, e, dt) {
  const h = W.hero;
  const dx = e.x - h.x;
  const dz = e.z - h.z;
  const d = Math.hypot(dx, dz);
  inp.camYaw = Math.atan2(dx, dz);
  inp.sprint = d > 6;
  // mid-climb with the enemy up top: finish the climb first (no attacks on a wall)
  if (h.mode === "climb" || h.mode === "ledge") {
    inp.my = 1;
    return;
  }
  // on a container / ledge above them: drop down; they're up on something: hop up
  if (!e.fly && h.grounded && h.y - e.y > 1.5) {
    inp.my = 1;
    return;
  }
  if (!e.fly && h.grounded && e.y - h.y > 1.5 && d < 3.5) {
    inp.my = 1;
    inp.jump = true;
    return;
  }
  // web tools
  if (e.fly) {
    if (W.cool.shot <= 0) inp.web = true;
    if (d < 4) {
      inp.jump = h.grounded;
      inp.light = !h.grounded;
    } else inp.my = 1;
    return;
  }
  if (e.K.guard && e.guardBroken <= 0 && ready(W, "pull") && d < 16) {
    inp.ab2 = true;
    return;
  }
  if (e.K.ranged && d > 6 && ready(W, "strike") && d < 24) {
    inp.ab3 = true;
    return;
  }
  if (d > 2.0) {
    // water between us (separate piers): go round by the streets
    if (W.city.water && !dryLine(W, h.x, h.z, e.x, e.z)) {
      streetTo(W, bot, inp, e.x, e.z, dt);
      return;
    }
    steerAround(W, inp, h, e.x, e.z);
    inp.sprint = d > 6;
    if (d < 9 && W.cool.shot <= 0 && bot.alt % 7 === 0) inp.web = true;
    return;
  }
  // in range: combos (L L L, L H, H H, finisher on weak foes)
  if (h.action !== "attack" || (h.atk && h.atk.t > 0.12)) {
    if (bot.atkT <= 0) {
      const seq = e.hp <= e.maxHp * 0.25 && !e.boss ? "H" : ["L", "L", "L", "L", "H", "H", "H", "L"][bot.alt % 8];
      if (seq === "L") inp.light = true;
      else inp.heavy = true;
      bot.alt++;
      bot.atkT = 0.16;
    }
  }
  if (e.K.guard && e.guardBroken <= 0) inp.heavy = true;
}

/**
 * web-swing traversal for far targets: from a roof (or mid-air) hold Q while
 * falling with an anchor ahead, release on the up-swing when moving toward
 * the target, chain again when falling. Returns true while it drives input.
 */
function swingTo(W, bot, inp, T) {
  const h = W.hero;
  const d = Math.hypot(T.x - h.x, T.z - h.z);
  const yaw = Math.atan2(T.x - h.x, T.z - h.z);
  if (h.mode === "swing") {
    const s = h.swing;
    const vt = h.vx * Math.sin(yaw) + h.vz * Math.cos(yaw);
    const past = (h.x - s.ax) * Math.sin(yaw) + (h.z - s.az) * Math.cos(yaw);
    // let go on the up-swing past the anchor, or when close
    inp.swing = !((h.vy > 1.5 && vt > 6 && past > -2) || d < 10 || h.vy > 9 || s.t > 2.6 || (T.y < h.y - 3 && d < 28));
    inp.camYaw = yaw;
    inp.my = 1;
    if (!inp.swing) bot.swung = (bot.swung || 0) + 1;
    return true;
  }
  if (h.grounded || h.mode === "climb" || h.mode === "ledge") return false;
  if (d < 22 || h.y < T.y - 1) return false;
  if (h.vy < -3 && h.y > 6) {
    const a = findAnchor(W, h, yaw);
    if (a) {
      const toward = (a.x - h.x) * Math.sin(yaw) + (a.z - h.z) * Math.cos(yaw);
      if (toward > 4) {
        inp.swing = true;
        inp.camYaw = yaw;
        inp.my = 1;
        return true;
      }
    }
  }
  return false;
}

/** no open water along the straight line a → b */
function dryLine(W, ax, az, bx, bz) {
  const n = Math.max(2, Math.ceil(Math.hypot(bx - ax, bz - az) / 1.5));
  for (let i = 1; i < n; i++) {
    const x = ax + ((bx - ax) * i) / n;
    const z = az + ((bz - az) * i) / n;
    if (overWater(W.geo, x, z) && !floorAt(W.geo, x, z, 50, -2, fl)) return false;
  }
  return true;
}

function goTo(W, bot, inp, T, dt) {
  const h = W.hero;
  if (bot.useSwing !== false && swingTo(W, bot, inp, T)) return;
  const dy = T.y - h.y;
  // climbing: go up (or let go when the target is below)
  if (h.mode === "climb") {
    if (dy < -2) {
      inp.jump = true;
    } else inp.my = 1;
    inp.sprint = true;
    return;
  }
  if (h.mode === "ledge" || h.mode === "swing") return;
  const onRoof = h.grounded && h.floorBox && h.floorBox.y1 > 1.5;
  const sameSurface = Math.abs(dy) < 2.2;
  // far target from a roof: leap off the edge (then swingTo takes over)
  if (onRoof && bot.useSwing !== false && dy < 2 && Math.hypot(T.x - h.x, T.z - h.z) > 30) {
    const yaw = Math.atan2(T.x - h.x, T.z - h.z);
    if (!floorAt(W.geo, h.x + Math.sin(yaw) * 1.4, h.z + Math.cos(yaw) * 1.4, h.y + 0.3, h.y - 0.3, fl)) {
      inp.jump = true;
      inp.camYaw = yaw;
      inp.my = 1;
      return;
    }
  }
  if (sameSurface && (onRoof || !T.y || T.y < 1.5)) {
    // same level: straight line on roofs, A* on the street
    if (!onRoof && T.y < 1.5) return streetTo(W, bot, inp, T.x, T.z, dt);
    steerAround(W, inp, h, T.x, T.z);
    return;
  }
  if (dy < -2.2) {
    // target below: walk straight at it and step off the roof edge
    steer(inp, h, T.x, T.z);
    return;
  }
  // target above: get to the supporting building and climb
  const sup = supportBox(W, T.x, T.y, T.z);
  if (!sup || !sup.base.climb) {
    steer(inp, h, T.x, T.z);
    return;
  }
  const b = h.y > sup.base.y1 - 0.5 && h.floorBox === sup.base ? sup.top : sup.base;
  if (onRoof && h.floorBox !== b && h.floorBox !== sup.base) {
    // on some other roof: head toward the target and drop off first
    steer(inp, h, T.x, T.z);
    return;
  }
  // closest point on the nearest FACE (kept 1.2 m in from the corners — a
  // corner has no face to climb)
  const ix = Math.max(b.x0 + 1.2, Math.min(h.x, b.x1 - 1.2));
  const iz = Math.max(b.z0 + 1.2, Math.min(h.z, b.z1 - 1.2));
  const outX = h.x < b.x0 ? b.x0 - h.x : h.x > b.x1 ? h.x - b.x1 : 0;
  const outZ = h.z < b.z0 ? b.z0 - h.z : h.z > b.z1 ? h.z - b.z1 : 0;
  let wx;
  let wz;
  if (outX >= outZ) {
    wx = h.x < (b.x0 + b.x1) / 2 ? b.x0 : b.x1;
    wz = iz;
  } else {
    wz = h.z < (b.z0 + b.z1) / 2 ? b.z0 : b.z1;
    wx = ix;
  }
  const wd = Math.hypot(wx - h.x, wz - h.z);
  if (wd < 2.6 || h.floorBox === sup.base) {
    // push into the wall to start the climb (always drive INTO the face — the
    // hero's radius keeps it ~0.4 m off the wall, which steer() calls "arrived")
    const cx = (b.x0 + b.x1) / 2;
    const cz = (b.z0 + b.z1) / 2;
    const nx = wx === b.x0 ? -1 : wx === b.x1 ? 1 : 0;
    const nz = wz === b.z0 ? -1 : wz === b.z1 ? 1 : 0;
    inp.camYaw = nx || nz ? Math.atan2(-nx, -nz) : Math.atan2(cx - h.x, cz - h.z);
    inp.my = 1;
    if (Math.hypot(wx - h.x, wz - h.z) > 1.2) steer(inp, h, wx, wz);
    return;
  }
  if (onRoof) return steer(inp, h, wx, wz);
  // street approach to just outside the wall
  const ox = wx + (h.x - wx) / (wd || 1) * 1.2;
  const oz = wz + (h.z - wz) / (wd || 1) * 1.2;
  streetTo(W, bot, inp, ox, oz, dt);
}

function streetTo(W, bot, inp, x, z, dt) {
  const h = W.hero;
  const key = `${Math.round(x)}:${Math.round(z)}`;
  bot.replanT -= dt;
  if (!bot.path || bot.goal !== key || bot.replanT <= 0) {
    bot.path = astar(W.city.nav, h.x, h.z, x, z);
    bot.pi = 0;
    bot.goal = key;
    bot.replanT = 1.5;
  }
  const P = bot.path;
  if (!P || !P.length) return steer(inp, h, x, z);
  while (bot.pi < P.length - 1 && Math.hypot(P[bot.pi].x - h.x, P[bot.pi].z - h.z) < 2.2) bot.pi++;
  const p = bot.pi >= P.length - 1 ? { x, z } : P[bot.pi];
  steer(inp, h, p.x, p.z);
  // stuck → hop
  const prog = Math.hypot(h.x - (bot.lx || 0), h.z - (bot.lz || 0));
  bot.lx = h.x;
  bot.lz = h.z;
  if (prog < 0.01 && h.grounded) bot.stuckT += dt;
  else bot.stuckT = 0;
  if (bot.stuckT > 1) {
    inp.jump = true;
    bot.stuckT = 0;
    bot.replanT = 0;
  }
}

/** steer, detouring round the corner of whatever box blocks the straight line (roof gear, containers) */
const rcB = {};
function steerAround(W, inp, h, x, z) {
  const dx = x - h.x;
  const dz = z - h.z;
  const d = Math.hypot(dx, dz);
  if (d < 0.4) return;
  if (raycast(W.geo, h.x, h.y + 0.9, h.z, dx, 0, dz, 1, rcB) && rcB.box && rcB.box.y1 > h.y + 0.6 && rcB.t * d < d - 0.8) {
    const b = rcB.box;
    const m = 1.3;
    let best = null;
    let bc = Infinity;
    for (const [cx, cz] of [[b.x0 - m, b.z0 - m], [b.x1 + m, b.z0 - m], [b.x0 - m, b.z1 + m], [b.x1 + m, b.z1 + m]]) {
      if (!floorAt(W.geo, cx, cz, h.y + 0.5, h.y - 0.5, fl)) continue;
      const c = Math.hypot(cx - h.x, cz - h.z) + Math.hypot(x - cx, z - cz);
      if (c < bc) {
        bc = c;
        best = [cx, cz];
      }
    }
    if (best && Math.hypot(best[0] - h.x, best[1] - h.z) > 0.7) return steer(inp, h, best[0], best[1]);
  }
  steer(inp, h, x, z);
}

function steer(inp, h, x, z) {
  const dx = x - h.x;
  const dz = z - h.z;
  if (Math.hypot(dx, dz) < 0.4) return;
  inp.camYaw = Math.atan2(dx, dz);
  inp.my = 1;
}
