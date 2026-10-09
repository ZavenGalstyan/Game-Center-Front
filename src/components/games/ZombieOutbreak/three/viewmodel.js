/**
 * Zombie Outbreak — the first-person weapon view.
 *
 * Lives in its own scene + camera and is drawn after the world with the
 * depth buffer cleared, so the gun never clips into walls and keeps a
 * stable field of view while the world camera zooms for ADS.
 *
 * Animation is a sum of small, independent layers driven by engine state:
 * hip ↔ ADS blend, look sway, walk bob, sprint carry, recoil kick (spring),
 * reload choreography (tilt, mag out / in, rack), weapon switch (lower /
 * raise), pump / slide cycling and the muzzle flash.
 */
import * as THREE from "three";
import { buildWeaponModel } from "./weaponModels.js";

const HIP = new THREE.Vector3(0.15, -0.155, -0.29);
const SPRINT_OFF = new THREE.Vector3(-0.1, -0.045, 0.03);

function flashTexture() {
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const ctx = c.getContext("2d");
  const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, "rgba(255,255,240,1)");
  g.addColorStop(0.2, "rgba(255,220,140,0.95)");
  g.addColorStop(0.5, "rgba(255,140,40,0.4)");
  g.addColorStop(1, "rgba(255,90,0,0)");
  ctx.fillStyle = g;
  ctx.beginPath();
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    const r = i % 2 ? 22 : 64;
    ctx.lineTo(64 + Math.cos(a) * r, 64 + Math.sin(a) * r);
  }
  ctx.fill();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export class Viewmodel {
  constructor(loadout) {
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(56, 1, 0.01, 10);
    this.scene.add(this.camera);
    this.rig = new THREE.Group();
    this.camera.add(this.rig);
    // Lighting tuned per arena via setTint().
    this.hemi = new THREE.HemisphereLight("#9fb0d0", "#2a2420", 1.4);
    this.key = new THREE.DirectionalLight("#ffe2c0", 1.6);
    this.key.position.set(0.6, 1, 0.4);
    this.rim = new THREE.DirectionalLight("#7fa0ff", 0.8);
    this.rim.position.set(-1, 0.3, -1);
    this.flashLight = new THREE.PointLight("#ffb050", 0, 2.5, 2);
    this.scene.add(this.hemi, this.key, this.rim);
    this.camera.add(this.flashLight);
    this.flashLight.position.set(0.1, -0.05, -0.6);

    this.models = {};
    for (const id of loadout) {
      const m = buildWeaponModel(id);
      m.group.visible = false;
      this.rig.add(m.group);
      this.models[id] = m;
    }
    const ftex = flashTexture();
    this.flashMat = new THREE.MeshBasicMaterial({ map: ftex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, opacity: 1 });
    this.flash = new THREE.Group();
    const fp = new THREE.PlaneGeometry(1, 1);
    const f1 = new THREE.Mesh(fp, this.flashMat);
    const f2 = new THREE.Mesh(fp, this.flashMat);
    f2.rotation.y = Math.PI / 2;
    const f3 = new THREE.Mesh(fp, this.flashMat);
    f3.rotation.x = Math.PI / 2;
    this.flash.add(f1, f2, f3);
    this.flash.visible = false;
    this.flashT = 0;
    this.flashTex = ftex;

    this.cur = null;
    this.kick = 0;
    this.kickV = 0;
    this.kickRot = 0;
    this.swayX = 0;
    this.swayY = 0;
    this.bobAmp = 0;
    this.sprint = 0;
    this.pumpT = -1;
    this.slideT = -1;
    this.t = 0;
    this.hidden = false;
    this.tmpPos = new THREE.Vector3();
    this.tmpHip = new THREE.Vector3();
    this.muzzleWorld = new THREE.Vector3();
  }

  setTint(theme) {
    this.hemi.color.set(theme.hemiSky || "#9fb0d0");
    this.hemi.groundColor.set(theme.hemiGround || "#2a2420");
  }

  handle(events, game) {
    for (const e of events) {
      if (e.type === "shot") {
        const def = game.arsenal.def;
        this.kickV += def.recoil.kick * (1 - 0.45 * game.player.ads) * 18;
        this.kickRot += def.recoil.pitch * (1 - 0.4 * game.player.ads) * 6;
        this.flashT = 0.055;
        this.flashScale = 0.08 + def.flash * 0.1;
        this.flashRoll = Math.random() * Math.PI;
        const m = this.models[def.id];
        if (m && m.pump) this.pumpT = 0;
        else this.slideT = 0;
      }
    }
  }

  /**
   * dt, the game, look delta this frame (px), settings → updates the rig.
   * `mainCam` provides aspect; ADS narrows the view-model FOV slightly.
   */
  update(dt, game, lookDX, lookDY, settings, mainCam) {
    this.t += dt;
    const p = game.player;
    const a = game.arsenal;
    const def = a.def;
    const m = this.models[def.id];
    this.camera.aspect = mainCam.aspect;
    this.camera.fov = 56 - 8 * p.ads;
    this.camera.updateProjectionMatrix();
    this.camera.position.copy(mainCam.position);
    this.camera.quaternion.copy(mainCam.quaternion);

    if (this.cur !== def.id) {
      for (const [id, mm] of Object.entries(this.models)) mm.group.visible = id === def.id;
      if (m) m.muzzle.add(this.flash);
      this.cur = def.id;
    }
    if (!m) return;
    const reduced = settings.reducedMotion;
    const bobK = reduced ? 0.3 : settings.cameraBob ?? 1;

    // Hidden when dead, or fully scoped (the HUD draws the scope).
    const scoped = !!m.scope && p.ads > 0.92;
    this.rig.visible = p.alive && !scoped;

    // ---------------------------------------------------- springs
    // Recoil kick: critically damped spring back to rest.
    this.kickV += (-this.kick * 260 - this.kickV * 26) * dt;
    this.kick += this.kickV * dt;
    this.kickRot *= Math.exp(-dt * 14);
    // Look sway (lagging the mouse).
    const sx = Math.max(-1, Math.min(1, lookDX * 0.02));
    const sy = Math.max(-1, Math.min(1, lookDY * 0.02));
    this.swayX += (sx - this.swayX) * Math.min(1, dt * 10);
    this.swayY += (sy - this.swayY) * Math.min(1, dt * 10);
    const moving = p.grounded ? Math.min(1, p.speed / 4.6) : 0;
    this.bobAmp += (moving - this.bobAmp) * Math.min(1, dt * 8);
    this.sprint += ((p.sprinting ? 1 : 0) - this.sprint) * Math.min(1, dt * 9);

    const ads = p.ads;
    const hipK = 1 - ads;
    const hip = m.hip ? this.tmpHip.set(m.hip[0], m.hip[1], m.hip[2]) : this.tmpHip.copy(HIP);
    const pos = this.tmpPos.copy(hip).addScaledVector(SPRINT_OFF, this.sprint * hipK);
    // ADS: sight line on the camera axis.
    pos.x = pos.x * hipK;
    pos.y = pos.y * hipK + -m.sightY * ads;
    pos.z = pos.z * hipK + -m.sightZ * ads;

    const ph = p.bobPhase;
    const bobScale = (0.6 + 0.4 * this.sprint) * hipK * 0.85 + 0.15 * ads;
    pos.x += Math.cos(ph) * 0.012 * this.bobAmp * bobK * bobScale;
    pos.y += -Math.abs(Math.sin(ph)) * 0.014 * this.bobAmp * bobK * bobScale;
    // Breathing idle.
    pos.y += Math.sin(this.t * 1.6) * 0.0025 * (1 - ads * 0.8);
    pos.x += Math.sin(this.t * 0.8) * 0.0015 * (1 - ads * 0.8);
    pos.x -= this.swayX * 0.012 * (1 - ads * 0.7);
    pos.y += this.swayY * 0.01 * (1 - ads * 0.7);
    pos.z += this.kick;
    pos.y += p.landDip * -0.03;

    let rx = this.kickRot - this.swayY * 0.05 + this.sprint * -0.35 * hipK;
    let ry = -this.swayX * 0.06 + this.sprint * 0.55 * hipK;
    let rz = -this.swayX * 0.08 + Math.cos(ph) * 0.02 * this.bobAmp * bobK * hipK + this.sprint * 0.15 * hipK;

    // ---------------------------------------------------- reload / switch
    if (m.mag && m.magHome) m.mag.position.copy(m.magHome);
    if (m.leftHand && m.leftHome) m.leftHand.position.copy(m.leftHome);
    if (m.mag) m.mag.visible = true;
    if (a.state === "reload") {
      const k = 1 - a.t / Math.max(0.01, a.dur);
      if (def.reloadMode === "shell") {
        const cyc = (this.t * (1 / def.reload)) % 1;
        rz += 0.4;
        rx += 0.12;
        pos.y -= 0.02;
        if (m.leftHand && m.leftHome) {
          m.leftHand.position.set(m.leftHome.x + 0.06, m.leftHome.y - 0.03 + Math.sin(cyc * Math.PI) * 0.04, m.leftHome.z + 0.18 * Math.sin(cyc * Math.PI));
        }
      } else {
        const tilt = Math.sin(Math.min(1, k * 1.15) * Math.PI);
        rz += 0.32 * tilt;
        rx += 0.16 * tilt;
        pos.y -= 0.035 * tilt;
        pos.x += 0.01 * tilt;
        if (m.mag && m.magHome) {
          // Out (0.15→0.4), gone, in (0.5→0.75).
          let drop = 0;
          if (k > 0.15 && k < 0.45) drop = (k - 0.15) / 0.3;
          else if (k >= 0.45 && k < 0.55) drop = 1;
          else if (k >= 0.55 && k < 0.78) drop = 1 - (k - 0.55) / 0.23;
          m.mag.position.y = m.magHome.y - drop * 0.22;
          m.mag.visible = drop < 0.95;
          if (m.leftHand && m.leftHome) {
            const hk = k > 0.1 && k < 0.85 ? Math.sin(((k - 0.1) / 0.75) * Math.PI) : 0;
            m.leftHand.position.set(m.leftHome.x * (1 - hk), m.leftHome.y - hk * (0.08 + drop * 0.1), m.leftHome.z * (1 - hk) + hk * (m.magHome.z + 0.0));
          }
        }
        if (k > 0.82 && m.slide && m.slideHome) {
          const rk = Math.sin(((k - 0.82) / 0.18) * Math.PI);
          m.slide.position.z = m.slideHome.z + rk * 0.04;
        }
      }
    }
    if (a.state === "lower" || a.state === "raise") {
      const k = a.t / Math.max(0.01, a.dur);
      const down = a.state === "lower" ? 1 - k : k;
      pos.y -= down * 0.25;
      rx -= down * 0.8;
      rz += down * 0.3;
    }
    // Slide / pump cycling.
    if (m.slide && m.slideHome && a.state !== "reload") {
      m.slide.position.copy(m.slideHome);
      if (this.pumpT >= 0) {
        this.pumpT += dt;
        const k = (this.pumpT - 0.12) / 0.32;
        if (k > 0 && k < 1) m.slide.position.z = m.slideHome.z + Math.sin(k * Math.PI) * 0.08;
        if (k > 0 && k < 1) rx += Math.sin(k * Math.PI) * 0.05;
        if (k >= 1) this.pumpT = -1;
      }
      if (this.slideT >= 0) {
        this.slideT += dt;
        const k = this.slideT / 0.07;
        if (k < 1) m.slide.position.z = m.slideHome.z + Math.sin(k * Math.PI) * 0.03;
        else this.slideT = -1;
      }
    }
    if (m.coils) {
      const heat = Math.min(1, a.sinceShot < 0.6 ? 1 - a.sinceShot / 0.6 : 0);
      m.coils.forEach((c, i) => {
        c.rotation.z = this.t * (2 + heat * 14) + i;
        c.material.emissiveIntensity = 1.2 + heat * 2.5 + Math.sin(this.t * 6 + i) * 0.2;
      });
    }

    this.rig.position.copy(pos);
    this.rig.rotation.set(rx, ry, rz);

    // Muzzle flash.
    if (this.flashT > 0) {
      this.flashT -= dt;
      this.flash.visible = true;
      const s = this.flashScale * (0.8 + Math.random() * 0.4);
      this.flash.scale.set(s, s, s * 1.6);
      this.flash.rotation.z = this.flashRoll;
      this.flashMat.color.set(def.energy ? "#7ae0ff" : "#ffffff");
      this.flashLight.color.set(def.energy ? "#5ad8ff" : "#ffb050");
      this.flashLight.intensity = 6;
    } else {
      this.flash.visible = false;
      this.flashLight.intensity = 0;
    }
    this.camera.updateMatrixWorld(true);
  }

  /** World-space muzzle position (for tracers), approximated through the main camera. */
  muzzle(mainCam, out) {
    const m = this.models[this.cur];
    if (!m) return out.copy(mainCam.position);
    m.muzzle.getWorldPosition(out); // in view-model world = main camera frame (same transform)
    return out;
  }

  dispose() {
    this.flashMat.dispose();
    this.flashTex.dispose();
    this.scene.traverse((o) => {
      if (o.isMesh && o.geometry && !o.geometry.userData?.shared) o.geometry.dispose();
    });
  }
}
