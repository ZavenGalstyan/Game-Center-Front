/**
 * The two figures of Dead Draw, built on the CC0 Quaternius base body + the
 * CC0 Quaternius animation library through Deck of Shadows' rig system
 * (Rig: bind-pose sculpting and bone attachment, Animator: clip blending with
 * procedural breathing, posture and head tracking toward the camera):
 *
 *  - the Burrower: an original creature — starved, elongated forearms and
 *    fingers, hooked claws, a ridge of bone spurs down the spine, wet grey
 *    skin with veins and blotching (procedural creature shader), milky eyes,
 *    a crouched, hunched gait. Lives under the bunker floor.
 *  - Mara: the survivor at the door (female rig, dark field clothing).
 */
import * as THREE from "three";
import { Rig, Animator, addEyes, bodyMat } from "../../DeckOfShadows/render/monsters.js";
import { creatureMaterial, creatureUniforms } from "../../DeckOfShadows/render/materials.js";
import * as G from "../../DeckOfShadows/render/geo.js";

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);

function wrap(rig, U, spec, extra = []) {
  const anim = new Animator(rig, spec, U);
  const geos = new Set();
  const mats = new Set();
  const F = {
    root: rig.root,
    rig,
    anim,
    U,
    update(dt, camPos) {
      U.uTime.value += dt;
      anim.update(dt, camPos);
      for (const f of extra) f(dt, U.uTime.value);
    },
    play(name, { loop = true, fade = 0.3, timeScale = 1 } = {}) {
      anim.state = "custom";
      anim.antic = null;
      return anim.fadeTo(name, { loop, fade, timeScale });
    },
    idle() {
      anim.idle();
    },
    act(kind) {
      return anim.act(kind);
    },
    hit(p = 1) {
      anim.hit(p, 1);
    },
    headPos(out = V()) {
      return rig.bones.Head.getWorldPosition(out);
    },
    dispose() {
      rig.mixer.stopAllAction();
      rig.mixer.uncacheRoot(rig.scene);
      rig.root.traverse((o) => {
        if (o.isSkinnedMesh) o.skeleton?.dispose?.();
        if (o.geometry && o.geometry !== o.userData.origGeo) geos.add(o.geometry);
        const ms = Array.isArray(o.material) ? o.material : o.material ? [o.material] : [];
        for (const m of ms) if (m !== o.userData.origMat) mats.add(m);
      });
      rig.ownGeo?.dispose();
      for (const g of geos) g.dispose();
      for (const m of mats) m.dispose();
      rig.root.removeFromParent();
    },
  };
  return F;
}

/** rigs = DeckOfShadows loadRigs() result. */
export function buildBurrower(rigs) {
  const rig = new Rig(rigs.male, rigs, false);
  const U = creatureUniforms();
  U.uRimColor.value.set(0x7f93a6);
  U.uRim.value = 0.3;
  rig.sculpt({
    radial: (n) =>
      /upperarm/.test(n) ? 0.58 : /lowerarm/.test(n) ? 0.52 : /thigh/.test(n) ? 0.62 : /calf/.test(n) ? 0.58 : /pelvis|spine_01/.test(n) ? 0.7 : /spine_02/.test(n) ? 0.74 : /spine_03/.test(n) ? 0.8 : /neck/.test(n) ? 0.62 : /hand|index|middle|ring|pinky|thumb/.test(n) ? 0.72 : /Head/.test(n) ? 0.93 : 1,
    shift: (acc, P) => {
      // sunken cheeks, hollow eye sockets, a protruding brow and jaw
      if (P.y > 1.58 && P.z > 0.03) acc.z -= 0.008;
      if (P.y > 1.66 && P.y < 1.72 && P.z > 0.06) acc.z += 0.004;
      if (P.y > 1.5 && P.y < 1.6 && P.z > 0.02) acc.y -= 0.012;
    },
  });
  rig.body.material = bodyMat(
    rig,
    U,
    { color: new THREE.Color(1.15, 1.12, 1.05), roughness: 0.55, envMapIntensity: 0.8 },
    { sat: 0.18, bump: [60, 0.01, 4], pores: [240, 0.003], blotch: [0x4d3f36, 2.6, 0.85], veins: [0x2a2433, 7, 0.05], cavity: 0.6, wet: [6, 0.22] },
  );
  if (rig.brows) rig.brows.visible = false;
  if (rig.eyes) rig.eyes.visible = false;
  addEyes(rig, { glows: [] }, { color: 0xcfd6c4, size: 0.03, intensity: 1.6, z: 0.068, light: false, halo: 0.35 });
  const bone = creatureMaterial({ color: 0x8c8270, roughness: 0.55 }, { bump: [70, 0.006, 3], blotch: [0x3b3026, 4, 0.7], cavity: 0.5 }, U);
  const claw = creatureMaterial({ color: 0x1d1813, roughness: 0.3 }, { bump: [90, 0.003, 2] }, U);
  for (const s of ["l", "r"])
    for (const f of ["index", "middle", "ring", "pinky", "thumb"]) {
      const n = `${f}_03_${s}`;
      if (!rig.bones[n]) continue;
      const c = new THREE.Mesh(G.claw(f === "thumb" ? 0.06 : 0.1, 0.007), claw);
      c.castShadow = true;
      rig.along(n, c, { offset: V(0, rig.len(n) * 0.6, 0), front: V(0, -1, 0) });
    }
  // bone spurs down the spine
  for (const [b, k] of [["spine_01", 0.6], ["spine_02", 0.8], ["spine_03", 1], ["neck_01", 0.7]]) {
    if (!rig.bones[b]) continue;
    for (let i = 0; i < 2; i++) {
      const sp = new THREE.Mesh(G.claw(0.05 * k + i * 0.012, 0.009 * k), bone);
      sp.castShadow = true;
      rig.along(b, sp, { offset: V(0, rig.len(b) * (0.25 + i * 0.45), -0.1 * (b === "neck_01" ? 0.55 : 1)), front: V(0, 0, -1), dir: V(0, 0.4, -1) });
    }
  }
  // elongated forearms and hands (scale tracks are stripped from the clips, so this sticks)
  for (const s of ["l", "r"]) {
    rig.bones[`lowerarm_${s}`]?.scale.set(0.92, 1.32, 0.92);
    rig.bones[`hand_${s}`]?.scale.set(1.0, 1.25, 1.0);
  }
  const spec = {
    idle: "CrouchIdle",
    idleSpeed: 0.8,
    anims: { claw: "Hook", heavy: "SlashC", feed: "Consume", slash: "Hook" },
    breathRate: 2.2,
    breathAmp: 2.6,
    track: 0.9,
    posture: [
      ["spine_02", 0.26],
      ["spine_03", 0.2],
      ["neck_01", -0.32],
    ],
  };
  rig.root.scale.setScalar(1.18);
  const F = wrap(rig, U, spec);
  F.height = 1.8 * 1.18;
  return F;
}

export function buildMara(rigs) {
  const rig = new Rig(rigs.female, rigs, true);
  const U = creatureUniforms();
  U.uRimColor.value.set(0x9aa7b5);
  U.uRim.value = 0.15;
  // field jacket + trousers: everything but the head and hands takes the cloth mask
  rig.sculpt({
    radial: (n) => (/spine|pelvis|upperarm|thigh/.test(n) ? 1.06 : 1),
    mask: (n) => (/Head|neck|hand|index|middle|ring|pinky|thumb/.test(n) ? 0 : 1),
  });
  rig.body.material = bodyMat(rig, U, { color: new THREE.Color(0.86, 0.74, 0.66), roughness: 0.6, envMapIntensity: 0.4 }, { sat: 0.7, bump: [40, 0.003, 3], blotch: [0x7a5a48, 3, 0.3], mask: [0x55543f, 0.95, 0], cavity: 0.3 });
  for (const h of rig.hair) {
    h.visible = true;
    h.material = h.material.clone();
    h.material.color = new THREE.Color(0x2a1d16);
  }
  const spec = { idle: "Idle", idleSpeed: 0.8, anims: { slash: "Cross" }, breathAmp: 1.0, track: 0.7, posture: [["spine_03", 0.06]] };
  const F = wrap(rig, U, spec);
  F.height = 1.7;
  return F;
}
