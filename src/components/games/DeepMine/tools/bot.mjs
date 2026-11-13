/**
 * Test bot: plays a level through the real sim input (turning, moving,
 * shooting, jumping, interacting, pulling levers in order, shooting cracked rock). Used by levelTest.mjs (Node) and the
 * browser harness. `human` adds aim error, reaction delay and a turn-rate limit.
 */
import { CELL, EYE, WEAPONS, lineOfSight, objectiveTarget, cellOf, faceYaw, angDiff, headPos } from "../engine/sim.js";

export function createBot({ human = false, seed = 1 } = {}) {
  let s = seed >>> 0 || 1;
  const rnd = () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296;
  const mem = { stuckT: 0, lx: 0, lz: 0, jitter: 0, react: 0, aimErr: 0, target: null, path: null, pathT: 0, strafe: 1, strafeT: 0 };
  return function bot(S, dt) {
    const P = S.P;
    const inp = { mx: 0, mz: 0, dYaw: 0, dPitch: 0, fire: false, fireP: false, aim: false, reload: false, sprint: false, jump: false, interact: false, flash: false, weapon: 0, wheel: 0 };
    if (S.status !== "play") return inp;
    const st = S.L.steps[S.step];
    const armed = !!P.w;
    // ---- choose an enemy to fight
    let foe = null, fd = 1e9;
    if (armed)
      for (const e of S.E) {
        if (!e.alive || e.spawnT > 0.3) continue;
        const d = Math.hypot(e.x - P.x, e.z - P.z);
        if (d > 32) continue;
        if (!e.alerted && !(st && (st.t === "kill" || st.t === "boss" || st.t === "wave"))) continue;
        if (!lineOfSight(S, P.x, P.z, e.x, e.z)) continue;
        // the king first only when nothing small is close
        const score = d + (e.type === "brute" ? 4 : 0);
        if (score < fd) {
          fd = score;
          foe = e;
        }
      }
    if (foe) fd = Math.hypot(foe.x - P.x, foe.z - P.z);
    // ---- where to walk
    let goal = null;
    const lowHp = P.hp < 55;
    const total = (w) => (P.owned[w] ? P.ammo[w].mag + P.ammo[w].res : 0);
    const lowAmmo = total("pistol") + total("shotgun") + total("flare") < 12;
    if (!P.flash && (st?.t === "flash" || S.t > 0.5) && !mem.flashed) {
      mem.flashed = true;
      inp.flash = true;
    }
    const pick = (kind) => {
      let b = null, bd = 1e9;
      for (const it of S.items) {
        if (it.taken || !kind.includes(it.kind)) continue;
        const d = pathLen(S, P, it);
        if (d < bd) {
          bd = d;
          b = it;
        }
      }
      return b && bd < 40 ? b : null;
    };
    if (lowHp && !foe) goal = pick("h");
    if (!goal && lowAmmo && !foe) goal = pick("asf");
    if (!goal && st) {
      if (st.t === "kill" || st.t === "boss" || st.t === "wave") {
        let tgt = null, td = 1e9;
        const ids = st.t === "kill" ? new Set(S.targets) : null;
        for (const e of S.E) {
          if (!e.alive) continue;
          if (ids && !ids.has(e.id)) continue;
          const d = pathLen(S, P, e);
          if (d < td) {
            td = d;
            tgt = e;
          }
        }
        if (!tgt && st.t !== "wave") tgt = S.E.find((e) => e.alive);
        if (tgt && !(foe && fd < 10)) goal = { x: tgt.x, z: tgt.z };
      } else if (st.t === "sequence") {
        const lv = S.switches.find((x) => x.color === S.L.order[S.seqI]);
        if (lv) goal = { x: lv.x + lv.nx * 0.8, z: lv.z + lv.nz * 0.8, lever: lv };
      } else if (st.t === "hidden") {
        const ck = S.cracks.find((k) => !k.broken);
        if (ck) {
          // stand on the open cell straight in front of the crack
          const side = [[0, -1], [1, 0], [0, 1], [-1, 0]].find(([dc, dr]) => S.G.floorish(S.G.at(ck.c + dc, ck.r + dr)));
          const fx = side ? ck.x + side[0] * CELL : ck.x, fz = side ? ck.z + side[1] * CELL : ck.z;
          goal = { x: fx, z: fz, crack: ck, stand: Math.hypot(fx - P.x, fz - P.z) < 0.6 };
        }
      } else {
        const t = objectiveTarget(S);
        if (t) goal = t;
      }
    }
    if (!goal && !foe) goal = pick("hasfb");
    // ---- boss dangers override everything
    let evade = null;
    for (const b of S.bombs) {
      const d = Math.hypot(P.x - b.tx, P.z - b.tz);
      if (d < b.r + 1.3) {
        const l = Math.max(0.01, d);
        evade = { x: P.x + ((P.x - b.tx) / l) * 4, z: P.z + ((P.z - b.tz) / l) * 4, back: true };
      }
    }
    for (const R of S.rings) {
      const d = Math.hypot(P.x - R.x, P.z - R.z);
      const gap = d - R.r;
      if (gap > 0 && gap < R.speed * 0.2 + 0.4 && P.grounded) inp.jump = true;
    }
    const king = S.E.find((e) => e.type === "brute" && e.alive && e.alerted);
    if (king && (king.state === "chargeWind" || king.state === "charge")) {
      const dx = P.x - king.x, dz = P.z - king.z;
      const l = Math.max(0.01, Math.hypot(dx, dz));
      const sx = -dz / l, sz = dx / l;
      evade = { x: P.x + sx * 4 * mem.strafe, z: P.z + sz * 4 * mem.strafe, back: true };
    }
    if (king && king.state === "slamWind" && Math.hypot(P.x - king.x, P.z - king.z) < 6) {
      const dx = P.x - king.x, dz = P.z - king.z;
      const l = Math.max(0.01, Math.hypot(dx, dz));
      evade = { x: P.x + (dx / l) * 4, z: P.z + (dz / l) * 4, back: true };
    }
    // ---- fight
    if (foe) {
      const [hx, hy, hz] = headPos(foe);
      const big = foe.type === "brute";
      const aimY = fd < 5 && !big ? foe.D.body * 0.6 : hy - (foe.type === "brute" ? 0.15 : 0.05);
      const want = faceYaw(P.x, P.z, fd < 5 && !big ? foe.x : hx, fd < 5 && !big ? foe.z : hz);
      const wantP = Math.atan2(aimY - (EYE + P.y), fd);
      if (human) {
        mem.react -= dt;
        if (mem.target !== foe) {
          mem.target = foe;
          mem.react = 0.25 + rnd() * 0.2;
          mem.aimErr = (rnd() - 0.5) * 0.1;
        }
      }
      const err = human ? mem.aimErr * Math.min(1, fd / 6) : 0;
      const dy = angDiff(P.yaw, want + err);
      const rate = human ? 6 : 30;
      inp.dYaw = Math.sign(dy) * Math.min(Math.abs(dy), rate * dt);
      inp.dPitch = Math.max(-rate * dt, Math.min(rate * dt, wantP - P.pitch));
      const tol = Math.atan2(big ? foe.D.headR * 0.8 : foe.D.r * 0.8, fd) + 0.015;
      const onTarget = Math.abs(dy) < tol && Math.abs(wantP - P.pitch) < 0.1;
      // weapon choice
      const has = (w) => P.owned[w] && P.ammo[w].mag + P.ammo[w].res > 0;
      let wantW = "pistol";
      if (has("flare") && (big || S.E.filter((e) => e.alive && e.alerted).length >= 3) && fd > 4) wantW = "flare";
      else if (has("shotgun") && fd < 7) wantW = "shotgun";
      if (!has(wantW)) wantW = ["shotgun", "pistol", "flare"].find(has) || P.w;
      if (wantW !== P.w && P.reloadT <= 0) inp.weapon = { pistol: 1, shotgun: 2, flare: 3 }[wantW];
      const W = WEAPONS[P.w];
      const A = P.ammo[P.w];
      if (A.mag === 0 && A.res > 0) inp.reload = true;
      else if (onTarget && (!human || mem.react <= 0) && P.cool <= 0 && fd < W.range && !inp.weapon) {
        inp.fireP = true;
        inp.fire = true;
      }
      inp.aim = fd > 12;
      // keep distance from melee range (big guys get more room)
      const reach = foe.D.reach + 0.9 + (foe.type === "brute" ? 2.5 : 0);
      if (fd < reach + 0.3) {
        goal = { x: P.x - (foe.x - P.x), z: P.z - (foe.z - P.z), back: true };
        if (foe.state === "windup" && fd < foe.D.reach + 0.8) inp.jump = false;
      } else if (foe.type === "brute" && !evade) {
        // circle-strafe the king
        mem.strafeT -= dt;
        if (mem.strafeT <= 0) {
          mem.strafeT = 2 + rnd() * 2;
          mem.strafe = rnd() < 0.5 ? -1 : 1;
        }
        const dx = P.x - foe.x, dz = P.z - foe.z;
        const l = Math.max(0.01, Math.hypot(dx, dz));
        const away = fd < 9 ? 0.6 : fd > 14 ? -0.6 : 0;
        goal = { x: P.x + (-dz / l) * mem.strafe * 3 + (dx / l) * away * 3, z: P.z + (dx / l) * mem.strafe * 3 + (dz / l) * away * 3, back: true };
      }
    }
    if (evade) goal = evade;
    // ---- move toward goal along the grid path
    if (goal) {
      let wx, wz, nextCell = null;
      if (goal.back) {
        wx = goal.x - P.x;
        wz = goal.z - P.z;
      } else {
        const nxt = nextWaypoint(S, P, goal, mem, dt);
        if (nxt) {
          wx = nxt.x - P.x;
          wz = nxt.z - P.z;
          nextCell = nxt;
        }
      }
      if (wx !== undefined) {
        const l = Math.hypot(wx, wz) || 1;
        wx /= l;
        wz /= l;
        if (mem.jitter > 0) {
          mem.jitter -= dt;
          wx = Math.cos(mem.jdir);
          wz = Math.sin(mem.jdir);
        }
        const hold = false;
        void nextCell;
        const fx = -Math.sin(P.yaw), fz = -Math.cos(P.yaw);
        const rx = Math.cos(P.yaw), rz = -Math.sin(P.yaw);
        if (!hold) {
          inp.mz = wx * fx + wz * fz;
          inp.mx = wx * rx + wz * rz;
        }
        if (!foe) {
          const want = faceYaw(0, 0, wx, wz);
          const dy = angDiff(P.yaw, want);
          inp.dYaw = Math.sign(dy) * Math.min(Math.abs(dy), (human ? 5 : 8) * dt);
          inp.dPitch = Math.max(-2 * dt, Math.min(2 * dt, -P.pitch));
          inp.sprint = !lowHp;
        }
        const moved = Math.hypot(P.x - mem.lx, P.z - mem.lz);
        mem.lx = P.x;
        mem.lz = P.z;
        if (!hold && moved < 0.2 * dt) mem.stuckT += dt;
        else mem.stuckT = Math.max(0, mem.stuckT - dt);
        if (mem.stuckT > 0.8) {
          mem.stuckT = 0;
          mem.jitter = 0.35;
          mem.jdir = rnd() * Math.PI * 2;
          mem.path = null;
        }
      }
    } else if (!foe) {
      inp.dPitch = Math.max(-2 * dt, Math.min(2 * dt, -P.pitch));
      inp.dYaw = 1.2 * dt;
    }
    if (armed && !foe) {
      const W = WEAPONS[P.w];
      const A = P.ammo[P.w];
      if (A.mag < W.mag && A.res > 0 && P.reloadT <= 0) inp.reload = true;
    }
    // ---- interact with whatever is in front when it helps
    // shoot the cracked rock once it is in front of us
    if (goal?.crack && !foe && armed) {
      const ck = goal.crack;
      const d = Math.hypot(ck.x - P.x, ck.z - P.z);
      if (goal.stand) {
        inp.mx = inp.mz = 0;
        const want = faceYaw(P.x, P.z, ck.x, ck.z);
        const dy = angDiff(P.yaw, want);
        inp.dYaw = Math.sign(dy) * Math.min(Math.abs(dy), 8 * dt);
        inp.dPitch = Math.max(-2 * dt, Math.min(2 * dt, Math.atan2(1.2 - EYE, d) - P.pitch));
        if (Math.abs(dy) < 0.15 && P.cool <= 0) {
          inp.fireP = inp.fire = true;
          const A = P.ammo[P.w];
          if (A.mag === 0) inp.reload = true;
        }
      }
    }
    if (S.prompt?.ok) {
      const t = S.prompt.text;
      const lever = /lever/i.test(t);
      const wrongLever = lever && st?.t === "sequence" && !(goal?.lever && Math.hypot(goal.lever.x - P.x, goal.lever.z - P.z) < 1.6);
      if (t === "Read the note") inp.interact = false;
      else if (wrongLever) inp.interact = false;
      else if (t !== "Go through the exit" || st?.t === "exit") inp.interact = true;
    }
    return inp;
  };
}

function passableFor(S, c, r) {
  const k = S.G.at(c, r);
  if (S.G.floorish(k)) return true;
  const d = S.doorAt.get(r * S.G.w + c);
  if (d) return d.kind === "door" || d.open >= 0.85 || d.kind === "exit";
  return false;
}

function bfs(S, from, goal) {
  const G = S.G;
  const sc = cellOf(from.x), sr = cellOf(from.z);
  const gc = cellOf(goal.x), gr = cellOf(goal.z);
  const prev = new Int32Array(G.w * G.h).fill(-2);
  const q = [sr * G.w + sc];
  prev[q[0]] = -1;
  let qi = 0;
  const target = gr * G.w + gc;
  while (qi < q.length) {
    const i = q[qi++];
    if (i === target) break;
    const c = i % G.w, r = (i - c) / G.w;
    for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nc = c + dc, nr = r + dr;
      const j = nr * G.w + nc;
      if (nc < 0 || nr < 0 || nc >= G.w || nr >= G.h || prev[j] !== -2) continue;
      if (j !== target && !passableFor(S, nc, nr)) continue;
      prev[j] = i;
      q.push(j);
    }
  }
  if (prev[target] === -2) return null;
  const path = [];
  for (let i = target; i !== -1; i = prev[i]) path.push(i);
  return path.reverse();
}

function pathLen(S, from, to) {
  const p = bfs(S, from, to);
  return p ? p.length * CELL : 1e9;
}

function nextWaypoint(S, P, goal, mem, dt) {
  mem.pathT -= dt;
  if (!mem.path || mem.pathT <= 0 || mem.goalKey !== `${cellOf(goal.x)},${cellOf(goal.z)}`) {
    mem.path = bfs(S, P, goal);
    mem.pathT = 0.5;
    mem.goalKey = `${cellOf(goal.x)},${cellOf(goal.z)}`;
  }
  const path = mem.path;
  if (!path) return null;
  const G = S.G;
  const here = cellOf(P.z) * G.w + cellOf(P.x);
  let k = path.indexOf(here);
  if (k < 0) k = 0;
  const i = path[Math.min(path.length - 1, k + 1)];
  const c = i % G.w, r = (i - c) / G.w;
  if (k + 1 >= path.length - 1) return { x: goal.x, z: goal.z };
  return { x: c * CELL + CELL / 2, z: r * CELL + CELL / 2 };
}

function lineOfSightToCell(S, P, ck) {
  // aim at the face of the cracked cell nearest to us
  const x = Math.max(ck.x - 0.95, Math.min(ck.x + 0.95, P.x));
  const z = Math.max(ck.z - 0.95, Math.min(ck.z + 0.95, P.z));
  return lineOfSight(S, P.x, P.z, x + (P.x - x) * 0.05, z + (P.z - z) * 0.05);
}
