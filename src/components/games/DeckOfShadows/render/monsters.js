/**
 * The eight humanoid monsters. Each starts from a CC0 Quaternius base body
 * (7k-vertex anatomical mesh, 65-bone UE skeleton) driven by the CC0
 * Quaternius animation library, and is then re-sculpted and dressed:
 *   - sculpt(): per-bone radial reshaping baked into the bind pose
 *     (emaciated ghoul, hulking demon/guardian), optional cloth masks
 *   - anatomical bone geometry laid along the rig (skeleton, reaper hands)
 *   - rigid armour plates / horns / wings / weapons parented to bones
 *   - CC0 scanned skull (Khronos) and Poly Haven weapons/shield
 *   - creature shader (render/materials.js): micro relief, veins, rot,
 *     lava cracks, rim light, hit flash, dissolve death
 * The Animator layers procedural motion over the clips: breathing, head
 * tracking toward the camera, posture, hit recoil, hover, and slowed
 * anticipation before every strike. The Shadow Wolf lives in wolf.js.
 */
import * as THREE from "three";
import { clone as skClone } from "three/examples/jsm/utils/SkeletonUtils.js";
import { creatureMaterial, creatureUniforms, eyeMaterial, softSprite } from "./materials.js";
import { loadProp, fitProp, pbrMaps } from "./assets.js";
import * as G from "./geo.js";

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const UP = V(0, 1, 0);
const FWD = V(0, 0, 1);

const CHILD = {
  pelvis: "spine_01",
  spine_01: "spine_02",
  spine_02: "spine_03",
  spine_03: "neck_01",
  neck_01: "Head",
};
for (const s of ["l", "r"]) {
  Object.assign(CHILD, {
    [`clavicle_${s}`]: `upperarm_${s}`,
    [`upperarm_${s}`]: `lowerarm_${s}`,
    [`lowerarm_${s}`]: `hand_${s}`,
    [`hand_${s}`]: `middle_01_${s}`,
    [`thigh_${s}`]: `calf_${s}`,
    [`calf_${s}`]: `foot_${s}`,
    [`foot_${s}`]: `ball_${s}`,
    [`ball_${s}`]: `ball_leaf_${s}`,
  });
  for (const f of ["index", "middle", "ring", "pinky", "thumb"]) {
    CHILD[`${f}_01_${s}`] = `${f}_02_${s}`;
    CHILD[`${f}_02_${s}`] = `${f}_03_${s}`;
    CHILD[`${f}_03_${s}`] = `${f}_04_leaf_${s}`;
  }
}

/* Clip choice per action + where in the clip the blow lands (fraction). */
const IMPACT = { SlashA: 0.5, SlashB: 0.5, SlashC: 0.32, BladeHeavy: 0.48, Overhand: 0.47, Hook: 0.5, LHook: 0.5, Cast: 0.62, Throw: 0.5, Consume: 0.55, Block: 0.35, ShieldBash: 0.45, CastIdle: 0.45, Cross: 0.45, Jab: 0.45, Push: 0.4 };

/* ======================================================================== Rig */
class Rig {
  constructor(gltf, clips, female) {
    this.female = female;
    this.root = new THREE.Group();
    this.scene = skClone(gltf.scene);
    this.root.add(this.scene);
    this.bones = {};
    this.hair = [];
    this.scene.traverse((o) => {
      if (o.isBone) this.bones[o.name] = o;
      if (o.isSkinnedMesh) {
        if (/superhero/i.test(o.name)) this.body = o;
        else if (/eyebrow/i.test(o.name)) this.brows = o;
        else if (/eyes/i.test(o.name)) this.eyes = o;
      } else if (o.isMesh && /hair/i.test(o.name)) this.hair.push(o);
      if (o.isMesh) {
        o.castShadow = true;
        o.receiveShadow = true;
        o.frustumCulled = false;
        o.userData.origGeo = o.geometry;
        o.userData.origMat = o.material;
      }
    });
    for (const h of this.hair) h.visible = false;
    this.scene.updateMatrixWorld(true);
    this.rest = {};
    for (const [n, b] of Object.entries(this.bones)) {
      this.rest[n] = {
        pos: b.getWorldPosition(V()),
        quat: b.getWorldQuaternion(new THREE.Quaternion()),
        scale: b.getWorldScale(V()),
      };
    }
    // local bind pose: restored before every mixer update (see Animator.update)
    this.bindQ = Object.values(this.bones).map((b) => [b, b.quaternion.clone()]);
    this.mixer = new THREE.AnimationMixer(this.scene);
    this.clips = clips;
  }

  /** Quaternion (bone-local) that maps +Y onto `dirLocal` with +Z facing `frontWorld`. */
  frame(name, dirLocal, frontWorld = FWD) {
    const R = this.rest[name].quat.clone().invert();
    const y = dirLocal.clone().normalize();
    const f = frontWorld.clone().applyQuaternion(R);
    const z = f.sub(y.clone().multiplyScalar(f.dot(y)));
    if (z.lengthSq() < 1e-6) z.set(0, 0, 1);
    z.normalize();
    const x = V().crossVectors(y, z).normalize();
    return new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, z));
  }

  childDir(name) {
    const c = this.bones[CHILD[name]];
    return c ? c.position.clone() : V(0, 0.1, 0);
  }

  len(name) {
    const c = this.bones[CHILD[name]];
    return c ? c.position.length() * this.rest[name].scale.y : 0.1;
  }

  /** Parent `obj` (built along +Y) to bone `name`, laid toward its child. */
  along(name, obj, { offset = null, front = FWD, dir = null } = {}) {
    const b = this.bones[name];
    const q = this.frame(name, dir || this.childDir(name), front);
    obj.quaternion.copy(q);
    const s = this.rest[name].scale;
    obj.scale.divide(s);
    if (offset) obj.position.copy(offset.clone().applyQuaternion(q).divide(s));
    b.add(obj);
    return obj;
  }

  /** Parent `obj` to bone `name`, placed at a rest-pose WORLD position/orientation. */
  atWorld(name, obj, worldPos, worldQuat = null) {
    const b = this.bones[name];
    const r = this.rest[name];
    const inv = r.quat.clone().invert();
    obj.position.copy(worldPos.clone().sub(r.pos).applyQuaternion(inv).divide(r.scale));
    obj.quaternion.copy(inv.multiply(worldQuat || new THREE.Quaternion()));
    obj.scale.divide(r.scale);
    b.add(obj);
    return obj;
  }

  /**
   * Reshape the body in its bind pose. radial(boneName) → thickness factor
   * around that bone's axis; mask(boneName) → 0..1 cloth/armour mask weight.
   */
  sculpt({ radial = () => 1, mask = null, shift = null } = {}) {
    const body = this.body;
    const geo = body.geometry.clone();
    const skel = body.skeleton;
    const nb = skel.bones.length;
    const bp = [];
    const bi = body.bindMatrixInverse;
    for (let i = 0; i < nb; i++) bp.push(V().applyMatrix4(skel.boneInverses[i].clone().invert()).applyMatrix4(bi));
    const idxOf = new Map(skel.bones.map((b, i) => [b.name, i]));
    const segEnd = skel.bones.map((b, i) => {
      const c = CHILD[b.name];
      return c != null && idxOf.has(c) ? bp[idxOf.get(c)] : bp[i];
    });
    const kOf = skel.bones.map((b) => radial(b.name));
    const mOf = mask ? skel.bones.map((b) => mask(b.name)) : null;
    const pos = geo.attributes.position;
    const si = geo.attributes.skinIndex;
    const sw = geo.attributes.skinWeight;
    const P = V();
    const C = V();
    const acc = V();
    const seg = new THREE.Line3();
    const maskArr = mask ? new Float32Array(pos.count) : null;
    for (let v = 0; v < pos.count; v++) {
      P.fromBufferAttribute(pos, v);
      acc.set(0, 0, 0);
      let wsum = 0;
      let m = 0;
      for (let k = 0; k < 4; k++) {
        const w = sw.getComponent(v, k);
        if (w <= 0) continue;
        const j = si.getComponent(v, k);
        if (bp[j].distanceToSquared(segEnd[j]) < 1e-10) C.copy(bp[j]);
        else {
          seg.set(bp[j], segEnd[j]);
          seg.closestPointToPoint(P, true, C);
        }
        acc.addScaledVector(C.clone().add(P.clone().sub(C).multiplyScalar(kOf[j])), w);
        wsum += w;
        if (mOf) m += mOf[j] * w;
      }
      if (wsum > 0) acc.divideScalar(wsum);
      else acc.copy(P);
      if (shift) shift(acc, P);
      pos.setXYZ(v, acc.x, acc.y, acc.z);
      if (maskArr) maskArr[v] = Math.min(1, m / Math.max(1e-6, wsum));
    }
    if (maskArr) geo.setAttribute("aMask", new THREE.BufferAttribute(maskArr, 1));
    geo.computeVertexNormals();
    geo.computeBoundingSphere();
    body.geometry = geo;
    this.ownGeo = geo;
    return geo;
  }

  restPos(name, offset = null) {
    const p = this.rest[name].pos.clone();
    if (offset) p.add(offset);
    return p;
  }
}

/* ======================================================================== Animator */
class Animator {
  constructor(rig, spec, U) {
    this.rig = rig;
    this.spec = spec;
    this.U = U;
    this.t = Math.random() * 10;
    this.actions = new Map();
    this.cur = null;
    this.state = "idle";
    this.track = 1;
    this.trackTarget = 1;
    this.hitT = 9;
    this.hitDir = 1;
    this.recoil = 0;
    this.recoilV = 0;
    this.dead = false;
    this.antic = null;
    this.headQ = new THREE.Quaternion();
    this.lookW = 0;
    this.hover = spec.hover || 0;
    this.post = [];
    this.clipsSrc = rig.female ? rig.clips.fclips : rig.clips.clips;
    this.faceFix = true;
    if (import.meta.env?.DEV && typeof location !== "undefined") {
      const ov = new URLSearchParams(location.search).get("idle");
      if (ov) this.spec = { ...spec, idle: ov };
    }
    this.idle(true);
    this.faceCamera();
  }

  /** Stance clips turn the body sideways; yaw the whole rig so the chest faces the camera. */
  faceCamera() {
    const sc = this.rig.scene;
    sc.rotation.y = 0;
    const a = this.action(this.spec.idle || "Idle");
    const keep = a ? a.time : 0;
    let sum = 0;
    const N = 6;
    const dur = a?.getClip().duration || 1;
    for (let i = 0; i < N; i++) {
      if (a) a.time = (dur * i) / N;
      this.rig.mixer.update(0);
      this.rig.scene.updateMatrixWorld(true);
      const q = this.rig.bones.spine_03.getWorldQuaternion(new THREE.Quaternion()).multiply(this.rig.rest.spine_03.quat.clone().invert());
      const f = FWD.clone().applyQuaternion(q);
      sum += Math.atan2(f.x, f.z);
    }
    if (a) a.time = keep;
    sc.rotation.y = -(sum / N) * 0.85 + (this.spec.yaw || 0);
  }

  action(name) {
    if (!this.actions.has(name)) {
      const clip = this.clipsSrc[name];
      if (!clip) return null;
      this.actions.set(name, this.rig.mixer.clipAction(clip));
    }
    return this.actions.get(name);
  }

  fadeTo(name, { fade = 0.25, loop = true, timeScale = 1 } = {}) {
    const a = this.action(name);
    if (!a) return null;
    a.reset();
    a.setLoop(loop ? THREE.LoopRepeat : THREE.LoopOnce, loop ? Infinity : 1);
    a.clampWhenFinished = !loop;
    a.timeScale = timeScale;
    a.enabled = true;
    a.setEffectiveWeight(1);
    if (this.cur && this.cur !== a) a.crossFadeFrom(this.cur, fade, true);
    a.play();
    this.cur = a;
    return a;
  }

  idle(instant = false) {
    if (this.dead) return;
    this.state = "idle";
    this.antic = null;
    this.trackTarget = 1;
    const a = this.fadeTo(this.spec.idle || "Idle", { fade: instant ? 0 : 0.35, timeScale: this.spec.idleSpeed || 1 });
    if (a && instant) a.time = Math.random() * a.getClip().duration;
  }

  /**
   * Attack/ability: slowed anticipation, then full-speed execution.
   * Resolves `impact` when the blow lands and `done` when back to idle.
   */
  act(kind) {
    const map = this.spec.anims || {};
    const name = map[kind] || map.slash || "SlashA";
    const clip = this.clipsSrc[name];
    let resImpact;
    let resDone;
    const impact = new Promise((r) => (resImpact = r));
    const done = new Promise((r) => (resDone = r));
    if (!clip || this.dead) {
      resImpact();
      resDone();
      return { impact, done };
    }
    const dur = clip.duration;
    const fr = IMPACT[name] ?? 0.5;
    const anticTime = Math.min(0.75, 0.25 + dur * 0.35);
    const slowScale = (dur * fr * 0.55) / anticTime; // first 55% of the windup, stretched
    const a = this.fadeTo(name, { fade: 0.2, loop: false, timeScale: slowScale });
    this.state = "act";
    this.trackTarget = 0.35;
    this.antic = { a, name, t: 0, anticTime, dur, fr, phase: 0, resImpact, resDone, kind };
    return { impact, done };
  }

  hit(power = 1, dir = 1) {
    this.U.uHit.value = Math.min(1.4, 0.6 + power * 0.5);
    this.recoilV += 4 * power * dir;
    this.hitDir = dir;
    if (this.dead || this.state === "act") return;
    const heavy = power >= 1.4;
    const name = heavy ? this.spec.stagger || "Stagger" : Math.random() < 0.5 ? "HitBody" : "HitHead";
    this.fadeTo(name, { fade: 0.08, loop: false, timeScale: heavy ? 1 : 1.1 });
    this.state = "hit";
    this.hitT = 0;
    this.hitDur = (this.clipsSrc[name]?.duration || 0.4) / (heavy ? 1 : 1.1);
  }

  die() {
    if (this.dead) return Promise.resolve();
    this.dead = true;
    this.state = "dead";
    this.trackTarget = 0;
    this.antic?.resImpact();
    this.antic?.resDone();
    this.antic = null;
    this.fadeTo(this.spec.death || "Death", { fade: 0.15, loop: false });
    return new Promise((r) => setTimeout(r, 1900));
  }

  update(dt, camPos) {
    this.t += dt;
    const A = this.antic;
    if (A) {
      A.t += dt;
      if (A.phase === 0 && A.t >= A.anticTime) {
        A.phase = 1;
        A.a.timeScale = 1;
      }
      const ct = A.a.time;
      if (A.phase >= 1 && A.phase < 2 && ct >= A.dur * A.fr) {
        A.phase = 2;
        A.resImpact();
      }
      if (A.phase === 2 && (ct >= A.dur - 0.02 || !A.a.isRunning())) {
        A.phase = 3;
        A.resDone();
        this.antic = null;
        this.idle();
      }
      if (A.t > 6) {
        A.resImpact();
        A.resDone();
        this.antic = null;
        this.idle();
      }
    } else if (this.state === "hit") {
      this.hitT += dt;
      if (this.hitT > this.hitDur - 0.05) this.idle();
    }
    // The procedural layers (posture, breathing, recoil, head tracking) are
    // additive rotations. A clip with no track for a bone (constant tracks are
    // stripped from the optimised clips) never resets it, so without this the
    // offsets compound every frame — the skeleton's spine spun in circles.
    for (const [bone, q] of this.rig.bindQ) bone.quaternion.copy(q);
    this.rig.mixer.update(dt);
    this.layers(dt, camPos);
    this.U.uHit.value = Math.max(0, this.U.uHit.value - dt * 3.2);
  }

  layers(dt, camPos) {
    const B = this.rig.bones;
    const t = this.t;
    const S = this.spec;
    const breath = Math.sin(t * (S.breathRate || 1.6)) * (this.dead ? 0 : 1);
    // posture (hunch / proud chest) and breathing
    if (S.posture) for (const [n, ang] of S.posture) B[n] && B[n].rotateX(ang * (this.dead ? 0.3 : 1));
    if (B.spine_03) B.spine_03.rotateX(breath * 0.025 * (S.breathAmp || 1));
    if (B.spine_02) B.spine_02.rotateX(breath * 0.012 * (S.breathAmp || 1));
    for (const s of ["l", "r"]) B[`clavicle_${s}`]?.rotateZ(breath * 0.02 * (s === "l" ? 1 : -1) * (S.breathAmp || 1));
    // recoil spring (adds to spine twist/lean on hits)
    this.recoilV += (-this.recoil * 60 - this.recoilV * 9) * dt;
    this.recoil += this.recoilV * dt;
    if (B.spine_02) B.spine_02.rotateX(-this.recoil * 0.12);
    if (B.spine_03) B.spine_03.rotateZ(this.recoil * 0.05);
    // head tracking toward the camera
    this.track += (this.trackTarget - this.track) * Math.min(1, dt * 3);
    const head = B.Head;
    if (head && camPos && this.track > 0.01) {
      head.updateWorldMatrix(true, false);
      const hp = head.getWorldPosition(V());
      const want = camPos.clone().sub(hp).normalize();
      // current facing of the head in world: the rest-forward rotated by the animated head
      const restQ = this.rig.rest.Head.quat;
      const fLocal = FWD.clone().applyQuaternion(restQ.clone().invert());
      const curQ = head.getWorldQuaternion(new THREE.Quaternion());
      const cur = fLocal.applyQuaternion(curQ).normalize();
      const q = new THREE.Quaternion().setFromUnitVectors(cur, want);
      const ang = 2 * Math.acos(Math.min(1, Math.abs(q.w)));
      const lim = 0.75;
      if (ang > lim) q.slerp(new THREE.Quaternion(), 1 - lim / ang);
      q.slerp(new THREE.Quaternion(), 1 - this.track * (S.track ?? 0.8));
      this.headQ.slerp(q, Math.min(1, dt * 6));
      // apply as a world-space delta on the head
      const parentQ = head.parent.getWorldQuaternion(new THREE.Quaternion());
      const newWorld = this.headQ.clone().multiply(curQ);
      head.quaternion.copy(parentQ.invert().multiply(newWorld));
    }
    for (const f of this.post) f(dt, t, this);
    // hover (reaper, witch)
    if (this.hover) this.rig.scene.position.y = this.hover + Math.sin(t * 1.3) * 0.06 * (this.dead ? 0 : 1);
  }
}

/* ======================================================================== helpers */
function addEyes(rig, mon, { color, size = 0.05, intensity = 7, light = true, offset = V(), spread = 0.031, y = 1.699, z = 0.075, bone = "Head", halo: haloOp = 0.7 }) {
  const sp = softSprite();
  for (const s of [-1, 1]) {
    const p = V(spread * s, y, z).add(offset);
    const core = new THREE.Mesh(new THREE.SphereGeometry(0.011, 10, 8), eyeMaterial(color, intensity));
    rig.atWorld(bone, core, p);
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: sp, color, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: haloOp }));
    halo.scale.setScalar(size);
    core.add(halo);
    mon.glows.push(halo);
  }
  if (light) {
    const L = new THREE.PointLight(color, 0.25, 1.2, 2);
    rig.atWorld(bone, L, V(0, y, z + 0.25).add(offset));
    mon.eyeLight = L;
  }
}

function bodyMat(rig, U, params, recipe) {
  const o = rig.body.material;
  return creatureMaterial(
    {
      map: o.map,
      normalMap: o.normalMap,
      normalScale: new THREE.Vector2(1.2, 1.2),
      roughnessMap: o.roughnessMap,
      roughness: 0.85,
      metalness: 0,
      ...params,
    },
    recipe,
    U,
  );
}

const handBones = (s) => ["index", "middle", "ring", "pinky", "thumb"].flatMap((f) => [`${f}_01_${s}`, `${f}_02_${s}`, `${f}_03_${s}`]);

/** Weapon in a hand: built along +Y (grip at 0); points forward/up at rest. */
function hold(rig, side, obj, { tilt = 0.25, grip = 0.0, palm = 0.03, out = 0.07 } = {}) {
  const h = rig.rest[`hand_${side}`].pos;
  const sx = side === "l" ? 1 : -1;
  const p = h.clone().add(V(sx * out, -palm, 0.0));
  const dir = V(0, Math.sin(tilt), Math.cos(tilt)).normalize();
  const q = new THREE.Quaternion().setFromUnitVectors(UP, dir);
  obj.position.y -= grip;
  const w = new THREE.Group();
  w.add(obj);
  rig.atWorld(`hand_${side}`, w, p, q);
  return w;
}

/* ======================================================================== monsters */
const SPECS = {
  skeleton: {
    rig: "male",
    scale: 1.0,
    idle: "SwordIdle",
    anims: { slash: "SlashA", slash2: "SlashB", heavy: "BladeHeavy", buff: "CastIdle" },
    breathAmp: 0.4,
    rim: 0x6d86b8,
    posture: [["spine_01", 0.08]],
    voice: "skeleton",
  },
  ghoul: {
    rig: "male",
    scale: 0.98,
    idle: "CrouchIdle",
    anims: { claw: "Hook", heavy: "SlashC", feed: "Consume", slash: "Hook" },
    breathRate: 2.6,
    breathAmp: 2.2,
    rim: 0x7a9a72,
    posture: [
      ["spine_02", 0.18],
      ["spine_03", 0.14],
      ["neck_01", -0.22],
    ],
    voice: "ghoul",
  },
  knight: {
    rig: "male",
    scale: 1.08,
    idle: "ShieldIdle",
    anims: { heavy: "BladeHeavy", heavy2: "Overhand", block: "Block", slash: "SlashB" },
    breathAmp: 0.7,
    rim: 0x6cb6c8,
    voice: "knight",
  },
  witch: {
    rig: "female",
    scale: 1.0,
    idle: "CastIdle",
    idleSpeed: 0.8,
    anims: { cast: "Cast", cast2: "Throw", slash: "Cast" },
    hover: 0.32,
    rim: 0xc0354a,
    posture: [["neck_01", -0.08]],
    voice: "witch",
  },
  guardian: {
    rig: "male",
    scale: 1.55,
    idle: "SwordIdle",
    idleSpeed: 0.7,
    anims: { heavy: "Overhand", heavy2: "BladeHeavy", block: "Block", slash: "BladeHeavy" },
    breathRate: 0.9,
    breathAmp: 0.6,
    rim: 0x5fb7c9,
    posture: [["spine_03", 0.1]],
    voice: "guardian",
  },
  reaper: {
    rig: "male",
    scale: 1.22,
    idle: "SwordIdle",
    idleSpeed: 0.6,
    anims: { heavy: "BladeHeavy", slash: "SlashC", slash2: "SlashB", cast: "Cast" },
    hover: 0.38,
    rim: 0x8ab0d0,
    posture: [
      ["spine_03", 0.12],
      ["neck_01", 0.1],
    ],
    voice: "reaper",
  },
  demon: {
    rig: "male",
    scale: 1.5,
    idle: "Idle",
    idleSpeed: 0.75,
    anims: { cast: "Cast", claw: "Hook", heavy: "Overhand", roar: "Push", slash: "Hook" },
    breathRate: 1.1,
    breathAmp: 1.6,
    rim: 0xff6a2a,
    posture: [
      ["spine_02", 0.08],
      ["spine_03", 0.08],
      ["neck_01", -0.1],
    ],
    voice: "demon",
  },
  lord: {
    rig: "male",
    scale: 1.32,
    idle: "SwordIdle",
    idleSpeed: 0.8,
    anims: { heavy: "BladeHeavy", heavy2: "Overhand", cast: "Cast", cast2: "Throw", roar: "Push", slash: "SlashB" },
    breathAmp: 0.8,
    rim: 0x8a5cff,
    voice: "lord",
  },
};
export { SPECS };

/** Build a monster. ctx = { rigs, quality } */
export async function buildMonster(key, ctx) {
  if (key === "wolf") {
    const { buildWolf } = await import("./wolf.js");
    return buildWolf(ctx);
  }
  const spec = SPECS[key];
  const { rigs } = ctx;
  const female = spec.rig === "female";
  const rig = new Rig(female ? rigs.female : rigs.male, rigs, female);
  const U = creatureUniforms();
  U.uRimColor.value.set(spec.rim);
  const mon = { key, root: rig.root, rig, U, glows: [], parts: [], mats: new Set(), geos: new Set(), extra: [], stage: 1 };
  await BUILD[key](rig, mon, U, ctx);
  rig.root.scale.setScalar(spec.scale);
  const anim = new Animator(rig, spec, U);
  mon.anim = anim;
  mon.height = 1.8 * spec.scale + (spec.hover || 0) * spec.scale;
  mon.update = (dt, camPos) => {
    U.uTime.value += dt;
    anim.update(dt, camPos);
    for (const f of mon.extra) f(dt, U.uTime.value);
  };
  mon.act = (kind) => anim.act(kind);
  mon.hit = (p, d) => anim.hit(p, d);
  mon.die = () => {
    const p = anim.die();
    mon.dissolveAt = 1.2;
    return p;
  };
  mon.headPos = (out = V()) => rig.bones.Head.getWorldPosition(out);
  mon.chestPos = (out = V()) => rig.bones.spine_03.getWorldPosition(out);
  mon.handPos = (side = "r", out = V()) => rig.bones[`hand_${side}`].getWorldPosition(out);
  mon.setStage = (n) => {
    mon.stage = n;
    mon.onStage?.(n);
  };
  mon.dispose = () => {
    rig.mixer.stopAllAction();
    rig.mixer.uncacheRoot(rig.scene);
    rig.root.traverse((o) => {
      if (o.isSkinnedMesh) o.skeleton?.dispose?.();
      if (o.geometry && !o.userData.sharedGeo && o.geometry !== o.userData.origGeo) mon.geos.add(o.geometry);
      const ms = Array.isArray(o.material) ? o.material : o.material ? [o.material] : [];
      if (!o.userData.sharedMat) for (const m of ms) if (m !== o.userData.origMat) mon.mats.add(m);
    });
    rig.ownGeo?.dispose();
    for (const g of mon.geos) g.dispose?.();
    for (const m of mon.mats) m.dispose?.();
    rig.root.removeFromParent();
  };
  const baseUpdate = mon.update;
  mon.update = (dt, camPos) => {
    baseUpdate(dt, camPos);
    if (mon.dissolveAt != null) {
      mon.dissolveAt -= dt;
      if (mon.dissolveAt < 0) U.uDissolve.value = Math.min(1, U.uDissolve.value + dt * 0.55);
      for (const g of mon.glows) g.material.opacity = Math.max(0, 1 - U.uDissolve.value * 2);
      if (mon.eyeLight) mon.eyeLight.intensity = Math.max(0, 0.25 - U.uDissolve.value);
    }
  };
  return mon;
}

/**
 * Long cloth (robe, cape, gown) hangs from a bone's POSITION but stays
 * vertical — rigidly parenting it would swing the whole hem with the chest.
 * It yaws with the pelvis and leans only a fraction of the bone's tilt.
 */
function hangFrom(rig, mon, bone, mesh, offset, lean = 0.25) {
  const holder = new THREE.Group();
  holder.add(mesh);
  rig.root.add(holder);
  const p = V();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const inv = new THREE.Matrix4();
  const restOff = offset.clone();
  mon.extra.push(() => {
    rig.root.updateMatrixWorld(true);
    inv.copy(rig.root.matrixWorld).invert();
    const b = rig.bones[bone];
    b.getWorldQuaternion(q);
    // the offset was measured in the rest pose (world axes); rotate it by the bone's yaw only
    e.setFromQuaternion(q.multiply(rig.rest[bone].quat.clone().invert()), "YXZ");
    p.copy(restOff).applyEuler(new THREE.Euler(0, e.y, 0));
    b.getWorldPosition(holder.position).add(p.multiplyScalar(rig.root.scale.x)).applyMatrix4(inv);
    holder.rotation.set(e.x * lean, e.y, e.z * lean, "YXZ");
  });
  return holder;
}

/* ------------------------------------------------------------------------ builders */
const BUILD = {};

function boneMaterial(U, tint = 0xcfc2a2) {
  return creatureMaterial(
    { color: tint, roughness: 0.72, metalness: 0 },
    { bump: [38, 0.012, 4], pores: [140, 0.004], blotch: [0x6b5236, 3.5, 0.75], cavity: 0.5, wet: [4, 0.42] },
    U,
  );
}

/** Lay anatomical bones along the rig (used by skeleton and reaper hands). */
function buildBones(rig, mon, mat, { arms = true, legs = true, torso = true, hands = true }) {
  const add = (name, geo, opts) => {
    const m = new THREE.Mesh(geo, mat);
    m.castShadow = true;
    rig.along(name, m, opts);
    return m;
  };
  for (const s of ["l", "r"]) {
    const sx = s === "l" ? 1 : -1;
    if (arms) {
      add(`clavicle_${s}`, G.longBone(rig.len(`clavicle_${s}`) * 0.95, 0.009, 1.4));
      add(`upperarm_${s}`, G.longBone(rig.len(`upperarm_${s}`) * 0.97, 0.014, 1.8));
      add(`lowerarm_${s}`, G.longBone(rig.len(`lowerarm_${s}`) * 0.96, 0.009, 1.5), { offset: V(0.014, 0, 0) });
      add(`lowerarm_${s}`, G.longBone(rig.len(`lowerarm_${s}`) * 0.98, 0.0085, 1.5), { offset: V(-0.013, 0, 0.004) });
      // scapula: flat blade on the back
      const sc = new THREE.Mesh(G.dome(0.06, 0.08, 0.016, Math.PI * 2, Math.PI / 2, 12), mat);
      rig.atWorld("spine_03", sc, rig.restPos("spine_03", V(sx * 0.09, 0.06, -0.085)), new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.PI / 2 + 0.15, 0, sx * 0.2)));
    }
    if (hands) {
      const hl = rig.len(`hand_${s}`);
      for (const [f, off] of [
        ["index", 0.022],
        ["middle", 0.006],
        ["ring", -0.01],
        ["pinky", -0.025],
      ]) {
        // metacarpal from wrist to knuckle
        const k = rig.bones[`${f}_01_${s}`];
        if (k) add(`hand_${s}`, G.longBone(k.position.length() * 0.95, 0.005, 1.5), { dir: k.position.clone() });
        for (const seg of ["01", "02", "03"]) {
          const n = `${f}_${seg}_${s}`;
          if (rig.bones[n]) add(n, G.longBone(rig.len(n) * 0.9, seg === "01" ? 0.0055 : 0.0045, 1.4));
        }
        void off;
        void hl;
      }
      for (const seg of ["01", "02", "03"]) {
        const n = `thumb_${seg}_${s}`;
        if (rig.bones[n]) add(n, G.longBone(rig.len(n) * 0.9, 0.0058, 1.4));
      }
    }
    if (legs) {
      add(`thigh_${s}`, G.longBone(rig.len(`thigh_${s}`) * 0.97, 0.019, 1.9));
      add(`calf_${s}`, G.longBone(rig.len(`calf_${s}`) * 0.97, 0.016, 1.7), { offset: V(0, 0, 0.01) });
      add(`calf_${s}`, G.longBone(rig.len(`calf_${s}`) * 0.92, 0.007, 1.5), { offset: V(sx * 0.022, 0, -0.008) });
      // knee cap
      const kc = new THREE.Mesh(new THREE.SphereGeometry(0.022, 10, 8).scale(1, 1.15, 0.6), mat);
      rig.along(`calf_${s}`, kc, { offset: V(0, 0.01, 0.035) });
      add(`foot_${s}`, G.longBone(rig.len(`foot_${s}`), 0.012, 1.6));
      for (const dx of [-0.025, -0.008, 0.008, 0.024]) add(`ball_${s}`, G.longBone(0.045, 0.005, 1.4), { offset: V(dx, 0, 0) });
      // heel
      const heel = new THREE.Mesh(new THREE.SphereGeometry(0.024, 10, 8).scale(0.8, 1, 1.3), mat);
      rig.along(`foot_${s}`, heel, { offset: V(0, -0.005, -0.01) });
    }
  }
  if (torso) {
    // spine
    for (const n of ["pelvis", "spine_01", "spine_02", "spine_03", "neck_01"]) {
      const L = rig.len(n);
      const cnt = n === "neck_01" ? 5 : n === "spine_03" ? 4 : 3;
      for (let i = 0; i < cnt; i++) {
        const v = new THREE.Mesh(G.vertebra(n === "neck_01" ? 0.75 : 1 + (n === "pelvis" ? 0.25 : 0)), mat);
        rig.along(n, v, { offset: V(0, (L * (i + 0.5)) / cnt, -0.02) });
      }
    }
    // ribs on spine_03 / spine_02
    const ribs = [
      ["spine_03", 0.17, 0.065, 0.085, 0.02],
      ["spine_03", 0.12, 0.085, 0.1, 0.035],
      ["spine_03", 0.06, 0.1, 0.108, 0.05],
      ["spine_03", 0.0, 0.11, 0.112, 0.065],
      ["spine_02", 0.08, 0.112, 0.11, 0.075],
      ["spine_02", 0.025, 0.108, 0.104, 0.08],
      ["spine_01", 0.08, 0.098, 0.09, 0.06],
    ];
    for (const [n, y, w, d, drop] of ribs)
      for (const s of [1, -1]) {
        const r = new THREE.Mesh(G.rib(w, d, drop * 1.6, 0.0058, s), mat);
        rig.along(n, r, { offset: V(0, y, -0.035), dir: V(0, 1, 0).applyQuaternion(rig.rest[n].quat.clone().invert()) });
        r.quaternion.copy(rig.frame(n, UP.clone().applyQuaternion(rig.rest[n].quat.clone().invert())));
        r.position.copy(V(0, y, -0.035).applyQuaternion(r.quaternion));
      }
    // sternum
    const st = new THREE.Mesh(G.lathe([[0.004, 0], [0.014, 0.02], [0.013, 0.14], [0.006, 0.17], [0.002, 0.175]], 8, 1.4, 0.4), mat);
    rig.atWorld("spine_03", st, rig.restPos("spine_03", V(0, -0.05, 0.1)), new THREE.Quaternion().setFromEuler(new THREE.Euler(-0.12, 0, 0)));
    // pelvis: bowl + iliac wings
    const bowl = new THREE.Mesh(G.lathe([[0.06, -0.05], [0.085, -0.02], [0.105, 0.03], [0.12, 0.07], [0.115, 0.08]], 18, 1.25, 0.8), mat);
    bowl.material = mat;
    rig.atWorld("pelvis", bowl, rig.restPos("pelvis", V(0, -0.02, 0.0)));
    for (const s of [1, -1]) {
      const wing = new THREE.Mesh(G.dome(0.07, 0.075, 0.02, Math.PI * 2, Math.PI / 2, 12), mat);
      rig.atWorld("pelvis", wing, rig.restPos("pelvis", V(s * 0.085, 0.02, -0.01)), new THREE.Quaternion().setFromEuler(new THREE.Euler(0.4, s * 0.9, 0)));
    }
  }
}

async function skullOn(rig, mon, mat, { size = 0.24, offset = V(0, 0.105, 0.02), eyes = 0xffa040 } = {}) {
  const sk = await loadProp("skull");
  sk.traverse((o) => {
    if (o.isMesh) {
      const ao = o.material.aoMap;
      o.material = mat.clone();
      o.userData.sharedMat = false;
      o.material.onBeforeCompile = mat.onBeforeCompile;
      o.material.customProgramCacheKey = mat.customProgramCacheKey;
      if (ao) {
        o.material.aoMap = ao;
        o.material.aoMapIntensity = 1;
      }
      o.castShadow = true;
    }
  });
  const fitted = fitProp(sk, size, "z", false);
  const head = rig.restPos("Head", offset);
  rig.atWorld("Head", fitted, head);
  if (eyes) addEyes(rig, mon, { color: eyes, size: 0.03, intensity: 2.2, y: head.y + 0.012, z: head.z + 0.06, spread: 0.03, light: false, halo: 0.45 });
  return fitted;
}

function rags(rig, U, color, { top = 0.17, bottom = 0.22, len = 0.32, bone = "pelvis", y = 0.04, tatter = 0.55, seed = 3, sx = 1.15, sz = 0.85 } = {}) {
  const g = G.clothTube(top, bottom, len, { ragged: 0.12, seed, sx, sz, folds: 0.014 });
  const m = creatureMaterial({ ...pbrMaps("fabric_leather_02", [2, 1]), color, roughness: 1, side: THREE.DoubleSide }, { sat: 0.6, bump: [30, 0.006, 3], blotch: [0x2a1c12, 4, 0.8], tatter: [11, tatter + 0.1, -len * 0.15, -len], flutter: [0.02, 1.4, 0] }, U);
  const mesh = new THREE.Mesh(g, m);
  mesh.castShadow = true;
  rig.atWorld(bone, mesh, rig.restPos(bone, V(0, y, 0)));
  return mesh;
}

/* -------- Cursed Skeleton */
BUILD.skeleton = async (rig, mon, U) => {
  rig.body.visible = false;
  if (rig.eyes) rig.eyes.visible = false;
  if (rig.brows) rig.brows.visible = false;
  const mat = boneMaterial(U);
  buildBones(rig, mon, mat, {});
  await skullOn(rig, mon, boneMaterial(U, 0xd8ccae), { eyes: 0xff8a2a });
  rags(rig, U, 0x3b3128, { len: 0.36 });
  const sword = await loadProp("estoc");
  const s = fitProp(sword, 1.05, "y", false);
  s.position.y = 0.36;
  s.traverse((o) => {
    if (o.isMesh) {
      o.material = o.material.clone();
      o.userData.sharedMat = false;
      o.material.color.multiplyScalar(0.75);
      o.material.roughness = 0.6;
    }
  });
  hold(rig, "r", s, { tilt: 0.1 });
};

/* -------- Grave Ghoul */
BUILD.ghoul = async (rig, mon, U) => {
  rig.sculpt({
    radial: (n) => (/upperarm|lowerarm/.test(n) ? 0.68 : /thigh|calf/.test(n) ? 0.72 : /spine_0[12]|pelvis/.test(n) ? 0.78 : /spine_03/.test(n) ? 0.86 : /neck/.test(n) ? 0.7 : /hand|index|middle|ring|pinky|thumb/.test(n) ? 0.82 : 1),
    shift: (acc, P) => {
      // sunken cheeks / eye sockets: pull the face in a little
      if (P.y > 1.6 && P.z > 0.03) acc.z -= 0.006;
    },
  });
  rig.body.material = bodyMat(
    rig,
    U,
    { color: new THREE.Color(0.66, 0.7, 0.62), roughness: 0.78, envMapIntensity: 0.5 },
    { sat: 0.25, bump: [55, 0.009, 4], pores: [220, 0.003], blotch: [0x5a4a30, 3, 0.8], veins: [0x2b3a30, 6, 0.04], cavity: 0.5, wet: [5, 0.42] },
  );
  if (rig.brows) rig.brows.visible = false;
  if (rig.eyes) rig.eyes.visible = false;
  addEyes(rig, mon, { color: 0xd8f06a, size: 0.045, intensity: 6, z: 0.07 });
  const clawMat = creatureMaterial({ color: 0x2a221a, roughness: 0.35 }, { bump: [90, 0.003, 2] }, U);
  for (const s of ["l", "r"])
    for (const f of ["index", "middle", "ring", "pinky", "thumb"]) {
      const n = `${f}_03_${s}`;
      if (!rig.bones[n]) continue;
      const c = new THREE.Mesh(G.claw(f === "thumb" ? 0.05 : 0.075, 0.0065), clawMat);
      rig.along(n, c, { offset: V(0, rig.len(n) * 0.6, 0), front: V(0, -1, 0) });
    }
  rags(rig, U, 0x2c2a22, { len: 0.28, top: 0.14, bottom: 0.18, tatter: 0.6, sx: 1.1 });
};

/* -------- Haunted Knight */
function armorMats(U, tint = 0x8d8a86, rough = 1) {
  const metal = creatureMaterial({ ...pbrMaps("rusty_metal_02", [1.5, 1.5]), color: tint, metalness: 1, roughness: rough, envMapIntensity: 1.2 }, { bump: [70, 0.003, 3], cavity: 0.35 }, U);
  const mail = creatureMaterial({ color: 0x3b3a38, metalness: 0.9, roughness: 0.55 }, { pores: [260, 0.01], bump: [120, 0.004, 2], cavity: 0.6 }, U);
  return { metal, mail };
}

function plateSuit(rig, mon, U, metal, { helm = true, cape = 0x3a0d12, capeTatter = 0.45 } = {}) {
  const P = (bone, geo, opts) => {
    const m = new THREE.Mesh(geo, metal);
    m.castShadow = true;
    m.receiveShadow = true;
    rig.along(bone, m, opts);
    return m;
  };
  // cuirass (breast + back) around spine_02 → neck
  const cu = G.lathe(
    [
      [0.14, -0.05],
      [0.155, 0.0],
      [0.17, 0.08],
      [0.185, 0.17],
      [0.18, 0.25],
      [0.15, 0.31],
      [0.09, 0.345],
    ],
    28,
    1.12,
    0.86,
  );
  P("spine_02", cu, { offset: V(0, -0.02, 0.012) });
  // faulds: three lames below the waist
  for (let i = 0; i < 3; i++) P("pelvis", G.plate(0.06, 0.16 + i * 0.012, 0.175 + i * 0.012, Math.PI * 1.25, 22), { offset: V(0, 0.07 - i * 0.055, 0.0), dir: V(0, -1, 0).applyQuaternion(rig.rest.pelvis.quat.clone().invert()) });
  for (const s of ["l", "r"]) {
    const sx = s === "l" ? 1 : -1;
    // layered pauldron
    for (let i = 0; i < 3; i++) {
      const pd = new THREE.Mesh(G.dome(0.13 - i * 0.012, 0.06 - i * 0.006, 0.12 - i * 0.01, Math.PI * 2, Math.PI / 3.2, 20), metal);
      pd.castShadow = true;
      rig.atWorld(`upperarm_${s}`, pd, rig.restPos(`upperarm_${s}`, V(sx * (0.02 + i * 0.03), 0.045 - i * 0.035, 0)), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, sx * (-0.35 - i * 0.25))));
    }
    P(`upperarm_${s}`, G.plate(rig.len(`upperarm_${s}`) * 0.62, 0.058, 0.05), { offset: V(0, rig.len(`upperarm_${s}`) * 0.3, 0) });
    const cop = new THREE.Mesh(G.dome(0.055, 0.05, 0.055, Math.PI * 2, Math.PI / 2, 14), metal);
    rig.along(`lowerarm_${s}`, cop, { offset: V(0, -0.01, -0.01), front: V(0, 0, -1) });
    P(`lowerarm_${s}`, G.plate(rig.len(`lowerarm_${s}`) * 0.8, 0.045, 0.052), { offset: V(0, rig.len(`lowerarm_${s}`) * 0.1, 0) });
    const gaunt = new THREE.Mesh(G.lathe([[0.03, 0], [0.042, 0.01], [0.045, 0.06], [0.038, 0.1], [0.02, 0.11]], 14, 1.25, 0.7), metal);
    rig.along(`hand_${s}`, gaunt, { offset: V(0, -0.01, 0) });
    P(`thigh_${s}`, G.plate(rig.len(`thigh_${s}`) * 0.7, 0.085, 0.07), { offset: V(0, rig.len(`thigh_${s}`) * 0.08, 0) });
    const kn = new THREE.Mesh(G.dome(0.06, 0.055, 0.05, Math.PI * 2, Math.PI / 2, 14), metal);
    rig.along(`calf_${s}`, kn, { offset: V(0, 0.0, 0.03), front: UP.clone() });
    P(`calf_${s}`, G.plate(rig.len(`calf_${s}`) * 0.78, 0.062, 0.05), { offset: V(0, rig.len(`calf_${s}`) * 0.12, 0) });
    const sab = new THREE.Mesh(G.lathe([[0.02, 0], [0.045, 0.02], [0.05, 0.1], [0.04, 0.17], [0.012, 0.2]], 14, 1.0, 0.6), metal);
    rig.along(`foot_${s}`, sab, { offset: V(0, -0.02, 0.012) });
  }
  // gorget
  P("neck_01", G.plate(0.07, 0.085, 0.07, Math.PI * 2, 22), { offset: V(0, -0.01, 0.005) });
  if (helm) {
    // great helm: flat-topped cylinder with a dark eye slit and breaths
    const hg = G.lathe(
      [
        [0.105, -0.13],
        [0.118, -0.1],
        [0.122, 0.0],
        [0.118, 0.07],
        [0.1, 0.12],
        [0.06, 0.145],
        [0.001, 0.152],
      ],
      30,
      0.95,
      1.08,
    );
    const helmMesh = new THREE.Mesh(hg, metal);
    helmMesh.castShadow = true;
    rig.atWorld("Head", helmMesh, rig.restPos("Head", V(0, 0.06, 0.02)));
    const slit = new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.014, 0.05), new THREE.MeshStandardMaterial({ color: 0x020202, roughness: 1 }));
    rig.atWorld("Head", slit, rig.restPos("Head", V(0, 0.105, 0.125)));
    const ridge = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.24, 0.02), metal);
    rig.atWorld("Head", ridge, rig.restPos("Head", V(0, 0.04, 0.136)));
    mon.helm = helmMesh;
  }
  // tattered cape from the shoulders
  if (cape) {
    const capeGeo = G.membrane(16, 12, (i, j) => {
      const a = (j - 0.5) * 2;
      const w = 0.2 + i * 0.16;
      return V(a * w, -i * 1.25, -0.16 - Math.cos(a * 1.4) * 0.05 - i * 0.12 + Math.sin(j * 9) * 0.015 * i);
    });
    const cm = creatureMaterial({ ...pbrMaps("velour_velvet", [2, 3]), color: cape, roughness: 1, side: THREE.DoubleSide }, { tatter: [5, capeTatter, -0.3, -1.25], flutter: [0.05, 1.2, 0], blotch: [0x1a0a08, 3, 0.7] }, U);
    const cmesh = new THREE.Mesh(capeGeo, cm);
    cmesh.castShadow = true;
    rig.atWorld("spine_03", cmesh, rig.restPos("spine_03", V(0, 0.16, 0.02)));
    mon.cape = cmesh;
  }
}

BUILD.knight = async (rig, mon, U) => {
  const { metal, mail } = armorMats(U, 0x7d7a76);
  rig.body.material = mail;
  rig.sculpt({ radial: (n) => (/Head/.test(n) ? 0.8 : 1.04) });
  if (rig.eyes) rig.eyes.visible = false;
  if (rig.brows) rig.brows.visible = false;
  plateSuit(rig, mon, U, metal, { cape: 0x4a1016 });
  addEyes(rig, mon, { color: 0x7ff0ff, size: 0.05, intensity: 8, y: 1.7, z: 0.105, spread: 0.032 });
  // surcoat
  rags(rig, U, 0x3a1014, { len: 0.42, top: 0.19, bottom: 0.25, y: 0.02, tatter: 0.4, seed: 7 });
  const shield = await loadProp("kite_shield");
  const sh = fitProp(shield, 0.95, "y", false);
  const w = new THREE.Group();
  w.add(sh);
  // strapped to the back of the forearm: face up (back of hand) in the T-pose, point toward the elbow side
  rig.atWorld("lowerarm_l", w, rig.restPos("lowerarm_l", V(0.13, 0.07, 0.0)), new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2, 0, 0)));
  const mace = await loadProp("mace");
  const m = fitProp(mace, 0.78, "y", false);
  m.position.y = 0.26;
  hold(rig, "r", m, { tilt: 0.35 });
};

/* -------- Blood Witch */
BUILD.witch = async (rig, mon, U) => {
  rig.sculpt({
    radial: (n) => (/upperarm|lowerarm/.test(n) ? 0.85 : /thigh|calf/.test(n) ? 0.92 : 1),
    mask: (n) => (/spine|pelvis|thigh|clavicle/.test(n) ? 1 : /upperarm/.test(n) ? 0.6 : 0),
  });
  rig.body.material = bodyMat(
    rig,
    U,
    { color: new THREE.Color(0.95, 0.9, 0.92), roughness: 0.55 },
    { bump: [70, 0.004, 3], pores: [260, 0.0015], veins: [0x3a1a3a, 7, 0.03], blotch: [0x9a5a6a, 4, 0.35], cavity: 0.2, mask: [0x1c0508, 0.62, 0.0], wet: [3, 0.35] },
  );
  for (const h of rig.hair) if (/long/i.test(h.name)) {
    h.visible = true;
    h.material = creatureMaterial({ color: 0x120608, roughness: 0.45, map: h.material.map, normalMap: h.material.normalMap, alphaTest: h.material.alphaTest || 0, transparent: false, side: THREE.DoubleSide }, { wet: [8, 0.25] }, U);
  }
  if (rig.eyes) rig.eyes.visible = false;
  addEyes(rig, mon, { color: 0xff2a3a, size: 0.05, intensity: 9, y: 1.6, z: 0.07, spread: 0.029 });
  // long tattered gown
  const gown = G.clothTube(0.15, 0.36, 1.15, { ragged: 0.2, seed: 11, sx: 1.15, sz: 0.9, folds: 0.02, rings: 24, seg: 34 });
  const gm = creatureMaterial({ ...pbrMaps("velour_velvet", [2, 4]), color: 0x3a0a10, roughness: 0.9, side: THREE.DoubleSide }, { tatter: [5, 0.5, -0.5, -1.25], flutter: [0.06, 1.1, -0.1], blotch: [0x120204, 3, 0.8] }, U);
  const gmesh = new THREE.Mesh(gown, gm);
  gmesh.castShadow = true;
  hangFrom(rig, mon, "pelvis", gmesh, V(0, 0.08, 0), 0.35);
  // thorn crown
  const thorns = new THREE.Group();
  const tm = creatureMaterial({ color: 0x1a0c08, roughness: 0.6 }, { bump: [80, 0.004, 2] }, U);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.1, 0.008, 6, 28), tm);
  ring.rotation.x = Math.PI / 2;
  thorns.add(ring);
  for (let i = 0; i < 11; i++) {
    const a = (i / 11) * Math.PI * 2;
    const sp = new THREE.Mesh(G.horn(0.08 + (i % 3) * 0.025, 0.006, 0.3, 0, 0), tm);
    sp.position.set(Math.sin(a) * 0.1, 0, Math.cos(a) * 0.1);
    sp.rotation.set(0, a + Math.PI, 0.25);
    thorns.add(sp);
  }
  rig.atWorld("Head", thorns, rig.restPos("Head", V(0, 0.13, 0.0)));
  // orbiting blood orbs
  const orbMat = new THREE.MeshPhysicalMaterial({ color: 0x7a0010, roughness: 0.05, metalness: 0, transmission: 0.4, thickness: 0.3, emissive: 0x5a0008, emissiveIntensity: 1.6, clearcoat: 1 });
  const orbs = [];
  for (let i = 0; i < 3; i++) {
    const o = new THREE.Mesh(new THREE.SphereGeometry(0.045, 20, 14), orbMat);
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: softSprite(), color: 0xff1a2a, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, opacity: 0.6 }));
    halo.scale.setScalar(0.22);
    o.add(halo);
    mon.glows.push(halo);
    rig.root.add(o);
    orbs.push(o);
  }
  mon.orbs = orbs;
  mon.extra.push((dt, t) => {
    for (let i = 0; i < orbs.length; i++) {
      const a = t * 0.9 + (i * Math.PI * 2) / 3;
      orbs[i].position.set(Math.sin(a) * 0.55, 1.15 + Math.sin(t * 1.7 + i) * 0.12 + 0.3, Math.cos(a) * 0.4);
      orbs[i].visible = mon.U.uDissolve.value < 0.3;
    }
  });
  const L = new THREE.PointLight(0xff2030, 0.8, 2.5, 2);
  L.position.set(0, 1.4, 0.4);
  rig.root.add(L);
};

/* -------- Crypt Guardian */
BUILD.guardian = async (rig, mon, U) => {
  rig.sculpt({ radial: (n) => (/upperarm|lowerarm/.test(n) ? 1.35 : /spine_03|clavicle/.test(n) ? 1.25 : /thigh|calf/.test(n) ? 1.22 : /hand|index|middle|ring|pinky|thumb/.test(n) ? 1.25 : /Head/.test(n) ? 0.9 : 1.15) });
  const stone = creatureMaterial(
    { ...pbrMaps("mossy_rock", [3, 3]), color: 0xb8b2a4, roughness: 1, metalness: 0 },
    { bump: [14, 0.02, 5], cavity: 0.5, cracks: [0x3ad8ff, 2.2, 0.035, 2.2, 1], scale: 1 },
    U,
  );
  rig.body.material = stone;
  if (rig.eyes) rig.eyes.visible = false;
  if (rig.brows) rig.brows.visible = false;
  // scanned boulders as shoulder slabs and a stone cowl
  const rocks = await loadProp("rocks");
  const pieces = [];
  rocks.traverse((o) => o.isMesh && pieces.push(o));
  const rockMat = creatureMaterial({ ...pbrMaps("mossy_rock", [1, 1]), color: 0xa8a294, roughness: 1 }, { cracks: [0x3ad8ff, 3.0, 0.03, 1.6, 1], cavity: 0.4 }, U);
  const place = (mesh, bone, size, off, euler) => {
    const m = new THREE.Mesh(mesh.geometry, rockMat);
    m.userData.sharedGeo = true;
    m.castShadow = true;
    const g = fitProp(m, size, "x", false);
    rig.atWorld(bone, g, rig.restPos(bone, off), new THREE.Quaternion().setFromEuler(euler));
    return g;
  };
  if (pieces.length >= 3) {
    place(pieces[0], "upperarm_l", 0.3, V(0.03, 0.08, 0), new THREE.Euler(0.2, 0.4, -0.3));
    place(pieces[1], "upperarm_r", 0.3, V(-0.03, 0.08, 0), new THREE.Euler(-0.2, -0.6, 0.3));
    place(pieces[2], "spine_03", 0.34, V(0, 0.02, -0.12), new THREE.Euler(0.4, 0.2, 0));
  }
  // cowl + face plate
  const cowl = new THREE.Mesh(G.dome(0.15, 0.17, 0.16, Math.PI * 2, Math.PI / 1.7, 20), rockMat);
  rig.atWorld("Head", cowl, rig.restPos("Head", V(0, 0.07, -0.01)));
  addEyes(rig, mon, { color: 0x58e8ff, size: 0.06, intensity: 9, y: 1.7, z: 0.09, spread: 0.035 });
  // great maul: dark wood haft + stone head
  const haft = new THREE.Mesh(G.lathe([[0.02, 0], [0.024, 0.05], [0.022, 0.9], [0.028, 0.95]], 10), creatureMaterial({ ...pbrMaps("dark_wooden_planks", [0.3, 2]), roughness: 1 }, {}, U));
  const head = place(pieces[3] || pieces[0], "hand_r", 0.32, V(0, 0, 0), new THREE.Euler());
  head.removeFromParent();
  head.position.set(0, 0.95, 0);
  const maul = new THREE.Group();
  maul.add(haft, head);
  maul.position.y = -0.3;
  hold(rig, "r", maul, { tilt: 0.25 });
  mon.onStage = (n) => {
    if (n >= 2) U.uGlow.value = 2.4;
  };
};

/* -------- Soul Reaper */
BUILD.reaper = async (rig, mon, U) => {
  rig.body.visible = false;
  if (rig.eyes) rig.eyes.visible = false;
  if (rig.brows) rig.brows.visible = false;
  const bone = boneMaterial(U, 0xb9ae96);
  buildBones(rig, mon, bone, { torso: false, legs: false, arms: false, hands: true });
  for (const s of ["l", "r"]) {
    const m = new THREE.Mesh(G.longBone(rig.len(`lowerarm_${s}`) * 0.95, 0.009, 1.5), bone);
    rig.along(`lowerarm_${s}`, m);
  }
  await skullOn(rig, mon, boneMaterial(U, 0xcabd9c), { eyes: 0x9fd0ff, offset: V(0, 0.1, 0.03) });
  for (const g of mon.glows) {
    g.scale.setScalar(0.06);
    g.material.opacity = 0.95;
  }
  const cloth = (c) =>
    creatureMaterial({ ...pbrMaps("velour_velvet", [2, 4]), color: c, roughness: 1, side: THREE.DoubleSide }, { tatter: [4.5, 0.55, -0.4, -1.6], flutter: [0.07, 0.9, 0.2], blotch: [0x050505, 3, 0.8], bump: [14, 0.012, 4], cavity: 0.5 }, U);
  // robe from the shoulders to the floor
  const robe = G.clothTube(0.15, 0.46, 1.6, { ragged: 0.3, seed: 5, sx: 1.25, sz: 0.85, folds: 0.045, rings: 30, seg: 48 });
  const rm = cloth(0x0e0d10);
  const rmesh = new THREE.Mesh(robe, rm);
  rmesh.castShadow = true;
  hangFrom(rig, mon, "spine_03", rmesh, V(0, 0.17, -0.01), 0.3);
  // hood
  const hoodMat = creatureMaterial({ ...pbrMaps("velour_velvet", [2, 2]), color: 0x0d0c0f, roughness: 1, side: THREE.DoubleSide }, { bump: [18, 0.01, 4], cavity: 0.5, blotch: [0x050505, 3, 0.8] }, U);
  const hood = new THREE.Mesh(G.hood(0.16, 0.33, 0.42), hoodMat);
  hood.castShadow = true;
  rig.atWorld("Head", hood, rig.restPos("Head", V(0, -0.06, -0.01)));
  // shoulder mantle: a short cape over the robe's top
  const mantle = new THREE.Mesh(G.clothTube(0.15, 0.3, 0.32, { ragged: 0.1, seed: 9, sx: 1.35, sz: 0.95, folds: 0.03, rings: 10, seg: 30 }), cloth(0x100e12));
  mantle.castShadow = true;
  hangFrom(rig, mon, "spine_03", mantle, V(0, 0.21, -0.01), 0.6);
  // sleeves
  for (const s of ["l", "r"]) {
    for (const [b, r0, r1] of [
      [`upperarm_${s}`, 0.075, 0.1],
      [`lowerarm_${s}`, 0.1, 0.17],
    ]) {
      const sl = G.clothTube(r0, r1, rig.len(b) * 1.05, { ragged: 0.12, seed: b.length + (s === "l" ? 3 : 7), folds: 0.02, rings: 10, seg: 22 });
      sl.rotateX(Math.PI);
      const m = new THREE.Mesh(sl, cloth(0x0d0c0f));
      m.castShadow = true;
      rig.along(b, m);
    }
  }
  // scythe: long haft + crescent blade
  const haft = new THREE.Mesh(G.lathe([[0.016, -0.2], [0.02, -0.16], [0.018, 1.35], [0.024, 1.4], [0.01, 1.45]], 10), creatureMaterial({ ...pbrMaps("dark_wooden_planks", [0.25, 3]), color: 0x6a5a4a, roughness: 0.9 }, { bump: [40, 0.004, 3] }, U));
  const outline = [];
  for (let i = 0; i <= 20; i++) {
    const t = i / 20;
    outline.push([-Math.sin(t * Math.PI * 0.62) * 0.78, Math.cos(t * Math.PI * 0.62) * 0.18 - 0.18 + t * 0.06]);
  }
  for (let i = 20; i >= 0; i--) {
    const t = i / 20;
    outline.push([-Math.sin(t * Math.PI * 0.58) * 0.7, Math.cos(t * Math.PI * 0.58) * 0.08 - 0.08 + t * 0.03 - 0.03 * (1 - t)]);
  }
  const steel = creatureMaterial({ color: 0x9aa0a8, metalness: 1, roughness: 0.32, envMapIntensity: 1.4 }, { bump: [50, 0.002, 3], blotch: [0x3a2a1a, 6, 0.6], cavity: 0.3 }, U);
  const bl = new THREE.Mesh(G.blade(outline, 0.004, 0.003), steel);
  bl.position.y = 1.36;
  bl.rotation.y = Math.PI / 2;
  const scythe = new THREE.Group();
  scythe.add(haft, bl);
  scythe.position.y = -0.55;
  hold(rig, "r", scythe, { tilt: 0.55, out: 0.05 });
  // drifting soul wisps
  const wisps = [];
  for (let i = 0; i < 5; i++) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: softSprite(), color: 0x8ab8ff, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, opacity: 0.5 }));
    s.scale.setScalar(0.12);
    rig.root.add(s);
    wisps.push(s);
    mon.glows.push(s);
  }
  mon.extra.push((dt, t) => {
    wisps.forEach((s, i) => {
      const a = t * (0.5 + i * 0.13) + i * 1.7;
      s.position.set(Math.sin(a) * (0.5 + i * 0.07), 0.6 + ((t * 0.25 + i * 0.37) % 1.6), Math.cos(a) * 0.4);
      s.material.opacity = 0.5 * Math.sin((((t * 0.25 + i * 0.37) % 1.6) / 1.6) * Math.PI) * (1 - U.uDissolve.value);
    });
  });
  mon.onStage = (n) => {
    if (n >= 2) for (const s of wisps) s.material.color.set(0xff6a8a);
  };
};

/* -------- Ancient Demon */
BUILD.demon = async (rig, mon, U) => {
  rig.sculpt({
    radial: (n) => (/upperarm/.test(n) ? 1.32 : /lowerarm/.test(n) ? 1.25 : /spine_03|clavicle/.test(n) ? 1.2 : /spine_0[12]/.test(n) ? 1.1 : /thigh/.test(n) ? 1.18 : /calf/.test(n) ? 1.1 : /neck/.test(n) ? 1.35 : 1),
  });
  rig.body.material = bodyMat(
    rig,
    U,
    { color: new THREE.Color(0.32, 0.12, 0.09), roughness: 0.7 },
    { sat: 0.6, bump: [24, 0.016, 5], pores: [160, 0.004], blotch: [0x150605, 2.5, 0.9], cavity: 0.6, cracks: [0xff4a0a, 3.2, 0.07, 4.0, 1], wet: [4, 0.35] },
  );
  if (rig.eyes) rig.eyes.visible = false;
  if (rig.brows) rig.brows.visible = false;
  addEyes(rig, mon, { color: 0xffa020, size: 0.06, intensity: 10, z: 0.07 });
  const hornMat = creatureMaterial({ color: 0x1a1210, roughness: 0.45 }, { bump: [50, 0.006, 3], blotch: [0x605040, 5, 0.5], cavity: 0.4 }, U);
  for (const s of [1, -1]) {
    const h = new THREE.Mesh(G.horn(0.42, 0.04, 1.15, 0.5 * s, 12), hornMat);
    h.castShadow = true;
    rig.atWorld("Head", h, rig.restPos("Head", V(s * 0.06, 0.15, 0.03)), new THREE.Quaternion().setFromEuler(new THREE.Euler(-0.35, s * 0.5, s * -0.9)));
  }
  // claws
  for (const s of ["l", "r"])
    for (const f of ["index", "middle", "ring", "pinky", "thumb"]) {
      const n = `${f}_03_${s}`;
      if (rig.bones[n]) rig.along(n, new THREE.Mesh(G.claw(0.08, 0.008), hornMat), { offset: V(0, rig.len(n) * 0.5, 0), front: V(0, -1, 0) });
    }
  // bat wings on the upper back: a wing arm with four finger struts and a
  // scalloped membrane stretched between them; folded until phase 2
  const wingMat = creatureMaterial(
    { color: 0x3a1410, roughness: 0.55, side: THREE.DoubleSide, emissive: 0x1a0300 },
    { veins: [0x7a2010, 6, 0.035], bump: [30, 0.004, 3], tatter: [9, 0.22, -0.2, -1.2], blotch: [0x0a0202, 3, 0.7] },
    U,
  );
  const wings = [];
  const FING = [
    [0.15, 1.25],
    [0.55, 1.2],
    [0.95, 1.0],
    [1.35, 0.78],
  ]; // angle from outward-horizontal toward down/back, length
  for (const s of [1, -1]) {
    const pivot = new THREE.Group();
    const dirOf = (a) => V(s * Math.cos(a), Math.sin(a) * 0.35 + 0.25, -Math.sin(a) * 0.9);
    const n = 6;
    const geo = G.membrane(8, n * (FING.length - 1), (i, j) => {
      const seg = Math.min(FING.length - 2, Math.floor(j * (FING.length - 1)));
      const u = j * (FING.length - 1) - seg;
      const [a0, l0] = FING[seg];
      const [a1, l1] = FING[seg + 1];
      const d = dirOf(a0 + (a1 - a0) * u).normalize();
      const len = (l0 + (l1 - l0) * u) * (1 - Math.sin(u * Math.PI) * 0.32 * Math.pow(i, 3));
      const r = 0.12 + i * len;
      return V(d.x * r, 0.05 + d.y * r - i * 0.06, d.z * r);
    });
    const m = new THREE.Mesh(geo, wingMat);
    m.castShadow = true;
    pivot.add(m);
    for (const [a, l] of FING) {
      const strut = new THREE.Mesh(G.longBone(l + 0.1, 0.014, 1.4), hornMat);
      strut.quaternion.setFromUnitVectors(UP, dirOf(a).normalize());
      strut.position.copy(dirOf(a).normalize().multiplyScalar(0.06));
      pivot.add(strut);
    }
    rig.atWorld("spine_03", pivot, rig.restPos("spine_03", V(s * 0.09, 0.1, -0.13)));
    wings.push([pivot, s]);
  }
  mon.wings = wings;
  mon.extra.push((dt, t) => {
    const open = mon.stage >= 2 ? 1 : 0.15;
    for (const [p, s] of wings) {
      p.userData.o = (p.userData.o ?? open) + (open - (p.userData.o ?? open)) * Math.min(1, dt * 1.5);
      const o = p.userData.o;
      // folded: swept back and up behind the shoulders; open: spread wide
      p.rotation.set(-0.35 * (1 - o) + Math.sin(t * 1.2) * 0.03, s * (1.05 * (1 - o) + Math.sin(t * 1.4) * 0.06 * o), s * (-0.55 * (1 - o)));
    }
  });
  // tail: chain of segments swinging
  const tail = [];
  let parent = null;
  for (let i = 0; i < 9; i++) {
    const seg = new THREE.Group();
    const mesh = new THREE.Mesh(G.lathe([[0.045 * (1 - i / 10), 0], [0.04 * (1 - i / 10), 0.13]], 10), mon.rig.body.material);
    mesh.rotation.x = Math.PI;
    seg.add(mesh);
    if (!parent) rig.atWorld("pelvis", seg, rig.restPos("pelvis", V(0, 0.02, -0.12)), new THREE.Quaternion().setFromEuler(new THREE.Euler(-2.1, 0, 0)));
    else {
      seg.position.y = -0.13;
      parent.add(seg);
    }
    parent = seg;
    tail.push(seg);
  }
  const tip = new THREE.Mesh(G.horn(0.14, 0.03, 0.2, 0, 4), hornMat);
  tip.rotation.x = Math.PI;
  tip.position.y = -0.13;
  parent.add(tip);
  mon.extra.push((dt, t) => {
    tail.forEach((s, i) => {
      s.rotation.z = Math.sin(t * 1.6 - i * 0.5) * 0.12;
      s.rotation.x = (i ? 0.16 : 0) + Math.sin(t * 1.1 - i * 0.4) * 0.05;
    });
  });
  const L = new THREE.PointLight(0xff5a1a, 1.2, 3.5, 2);
  L.position.set(0, 1.0, 0.5);
  rig.root.add(L);
  mon.onStage = (n) => {
    if (n >= 2) {
      U.uGlow.value = 1.8;
      L.intensity = 2;
    }
  };
};

/* -------- Final Shadow Lord */
BUILD.lord = async (rig, mon, U) => {
  const metal = creatureMaterial({ ...pbrMaps("rusty_metal_02", [1.5, 1.5]), color: 0x2a2630, metalness: 1, roughness: 0.75, envMapIntensity: 1.5 }, { bump: [60, 0.003, 3], cavity: 0.4, cracks: [0x8a40ff, 2.5, 0.04, 0.9, 1] }, U);
  const { mail } = armorMats(U);
  rig.sculpt({ radial: (n) => (/Head/.test(n) ? 0.8 : /spine_03|upperarm/.test(n) ? 1.12 : 1.05) });
  rig.body.material = mail;
  if (rig.eyes) rig.eyes.visible = false;
  if (rig.brows) rig.brows.visible = false;
  plateSuit(rig, mon, U, metal, { helm: false, cape: 0x14081e, capeTatter: 0.35 });
  // skull face inside a horned crown
  await skullOn(rig, mon, boneMaterial(U, 0x9a9488), { eyes: 0xa070ff, offset: V(0, 0.1, 0.03) });
  const gold = creatureMaterial({ color: 0x8a6a2a, metalness: 1, roughness: 0.35, envMapIntensity: 1.6 }, { bump: [60, 0.003, 3], cavity: 0.5 }, U);
  const crown = new THREE.Group();
  const band = new THREE.Mesh(G.plate(0.05, 0.125, 0.13, Math.PI * 2, 30), gold);
  crown.add(band);
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2;
    const big = i === 0 || i === 4 || i === 5;
    const sp = new THREE.Mesh(G.horn(big ? 0.34 : 0.17, big ? 0.022 : 0.014, 0.35, 0, 6), metal);
    sp.position.set(Math.sin(a) * 0.12, 0.04, Math.cos(a) * 0.12);
    sp.rotation.set(-0.15, a + Math.PI, 0);
    crown.add(sp);
  }
  rig.atWorld("Head", crown, rig.restPos("Head", V(0, 0.15, 0.01)));
  mon.crown = crown;
  // sword
  const sword = await loadProp("estoc");
  const s = fitProp(sword, 1.3, "y", false);
  s.position.y = 0.45;
  s.traverse((o) => {
    if (o.isMesh) {
      o.material = o.material.clone();
      o.userData.sharedMat = false;
      o.material.color.set(0x55505a);
      o.material.emissive = new THREE.Color(0x5a20c0);
      o.material.emissiveIntensity = 0.35;
    }
  });
  hold(rig, "r", s, { tilt: 0.1 });
  // shadow aura
  const aura = [];
  for (let i = 0; i < 8; i++) {
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: softSprite(), color: 0x4a1a8a, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, opacity: 0.25 }));
    sp.scale.setScalar(0.5);
    rig.root.add(sp);
    aura.push(sp);
    mon.glows.push(sp);
  }
  mon.extra.push((dt, t) => {
    aura.forEach((sp, i) => {
      const a = t * 0.4 + i * 0.8;
      const h = (t * 0.2 + i * 0.13) % 1;
      sp.position.set(Math.sin(a) * 0.45, 0.2 + h * 1.9, Math.cos(a) * 0.3 - 0.1);
      sp.material.opacity = 0.28 * Math.sin(h * Math.PI) * (mon.stage >= 2 ? 1.6 : 1) * (1 - U.uDissolve.value);
    });
  });
  const L = new THREE.PointLight(0x7a3aff, 1.0, 3.5, 2);
  L.position.set(0, 1.5, 0.5);
  rig.root.add(L);
  mon.onStage = (n) => {
    U.uGlow.value = n >= 3 ? 2.6 : n >= 2 ? 1.8 : 1;
    L.intensity = n >= 3 ? 2.2 : 1.4;
    if (n >= 3 && mon.crown) {
      mon.crown.visible = false;
    }
  };
};
