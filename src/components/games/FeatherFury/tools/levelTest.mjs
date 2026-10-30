/**
 * Structural checks for all 50 levels (headless):
 *   node src/components/games/FeatherFury/tools/levelTest.mjs [ids…]
 * - every level has enemies, birds, sane star thresholds and a valid world
 * - no two pieces overlap as authored (overlaps make Matter explode them apart)
 * - after the pre-settle nothing moved more than a few px or fell off
 * - left alone for 12 s, nothing breaks, no Moko dies and nothing drifts
 */
import { LEVELS } from "../data/levels.js";
import { createGame, step, destroyGame, ENEMIES } from "../engine/game.js";

const ids = process.argv.slice(2).map(Number).filter(Boolean);
const list = ids.length ? LEVELS.filter((l) => ids.includes(l.id)) : LEVELS;
let fails = 0;
const fail = (l, msg) => {
  fails++;
  console.log(`  ✗ ${l.id} ${l.name}: ${msg}`);
};

const box = (p) => {
  if (p.t === "enemy") {
    const r = ENEMIES[p.kind].r;
    return { x0: p.x - r, x1: p.x + r, y0: p.y - r, y1: p.y + r };
  }
  if (p.shape === "tri") return { x0: p.x - p.w / 2, x1: p.x + p.w / 2, y0: p.y - p.h / 2, y1: p.y + p.h / 2, tri: true };
  return { x0: p.x - p.w / 2, x1: p.x + p.w / 2, y0: p.y - p.h / 2, y1: p.y + p.h / 2 };
};

for (const l of list) {
  if (!l.birds.length) fail(l, "no birds");
  if (!l.pieces.some((p) => p.t === "enemy")) fail(l, "no enemies");
  if (!(l.stars[1] < l.stars[2])) fail(l, `bad star thresholds ${l.stars}`);
  if (l.world !== Math.floor((l.id - 1) / 10)) fail(l, "wrong world");
  const bs = [...l.pieces.map(box), ...l.terrain.filter((t) => t.shape !== "slope").map((t) => ({ x0: t.x - t.w / 2, x1: t.x + t.w / 2, y0: t.y - t.h / 2, y1: t.y + t.h / 2, terr: true }))];
  for (let i = 0; i < bs.length; i++) {
    for (let j = i + 1; j < bs.length; j++) {
      const a = bs[i], b = bs[j];
      if (a.terr && b.terr) continue;
      const ox = Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0);
      const oy = Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0);
      if (ox > 1 && oy > 1 && !a.tri && !b.tri) fail(l, `pieces ${i} and ${j} overlap (${ox.toFixed(0)}×${oy.toFixed(0)})`);
    }
  }
  const g = createGame(l);
  if (g.presettleLoss) fail(l, `${g.presettleLoss} pieces fell while settling`);
  let moved = 0, which = -1;
  // compare authored vs settled positions (blocks and enemies are created in order)
  const ents = [];
  let bi = 0, ei = 0;
  for (const p of l.pieces) ents.push(p.t === "enemy" ? g.enemies[ei++] : g.blocks[bi++]);
  l.pieces.forEach((p, i) => {
    const d = Math.hypot(ents[i].body.position.x - p.x, ents[i].body.position.y - p.y);
    if (d > moved) {
      moved = d;
      which = i;
    }
  });
  if (moved > 8) fail(l, `piece ${which} (${l.pieces[which].t} ${l.pieces[which].mat || l.pieces[which].kind}) moved ${moved.toFixed(1)}px while settling`);
  const snap = ents.map((e) => ({ x: e.body.position.x, y: e.body.position.y }));
  for (let i = 0; i < 720; i++) step(g);
  if (g.score || g.broken || g.defeated) fail(l, `idle: score ${g.score}, broken ${g.broken}, defeated ${g.defeated}`);
  let drift = 0;
  ents.forEach((e, i) => !e.dead && (drift = Math.max(drift, Math.hypot(e.body.position.x - snap[i].x, e.body.position.y - snap[i].y))));
  if (drift > 1) fail(l, `idle drift ${drift.toFixed(2)}px`);
  if (g.state !== "ready") fail(l, `idle state ${g.state}`);
  destroyGame(g);
  console.log(`${l.id.toString().padStart(2)} ${l.name.padEnd(22)} pieces ${String(l.pieces.length).padStart(3)} enemies ${l.pieces.filter((p) => p.t === "enemy").length} birds ${l.birds.join(",")} settle-move ${moved.toFixed(1)} width ${l.width} stars ${l.stars.slice(1).join("/")}`);
}
console.log(fails ? `\n${fails} problem(s)` : `\nall ${list.length} levels OK`);
process.exit(fails ? 1 : 0);
