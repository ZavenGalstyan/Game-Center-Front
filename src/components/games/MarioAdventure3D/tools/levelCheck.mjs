/**
 * Mario Adventure 3D — structural checks for every built level (run via
 * `node tools/simTest.mjs levels`). Catches authoring mistakes the bot
 * might not: things placed in mid-air or inside walls, impossible coin
 * goals, broken pipe links, missing required content.
 */
import { levelById, BUILT_COUNT } from "../data/levels/index.js";
import { createWorld } from "../engine/world.js";
import { groundAt, pointInSolid } from "../engine/collision.js";

export function levelsCheck(ids = []) {
  let passes = 0;
  let fails = 0;
  const ok = (c, msg) => {
    if (c) passes++;
    else {
      fails++;
      console.log(`  FAIL ${msg}`);
    }
  };
  const list = ids.length ? ids : Array.from({ length: BUILT_COUNT }, (_, i) => i + 1);
  for (const id of list) {
    const lv = levelById(id);
    const W = createWorld(lv);
    const tag = `[${id} ${lv.name}]`;
    const groundY = (x, z, y) => {
      const t = W.terrain.height(x, z);
      const s = groundAt(W.solids, x, z, 0.3, y - 0.3, y + 0.3);
      return Math.max(Number.isFinite(t) ? t : -Infinity, s);
    };
    const onGround = (x, y, z) => Math.abs(groundY(x, z, y) - y) < 0.2;
    ok(onGround(...lv.spawn), `${tag} spawn on ground`);
    ok(lv.goal && onGround(lv.goal[0], lv.goal[1], lv.goal[2]), `${tag} goal on ground`);
    ok(lv.checkpoints.length >= 1 || !!lv.boss, `${tag} has a checkpoint`);
    for (const c of lv.checkpoints) ok(onGround(c[0], c[1], c[2]), `${tag} checkpoint at ${c[0]},${c[2]} on ground`);
    ok(!!lv.star, `${tag} has a hidden star`);
    ok(W.coinTotal >= 14, `${tag} has ≥14 coins (${W.coinTotal})`);
    ok(W.coinGoal <= Math.floor(W.coinTotal * 0.85), `${tag} coin goal ${W.coinGoal} ≤ 85% of ${W.coinTotal}`);
    ok(lv.enemies.length >= (lv.boss ? 0 : 3), `${tag} has ≥3 enemies (${lv.enemies.length})`);
    ok(lv.platforms.length >= 2, `${tag} has platforms`);
    ok(lv.route && lv.route.length > 3, `${tag} has a bot route`);
    if (lv.boss) ok(!!W.boss, `${tag} boss created`);
    // pipes stand on solid ground (not hanging over the void)
    for (const p of W.pipes) ok(Number.isFinite(W.terrain.height(p.x, p.z)) || groundAt(W.solids, p.x, p.z, 0.3, p.base - 0.3, p.base + 0.3) > -Infinity || p.base < W.sea.y + 0.5, `${tag} pipe at ${p.x},${p.z} on ground`);
    // pipes link to real pipes
    for (const p of W.pipes) if (p.to != null) ok(W.pipes[p.to] && W.pipes[p.to] !== p, `${tag} pipe → #${p.to} exists`);
    // coins: not inside solids, not under the ground
    for (const c of W.coins) {
      const t = W.terrain.height(c.x, c.z);
      ok(!(Number.isFinite(t) && c.y < t + 0.3), `${tag} coin ${c.x.toFixed(1)},${c.y.toFixed(1)},${c.z.toFixed(1)} above ground`);
      ok(!pointInSolid(W.solids, c.x, c.y, c.z, 0.05), `${tag} coin ${c.x.toFixed(1)},${c.y.toFixed(1)},${c.z.toFixed(1)} not inside a solid`);
    }
    // enemies stand on something (flyers excepted)
    for (const e of W.enemies) {
      if (e.type === "flyer") continue;
      ok(Number.isFinite(groundY(e.x, e.z, e.y)) && Math.abs(groundY(e.x, e.z, e.y) - e.y) < 0.3, `${tag} ${e.type} at ${e.x},${e.z} on ground`);
    }
    // the hidden star is not buried
    if (lv.star) ok(!pointInSolid(W.solids, lv.star[0], lv.star[1], lv.star[2], 0.1), `${tag} star not inside a solid`);
  }
  return { passes, fails };
}
