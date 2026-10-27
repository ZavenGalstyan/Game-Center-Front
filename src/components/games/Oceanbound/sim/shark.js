/**
 * Oceanbound — the shark.
 *
 * circle   orbits the raft, fin above water
 * approach telegraphed: picks an edge foundation, warning + music cue,
 *          swims to it (≥ 5 s of warning before the first bite)
 * bite     clamps onto the foundation and chews (hp drain); two spear hits
 *          (or one strong one) drive it off → flee
 * hunt     the player is in the water: closes in at depth…
 * lunge    …0.6 s wind-up (fin + rush) then a bite if still close
 * recover  swims off after a lunge, then hunts again
 * flee     swims away from the raft for a while, then circles
 * dead     sinks, drops shark meat, respawns later
 */
import { CELL, isEdgeCell, connectedWithout, dependents, removePiece, hasCell } from "./raft.js";
import { waveHeight } from "./waves.js";
import { groundHeight } from "./islands.js";
import { clamp, wrapAngle, TAU } from "./util.js";

export const SHARK_HP = 120;
const CIRCLE_SPEED = 3.0;
const BITE_DPS = 6.5;

export function createShark(r) {
  return { x: 14, y: -1.1, z: 6, yaw: 0, speed: CIRCLE_SPEED, state: "circle", t: 0, hp: SHARK_HP, target: null, cd: 150, orbit: 0, dir: 1, hits: 0, hitFlash: 0, respawn: 0, warned: false, attackPt: null, lungeT: 0, thrash: 0, r: r || Math.random, alive: true };
}

function raftRadius(G) {
  let m = 0;
  for (const c of G.raft.cells.values()) m = Math.max(m, Math.hypot((c.i + 0.5) * CELL, (c.j + 0.5) * CELL));
  return m + CELL * 0.7;
}
function steerTo(S, tx, ty, tz, speed, dt, turn = 2.2) {
  const dx = tx - S.x;
  const dz = tz - S.z;
  const want = Math.atan2(dx, dz);
  const da = wrapAngle(want - S.yaw);
  S.yaw += clamp(da, -turn * dt, turn * dt);
  S.speed += (speed - S.speed) * Math.min(1, 2 * dt);
  S.x += Math.sin(S.yaw) * S.speed * dt;
  S.z += Math.cos(S.yaw) * S.speed * dt;
  S.y += (ty - S.y) * Math.min(1, 1.5 * dt);
  return Math.hypot(dx, dz);
}

export function pickAttackCell(G) {
  const R = G.raft;
  const edge = [...R.cells.values()].filter((c) => isEdgeCell(R, c.i, c.j));
  if (!edge.length) return null;
  const c = edge[Math.floor(G.shark.r() * edge.length) % edge.length];
  // approach from an open side
  const sides = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ].filter(([di, dj]) => !hasCell(R, c.i + di, c.j + dj));
  const [di, dj] = sides[Math.floor(G.shark.r() * sides.length) % sides.length];
  return { i: c.i, j: c.j, lx: (c.i + 0.5 + di * 0.5) * CELL + di * 1.05, lz: (c.j + 0.5 + dj * 0.5) * CELL + dj * 1.05, di, dj };
}

/** player-in-water check the AI uses */
function playerHuntable(G) {
  const P = G.player;
  if (P.mode !== "swim" || G.dead) return false;
  const d = Math.hypot(P.x - G.shark.x, P.z - G.shark.z);
  if (d > 46) return false;
  // shallows are safe
  const depth = waveHeight(P.x, P.z, G.t) - groundHeight(G.world, P.x, P.z);
  return depth > 2.2;
}

export function stepShark(G, dt) {
  const S = G.shark;
  const R = G.raft;
  const P = G.player;
  const ev = G.events;
  S.t += dt;
  S.hitFlash = Math.max(0, S.hitFlash - dt * 3);
  S.thrash = Math.max(0, S.thrash - dt);
  const water = waveHeight(S.x, S.z, G.t);

  if (S.state === "dead") {
    S.y -= dt * 0.9;
    S.respawn -= dt;
    if (S.respawn <= 0) {
      // a new shark arrives from afar
      const a = S.r() * TAU;
      S.x = R.x + Math.cos(a) * 60;
      S.z = R.z + Math.sin(a) * 60;
      S.y = -1.2;
      S.hp = SHARK_HP;
      S.state = "circle";
      S.cd = 70;
      S.alive = true;
      ev.push({ t: "sharkSpawn" });
    }
    return;
  }

  const rr = raftRadius(G);
  const hunt = playerHuntable(G);
  if (hunt && (S.state === "circle" || S.state === "approach")) {
    S.state = "hunt";
    S.t = 0;
    ev.push({ t: "sharkHunt" });
  }

  // keep out of shallow water
  const gh = groundHeight(G.world, S.x, S.z);
  const shallow = water - gh < 2.4;

  switch (S.state) {
    case "circle": {
      S.cd -= dt;
      S.orbit += (S.dir * CIRCLE_SPEED * dt) / (rr + 6);
      const ox = R.x + Math.cos(S.orbit) * (rr + 6);
      const oz = R.z + Math.sin(S.orbit) * (rr + 6);
      steerTo(S, ox, -0.95, oz, CIRCLE_SPEED, dt, 1.6);
      const near = Math.hypot(P.x - R.x, P.z - R.z) < 45;
      if (S.cd <= 0 && !shallow && near) {
        const tgt = pickAttackCell(G);
        if (tgt) {
          S.target = tgt;
          S.state = "approach";
          S.t = 0;
          S.hits = 0;
          ev.push({ t: "sharkWarn" });
        } else S.cd = 20;
      }
      if (S.r() < dt * 0.02) S.dir = -S.dir;
      break;
    }
    case "approach": {
      const T = S.target;
      if (!T || !hasCell(R, T.i, T.j)) {
        S.state = "circle";
        S.cd = 30;
        break;
      }
      const tx = R.x + T.lx;
      const tz = R.z + T.lz;
      // circle once more before committing (telegraph ≥ 5 s)
      const sp = S.t < 5 ? 3.4 : 4.6;
      const d = S.t < 5 ? steerTo(S, R.x + Math.cos(S.orbit) * (rr + 3.5), -0.8, R.z + Math.sin(S.orbit) * (rr + 3.5), sp, dt, 2) : steerTo(S, tx, -0.75, tz, sp, dt, 2.6);
      if (S.t < 5) S.orbit += (S.dir * sp * dt) / (rr + 3.5);
      if (S.t >= 5 && d < 0.9) {
        S.state = "bite";
        S.t = 0;
        S.x = tx;
        S.z = tz;
        S.yaw = Math.atan2(-T.di, -T.dj);
        ev.push({ t: "sharkBite", i: T.i, j: T.j });
      }
      if (S.t > 30) {
        S.state = "circle";
        S.cd = 25;
      }
      break;
    }
    case "bite": {
      const T = S.target;
      if (!T || !hasCell(R, T.i, T.j)) {
        S.state = "flee";
        S.t = 0;
        break;
      }
      // stay latched to the moving raft
      S.x = R.x + T.lx;
      S.z = R.z + T.lz;
      S.y += (-0.45 - S.y) * Math.min(1, 3 * dt);
      S.yaw = Math.atan2(-T.di, -T.dj);
      S.thrash = 0.3;
      const cell = R.cells.get(`${T.i}:${T.j}`);
      cell.hp -= BITE_DPS * dt;
      if (Math.floor(S.t * 1.6) !== Math.floor((S.t - dt) * 1.6)) ev.push({ t: "sharkChomp", x: S.x, y: water, z: S.z });
      if (cell.hp <= 0) {
        if (R.cells.size > 4 && connectedWithout(R, T.i, T.j)) {
          G.destroyFoundation(T.i, T.j);
          ev.push({ t: "foundationLost", x: S.x, y: water, z: S.z });
        } else cell.hp = 12;
        S.state = "flee";
        S.t = 0;
      }
      if (S.t > 16) {
        S.state = "flee";
        S.t = 0;
      }
      break;
    }
    case "hunt": {
      if (!hunt) {
        S.state = "circle";
        S.cd = Math.max(S.cd, 20);
        break;
      }
      const ty = clamp(P.y + 0.6, -6, water - 0.7);
      const d = steerTo(S, P.x, ty, P.z, 5.2, dt, 2.6);
      if (d < 3.6 && S.t > 1.2) {
        S.state = "lunge";
        S.t = 0;
        S.lungeT = 0.65;
        ev.push({ t: "sharkLunge" });
      }
      if (shallow) {
        S.state = "recover";
        S.t = 0;
      }
      break;
    }
    case "lunge": {
      const d = steerTo(S, P.x, clamp(P.y + 0.6, -6, water - 0.5), P.z, S.t < S.lungeT ? 2 : 8, dt, 3.5);
      if (S.t >= S.lungeT) {
        if (d < 2.3 && P.mode === "swim" && !G.dead) {
          G.hurt(22, "shark");
          ev.push({ t: "sharkHitPlayer", x: S.x, y: S.y, z: S.z });
        } else ev.push({ t: "sharkMiss" });
        S.state = "recover";
        S.t = 0;
      }
      break;
    }
    case "recover": {
      const ax = S.x + (S.x - P.x);
      const az = S.z + (S.z - P.z);
      steerTo(S, ax, -2, az, 4.2, dt, 2);
      if (S.t > 2.8) {
        S.state = hunt ? "hunt" : "circle";
        S.t = 0;
      }
      break;
    }
    case "flee": {
      const ax = S.x + (S.x - R.x);
      const az = S.z + (S.z - R.z);
      steerTo(S, ax, -2.5, az, 6, dt, 2);
      if (S.t > (S.fleeFor || 18)) {
        S.state = "circle";
        S.orbit = Math.atan2(S.z - R.z, S.x - R.x);
        S.cd = 55 + S.r() * 45;
        S.hp = Math.min(SHARK_HP, S.hp + 30);
      }
      break;
    }
  }
  if (shallow && S.state !== "bite") {
    // turn back toward deep water (the raft side)
    const dx = R.x - S.x;
    const dz = R.z - S.z;
    const d = Math.hypot(dx, dz) || 1;
    S.x += (dx / d) * dt * 2;
    S.z += (dz / d) * dt * 2;
  }
  S.y = Math.min(S.y, water - 0.35);
  S.y = Math.max(S.y, gh + 0.6);
}

/** spear / axe hit; returns true if it landed */
export function hitShark(G, dmg) {
  const S = G.shark;
  if (S.state === "dead") return false;
  S.hp -= dmg;
  S.hitFlash = 1;
  S.thrash = 0.6;
  S.hits++;
  G.events.push({ t: "sharkHurt", x: S.x, y: S.y, z: S.z });
  if (S.hp <= 0) {
    S.state = "dead";
    S.alive = false;
    S.respawn = 150;
    G.stat.killed = (G.stat.killed || 0) + 1;
    G.events.push({ t: "sharkDie", x: S.x, y: S.y, z: S.z });
    G.onSharkKilled?.(S);
    return true;
  }
  if (S.state === "bite" && (S.hits >= 2 || dmg >= 40)) {
    S.state = "flee";
    S.t = 0;
    S.fleeFor = 22;
    G.stat.repelled = (G.stat.repelled || 0) + 1;
    G.events.push({ t: "sharkRepelled" });
  } else if (S.state === "hunt" || S.state === "lunge") {
    if (S.state === "lunge") {
      G.stat.repelled = (G.stat.repelled || 0) + 1;
      G.events.push({ t: "sharkRepelled" });
    }
    S.state = "flee";
    S.t = 0;
    S.fleeFor = 9;
  } else if (S.state === "approach") {
    S.state = "flee";
    S.t = 0;
    S.fleeFor = 15;
    G.stat.repelled = (G.stat.repelled || 0) + 1;
    G.events.push({ t: "sharkRepelled" });
  }
  return true;
}

/** approximate body spheres for hit tests: [x, y, z, r][] */
export function sharkSpheres(S) {
  const fx = Math.sin(S.yaw);
  const fz = Math.cos(S.yaw);
  return [1.1, 0.2, -0.8].map((o, k) => [S.x + fx * o, S.y, S.z + fz * o, [0.55, 0.6, 0.45][k]]);
}
export { dependents, removePiece };
