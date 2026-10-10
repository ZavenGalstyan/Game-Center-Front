/**
 * Dimension Dash — the renderer for one world (one level session).
 *
 * Built once per level; frame(dt, input) then:
 *   1. reads input (or the menu autopilot bot) and advances the engine with
 *      a fixed step
 *   2. drains engine events → sounds, particles, camera shake, HUD callback
 *   3. updates the unified camera controller and copies it to THREE
 *   4. orients + animates the hedgehog, syncs props / enemies / effects
 *
 * Fullscreen / resize never rebuild anything. dispose() frees every
 * geometry, material and texture this level created.
 */
import * as THREE from "three";
import { advance } from "../engine/world.js";
import { updateCamera, addShake } from "../engine/camera.js";
import { createBot, botInput } from "../engine/bot.js";
import { createHero } from "./hero.js";
import { createMaterials } from "./materials.js";
import { createEnvironment } from "./environment.js";
import { buildLevelMeshes } from "./levelMesh.js";
import { createProps } from "./props.js";
import { makeEnemy, poseEnemy } from "./enemyModels.js";
import { createEffects } from "./effects.js";
import { createBossView } from "./bossModels.js";
import { sound } from "../audio/sound.js";

const _up = new THREE.Vector3();
const _fw = new THREE.Vector3();
const _rt = new THREE.Vector3();
const _mx = new THREE.Matrix4();
const _qt = new THREE.Quaternion();

export function createGameRenderer({ scene, camera, gl, W, world, settingsRef, mode = "game", onEvent }) {
  const quality = settingsRef.current.graphics || "medium";
  const shadows = quality !== "low";
  gl.shadowMap.enabled = shadows;
  gl.shadowMap.type = THREE.PCFSoftShadowMap;
  gl.toneMapping = THREE.ACESFilmicToneMapping;
  gl.toneMappingExposure = world.key === "neon" ? 1.15 : world.key === "final" ? 1.1 : 1.0;
  gl.outputColorSpace = THREE.SRGBColorSpace;

  const L = W.level;
  const mats = createMaterials(world);
  const env = createEnvironment(scene, world, L, { shadows, quality });
  const stat = buildLevelMeshes(L, mats, { shadows });
  scene.add(stat.group);
  const props = createProps(W, mats, { shadows, world });
  scene.add(props.group);
  const enemyViews = W.enemies.map((e) => {
    const v = makeEnemy(e, shadows);
    scene.add(v.root);
    return v;
  });
  const bossView = W.boss ? createBossView(W.boss, scene, { shadows, mats }) : null;
  const hero = createHero({ shadows });
  scene.add(hero.root);
  const dustCol = world.key === "desert" ? "#f0d29a" : world.key === "neon" ? "#9aa0d8" : world.key === "final" ? "#c9b6ff" : world.key === "ocean" ? "#f4ecd2" : "#e8e2c8";
  const fx = createEffects(scene, { reduced: () => !!settingsRef.current.reducedMotion, dust: dustCol });
  // blob shadow under the hero: always-readable landing spot, even in low quality
  const blob = new THREE.Mesh(new THREE.CircleGeometry(0.55, 20), new THREE.MeshBasicMaterial({ color: "#000000", transparent: true, opacity: 0.32, depthWrite: false }));
  blob.rotation.x = -Math.PI / 2;
  blob.renderOrder = 2;
  scene.add(blob);

  // projectiles (turret orbs, boss bombs / sand / energy) — pooled spheres
  const shotGeo = new THREE.SphereGeometry(1, 14, 10);
  const shotMats = {
    orb: new THREE.MeshStandardMaterial({ color: "#ff3b5c", emissive: "#ff1040", emissiveIntensity: 1.6, roughness: 0.3 }),
    sand: new THREE.MeshStandardMaterial({ color: "#e8b35e", emissive: "#6a3a00", emissiveIntensity: 0.5, roughness: 0.9 }),
    bomb: new THREE.MeshStandardMaterial({ color: "#2a2f42", emissive: "#ff3020", emissiveIntensity: 0.6, roughness: 0.4, metalness: 0.5 }),
  };
  const shotPool = [];
  const shotGroup = new THREE.Group();
  scene.add(shotGroup);
  function syncShots(t) {
    let i = 0;
    for (const s of W.shots) {
      if (i >= shotPool.length) {
        const m = new THREE.Mesh(shotGeo, shotMats.orb);
        shotGroup.add(m);
        shotPool.push(m);
      }
      const m = shotPool[i++];
      m.visible = true;
      m.material = shotMats[s.kind] || shotMats.orb;
      m.position.set(s.x, s.y, s.z);
      m.scale.setScalar(s.r * (1 + Math.sin(t * 20 + s.id) * 0.12));
    }
    for (; i < shotPool.length; i++) shotPool[i].visible = false;
  }

  camera.near = 0.1;
  camera.far = 1600;

  let paused = false;
  let t = 0;
  let wasInvincible = false;
  let bot = mode === "menu" ? createBot() : null;
  const lastHeroQ = new THREE.Quaternion();
  let heroInit = false;
  const anim = { landImpact: 0 };
  let grinding = false;
  let stepAcc = 0;

  function emit(ev) {
    if (onEvent) onEvent(ev);
  }

  function handleEvents() {
    const evs = W.events;
    if (!evs.length) return;
    W.events = [];
    const p = W.player;
    const cam = W.cam;
    const shake = settingsRef.current.reducedMotion ? 0.3 : 1;
    const quiet = mode === "menu";
    const S = quiet ? null : sound;
    for (const ev of evs) {
      switch (ev.type) {
        case "jump":
          S && S.jump();
          if (!ev.rail) fx.burst("dust", p.x, p.y, p.z, { n: 4, spd: 1.8, size: 0.7 });
          break;
        case "land":
          S && S.land(ev.impact);
          if (ev.impact > 8) fx.burst("dust", p.x, p.y, p.z, { n: Math.min(10, 3 + ev.impact / 4), spd: 2 + ev.impact / 10 });
          anim.landImpact = ev.impact;
          if (ev.impact > 30) addShake(cam, 0.2 * shake);
          break;
        case "ring":
          S && S.ring();
          fx.burst("ring", ev.x, ev.y, ev.z);
          break;
        case "ringLoss":
          S && S.ringLoss();
          addShake(cam, 0.4 * shake);
          break;
        case "hurt":
          S && S.hurt();
          break;
        case "die":
          S && S.die();
          addShake(cam, 0.5 * shake);
          break;
        case "enemyDefeat":
          S && S.enemy();
          fx.burst("explode", ev.x, ev.y, ev.z);
          fx.freeBird(ev.x, ev.y, ev.z);
          addShake(cam, 0.15 * shake);
          break;
        case "spring":
        case "dashRing":
          S && S.spring();
          fx.burst("puff", p.x, p.y, p.z);
          break;
        case "boost":
          S && S.boost();
          fx.burst("boost", p.x, p.y, p.z);
          break;
        case "charge":
        case "rev":
          S && S.rev(p.rev || 0);
          break;
        case "dash":
          S && S.dash();
          fx.burst("dust", p.x, p.y, p.z, { n: 10, spd: 4, size: 1.2 });
          addShake(cam, 0.12 * shake);
          break;
        case "roll":
          S && S.spin();
          break;
        case "homing":
          S && S.homing();
          break;
        case "mode":
          S && S.shift();
          break;
        case "rideStart":
          S && S.loop();
          break;
        case "railOn":
        case "railSwitch":
          fx.burst("sparks", p.x, p.y, p.z, { n: 8 });
          break;
        case "checkpoint":
          S && S.checkpoint();
          fx.burst("star", ev.x, ev.y + 2.2, ev.z);
          break;
        case "redStar":
          S && S.redStar();
          fx.burst("star", ev.x, ev.y, ev.z);
          break;
        case "monitor":
          S && S.monitor();
          if (S && ev.kind !== "rings" && ev.kind !== "life") S.power(ev.kind);
          fx.burst("explode", ev.x, ev.y + 0.7, ev.z);
          break;
        case "powerEnd":
          S && S.powerEnd();
          break;
        case "oneUp":
          S && S.oneUp();
          break;
        case "shieldBlock":
          S && S.block();
          fx.burst("sparks", ev.x, ev.y, ev.z, { n: 10 });
          break;
        case "shieldLost":
          S && S.shieldPop();
          fx.burst("shield", p.x, p.y + 0.5, p.z);
          break;
        case "turretCharge":
          S && S.charge();
          break;
        case "shoot":
          S && S.shoot();
          break;
        case "shotPop":
          fx.burst("sparks", ev.x, ev.y, ev.z, { n: 5 });
          break;
        case "enemyAlert":
          S && S.alert();
          break;
        case "switch":
          S && S.switch();
          addShake(cam, 0.2 * shake);
          break;
        case "laser":
          S && S.laser();
          break;
        case "wallHit":
          S && S.bonk();
          addShake(cam, Math.min(0.3, ev.speed / 80) * shake);
          break;
        case "bonk":
          S && S.bonk();
          break;
        case "goal":
          S && S.goal();
          fx.burst("confetti", p.x, p.y, p.z);
          break;
        case "complete":
          S && S.complete();
          break;
        case "gameover":
          S && S.gameover();
          break;
        case "bossHit":
          S && S.bossHit();
          fx.burst("explode", ev.x, ev.y, ev.z);
          addShake(cam, 0.35 * shake);
          break;
        case "bossSlam":
          S && S.slam();
          addShake(cam, 0.5 * shake);
          fx.burst("dust", ev.x, ev.y, ev.z, { n: 14, spd: 6, size: 1.6 });
          break;
        case "bossRoar":
          S && S.bossRoar();
          break;
        case "bossShoot":
          S && S.shoot();
          break;
        case "bossDefeat":
          S && S.bossDefeat();
          for (let i = 0; i < 4; i++) fx.burst("explode", ev.x + (Math.random() - 0.5) * 3, ev.y + Math.random() * 3, ev.z + (Math.random() - 0.5) * 3);
          fx.burst("confetti", ev.x, ev.y, ev.z);
          addShake(cam, 0.8 * shake);
          break;
        default:
          break;
      }
      if (bossView && ev.type.startsWith("boss")) bossView.onEvent(ev, fx);
      emit(ev);
    }
  }

  function placeHero(dt) {
    const p = W.player;
    let x = p.x;
    let y = p.y;
    let z = p.z;
    if (p.sw) {
      const k = p.sw.t / p.sw.T;
      x += p.sw.ox * k;
      y += p.sw.oy * k;
      z += p.sw.oz * k;
    }
    hero.root.position.set(x, y, z);
    // orientation: ground / loop normal as up, facing (or ride tangent) as forward
    const grounded = p.grounded || p.mode === "ride";
    if (p.mode === "ride") _up.set(p.nx, p.ny, p.nz);
    else if (p.grounded && p.mode !== "rail") _up.set(p.nx * 0.85, p.ny + 0.15, p.nz * 0.85).normalize();
    else _up.set(0, 1, 0);
    let face = p.facing;
    if (p.action === "victory") face = Math.atan2(W.cam.px - p.x, W.cam.pz - p.z);
    if (p.mode === "ride" && p.rideT) _fw.set(p.rideT.tx, p.rideT.ty, p.rideT.tz);
    else _fw.set(Math.sin(face), 0, Math.cos(face));
    _fw.addScaledVector(_up, -_fw.dot(_up)).normalize();
    if (_fw.lengthSq() < 0.5) _fw.set(Math.sin(face), 0, Math.cos(face));
    _rt.crossVectors(_up, _fw).normalize();
    _mx.makeBasis(_rt, _up, _fw);
    _qt.setFromRotationMatrix(_mx);
    if (!heroInit || W.cam.snap) {
      lastHeroQ.copy(_qt);
      heroInit = true;
    } else lastHeroQ.slerp(_qt, 1 - Math.exp(-(p.mode === "ride" ? 30 : grounded ? 16 : 10) * dt));
    hero.root.quaternion.copy(lastHeroQ);
    // blob shadow on the floor below
    const fy = p.grounded && p.mode !== "ride" ? p.y : findFloorY(x, y, z);
    blob.visible = Number.isFinite(fy) && p.action !== "dead";
    if (blob.visible) {
      const h = Math.max(0, y - fy);
      blob.position.set(x, fy + 0.04, z);
      blob.scale.setScalar(Math.max(0.35, 1 - h / 10));
      blob.material.opacity = 0.3 * Math.max(0.2, 1 - h / 12);
    }
    return { x, y, z };
  }
  const flTmp = {};
  function findFloorY(x, y, z) {
    // cheap: reuse the engine query
    return W.floorQuery ? W.floorQuery(x, y, z, flTmp) : NaN;
  }

  function frame(dt, input) {
    dt = Math.min(dt, 0.1);
    t += dt;
    const p = W.player;
    let look = { dx: 0, dy: 0 };
    if (!paused) {
      let raw;
      if (mode === "menu" || (import.meta.env.DEV && typeof window !== "undefined" && window.__ddBot)) {
        if (!bot) bot = createBot();
        if (mode === "menu" && (W.state === "complete" || W.state === "gameover")) {
          W.restart();
          bot = createBot();
        }
        raw = botInput(W, bot, dt);
      } else {
        raw = input ? input.frame() : { mx: 0, my: 0 };
        const [dx, dy] = input ? input.consumeLook() : [0, 0];
        look = { dx, dy };
        raw.camYaw = W.cam.viewYaw ?? W.cam.yaw;
      }
      advance(W, raw, dt);
      handleEvents();
      updateCamera(W, dt, look, settingsRef.current);
      // continuous audio
      if (mode !== "menu") {
        const g = p.mode === "rail" && W.state === "play";
        if (g !== grinding) {
          grinding = g;
          sound.grind(g);
        }
        sound.wind(Math.max(0, (p.speed - 18) / 26));
        if (p.grounded && p.mode !== "rail" && p.speed > 3 && p.action === "none") {
          stepAcc += p.speed * dt;
          if (stepAcc > 2.2) {
            stepAcc = 0;
            sound.step(p.speed);
          }
        }
        if (p.skid) sound.skid();
      }
    }
    const cam = W.cam;
    camera.position.set(cam.px, cam.py, cam.pz);
    camera.lookAt(cam.tx, cam.ty, cam.tz);
    if (Math.abs(camera.fov - cam.fov) > 0.05) {
      camera.fov = cam.fov;
      camera.updateProjectionMatrix();
    }

    const hp = placeHero(dt);
    const inv = W.power.invincible > 0;
    hero.animate(
      {
        action: p.action,
        mode: p.mode,
        speed: p.mode === "ride" ? Math.abs(p.ride ? p.ride.gs : p.speed) : p.speed,
        grounded: p.grounded,
        vy: p.vy,
        skid: p.skid,
        rev: p.rev,
        invuln: p.invuln,
        invincible: inv,
        wasInvincible,
        time: t,
        landImpact: anim.landImpact,
      },
      paused ? 0 : dt,
    );
    wasInvincible = inv;
    anim.landImpact = 0;

    // spin-dash charge dust + grind sparks
    if (!paused) {
      if (p.action === "charge") fx.burst("charge", p.x, p.y, p.z, { fx: Math.sin(p.facing), fz: Math.cos(p.facing) });
      if (p.mode === "rail" && Math.random() < 0.7) fx.burst("sparks", p.x, p.y + 0.05, p.z, { n: 2, vx: p.vx, vz: p.vz });
      if (p.action === "homing") fx.burst("homing", p.x, p.y + 0.5, p.z);
      if (p.action === "dash" || (p.action === "roll" && p.speed > 14)) {
        if (Math.random() < 0.4) fx.burst("dust", p.x, p.y, p.z, { n: 1, spd: 1, size: 0.6 });
      }
    }

    props.sync(dt, t);
    syncShots(t);
    for (let i = 0; i < enemyViews.length; i++) poseEnemy(enemyViews[i], W.enemies[i], t, dt);
    if (bossView) bossView.sync(W.boss, t, dt);
    stat.update(dt);
    env.update(dt, camera, hp);
    const fast = p.speed > 27 || p.action === "homing" || p.action === "dash" || (p.mode === "rail" && p.speed > 22);
    fx.update(
      paused ? 0 : dt,
      {
        x: hp.x,
        y: hp.y + 0.5,
        z: hp.z,
        trail: fast && p.action !== "dead",
        trailColor: p.action === "homing" ? [0.5, 0.85, 1] : inv ? [1, 0.9, 0.4] : [0.3, 0.55, 1],
        lock: p.lock && p.action !== "homing" ? p.lock : null,
        shield: W.power.shield > 0,
        magnet: W.power.magnet > 0,
        invincible: inv,
      },
      camera,
    );
  }

  function setPaused(v) {
    paused = !!v;
    if (paused && mode !== "menu") {
      sound.grind(false);
      grinding = false;
      sound.wind(0);
    }
  }
  function snapCamera() {
    W.cam.snap = true;
  }

  function dispose() {
    sound.grind(false);
    sound.wind(0);
    scene.remove(stat.group, props.group, hero.root, blob);
    for (const v of enemyViews) scene.remove(v.root);
    stat.dispose();
    props.dispose();
    hero.dispose();
    fx.dispose();
    env.dispose();
    if (bossView) bossView.dispose();
    scene.remove(shotGroup);
    shotGeo.dispose();
    for (const m of Object.values(shotMats)) m.dispose();
    blob.geometry.dispose();
    blob.material.dispose();
    mats.dispose();
  }

  return { frame, setPaused, snapCamera, dispose };
}
