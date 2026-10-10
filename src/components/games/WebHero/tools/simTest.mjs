/**
 * Web Hero — headless checks.
 *   node src/components/games/WebHero/tools/simTest.mjs [core|missions|bot <id>|all]
 */
import { createWorld, step, restartWorld, cityFor } from "../engine/world.js";
import { STEP, H } from "../engine/config.js";
import { findAnchor } from "../engine/hero.js";
import { spawnEnemy } from "../engine/enemies.js";
import { createBot, botInput } from "../engine/bot.js";
import { updateCamera } from "../engine/camera.js";
import { missionSpec, BUILT } from "../data/missions.js";
import { ABILITY_UNLOCK } from "../engine/config.js";
import { floorAt, pushOut, boxesIn } from "../engine/collide.js";
import { segmentClear } from "./pathCheck.mjs";
import { loadProgress, saveProgress, defaultProgress, applyRun, isUnlocked, abilitiesFor, buyUpgrade, tokenCount, STORAGE_KEY } from "../utils/storage.js";

let fails = 0;
let passes = 0;
function ok(c, msg, extra = "") {
  if (c) passes++;
  else {
    fails++;
    console.log(`  FAIL ${msg} ${extra}`);
  }
}

const NONE = { mx: 0, my: 0, camYaw: 0 };
function run(W, inp, secs, each) {
  const n = Math.round(secs / STEP);
  for (let i = 0; i < n; i++) {
    const e = { ...NONE, ...inp };
    for (const k of ["jump", "light", "heavy", "web", "dodge", "special", "ab1", "ab2", "ab3", "ab4", "ab5"]) e[k] = !!inp[k] && i === 0;
    step(W, e, STEP);
    if (each && each(W, i) === false) break;
    W.events.length = 0;
  }
}

/** a bare test world: mission 1 city but no enemies / steps */
function sandbox(spawn) {
  const C = cityFor("downtown");
  const spec = { id: 0, district: "downtown", name: "test", spawn: spawn || { ...C.blockCenter(2, 2), y: 0, h: 0 }, steps: [{ type: "reach", at: { x: 9999, y: 0, z: 9999 }, label: "x" }] };
  return createWorld(spec);
}

function core() {
  console.log("core: controller");
  const C = cityFor("downtown");
  {
    const W = sandbox();
    run(W, {}, 0.1);
    ok(W.hero.grounded, "spawns grounded in the plaza");
    const c0 = C.corner(2, 1);
    Object.assign(W.hero, { x: c0.x, z: c0.z + 2 });
    let t1 = -1;
    run(W, { my: 1, camYaw: 0 }, 1.2, (w, i) => {
      if (t1 < 0 && w.hero.speed > H.run - 0.5) t1 = i * STEP;
    });
    ok(t1 > 0.15 && t1 < 0.6, "reaches run speed quickly but not instantly", t1.toFixed(2));
    run(W, { my: 1, camYaw: 0, sprint: true }, 1);
    ok(W.hero.speed > H.run + 3, "sprint is faster", W.hero.speed.toFixed(1));
  }
  {
    const W = sandbox();
    run(W, {}, 0.2);
    let peak = 0;
    run(W, { jump: true, jumpHeld: true }, 1.5, (w) => (peak = Math.max(peak, w.hero.y)));
    ok(peak > 1.8 && peak < 2.6, "jump ~2.1 m", peak.toFixed(2));
    peak = 0;
    let dj = false;
    run(W, { jump: true, jumpHeld: true }, 0.4);
    run(W, { jump: true, jumpHeld: true }, 1.5, (w) => {
      peak = Math.max(peak, w.hero.y);
      if (w.hero.jumpsUsed === 2) dj = true;
    });
    ok(dj && peak > 3.2, "double jump goes higher", peak.toFixed(2));
    ok(W.hero.grounded, "lands");
  }
  {
    // climbing: walk into a building wall, climb to the top, vault onto the roof
    const r = C.roofIn(3, 3, "low");
    const b = r.box;
    const W = sandbox({ x: b.x0 - 3, y: 0, z: (b.z0 + b.z1) / 2, h: Math.PI / 2 });
    let climbed = false;
    let vault = false;
    run(W, { my: 1, camYaw: Math.PI / 2, sprint: true }, 12, (w) => {
      if (w.hero.mode === "climb") climbed = true;
      if (w.hero.mode === "ledge") vault = true;
      if (vault && w.hero.grounded && w.hero.y > b.y1 - 0.2) return false;
    });
    ok(climbed, "walking into a wall starts a climb");
    ok(vault && W.hero.grounded && Math.abs(W.hero.y - b.y1) < 0.3, "climbs to the top and vaults onto the roof", `y=${W.hero.y.toFixed(1)} top=${b.y1}`);
  }
  {
    // anchors: valid ones are on real building geometry; open sky has none
    const r = C.roofIn(2, 1);
    const W = sandbox({ x: r.x, y: r.y, z: r.z, h: Math.PI });
    const a = findAnchor(W, W.hero, Math.PI);
    ok(a && a.box && a.y > W.hero.y + 4, "finds a building anchor ahead and above", a ? `${a.y.toFixed(1)}` : "none");
    if (a && a.box) {
      const b = a.box;
      const onSurface = a.x >= b.x0 - 0.01 && a.x <= b.x1 + 0.01 && a.y >= b.y0 - 0.01 && a.y <= b.y1 + 0.01 && a.z >= b.z0 - 0.01 && a.z <= b.z1 + 0.01;
      ok(onSurface, "anchor lies on the box surface it hit");
    }
    W.hero.x = 900;
    W.hero.y = 400;
    W.hero.z = 900;
    ok(!findAnchor(W, W.hero, 0), "no anchor in empty sky");
  }
  {
    // swing: run off a roof, jump, attach, swing across the street, release, land on the far roof
    const sb = C.roofAt(35, -84).box;
    const dest = C.roofAt(75, -87).box;
    const W = sandbox({ x: 31, y: sb.y1, z: -84, h: Math.PI / 2 });
    const yaw = Math.PI / 2;
    run(W, {}, 0.1);
    let attached = false;
    let preRel = 0;
    let relSpeed = 0;
    let anchorOk = false;
    run(W, { my: 1, camYaw: yaw, sprint: true }, 3, (w) => w.hero.x < sb.x1 - 1.2);
    run(W, { my: 1, camYaw: yaw, sprint: true, jump: true, jumpHeld: true }, 0.12);
    let prevPos = null;
    let maxJump = 0;
    run(W, { my: 1, camYaw: yaw, swing: true }, 0.5, (w) => {
      const h = w.hero;
      if (h.mode === "swing") {
        attached = true;
        const s = h.swing;
        const bx = s.box;
        anchorOk = !!bx && s.ax >= bx.x0 - 0.01 && s.ax <= bx.x1 + 0.01 && s.ay <= bx.y1 + 0.01 && s.az >= bx.z0 - 0.01 && s.az <= bx.z1 + 0.01;
        preRel = Math.hypot(h.vx, h.vy, h.vz);
      }
      if (prevPos) maxJump = Math.max(maxJump, Math.hypot(h.x - prevPos[0], h.y - prevPos[1], h.z - prevPos[2]));
      prevPos = [h.x, h.y, h.z];
    });
    ok(attached, "web attaches during the leap");
    ok(anchorOk, "the web is anchored on a real building surface");
    ok(maxJump < 0.5, "no snapping while swinging (max step move)", maxJump.toFixed(2));
    run(W, { my: 1, camYaw: yaw }, 0.02, (w) => {
      relSpeed = Math.hypot(w.hero.vx, w.hero.vy, w.hero.vz);
    });
    ok(attached && relSpeed >= preRel * 0.95, "release preserves momentum", `${preRel.toFixed(1)} → ${relSpeed.toFixed(1)}`);
    run(W, { my: 1, camYaw: yaw }, 4, (w) => !w.hero.grounded);
    ok(W.hero.grounded && W.hero.floorBox === dest, "lands on the rooftop across the street", `y=${W.hero.y.toFixed(1)} x=${W.hero.x.toFixed(1)}`);
    ok(W.hero.hp === W.hero.maxHp, "no fall damage from swings / landings");
  }
  {
    // long swing: build speed swinging down an avenue (airborne between towers)
    const p = C.streetW(3, 1);
    const W = sandbox({ x: p.x, y: 0, z: p.z, h: 0 });
    Object.assign(W.hero, { y: 32, mode: "air", grounded: false, vz: 10 });
    let maxS = 0;
    let att = false;
    run(W, { my: 1, camYaw: 0, swing: true }, 1.6, (w) => {
      if (w.hero.mode === "swing") att = true;
      maxS = Math.max(maxS, Math.hypot(w.hero.vx, w.hero.vy, w.hero.vz));
    });
    ok(att && maxS > 18, "swinging builds speed", maxS.toFixed(1));
  }
  {
    // combat: combo 1 (L L L) ends in a knock-away kick; damage once per enemy swing
    const W = sandbox();
    run(W, {}, 0.1);
    const h = W.hero;
    const e = spawnEnemy(W, "thug", h.x, 0, h.z + 1.8, { aggro: false });
    e.hp = e.maxHp = 999;
    const moves = [];
    for (let k = 0; k < 3; k++) {
      run(W, { light: true, camYaw: 0 }, 0.3, (w) => {
        if (w.hero.atk && moves[moves.length - 1] !== w.hero.atk.move) moves.push(w.hero.atk.move);
      });
    }
    ok(moves.join(",") === "punch1,punch2,kick3", "combo 1: punch → punch → kick", moves.join(","));
    run(W, {}, 1.2);
    // combo 2: L → H = heavy punch
    const m2 = [];
    run(W, { light: true, camYaw: 0 }, 0.25);
    run(W, { heavy: true, camYaw: 0 }, 0.5, (w) => w.hero.atk && m2.push(w.hero.atk.move));
    ok(m2.includes("heavyPunch"), "combo 2: punch → heavy punch");
    run(W, {}, 1.2);
    // combo 3: H H launches, then air L = aerial strike
    e.x = h.x;
    e.z = h.z + 1.8;
    e.state = "idle";
    const m3 = [];
    run(W, { heavy: true, camYaw: 0 }, 0.35, (w) => w.hero.atk && m3.push(w.hero.atk.move));
    run(W, { heavy: true, camYaw: 0 }, 0.56, (w) => w.hero.atk && m3.push(w.hero.atk.move));
    const launched = e.state === "airborne";
    run(W, { jump: true, jumpHeld: true }, 0.22);
    run(W, { light: true, camYaw: 0 }, 0.3, (w) => w.hero.atk && m3.push(w.hero.atk.move));
    ok(m3.includes("kick") && m3.includes("launcher") && launched, "combo 3: kick → launcher kick (enemy airborne)", m3.filter((x, i) => m3.indexOf(x) === i).join(","));
    ok(m3.includes("aerial"), "combo 3: aerial strike in the air");
    run(W, {}, 1.5);
    // damage once per swing even with constant contact
    const hp0 = h.hp;
    e.x = h.x;
    e.z = h.z + 1.2;
    e.state = "windup";
    e.t = 0;
    e.cool = 0;
    let hurtEvents = 0;
    run(W, {}, 1.0, (w) => {
      hurtEvents += w.events.filter((ev) => ev.type === "heroHurt").length;
    });
    ok(hurtEvents === 1 && h.hp === hp0 - e.K.dmg, "an enemy swing hurts once (no per-frame damage)", `${hurtEvents} hits, hp ${hp0}→${h.hp}`);
  }
  {
    // perfect dodge → counter (combo 5)
    const W = sandbox();
    run(W, {}, 0.1);
    const h = W.hero;
    const e = spawnEnemy(W, "thug", h.x, 0, h.z + 1.6, {});
    e.hp = e.maxHp = 999;
    e.state = "windup";
    e.t = 0;
    e.swingId = 1;
    e.token = true;
    run(W, {}, e.K.wind - 0.12);
    const hp0 = h.hp;
    let perfect = false;
    run(W, { dodge: true, mx: 1, camYaw: 0 }, 0.05, (w) => {
      if (w.events.some((ev) => ev.type === "perfectDodge")) perfect = true;
    });
    run(W, {}, 0.3);
    ok(perfect && h.counterT > 0 && h.hp === hp0, "perfect dodge: no damage + counter window");
    const mv = [];
    run(W, { light: true, camYaw: 0 }, 0.3, (w) => w.hero.atk && mv.push(w.hero.atk.move));
    ok(mv.includes("counter"), "combo 5: dodge → counter attack");
  }
  {
    // web abilities
    const W = sandbox();
    run(W, {}, 0.1);
    const h = W.hero;
    const e = spawnEnemy(W, "thug", h.x, 0, h.z + 12, {});
    e.state = "chase";
    run(W, { ab1: true, camYaw: 0 }, 0.6);
    ok(e.web > 0, "web trap immobilises an enemy");
    const e2 = spawnEnemy(W, "thug", h.x + 0.5, 0, h.z + 10, {});
    e2.state = "chase";
    const d0 = Math.hypot(e2.x - h.x, e2.z - h.z);
    e.dead = true;
    run(W, { ab2: true, camYaw: 0 }, 0.5);
    ok(Math.hypot(e2.x - h.x, e2.z - h.z) < d0 - 4, "web pull yanks an enemy closer");
    let shots = 0;
    for (let i = 0; i < 3; i++) run(W, { web: true, camYaw: 0 }, 0.5, (w) => (shots += w.events.filter((ev) => ev.type === "webShoot").length));
    ok(shots >= 3, "web shot fires");
  }
}

/** every authored point on real geometry, chase paths clear, arenas open */
function data() {
  console.log("data: mission authoring");
  const fl = {};
  const hit = {};
  for (const id of BUILT()) {
    let spec;
    try {
      spec = missionSpec(id);
    } catch (e) {
      ok(false, `M${id} builds`, e.message);
      continue;
    }
    const C = cityFor(spec.district);
    const G = C.geo;
    const standable = (p, what, tol = 0.35) => {
      const f = floorAt(G, p.x, p.z, p.y + tol, p.y - tol, fl);
      const q = { x: p.x, z: p.z };
      const blocked = pushOut(G, q, 0.35, p.y + 0.1, p.y + 1.7, 0.4, hit);
      ok(f && !blocked, `M${id} ${what} stands on solid ground`, `(${p.x.toFixed(1)},${p.y.toFixed(1)},${p.z.toFixed(1)}) floor=${f ? fl.y.toFixed(1) : "none"} blocked=${blocked}`);
    };
    const floating = (p, what, up) => {
      const f = floorAt(G, p.x, p.z, p.y - up + 0.4, p.y - up - 0.4, fl);
      const q = { x: p.x, z: p.z };
      const blocked = pushOut(G, q, 0.3, p.y - 0.5, p.y + 0.5, 0, hit);
      ok(f && !blocked, `M${id} ${what} floats over solid ground`, `(${p.x.toFixed(1)},${p.y.toFixed(1)},${p.z.toFixed(1)})`);
    };
    standable(spec.spawn, "spawn");
    for (const [i, t] of (spec.tokens || []).entries()) floating(t, `token ${i}`, 1.2);
    for (const [i, t] of (spec.heals || []).entries()) floating(t, `heal ${i}`, 0.8);
    const groups = (gs, tag) => {
      for (const gr of gs || []) {
        const n = gr.n || 1;
        for (let k = 0; k < n; k++) {
          const a = (k / n) * Math.PI * 2;
          const rr = n > 1 ? gr.spread ?? 3 : 0;
          const p = { x: gr.at.x + Math.cos(a) * rr, y: gr.at.y, z: gr.at.z + Math.sin(a) * rr };
          if (gr.kind === "drone") ok(floorAt(G, p.x, p.z, p.y + 0.4, p.y - 0.4, fl), `M${id} ${tag} drone has ground under it`);
          else standable(p, `${tag} ${gr.kind}`);
        }
      }
    };
    for (const [k, gs] of Object.entries(spec.pre || {})) groups(gs, `pre.${k}`);
    spec.steps.forEach((st, si) => {
      const tag = `step${si} ${st.type}`;
      if (st.group) groups(st.group, tag);
      if (st.type === "reach") ok(floorAt(G, st.at.x, st.at.z, st.at.y + 0.5, st.at.y - 0.5, fl), `M${id} ${tag} target is on a surface`);
      for (const c of st.civs || []) standable(c.at, `${tag} civilian`);
      for (const d of st.devices || []) standable(d, `${tag} device`);
      for (const it of st.items || []) floating(it, `${tag} intel`, 1.2);
      if (st.type === "protect") {
        standable(st.at, `${tag} target`);
        st.waves.forEach((w, wi) => groups(w.map((x) => ({ ...x, spread: 3 })), `${tag} wave${wi}`));
      }
      if (st.type === "chase") {
        standable(st.path[0], `${tag} runner start`);
        for (let i = 1; i < st.path.length; i++) {
          const a = st.path[i - 1];
          const b = st.path[i];
          const clear = segmentClear(G, a, b);
          ok(clear, `M${id} ${tag} path segment ${i} is clear`, `(${a.x.toFixed(0)},${a.y.toFixed(0)},${a.z.toFixed(0)})→(${b.x.toFixed(0)},${b.y.toFixed(0)},${b.z.toFixed(0)})`);
          standable(b, `${tag} path point ${i}`);
        }
      }
      if (st.type === "boss") {
        let n = 0;
        boxesIn(G, st.arena.x - st.radius, st.arena.z - st.radius, st.arena.x + st.radius, st.arena.z + st.radius, (b) => {
          if (b.y0 > 3 || b.y1 < st.arena.y + 0.3) return;
          const cx = Math.max(b.x0, Math.min(st.arena.x, b.x1));
          const cz = Math.max(b.z0, Math.min(st.arena.z, b.z1));
          if (Math.hypot(cx - st.arena.x, cz - st.arena.z) < st.radius - 1) n++;
        });
        ok(n === 0, `M${id} boss arena is open`, `${n} obstacles`);
        standable(st.arena, `${tag} arena centre`);
      }
    });
  }
}

/** save system: sanitising, unlocks, XP, tokens, upgrades */
function save() {
  console.log("save: progress");
  const mem = new Map();
  globalThis.localStorage = { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) };
  ok(JSON.stringify(loadProgress()) === JSON.stringify(defaultProgress()), "empty storage → defaults");
  mem.set(STORAGE_KEY, "{not json");
  ok(loadProgress().xp === 0, "corrupted JSON → defaults (no crash)");
  mem.set(STORAGE_KEY, JSON.stringify({ xp: -50, upgrades: { punch: 99, bogus: 3 }, completed: { 1: { score: "x", grade: "Z", tokens: [1, 0] }, 99: {} }, suit: "sovereign", settings: { master: 7, graphics: "ultra" } }));
  const p = loadProgress();
  ok(p.xp === 0 && p.upgrades.punch === 3 && !("bogus" in p.upgrades), "garbage values are clamped / dropped");
  ok(p.completed[1] && p.completed[1].grade === "C" && p.completed[1].tokens.join() === "true,false,false" && !p.completed[99], "mission records sanitised");
  ok(p.suit === "classic", "a suit the tokens don't cover falls back");
  ok(p.settings.master === 1 && p.settings.graphics === "medium", "settings clamped");
  let q = defaultProgress();
  ok(isUnlocked(q, 1) && !isUnlocked(q, 2), "only mission 1 is open at first");
  ok(!abilitiesFor(q, 1).trap && abilitiesFor(q, 2).trap && !abilitiesFor(q, 2).pull, "abilities unlock with the campaign");
  let r = applyRun(q, { id: 1, score: 4000, grade: "A", time: 90, tokens: [true, false, true], xp: 300 });
  q = r.progress;
  ok(r.firstClear && r.unlocked[0] === 2 && isUnlocked(q, 2) && q.xp === 300, "first clear unlocks the next mission + full XP", `xp=${q.xp}`);
  r = applyRun(q, { id: 1, score: 3000, grade: "B", time: 70, tokens: [false, true, false], xp: 300 });
  q = r.progress;
  ok(!r.firstClear && q.completed[1].score === 4000 && q.completed[1].grade === "A" && q.completed[1].time === 70, "replay keeps best score / grade, best time");
  ok(q.completed[1].tokens.every(Boolean) && tokenCount(q) === 3, "tokens merge across runs");
  ok(q.xp === 300 + 75, "replay XP: a quarter of the run", `xp=${q.xp}`);
  const u = buyUpgrade(q, "punch");
  ok(u && u.upgrades.punch === 1 && u.xp === q.xp - 300, "buying an upgrade spends XP");
  ok(buyUpgrade({ ...q, xp: 10 }, "punch") === null, "can't buy without XP");
  saveProgress(q);
  ok(loadProgress().completed[1].score === 4000, "save → load round-trips");
}

function missions(only) {
  const ids = only ? [only] : BUILT();
  for (const id of ids) {
    const spec = missionSpec(id);
    console.log(`mission ${id}: ${spec.name} — ${spec.steps.length} steps`);
    ok(spec.steps.length >= 1, `M${id} has objectives`);
    ok((spec.tokens || []).length === 3, `M${id} has 3 hero tokens`);
    const abilities = Object.fromEntries(Object.entries(ABILITY_UNLOCK).map(([k, n]) => [k, id >= n]));
    const W = createWorld(spec, { abilities });
    run(W, {}, 0.05);
    ok(W.hero.grounded, `M${id} spawns on solid ground`, `y=${W.hero.y.toFixed(2)}`);
    const bot = createBot();
    let lastObj = -1;
    let lastLog = 0;
    for (let i = 0; i < Math.round(420 / STEP); i++) {
      const inp = botInput(W, bot, STEP);
      step(W, inp, STEP);
      if (i % 4 === 0) updateCamera(W, STEP * 4, { dx: 0, dy: 0 }, {});
      for (const e of W.events) {
        if (e.type === "objective" && e.idx !== lastObj) {
          lastObj = e.idx;
          if (process.env.TRACE) console.log(`    t=${W.time.toFixed(1)} objective ${e.idx}: ${e.text}`);
        }
      }
      W.events.length = 0;
      if (process.env.TRACE && W.time - lastLog > 2) {
        lastLog = W.time;
        const h = W.hero;
        console.log(`    t=${W.time.toFixed(1)} step ${W.mission.idx} p=${h.x.toFixed(1)},${h.y.toFixed(1)},${h.z.toFixed(1)} ${h.mode}/${h.action} hp ${Math.round(h.hp)}`);
      }
      if (W.state !== "play") break;
    }
    ok(W.state === "complete", `M${id} bot completes the mission`, `state=${W.state} t=${W.time.toFixed(1)} step ${W.mission.idx}/${spec.steps.length} ${W.mission.failed || ""} hp=${Math.round(W.hero.hp)}`);
    console.log(`    time ${W.time.toFixed(1)}s defeated ${W.stats.defeated} dmgTaken ${Math.round(W.stats.damageTaken)} perfect ${W.stats.perfect} maxCombo ${W.stats.maxCombo} swings ${W.stats.swings} tokens ${W.stats.tokens}`);
    restartWorld(W);
    ok(W.state === "play" && W.time === 0 && W.mission.idx === 0, `M${id} restart resets`);
  }
}

const arg = process.argv[2] || "all";
if (arg === "core" || arg === "all") core();
if (arg === "data" || arg === "all") data();
if (arg === "save" || arg === "all") save();
if (arg === "missions" || arg === "all") missions();
if (arg === "bot") missions(Number(process.argv[3]));
console.log(`\n${passes} passed, ${fails} failed`);
process.exit(fails ? 1 : 0);
