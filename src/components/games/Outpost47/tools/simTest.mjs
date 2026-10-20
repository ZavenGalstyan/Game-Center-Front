/**
 * Outpost 47 — headless verification. Run:  node src/components/games/Outpost47/tools/simTest.mjs
 *
 * Plays the whole critical path with REAL movement: a nav-grid path is
 * computed with the sim's own collision test, then followed by feeding WASD-
 * style input into Game.step(). Every interaction goes through the same
 * raycast the player uses (look at it, press E). Checks: collision, doors
 * blocking, clues-before-puzzles, wrong answers rejected, temperature
 * collapse + checkpoint recovery, save/load, lift shortcut, both endings.
 */
import { Game, LAYOUT } from "../sim.js";
import { INTERACT, PUZZLES, CHAPTERS, UX, BOUNDS, rotMask, circuitFlow, DOCS, ITEMS } from "../data.js";

let fails = 0, checks = 0;
const ok = (c, msg) => {
  checks++;
  if (!c) {
    fails++;
    console.log("  ✗ " + msg);
  }
};
const log = (...a) => console.log(...a);
const IT = Object.fromEntries(INTERACT.map((i) => [i.id, i]));

/* ---------------------------------------------------------------- nav */
const RES = 0.4;
function regionOf(x) {
  return x > UX - 100 ? { x1: UX - 16, x2: UX + 58, z1: -84, z2: 66 } : { x1: BOUNDS.x1 + 1, x2: BOUNDS.x2 - 1, z1: BOUNDS.z1 + 1, z2: BOUNDS.z2 - 1 };
}
const FREE_CACHE = new Map();
function path(g, from, to) {
  const rg = regionOf(from.x);
  const W = Math.ceil((rg.x2 - rg.x1) / RES) + 1, Hh = Math.ceil((rg.z2 - rg.z1) / RES) + 1;
  const idx = (x, z) => Math.round((z - rg.z1) / RES) * W + Math.round((x - rg.x1) / RES);
  const cx = (i) => rg.x1 + (i % W) * RES, cz = (i) => rg.z1 + Math.floor(i / W) * RES;
  const key = rg.x1 + "|" + Object.keys(g.doorsOpen).filter((d) => (g.doorAnim[d] ?? 0) >= 0.8).sort().join(",") + "|" + !!g.f.caveOpen;
  let free = FREE_CACHE.get(key);
  if (!free) FREE_CACHE.set(key, (free = new Int8Array(W * Hh).fill(-1)));
  const isFree = (i) => {
    if (free[i] === -1) free[i] = g.blocked(cx(i), cz(i)) ? 0 : 1;
    return free[i] === 1;
  };
  const snap = (p) => {
    let best = idx(p.x, p.z), bd = 9;
    for (let dx = -2; dx <= 2; dx++) for (let dz = -2; dz <= 2; dz++) {
      const i = idx(p.x + dx * RES, p.z + dz * RES);
      const d = Math.hypot(cx(i) - p.x, cz(i) - p.z);
      if (isFree(i) && d < bd) { bd = d; best = i; }
    }
    return best;
  };
  const s = snap(from), t = snap(to);
  const prev = new Int32Array(W * Hh).fill(-2);
  prev[s] = -1;
  const q = [s];
  let qi = 0;
  while (qi < q.length) {
    const i = q[qi++];
    if (i === t) break;
    const x = i % W, z = Math.floor(i / W);
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]) {
      const nx = x + dx, nz = z + dz;
      if (nx < 0 || nz < 0 || nx >= W || nz >= Hh) continue;
      const j = nz * W + nx;
      if (prev[j] !== -2 || !isFree(j)) continue;
      if (dx && dz && (!isFree(z * W + nx) || !isFree(nz * W + x))) continue;
      prev[j] = i;
      q.push(j);
    }
  }
  if (prev[t] === -2) return null;
  const out = [];
  for (let i = t; i !== -1; i = prev[i]) out.push({ x: cx(i), z: cz(i) });
  out.reverse();
  out.push({ x: to.x, z: to.z });
  return out;
}
function spotFor(g, it) {
  const p = g.player, px = p.x, pz = p.z;
  const usable = (sp) => {
    if (!LAYOUT.doors[it]) return true;
    p.x = sp.x;
    p.z = sp.z;
    const d = g.describeDoor(it);
    p.x = px;
    p.z = pz;
    return d.ok;
  };
  return spotsFor(g, it).find((sp) => usable(sp) && path(g, g.player, sp)) || null;
}
function spotsFor(g, it) {
  const found = [];
  // a free standing spot from which the raycast hits this interactable
  const want = it.id ?? it;
  const pos = it.pos || [LAYOUT.doors[want].x, 1.2, LAYOUT.doors[want].z];
  const cands = [];
  for (let dx = -2.4; dx <= 2.4; dx += 0.2) {
    for (let dz = -2.4; dz <= 2.4; dz += 0.2) {
      const x = pos[0] + dx, z = pos[2] + dz;
      const d = Math.hypot(dx, dz);
      if (d < 0.5 || d > 2.3) continue;
      cands.push({ x, z, d });
    }
  }
  cands.sort((a, b) => a.d - b.d);
  for (const c of cands) {
    if (g.blocked(c.x, c.z)) continue;
    const y = g.floorAt(c.x, c.z);
    for (const eh of [1.65, 1.0]) {
      const o = [c.x, y + eh, c.z];
      let d = [pos[0] - o[0], pos[1] - o[1], pos[2] - o[2]];
      const l = Math.hypot(...d);
      d = d.map((v) => v / l);
      const tg = g.target(o, d);
      if (tg && tg.key === want) {
        found.push({ ...c, crouch: eh < 1.6 });
        break;
      }
    }
    if (found.length > 12) break;
  }
  return found;
}
let stuckCount = 0, walkedM = 0;
function walkTo(g, dest, label) {
  const p = g.player;
  const pts = path(g, p, dest);
  if (!pts) {
    ok(false, `no path to ${label} from (${p.x.toFixed(1)},${p.z.toFixed(1)})`);
    return false;
  }
  let k = 0, lastProg = 0, lastPos = { x: p.x, z: p.z }, t = 0;
  while (k < pts.length) {
    const w = pts[k];
    const dx = w.x - p.x, dz = w.z - p.z;
    const d = Math.hypot(dx, dz);
    if (d < (k === pts.length - 1 ? 0.15 : 0.35)) {
      k++;
      continue;
    }
    p.yaw = Math.atan2(-dx, -dz);
    g.step(1 / 60, { fwd: Math.min(1, d * 2 + 0.3) });
    drain(g);
    t += 1 / 60;
    if (g.transition) {
      ok(false, `transition (${g.transition.kind}) while walking to ${label}`);
      while (g.transition) g.step(1 / 60, {});
      return false;
    }
    if (t - lastProg > 2.5) {
      const mv = Math.hypot(p.x - lastPos.x, p.z - lastPos.z);
      if (mv < 0.3) {
        stuckCount++;
        ok(false, `stuck walking to ${label} at (${p.x.toFixed(2)},${p.z.toFixed(2)})`);
        g.teleport({ x: w.x, z: w.z, yaw: p.yaw });
      }
      walkedM += mv;
      lastProg = t;
      lastPos = { x: p.x, z: p.z };
    }
    if (t > 240) {
      ok(false, `timeout walking to ${label}`);
      return false;
    }
  }
  for (let i = 0; i < 20; i++) g.step(1 / 60, {});
  return true;
}
const EVENTS = [];
function drain(g) {
  for (const e of g.events.splice(0)) EVENTS.push(e);
}
function use(g, id, answer) {
  const it = IT[id] || null;
  const isDoor = !it && LAYOUT.doors[id];
  ok(it || isDoor, `unknown target ${id}`);
  const sp = spotFor(g, it || id);
  if (!sp) {
    ok(false, `no interaction spot for ${id}`);
    return null;
  }
  if (!walkTo(g, sp, id)) return null;
  const p = g.player;
  const pos = it ? it.pos : [LAYOUT.doors[id].x, 1.2, LAYOUT.doors[id].z];
  const crouch = sp.crouch;
  for (let i = 0; i < 20; i++) g.step(1 / 60, { crouch });
  const e = g.eye();
  p.yaw = Math.atan2(-(pos[0] - e[0]), -(pos[2] - e[2]));
  p.pitch = Math.atan2(pos[1] - e[1], Math.hypot(pos[0] - e[0], pos[2] - e[2]));
  const tg = g.target();
  ok(tg && tg.key === id, `raycast should hit ${id} (got ${tg?.key})`);
  const desc = g.describe(tg);
  ok(desc?.ok, `${id} should be usable: ${desc?.sub}`);
  const res = g.interact(tg);
  drain(g);
  for (let i = 0; i < 100; i++) g.step(1 / 60, {});
  drain(g);
  // portal: let the transition finish
  while (g.transition) {
    g.step(1 / 60, {});
    drain(g);
  }
  if (res?.type === "puzzle" && answer !== undefined) {
    const pz = PUZZLES[res.id];
    for (const c of pz.clue || []) ok(g.docs.includes(c) || g.has(c), `clue ${c} known before ${res.id}`);
    ok(g.solve(res.id, answer), `puzzle ${res.id} accepts the right answer`);
    for (let i = 0; i < 100; i++) g.step(1 / 60, {});
    drain(g);
  }
  return res;
}
function solutionRots(p) {
  return p.cells.map((c) => (c && !c.fixed ? (4 - (c.r0 % 4)) % 4 : 0));
}
function chapterIs(g, n, label) {
  for (let i = 0; i < 30; i++) g.step(1 / 60, {});
  drain(g);
  ok(g.chapter === n, `${label}: expected chapter index ${n}, got ${g.chapter} — ${JSON.stringify(g.objectiveView().list.filter((o) => !o.done).map((o) => o.text))}`);
}

/* ================================================================ static checks */
log("Static checks");
{
  const g = new Game();
  ok(!g.blocked(g.player.x, g.player.z), "spawn is free");
  for (const ch of CHAPTERS) ok(!g.blocked(ch.spawn.x, ch.spawn.z), `chapter ${ch.n} fallback spawn free`);
  for (const id of Object.keys(LAYOUT.doors)) ok(LAYOUT.doors[id].name, `door ${id} has data`);
  // circuits: scrambled state unsolved, designed solution solves
  for (const id of ["p_gencircuit", "p_labcircuit"]) {
    const p = PUZZLES[id];
    ok(!p.check(new Array(p.cells.length).fill(0), g, p), `${id} starts unsolved`);
    ok(p.check(solutionRots(p), g, p), `${id} designed solution lights every sink`);
  }
  // every doc referenced exists, every item referenced exists
  for (const it of INTERACT) {
    if (it.doc) ok(DOCS[it.doc], `doc ${it.doc}`);
    if (it.pickup) ok(ITEMS[it.pickup], `item ${it.pickup}`);
  }
  // wrong answers rejected
  ok(!PUZZLES.p_medical.check("1234"), "medical rejects wrong code");
  ok(!PUZZLES.p_varga.check("password"), "terminal rejects wrong password");
  ok(PUZZLES.p_varga.check("bear 1987"), "terminal tolerant of case/space");
  ok(!PUZZLES.p_tower.check({ A: true, B: true, D: false, C: true, extra: 1 }) === false, "tower accepts A+B+C");
  ok(!PUZZLES.p_tower.check({ B: true, D: true }), "tower rejects B+D (de-icer off)");
  ok(!PUZZLES.p_evac2.check({ door: 1, clamps: 1, beacon: 1, heat: 1 }), "evac power rejects cutting the lab seal");
  ok(!PUZZLES.p_gears.check({ A: "gear_l", B: "gear_m", C: "gear_s" }), "gears reject inverted ratio");
  ok(!PUZZLES.p_cryo.check({ a: 2, b: 5, c: 2 }), "cryo rejects B > A");
}

/* ================================================================ collision */
log("Collision");
{
  const g = new Game();
  g.teleport({ x: 0, z: 30, yaw: 0 });
  // walk north into the closed entrance door
  for (let i = 0; i < 60 * 5; i++) g.step(1 / 60, { fwd: 1 });
  ok(g.player.z > 24, `closed entrance door blocks (z=${g.player.z.toFixed(2)})`);
  // walk into an exterior wall
  g.teleport({ x: -10, z: 22, yaw: 0 });
  for (let i = 0; i < 60 * 4; i++) g.step(1 / 60, { fwd: 1, sprint: true });
  ok(g.player.z > 16.1, `south wall blocks (z=${g.player.z.toFixed(2)})`);
  // jump works and lands
  g.teleport({ x: 0, z: 40, yaw: 0 });
  for (let i = 0; i < 10; i++) g.step(1 / 60, {});
  g.step(1 / 60, { jump: true });
  let maxY = 0;
  for (let i = 0; i < 90; i++) {
    g.step(1 / 60, {});
    maxY = Math.max(maxY, g.player.y);
  }
  ok(maxY > 0.6 && g.player.ground, `jump rises (${maxY.toFixed(2)} m) and lands`);
  // no path into the station while the door is shut
  ok(!path(g, { x: 0, z: 40 }, { x: 0, z: 0 }), "station unreachable before the security door opens");
  // crouch lowers the eye
  const e0 = g.eye()[1];
  for (let i = 0; i < 30; i++) g.step(1 / 60, { crouch: true });
  ok(g.eye()[1] < e0 - 0.5, "crouch lowers the camera");
}

/* ================================================================ temperature */
log("Temperature + checkpoint");
{
  const g = new Game();
  g.teleport({ x: 0, z: 60, yaw: 0 });
  g.checkpoint = { x: 0, y: 0, z: 60, yaw: 0 };
  g.f.reached = 1;
  let t = 0, collapsed = false;
  while (t < 400) {
    g.step(1 / 30, {});
    t += 1 / 30;
    if (g.events.some((e) => e.type === "collapse")) collapsed = true;
    g.events.length = 0;
    if (collapsed && !g.transition) break;
  }
  ok(collapsed, "standing in the blizzard eventually collapses");
  ok(t > 120, `cold is not too punishing (collapse after ${t.toFixed(0)} s)`);
  ok(g.temp >= 60 && Math.hypot(g.player.x, g.player.z - 60) < 1, "respawn at checkpoint with recovered temperature");
  ok(g.f.reached, "progress kept after collapse");
}

/* ================================================================ walkthrough */
log("Critical path walkthrough");
const g = new Game();
g.seed = 2;
// ---- chapter 1
use(g, "d_shed");
use(g, "shed_heater");
ok(g.f.sheltered, "found shelter");
use(g, "lund_note");
use(g, "ice_pick");
use(g, "bat_shed");
// verify cold vs heater
use(g, "glovebox");
ok(g.has("card_access"), "access card from glovebox");
use(g, "d_entrance");
use(g, "plaque");
use(g, "emg_terminal");
chapterIs(g, 1, "after chapter 1");
log("  chapter 1 ✓  temp", g.temp.toFixed(0));
// ---- chapter 2
use(g, "d_inner");
use(g, "roster");
use(g, "d_generator");
use(g, "gen_manual");
ok(g.f.seen_generator, "found generator room");
ok(IT.start_panel.ok(g) !== true, "start panel refuses before repair");
use(g, "d_quarters");
use(g, "keene_note");
use(g, "keene_relay");
use(g, "d_storage");
use(g, "coil");
use(g, "wrench");
use(g, "bat_store");
use(g, "d_boiler");
use(g, "fuse");
use(g, "boiler_tag");
use(g, "generator");
ok(g.f.repaired, "generator repaired");
use(g, "dist_panel", solutionRots(PUZZLES.p_gencircuit));
use(g, "start_panel", ["fuel", "glow", "choke", "starter", "breaker"]);
ok(g.f.power, "power restored");
use(g, "boiler", { red: 4, blue: 5, green: 0 });
ok(g.f.heat, "heating on");
use(g, "d_control");
chapterIs(g, 2, "after chapter 2");
log("  chapter 2 ✓");
// ---- chapter 3
use(g, "tanaka_diary");
use(g, "orlov_diary");
use(g, "holt_log");
use(g, "photo");
use(g, "d_mess");
use(g, "calendar");
use(g, "d_medical", "1403");
ok(g.doorOpen("d_medical"), "medical open");
use(g, "card_security");
use(g, "medlog");
use(g, "d_security");
use(g, "door_log");
use(g, "holt_memo");
use(g, "cctv", { "0152": "c3", "0210": "c4", "0226": "c1", "0241": "c2" });
ok(g.docs.includes("timeline_result"), "timeline result unlocked");
use(g, "d_comms");
use(g, "pell_log");
use(g, "varga_terminal", "BEAR1987");
ok(g.has("frag1") && g.f.towerFeed, "terminal gives fragment I and tower feed");
chapterIs(g, 3, "after chapter 3");
log("  chapter 3 ✓");
// save/load mid-game
{
  const s = JSON.parse(JSON.stringify(g.serialize()));
  const g2 = new Game(s);
  ok(g2.chapter === 3 && g2.f.power && g2.has("frag1") && g2.doorOpen("d_control"), "save/load restores chapter, flags, items, doors");
  ok(Math.hypot(g2.player.x - g.player.x, g2.player.z - g.player.z) < 0.01, "save/load restores position indoors");
  const bad = { ...s, pos: { x: 9999, z: 9999, yaw: 0 }, cp: { x: NaN } };
  const g3 = new Game(bad);
  ok(!g3.blocked(g3.player.x, g3.player.z), "corrupt position falls back to a safe spawn");
}
// ---- chapter 4
use(g, "d_east");
use(g, "d_weather");
use(g, "weather_log");
use(g, "tower_placard");
use(g, "junction", { A: true, B: true, C: true, D: false });
ok(g.f.towerPower, "tower powered");
use(g, "scanner");
use(g, "shovel");
use(g, "drift");
ok(g.f.caveOpen, "cave dug out");
log("  surface leg temp", g.temp.toFixed(0));
use(g, "cave_door");
ok(g.player.x > UX - 100, "descended underground");
use(g, "steam_tag");
use(g, "manifold", { orange: true, blue: false, grey: false });
ok(g.doorOpen("d_icewall"), "ice wall melted");
use(g, "gear_s");
use(g, "orlov_page");
use(g, "gear_m");
use(g, "bulkhead_plate");
use(g, "gear_l");
use(g, "lift_note");
use(g, "lift_chain");
ok(g.f.liftOpen, "lift unchained");
// lift shortcut both ways
use(g, "lift_chain");
ok(g.player.x < UX - 100 && g.zone.id === "generator", "lift up arrives in the generator room");
use(g, "lift_gen");
ok(g.zone.id === "liftroom", "lift down arrives in the lift room");
use(g, "d_bulkhead", { A: "gear_s", B: "gear_m", C: "gear_l" });
ok(g.doorOpen("d_bulkhead"), "bulkhead open");
use(g, "d_siteb");
use(g, "siteb_log");
chapterIs(g, 4, "after chapter 4");
log("  chapter 4 ✓  temp", g.temp.toFixed(0));
// ---- chapter 5
use(g, "whiteboard");
use(g, "locker", ["flake", "drop", "spore", "bloom"]);
ok(g.has("card_l5") && g.has("frag2"), "locker gives card + fragment II");
use(g, "protocol_card");
use(g, "core");
const word = PUZZLES.p_auth.words[g.seed % PUZZLES.p_auth.words.length];
ok(!g.solve("p_auth", "0000"), "lockdown rejects wrong challenge answer");
use(g, "lockdown", word[1]);
ok(g.doorOpen("d_lab"), "lab open");
use(g, "cryo_placard");
ok(IT.lab_terminal.ok(g) !== true, "terminal locked before systems");
use(g, "cryo", { a: 5, b: 2, c: 2 });
use(g, "emitter_note");
use(g, "emitter", solutionRots(PUZZLES.p_labcircuit));
use(g, "spectro_note");
use(g, "analyzer", { wl: 470, gain: 3 });
ok(g.f.sysCryo && g.f.sysField && g.f.sysAnalyzer, "three systems restored");
use(g, "lab_terminal");
ok(g.f.analyzed && g.doorOpen("d_containment"), "archive analysed, containment open");
use(g, "recording");
use(g, "vial");
ok(g.has("frag3") && g.doorOpen("d_evac"), "truth: fragment III and evac wing");
chapterIs(g, 5, "after chapter 5");
log("  chapter 5 ✓");
// ---- chapter 6
use(g, "d_radio");
use(g, "freq_card");
use(g, "radio_map");
use(g, "radio", { freq: 406.4, bearing: 215 });
ok(g.f.comms, "comms open");
use(g, "evac_procedure");
use(g, "evac_plate");
use(g, "evac_console", "471906");
use(g, "evac_console", { heat: false, door: true, clamps: true, seal: true, beacon: true });
use(g, "evac_console", ["seal", "vent", "door", "clamps"]);
ok(g.f.launch && g.doorOpen("d_hangar"), "launch sequence opens the hangar");
walkTo(g, { x: UX + 36, z: -52 }, "hangar");
const beforeEnd = JSON.parse(JSON.stringify(g.serialize()));
const r = use(g, "final_console");
ok(r?.type === "decision", "final console opens the decision");
g.end("expose");
drain(g);
for (let i = 0; i < 30; i++) g.step(1 / 60, {});
drain(g);
ok(EVENTS.some((e) => e.type === "ending" && e.kind === "expose"), "ending A (expose) reached");
ok(g.chapter === 6, "all six chapters complete");
// ending B from the pre-decision save
{
  const gb = new Game(beforeEnd);
  const rb = use(gb, "final_console");
  ok(rb?.type === "decision", "decision available after reload");
  gb.end("destroy");
  ok(gb.events.some((e) => e.type === "ending" && e.kind === "destroy"), "ending B (destroy) reached");
}
// all chapter-intro events fired in order
const chEv = EVENTS.filter((e) => e.type === "chapter").map((e) => e.n);
ok(chEv.join(",") === "2,3,4,5,6", `chapter transitions fired in order (${chEv})`);

/* ================================================================ reachability */
log("Reachability (end state, all doors open)");
{
  let n = 0;
  for (const it of INTERACT) {
    if (it.pickup && g.f["took_" + it.id]) continue;
    if (!g.visible(it)) continue;
    g.teleport(it.pos[0] > UX - 100 ? { x: UX, z: -20, yaw: 0 } : { x: 0, z: 0, yaw: 0 });
    const sp = spotFor(g, it);
    ok(sp, `${it.id} has a raycast-valid standing spot`);
    if (sp) n++;
  }
  log(`  ${n} interactables reachable by raycast`);
}

log(`\nwalked ≈${walkedM.toFixed(0)} m, stuck ${stuckCount}, game time ${(g.time / 60).toFixed(1)} min`);
log(`${checks - fails}/${checks} checks passed`);
process.exit(fails ? 1 : 0);
