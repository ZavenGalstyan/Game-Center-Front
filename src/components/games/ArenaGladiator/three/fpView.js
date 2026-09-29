/**
 * Arena Gladiator — first-person view model.
 *
 * Arms, hands, weapon and shield seen from the gladiator's eyes. They are
 * posed every frame from the SAME engine pose as the third-person body
 * (engine/pose.js handPose) — same phases, same arcs, same timing — then
 * presented in camera space with a fixed "presentation" offset (raised and
 * pushed forward a little, like every first-person game) so the guard is
 * visible at the bottom of the screen instead of below the view.
 *
 * The view model lives in its own scene and is drawn after the world with a
 * cleared depth buffer (see FightScene), so the sword never clips into a
 * wall or pillar, and never into the camera near plane.
 */
import * as THREE from "three";
import { BODY } from "../engine/constants.js";
import { handPose } from "../engine/pose.js";
import { clamp } from "../engine/math.js";
import { buildWeaponMesh, buildShieldMesh, disposeShield, matOf } from "./weapons3d.js";
import { solveTwoBone, orientBlade } from "./gladiator.js";
import { leatherTexture } from "./textures.js";

const RAISE = 0.21; // presentation offset (m, camera space)
const PUSH = 0.1;
const EYE_F = 0.1; // eye sits this far in front of the body axis

function ellipsoid(rx, ry, rz) {
  const g = new THREE.SphereGeometry(1, 16, 12);
  g.scale(rx, ry, rz);
  return g;
}
function lathe(pts, seg = 16, sx = 1, sz = 1) {
  const g = new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), seg);
  if (sx !== 1 || sz !== 1) g.scale(sx, 1, sz);
  g.computeVertexNormals();
  return g;
}

export function createViewModel(look, equip) {
  const scene = new THREE.Scene();
  const hemi = new THREE.HemisphereLight("#fff4e0", "#5a4a38", 1.0);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight("#fff1d8", 1.6);
  sun.position.set(0.4, 1, 0.3);
  scene.add(sun);
  const group = new THREE.Group(); // = camera frame (+ body yaw offset)
  scene.add(group);
  const sway = new THREE.Group();
  group.add(sway);

  const skin = matOf(look.skin || "#b98563", 0.6);
  const leather = matOf(look.leather || "#6b4a2e", 0.78, 0, { map: leatherTexture(look.leather || "#6b4a2e") });
  const metal = matOf(look.metal || "#a9a39a", 0.32, 0.85);
  const cloth = matOf(look.cloth || "#8c2f23", 0.9);
  const armor = equip.armor || "balanced";
  const upperG = lathe([[0.001, 0.07], [0.05, 0.06], [0.074, 0.02], [0.08, -0.05], [0.082, -0.12], [0.074, -0.2], [0.064, -0.26], [0.058, -0.29], [0.001, -0.3]], 16, 1, 1.05);
  const foreG = lathe([[0.001, 0.045], [0.045, 0.035], [0.06, 0.0], [0.066, -0.06], [0.062, -0.13], [0.052, -0.2], [0.044, -0.25], [0.001, -0.27]], 16, 1.1, 0.92);
  const bracerG = lathe([[0.058, -0.08], [0.066, -0.12], [0.06, -0.24], [0.052, -0.26]], 14, 1.1, 0.95);
  const segG = lathe([[0.086, 0.02], [0.093, 0.0], [0.091, -0.045], [0.081, -0.05]], 16, 1.02, 1.02);

  const arms = {};
  for (const [side, sx] of [["R", 1], ["L", -1]]) {
    const sh = new THREE.Group();
    sh.position.set(sx * 0.21, -0.25, 0.08);
    sway.add(sh);
    const upper = new THREE.Group();
    sh.add(upper);
    upper.add(new THREE.Mesh(upperG, skin));
    const fore = new THREE.Group();
    fore.position.y = -BODY.upperArm;
    upper.add(fore);
    fore.add(new THREE.Mesh(foreG, skin));
    fore.add(new THREE.Mesh(bracerG, leather));
    if ((side === "R" && armor !== "light") || armor === "heavy") {
      for (let i = 0; i < 4; i++) {
        const m = new THREE.Mesh(segG, metal);
        m.position.y = -0.02 - i * 0.05;
        m.scale.set(0.82 - i * 0.05, 1, 0.8 - i * 0.05);
        fore.add(m);
      }
    }
    if (armor === "light") {
      const w = new THREE.Mesh(lathe([[0.063, 0.0], [0.066, -0.05], [0.062, -0.1]], 12), cloth);
      w.position.y = -0.05;
      fore.add(w);
    }
    const hand = new THREE.Group();
    hand.position.y = -BODY.foreArm;
    fore.add(hand);
    hand.add(new THREE.Mesh(ellipsoid(0.048, 0.058, 0.044), skin));
    const kn = new THREE.Mesh(ellipsoid(0.05, 0.024, 0.036), skin);
    kn.position.set(0, -0.035, 0.02);
    hand.add(kn);
    const th = new THREE.Mesh(ellipsoid(0.017, 0.034, 0.017), skin);
    th.position.set(-sx * 0.035, -0.01, 0.03);
    th.rotation.set(0.4, 0, -sx * 0.4);
    hand.add(th);
    arms[side] = { sh, upper, fore, hand, sx, smooth: null };
  }

  const W = equip.weapon;
  const weapons = {};
  for (const side of ["R", "L"]) {
    const bl = W.blades[side];
    if (bl) {
      const m = buildWeaponMesh(bl.model);
      sway.add(m);
      weapons[side] = { mesh: m, prevDir: new THREE.Vector3(0, 1, 0), smoothDir: null };
    }
  }
  let shield = null;
  if (W.shield) {
    shield = buildShieldMesh(W.shield.model, equip.shieldColor || look.cloth, equip.shieldTrim || look.accent, equip.pattern || 0);
    sway.add(shield);
  }
  scene.traverse((o) => {
    if (o.isMesh) {
      o.castShadow = false;
      o.receiveShadow = false;
      o.frustumCulled = false;
    }
  });

  // flash sprite for parries / blocks seen in first person
  const flashMat = new THREE.SpriteMaterial({ color: "#ffe2a0", transparent: true, opacity: 0, depthTest: false, blending: THREE.AdditiveBlending });
  const flash = new THREE.Sprite(flashMat);
  flash.scale.set(0.25, 0.25, 0.25);
  sway.add(flash);

  return {
    scene, group, sway, arms, weapons, shield, sun, hemi, flash, flashT: 0,
    swayX: 0, swayY: 0, lastYaw: null, lastPitch: null, kick: 0,
  };
}

export function disposeViewModel(vm) {
  if (!vm) return;
  disposeShield(vm.shield);
  vm.flash.material.dispose();
}

const lp = {};
const _hand = new THREE.Vector3();
const _dir = new THREE.Vector3();
const _pole = new THREE.Vector3();
const _hint = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _n = new THREE.Vector3();
const _x = new THREE.Vector3();
const _y = new THREE.Vector3();
const _m = new THREE.Matrix4();
const UP = new THREE.Vector3(0, 1, 0);

/** Engine-local (r,u,f) point → view-model (camera) space, with presentation offset. */
function toCam(out, r, u, f) {
  return out.set(r, u - BODY.eyeY + RAISE, -(f - EYE_F) - PUSH);
}

/**
 * Pose the view model for this frame.
 * cam: THREE.Camera (already placed); yawOffset: body yaw − look yaw
 * look: { yaw, pitch } current look angles (for sway)
 */
export function poseViewModel(vm, f, cam, dt, { yawOffset = 0, look = null, bob = 0, reduced = false } = {}) {
  // frame = camera, turned to the body's facing
  vm.group.position.copy(cam.position);
  vm.group.quaternion.copy(cam.quaternion);
  if (yawOffset) {
    _q.setFromAxisAngle(UP, yawOffset);
    vm.group.quaternion.premultiply(_q);
  }
  // sway: the weapon lags a touch behind fast mouse movement
  if (look) {
    if (vm.lastYaw != null && dt > 0) {
      const dy = (look.yaw - vm.lastYaw) / dt;
      const dp = (look.pitch - vm.lastPitch) / dt;
      const tx = reduced ? 0 : clamp(dy * 0.006, -0.035, 0.035);
      const ty = reduced ? 0 : clamp(-dp * 0.006, -0.03, 0.03);
      vm.swayX += (tx - vm.swayX) * Math.min(1, dt * 10);
      vm.swayY += (ty - vm.swayY) * Math.min(1, dt * 10);
    }
    vm.lastYaw = look.yaw;
    vm.lastPitch = look.pitch;
  }
  vm.kick = Math.max(0, vm.kick - dt * 6);
  vm.sway.position.set(vm.swayX, vm.swayY + bob * 0.4 - vm.kick * 0.03, vm.kick * 0.05);
  vm.sway.rotation.set(-vm.kick * 0.08, 0, 0);
  vm.group.updateMatrixWorld(true);

  const attacking = f.act && f.act.type === "attack";
  for (const side of ["R", "L"]) {
    const arm = vm.arms[side];
    const pose = handPose(f, side, lp);
    if (pose) {
      toCam(_hand, lp.hx, lp.hy, lp.hz);
      // resting shield sits lower and further left so it frames the view instead of filling it
      if (side === "L" && vm.shield) {
        const rest = 1 - clamp(f.guardBlend, 0, 1);
        _hand.x -= 0.1 * rest;
        _hand.y -= 0.1 * rest;
      }
    }
    else _hand.set(arm.sx * 0.32, -0.62, -0.1); // empty hand stays low, out of view
    vm.sway.localToWorld(_hand);
    if (!arm.smooth) arm.smooth = _hand.clone();
    if (attacking) arm.smooth.copy(_hand);
    else arm.smooth.lerp(_hand, Math.min(1, dt * 24));
    // elbow down and out
    _pole.set(arm.sx * 0.8, -0.8, 0.25).applyQuaternion(vm.group.quaternion);
    solveTwoBone(arm.upper, arm.fore, BODY.upperArm, BODY.foreArm, arm.smooth, _pole.clone(), null);

    const wpn = vm.weapons[side];
    if (wpn && pose) {
      _dir.set(lp.dx, lp.dy, -lp.dz).applyQuaternion(vm.group.quaternion).normalize();
      if (!wpn.smoothDir) wpn.smoothDir = _dir.clone();
      if (attacking) wpn.smoothDir.copy(_dir);
      else wpn.smoothDir.lerp(_dir, Math.min(1, dt * 24)).normalize();
      // guard edge: forward/down in camera space
      _hint.set(-arm.sx * 0.35, -0.4, -0.6).applyQuaternion(vm.group.quaternion);
      orientBlade(wpn.mesh, arm.smooth, wpn.smoothDir, wpn.prevDir, _hint);
      wpn.prevDir.copy(wpn.smoothDir);
      // mesh is a child of `sway` → convert world → local
      vm.sway.worldToLocal(wpn.mesh.position);
      _q.copy(vm.sway.getWorldQuaternion(new THREE.Quaternion())).invert();
      wpn.mesh.quaternion.premultiply(_q);
    }
    if (side === "L" && vm.shield && pose) {
      _n.set(lp.dx, lp.dy, -lp.dz).applyQuaternion(vm.group.quaternion).normalize();
      _x.crossVectors(UP, _n).normalize();
      _y.crossVectors(_n, _x);
      _m.makeBasis(_x, _y, _n);
      vm.shield.quaternion.setFromRotationMatrix(_m);
      vm.shield.position.copy(arm.smooth).addScaledVector(_n, 0.05);
      vm.sway.worldToLocal(vm.shield.position);
      _q.copy(vm.sway.getWorldQuaternion(new THREE.Quaternion())).invert();
      vm.shield.quaternion.premultiply(_q);
    }
  }

  // parry / block flash fades out
  if (vm.flashT > 0) {
    vm.flashT = Math.max(0, vm.flashT - dt * 5);
    vm.flash.material.opacity = vm.flashT;
    const s = 0.18 + (1 - vm.flashT) * 0.25;
    vm.flash.scale.set(s, s, s);
  }
}

/** Trigger a spark flash at the defending item (shield if any, else blade). */
export function viewModelFlash(vm, color = "#ffe2a0") {
  const target = vm.shield || (vm.weapons.R && vm.weapons.R.mesh);
  if (!target) return;
  vm.flash.position.copy(target.position);
  if (!vm.shield && vm.weapons.R) {
    // a bit up the blade
    _e.setFromQuaternion(target.quaternion);
    vm.flash.position.add(new THREE.Vector3(0, 0.4, 0).applyQuaternion(target.quaternion));
  } else vm.flash.position.z += 0.06;
  vm.flash.material.color.set(color);
  vm.flashT = 1;
  vm.kick = 1;
}

export function viewModelImpact(vm, amount = 1) {
  vm.kick = Math.max(vm.kick, amount);
}
