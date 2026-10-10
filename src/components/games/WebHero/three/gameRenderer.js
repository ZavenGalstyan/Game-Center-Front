/**
 * Web Hero — the renderer for one mission session (or the menu backdrop).
 *
 * Built once per world; frame(dt) then:
 *   1. reads input (keyboard/mouse, or the bot in ?whtest=1 runs) and
 *      advances the engine with a fixed step
 *   2. updates the third-person camera (engine/camera.js) and copies it to THREE
 *   3. drains engine events → sounds, particles, shockwaves, camera shake, HUD
 *   4. poses the hero (swing tilt along the rope, climb offset), the web line,
 *      trails, anchor reticle, objective beacon, enemies / civilians / boss
 *
 * Fullscreen / resize never rebuild anything. dispose() frees every
 * geometry, material and render target this session created.
 */
import * as THREE from "three";
import { advance } from "../engine/world.js";
import { updateCamera, addShake } from "../engine/camera.js";
import { findAnchor } from "../engine/hero.js";
import { waypoints } from "../engine/missions.js";
import { createBot, botInput } from "../engine/bot.js";
import { createHeroModel } from "./heroModel.js";
import { buildCityMesh } from "./cityMesh.js";
import { createEnvironment } from "./environment.js";
import { createEnemyView, createCivilianView, createBossView } from "./actors.js";
import { createEffects } from "./effects.js";
import { sound } from "../audio/sound.js";
import { TEST } from "../utils/testHooks.js";

const _v = new THREE.Vector3();
const _up = new THREE.Vector3(0, 1, 0);
const _q = new THREE.Quaternion();
const _q2 = new THREE.Quaternion();
const _e = new THREE.Euler();

export function createGameRenderer({ scene, camera, gl, W, district, settingsRef, suit, mode = "game", input, onEvent }) {
  const menu = mode === "menu";
  const quality = settingsRef.current.graphics || "medium";
  const shadows = quality !== "low";
  gl.shadowMap.enabled = shadows;
  gl.shadowMap.type = THREE.PCFSoftShadowMap;
  gl.toneMapping = THREE.ACESFilmicToneMapping;
  gl.toneMappingExposure = district.time === "night" ? 1.15 : district.time === "storm" ? 1.05 : 1.0;
  gl.outputColorSpace = THREE.SRGBColorSpace;

  const env = createEnvironment(scene, gl, district, { shadows, quality, menu });
  const city = buildCityMesh(W.city, district, { shadows, envMap: env.envMap, quality, arena: W.spec.arena || null });
  scene.add(city.group);
  const hero = createHeroModel({ shadows, suit });
  scene.add(hero.root);
  const fx = createEffects(scene, { reduced: () => !!settingsRef.current.reducedMotion, accent: suit.accent });

  // blob shadow (always-readable landing spot)
  const blob = new THREE.Mesh(new THREE.CircleGeometry(0.5, 20), new THREE.MeshBasicMaterial({ color: "#000", transparent: true, opacity: 0.3, depthWrite: false }));
  blob.rotation.x = -Math.PI / 2;
  blob.renderOrder = 2;
  scene.add(blob);

  camera.near = 0.1;
  camera.far = 1800;
  const views = new Map();
  const civViews = new Map();
  let bossView = null;
  let paused = false;
  let t = 0;
  let anchorT = 0;
  let anchor = null;
  let lastStep = 0;
  let noAnchorT = 0;
  const bot = TEST || menu ? createBot() : null;
  const handPos = new THREE.Vector3();

  function emit(ev) {
    if (onEvent) onEvent(ev);
  }

  /* ------------------------------------------------------------------ events */
  function handleEvents() {
    const evs = W.events;
    if (!evs.length) return;
    W.events = [];
    const h = W.hero;
    const cam = W.cam;
    const shakeK = settingsRef.current.reducedMotion ? 0.25 : 1;
    const S = menu ? null : sound;
    for (const ev of evs) {
      switch (ev.type) {
        case "jump":
          S && S.jump();
          if (h.grounded || h.y < 0.5) fx.burst("dust", h.x, h.y, h.z, { n: 4, spd: 1.5, size: 0.6 });
          break;
        case "doubleJump":
          S && S.doubleJump();
          fx.burst("web", h.x, h.y + 0.5, h.z, { n: 8 });
          break;
        case "land":
          S && S.land(ev.impact);
          if (ev.impact > 9) {
            fx.burst("dust", ev.x, ev.y, ev.z, { n: Math.min(16, 4 + ev.impact / 2), spd: 2 + ev.impact / 8 });
            if (ev.impact > 20) {
              fx.shock(ev.x, ev.y, ev.z, 2.5 + ev.impact / 10, "#ffffff", 0.4);
              addShake(cam, 0.25 * shakeK);
            }
          }
          break;
        case "wallrun":
          S && S.wallRun();
          break;
        case "climbStart":
          S && S.vault();
          break;
        case "vault":
          S && S.vault();
          fx.burst("dust", h.x, h.y + 1, h.z, { n: 5, spd: 1.2 });
          break;
        case "webAttach":
          S && S.webAttach();
          fx.burst("web", ev.x, ev.y, ev.z, { n: 10 });
          emit(ev);
          break;
        case "webRelease":
          S && S.webRelease(ev.speed || 0);
          break;
        case "noAnchor":
          if (t - noAnchorT > 0.8) {
            noAnchorT = t;
            emit(ev);
          }
          break;
        case "swingAtk":
          S && S.whoosh();
          break;
        case "whiff":
          break;
        case "hit": {
          const heavy = ev.heavy || ev.finisher;
          if (S) {
            if (ev.finisher) S.finisher();
            else if (/kick|Kick|aerial|counter|strike/.test(ev.move || "")) S.kick();
            else S.punch(heavy);
          }
          fx.burst("hit", ev.x, ev.y, ev.z, { n: heavy ? 18 : 10, heavy });
          if (heavy) fx.shock(ev.x, ev.y - 0.8, ev.z, 2.2, "#ffd36a", 0.3);
          addShake(cam, (heavy ? 0.35 : 0.14) * shakeK);
          emit(ev);
          break;
        }
        case "blocked":
          S && S.blocked();
          fx.burst("spark", ev.x, ev.y, ev.z, { n: 10 });
          emit(ev);
          break;
        case "evade":
          S && S.dodge();
          fx.burst("dust", ev.x, ev.y - 1, ev.z, { n: 4 });
          break;
        case "enemyAlert":
          S && S.alert();
          break;
        case "telegraph":
          S && S.telegraph();
          break;
        case "slam":
        case "shockRing":
          S && S.slam();
          fx.shock(ev.x, ev.y, ev.z, 6, "#ff9a3a", 0.55);
          fx.burst("dust", ev.x, ev.y, ev.z, { n: 14, spd: 5 });
          addShake(cam, 0.4 * shakeK);
          break;
        case "enemyShoot":
          S && S.shoot(ev.kind);
          fx.burst("spark", ev.x, ev.y, ev.z, { n: 3 });
          break;
        case "shotPop":
          fx.burst("spark", ev.x, ev.y, ev.z, { n: 3 });
          break;
        case "enemyLand":
          fx.burst("dust", ev.x, ev.y, ev.z, { n: 8, spd: 3 });
          addShake(cam, 0.1 * shakeK);
          break;
        case "enemyDefeat":
          S && S.enemyDown(ev.kind);
          if (ev.kind === "drone") fx.burst("explosion", ev.x, ev.y, ev.z, { n: 16 });
          else fx.burst("energy", ev.x, ev.y - 1, ev.z, { n: 8, col: "#ffd36a" });
          emit(ev);
          break;
        case "webShoot":
          S && S.thwip();
          hero.webHand(handPos);
          emit(ev);
          break;
        case "webSplat":
          S && S.webSplat();
          fx.burst("web", ev.x, ev.y, ev.z, { n: 6 });
          break;
        case "webHit":
          S && S.webSplat();
          fx.burst("web", ev.x, ev.y, ev.z, { n: 8 });
          break;
        case "webbed":
          S && S.webbed();
          fx.burst("web", ev.x, ev.y, ev.z, { n: 18 });
          emit(ev);
          break;
        case "webPull":
          S && S.thwip();
          hero.webHand(handPos);
          fx.strand(handPos, ev.x, ev.y, ev.z, 0.35);
          break;
        case "webZip":
          S && S.zip();
          hero.webHand(handPos);
          fx.strand(handPos, ev.x, ev.y, ev.z, 0.45);
          break;
        case "webShield":
          S && S.shield();
          fx.burst("web", h.x, h.y + 1, h.z, { n: 20 });
          break;
        case "shieldBlock":
          S && S.shieldBlock();
          fx.burst("spark", ev.x, ev.y, ev.z, { n: 12 });
          break;
        case "webBurst":
          S && S.burstAbility();
          fx.shock(ev.x, ev.y - 1, ev.z, 7.5, "#ffffff", 0.5);
          fx.burst("web", ev.x, ev.y, ev.z, { n: 40 });
          addShake(cam, 0.3 * shakeK);
          break;
        case "webStorm":
          S && S.storm();
          fx.burst("energy", ev.x, ev.y, ev.z, { n: 40, col: suit.accent });
          emit(ev);
          break;
        case "stormHit":
          S && S.stormHit();
          fx.shock(ev.x, ev.y, ev.z, 15, suit.accent, 0.8);
          fx.shock(ev.x, ev.y + 1, ev.z, 11, "#ffffff", 0.6);
          fx.burst("web", ev.x, ev.y + 1, ev.z, { n: 90 });
          addShake(cam, 0.7 * shakeK);
          break;
        case "dodge":
          S && S.dodge();
          break;
        case "dodged":
          break;
        case "perfectDodge":
          S && S.perfectDodge();
          fx.burst("energy", ev.x, ev.y, ev.z, { n: 16, col: suit.accent });
          emit(ev);
          break;
        case "heroHurt":
          S && S.hurt();
          fx.burst("hit", ev.x, ev.y, ev.z, { n: 8 });
          addShake(cam, (ev.kind === "heavy" ? 0.55 : 0.3) * shakeK);
          emit(ev);
          break;
        case "heroDefeated":
          S && S.heroDown();
          emit(ev);
          break;
        case "heal":
          S && S.heal();
          fx.burst("heal", ev.x, ev.y, ev.z, { n: 14 });
          emit(ev);
          break;
        case "token":
          S && S.token();
          fx.burst("token", ev.x, ev.y, ev.z, { n: 22 });
          emit(ev);
          break;
        case "rescued":
          S && S.rescued();
          fx.burst("heal", ev.x, ev.y + 1, ev.z, { n: 16 });
          emit(ev);
          break;
        case "disabled":
          S && S.disabled();
          fx.burst("zap", ev.x, ev.y + 1, ev.z, { n: 16 });
          emit(ev);
          break;
        case "intel":
          S && S.token();
          fx.burst("energy", ev.x, ev.y, ev.z, { n: 12, col: "#59c8ff" });
          emit(ev);
          break;
        case "caught":
          S && S.webbed();
          emit(ev);
          break;
        case "objective":
          if (ev.idx > 0) S && S.objective();
          emit(ev);
          break;
        case "objectiveHit":
          fx.burst("spark", ev.x, ev.y, ev.z, { n: 6 });
          emit(ev);
          break;
        case "wave":
        case "missionComplete":
        case "missionFailed":
        case "victory":
        case "cooldown":
        case "energyLow":
        case "noTarget":
        case "locked":
        case "restart":
          emit(ev);
          break;
        case "splash":
          S && S.land(20);
          fx.burst("web", ev.x, ev.y, ev.z, { n: 10 });
          emit(ev);
          break;
        case "bossIntro":
          S && S.bossRoar();
          addShake(cam, 0.5 * shakeK);
          emit(ev);
          break;
        case "bossHit":
          S && S.bossHit();
          emit(ev);
          break;
        case "bossPhase":
          S && S.bossRoar();
          addShake(cam, 0.6 * shakeK);
          emit(ev);
          break;
        case "bossCounter":
          S && S.blocked();
          fx.burst("spark", ev.x, ev.y, ev.z, { n: 14 });
          emit({ type: "toast", text: "Countered! Don't strike the blue stance", kind: "warn" });
          break;
        case "bossBlast":
          S && S.explosion();
          fx.burst("explosion", ev.x, ev.y + 0.5, ev.z, { n: 18 });
          fx.shock(ev.x, ev.y, ev.z, 3, "#ff7a2a", 0.35);
          addShake(cam, 0.25 * shakeK);
          break;
        case "bossStunned":
        case "overheat":
        case "shieldDown":
          S && S.disabled();
          fx.burst("zap", ev.x, ev.y + 1.5, ev.z, { n: 18 });
          emit(ev);
          break;
        case "bossCrash":
          S && S.explosion();
          fx.burst("dust", ev.x, ev.y, ev.z, { n: 20, spd: 5 });
          addShake(cam, 0.6 * shakeK);
          break;
        case "bossDefeat":
          S && S.explosion();
          fx.burst("explosion", ev.x, ev.y, ev.z, { n: 40 });
          fx.shock(ev.x, ev.y - 1.5, ev.z, 12, "#ffd36a", 0.9);
          addShake(cam, 0.8 * shakeK);
          emit(ev);
          break;
        default:
      }
    }
  }

  /* ------------------------------------------------------------------ actors */
  function syncActors(dt) {
    const seen = new Set();
    for (const e of W.enemies) {
      if (e.boss) continue;
      seen.add(e.id);
      let v = views.get(e.id);
      if (!v) {
        v = createEnemyView(e, { shadows });
        views.set(e.id, v);
        scene.add(v.root);
      }
      v.update(dt, camera);
    }
    for (const [id, v] of views) {
      if (!seen.has(id)) {
        scene.remove(v.root);
        v.dispose();
        views.delete(id);
      }
    }
    const cseen = new Set();
    for (const c of W.civilians) {
      cseen.add(c);
      let v = civViews.get(c);
      if (!v) {
        v = createCivilianView(c, { shadows });
        civViews.set(c, v);
        scene.add(v.root);
      }
      v.update(dt);
    }
    for (const [c, v] of civViews) {
      if (!cseen.has(c)) {
        scene.remove(v.root);
        v.dispose();
        civViews.delete(c);
      }
    }
    if (W.boss && (!bossView || bossView.B !== W.boss)) {
      if (bossView) {
        scene.remove(bossView.root);
        bossView.dispose();
      }
      bossView = createBossView(W.boss, { shadows });
      bossView.B = W.boss;
      scene.add(bossView.root);
    } else if (!W.boss && bossView) {
      scene.remove(bossView.root);
      bossView.dispose();
      bossView = null;
    }
    if (bossView) bossView.update(dt);
  }

  /* ------------------------------------------------------------------ hero pose in the world */
  function poseHero(dt) {
    const h = W.hero;
    hero.animate(h, W, dt);
    const R = hero.root;
    R.position.set(h.x, h.y, h.z);
    _e.set(0, h.facing, 0);
    _q.setFromEuler(_e);
    if (h.mode === "swing" && h.swing) {
      // hang from the rope: tilt the body's up axis toward the anchor
      const s = h.swing;
      _v.set(s.ax - h.x, s.ay - (h.y + 1.5), s.az - h.z).normalize();
      _q2.setFromUnitVectors(_up, _v);
      const tilt = _q2.clone().slerp(new THREE.Quaternion(), 0.25);
      _q.premultiply(tilt);
      // pivot about the hand: shift the model so the rope hand stays near the line
      R.position.set(h.x, h.y, h.z);
    } else if (h.mode === "climb" && h.wall) {
      R.position.x += h.wall.nx * 0.12;
      R.position.z += h.wall.nz * 0.12;
    }
    R.quaternion.slerp(_q, Math.min(1, dt * (h.mode === "swing" ? 10 : 22)));
    if (h.mode !== "swing") R.quaternion.copy(_q);
    // blob shadow on whatever is under the hero
    const gy = h.floorBox ? h.floorBox.y1 : 0;
    blob.visible = h.y - gy < 40 && !(W.city.water && h.y < 0.2 && !h.floorBox && W.city.water && h.x > W.city.water.x0);
    blob.position.set(h.x, (h.grounded ? h.y : guessFloor(h)) + 0.04, h.z);
    const hgt = Math.max(0, h.y - blob.position.y);
    blob.scale.setScalar(Math.max(0.4, 1 - hgt / 30));
    blob.material.opacity = Math.max(0.08, 0.32 - hgt / 80);
  }
  function guessFloor(h) {
    // nearest roof / street under the hero (cheap: the city's roofAt)
    const r = W.city.roofAt(h.x, h.z);
    return r && r.y <= h.y + 0.1 ? r.y : 0;
  }

  /* ------------------------------------------------------------------ menu backdrop */
  let menuT = 0;
  // the menu hero is backlit by the sunset: a soft key from the camera side
  let menuKey = null;
  if (menu) {
    menuKey = new THREE.PointLight("#ffd9b0", 18, 14, 1.6);
    scene.add(menuKey);
  }
  function menuFrame(dt) {
    menuT += dt;
    const h = W.hero;
    h.action = "perch";
    hero.animate(h, W, dt);
    hero.root.position.set(h.x, h.y, h.z);
    hero.root.rotation.set(0, h.facing, 0);
    // slow cinematic drift: behind and beside the perched hero, the skyline
    // ahead; the hero sits in the right third (the menu lives on the left)
    const fx = Math.sin(h.facing);
    const fz = Math.cos(h.facing);
    const rx = -fz;
    const rz = fx;
    const sway = Math.sin(menuT * 0.06);
    const back = 4.2 + sway * 0.5;
    const side = -3.3 + Math.sin(menuT * 0.045) * 0.5;
    camera.position.set(h.x - fx * back + rx * side, h.y + 1.9 + Math.sin(menuT * 0.09) * 0.3, h.z - fz * back + rz * side);
    camera.lookAt(h.x + fx * 30 - rx * 7, h.y - 6, h.z + fz * 30 - rz * 7);
    camera.fov = 58;
    menuKey.position.set(h.x - fx * 1.5 + rx * -2.5, h.y + 2.2, h.z - fz * 1.5 + rz * -2.5);
    camera.updateProjectionMatrix();
    blob.visible = false;
  }

  /* ------------------------------------------------------------------ frame */
  function frame(dt) {
    dt = Math.min(dt, 0.1);
    t += dt;
    const settings = settingsRef.current;
    if (menu) {
      menuFrame(dt);
      W.t += dt;
      syncActors(dt);
      city.update(t, dt, null);
      env.update(t, dt, camera, W.hero);
      fx.update(dt, W, null, camera);
      return;
    }
    const h = W.hero;
    let look = { dx: 0, dy: 0 };
    if (!paused) {
      let inp;
      if (input) {
        const raw = input.frame();
        const [dx, dy] = input.consumeLook();
        look = { dx, dy };
        raw.camYaw = W.cam.viewYaw ?? W.cam.yaw;
        inp = raw;
      } else inp = { mx: 0, my: 0, camYaw: W.cam.yaw };
      if (TEST && window.__whBot && bot) {
        inp = botInput(W, bot, dt);
      }
      advance(W, inp, dt);
      handleEvents();
    }
    // camera
    const cam = updateCamera(W, paused ? 0.0001 : dt, look, settings);
    camera.position.set(cam.px, cam.py, cam.pz);
    camera.lookAt(cam.tx, cam.ty, cam.tz);
    if (Math.abs(camera.fov - cam.fov) > 0.05) {
      camera.fov = cam.fov;
      camera.updateProjectionMatrix();
    }
    poseHero(paused ? 0 : dt);
    hero.setFade(Math.max(0.15, Math.min(1, (cam.distNow - 1.3) / 1.4)));
    const vis = paused ? 0 : dt;
    syncActors(vis);

    // web line while swinging
    if (h.mode === "swing" && h.swing) {
      hero.webHand(handPos);
      const s = h.swing;
      const b = s.box;
      let nx = 0;
      let ny = 1;
      let nz = 0;
      if (b) {
        const d = [Math.abs(s.ax - b.x0), Math.abs(s.ax - b.x1), Math.abs(s.az - b.z0), Math.abs(s.az - b.z1), Math.abs(s.ay - b.y1)];
        const m = d.indexOf(Math.min(...d));
        [nx, ny, nz] = [[-1, 0, 0], [1, 0, 0], [0, 0, -1], [0, 0, 1], [0, 1, 0]][m];
      }
      fx.setRope(true, handPos, s.ax, s.ay, s.az, nx, ny, nz);
    } else fx.setRope(false);
    // trails while moving fast in the air
    const sp3 = Math.hypot(h.vx, h.vy, h.vz);
    const fast = !h.grounded && sp3 > 15 && !settings.reducedMotion;
    hero.webHand(handPos);
    fx.setTrail(0, handPos.x, handPos.y, handPos.z, fast, 0.1);
    fx.setTrail(1, h.x, h.y + 0.3, h.z, fast && h.mode === "swing", 0.07);
    if (fast && Math.random() < 0.6) fx.burst("speed", h.x, h.y + 1, h.z, { vx: -h.vx * 0.5, vy: -h.vy * 0.5, vz: -h.vz * 0.5 });

    // anchor reticle: where Q would attach right now
    anchorT -= dt;
    if (!paused && anchorT <= 0) {
      anchorT = 0.12;
      anchor = h.mode !== "swing" && h.mode !== "climb" && W.state === "play" ? findAnchor(W, h, W.cam.yaw) : null;
    }
    fx.setReticle(anchor && !h.grounded ? anchor : anchor && h.grounded && h.y > 4 ? anchor : null);

    // objective beacon (the nearest waypoint)
    const wps = W.state === "play" ? waypoints(W) : [];
    let best = null;
    let bd = Infinity;
    for (const p of wps) {
      const d = Math.hypot(p.x - h.x, p.z - h.z);
      if (d < bd) {
        bd = d;
        best = p;
      }
    }
    fx.setBeacon(best && !best.enemy && bd > 4 ? best : null);

    // audio loops: footsteps + wind
    if (!paused) {
      if (h.grounded && h.speed > 2) {
        const st = Math.floor(hero.anim.ph / Math.PI);
        if (st !== lastStep) {
          lastStep = st;
          sound.step(h.speed);
        }
      }
      sound.wind(h.grounded ? 0 : Math.max(0, Math.min(1, (sp3 - 12) / 30)));
    }

    city.update(t, dt, h);
    const flash = env.update(t, dt, camera, h);
    if (flash && !paused) addShake(W.cam, 0.05);
    fx.update(paused ? 0 : dt, W, handPos, camera);
  }

  function setPaused(p) {
    paused = !!p;
    if (paused) sound.wind(0);
  }
  function snapCamera() {
    W.cam.snap = true;
  }
  function setSuit(s) {
    hero.setSuit(s);
  }

  function dispose() {
    for (const v of views.values()) {
      scene.remove(v.root);
      v.dispose();
    }
    for (const v of civViews.values()) {
      scene.remove(v.root);
      v.dispose();
    }
    if (bossView) {
      scene.remove(bossView.root);
      bossView.dispose();
    }
    scene.remove(city.group, hero.root, blob);
    city.dispose();
    hero.dispose();
    fx.dispose();
    env.dispose();
    blob.geometry.dispose();
    blob.material.dispose();
    // anything left (sky, lights, pools)
    while (scene.children.length) scene.remove(scene.children[0]);
    sound.wind(0);
  }

  return { frame, setPaused, snapCamera, setSuit, dispose };
}
