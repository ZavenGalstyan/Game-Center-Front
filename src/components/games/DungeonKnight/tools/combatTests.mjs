/**
 * Dungeon Knight — headless combat tests (the engine with no renderer).
 *
 *   node src/components/games/DungeonKnight/tools/combatTests.mjs [core|torture|multi|boss|all]
 *
 * core     the First Fight checks that can be verified numerically
 * torture  thousands of random mixed inputs: invariants never break
 * multi    3–5 enemies: spacing, attack pressure, completion
 * boss     every boss attack: telegraph → hit timing, block, dodge, death once
 */
import { createWorld, stepWorld, drainEvents, liveEnemies, bossOf } from "../engine/world.js";
import { computeStats } from "../engine/progression.js";
import { DUNGEONS } from "../data/dungeons.js";
import { ENEMIES } from "../data/enemies.js";
import { SIM_DT, STAMINA, ATTACKS, DODGE } from "../engine/config.js";
import { yawTo, dist, angleDiff } from "../engine/math.js";
import { bladePoints } from "../engine/player.js";
import { slashPose, shoulderAt, BODY } from "../engine/pose.js";
import { createCamera, updateCamera, snapCamera } from "../engine/camera.js";
import { pointSolid, raycast } from "../engine/collision.js";
import { LAYOUTS } from "../data/layouts.js";

const mode = process.argv[2] || "all";
let pass = 0;
let fail = 0;
const fails = [];
function check(name, ok, info = "") {
  if (ok) pass++;
  else {
    fail++;
    fails.push(`${name} ${info}`);
  }
  console.log(`${ok ? "  ok " : "FAIL "} ${name}${info ? `  (${info})` : ""}`);
}

const baseProgress = () => ({
  knightLevel: 1, xp: 0, upgrades: { health: 0, damage: 0, stamina: 0, defense: 0, potions: 0 },
  equipped: { weapon: "w_rusty", armor: "a_padded", shield: "s_buckler" }, inventory: [],
  statistics: { highestLevel: 1 },
});
const STATS = computeStats(baseProgress());

function world(roomOverride = {}, dIdx = 0, step = 0, extra = {}) {
  const d = DUNGEONS[dIdx];
  const s = d.steps[step];
  const room = { ...(Array.isArray(s) ? s[0] : s), ...roomOverride };
  return createWorld({ dungeon: d, stepIndex: step, room, exits: [{ type: "combat" }], stats: STATS, potions: 3, potionMax: 3, seed: 7, ...extra });
}
const IN = (o = {}) => ({ ax: 0, ay: 0, camYaw: 0, sprint: false, block: false, edges: null, ...o });

/** run for `sec` seconds of frames; fn(W, t) → input; collects events */
function run(W, sec, fn = () => IN(), events = []) {
  const n = Math.round(sec / SIM_DT);
  for (let i = 0; i < n; i++) {
    stepWorld(W, SIM_DT, fn(W, i * SIM_DT));
    for (const e of drainEvents(W)) events.push({ ...e, t: W.clock });
    sanity(W);
  }
  return events;
}
const insane = [];
function sanity(W) {
  const p = W.player;
  const bad = (v) => !Number.isFinite(v);
  if (bad(p.x) || bad(p.z) || bad(p.hp) || bad(p.st) || bad(p.yaw)) insane.push("player NaN");
  if (p.st < 0 || p.st > p.maxSt + 1e-6) insane.push(`stamina ${p.st}`);
  if (p.hp < 0 || p.hp > p.maxHp) insane.push(`hp ${p.hp}`);
  if (p.potions < 0) insane.push("potions < 0");
  for (const e of W.enemies) {
    if (bad(e.x) || bad(e.z) || bad(e.hp)) insane.push("enemy NaN");
    if (e.hp < 0) insane.push("enemy hp < 0");
  }
  const g = W.geo;
  if (Math.abs(p.x) > g.hx + 1.2 || p.z < -g.hz - 2.6 || p.z > g.hz + 2.6) insane.push(`player outside room ${p.x.toFixed(2)},${p.z.toFixed(2)}`);
}
const count = (ev, type) => ev.filter((e) => e.type === type).length;

/** freeze an enemy in place (state machine parked) */
function park(e) {
  e.state = "taunt";
  e.atk = null;
}
function placeEnemy(W, e, x, z, yaw = Math.PI) {
  e.x = x;
  e.z = z;
  e.yaw = yaw;
}

/* ====================================================================== core */
function reach() {
  // the sword arm must always be able to reach the posed hand (renderer IK = engine pose)
  let worst = 0;
  const L = BODY.upperArm + BODY.foreArm;
  for (const name of Object.keys(ATTACKS)) {
    const A = ATTACKS[name];
    for (const tilt of [-0.42, -0.12, 0.24]) {
      const act = { name, su: A.startup, ac: A.active, re: A.recovery, tilt, fromH: [0.3, 1.0, 0.3], fromD: [0.1, 0.62, 0.78] };
      const H = [0, 0, 0];
      const D = [0, 0, 0];
      const S = [0, 0, 0];
      for (let t = 0; t <= A.startup + A.active + A.recovery; t += 0.005) {
        const bo = slashPose(act, t, H, D);
        for (let i = 0; i < 3; i++) H[i] += ([0.3, 1.0, 0.3][i] - H[i]) * bo; // recovery eases into the guard (as updatePose does)
        shoulderAt(1, act.twist || 0, S);
        worst = Math.max(worst, Math.hypot(H[0] - S[0], H[1] - S[1], H[2] - S[2]));
      }
    }
  }
  check("sword hand always within arm reach (IK = engine pose)", worst <= L + 0.01, `max ${worst.toFixed(3)} m vs arm ${L.toFixed(2)} m`);
}

function core() {
  console.log("\n== First fight (engine) ==");
  reach();
  let W = world();
  const p = W.player;
  check("1-2 spawn in the entry alcove facing into the room", p.z < -W.geo.hz && Math.abs(p.yaw) < 1e-6 && W.phase === "enter", `z=${p.z.toFixed(2)}`);
  check("room 1 has exactly one slime", W.enemies.length === 1 && W.enemies[0].type === "slime");

  // walk forward
  let z0 = p.z;
  run(W, 0.8, () => IN({ ay: 1 }));
  check("5 walk forward (camera-relative)", p.z - z0 > 2.4, `dz=${(p.z - z0).toFixed(2)}`);
  check("fight starts once inside; entry door closes", W.phase === "fight" && W.doors[0].leaf.on === true);
  const enemy = W.enemies[0];
  park(enemy); // keep the slime out of the movement tests
  // walk backward
  z0 = p.z;
  run(W, 0.5, () => IN({ ay: -1 }));
  check("6 walk backward (reverses within ~0.25 s)", p.z < z0 - 0.95, `dz=${(p.z - z0).toFixed(2)}`);
  // strafe
  let x0 = p.x;
  run(W, 0.5, () => IN({ ax: -1 }));
  check("7 strafe left (camera yaw 0 → left is +x)", p.x > x0 + 1.2, `dx=${(p.x - x0).toFixed(2)}`);
  x0 = p.x;
  run(W, 0.5, () => IN({ ax: 1 }));
  check("8 strafe right", p.x < x0 - 0.95, `dx=${(p.x - x0).toFixed(2)}`);
  // sprint speed vs walk
  run(W, 0.3, () => IN());
  x0 = p.x;
  run(W, 0.6, () => IN({ ax: 1 }));
  const walkD = Math.abs(p.x - x0);
  run(W, 0.3, () => IN());
  x0 = p.x;
  const st0 = p.st;
  run(W, 0.6, () => IN({ ax: -1, sprint: true }));
  const runD = Math.abs(p.x - x0);
  check("9 sprint is faster than walking and drains stamina", runD > walkD * 1.35 && p.st < st0, `walk ${walkD.toFixed(2)} sprint ${runD.toFixed(2)} st ${st0.toFixed(0)}→${p.st.toFixed(0)}`);
  run(W, 0.4, () => IN({ ax: -1 }));
  check("10 releasing Shift stops sprinting", !p.sprinting);
  run(W, 0.4, () => IN());
  check("stops promptly (no ice)", Math.hypot(p.vx, p.vz) < 0.05);

  // wall collision: push into the west wall for 3 s
  run(W, 3, () => IN({ ax: -1, sprint: true }));
  check("11-12 wall collision holds", p.x <= W.geo.hx - 0.36 + 1e-6 && p.x > W.geo.hx - 0.5, `x=${p.x.toFixed(3)} wall=${W.geo.hx}`);
  run(W, 3, () => IN({ ay: 1, ax: -1, sprint: true }));
  check("corner holds (north-west)", p.z <= W.geo.hz - 0.36 + 1e-6 || Math.abs(p.x) < 1.1, `x=${p.x.toFixed(2)} z=${p.z.toFixed(2)}`);
  // closed exit door holds (fight on)
  p.x = 0;
  p.z = W.geo.hz - 1.5;
  run(W, 2, () => IN({ ay: 1 }));
  check("closed exit door is solid", p.z < W.geo.hz, `z=${p.z.toFixed(2)}`);

  // attack empty space
  W = world();
  const P = W.player;
  run(W, 0.7, () => IN({ ay: 1 })); // walk in, fight starts
  const sl = W.enemies[0];
  park(sl);
  placeEnemy(W, sl, 0, 6);
  P.x = 0;
  P.z = 0;
  P.yaw = 0;
  let ev = run(W, 0.8, (w, t) => IN({ edges: t === 0 ? { attack: true } : null }));
  check("13 attack empty space: a swing happens", count(ev, "swing") === 1);
  check("14 a miss deals no damage (no hit event, slime HP full)", count(ev, "hit") === 0 && sl.hp === sl.maxHp);

  // approach + light attack: one hit, damage only during ACTIVE
  placeEnemy(W, sl, 0, 1.45);
  P.x = 0;
  P.z = 0;
  P.yaw = 0;
  ev = run(W, 0.9, (w, t) => IN({ edges: t === 0 ? { attack: true } : null }));
  const hits = ev.filter((e) => e.type === "hit");
  const sw = ev.find((e) => e.type === "swing");
  check("16-18 light attack on a slime in front: exactly one hit", hits.length === 1, `hits=${hits.length}`);
  if (hits.length) {
    const dt = hits[0].t - sw.t;
    const A = ATTACKS.light1;
    check("hit lands inside the ACTIVE window (not at startup)", dt >= A.startup - 0.02 && dt <= A.startup + A.active + 0.02, `${(dt * 1000).toFixed(0)} ms after the click`);
    check("hit point is on the slime body", Math.hypot(hits[0].x - hits[0].ex, hits[0].z - hits[0].ez) <= sl.def.radius + 0.1 && hits[0].y <= sl.def.height + 0.1, `y=${hits[0].y.toFixed(2)}`);
    check("damage = sword damage", hits[0].dmg === STATS.attack, `${hits[0].dmg}`);
  }
  // combo
  sl.hp = sl.maxHp;
  P.st = P.maxSt;
  P.x = 0;
  P.z = 0;
  P.yaw = 0;
  run(W, 0.6, () => IN());
  ev = run(W, 1.4, (w, t) => IN({ edges: t < 0.001 || Math.abs(t - 0.2) < 0.001 ? { attack: true } : null }));
  const swings = ev.filter((e) => e.type === "swing").map((e) => e.name);
  check("19-20 second click within the window chains light1 → light2", swings.join(",") === "light1,light2", swings.join(","));
  check("each swing hits once (2 hits for 2 swings)", count(ev, "hit") === 2, `hits=${count(ev, "hit")}`);

  // out of range
  sl.hp = sl.maxHp;
  placeEnemy(W, sl, 0, 3.3);
  P.x = 0;
  P.z = 0;
  P.yaw = 0;
  run(W, 0.5, () => IN());
  ev = run(W, 0.9, (w, t) => IN({ edges: t === 0 ? { attack: true } : null }));
  check("21-23 out of range: no phantom hit", count(ev, "hit") === 0, `slime at 3.3 m`);
  // heavy out of range too
  P.x = 0;
  P.z = 0;
  P.yaw = 0;
  placeEnemy(W, sl, 0, 3.3);
  ev = run(W, 1.6, (w, t) => IN({ edges: t === 0 ? { heavy: true } : null }));
  check("heavy attack out of range: no phantom hit", count(ev, "hit") === 0);

  // facing away
  placeEnemy(W, sl, 0, -1.3);
  P.x = 0;
  P.z = 0;
  P.yaw = 0;
  W.enemies[0].state = "taunt";
  run(W, 0.6, () => IN());
  ev = run(W, 0.9, (w, t) => IN({ edges: t === 0 ? { attack: true } : null }));
  // soft aim must not spin him round to hit what's behind
  check("24-26 slime directly behind: no rear hit", count(ev, "hit") === 0);
  ev = run(W, 1.6, (w, t) => IN({ edges: t === 0 ? { heavy: true } : null }));
  check("heavy with slime behind: no rear hit", count(ev, "hit") === 0);
  // side-behind (135°)
  placeEnemy(W, sl, 1.0, -1.0);
  P.yaw = 0;
  ev = run(W, 0.9, (w, t) => IN({ edges: t === 0 ? { attack: true } : null }));
  check("slime at 135° behind-left: no hit", count(ev, "hit") === 0);

  // through a wall/pillar: blade stops at stone (hall layout pillar)
  {
    const H = world({ layout: "hall", enemies: ["slime"] }, 0, 1);
    const hp = H.player;
    run(H, 0.8, () => IN({ ay: 1 }));
    const e = H.enemies[0];
    park(e);
    // pillar at (-3.7, -3.2) r .48: knight south of it, slime north of it
    hp.x = -3.7;
    hp.z = -4.35;
    hp.yaw = 0;
    placeEnemy(H, e, -3.7, -2.0);
    const ev2 = run(H, 0.9, (w, t) => IN({ edges: t === 0 ? { attack: true } : null }));
    check("no damage through a pillar", count(ev2, "hit") === 0 && e.hp === e.maxHp, `clank=${count(ev2, "clank")}`);
  }

  // slime attacks: telegraph → hit; HP update
  W = world();
  const K = W.player;
  run(W, 0.7, () => IN({ ay: 1 }));
  const s2 = W.enemies[0];
  K.x = 0;
  K.z = 1.0;
  K.yaw = 0;
  ev = run(W, 4, () => IN());
  const tele = ev.find((e) => e.type === "enemyTele");
  const hurt = ev.find((e) => e.type === "playerHurt");
  check("27-28 slime telegraphs before attacking", !!tele && !!hurt && hurt.t - tele.t >= ENEMIES.slime.attacks[0].tele - 0.02, tele && hurt ? `${((hurt.t - tele.t) * 1000).toFixed(0)} ms warning` : "no attack");
  check("29-30 damage taken updates HP deterministically", hurt && K.hp === K.maxHp - hurt.dmg && hurt.dmg === Math.round(ENEMIES.slime.dmg * (60 / (60 + STATS.defense))), hurt ? `-${hurt.dmg} → ${K.hp}` : "");

  // block the next one (facing the slime)
  K.hp = K.maxHp;
  K.st = K.maxSt;
  ev = run(W, 4, (w) => {
    w.player.yaw = yawTo(w.player.x, w.player.z, s2.x, s2.z);
    return IN({ block: true, camYaw: yawTo(w.player.x, w.player.z, s2.x, s2.z) });
  });
  const blk = ev.find((e) => e.type === "block");
  check("31-33 block facing the slime: shield impact, stamina cost, little/no HP loss", !!blk && count(ev, "playerHurt") === 0 && blk.stamina > 0 && K.st < K.maxSt + 1, blk ? `stamina -${blk.stamina.toFixed(1)}, hp -${blk.hp}` : "no block");

  // block facing away
  K.hp = K.maxHp;
  K.st = K.maxSt;
  ev = run(W, 4, (w) => {
    const away = yawTo(w.player.x, w.player.z, s2.x, s2.z) + Math.PI;
    w.player.yaw = away;
    return IN({ block: true, camYaw: away });
  });
  check("34-35 rear attack is not blocked", count(ev, "playerHurt") >= 1 && count(ev, "block") === 0, `hurt=${count(ev, "playerHurt")} block=${count(ev, "block")}`);

  // dodge the hop: press dodge when the slime commits
  K.hp = K.maxHp;
  K.st = K.maxSt;
  let dodged = false;
  ev = run(W, 5, (w) => {
    const e = w.enemies[0];
    if (!dodged && e.atk && e.atk.phase === "tele" && e.atk.t >= e.atk.tele - 0.06) {
      dodged = true;
      return IN({ ax: 1, edges: { dodge: true } });
    }
    return IN();
  });
  const dEv = ev.find((e) => e.type === "dodge");
  const hurtSoon = ev.filter((e) => e.type === "playerHurt" && dEv && e.t > dEv.t && e.t < dEv.t + 1.0).length;
  check("36-37 dodge at the end of the wind-up avoids the hop", !!dEv && hurtSoon === 0, `${count(ev, "evade")} evades, ${hurtSoon} hits within 1 s of the roll`);

  // spam dodge
  W = world();
  const D = W.player;
  run(W, 0.7, () => IN({ ay: 1 }));
  park(W.enemies[0]);
  placeEnemy(W, W.enemies[0], 4, 5);
  D.x = 0;
  D.z = 0;
  ev = run(W, 2.6, () => IN({ ax: 1, edges: { dodge: true } }));
  const nd = count(ev, "dodge");
  check("38-39 dodge spam: stamina caps the rolls", nd >= 3 && nd <= 5 && count(ev, "noStamina") > 0, `${nd} rolls in 2 s`);
  check("40 stamina drains to (near) zero, never negative", D.st >= 0 && D.st < 20, `st=${D.st.toFixed(1)}`);
  x0 = D.x;
  const zx = D.z;
  run(W, 0.6, () => IN({ ax: -1 }));
  check("41 at zero stamina the knight still walks", Math.hypot(D.x - x0, D.z - zx) > 1.5, `moved ${Math.hypot(D.x - x0, D.z - zx).toFixed(2)} m, st=${D.st.toFixed(1)} act=${D.act && D.act.type} x=${D.x.toFixed(2)}`);
  const stLow = D.st;
  run(W, 0.4, () => IN());
  const stMid = D.st;
  run(W, 2.4, () => IN());
  check("42-43 stamina regenerates after a short delay", D.st > stMid && D.st === D.maxSt, `${stLow.toFixed(0)} → ${stMid.toFixed(0)} → ${D.st.toFixed(0)}`);

  // attack spam is also gated
  ev = run(W, 6, () => IN({ edges: { attack: true } }));
  check("attack spam: stamina runs out, attacks stop", count(ev, "noStamina") > 0 && D.st >= 0);

  // defeat the slime → XP once, room clear once, chest once, door
  W = world();
  const Q = W.player;
  run(W, 0.7, () => IN({ ay: 1 }));
  const s3 = W.enemies[0];
  park(s3);
  placeEnemy(W, s3, 0, 1.4);
  Q.x = 0;
  Q.z = 0;
  ev = [];
  for (let i = 0; i < 12 && !s3.dead; i++) {
    Q.yaw = yawTo(Q.x, Q.z, s3.x, s3.z);
    Q.st = Q.maxSt;
    run(W, 0.8, (w, t) => IN({ edges: t === 0 ? { attack: true } : null }), ev);
    s3.state = s3.dead ? "dead" : "taunt";
  }
  run(W, 2, () => IN(), ev);
  check("44-45 slime dies exactly once", s3.dead && count(ev, "enemyDeath") === 1);
  const de = ev.find((e) => e.type === "enemyDeath");
  check("46 XP reported once (12 xp)", de && de.xp === 12 && count(ev, "enemyDeath") === 1);
  check("47 room clear exactly once; exits open", count(ev, "roomClear") === 1 && W.doors.filter((d) => d.kind === "exit").every((d) => d.open));
  check("dead slime takes no more hits", (() => {
    const e2 = run(W, 0.9, (w, t) => IN({ edges: t === 0 ? { attack: true } : null }));
    return count(e2, "hit") === 0;
  })());
  check("chest appears after the clear", W.chest && W.chest.state === "closed" && count(ev, "chestAppear") === 1);
  // open chest: walk up, press E twice
  Q.x = W.chest.x;
  Q.z = W.chest.z - 1.2;
  Q.yaw = 0;
  run(W, 1.2, () => IN(), ev);
  ev = run(W, 2, (w, t) => IN({ edges: t < 0.001 || Math.abs(t - 0.3) < 0.001 || Math.abs(t - 1.5) < 0.001 ? { interact: true } : null }));
  check("48-50 chest opens exactly once (3 presses)", count(ev, "chestOpen") === 1 && W.chest.state === "open", `${count(ev, "chestOpen")}`);
  // exit door
  const door = W.doors.find((d) => d.kind === "exit");
  Q.x = door.x;
  Q.z = door.z - 2;
  ev = run(W, 2.5, () => IN({ ay: 1 }));
  check("51-52 walking into the open door exits the room once", count(ev, "exit") === 1 && W.phase === "exit");

  // death once
  W = world();
  const R = W.player;
  run(W, 0.7, () => IN({ ay: 1 }));
  R.hp = 5;
  R.x = 0;
  R.z = 1.2;
  ev = run(W, 6, () => IN());
  check("player death fires once; enemies stop attacking", count(ev, "playerDeath") === 1 && R.dead && W.enemies[0].state === "taunt");
  ev = run(W, 2, () => IN({ edges: { attack: true, dodge: true }, ay: 1 }));
  check("defeated knight cannot attack or dodge", count(ev, "swing") === 0 && count(ev, "dodge") === 0);

  // potion
  W = world();
  const S = W.player;
  run(W, 0.7, () => IN({ ay: 1 }));
  park(W.enemies[0]);
  S.hp = 40;
  ev = run(W, 2, (w, t) => IN({ edges: t < 0.001 || Math.abs(t - 0.1) < 0.001 || Math.abs(t - 0.3) < 0.001 ? { potion: true } : null }));
  check("one Q press during a drink = one potion", count(ev, "potion") === 1 && S.potions === 2 && S.hp === 85, `potions ${S.potions} hp ${S.hp}`);
  S.hp = S.maxHp;
  ev = run(W, 1, (w, t) => IN({ edges: t === 0 ? { potion: true } : null }));
  check("full HP: potion not wasted", count(ev, "potion") === 0 && count(ev, "potionFull") === 1 && S.potions === 2);
  S.potions = 0;
  S.hp = 30;
  ev = run(W, 1, (w, t) => IN({ edges: t === 0 ? { potion: true } : null }));
  check("zero potions: nothing happens, count stays 0", count(ev, "potionEmpty") === 1 && S.potions === 0 && S.hp === 30);

  // long frame clamp (tab switch)
  W = world();
  const T0 = W.player;
  run(W, 0.3, () => IN({ ay: 1 }));
  const before = T0.z;
  stepWorld(W, 5.0, IN({ ay: 1 }));
  check("59-61 a 5 s frame advances at most 0.05 s (no teleport)", T0.z - before < 0.3, `moved ${(T0.z - before).toFixed(3)} m`);
  stepWorld(W, NaN, IN({ ay: 1 }));
  check("NaN frame time is ignored", Number.isFinite(T0.z));
}

/* ====================================================================== torture */
function torture() {
  console.log("\n== Combat torture (random mixed input) ==");
  let swingTotal = 0;
  let hitTotal = 0;
  let deaths = 0;
  let maxHitsPerSwing = 0;
  let rewardDup = 0;
  let actions = 0;
  for (let seed = 1; seed <= 24; seed++) {
    const d = DUNGEONS[seed % DUNGEONS.length];
    const stepI = seed % (d.steps.length - 1);
    const s = d.steps[stepI];
    const room = Array.isArray(s) ? s[seed % s.length] : s;
    const W = createWorld({ dungeon: d, stepIndex: stepI, room, exits: [{ type: "combat" }], stats: STATS, potions: 3, potionMax: 3, seed });
    let r = seed * 99991;
    const rnd = () => ((r = (r * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
    const deathUids = new Set();
    let hold = { ax: 0, ay: 0, block: false, sprint: false, cam: 0 };
    const ev = run(W, 40, (w) => {
      if (rnd() < 0.08) hold = { ax: rnd() * 2 - 1, ay: rnd() * 2 - 1, block: rnd() < 0.25, sprint: rnd() < 0.3, cam: hold.cam };
      hold.cam += (rnd() - 0.5) * 0.3;
      const edges = {};
      const x = rnd();
      if (x < 0.06) edges.attack = true;
      else if (x < 0.075) edges.heavy = true;
      else if (x < 0.09) edges.dodge = true;
      else if (x < 0.095) edges.potion = true;
      else if (x < 0.1) edges.interact = true;
      if (Object.keys(edges).length) actions++;
      if (w.player.dead) w.player.hp = 0;
      return IN({ ...hold, camYaw: hold.cam, edges });
    });
    const perSwing = new Map();
    let cur = 0;
    for (const e of ev) {
      if (e.type === "swing") cur++;
      if (e.type === "hit") {
        const k = `${cur}:${e.uid}`;
        perSwing.set(k, (perSwing.get(k) || 0) + 1);
      }
      if (e.type === "enemyDeath") {
        if (deathUids.has(e.uid)) rewardDup++;
        deathUids.add(e.uid);
      }
    }
    for (const v of perSwing.values()) maxHitsPerSwing = Math.max(maxHitsPerSwing, v);
    swingTotal += count(ev, "swing");
    hitTotal += count(ev, "hit");
    deaths += count(ev, "playerDeath");
    const clears = count(ev, "roomClear");
    if (clears > 1) rewardDup++;
    if (clears === 1 && W.enemies.some((e) => !e.dead)) rewardDup++;
  }
  check("no NaN / negative stamina / negative potions / out-of-room", insane.length === 0, insane.slice(0, 3).join("; "));
  check("no enemy is hit twice by one swing", maxHitsPerSwing <= 1, `max ${maxHitsPerSwing}`);
  check("no duplicated rewards / clears", rewardDup === 0);
  console.log(`   ${actions} random actions over 24 rooms × 40 s: ${swingTotal} swings, ${hitTotal} hits, ${deaths} knight deaths`);
}

/* ====================================================================== multi */
function multi() {
  console.log("\n== Multi-enemy ==");
  const d = DUNGEONS[0];
  for (const n of [3, 4, 5]) {
    const room = { type: "combat", layout: "crossroads", enemies: ["skeleton", "slime", "skeleton", "slime", "shieldSkel"].slice(0, n), chest: null };
    const W = createWorld({ dungeon: d, stepIndex: 3, room, exits: [{ type: "combat" }], stats: { ...STATS, maxHp: 99999 }, hp: 99999, potions: 3, seed: n });
    W.player.x = 0;
    W.player.z = -2;
    let minSep = Infinity;
    let maxConcurrent = 0;
    let overlapFrames = 0;
    const starts = [];
    const ev = run(W, 30, (w) => {
      const live = w.enemies.filter((e) => !e.dead);
      for (let i = 0; i < live.length; i++) {
        for (let j = i + 1; j < live.length; j++) {
          const a = live[i];
          const b = live[j];
          const s = dist(a.x, a.z, b.x, b.z) - a.def.radius - b.def.radius;
          minSep = Math.min(minSep, s);
          if (s < -0.15) overlapFrames++;
        }
      }
      const attacking = live.filter((e) => e.state === "tele" || e.state === "act").length;
      maxConcurrent = Math.max(maxConcurrent, attacking);
      w.player.hp = w.player.maxHp;
      return IN({ ax: Math.sin(w.clock * 0.7) * 0.6, ay: Math.cos(w.clock * 0.5) * 0.4 });
    });
    for (const e of ev) if (e.type === "enemyTele") starts.push(e.t);
    starts.sort((a, b) => a - b);
    let minGap = Infinity;
    for (let i = 1; i < starts.length; i++) minGap = Math.min(minGap, starts[i] - starts[i - 1]);
    check(`${n} enemies: no stacking (min gap ${minSep.toFixed(2)} m)`, overlapFrames < 30, `${overlapFrames} overlapping frames`);
    check(`${n} enemies: ≤ 2 attacking at once, ≥ 0.4 s between attack starts`, maxConcurrent <= 2 && minGap >= 0.4, `max ${maxConcurrent}, min gap ${(minGap * 1000).toFixed(0)} ms, ${starts.length} attacks`);
  }
  // completion only when all defeated
  const room = { type: "combat", layout: "hall", enemies: ["slime", "skeleton", "slime"], chest: null };
  const W = createWorld({ dungeon: d, stepIndex: 1, room, exits: [{ type: "combat" }], stats: STATS, potions: 3, seed: 3 });
  run(W, 0.8, () => IN({ ay: 1 }));
  W.enemies[0].hp = 1;
  const ev = [];
  // kill two of three by direct engine kill path (hitEnemy)
  for (const e of W.enemies.slice(0, 2)) W.hitEnemy(e, W.player, { ...ATTACKS.heavy, poise: 9 }, [e.x, 0.5, e.z]) && (e.hp = 0);
  for (const e of W.enemies.slice(0, 2)) if (!e.dead) {
    e.hp = 1;
    W.hitEnemy(e, W.player, ATTACKS.heavy, [e.x, 0.5, e.z]);
  }
  run(W, 0.5, () => IN(), ev);
  check("room not cleared while one enemy lives", !W.clearedOnce && liveEnemies(W) === 1);
  const last = W.enemies[2];
  last.hp = 1;
  W.hitEnemy(last, W.player, ATTACKS.light1, [last.x, 0.5, last.z]);
  W.hitEnemy(last, W.player, ATTACKS.light1, [last.x, 0.5, last.z]);
  run(W, 0.5, () => IN(), ev);
  const all = [...ev, ...drainEvents(W)];
  const uids = all.filter((e) => e.type === "enemyDeath").map((e) => e.uid);
  check("clears exactly once after the last one; deaths counted once each", W.clearedOnce && count(all, "roomClear") === 1 && uids.length === 3 && new Set(uids).size === 3, `${uids.length} deaths`);
}

/* ====================================================================== boss */
function boss() {
  console.log("\n== Bosses ==");
  for (const d of DUNGEONS) {
    const room = d.steps[d.steps.length - 1];
    const W = createWorld({ dungeon: d, stepIndex: d.steps.length - 1, room, exits: [], stats: { ...STATS, maxHp: 1e6, attack: 25 }, hp: 1e6, potions: 3, seed: d.id });
    const B = bossOf(W);
    run(W, 0.9, () => IN({ ay: 1 }));
    const seen = new Map();
    let earlyHit = 0;
    let hitsAfterDeath = 0;
    let lastTele = null;
    const ev = [];
    // fight for 150 s at mid range, moving around; check tele → hit gaps
    let killedAt = -1;
    run(W, 150, (w, t) => {
      const p = w.player;
      p.hp = p.maxHp;
      if (t > 140 && !B.dead) B.hp = Math.min(B.hp, 1);
      if (t > 140 && !B.dead) W.hitEnemy(B, p, ATTACKS.heavy, [B.x, 1, B.z]);
      if (B.dead && killedAt < 0) killedAt = w.clock;
      if (t > 60 && t < 61) B.hp = Math.min(B.hp, B.maxHp * 0.45); // force phase 2
      const toward = yawTo(p.x, p.z, B.x, B.z);
      const dd = dist(p.x, p.z, B.x, B.z);
      const far = t % 20 < 7; // sometimes keep away, so ranged attacks get used too
      const lo = far ? 6 : 2.2;
      const hi = far ? 8 : 3.5;
      return IN({ camYaw: toward, ay: dd > hi ? 0.6 : dd < lo ? -0.8 : 0, ax: Math.sin(t * 0.6) });
    }, ev);
    for (const e of ev) {
      if (e.type === "enemyTele" && e.boss) {
        lastTele = e;
        seen.set(e.attack, (seen.get(e.attack) || 0) + 1);
      }
      if ((e.type === "playerHurt" || e.type === "block") && lastTele && e.t - lastTele.t < 0.2) earlyHit++;
      if ((e.type === "playerHurt" || e.type === "block") && killedAt > 0 && e.t > killedAt + 0.1) hitsAfterDeath++;
    }
    const used = B.def.attacks.filter((a) => a.weight > 0).map((a) => a.id);
    const missing = used.filter((id) => !seen.get(id));
    check(`${B.def.name}: every attack used (${[...seen.entries()].map(([k, v]) => `${k}×${v}`).join(" ")})`, missing.length === 0, missing.length ? `missing ${missing.join(",")}` : "");
    check(`${B.def.name}: no damage within 200 ms of a telegraph start`, earlyHit === 0, `${earlyHit}`);
    check(`${B.def.name}: phase change once, death once, no attacks after death`, count(ev, "bossPhase") === 1 && count(ev, "enemyDeath") === 1 && hitsAfterDeath === 0 && count(ev, "roomClear") === 1);
  }
  // block / dodge behaviour vs the first boss heavy slash
  const d = DUNGEONS[0];
  const room = d.steps[d.steps.length - 1];
  for (const how of ["block", "dodge", "none"]) {
    const W = createWorld({ dungeon: d, stepIndex: 7, room, exits: [], stats: STATS, potions: 3, seed: 3 });
    const B = bossOf(W);
    run(W, 0.9, () => IN({ ay: 1 }));
    run(W, 2, () => IN());
    const p = W.player;
    p.x = B.x;
    p.z = B.z - 2.4;
    B.state = "chase";
    B.nextAttackAt = 0;
    B.cds = { shieldBash: 99, overhead: 99 };
    let rolled = false;
    const ev = run(W, 3, (w) => {
      const k = B.atk;
      const face = yawTo(p.x, p.z, B.x, B.z);
      p.st = p.maxSt;
      if (how === "block") {
        p.yaw = face;
        return IN({ block: true, camYaw: face });
      }
      if (how === "dodge" && k && k.phase === "tele" && k.t > k.tele - 0.05 && !rolled) {
        rolled = true;
        return IN({ camYaw: face, ax: 1, edges: { dodge: true } });
      }
      return IN({ camYaw: face });
    });
    const first = ev.find((e) => ["playerHurt", "block", "evade", "guardBreak"].includes(e.type));
    const ok = how === "block" ? first && first.type === "block" : how === "dodge" ? !first || first.type === "evade" : first && first.type === "playerHurt";
    check(`Cellar Guardian heavy slash vs ${how}: ${first ? first.type : "no contact"}`, !!ok);
  }
}

/* ====================================================================== camera */
function camera() {
  console.log("\n== Camera torture ==");
  const settings = { cameraDistance: "normal", cameraShake: "normal", reducedMotion: false };
  let inside = 0;
  let outside = 0;
  let blocked = 0;
  let pops = 0;
  let frames = 0;
  let maxStep = 0;
  for (const layout of Object.keys(LAYOUTS)) {
    const room = { type: "combat", layout, enemies: [], chest: null };
    const W = createWorld({ dungeon: DUNGEONS[0], stepIndex: 1, room, exits: [{ type: "combat" }, { type: "treasure" }], stats: STATS, potions: 3, seed: 2 });
    const cam = createCamera(0);
    snapCamera(cam, W, 0, settings);
    let r = 7;
    const rnd = () => ((r = (r * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
    let hold = { ax: 0, ay: 1, sprint: true };
    let px = cam.x;
    let py = cam.y;
    let pz = cam.z;
    for (let i = 0; i < 60 * 90; i++) {
      if (i % 50 === 0) hold = { ax: rnd() * 2 - 1, ay: rnd() * 2 - 1, sprint: rnd() < 0.6 };
      const edges = rnd() < 0.03 ? { dodge: true } : null;
      // fast spins + pitch sweeps
      const dx = (rnd() - 0.5) * (i % 300 < 60 ? 260 : 40);
      const dy = (rnd() - 0.5) * 30;
      stepWorld(W, SIM_DT, IN({ ...hold, camYaw: cam.yaw, edges }));
      updateCamera(cam, W, dx, dy, SIM_DT, { sensitivity: 1, settings });
      frames++;
      const g = W.geo;
      const hit = pointSolid(W.C, cam.x, cam.y, cam.z, 0);
      // low props / cell bars are see-through for the camera by design (cam: false)
      if (hit && hit.cam !== false) {
        inside++;
        if (inside <= 3) console.log(`   inside ${hit.tag} @${layout} f${i} cam ${cam.x.toFixed(2)},${cam.y.toFixed(2)},${cam.z.toFixed(2)} knight ${W.player.x.toFixed(2)},${W.player.z.toFixed(2)} dist ${cam.dist.toFixed(2)}`);
      }
      if (Math.abs(cam.x) > g.hx + 0.05 || cam.z < -g.hz - 2.4 || cam.z > g.hz + 2.4 || cam.y < 0.3 || cam.y > 5.2) {
        outside++;
        if (outside <= 3) console.log(`   outside @${layout} f${i} cam ${cam.x.toFixed(2)},${cam.y.toFixed(2)},${cam.z.toFixed(2)} knight ${W.player.x.toFixed(2)},${W.player.z.toFixed(2)}`);
      }
      // line of sight camera → knight's chest
      const p = W.player;
      const tx = p.x - cam.x;
      const ty = 1.3 - cam.y;
      const tz = p.z - cam.z;
      const L = Math.hypot(tx, ty, tz);
      if (raycast(W.C, cam.x, cam.y, cam.z, tx / L, ty / L, tz / L, L, 0, true) < L - 0.45) blocked++;
      const step = Math.hypot(cam.x - px, cam.y - py, cam.z - pz);
      maxStep = Math.max(maxStep, step);
      // shortening at once when a wall/pillar cuts in is intended; what must
      // never happen is the camera jumping OUT (away from the knight)
      const dNow = Math.hypot(cam.x - W.player.x, cam.z - W.player.z);
      if (dNow - (cam.lastD || dNow) > 0.5) {
        pops++;
        console.log(`   pop @${layout} f${i}: ${cam.lastD.toFixed(2)} → ${dNow.toFixed(2)} m, dist ${cam.dist.toFixed(2)}, knight ${W.player.x.toFixed(2)},${W.player.z.toFixed(2)} act ${W.player.act && W.player.act.type}`);
      }
      cam.lastD = dNow;
      px = cam.x;
      py = cam.y;
      pz = cam.z;
    }
  }
  check(`camera never inside stone (${frames} frames, 7 layouts, sprints/rolls/spins)`, inside === 0, `${inside}`);
  check("camera never outside the room / below the floor / above the ceiling", outside === 0, `${outside}`);
  check("knight visible (no wall between camera and knight) ≥ 99% of frames", blocked / frames < 0.01, `${blocked} blocked frames`);
  check("no outward pops (the boom never jumps out > 0.5 m in a frame)", pops === 0, `${pops} pops; max any-direction step ${maxStep.toFixed(2)} m/frame (inward snaps when stone cuts in are intended)`);
}

if (mode === "core" || mode === "all") core();
if (mode === "camera" || mode === "all") camera();
if (mode === "torture" || mode === "all") torture();
if (mode === "multi" || mode === "all") multi();
if (mode === "boss" || mode === "all") boss();
console.log(`\n${pass} passed, ${fail} failed`);
if (fail) {
  console.log(fails.join("\n"));
  process.exitCode = 1;
}
void angleDiff;
void bladePoints;
void STAMINA;
void DODGE;
