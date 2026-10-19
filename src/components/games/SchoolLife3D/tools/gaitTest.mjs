/**
 * Headless locomotion checks for the character rigs (real GLB assets + clips).
 *   node src/components/games/SchoolLife3D/tools/gaitTest.mjs
 * Bundles models.js with esbuild, serves /public through a fetch shim, then
 * drives animateRig() like world.js does and measures the legs: feet attached
 * to the ankles, soles on the ground, planted-foot slip, knees bending forward,
 * alternating steps, stride reach, walk↔run blending and stair following.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath, pathToFileURL } from "url";
import * as esbuild from "esbuild";
import * as THREE from "three";

const here = path.dirname(fileURLToPath(import.meta.url));
const pub = path.resolve(here, "../../../../../public");
globalThis.self = globalThis;
globalThis.ProgressEvent ??= class extends Event { constructor(t, o = {}) { super(t); Object.assign(this, o); } };
globalThis.fetch = async (req) => {
  const u = new URL(typeof req === "string" ? req : req.url);
  const buf = fs.readFileSync(path.join(pub, decodeURIComponent(u.pathname)));
  return new Response(buf, { status: 200 });
};
const out = path.join(here, ".gait-bundle.mjs");
await esbuild.build({
  entryPoints: [path.join(here, "../models.js")],
  bundle: true,
  format: "esm",
  platform: "node",
  external: ["three", "three/*"],
  define: { "import.meta.env.BASE_URL": '"http://local/"' },
  outfile: out,
  logLevel: "error",
});
const M = await import(pathToFileURL(out).href);
fs.unlinkSync(out);
await M.loadCharacterAssets();

let pass = 0;
let fail = 0;
const ok = (c, msg) => {
  if (c) pass++;
  else {
    fail++;
    console.log("  ✗", msg);
  }
};
const DT = 1 / 60;
const base = { name: "T", skin: 1, hairStyle: "short", hairColor: "brown", eyes: 0, outfit: "uniform", bottom: "pants", build: 1, acc: { face: "none", head: "none", back: "none", neck: "none", chest: "none" } };
const LOOKS = [
  ["boy uniform", { body: "m" }],
  ["boy sporty shorts heavy", { body: "m", outfit: "sporty", bottom: "shorts", build: 2 }],
  ["boy casual slim", { body: "m", outfit: "casual", build: 0 }],
  ["girl skirt", { body: "f", outfit: "casual", bottom: "skirt", hairStyle: "long" }],
  ["girl uniform heavy", { body: "f", build: 2 }],
  ["teacher m", { body: "m", adult: true, outfit: "teacherA" }],
  ["teacher f", { body: "f", adult: true, outfit: "teacherB" }],
];

const toeLen = 0.225;
const heelLen = 0.063;
/** World-space ankle, toe tip, heel and shin-tail of one side. */
function footPts(rig, s) {
  rig.root.updateMatrixWorld(true);
  const ft = rig.bones[`Foot${s}`];
  const ll = rig.bones[`LowerLeg${s}`];
  const ankle = new THREE.Vector3().setFromMatrixPosition(ft.matrixWorld);
  const shinTail = new THREE.Vector3(0, rig.base === "m" ? 0.511 : 0.535, 0).applyMatrix4(ll.matrixWorld);
  // the foot bone points along its +Y towards the toes, −Z is its up (bind: +Y → forward, −Z → up)
  const fw = new THREE.Vector3(0, 1, 0).transformDirection(ft.matrixWorld);
  const up = new THREE.Vector3(0, 0, -1).transformDirection(ft.matrixWorld);
  const toe = ankle.clone().addScaledVector(fw, toeLen * rig.body.scale.z);
  const heel = ankle.clone().addScaledVector(fw, -heelLen * rig.body.scale.z).addScaledVector(up, -0.023 * rig.body.scale.y);
  const sole = Math.min(toe.y, heel.y, ankle.y - 0.023 * rig.body.scale.y);
  // knee direction: knee point relative to the hip→ankle line, in character forward (root +z)
  const hip = new THREE.Vector3().setFromMatrixPosition(rig.bones[`UpperLeg${s}`].matrixWorld);
  const knee = new THREE.Vector3().setFromMatrixPosition(ll.matrixWorld);
  const fwdC = new THREE.Vector3(0, 0, 1).applyQuaternion(rig.root.quaternion);
  const line = ankle.clone().sub(hip).normalize();
  const kOff = knee.clone().sub(hip);
  kOff.addScaledVector(line, -kOff.dot(line));
  return { ankle, shinTail, toe, heel, sole, fw, kneeFwd: kOff.dot(fwdC), kneeBend: kOff.length() };
}

function make(look) {
  const rig = M.buildCharacter({ ...base, ...look });
  if (!rig.ready) throw new Error("rig not ready");
  return rig;
}

/** Move a rig along +z at speed sp(t) for `secs`; collect per-frame samples. */
function drive(rig, spFn, secs, { yawFn, ground, feet, t0 = 0, x0 = 0 } = {}) {
  const fg = feet || ground;
  const st = { x: x0, z: 0, yaw: 0, t: t0 };
  const S = [];
  for (let i = 0; i < secs / DT; i++) {
    const sp = spFn(st.t);
    st.yaw = yawFn ? yawFn(st.t) : 0;
    st.x += Math.sin(st.yaw) * sp * DT;
    st.z += Math.cos(st.yaw) * sp * DT;
    const gy = ground ? ground(st.x, st.z) : 0;
    rig.root.position.set(st.x, gy, st.z);
    rig.root.rotation.y = st.yaw;
    M.animateRig(rig, { pose: "stand", speed: sp, t: st.t, seed: 1, ground: fg ? (x, z) => fg(x, z) : null }, DT);
    S.push({ t: st.t, sp, L: footPts(rig, "L"), R: footPts(rig, "R"), gy, ground });
    st.t += DT;
  }
  return S;
}

/** Planted-foot slip (m/s) and ground contact while moving at a steady speed. */
function analyse(S, ground) {
  const slip = [];
  let minSole = 9;
  let maxStanceSole = -9;
  let detach = 0;
  let kneeBack = 0;
  let lowSide = [];
  for (let i = 1; i < S.length; i++) {
    for (const s of ["L", "R"]) {
      const a = S[i][s];
      const b = S[i - 1][s];
      const g = ground ? ground(a.ankle.x, a.ankle.z) : 0;
      detach = Math.max(detach, a.ankle.distanceTo(a.shinTail));
      minSole = Math.min(minSole, a.sole - g);
      if (a.kneeBend > 0.02 && a.kneeFwd < -0.01) kneeBack++;
      // planted = foot flat on the ground; slip = how fast it moves over the ground meanwhile
      if (a.sole - g < 0.01 && b.sole - g < 0.01 && Math.abs(a.fw.y) < 0.06 && Math.abs(b.fw.y) < 0.06) {
        slip.push(Math.hypot(a.ankle.x - b.ankle.x, a.ankle.z - b.ankle.z) / DT);
        maxStanceSole = Math.max(maxStanceSole, a.sole - g);
      }
    }
    lowSide.push(S[i].L.ankle.y < S[i].R.ankle.y ? "L" : "R");
  }
  slip.sort((a, b) => a - b);
  let switches = 0;
  for (let i = 1; i < lowSide.length; i++) if (lowSide[i] !== lowSide[i - 1]) switches++;
  return { slip50: slip[slip.length >> 1] ?? 0, slip90: slip[Math.floor(slip.length * 0.9)] ?? 0, planted: slip.length / (2 * S.length), minSole, maxStanceSole, detach, kneeBack, switches };
}

const fmt = (o) => Object.entries(o).map(([k, v]) => `${k}=${typeof v === "number" ? v.toFixed(3) : v}`).join(" ");

for (const [name, look] of LOOKS) {
  console.log(`· ${name}`);
  const rig = make(look);
  // standing
  let S = drive(rig, () => 0, 2);
  let R = analyse(S.slice(60));
  console.log("   stand ", fmt(R));
  ok(R.detach < 1e-3, `${name} stand: feet detached ${R.detach}`);
  ok(R.minSole > -0.012 && R.minSole < 0.012, `${name} stand: sole height ${R.minSole}`);
  const st = S[S.length - 1];
  ok(Math.abs(st.L.ankle.z - st.R.ankle.z) < 0.15, `${name} stand: feet staggered ${(st.L.ankle.z - st.R.ankle.z).toFixed(3)}`);
  ok(st.L.ankle.x - st.R.ankle.x > 0.12, `${name} stand: feet crossed / overlapping (L.x-R.x=${(st.L.ankle.x - st.R.ankle.x).toFixed(3)})`);
  ok(st.L.fw.z > 0.9 && st.R.fw.z > 0.9, `${name} stand: toes not forward ${st.L.fw.z.toFixed(2)} ${st.R.fw.z.toFixed(2)}`);
  for (const sp of [1.6, 3.0, 4.2, 5.8]) {
    S = drive(rig, () => sp, 4);
    R = analyse(S.slice(90));
    console.log(`   v=${sp}`.padEnd(9), fmt(R));
    ok(R.detach < 1e-3, `${name} v=${sp}: feet detached ${R.detach}`);
    ok(R.slip50 < 0.12 * sp + 0.05, `${name} v=${sp}: planted foot slides ${R.slip50.toFixed(2)} m/s`);
    ok(R.minSole > -0.03, `${name} v=${sp}: foot sinks ${R.minSole.toFixed(3)}`);
    ok(R.kneeBack === 0, `${name} v=${sp}: knee bent backwards in ${R.kneeBack} samples`);
    ok(R.planted > 0.1, `${name} v=${sp}: feet barely touch the ground (${R.planted.toFixed(2)})`);
    const cyc = (S.length - 90) * DT;
    ok(R.switches >= cyc * 1.5 && R.switches <= cyc * 12, `${name} v=${sp}: steps don't alternate (${R.switches} switches)`);
    // toes point along travel during stance
    const fwOk = S.slice(90).every((x) => ["L", "R"].every((s) => x[s].sole > 0.01 || Math.abs(x[s].fw.y) > 0.15 || x[s].fw.z > 0.9));
    ok(fwOk, `${name} v=${sp}: planted foot not pointing forward`);
  }
  // accelerate walk→run→stop, then turning while walking
  S = drive(rig, (t) => (t < 1 ? 3 : t < 3 ? 3 + (t - 1) * 1.4 : t < 4 ? 5.8 : Math.max(0, 5.8 - (t - 4) * 8)), 6);
  R = analyse(S);
  ok(R.detach < 1e-3 && R.kneeBack === 0 && R.minSole > -0.03, `${name} accel/stop: ${fmt(R)}`);
  const end = S[S.length - 1];
  ok(Math.abs(end.L.sole) < 0.015 && Math.abs(end.R.sole) < 0.015, `${name} after stop both feet down ${end.L.sole.toFixed(3)} ${end.R.sole.toFixed(3)}`);
  S = drive(rig, () => 2.4, 4, { yawFn: (t) => Math.sin(t * 1.5) * 1.8 });
  R = analyse(S);
  ok(R.detach < 1e-3 && R.kneeBack === 0 && R.minSole > -0.03, `${name} walk+turn: ${fmt(R)}`);
  // stairs: ramp rising 0.6 per metre along x; walk across it sideways-on (feet at different heights) and up it
  // the school stairs: a 2.1 m / 6.5 m ramp for movement, drawn as 13 steps the feet stand on
  const ramp = (x, z) => Math.min(1, Math.max(0, (z - 2) / 6.5)) * 2.1;
  const treads = (x, z) => (z < 2 || z > 8.5 ? ramp(x, z) : Math.min(13, Math.floor(((z - 2) / 6.5) * 13) + 1) * (2.1 / 13));
  S = drive(rig, () => 1.6, 5, { ground: ramp, feet: treads });
  R = analyse(S.slice(60), treads);
  console.log("   stairs ", fmt(R));
  ok(R.detach < 1e-3 && R.minSole > -0.03 && R.kneeBack === 0, `${name} stairs: ${fmt(R)}`);
  const side = (x) => (x > 0 ? 0.12 : 0);
  S = drive(rig, () => 0, 1.5, { ground: (x) => side(x) });
  const sd = S[S.length - 1];
  ok(Math.abs(sd.L.sole - 0.12) < 0.02 && Math.abs(sd.R.sole) < 0.02, `${name} standing on a step edge: L ${sd.L.sole.toFixed(3)} R ${sd.R.sole.toFixed(3)}`);
  // sitting: feet still on the ankles
  for (let i = 0; i < 60; i++) M.animateRig(rig, { pose: "sitClass", speed: 0, t: i * DT, seed: 1 }, DT);
  const sL = footPts(rig, "L");
  ok(sL.ankle.distanceTo(sL.shinTail) < 1e-3, `${name} sitting: feet detached`);
  M.disposeRig(rig);
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
