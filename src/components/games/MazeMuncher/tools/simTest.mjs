/**
 * Headless checks: `node src/components/games/MazeMuncher/tools/simTest.mjs [levels|move|ai|power|lives|bot|all]`
 */
import { LEVELS } from "../levels.js";
import { DIRS, ENEMIES, field, newRun, open, parseMaze, pos, setWant, step, tileOf, nextLevel } from "../engine.js";
import { botStep } from "./bot.mjs";

const which = process.argv[2] || "all";
let fails = 0;
const check = (name, ok) => {
  console.log(`${ok ? "ok  " : "FAIL"} ${name}`);
  if (!ok) fails++;
};
const run = (g, secs, each) => {
  for (let t = 0; t < secs * 60; t++) {
    each?.(g);
    step(g, 1 / 60);
  }
  return g;
};
const play = (g) => ((g.phase = "play"), (g.timer = 0), g);

if (which === "levels" || which === "all") {
  check("10 levels", LEVELS.length === 10);
  LEVELS.forEach((L, i) => {
    const m = parseMaze(L.rows);
    const errs = [];
    if (L.rows.length !== 15 || L.rows.some((r) => r.length !== 21)) errs.push("size");
    if (!m.player || !m.door || m.home.length !== 3) errs.push("spawns");
    const reach = field(m, m.player.x, m.player.y);
    let orbs = 0;
    for (let k = 0; k < m.w * m.h; k++) {
      if (m.dots[k] && reach[k] < 0) errs.push(`dot ${k % m.w},${(k / m.w) | 0} unreachable`);
      if (m.dots[k] === 2) orbs++;
    }
    if (orbs !== 4) errs.push(`${orbs} orbs`);
    // every open tile reachable by the player, except the enemy home
    for (let k = 0; k < m.w * m.h; k++) {
      const x = k % m.w, y = (k / m.w) | 0;
      if (open(m, x, y) && reach[k] < 0 && !m.home.some((h) => h.x === x && h.y === y)) errs.push(`open ${x},${y} isolated`);
    }
    if (m.home.some((h) => reach[h.y * m.w + h.x] >= 0)) errs.push("player can enter home");
    const exit = field(m, m.door.x, m.door.y, true);
    if (m.home.some((h) => exit[h.y * m.w + h.x] < 0)) errs.push("home has no exit");
    // dead ends (corridors with one exit) make enemy traps — report them
    let dead = 0;
    for (let k = 0; k < m.w * m.h; k++) {
      const x = k % m.w, y = (k / m.w) | 0;
      if (open(m, x, y) && reach[k] >= 0 && Object.values(DIRS).filter(([dx, dy]) => open(m, x + dx, y + dy)).length < 2) dead++;
    }
    if (dead) errs.push(`${dead} dead ends`);
    check(`level ${i + 1}: ${m.total} collectibles, all reachable, sealed home with exit, no dead ends${errs.length ? " — " + errs.slice(0, 4).join("; ") : ""}`, !errs.length);
  });
  check("enemy speed rises every level", LEVELS.every((L, i) => !i || L.enemySpeed > LEVELS[i - 1].enemySpeed));
}

if (which === "move" || which === "all") {
  let g = play(newRun(0));
  const p = g.player;
  const sx = p.tx, sy = p.ty;
  setWant(g, DIRS.up); // (10,11) -> up is wall on level 1
  run(g, 0.5);
  check("walking into a wall doesn't move the player", p.tx === sx && p.ty === sy && p.p === 0);
  setWant(g, DIRS.left);
  run(g, 1);
  check("player walks left about speed*time tiles", Math.abs(sx - pos(p).x - LEVELS[0].playerSpeed) < 1.2 && pos(p).y === sy);
  let inWall = false;
  g = play(newRun(0));
  for (let k = 0; k < 4000; k++) {
    if (k % 37 === 0) setWant(g, Object.values(DIRS)[(k / 37) % 4 | 0]);
    g.enemies.forEach((e) => (e.mode = "home", e.wait = 1e9));
    step(g, 1 / 60);
    const t = tileOf(g, g.player);
    if (!open(g.m, t.x, t.y) || !open(g.m, g.player.tx, g.player.ty)) inWall = true;
  }
  check("random steering for 66 s never enters a wall tile", !inWall);
  // buffered turn: request "up" before reaching a junction, it applies there
  g = play(newRun(0));
  g.enemies.forEach((e) => (e.mode = "home", e.wait = 1e9));
  setWant(g, DIRS.left);
  run(g, 0.05);
  setWant(g, DIRS.up); // (9,11) up is wall; first open "up" to the left is col 4... wherever it is, it must be taken
  let turned = null;
  run(g, 3, (gg) => !turned && gg.player.dir === DIRS.up && (turned = { x: gg.player.tx, y: gg.player.ty }));
  check(`buffered turn taken at the first junction (${turned?.x},${turned?.y})`, turned && open(g.m, turned.x, turned.y - 1) && [...Array(10 - turned.x - 1)].every((_, k) => !open(g.m, turned.x + 1 + k, 10)));
  // instant reverse
  g = play(newRun(0));
  setWant(g, DIRS.left);
  run(g, 0.1);
  const before = pos(g.player).x;
  setWant(g, DIRS.right);
  run(g, 0.1);
  check("reversal applies immediately mid-tile", pos(g.player).x > before);
  // wrap tunnel on level 1 row 7
  g = play(newRun(0));
  g.player = { ...g.player, tx: 1, ty: 7, p: 0, dir: DIRS.left, want: DIRS.left };
  g.enemies.forEach((e) => (e.mode = "home", e.wait = 1e9));
  run(g, 0.6);
  check("tunnel wraps to the far side", g.player.tx > 15 && g.player.ty === 7);
}

if (which === "ai" || which === "all") {
  for (const lv of [0, 4, 9]) {
    const g = play(newRun(lv, { god: true }));
    let bad = 0, left = new Set();
    const visited = ENEMIES.map(() => new Set());
    run(g, 60, (gg) => {
      botStep(gg);
      for (const e of gg.enemies) {
        const gate = e.mode === "leave" || e.mode === "eyes" || e.mode === "home";
        if (!open(gg.m, e.tx, e.ty, gate) && !gg.m.home.some((h) => h.x === e.tx && h.y === e.ty)) bad++;
        if (e.mode === "out") left.add(e.i);
        visited[e.i].add(e.ty * 100 + e.tx);
      }
    });
    check(`level ${lv + 1}: 60 s of AI — enemies never in walls, all 4 leave home, each explores (${visited.map((v) => v.size).join("/")} tiles)`, !bad && left.size === 4 && visited.every((v) => v.size > 25));
  }
  // chaser catches a stationary player
  const g = play(newRun(0));
  g.life = 99;
  let caught = false;
  run(g, 20, (gg) => gg.phase === "dying" && (caught = true));
  check("chaser hunts down a stationary player", caught);
  // distinct behaviours: ambush targets ahead of the player, patrol cycles corners
  const h = play(newRun(2));
  h.life = 99;
  const trail = ENEMIES.map(() => []);
  run(h, 12, (gg) => (botStep(gg), (gg.god = true), gg.enemies.forEach((e) => trail[e.i].push(`${e.tx},${e.ty}`))));
  const diff = new Set(trail.map((t) => t.join("|"))).size;
  check("the four enemies follow four different paths", diff === 4);
}

if (which === "power" || which === "all") {
  const g = play(newRun(0, { god: true })); // god: the idle player isn't caught while enemies get into position
  g.life = 99;
  run(g, 3);
  const m = g.m;
  const orb = [...m.dots].findIndex((d) => d === 2);
  g.player = { ...g.player, tx: orb % m.w, ty: (orb / m.w) | 0, p: 0, dir: null, want: null };
  const s0 = g.score;
  step(g, 1 / 60);
  const out = g.enemies.filter((e) => e.mode === "fright");
  check("power orb: +50 and active enemies turn frightened", g.score - s0 >= 50 && out.length >= 1 && g.fright > 0);
  // drop two frightened enemies onto the player: 200 then 400
  const [a, b] = g.enemies.filter((e) => e.mode === "fright").concat(g.enemies.filter((e) => e.mode !== "fright")).slice(0, 2);
  a.mode = b.mode = "fright";
  const s1 = g.score;
  Object.assign(a, { tx: g.player.tx, ty: g.player.ty, p: 0 });
  step(g, 1 / 60);
  Object.assign(b, { tx: g.player.tx, ty: g.player.ty, p: 0 });
  step(g, 1 / 60);
  check(`eating frightened enemies chains 200 + 400 (got +${g.score - s1})`, g.score - s1 >= 600 && a.mode === "eyes" && b.mode === "eyes" && g.phase === "play");
  run(g, 8);
  check("eaten enemies return home and come back out", g.enemies.every((e) => e.mode !== "eyes"));
  check("power wears off", g.fright === 0 && !g.enemies.some((e) => e.mode === "fright"));
  // bonus item
  const k = play(newRun(1));
  k.god = true;
  let spawned = 0, got = 0;
  run(k, 120, (gg) => {
    botStep(gg, { bonus: true });
    for (const ev of gg.events) (ev.type === "bonusSpawn" && spawned++), (ev.type === "bonus" && got++);
    gg.events.length = 0;
  });
  check(`bonus items spawn twice per maze and can be collected (${spawned} spawned, ${got} eaten)`, spawned === 2 && got >= 1);
}

if (which === "lives" || which === "all") {
  const g = play(newRun(0));
  g.life = 99;
  const deaths = [];
  run(g, 90, (gg) => gg.events.forEach((e) => e.type === "death" && deaths.push(gg.lives)) || (gg.events.length = 0));
  check(`idle player loses 3 lives then game over (${deaths.join(",")})`, deaths.length === 3 && g.phase === "over" && g.lives === 0);
  const r = play(newRun(0));
  r.score = 9990;
  const lives = r.lives;
  const i = [...r.m.dots].findIndex((d) => d === 1);
  r.player = { ...r.player, tx: i % r.m.w, ty: (i / r.m.w) | 0, p: 0 };
  step(r, 1 / 60);
  check("extra life at 10,000", r.lives === lives + 1);
  // combo bonus: ten dots in a row
  const c = play(newRun(0));
  c.enemies.forEach((e) => (e.mode = "home", e.wait = 1e9));
  let combo = null;
  run(c, 6, (gg) => (botStep(gg), gg.events.forEach((e) => e.type === "combo" && !combo && (combo = e)), (gg.events.length = 0)));
  check(`steady chomping triggers combo bonuses (x${combo?.combo} = +${combo?.pts})`, combo && combo.combo === 10 && combo.pts === 50);
}

if (which === "bot" || which === "all") {
  // god-mode bot proves every maze can be fully cleared through the real controller
  const g = newRun(0, { god: true });
  const times = [];
  for (let lv = 0; lv < LEVELS.length; lv++) {
    if (lv) nextLevel(g);
    let t = 0;
    while (g.phase !== "cleared" && t < 60 * 400) {
      botStep(g);
      step(g, 1 / 60);
      t++;
    }
    times.push(Math.round(t / 60));
    check(`level ${lv + 1}: bot clears all ${g.m.total} collectibles in ${Math.round(t / 60)} s`, g.phase === "cleared" && g.eaten === g.m.total);
  }
  check("last level reports victory", g.events.some((e) => e.type === "cleared" && e.last));
  // fair-play bot (enemies lethal) — informational difficulty curve
  const res = [];
  for (let lv = 0; lv < LEVELS.length; lv++) {
    let wins = 0;
    for (let n = 0; n < 6; n++) {
      const h = newRun(lv);
      for (let t = 0; t < 60 * 300 && !["cleared", "over"].includes(h.phase); t++) botStep(h, { careful: true }), step(h, 1 / 60);
      wins += h.phase === "cleared";
    }
    res.push(`${wins}/6`);
  }
  console.log(`info: careful bot wins per level: ${res.join(" ")}`);
}

console.log(fails ? `\n${fails} FAILED` : "\nall passed");
process.exit(fails ? 1 : 0);
