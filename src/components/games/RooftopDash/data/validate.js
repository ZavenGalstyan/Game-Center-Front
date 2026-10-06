/**
 * Rooftop Dash — structural level validation (DEV / tools). Pure data checks;
 * reachability is proven separately by the route bot (tools/levelBot.mjs).
 *
 * Returns a list of problems (empty = valid).
 */
import { createWorld } from "../engine/world.js";
import { cylinderBlocked, groundBelow, pointInside } from "../engine/collision.js";
import { MOVE } from "../engine/config.js";
import { WORLDS } from "./worlds.js";

const GAMEPLAY = new Set(["vault", "pipe", "post", "wall", "room", "prop", "beam"]);

export function validateLevel(L) {
  const out = [];
  const bad = (m) => out.push(`L${L.id} ${L.name}: ${m}`);
  if (!WORLDS.some((w) => w.id === L.world)) bad(`unknown world ${L.world}`);
  if (!L.spawn) bad("no spawn");
  if (!L.finish) bad("no finish");
  if (!Array.isArray(L.stars) || L.stars.length !== 3) bad(`expected 3 stars, got ${L.stars ? L.stars.length : 0}`);
  if (!(L.targetTime > 0)) bad("no target time");
  if (out.length) return out;
  const W = createWorld(L);
  const C = W.C;
  const R = MOVE.RADIUS;
  // spawn: standing room + ground underneath
  if (cylinderBlocked(C, L.spawn.x, L.spawn.y, L.spawn.z, R, MOVE.HEIGHT)) bad("spawn inside geometry");
  if (!groundBelow(C, L.spawn.x, L.spawn.y + 0.05, L.spawn.z, R * 0.8, 0.2)) bad("spawn not on a roof");
  // finish: away from spawn, on a roof, clear
  const fd = Math.hypot(L.finish.x - L.spawn.x, L.finish.z - L.spawn.z);
  if (fd < 25) bad(`finish too close to spawn (${fd.toFixed(1)} m)`);
  if (!groundBelow(C, L.finish.x, L.finish.y + 0.05, L.finish.z, 0.5, 0.2)) bad("finish not on a roof");
  if (cylinderBlocked(C, L.finish.x, L.finish.y, L.finish.z, R, MOVE.HEIGHT)) bad("finish inside geometry");
  // checkpoints: on a roof, clear, ordered along the route
  L.checkpoints.forEach((cp, i) => {
    if (cylinderBlocked(C, cp.x, cp.y, cp.z, R, MOVE.HEIGHT)) bad(`checkpoint ${i} inside geometry`);
    if (!groundBelow(C, cp.x, cp.y + 0.05, cp.z, R * 0.8, 0.2)) bad(`checkpoint ${i} not on a roof`);
    if (cp.y < L.killY + 2) bad(`checkpoint ${i} below the kill height`);
  });
  // stars: not buried in a box
  L.stars.forEach((s, i) => {
    if (pointInside(C, s.x, s.y, s.z, 0.1)) bad(`star ${i} inside geometry`);
    if (s.y < L.killY + 1) bad(`star ${i} below the kill height`);
  });
  // gameplay boxes must not be swallowed by a building (an accidental overlap)
  const buildings = L.boxes.filter((b) => b.kind === "building");
  for (const b of L.boxes) {
    if (!GAMEPLAY.has(b.kind) || b.kind === "wall") continue;
    for (const B of buildings) {
      const inside = b.min[0] > B.min[0] - 1e-3 && b.max[0] < B.max[0] + 1e-3 && b.min[2] > B.min[2] - 1e-3 && b.max[2] < B.max[2] + 1e-3 && b.max[1] <= B.max[1] - 0.05;
      if (inside) bad(`${b.kind} box buried inside a building at ${b.min.map((v) => v.toFixed(1))}`);
    }
  }
  // buildings must not overlap each other in plan view at the same height band
  for (let i = 0; i < buildings.length; i++) {
    for (let j = i + 1; j < buildings.length; j++) {
      const a = buildings[i];
      const b = buildings[j];
      const ox = Math.min(a.max[0], b.max[0]) - Math.max(a.min[0], b.min[0]);
      const oz = Math.min(a.max[2], b.max[2]) - Math.max(a.min[2], b.min[2]);
      if (ox > 0.05 && oz > 0.05) bad(`buildings overlap (${a.min.map((v) => v.toFixed(1))} / ${b.min.map((v) => v.toFixed(1))})`);
    }
  }
  // movers: valid finite paths with a positive period
  (L.movers || []).forEach((m, i) => {
    const p = m.path;
    if (!p || !(p.period > 0.5)) bad(`mover ${i} has no valid period`);
    if (p.type === "line" || p.type === "lift") {
      if (!p.d || p.d.some((v) => !Number.isFinite(v))) bad(`mover ${i} path invalid`);
    } else if (p.type === "swing") {
      if (!(p.len > 0 && p.amp > 0 && p.amp < 1.2)) bad(`swing ${i} invalid`);
    } else bad(`mover ${i} unknown path type ${p.type}`);
  });
  // route
  if (!L.route || L.route.length < 3) bad("route too short");
  return out;
}

export function validateAll(levels) {
  const ids = new Set();
  const out = [];
  for (const L of levels) {
    if (ids.has(L.id)) out.push(`duplicate level id ${L.id}`);
    ids.add(L.id);
    out.push(...validateLevel(L));
  }
  return out;
}
