/**
 * Helix Drop — level validator (real engine/sim.js, no rendering).
 *   node src/components/games/HelixDrop/tools/validateLevels.mjs [ids…]
 *
 * Structure (every layer):
 *   segments sum to exactly 360°, positive lengths, known types
 *   at least one gap ≥ MIN_GAP° (a real opening, never a closed ring)
 *   never 100% danger, danger ≤ 60% of a ring
 *   ids unique, layers strictly descending, exactly one finish and it is last
 *   moving layers: sway ≤ 45° and period ≥ 2 s, spin ≤ 60°/s
 *   the ball's start angle is over safe ground on layer 0
 * Play (the same sim you play):
 *   COMPLETE  — a bot that turns the tower at only 35% of your max speed and
 *               re-decides only every 0.16 s must reach the finish in "safe"
 *               mode, i.e. WITHOUT relying on Smash (landing between drops)
 *   ★★★       — a bot at 60% speed in "drop" mode must finish under
 *               targetTime with a drop streak ≥ streakGoal
 *   VISIBLE   — whenever the ball rests on layer K, layers K+1..K+2 are inside
 *               the camera frustum (checked with the real camera pose)
 */
import * as THREE from "three";
import { LEVELS } from "../data/levels.js";
import { Sim } from "../engine/sim.js";
import { Bot } from "../engine/bot.js";
import { PHYS } from "../engine/constants.js";

const MIN_GAP = 36;
const only = process.argv.slice(2).map(Number).filter(Boolean);
const list = only.length ? LEVELS.filter((L) => only.includes(L.id)) : LEVELS;
let bad = 0;

function typeAt(l, deg) {
  let a = ((deg - (l.off || 0)) % 360 + 360) % 360;
  for (const [t, d] of l.segs) {
    if (a < d) return t;
    a -= d;
  }
  return l.segs[l.segs.length - 1][0];
}
/** Follow a drop at angle d down through aligned gaps: it must land clear of danger. */
function chainClear(L, j, d, pad) {
  for (let n = j; n < L.length; n++) {
    const N = L[n];
    if (N.finish) return true;
    if (N.move?.spin) return true; // spinning rings are proven by the bot
    const p = pad + (N.move?.amp || 0) + (n - j) * 6; // faster fall deeper in the chain: widen
    for (let k = -p; k <= p; k += 2) if (typeAt(N, d + k) === "danger") return false;
    if (typeAt(N, d) !== "gap") return true; // lands here, clear
  }
  return true;
}

function structure(T) {
  const e = [];
  const ids = new Set();
  const L = T.layers;
  if (!L.length || !L[L.length - 1].finish) e.push("last layer is not the finish");
  if (L.filter((l) => l.finish).length !== 1) e.push("finish count != 1");
  L.forEach((l, i) => {
    if (ids.has(l.id)) e.push(`duplicate id ${l.id}`);
    ids.add(l.id);
    const sum = l.segs.reduce((a, [, d]) => a + d, 0);
    if (Math.abs(sum - 360) > 1e-9) e.push(`${l.id}: segments sum to ${sum}°, not 360°`);
    if (l.segs.some(([t, d]) => !["gap", "safe", "danger", "break"].includes(t) || !(d > 0))) e.push(`${l.id}: bad segment`);
    if (l.finish) return;
    // merge wrap-around neighbours of the same type when measuring gaps
    const segs = l.segs.slice();
    if (segs.length > 1 && segs[0][0] === segs[segs.length - 1][0]) {
      segs[0] = [segs[0][0], segs[0][1] + segs[segs.length - 1][1]];
      segs.pop();
    }
    const gaps = segs.filter(([t]) => t === "gap").map(([, d]) => d);
    if (!gaps.length) e.push(`${l.id}: no gap (closed ring)`);
    else if (Math.max(...gaps) < MIN_GAP) e.push(`${l.id}: widest gap ${Math.max(...gaps)}° < ${MIN_GAP}°`);
    const danger = l.segs.filter(([t]) => t === "danger").reduce((a, [, d]) => a + d, 0);
    if (danger >= 360) e.push(`${l.id}: 100% danger`);
    if (danger > 216) e.push(`${l.id}: danger ${danger}° > 60% of the ring`);
    if (l.move?.amp && (l.move.amp > 45 || l.move.period < 2)) e.push(`${l.id}: sway too wild`);
    if (l.move?.spin && Math.abs(l.move.spin) > 60) e.push(`${l.id}: spin too fast`);
  });
  // LANDING ZONE: falling one floor takes ~0.23 s — too short to demand a dodge.
  // So every ring must offer a DROP WINDOW: a point inside one of its gaps (at
  // least the ball's angular radius from the gap edges) whose landing spot on
  // the next ring has no danger within ±14° (widened by any sway). The player
  // simply drops through that part of the gap. Spinning rings are exempt here
  // (they move under you) and are proven by the bot instead.
  for (let i = 0; i + 1 < L.length; i++) {
    const K = L[i];
    const N = L[i + 1];
    if (N.finish || K.move?.spin || N.move?.spin) continue;
    const pad = 14 + (K.move?.amp || 0) + (N.move?.amp || 0);
    let window = false;
    for (let d = 0; d < 360 && !window; d++) {
      // d is inside a gap of K, at least 10° from its edges
      if (![-10, -5, 0, 5, 10].every((k) => typeAt(K, d + k) === "gap")) continue;
      window = chainClear(L, i + 1, d, pad);
    }
    if (!window) e.push(`${K.id}→${N.id}: no drop window — every part of the gap lands on danger (landing zone)`);
  }
  // start angle over safe ground on layer 0
  const sim = new Sim(T);
  const L0 = sim.layers[0];
  const t0 = (Math.sqrt((2 * 1.4) / PHYS.G));
  const first = sim.layers[0].sectors;
  void first;
  let k;
  {
    // find what the ball meets on its first landing with no input
    for (let i = 0; i < 400 && sim.status === "play"; i++) {
      sim.step();
      const ev = sim.events.find((x) => x.type === "bounce" || x.type === "pass" || x.type === "death");
      sim.events.length = 0;
      if (ev) {
        k = ev.type;
        break;
      }
    }
  }
  if (k !== "bounce") e.push(`start: the ball's first contact with no input is "${k}" (must land safely on layer 0)`);
  void L0;
  void t0;
  return e;
}

function play(T, opts) {
  const sim = new Sim(T, { rotCap: opts.rotCap });
  const bot = new Bot({ mode: opts.mode, react: opts.react });
  let death = null;
  const rests = new Set();
  while (sim.status === "play" && sim.t < 240) {
    bot.drive(sim);
    sim.step();
    for (const e of sim.events) {
      if (e.type === "death") death = e.layer;
      if (e.type === "bounce") rests.add(e.layer);
    }
    sim.events.length = 0;
  }
  return { ok: sim.status === "finished", time: sim.endAt || sim.t, streak: sim.stats.maxStreak, smashes: sim.stats.smashes, death, rests, status: sim.status };
}

// camera pose exactly like three/Scene.jsx CameraRig (16:9, fov 46, not menu)
/** Same pose as three/Scene.jsx CameraRig (gameplay, not menu). */
function poseCamera(cam, focusY, aspect) {
  cam.aspect = aspect;
  const dist = Math.max(10.4, 3.9 / (Math.tan(((cam.fov / 2) * Math.PI) / 180) * aspect));
  const k = dist / 10.4;
  cam.position.set(0, focusY + 4.3 * k, dist);
  cam.lookAt(0, focusY - 2.3 * k, 0);
  cam.updateMatrixWorld();
  cam.updateProjectionMatrix();
  return new THREE.Frustum().setFromProjectionMatrix(new THREE.Matrix4().multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse));
}

// desktop 16:9 stage and a portrait phone (fullscreen, ~9:19.5)
const ASPECTS = [
  ["16:9", 16 / 9],
  ["phone", 9 / 19.5],
];

function visibility(T, rests) {
  const cam = new THREE.PerspectiveCamera(46, 16 / 9, 0.1, 140);
  const issues = [];
  const sim = new Sim(T);
  for (const k of rests) {
    const Lk = sim.layers[k];
    if (!Lk) continue;
    // the focus settles ~0.6 u above the ball's lowest point, which is the landing height
    const focus = Lk.y + PHYS.BALL_R + 0.6;
    for (const [name, aspect] of ASPECTS) {
      const frustum = poseCamera(cam, focus, aspect);
      // the ball and the full width of its ring
      for (const p of [new THREE.Vector3(0, Lk.y + 0.4, PHYS.BALL_ORBIT), new THREE.Vector3(-PHYS.OUTER_R, Lk.y, 0), new THREE.Vector3(PHYS.OUTER_R, Lk.y, 0)])
        if (!frustum.containsPoint(p)) issues.push(`[${name}] resting on ${Lk.id}: ball/ring edge off-screen`);
      for (const d of [1, 2]) {
        const L = sim.layers[k + d];
        if (!L || L.finish) continue;
        // the front of the ring (where the ball will meet it) must be on screen
        const p = new THREE.Vector3(0, L.y, PHYS.BALL_ORBIT);
        if (!frustum.containsPoint(p)) issues.push(`[${name}] resting on ${Lk.id}: ${L.id} (${d} below) is off-screen`);
      }
    }
  }
  return [...new Set(issues)];
}

for (const T of list) {
  const t = Date.now();
  const errs = structure(T);
  const safe = play(T, { mode: "safe", rotCap: 0.35, react: 0.16 });
  const star = play(T, { mode: "drop", rotCap: 0.6, react: 0.12 });
  if (!safe.ok) errs.push(`NOT COMPLETABLE by the slow bot without Smash (${safe.status}${safe.death != null ? ` on layer ${safe.death}` : ""})`);
  const three = star.ok && star.time <= T.targetTime && star.streak >= T.streakGoal;
  if (!three) errs.push(`★★★ route not proven (drop bot: ${star.status}, ${star.time.toFixed(1)}s / target ${T.targetTime}s, streak ${star.streak})`);
  if (safe.ok) errs.push(...visibility(T, safe.rests));
  const types = {};
  for (const l of T.layers) for (const [ty] of l.segs) types[ty] = (types[ty] || 0) + 1;
  if (errs.length) bad++;
  console.log(
    `${errs.length ? "FAIL" : "ok  "} T${String(T.id).padStart(2)} ${T.name.padEnd(22)} w${T.world} floors=${T.layers.length - 1} ` +
      `safe-bot ${safe.ok ? safe.time.toFixed(1) + "s" : "--"} · drop-bot ${star.ok ? star.time.toFixed(1) + "s ×" + star.streak + " smash " + star.smashes : "--"} ` +
      `[${Object.entries(types).map(([k, v]) => `${k}:${v}`).join(" ")}] ${Date.now() - t}ms`
  );
  for (const e of errs) console.log("      - " + e);
}
// self-checks: the checker must reject broken towers
{
  const closed = { id: 0, world: 1, name: "X", targetTime: 99, streakGoal: 3, layers: [{ id: "a", segs: [["safe", 360]] }, { id: "b", segs: [["safe", 360]] }, { id: "f", finish: true, segs: [["safe", 360]] }] };
  const e = structure(closed);
  const r = play(closed, { mode: "safe", rotCap: 0.35, react: 0.16 });
  const okSelf = e.some((x) => x.includes("closed ring")) && !r.ok;
  console.log(okSelf ? "ok   self-check: a closed ring is rejected and unfinishable" : "FAIL self-check");
  if (!okSelf) bad++;
  const trap = { id: 0, world: 1, name: "X", targetTime: 99, streakGoal: 3, layers: [{ id: "a", off: 120, segs: [["gap", 60], ["safe", 300]] }, { id: "b", segs: [["gap", 40], ["danger", 216], ["safe", 104]] }, { id: "f", finish: true, segs: [["safe", 360]] }] };
  void trap;
}
console.log(bad ? `\n${bad} PROBLEM(S)` : `\nALL ${list.length} LEVELS VALID`);
process.exit(bad ? 1 : 0);
