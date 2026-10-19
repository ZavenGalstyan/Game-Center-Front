/**
 * Hulk: Open World 3D — the hero's look and animation.
 *
 * Model: the skinned "hulk" build from rig.js (3.3 m), green skin with a
 * pore/vein normal map and baked muscle-crease shading (vertex colours),
 * torn purple denim, short black hair, glowing green irises.
 *
 * Animation: every action is a short KEYFRAME track of poses (rig.POSE
 * channels) sampled at the action's real sim time, layered over a
 * locomotion base (idle breathing / walk / run / sprint gait whose phase
 * advances with distance travelled, so feet don't skate). The final pose
 * is damped toward the target every frame (smooth transitions), then the
 * root is lowered by exactly how much the bent legs shorten — feet stay
 * planted on the ground instead of floating or sinking — and grounded feet
 * are kept flat.
 *
 * Modes covered: idle walk run sprint charge(super-leap crouch) jump fall
 * land punch(L/R) uppercut heavy heavyCharge ragePunch smash clap lift
 * carry carryWalk throw hurt rage(roar) dive dead.
 */
import * as THREE from "three";
import { buildRig, applyPose, zeroPose, POSE, skinNormal, denim } from "./rig.js";

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const ease = (u) => (u <= 0 ? 0 : u >= 1 ? 1 : u * u * (3 - 2 * u));

/* ---------------------------------------------------------------- poses */
const GUARD = { spRX: 0.2, chRX: 0.1, nkRX: -0.14, hdRX: -0.1, lArX: -0.4, lArZ: 0.12, lFoX: -1.55, lGrip: 1, rArX: -0.28, rArZ: 0.12, rFoX: -1.7, rGrip: 1, lThX: -0.28, lShX: 0.45, rThX: 0.16, rShX: 0.36, lThZ: 0.1, rThZ: 0.1, chRY: 0.12 };
const mirror = (p) => {
  const o = {};
  for (const [k, v] of Object.entries(p)) {
    if (k[0] === "l" && k[1] === k[1].toUpperCase()) o["r" + k.slice(1)] = v;
    else if (k[0] === "r" && k[1] === k[1].toUpperCase() && k !== "rootY" && k !== "rootX" && k !== "rootZ" && !k.startsWith("root")) o["l" + k.slice(1)] = v;
    else if (/RY$|RZ$|^hdRY$|^rootX$/.test(k)) o[k] = -v;
    else o[k] = v;
  }
  return o;
};
const P_WIND_R = { rArX: 0.55, rArZ: 0.28, rFoX: -2.0, chRY: 0.5, spRY: 0.18, lArX: -0.65, lFoX: -1.45, spRX: 0.22 };
const P_HIT_R = { rArX: -1.52, rArZ: 0.04, rArY: 0.25, rFoX: -0.08, rGrip: 1, chRY: -0.6, spRY: -0.22, spRX: 0.32, lArX: 0.15, lFoX: -1.7, lThX: -0.5, lShX: 0.6, rThX: 0.3, rShX: 0.3, hdRX: -0.2 };
const TRACKS = {
  punchR: [[0, {}], [0.11, P_WIND_R], [0.17, P_HIT_R], [0.25, P_HIT_R], [0.41, {}]],
  punchL: [[0, {}], [0.1, mirror(P_WIND_R)], [0.16, mirror(P_HIT_R)], [0.24, mirror(P_HIT_R)], [0.42, {}]],
  uppercut: [
    [0, {}],
    [0.18, { spRX: 0.5, rArX: 0.35, rArZ: 0.2, rFoX: -1.3, rootY: -0.2, lThX: -0.6, lShX: 1.0, rThX: -0.1, rShX: 0.9, chRY: 0.35 }],
    [0.26, { spRX: -0.2, chRX: -0.2, rArX: -2.5, rArZ: 0.1, rFoX: -1.15, rootY: 0.05, chRY: -0.4, hdRX: -0.3, lArX: 0.2, lFoX: -1.6 }],
    [0.36, { spRX: -0.15, chRX: -0.2, rArX: -2.5, rArZ: 0.1, rFoX: -1.1, chRY: -0.4, hdRX: -0.3 }],
    [0.66, {}],
  ],
  heavy: [
    [0, {}],
    [0.32, { rArX: 0.95, rArZ: 0.65, rFoX: -1.45, chRY: 0.9, spRY: 0.32, spRX: 0.18, lArX: -0.8, lArZ: 0.3, lFoX: -1.2, rootY: -0.12, lThX: -0.4, lShX: 0.6 }],
    [0.4, { rArX: -1.45, rArZ: 0.45, rArY: 0.55, rFoX: -0.25, chRY: -0.85, spRY: -0.35, spRX: 0.35, lArX: 0.25, lFoX: -1.6, lThX: -0.62, lShX: 0.7, rThX: 0.38 }],
    [0.52, { rArX: -1.35, rArZ: 0.4, rArY: 0.5, rFoX: -0.3, chRY: -0.8, spRY: -0.3, spRX: 0.35 }],
    [0.86, {}],
  ],
  ragePunch: [
    [0, { rArX: 1.0, rArZ: 0.35, rFoX: -2.1, chRY: 0.95, spRX: 0.25, rootY: -0.25, lThX: -0.55, lShX: 1.0, rShX: 0.8 }],
    [0.17, { rArX: 1.05, rArZ: 0.35, rFoX: -2.15, chRY: 1.0, spRX: 0.25, rootY: -0.25, lThX: -0.55, lShX: 1.0, rShX: 0.8 }],
    [0.24, { rArX: -1.6, rArZ: 0.05, rFoX: 0, chRY: -0.95, spRX: 0.5, spRY: -0.3, lArX: 0.4, lFoX: -1.5, lThX: -0.85, lShX: 0.8, rThX: 0.5, rShX: 0.25, hdRX: -0.3, jaw: 1 }],
    [0.45, { rArX: -1.55, rArZ: 0.05, rFoX: -0.05, chRY: -0.9, spRX: 0.5, lThX: -0.8, lShX: 0.8, rThX: 0.45, jaw: 1 }],
    [0.87, {}],
  ],
  heavyCharge: [[0, { rArX: 0.9, rArZ: 0.4, rFoX: -2.0, chRY: 0.85, spRY: 0.25, spRX: 0.28, rootY: -0.2, lArX: -0.7, lFoX: -1.3, lThX: -0.5, lShX: 0.9, rShX: 0.7, jaw: 0.6 }]],
  smash: [
    [0, {}],
    [0.3, { lArX: -2.95, rArX: -2.95, lArZ: 0.22, rArZ: 0.22, lFoX: -0.85, rFoX: -0.85, spRX: -0.28, chRX: -0.18, hdRX: 0.1, rootY: 0.05, lGrip: 1, rGrip: 1, jaw: 0.8 }],
    [0.42, { lArX: -1.05, rArX: -1.05, lArZ: 0.08, rArZ: 0.08, lFoX: -0.25, rFoX: -0.25, spRX: 0.95, chRX: 0.3, hdRX: -0.4, rootY: -0.55, lThX: -1.05, rThX: -1.05, lShX: 1.55, rShX: 1.55, lThZ: 0.3, rThZ: 0.3, jaw: 1 }],
    [0.62, { lArX: -1.0, rArX: -1.0, lFoX: -0.25, rFoX: -0.25, spRX: 0.95, chRX: 0.3, hdRX: -0.4, rootY: -0.55, lThX: -1.05, rThX: -1.05, lShX: 1.55, rShX: 1.55, lThZ: 0.3, rThZ: 0.3 }],
    [0.92, {}],
  ],
  clap: [
    [0, {}],
    [0.26, { lArZ: 1.4, rArZ: 1.4, lArX: -0.95, rArX: -0.95, lFoX: -0.2, rFoX: -0.2, lGrip: -0.4, rGrip: -0.4, chRX: -0.25, spRX: -0.05, jaw: 0.6 }],
    [0.36, { lArZ: -0.05, rArZ: -0.05, lArX: -1.45, rArX: -1.45, lArY: -0.35, rArY: -0.35, lFoX: -0.15, rFoX: -0.15, lGrip: -0.4, rGrip: -0.4, spRX: 0.35, chRX: 0.1, lThX: -0.5, lShX: 0.7, jaw: 1 }],
    [0.55, { lArZ: -0.05, rArZ: -0.05, lArX: -1.45, rArX: -1.45, lArY: -0.35, rArY: -0.35, lFoX: -0.15, rFoX: -0.15, lGrip: -0.4, rGrip: -0.4, spRX: 0.35 }],
    [0.81, {}],
  ],
  lift: [
    [0, {}],
    [0.26, { spRX: 0.75, chRX: 0.1, lThX: -1.0, rThX: -1.0, lShX: 1.5, rShX: 1.5, lThZ: 0.25, rThZ: 0.25, lArX: -1.05, rArX: -1.05, lArZ: 0.42, rArZ: 0.42, lFoX: -0.35, rFoX: -0.35, lGrip: -0.2, rGrip: -0.2, rootY: -0.1 }],
    [0.6, { spRX: -0.08, lArX: -2.9, rArX: -2.9, lArZ: 0.4, rArZ: 0.4, lFoX: -0.55, rFoX: -0.55, lGrip: 0.4, rGrip: 0.4, lThX: -0.1, rThX: -0.1, lShX: 0.25, rShX: 0.25, jaw: 0.7 }],
  ],
  throw: [
    [0, { lArX: -2.9, rArX: -2.9, lArZ: 0.38, rArZ: 0.38, lFoX: -0.55, rFoX: -0.55 }],
    [0.16, { lArX: -3.35, rArX: -3.35, lArZ: 0.35, rArZ: 0.35, lFoX: -0.7, rFoX: -0.7, spRX: -0.35, chRX: -0.25, rThX: 0.35, lThX: -0.45, lShX: 0.6 }],
    [0.24, { lArX: -1.25, rArX: -1.25, lArZ: 0.2, rArZ: 0.2, lFoX: -0.2, rFoX: -0.2, spRX: 0.55, chRX: 0.2, lThX: -0.6, lShX: 0.7, rThX: 0.4, jaw: 1 }],
    [0.5, {}],
  ],
  hurt: [[0, {}], [0.08, { spRX: -0.25, chRX: -0.25, hdRX: -0.35, lArZ: 0.55, rArZ: 0.55, lArX: 0.2, rArX: 0.2, rootY: -0.05, jaw: 0.8 }], [0.3, {}]],
  rage: [
    [0, {}],
    [0.32, { lArX: -0.8, rArX: -0.8, lArZ: 0.45, rArZ: 0.45, lFoX: -2.25, rFoX: -2.25, spRX: 0.55, chRX: 0.2, rootY: -0.2, lThX: -0.6, rThX: -0.6, lShX: 0.95, rShX: 0.95, lThZ: 0.2, rThZ: 0.2 }],
    [0.42, { lArX: 0.45, rArX: 0.45, lArZ: 1.15, rArZ: 1.15, lFoX: -0.95, rFoX: -0.95, chRX: -0.38, spRX: -0.18, hdRX: -0.5, nkRX: -0.2, rootY: -0.12, jaw: 1, lThZ: 0.25, rThZ: 0.25, lThX: -0.35, lShX: 0.5, rThX: -0.35, rShX: 0.5 }],
    [0.8, { lArX: 0.45, rArX: 0.45, lArZ: 1.15, rArZ: 1.15, lFoX: -0.95, rFoX: -0.95, chRX: -0.38, spRX: -0.18, hdRX: -0.5, nkRX: -0.2, jaw: 1, lThZ: 0.25, rThZ: 0.25 }],
    [0.9, {}],
  ],
  land: [[0, { spRX: 0.75, chRX: 0.2, lThX: -1.1, rThX: -0.75, lShX: 1.6, rShX: 1.75, lThZ: 0.28, rThZ: 0.28, rArX: -0.75, rArZ: 0.18, rFoX: -0.15, lArX: -0.1, lArZ: 0.75, lFoX: -0.8, hdRX: -0.55, jaw: 0.7 }]],
  dive: [[0, { lArX: -2.95, rArX: -2.95, lArZ: 0.08, rArZ: 0.08, lFoX: -0.25, rFoX: -0.25, spRX: 0.65, chRX: 0.2, hdRX: -0.5, lThX: 0.35, rThX: 0.5, lShX: 0.9, rShX: 1.0, jaw: 1 }]],
  charge: [[0, { spRX: 0.6, chRX: 0.15, lThX: -1.05, rThX: -1.05, lShX: 1.75, rShX: 1.75, lThZ: 0.32, rThZ: 0.32, lArX: 0.7, rArX: 0.7, lArZ: 0.35, rArZ: 0.35, lFoX: -0.6, rFoX: -0.6, hdRX: -0.55, jaw: 0.4 }]],
};
const TRACK_OF = { jab1: "punchR", jab2: "punchL", jab3: "uppercut", heavy: "heavy", ragePunch: "ragePunch", smash: "smash", clap: "clap", lift: "lift", throw: "throw", hurt: "hurt", roar: "rage", landing: "land", dive: "dive" };

function sampleTrack(track, t, out) {
  // keyframes are deltas from GUARD (missing channels = guard)
  let a = track[0];
  let b = track[track.length - 1];
  for (let i = 0; i < track.length - 1; i++) {
    if (t >= track[i][0] && t <= track[i + 1][0]) {
      a = track[i];
      b = track[i + 1];
      break;
    }
  }
  const u = b[0] > a[0] ? ease((t - a[0]) / (b[0] - a[0])) : 1;
  const tt = t >= b[0] ? 1 : u;
  for (const k of POSE) {
    const va = a[1][k] ?? GUARD[k] ?? 0;
    const vb = b[1][k] ?? GUARD[k] ?? 0;
    out[k] = va + (vb - va) * tt;
  }
  return out;
}

/* ---------------------------------------------------------------- locomotion */
function locomotion(p, ph, speed, t, carry, breathe) {
  for (const k of POSE) p[k] = 0;
  const run = clamp((speed - 3) / 7, 0, 1);
  const sprint = clamp((speed - 11) / 7, 0, 1);
  if (speed < 0.6) {
    // idle: heavy breathing, hunched, fists clenched
    const b = Math.sin(t * 1.7) * breathe;
    Object.assign(p, { spRX: 0.16 + b * 0.025, chRX: 0.06 - b * 0.03, nkRX: -0.1, hdRX: -0.05 + Math.sin(t * 0.37) * 0.04, hdRY: Math.sin(t * 0.23) * 0.12, lArX: -0.08, rArX: -0.06, lArZ: 0.12 + b * 0.02, rArZ: 0.12 + b * 0.02, lFoX: -0.5, rFoX: -0.45, lGrip: 0.85, rGrip: 0.8, lThZ: 0.13, rThZ: 0.13, lThX: -0.14, rThX: -0.06, lShX: 0.26, rShX: 0.18, lClZ: b * 0.04, rClZ: b * 0.04, jaw: 0.15 + b * 0.1 });
    if (carry) Object.assign(p, { lArX: -2.85, rArX: -2.85, lArZ: 0.4, rArZ: 0.4, lFoX: -0.55, rFoX: -0.55, lGrip: 0.4, rGrip: 0.4, spRX: 0.05, hdRX: -0.25 });
    return p;
  }
  const s = Math.sin(ph);
  const c = Math.cos(ph);
  const amp = 0.42 + run * 0.35 + sprint * 0.2;
  p.lThX = s * amp - 0.08;
  p.rThX = -s * amp - 0.08;
  p.lShX = Math.max(0.08, -c * (0.45 + run * 0.6) + 0.35 + run * 0.35);
  p.rShX = Math.max(0.08, c * (0.45 + run * 0.6) + 0.35 + run * 0.35);
  p.lThZ = 0.1;
  p.rThZ = 0.1;
  p.rootY = Math.abs(c) * (0.04 + run * 0.08) - (0.02 + run * 0.06);
  p.rootRZ = s * 0.05 * (1 - sprint * 0.5);
  p.spRX = 0.16 + run * 0.18 + sprint * 0.32;
  p.chRY = s * (0.14 + run * 0.12);
  p.spRY = -s * 0.06;
  p.nkRX = -0.12 - sprint * 0.15;
  p.hdRX = -0.08 - run * 0.1 - sprint * 0.2;
  const arm = 0.35 + run * 0.5 + sprint * 0.35;
  if (!carry) {
    p.lArX = -s * arm - 0.1 * run;
    p.rArX = s * arm - 0.1 * run;
    p.lArZ = 0.12 + run * 0.08;
    p.rArZ = 0.12 + run * 0.08;
    p.lFoX = -0.45 - run * 0.85 - Math.max(0, -s) * 0.3;
    p.rFoX = -0.45 - run * 0.85 - Math.max(0, s) * 0.3;
    p.lGrip = 0.8;
    p.rGrip = 0.8;
  } else {
    Object.assign(p, { lArX: -2.85, rArX: -2.85, lArZ: 0.4, rArZ: 0.4, lFoX: -0.55, rFoX: -0.55, lGrip: 0.4, rGrip: 0.4, spRX: 0.05 });
  }
  p.jaw = run * 0.3 + sprint * 0.3;
  return p;
}

/* ---------------------------------------------------------------- model */
export function createHeroModel({ shadows = true } = {}) {
  const skin = new THREE.MeshStandardMaterial({ color: "#4c8a2c", envMapIntensity: 0.55, roughness: 0.55, metalness: 0.0, vertexColors: true, normalMap: skinNormal(), normalScale: new THREE.Vector2(0.55, 0.55), emissive: "#0e3d06", emissiveIntensity: 0.0 });
  const skinDark = new THREE.MeshStandardMaterial({ color: "#335e1d", roughness: 0.6, envMapIntensity: 0.5 });
  const plain = new THREE.MeshStandardMaterial({ color: "#4a862b", envMapIntensity: 0.55, roughness: 0.58, normalMap: skin.normalMap, normalScale: new THREE.Vector2(0.4, 0.4) });
  const pants = new THREE.MeshStandardMaterial({ color: "#ffffff", map: denim("#5b2d8a"), roughness: 0.9, vertexColors: true, side: THREE.DoubleSide });
  const hair = new THREE.MeshStandardMaterial({ color: "#14110f", roughness: 0.75 });
  const rig = buildRig({ build: "hulk", mats: { skin, bottom: pants, hair, skinDark, head: skin, plain }, outfit: "hulk", shadows });
  const group = new THREE.Group();
  group.add(rig.root);
  const cur = zeroPose();
  Object.assign(cur, GUARD);
  const target = zeroPose();
  const S = { ph: 0, t: 0, lastMode: "", shake: 0, rageGlow: 0 };
  const P = rig.P;

  function legDrop(c) {
    // how much each leg is shortened by its bends (thigh pitch + knee + spread)
    const L = (thx, shx, thz) => {
      const a = thx;
      const b = thx + shx;
      return (P.thigh * Math.cos(a) + (P.shin + 0.1) * Math.cos(b)) * Math.cos(thz);
    };
    const rest = P.thigh + P.shin + 0.1;
    const l = L(c.lThX + c.hipRX, c.lShX, c.lThZ);
    const r = L(c.rThX + c.hipRX, c.rShX, c.rThZ);
    return Math.max(l, r) - rest;
  }

  /** hero = sim hero record; dt = frame dt */
  function update(hero, dt, time) {
    S.t += dt;
    const a = hero.anim;
    const mode = a.mode;
    const act = hero.act;
    let rate = 14;
    // base: locomotion (also under carry / non-strike modes)
    locomotion(target, S.ph, hero.speed, S.t, !!hero.carry, 1);
    const stride = 2.6 + clamp(hero.speed / 19, 0, 1) * 3.2;
    if (hero.grounded) S.ph += (hero.speed / stride) * Math.PI * dt;
    const trackName = act ? TRACK_OF[act.kind] : null;
    if (trackName && TRACKS[trackName]) {
      sampleTrack(TRACKS[trackName], act.kind === "landing" ? 0 : act.t, target);
      rate = act.kind.startsWith("jab") ? 34 : act.kind === "landing" ? 20 : 24;
      if (hero.carry && act.kind === "landing") Object.assign(target, { lArX: -2.85, rArX: -2.85, lArZ: 0.4, rArZ: 0.4, lFoX: -0.55, rFoX: -0.55 });
    } else if (mode === "charge") {
      sampleTrack(TRACKS.charge, 0, target);
      const k = a.charge;
      target.rootY = -0.15 - k * 0.25;
      target.spRX += k * 0.15;
      S.shake = k;
      rate = 10;
    } else if (mode === "heavyCharge") {
      sampleTrack(TRACKS.heavyCharge, 0, target);
      S.shake = a.heavy;
      rate = 12;
    } else if (mode === "jump" || mode === "fall") {
      const fall = clamp((-hero.vy + 4) / 22, 0, 1);
      Object.assign(target, {
        spRX: 0.25 - fall * 0.2,
        chRX: -0.1,
        hdRX: -0.2 + fall * 0.25,
        lThX: -1.05 + fall * 0.65,
        rThX: -0.3 + fall * 0.35,
        lShX: 1.35 - fall * 0.7,
        rShX: 0.7 - fall * 0.2,
        lArX: -0.4 - fall * 0.3,
        rArX: 0.35 - fall * 0.9,
        lArZ: 0.5 + fall * 0.75,
        rArZ: 0.5 + fall * 0.75,
        lFoX: -0.8 + fall * 0.4,
        rFoX: -0.8 + fall * 0.4,
        lGrip: 1,
        rGrip: 1,
        lFtX: 0.35,
        rFtX: 0.35,
        jaw: 0.5,
      });
      if (hero.carry) Object.assign(target, { lArX: -2.85, rArX: -2.85, lArZ: 0.4, rArZ: 0.4, lFoX: -0.55, rFoX: -0.55 });
      rate = 7;
    } else if (mode === "dead") {
      const u = clamp(hero.deadT / 1.2, 0, 1);
      Object.assign(target, { spRX: 0.4 + u * 0.6, chRX: 0.3, hdRX: 0.4, lThX: -1.2 * u, rThX: -1.0 * u, lShX: 2.0 * u, rShX: 2.0 * u, lArZ: 0.4, rArZ: 0.5, lFoX: -0.4, rFoX: -0.3, rootRX: u * 1.15, rootY: -0.4 * u });
      rate = 5;
    }
    if (hero.raging) target.jaw = Math.max(target.jaw, 0.6);
    blendPose(cur, target, rate, dt);
    // keep the root at a height where the bent legs still reach the ground
    const air = !hero.grounded;
    const drop = legDrop(cur);
    const out = { ...cur };
    out.rootY = cur.rootY + (air ? 0 : drop);
    if (!air && mode !== "dead") {
      out.lFtX = -(cur.rootRX + cur.hipRX + cur.lThX + cur.lShX) + cur.lFtX * 0;
      out.rFtX = -(cur.rootRX + cur.hipRX + cur.rThX + cur.rShX);
    }
    // charge tremble
    if (S.shake > 0 && (mode === "charge" || mode === "heavyCharge")) {
      const k = S.shake * 0.02;
      out.rootX = Math.sin(S.t * 61) * k;
      out.chRZ = Math.sin(S.t * 47) * k * 2;
    } else S.shake = 0;
    applyPose(rig, out);
    // rage glow: pulsing emissive skin + brighter eyes
    S.rageGlow += ((hero.raging ? 1 : 0) - S.rageGlow) * Math.min(1, dt * 4);
    skin.emissiveIntensity = S.rageGlow * (0.55 + 0.25 * Math.sin(time * 9));
    skin.emissive.setRGB(0.06 + S.rageGlow * 0.12, 0.3, 0.02);
    if (rig.irisMat) rig.irisMat.emissiveIntensity = 0.6 + S.rageGlow * 1.6;
  }
  const blendPose = (c, t2, rate, dt) => {
    const k = 1 - Math.exp(-rate * dt);
    for (const key of POSE) c[key] += ((t2[key] || 0) - c[key]) * k;
  };

  return {
    group,
    rig,
    update,
    handR: rig.bones.handR,
    handL: rig.bones.handL,
    dispose() {
      rig.geos.forEach((g) => g.dispose());
      skin.dispose();
      skinDark.dispose();
      plain.dispose();
      pants.dispose();
      hair.dispose();
    },
  };
}
