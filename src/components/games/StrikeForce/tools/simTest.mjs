/**
 * Strike Force — headless checks (node, no browser):
 *   node src/components/games/StrikeForce/tools/simTest.mjs [core|ladders|maps|weapons|match|all] [mapId]
 * core     collision: walls stop bodies, steps climb, ray casts
 * ladders  the player climbs a container ladder and stands on top
 * maps     every map: spawns / flags / hot spots on the main nav region,
 *          spawn → flag paths exist, no colliders overlapping spawns
 * weapons  12 weapons: distinct stats, TTK table, fire modes, reload rules
 * match    bot-only matches in all modes on each map: matches end, kills
 *          happen, nobody embeds in geometry or stays stuck
 */
import { createCollision } from "../engine/collision.js";
import { MAPS, getMap } from "../engine/maps/index.js";
import { createMatch, mapRuntime } from "../engine/match.js";
import { WEAPONS, damageAt, shotInterval, weaponById } from "../engine/weapons.js";
import * as C from "../engine/config.js";

const which = process.argv[2] || "all";
const onlyMap = process.argv[3];
let pass = 0;
let fail = 0;
const ok = (cond, msg) => {
  if (cond) pass++;
  else {
    fail++;
    console.log("  FAIL", msg);
  }
};

function core() {
  console.log("core");
  const boxes = [
    { x0: 2, y0: 0, z0: -5, x1: 2.4, y1: 3, z1: 5, shoot: true },
    { x0: -3, y0: 0, z0: -1, x1: -2, y1: 0.4, z1: 1, shoot: true },
    { x0: -5, y0: 0, z0: 3, x1: -4, y1: 2, z1: 4, shoot: false },
  ];
  const col = createCollision(boxes, { minX: -20, maxX: 20, minZ: -20, maxZ: 20 });
  const b = { x: 0, y: 0, z: 0, vx: 30, vy: 0, vz: 0, r: 0.34, h: 1.8, grounded: true };
  for (let i = 0; i < 60; i++) col.move(b, 1 / 60, 17);
  ok(b.x <= 2 - 0.34 + 1e-3 && b.x > 1.5, `fast body stops at the wall (x=${b.x.toFixed(3)})`);
  const s = { x: 0, y: 0, z: 0, vx: -4, vy: 0, vz: 0, r: 0.34, h: 1.8, grounded: true };
  for (let i = 0; i < 40; i++) {
    s.vx = -4;
    col.move(s, 1 / 60, 17);
  }
  ok(s.y > 0.39 && s.x < -2.2, `steps up a 0.4 m ledge (y=${s.y.toFixed(2)}, x=${s.x.toFixed(2)})`);
  const g = { x: 10, y: 3, z: 10, vx: 0, vy: 0, vz: 0, r: 0.34, h: 1.8, grounded: false };
  for (let i = 0; i < 120; i++) col.move(g, 1 / 60, 17);
  ok(Math.abs(g.y) < 1e-6 && g.grounded, "falls and lands on the ground");
  const h = col.ray(0, 1, 0, 1, 0, 0, 50);
  ok(h && Math.abs(h.t - 2) < 1e-6 && h.nx === -1, "ray hits wall face with normal");
  const h2 = col.ray(-4.5, 1, 0, 0, 0, 1, 50);
  ok(!h2 || h2.t > 10, "rays pass shoot-through boxes");
  ok(!col.los(0, 1.5, 0, 5, 1.5, 0), "LOS blocked by wall");
  ok(col.los(0, 1.5, 0, 0, 1.5, 9), "LOS open");
  const gr = col.ray(0, 2, 0, 0, -1, 0, 10);
  ok(gr && Math.abs(gr.t - 2) < 1e-6 && gr.ny === 1, "ray hits ground");
}

function ladders() {
  console.log("ladders");
  // a player walking into the harbor container ladder climbs onto the stack
  const M = createMatch({ mapId: "harbor", mode: "ffa", seed: 3 });
  M.state = "live";
  for (const c of M.combatants) if (!c.isPlayer) (c.brain = null), (c.alive = false), (c.respawnAt = 1e9);
  const P = M.player;
  const L = M.map.ladders[0];
  const face = { s: [0, 1], n: [0, -1], e: [1, 0], w: [-1, 0] }[L.face];
  P.x = (L.x0 + L.x1) / 2 + face[0] * 0.9;
  P.z = (L.z0 + L.z1) / 2 + face[1] * 0.9;
  P.y = 0;
  P.protect = 99;
  // look into the ladder and hold forward
  P.input.yaw = Math.atan2(face[0], face[1]);
  P.input.mz = 1;
  let climbed = false;
  for (let i = 0; i < 240; i++) {
    M.step(1 / 60);
    if (P.y > L.top - 0.05 && P.grounded) {
      climbed = true;
      break;
    }
  }
  ok(climbed, `player climbs the ladder onto the top (y=${P.y.toFixed(2)}, top ${L.top})`);
  let steady = true;
  P.input.mz = 0;
  for (let i = 0; i < 60; i++) {
    M.step(1 / 60);
    if (Math.abs(P.y - L.top) > 0.05) steady = false;
  }
  ok(steady, "player stands on the container top without sinking");
  for (const m of MAPS) ok(getMap(m.id).ladders.every((l) => l.top > 1), `${m.id}: ladders have sensible tops`);
}

function maps() {
  console.log("maps");
  for (const m of MAPS) {
    if (onlyMap && m.id !== onlyMap) continue;
    const t0 = performance.now();
    const { map, col, nav } = mapRuntime(m.id);
    const ms = performance.now() - t0;
    const main = nav.mainCells.length;
    const total = nav.nx * nav.nz;
    let blockedN = 0;
    for (let i = 0; i < total; i++) blockedN += nav.blocked[i];
    console.log(`  ${m.id}: ${map.boxes.length} boxes, ${map.props.length} props, nav main ${main}/${total - blockedN} free cells, cover ${nav.coverCells.length}, built in ${ms.toFixed(0)} ms`);
    ok(main > 0.8 * (total - blockedN), `${m.id}: main nav region holds most free cells (${main}/${total - blockedN})`);
    for (const team of [0, 1])
      for (const s of map.spawns[team]) {
        ok(nav.walkable(nav.cellOf(s.x, s.z)), `${m.id}: spawn ${team} (${s.x},${s.z}) on the nav region`);
        ok(!col.blocked(s.x, Math.max(0, col.floorAt(s.x, 2, s.z, C.BODY_R, 0, 2.5)) + 0.01, s.z, C.BODY_R, C.STAND_H), `${m.id}: spawn ${team} (${s.x},${s.z}) is clear`);
      }
    ok(map.spawns[0].length >= 8 && map.spawns[1].length >= 8, `${m.id}: 8+ spawns per team`);
    for (const k of ["A", "B", "C"]) {
      const f = map.flags[k];
      ok(f && nav.walkable(nav.cellOf(f.x, f.z)), `${m.id}: flag ${k} on the nav region`);
      for (const team of [0, 1]) {
        const s = map.spawns[team][0];
        const p = f && nav.path(s.x, s.z, f.x, f.z);
        ok(!!p, `${m.id}: path team ${team} spawn → flag ${k}`);
      }
    }
    for (const h of map.hot) ok(nav.nearest(h.x, h.z, 6) >= 0, `${m.id}: hot spot (${h.x},${h.z}) reachable`);
    const a = map.spawns[0][0];
    const b = map.spawns[1][0];
    const p = nav.path(a.x, a.z, b.x, b.z);
    ok(p && p.length > 1, `${m.id}: spawn-to-spawn path`);
    // path segments never cross blocked cells
    if (p) {
      let prev = { x: a.x, z: a.z };
      let clean = true;
      for (const q of p) {
        if (!nav.lineFree(prev.x, prev.z, q.x, q.z)) clean = false;
        prev = q;
      }
      ok(clean, `${m.id}: smoothed path stays on free cells`);
    }
  }
}

function weapons() {
  console.log("weapons");
  ok(WEAPONS.length === 12, "12 weapons");
  const count = (cat) => WEAPONS.filter((w) => w.cat === cat).length;
  ok(count("ar") === 3 && count("smg") === 2 && count("sniper") === 2 && count("shotgun") === 2 && count("lmg") === 1 && count("pistol") === 2, "category split 3/2/2/2/1/2");
  const sig = new Set(WEAPONS.map((w) => [w.rpm, w.dmg, w.mag, w.r1, w.mode, w.pellets].join("|")));
  ok(sig.size === 12, "every weapon has a distinct stat signature");
  console.log("  weapon        mode   rpm  dmg@10 dmg@40  shots@10 TTK@10  TTK@40");
  for (const w of WEAPONS) {
    const per = (d) => damageAt(w, d) * w.pellets * (w.pellets > 1 ? 0.7 : 1);
    const shots = (d) => Math.ceil(100 / per(d));
    const gap = w.mode === "burst" ? (w.burstN * shotInterval(w) + w.burstGap) / w.burstN : Math.max(shotInterval(w), w.cycle || 0);
    const ttk = (d) => (shots(d) - 1) * gap;
    console.log(`  ${w.name.padEnd(14)} ${w.mode.padEnd(6)} ${String(w.rpm).padStart(4)} ${per(10).toFixed(0).padStart(6)} ${per(40).toFixed(0).padStart(6)} ${String(shots(10)).padStart(8)} ${ttk(10).toFixed(2).padStart(6)} ${ttk(40).toFixed(2).padStart(7)}`);
    ok(w.mag > 0 && w.reserve >= w.mag && w.reload > 0, `${w.id}: ammo + reload`);
  }
  ok(damageAt(weaponById("longbow"), 50) >= 100, "Longbow one-shots to the body at 50 m");
  ok(damageAt(weaponById("hawkeye"), 30) * weaponById("hawkeye").head >= 100, "Hawkeye one-shots to the head");

  // live weapon behaviour inside a match
  const M = createMatch({ mapId: "harbor", mode: "ffa", seed: 7, loadout: { primary: "vx9", secondary: "p9" } });
  const P = M.player;
  M.combatants.forEach((c) => {
    if (c !== P) c.brain = null; // freeze bots
  });
  M.state = "live";
  const fireFor = (sec, held = true) => {
    for (let i = 0; i < sec * 60; i++) {
      P.input.fire = held === "tap" ? i % 2 === 0 : held;
      M.step(1 / 60);
    }
    P.input.fire = false;
    M.step(1 / 60);
  };
  for (let i = 0; i < 40; i++) M.step(1 / 60); // weapon raise after spawning
  P.weapons[0].mag = 30;
  fireFor(1);
  const fired = 30 - P.weapons[0].mag;
  ok(fired >= 11 && fired <= 13, `auto VX-9 fires ~12 rounds in 1 s (got ${fired})`);
  // empty → auto reload
  P.weapons[0].mag = 1;
  fireFor(0.3);
  ok(P.weapons[0].reloading, "empty mag triggers a reload");
  for (let i = 0; i < 200; i++) M.step(1 / 60);
  ok(P.weapons[0].mag === 30 && !P.weapons[0].reloading, "reload refills the magazine from reserve");
  // reload is cancelled by switching
  P.weapons[0].mag = 10;
  P.input.reload = true;
  M.step(1 / 60);
  P.input.reload = false;
  M.step(0.5);
  P.input.swap = 1;
  M.step(1 / 60);
  ok(!P.weapons[0].reloading && P.weapons[0].mag === 10 && P.cur === 1, "switching weapons cancels the reload (no ammo gained)");
  for (let i = 0; i < 40; i++) M.step(1 / 60);
  const pm = P.weapons[1].mag;
  fireFor(1, true);
  ok(pm - P.weapons[1].mag === 1, "semi-auto pistol: one shot per press while held");
  fireFor(1, "tap");
  ok(pm - 1 - P.weapons[1].mag >= 5, "semi-auto pistol: tapping fires repeatedly");
  // burst
  M.setLoadout(P, { primary: "m12", secondary: "p9" });
  P.alive = false;
  P.respawnAt = 0;
  M.step(1 / 60);
  for (let i = 0; i < 60; i++) M.step(1 / 60);
  ok(P.weapons[0].def.id === "m12", "loadout change applies on respawn");
  const bm = P.weapons[0].mag;
  P.input.fire = true;
  for (let i = 0; i < 12; i++) M.step(1 / 60);
  P.input.fire = false;
  for (let i = 0; i < 30; i++) M.step(1 / 60);
  ok(bm - P.weapons[0].mag === 3, `burst rifle fires exactly 3 per press (got ${bm - P.weapons[0].mag})`);
  // pump + per-shell interrupt
  M.setLoadout(P, { primary: "breacher", secondary: "p9" });
  P.alive = false;
  P.respawnAt = 0;
  M.step(1 / 60);
  for (let i = 0; i < 60; i++) M.step(1 / 60);
  fireFor(0.25, true);
  ok(P.weapons[0].mag === 5, "pump: holding the trigger fires once");
  fireFor(0.75, "tap");
  ok(P.weapons[0].mag === 4, `pump shotgun cycles between shots (fired ${6 - P.weapons[0].mag} in 1 s)`);
  P.input.reload = true;
  M.step(1 / 60);
  P.input.reload = false;
  for (let i = 0; i < 0.98 * 60; i++) M.step(1 / 60);
  ok(P.weapons[0].reloading && P.weapons[0].mag === 5, `shell-by-shell reload (mag ${P.weapons[0].mag})`);
  P.input.fire = true;
  M.step(1 / 60);
  P.input.fire = false;
  ok(!P.weapons[0].reloading && P.weapons[0].mag === 4, "firing interrupts a shell reload");
  // ADS tightens spread: compare spread of hip vs ADS rifle at 30 m
  const spreadTest = (ads) => {
    M.setLoadout(P, { primary: "vx9", secondary: "p9" });
    P.alive = false;
    P.respawnAt = 0;
    M.step(1 / 60);
    for (let i = 0; i < 60; i++) M.step(1 / 60);
    P.input.ads = ads;
    for (let i = 0; i < 40; i++) M.step(1 / 60);
    let sum = 0;
    for (let k = 0; k < 20; k++) {
      P.kickP = P.kickY = 0;
      P.weapons[0].bloom = 0;
      P.weapons[0].cool = 0;
      P.weapons[0].mag = 30;
      M.events.length = 0;
      P.input.fire = true;
      M.step(1 / 60);
      P.input.fire = false;
      const shot = M.events.find((e) => e.type === "shot");
      const p = shot.pellets[0];
      const base = { x: -Math.sin(P.yaw), z: -Math.cos(P.yaw) };
      sum += Math.abs(Math.atan2(p.dx * base.z - p.dz * base.x, p.dx * base.x + p.dz * base.z));
      for (let i = 0; i < 20; i++) M.step(1 / 60);
    }
    P.input.ads = false;
    return sum / 20;
  };
  const hip = spreadTest(false);
  const ads = spreadTest(true);
  ok(ads < hip * 0.25, `ADS spread much tighter than hip (hip ${(hip / (Math.PI / 180)).toFixed(2)}°, ads ${(ads / (Math.PI / 180)).toFixed(2)}°)`);
}

function match() {
  console.log("match");
  for (const m of MAPS) {
    if (onlyMap && m.id !== onlyMap) continue;
    for (const mode of ["tdm", "ffa", "dom"]) {
      for (const difficulty of mode === "tdm" ? ["easy", "normal", "hard"] : ["normal"]) {
        const t0 = performance.now();
        const M = createMatch({ mapId: m.id, mode, difficulty, seed: 11 + difficulty.length, playerIsBot: true });
        const dt = 1 / 30;
        let kills = 0;
        let heads = 0;
        let caps = 0;
        let embedded = 0;
        const stuck = new Map();
        let maxStill = 0;
        let steps = 0;
        const shotsBy = new Map();
        while (M.state !== "ended" && steps < 600 * 30) {
          M.step(dt);
          steps++;
          for (const e of M.drain()) {
            if (e.type === "kill") {
              kills++;
              if (e.head) heads++;
            }
            if (e.type === "capture") caps++;
            if (e.type === "shot") shotsBy.set(e.w, (shotsBy.get(e.w) || 0) + 1);
          }
          if (steps % 15 === 0)
            for (const c of M.combatants) {
              if (!c.alive) {
                stuck.delete(c.id);
                continue;
              }
              if (M.col.blocked(c.x, c.y + 0.05, c.z, c.r - 0.05, c.h - 0.1)) embedded++;
              const s = stuck.get(c.id) || { x: c.x, z: c.z, t: 0 };
              if (Math.hypot(c.x - s.x, c.z - s.z) < 0.6 && !c.brain.visible) s.t += 0.5;
              else {
                s.t = 0;
                s.x = c.x;
                s.z = c.z;
              }
              maxStill = Math.max(maxStill, s.t);
              stuck.set(c.id, s);
            }
        }
        const ms = performance.now() - t0;
        const simT = M.clock;
        const top = M.ranking()[0];
        console.log(`  ${m.id}/${mode}/${difficulty}: ${M.result?.reason} after ${simT.toFixed(0)} s — score ${mode === "ffa" ? top.name + " " + top.kills : M.scores.join(":")}, ${kills} kills (${heads} head), ${caps} caps, longest idle ${maxStill.toFixed(1)} s, sim ${ms.toFixed(0)} ms`);
        ok(M.state === "ended", `${m.id}/${mode}/${difficulty}: match ends`);
        ok(kills >= (mode === "ffa" ? 15 : 25), `${m.id}/${mode}/${difficulty}: plenty of kills (${kills})`);
        ok(embedded === 0, `${m.id}/${mode}/${difficulty}: nobody embedded in geometry (${embedded})`);
        ok(maxStill < 25, `${m.id}/${mode}/${difficulty}: no bot idles >25 s out of combat (${maxStill.toFixed(1)})`);
        if (mode === "dom") ok(caps >= 2, `${m.id}/dom: flags get captured (${caps})`);
      }
    }
  }
}

if (which === "core" || which === "all") core();
if (which === "ladders" || which === "all") ladders();
if (which === "maps" || which === "all") maps();
if (which === "weapons" || which === "all") weapons();
if (which === "match" || which === "all") match();
void getMap;
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
