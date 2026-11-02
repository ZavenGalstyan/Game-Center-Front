/**
 * Bakes every authored clip on both bodies (Node, no GPU) and checks:
 *  • every clip bakes, no NaN in any track
 *  • planted feet never sink through the floor; nothing floats while standing
 *  • at each attack's impact frame the striking fist / foot is extended toward
 *    the opponent, at the height band the engine tests, and its forward reach
 *    is consistent with the engine's `reach` (centre-to-centre contact distance)
 *   node src/components/games/IronFist/tools/clipTest.mjs
 */
import * as THREE from "three";
import { loadNodeAssets } from "./nodeAssets.mjs";
import { buildClips, MOVE_CLIP } from "../render/clips.js";
import { MOVES } from "../engine/moves.js";

let pass = 0;
let fail = 0;
const ok = (c, msg) => (c ? pass++ : (fail++, console.log("  FAIL:", msg)));
const A = await loadNodeAssets();
const STRIKER = { jab: "hand_l", cross: "hand_r", uppercut: "hand_r", lowKick: "foot_r", midKick: "foot_r", roundhouse: "foot_r", jumpKick: "foot_l", dragonWave: "hand_l", infernoKick: "foot_r", quakeSlam: "hand_l", lightningRush: "hand_l", shadowStep: "hand_r", thunderStrike: "hand_r" };
const rows = [];
for (const body of ["m", "f"]) {
  const scene = A.bodies[body].scene;
  const t0 = performance.now();
  const clips = buildClips(scene);
  console.log(`${body}: ${Object.keys(clips).length} clips baked in ${Math.round(performance.now() - t0)} ms`);
  const B = {};
  scene.traverse((o) => o.isBone && (B[o.name] = o));
  const mixer = new THREE.AnimationMixer(scene);
  const pose = (clip, t) => {
    mixer.stopAllAction();
    const a = mixer.clipAction(clip);
    a.reset().play();
    a.paused = false;
    a.time = Math.min(t, clip.duration);
    a.setEffectiveWeight(1);
    mixer.update(0);
    scene.updateMatrixWorld(true);
  };
  const wp = (n) => B[n].getWorldPosition(new THREE.Vector3());
  for (const [name, clip] of Object.entries(clips)) {
    let nan = false;
    for (const tr of clip.tracks) for (const v of tr.values) if (!Number.isFinite(v)) nan = true;
    ok(!nan, `${body}/${name} has finite tracks`);
    // floor contact (ankle bone sits ~0.07-0.09 m above the sole)
    const lying = /Fall|Down|KOLie|GetUp/.test(name);
    let minAnkle = Infinity;
    let minHead = Infinity;
    for (let t = 0; t <= clip.duration + 1e-6; t += 1 / 30) {
      pose(clip, t);
      minAnkle = Math.min(minAnkle, wp("foot_l").y, wp("foot_r").y);
      minHead = Math.min(minHead, wp("Head").y);
    }
    ok(minAnkle > 0.035, `${body}/${name} feet stay above the floor (min ankle ${minAnkle.toFixed(3)})`);
    if (!lying && !/Jump/.test(name)) ok(minAnkle < 0.105 || /Kick|Slam|Rush|Wave|Strike|Step|Land|Upper/.test(name), `${body}/${name} stays grounded (${minAnkle.toFixed(3)})`);
    if (lying) ok(minHead > 0.03, `${body}/${name} head above floor (${minHead.toFixed(3)})`);
  }
  // impact frames
  for (const [id, clipName] of Object.entries(MOVE_CLIP)) {
    const mv = MOVES[id];
    const clip = clips[clipName];
    pose(clip, mv.startup + mv.active * 0.5);
    const p = wp(STRIKER[id]);
    // the tip of a fist / foot is ~0.09 m beyond the wrist / ankle bone
    const tip = p.z + 0.09;
    rows.push(`${body} ${id.padEnd(14)} tip z ${tip.toFixed(2)}  y ${p.y.toFixed(2)}  band ${mv.band.join("-")}  reach ${mv.reach}`);
    if (mv.type === "projectile" || mv.type === "bolt" || mv.type === "slam") continue;
    ok(tip > 0.45, `${body}/${id} strike extends forward (${tip.toFixed(2)})`);
    ok(p.y >= mv.band[0] - 0.12 && p.y <= mv.band[1] + 0.12, `${body}/${id} strike height ${p.y.toFixed(2)} inside band ${mv.band}`);
    // engine contact distance = visual tip + the target's half body depth (~0.15) ± slack
    ok(Math.abs(tip + 0.15 - mv.reach) < 0.16, `${body}/${id} visual reach ${(tip + 0.15).toFixed(2)} ≈ engine reach ${mv.reach}`);
  }
}
console.log(rows.join("\n"));
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
