/**
 * Strike Force — first-person weapon + arms, rendered in their own scene on
 * top of the world (depth cleared) so the gun never clips into walls.
 *
 * Driven every frame from the player's combatant + weapon state:
 *   hip ↔ ADS (sight anchor aligned on the view axis), sprint pose,
 *   look sway, movement bob, landing dip, recoil springs, switch raise,
 *   reload timelines per type (magazine, shell-by-shell, revolver),
 *   bolt / pump cycling, pistol slide, inspect, muzzle flash, brass.
 * Arms are two-bone IK chains from off-screen shoulders to the grips.
 */
import * as THREE from "three";
import { buildGun } from "./guns.js";
import { flashSideTexture, flashTexture, getTextureSet } from "./textures.js";
import { gunMaterials } from "./guns.js";

const UA = 0.4;
const FA = 0.42;
const DOWN = new THREE.Vector3(0, -1, 0);
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const ease = (t) => t * t * (3 - 2 * t);
const seg = (p, a, b) => clamp((p - a) / (b - a), 0, 1);

export function createViewmodel({ quality = "medium" } = {}) {
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(52, 16 / 9, 0.01, 20);
  const hemi = new THREE.HemisphereLight("#cfe0f0", "#5a5248", 0.9);
  const key = new THREE.DirectionalLight("#ffffff", 2.2);
  key.position.set(0.5, 1, 0.3);
  const fill = new THREE.DirectionalLight("#9fb6d6", 0.5);
  fill.position.set(-0.6, 0.2, 0.4);
  const flashLight = new THREE.PointLight("#ffb46a", 0, 2.5, 2);
  scene.add(hemi, key, key.target, fill, flashLight, camera);

  const rig = new THREE.Group(); // sway / bob / recoil
  camera.add(rig);
  const holder = new THREE.Group(); // hip/ads placement
  rig.add(holder);

  /* ------------------------------------------------------------ arms */
  const camo = getTextureSet("camo", 256, { seed: 3 });
  const camoMap = camo.map.clone();
  camoMap.repeat.set(2.5, 1.2);
  camoMap.needsUpdate = true;
  const camoN = camo.normalMap.clone();
  camoN.repeat.set(2.5, 1.2);
  camoN.needsUpdate = true;
  const sleeveMat = new THREE.MeshStandardMaterial({ map: camoMap, normalMap: quality === "low" ? null : camoN, color: "#a4967a", roughness: 0.9 });
  const gloveMat = new THREE.MeshStandardMaterial({ color: "#2b2b29", roughness: 0.7, metalness: 0.05 });
  const padMat = new THREE.MeshStandardMaterial({ color: "#6f6347", roughness: 0.75 });
  const mkArm = () => {
    const upper = new THREE.Group();
    const um = new THREE.Mesh(new THREE.CapsuleGeometry(0.046, UA - 0.04, 4, 12).translate(0, -UA / 2, 0), sleeveMat);
    upper.add(um);
    const fore = new THREE.Group();
    fore.position.y = -UA;
    upper.add(fore);
    const fm = new THREE.Mesh(new THREE.CapsuleGeometry(0.04, FA - 0.1, 4, 12).translate(0, -FA / 2 + 0.03, 0), sleeveMat);
    fore.add(fm);
    const cuff = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.047, 0.07, 12).translate(0, -FA + 0.07, 0), gloveMat);
    fore.add(cuff);
    const hand = new THREE.Group();
    hand.position.y = -FA;
    fore.add(hand);
    const palm = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.09, 0.04).translate(0, -0.035, 0), gloveMat);
    hand.add(palm);
    const fingers = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.05, 0.045).translate(0, -0.085, -0.018), gloveMat);
    fingers.rotation.x = 0.6;
    hand.add(fingers);
    const thumb = new THREE.Mesh(new THREE.CapsuleGeometry(0.014, 0.04, 2, 6).translate(0.035, -0.04, -0.02), gloveMat);
    thumb.rotation.z = -0.5;
    hand.add(thumb);
    const pad = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.04, 0.03).translate(0, -0.12, -0.05), padMat);
    upper.add(pad);
    rig.add(upper);
    return { upper, fore, hand };
  };
  const armR = mkArm();
  const armL = mkArm();
  const shoulderR = new THREE.Vector3(0.27, -0.44, 0.12);
  const shoulderL = new THREE.Vector3(-0.06, -0.52, -0.22);
  const poleR = new THREE.Vector3(0.9, -0.5, 0.3);
  const poleL = new THREE.Vector3(-0.5, -0.85, 0.2);

  const _d = new THREE.Vector3();
  const _a = new THREE.Vector3();
  const _e = new THREE.Vector3();
  const _w = new THREE.Vector3();
  const _b = new THREE.Vector3();
  const _p = new THREE.Vector3();
  const _q = new THREE.Quaternion();
  const _q2 = new THREE.Quaternion();
  function solve(arm, shoulder, target, pole, roll = 0) {
    _d.subVectors(target, shoulder);
    let dist = _d.length();
    const maxR = UA + FA - 0.004;
    if (dist > maxR) {
      _d.multiplyScalar(maxR / dist);
      dist = maxR;
    }
    _a.copy(_d).normalize();
    const cosA = (UA * UA + dist * dist - FA * FA) / (2 * UA * dist);
    const angA = Math.acos(clamp(cosA, -1, 1));
    _p.copy(pole).addScaledVector(_a, -pole.dot(_a)).normalize();
    _e.copy(shoulder).addScaledVector(_a, Math.cos(angA) * UA).addScaledVector(_p, Math.sin(angA) * UA);
    _w.copy(shoulder).add(_d);
    arm.upper.position.copy(shoulder);
    _b.subVectors(_e, shoulder).normalize();
    _q.setFromUnitVectors(DOWN, _b);
    arm.upper.quaternion.copy(_q);
    _b.subVectors(_w, _e).normalize();
    _q2.setFromUnitVectors(DOWN, _b);
    arm.fore.quaternion.copy(_q.clone().invert().multiply(_q2));
    arm.hand.rotation.set(0, roll, 0);
  }

  /* ------------------------------------------------------------ guns */
  const guns = new Map();
  let gun = null;
  let gunId = "";
  function getGun(id) {
    if (!guns.has(id)) {
      const g = buildGun(id, { shadow: false });
      g.root.visible = false;
      holder.add(g.root);
      // first-person flash planes at the muzzle
      const fm = new THREE.MeshBasicMaterial({ map: flashTexture(), color: new THREE.Color("#ffe0b0").multiplyScalar(2.2), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, side: THREE.DoubleSide });
      const sm = new THREE.MeshBasicMaterial({ map: flashSideTexture(), color: new THREE.Color("#ffd29a").multiplyScalar(2), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, side: THREE.DoubleSide });
      const flash = new THREE.Group();
      const front = new THREE.Mesh(new THREE.PlaneGeometry(0.16, 0.16), fm);
      flash.add(front);
      for (const r of [0, Math.PI / 2]) {
        const side = new THREE.Mesh(new THREE.PlaneGeometry(0.26, 0.11).translate(-0.13, 0, 0), sm);
        side.rotation.set(0, Math.PI / 2, r);
        flash.add(side);
      }
      flash.visible = false;
      g.anchors.muzzle.add(flash);
      g.flash = flash;
      g.flashMats = [fm, sm];
      guns.set(id, g);
    }
    return guns.get(id);
  }

  /* ------------------------------------------------------------ brass */
  const mats = gunMaterials();
  const brassGeo = new THREE.CylinderGeometry(0.0045, 0.0045, 0.022, 6);
  const shellGeo = new THREE.CylinderGeometry(0.009, 0.009, 0.05, 8);
  const shellMat = new THREE.MeshStandardMaterial({ color: "#b8321f", roughness: 0.5 });
  const MAX_B = 14;
  const brass = [];
  for (let i = 0; i < MAX_B; i++) {
    const m = new THREE.Mesh(brassGeo, mats.brass);
    m.visible = false;
    scene.add(m);
    brass.push({ m, v: new THREE.Vector3(), s: new THREE.Vector3(), life: 0 });
  }
  let bHead = 0;
  function eject(shotgun = false) {
    if (!gun) return;
    const b = brass[bHead];
    bHead = (bHead + 1) % MAX_B;
    gun.anchors.eject.getWorldPosition(b.m.position);
    camera.worldToLocal(b.m.position);
    b.m.position.applyMatrix4(camera.matrixWorld);
    b.m.geometry = shotgun ? shellGeo : brassGeo;
    b.m.material = shotgun ? shellMat : mats.brass;
    b.m.visible = true;
    b.life = 0.9;
    // in camera space: right, up, slightly back
    b.v.set(1.4 + Math.random() * 0.8, 1.2 + Math.random() * 0.8, 0.4 + Math.random() * 0.4).applyQuaternion(camera.quaternion);
    b.s.set(Math.random() * 20, Math.random() * 20, Math.random() * 20);
  }

  /* ------------------------------------------------------------ state */
  const S = {
    ads: 0,
    swayX: 0,
    swayY: 0,
    swayVX: 0,
    swayVY: 0,
    bob: 0,
    bobAmp: 0,
    land: 0,
    landV: 0,
    kickZ: 0,
    kickZV: 0,
    kickR: 0,
    kickRV: 0,
    kickRoll: 0,
    sprint: 0,
    crouch: 0,
    raise: 1,
    flashT: 0,
    slide: 0,
    inspect: 0,
    inspectT: -1,
    reloadP: -1,
    cycleP: -1,
    shellT: 0,
    lastMag: 0,
    lastShellPhase: 0,
    scopeHide: false,
    jumpY: 0,
  };

  function setWeapon(id) {
    if (id === gunId) return;
    if (gun) gun.root.visible = false;
    gun = getGun(id);
    gunId = id;
    gun.root.visible = true;
    S.inspectT = -1;
  }

  /** feed look deltas (radians) for sway */
  function look(dx, dy) {
    S.swayVX += clamp(dx, -0.2, 0.2) * 2.6;
    S.swayVY += clamp(dy, -0.2, 0.2) * 2.6;
  }
  function onShot(def) {
    if (!gun) return;
    const k = def.cat === "sniper" ? 1.6 : def.cat === "shotgun" ? 1.4 : def.cat === "pistol" ? 1.1 : def.cat === "lmg" ? 0.8 : 0.7;
    const adsK = 1 - S.ads * 0.55;
    S.kickZV += 2.4 * k * adsK;
    S.kickRV += (def.recoilV * 0.35 + 0.4) * k * adsK;
    S.kickRoll = (Math.random() - 0.5) * 0.06 * k;
    S.flashT = def.silenced ? 0 : 0.045;
    S.slide = 1;
    gun.flash.rotation.z = Math.random() * Math.PI * 2;
    const s = (def.cat === "shotgun" || def.cat === "sniper" ? 1.5 : 1) * (0.85 + Math.random() * 0.3);
    gun.flash.scale.setScalar(s);
    if (def.mode !== "bolt" && def.mode !== "pump" && !gun.meta.revolver) eject(false);
    S.inspectT = -1;
  }
  function onLand(v) {
    S.landV -= Math.min(1.2, v * 0.06);
  }
  function inspect() {
    if (S.inspectT < 0) S.inspectT = 0;
  }

  const tmp = new THREE.Vector3();
  const gripL = new THREE.Vector3();
  const gripR = new THREE.Vector3();
  const m4 = new THREE.Matrix4();

  /**
   * p: player combatant, ws: current weapon state, fov: degrees
   * env: { moving 0..1, speed, grounded, dt, time }
   */
  function update(p, ws, dt, fovDeg, aspect) {
    if (!gun) return;
    camera.fov = fovDeg * (1 - 0.12 * ease(p.ads));
    camera.aspect = aspect;
    camera.updateProjectionMatrix();
    const def = ws.def;
    const meta = gun.meta;
    const damp = (a, b, k) => a + (b - a) * (1 - Math.exp(-k * dt));
    S.ads = p.ads;
    S.sprint = damp(S.sprint, p.sprinting ? 1 : 0, 9);
    S.crouch = damp(S.crouch, p.crouch, 8);
    // raise after swap / spawn
    const raiseTotal = def.raise || 0.4;
    const raiseK = p.switchT > 0 ? 1 - clamp(p.switchT / raiseTotal, 0, 1) : 1;
    S.raise = damp(S.raise, raiseK, 30);
    // sway spring
    S.swayVX += (-S.swayX * 60 - S.swayVX * 9) * dt;
    S.swayVY += (-S.swayY * 60 - S.swayVY * 9) * dt;
    S.swayX += S.swayVX * dt;
    S.swayY += S.swayVY * dt;
    // recoil springs
    S.kickZV += (-S.kickZ * 260 - S.kickZV * 22) * dt;
    S.kickZ += S.kickZV * dt;
    S.kickRV += (-S.kickR * 240 - S.kickRV * 20) * dt;
    S.kickR += S.kickRV * dt;
    S.kickRoll *= Math.exp(-10 * dt);
    S.landV += (-S.land * 90 - S.landV * 12) * dt;
    S.land += S.landV * dt;
    // bob
    const speed = Math.hypot(p.vx, p.vz);
    S.bobAmp = damp(S.bobAmp, p.grounded ? Math.min(1, speed / 4.7) : 0, 8);
    S.bob += dt * (speed > 0.3 ? (p.sprinting ? 13 : 9.5) : 2) * (p.crouch > 0.5 ? 0.7 : 1);
    S.jumpY = damp(S.jumpY, p.grounded ? 0 : p.vy > 0 ? -0.02 : 0.015, 8);
    const ads = ease(S.ads);
    const bobK = S.bobAmp * (1 - ads * 0.85) * (1 + S.sprint * 0.8);
    const bx = Math.sin(S.bob) * 0.012 * bobK;
    const by = -Math.abs(Math.cos(S.bob)) * 0.01 * bobK;
    const idle = (1 - S.bobAmp) * (1 - ads * 0.8);
    const breathe = Math.sin(performance.now() / 1000 * 1.6) * 0.0016 * idle;

    // hip / ads placement
    const pistol = meta.pistol;
    const hip = pistol ? [0.13, -0.15, -0.44] : [0.15, -0.165, -0.4];
    const sight = gun.anchors.sight.position;
    // ADS: the sight anchor (eye point behind the sight) lands just in front of the eye
    const adsPos = [-sight.x, -sight.y, -0.02 - sight.z];
    const x = hip[0] + (adsPos[0] - hip[0]) * ads;
    const y = hip[1] + (adsPos[1] - hip[1]) * ads;
    const z = hip[2] + (adsPos[2] - hip[2]) * ads;
    holder.position.set(x - S.crouch * 0.01 * (1 - ads), y + S.crouch * 0.008 * (1 - ads), z);
    holder.rotation.set(0, 0, 0);
    // sprint pose
    const sp = S.sprint * (1 - ads);
    if (pistol) {
      holder.position.y -= sp * 0.07;
      holder.rotation.x -= sp * 0.55;
    } else {
      holder.position.x -= sp * 0.04;
      holder.position.y -= sp * 0.05;
      holder.rotation.y += sp * 0.75;
      holder.rotation.x -= sp * 0.2;
      holder.rotation.z += sp * 0.35;
    }
    // raise / lower on switch
    const low = 1 - ease(S.raise);
    holder.position.y -= low * 0.28;
    holder.rotation.x -= low * 0.9;

    // reload / cycle timelines
    let reloadP = -1;
    if (ws.reloading) reloadP = clamp(1 - ws.reloadT / Math.max(0.05, def.perShell ? ws.reloadTotal : ws.reloadTotal), 0, 1);
    let cycleP = -1;
    if (ws.cycleT > 0 && def.cycle) cycleP = 1 - ws.cycleT / def.cycle;
    let lhOverride = null;
    let rhOverride = null;
    // reset moving parts
    if (gun.parts.mag) {
      gun.parts.mag.position.set(0, 0, 0);
      gun.parts.mag.rotation.set(0, 0, 0);
      gun.parts.mag.visible = true;
    }
    if (gun.parts.bolt) gun.parts.bolt.position.set(0, 0, 0);
    if (gun.parts.bolt) gun.parts.bolt.rotation.set(0, 0, 0);
    if (gun.parts.pump) gun.parts.pump.position.set(0, 0, 0);
    if (gun.parts.slide) {
      gun.parts.slide.position.set(0, 0, 0);
      gun.parts.slide.rotation.set(0, 0, 0);
    }

    if (reloadP >= 0) {
      if (def.perShell) {
        // tilt port up, left hand loads shells in a loop
        const tilt = ease(seg(reloadP, 0, 0.08)) * (1 - ease(seg(reloadP, 0.94, 1)));
        holder.rotation.z += tilt * 0.55;
        holder.rotation.x += tilt * 0.15;
        holder.position.y -= tilt * 0.03;
        const shellPeriod = def.shellTime;
        const tIn = (ws.reloadTotal * reloadP) % shellPeriod;
        const k = tIn / shellPeriod;
        gun.parts.mag.visible = k < 0.75;
        gun.parts.mag.position.set(0.0, -0.06 + ease(seg(k, 0, 0.7)) * 0.05, -0.12 + ease(seg(k, 0.3, 0.7)) * 0.06);
        lhOverride = tmp.set(0, -0.07 + ease(seg(k, 0, 0.6)) * 0.04, -0.11 + ease(seg(k, 0.3, 0.7)) * 0.05);
      } else if (meta.revolver) {
        const open = ease(seg(reloadP, 0.08, 0.2)) * (1 - ease(seg(reloadP, 0.82, 0.92)));
        holder.rotation.z += open * 0.6;
        holder.rotation.x += open * 0.3;
        gun.parts.slide.position.x = -open * 0.035;
        gun.parts.slide.rotation.z = open * 0.4;
        const eject = seg(reloadP, 0.2, 0.32);
        if (eject > 0 && eject < 1 && S.lastShellPhase < 1) {
          for (let k = 0; k < 4; k++) setTimeout(() => ejectDown(), k * 30);
          S.lastShellPhase = 1;
        }
        if (reloadP < 0.15) S.lastShellPhase = 0;
        gun.parts.mag.visible = reloadP > 0.45 && reloadP < 0.8;
        gun.parts.mag.position.set(-0.035, -0.08 + ease(seg(reloadP, 0.45, 0.75)) * 0.08, 0);
        lhOverride = tmp.set(-0.03, -0.08 + ease(seg(reloadP, 0.4, 0.75)) * 0.07, 0.0);
      } else {
        const tilt = ease(seg(reloadP, 0, 0.14)) * (1 - ease(seg(reloadP, 0.86, 1)));
        holder.rotation.z += tilt * 0.42;
        holder.rotation.x += tilt * 0.12;
        holder.position.y -= tilt * 0.025;
        holder.position.x -= tilt * 0.02;
        // mag out → hand to belt → new mag in
        const out = ease(seg(reloadP, 0.12, 0.3));
        const inn = ease(seg(reloadP, 0.48, 0.68));
        const magY = -0.28 * out * (1 - inn);
        gun.parts.mag.position.y = magY;
        gun.parts.mag.position.z = 0.04 * out * (1 - inn);
        gun.parts.mag.rotation.x = -0.4 * out * (1 - inn);
        gun.parts.mag.visible = !(reloadP > 0.3 && reloadP < 0.42);
        const mp = gun.anchors.mag.position;
        if (reloadP < 0.78) {
          const toBelt = ease(seg(reloadP, 0.28, 0.38)) * (1 - ease(seg(reloadP, 0.42, 0.5)));
          lhOverride = tmp.set(mp.x - 0.01, mp.y + magY - 0.02 - toBelt * 0.12, mp.z + 0.01 + toBelt * 0.08);
        }
        // charging / bolt release on empty reloads
        if (ws.reloadEmpty && gun.parts.bolt) {
          const pull = Math.sin(seg(reloadP, 0.74, 0.88) * Math.PI);
          gun.parts.bolt.position.z = pull * 0.05;
          if (pull > 0.05 && !pistol) rhOverride = null;
        }
        if (pistol && gun.parts.slide && ws.reloadEmpty) gun.parts.slide.position.z = (1 - ease(seg(reloadP, 0.75, 0.85))) * 0.03;
      }
    }
    if (cycleP >= 0 && reloadP < 0) {
      if (def.mode === "bolt" && gun.parts.bolt) {
        const up = ease(seg(cycleP, 0.12, 0.28)) * (1 - ease(seg(cycleP, 0.72, 0.86)));
        const back = ease(seg(cycleP, 0.28, 0.45)) * (1 - ease(seg(cycleP, 0.55, 0.72)));
        gun.parts.bolt.rotation.z = up * 1.1;
        gun.parts.bolt.position.z = back * 0.09;
        if (back > 0.9 && S.cycleP < 0.5) eject(false);
        holder.rotation.z += up * 0.12;
        rhOverride = new THREE.Vector3(0.075, 0.02 + up * 0.03, 0.04 + back * 0.09);
        S.cycleP = back;
      } else if (def.mode === "pump" && gun.parts.pump) {
        const back = Math.sin(seg(cycleP, 0.1, 0.65) * Math.PI);
        gun.parts.pump.position.z = back * 0.1;
        if (back > 0.9 && S.cycleP < 0.5) eject(true);
        S.cycleP = back;
        holder.rotation.x += back * 0.03;
      }
    } else S.cycleP = 0;
    // pistol slide / AR bolt carrier on fire
    S.slide = damp(S.slide, 0, 26);
    if (gun.parts.slide && !meta.revolver && reloadP < 0) gun.parts.slide.position.z = S.slide * 0.032 + (ws.mag === 0 ? 0.03 : 0);
    if (gun.parts.bolt && def.mode !== "bolt" && reloadP < 0) gun.parts.bolt.position.z = S.slide * 0.04;
    if (meta.revolver && gun.parts.slide && reloadP < 0) gun.parts.slide.rotation.z = (ws.mag % 6) * (Math.PI / 3);

    // inspect
    if (S.inspectT >= 0) {
      S.inspectT += dt;
      const k = S.inspectT / 2.6;
      if (k >= 1 || ws.reloading || p.ads > 0.1 || p.sprinting) S.inspectT = -1;
      else {
        const a = ease(seg(k, 0, 0.2)) * (1 - ease(seg(k, 0.8, 1)));
        const turn = ease(seg(k, 0.15, 0.5)) - ease(seg(k, 0.55, 0.85)) * 0.6;
        holder.rotation.y += a * 0.9 * (0.5 + turn * 0.6);
        holder.rotation.z += a * 0.5 * (1 - turn);
        holder.rotation.x += a * 0.2;
        holder.position.x -= a * 0.05;
        holder.position.y += a * 0.03;
      }
    }

    // rig: sway, bob, recoil, landing
    const swayK = 1 - ads * 0.7;
    rig.position.set(bx - S.swayX * 0.04 * swayK, by + S.swayY * 0.04 * swayK + S.land * 0.06 + S.jumpY + breathe, S.kickZ * 0.016 * (1 - ads * 0.3));
    rig.rotation.set(S.swayY * 0.12 * swayK + S.kickR * 0.05 * (1 - ads * 0.6), -S.swayX * 0.14 * swayK, S.kickRoll + S.swayX * 0.08 * swayK + Math.sin(S.bob * 0.5) * 0.006 * bobK);

    // flash
    S.flashT -= dt;
    gun.flash.visible = S.flashT > 0;
    flashLight.intensity = S.flashT > 0 ? 3.5 : 0;
    if (S.flashT > 0) gun.anchors.muzzle.getWorldPosition(flashLight.position);

    // hide when scoped
    const scoped = def.scope && p.ads > 0.92 && reloadP < 0;
    holder.visible = !scoped;
    armL.upper.visible = armR.upper.visible = !scoped;
    S.scopeHide = scoped;

    // arms: IK to grips (in rig space)
    holder.updateMatrix();
    gun.root.updateMatrix();
    m4.copy(holder.matrix).multiply(gun.root.matrix);
    gripR.copy(rhOverride || gun.anchors.grip.position).applyMatrix4(m4);
    gripL.copy(lhOverride || gun.anchors.fore.position).applyMatrix4(m4);
    if (pistol && !lhOverride) gripL.x -= 0.035;
    solve(armR, shoulderR, gripR, poleR, 0);
    solve(armL, shoulderL, gripL, poleL, 0);

    // brass
    for (const b of brass) {
      if (!b.m.visible) continue;
      b.life -= dt;
      if (b.life <= 0) {
        b.m.visible = false;
        continue;
      }
      b.v.y -= 9.8 * dt;
      b.m.position.addScaledVector(b.v, dt);
      b.m.rotation.x += b.s.x * dt;
      b.m.rotation.y += b.s.y * dt;
      b.m.rotation.z += b.s.z * dt;
    }
  }
  function ejectDown() {
    const b = brass[bHead];
    bHead = (bHead + 1) % MAX_B;
    if (!gun) return;
    gun.anchors.muzzle.getWorldPosition(b.m.position);
    b.m.geometry = brassGeo;
    b.m.material = mats.brass;
    b.m.visible = true;
    b.life = 0.8;
    b.v.set((Math.random() - 0.5) * 0.4, -0.6, 0.3).applyQuaternion(camera.quaternion);
    b.s.set(Math.random() * 10, 0, Math.random() * 10);
  }

  /** match world lighting: sun direction in view space, colours */
  function setLighting({ sunDir, sunColor, sunIntensity, hemiSky, hemiGround, hemiIntensity, env }) {
    if (sunDir) key.position.copy(sunDir).multiplyScalar(5);
    if (sunColor) key.color.set(sunColor);
    if (sunIntensity !== undefined) key.intensity = Math.min(2.6, sunIntensity * 0.75 + 0.4);
    if (hemiSky) hemi.color.set(hemiSky);
    if (hemiGround) hemi.groundColor.set(hemiGround);
    if (hemiIntensity !== undefined) hemi.intensity = hemiIntensity + 0.25;
    if (env) scene.environment = env;
  }

  function dispose() {
    for (const g of guns.values()) {
      g.root.traverse((o) => o.isMesh && o.geometry.dispose());
      for (const m of g.flashMats) m.dispose();
    }
    guns.clear();
    scene.traverse((o) => {
      if (o.isMesh && o.geometry) o.geometry.dispose();
    });
    sleeveMat.dispose();
    camoMap.dispose();
    camoN.dispose();
    gloveMat.dispose();
    padMat.dispose();
    shellMat.dispose();
  }

  return { scene, camera, setWeapon, update, onShot, onLand, look, inspect, setLighting, dispose, state: S, get gun() { return gun; }, preload: (ids) => ids.forEach(getGun) };
}
