/**
 * Test bot: plays a level through the real sim input (turning, moving,
 * shooting, punching, interacting). Used by levelTest.mjs (Node) and the
 * browser harness. `human` adds aim error + reaction delay.
 */
import { CELL, EYE, WEAPONS, lineOfSight, objectiveTarget, cellOf, faceYaw, angDiff } from "../engine/sim.js";

export function createBot({ human = false, seed = 1 } = {}) {
  let s = seed >>> 0 || 1;
  const rnd = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
  const mem = { stuckT: 0, lx: 0, lz: 0, jitter: 0, react: 0, aimErr: 0, target: null, path: null, pathT: 0, idleT: 0 };
  return function bot(S, dt) {
    const P = S.P;
    const G = S.G;
    const inp = { mx: 0, mz: 0, dYaw: 0, dPitch: 0, fire: false, fireP: false, aim: false, reload: false, sprint: false, punch: false, block: false, interact: false, weapon: 0, wheel: 0 };
    if (S.status !== "play") return inp;
    const st = S.L.steps[S.step];
    // ---- choose an enemy to fight
    let foe = null, fd = 1e9;
    for (const e of S.E) {
      if (!e.alive || e.spawnT > 0) continue;
      const d = Math.hypot(e.x - P.x, e.z - P.z);
      if (d > 30) continue;
      if (!e.alerted && !(st && (st.t === "kill" || st.t === "boss" || st.t === "wave"))) continue;
      if (!lineOfSight(S, P.x, P.z, e.x, e.z)) continue;
      if (d < fd) {
        fd = d;
        foe = e;
      }
    }
    // ---- where to walk
    let goal = null;
    const lowHp = P.hp < 55;
    const W = WEAPONS[P.w];
    const A = P.ammo[P.w];
    const lowAmmo = P.ammo.pistol.mag + P.ammo.pistol.res + P.ammo.shotgun.mag + P.ammo.shotgun.res < 10;
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
    if (lowHp && !foe) goal = pick("hm");
    if (!goal && lowAmmo && !foe) goal = pick("ao");
    if (!goal && st) {
      if (st.t === "kill" || st.t === "boss" || st.t === "wave") {
        let tgt = null, td = 1e9;
        const ids = st.t === "kill" ? new Set(S.targets) : null;
        for (const e of S.E) {
          if (!e.alive) continue;
          if (ids && !ids.has(e.id)) continue;
          if (st.t === "boss" && e.type !== "brute") continue;
          const d = pathLen(S, P, e);
          if (d < td) {
            td = d;
            tgt = e;
          }
        }
        if (!tgt && st.t === "wave") tgt = null;
        else if (!tgt) tgt = S.E.find((e) => e.alive);
        if (tgt && !(foe && fd < 9)) goal = { x: tgt.x, z: tgt.z };
      } else {
        const t = objectiveTarget(S);
        if (t) goal = t;
      }
    }
    if (!goal && !foe) goal = pick("hmao");
    // ---- fight
    if (foe) {
      const want = faceYaw(P.x, P.z, foe.x, foe.z);
      const hy = foe.D.headY - 0.1;
      const aimY = fd < 6 ? foe.D.body * 0.6 : hy;
      const wantP = Math.atan2(aimY - EYE, fd);
      if (human) {
        mem.react -= dt;
        if (mem.target !== foe) {
          mem.target = foe;
          mem.react = 0.25 + rnd() * 0.2;
          mem.aimErr = (rnd() - 0.5) * 0.12;
        }
      }
      const err = human ? mem.aimErr * Math.min(1, fd / 6) : 0;
      const dy = angDiff(P.yaw, want + err);
      const rate = human ? 5 : 30;
      inp.dYaw = Math.sign(dy) * Math.min(Math.abs(dy), rate * dt);
      inp.dPitch = Math.max(-rate * dt, Math.min(rate * dt, wantP - P.pitch));
      const onTarget = Math.abs(dy) < Math.atan2(foe.D.r * 0.8, fd) + 0.02;
      // weapon choice
      const other = P.w === "pistol" ? "shotgun" : "pistol";
      if (A.mag === 0 && fd < 6 && P.owned[other] && P.ammo[other].mag > 0) inp.weapon = other === "pistol" ? 1 : 2; // swap instead of reloading in a brawl
      else if (P.owned.shotgun && fd < 8 && P.ammo.shotgun.mag > 0 && P.w !== "shotgun") inp.weapon = 2;
      else if (P.w === "shotgun" && (fd > 12 || P.ammo.shotgun.mag + P.ammo.shotgun.res === 0) && P.ammo.pistol.mag + P.ammo.pistol.res > 0) inp.weapon = 1;
      const noAmmo = A.mag + A.res === 0 && (!P.owned.shotgun || P.ammo.shotgun.mag + P.ammo.shotgun.res === 0 || P.w === "shotgun") && P.ammo.pistol.mag + P.ammo.pistol.res === 0;
      if (noAmmo || (fd < 1.9 && A.mag === 0 && P.reloadT <= 0 && !inp.weapon)) {
        if (fd < 2.0 && onTarget && P.punchCd <= 0) inp.punch = true;
        if (foe.state === "windup" && fd < foe.D.reach + 1) inp.block = true;
        goal = { x: foe.x, z: foe.z };
      } else {
        if (A.mag === 0 && A.res > 0) inp.reload = true;
        else if (onTarget && (!human || mem.react <= 0) && P.cool <= 0 && fd < W.range) {
          inp.fireP = true;
          inp.fire = true;
        }
        inp.aim = fd > 10;
        // kite: back off from melee range unless cornered
        const reach = foe.D.reach + 0.9;
        if (fd < reach + (foe.type === "brute" ? 1.5 : 0.3)) {
          goal = { x: P.x - (foe.x - P.x), z: P.z - (foe.z - P.z), back: true };
          if (foe.state === "windup" && foe.type === "brute") inp.block = fd < 3;
        } else if (!goal) goal = null;
      }
    }
    // ---- move toward goal along the grid path
    if (goal) {
      let wx, wz;
      if (goal.back) {
        wx = goal.x - P.x;
        wz = goal.z - P.z;
      } else {
        const nxt = nextWaypoint(S, P, goal, mem, dt);
        if (nxt) {
          wx = nxt.x - P.x;
          wz = nxt.z - P.z;
        }
      }
      if (wx !== undefined) {
        const l = Math.hypot(wx, wz) || 1;
        wx /= l;
        wz /= l;
        if (mem.jitter > 0) {
          mem.jitter -= dt;
          const a = mem.jdir;
          wx = Math.cos(a);
          wz = Math.sin(a);
        }
        const fx = -Math.sin(P.yaw), fz = -Math.cos(P.yaw);
        const rx = Math.cos(P.yaw), rz = -Math.sin(P.yaw);
        inp.mz = wx * fx + wz * fz;
        inp.mx = wx * rx + wz * rz;
        if (!foe) {
          const want = faceYaw(0, 0, wx, wz);
          const dy = angDiff(P.yaw, want);
          inp.dYaw = Math.sign(dy) * Math.min(Math.abs(dy), 8 * dt);
          inp.dPitch = Math.max(-2 * dt, Math.min(2 * dt, -P.pitch));
          inp.sprint = !lowHp;
        }
        // stuck?
        const moved = Math.hypot(P.x - mem.lx, P.z - mem.lz);
        mem.lx = P.x;
        mem.lz = P.z;
        if (moved < 0.2 * dt) mem.stuckT += dt;
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
      inp.dYaw = 1.2 * dt; // look around while waiting for a wave
    }
    if (!foe && A.mag < W.mag && A.res > 0 && P.reloadT <= 0) inp.reload = true;
    // ---- interact with whatever is in front when it helps
    if (S.prompt?.ok) {
      const t = S.prompt.text;
      if (t !== "Escape through the exit" || st?.t === "exit") inp.interact = true;
    }
    // face doors / items we're next to that need E
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
  // the last cell may be a solid target (switch panel, exit door): aim for its centre anyway
  if (k + 1 >= path.length - 1) return { x: goal.x, z: goal.z };
  return { x: c * CELL + CELL / 2, z: r * CELL + CELL / 2 };
}
