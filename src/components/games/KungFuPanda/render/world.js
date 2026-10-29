/**
 * Plain Three.js view of a Game: scene + lights + scenery, one model per
 * actor (created/removed as the sim spawns/despawns them), blob shadows,
 * enemy health bars, telegraph rings, pooled particles and shock rings, and
 * the smoothed third-person camera (the sim decides how far back it may sit).
 */
import * as THREE from "three";
import { buildCharacter, poseCharacter, buildDummy } from "./characters.js";
import { buildScenery, buildItem } from "./scenery.js";
import { MOVES, ENEMIES } from "../data/heroes.js";
import { cameraClear } from "../engine/world.js";

const SPECIAL_DUR = { belly: 0.95, dash: 0.62, whirl: 0.86, gust: 0.75, pressure: 0.7, ribbon: 0.8 };

function blobTexture() {
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const g = c.getContext("2d");
  const gr = g.createRadialGradient(32, 32, 2, 32, 32, 31);
  gr.addColorStop(0, "rgba(0,0,0,0.55)");
  gr.addColorStop(1, "rgba(0,0,0,0)");
  g.fillStyle = gr;
  g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}
function dotTexture() {
  const c = document.createElement("canvas");
  c.width = c.height = 32;
  const g = c.getContext("2d");
  const gr = g.createRadialGradient(16, 16, 0, 16, 16, 15);
  gr.addColorStop(0, "rgba(255,255,255,1)");
  gr.addColorStop(0.4, "rgba(255,255,255,0.8)");
  gr.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = gr;
  g.fillRect(0, 0, 32, 32);
  return new THREE.CanvasTexture(c);
}

export function createWorld(container) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.domElement.className = "kfp-canvas";
  container.appendChild(renderer.domElement);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(58, 16 / 9, 0.1, 400);
  const hemi = new THREE.HemisphereLight("#ffffff", "#6a7a4a", 1.2);
  const sun = new THREE.DirectionalLight("#fff2dc", 2);
  scene.add(hemi, sun, sun.target);

  const blobTex = blobTexture();
  const blobMat = new THREE.MeshBasicMaterial({ map: blobTex, transparent: true, depthWrite: false });
  const blobGeo = new THREE.PlaneGeometry(1, 1);
  blobGeo.rotateX(-Math.PI / 2);

  // particles
  const NP = 220;
  const pPos = new Float32Array(NP * 3);
  const pCol = new Float32Array(NP * 3);
  const pVel = new Float32Array(NP * 3);
  const pLife = new Float32Array(NP);
  const pGeo = new THREE.BufferGeometry();
  pGeo.setAttribute("position", new THREE.BufferAttribute(pPos, 3));
  pGeo.setAttribute("color", new THREE.BufferAttribute(pCol, 3));
  const pMat = new THREE.PointsMaterial({ size: 0.28, map: dotTexture(), vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
  const points = new THREE.Points(pGeo, pMat);
  points.frustumCulled = false;
  let pNext = 0;
  for (let i = 0; i < NP; i++) pPos[i * 3 + 1] = -999;
  const col = new THREE.Color();
  function burst(x, y, z, n, color, speed = 4, up = 2) {
    col.set(color);
    for (let k = 0; k < n; k++) {
      const i = pNext;
      pNext = (pNext + 1) % NP;
      pPos[i * 3] = x;
      pPos[i * 3 + 1] = y;
      pPos[i * 3 + 2] = z;
      const a = Math.random() * Math.PI * 2, e = Math.random() * 2 - 0.5;
      pVel[i * 3] = Math.cos(a) * speed * (0.4 + Math.random() * 0.6);
      pVel[i * 3 + 1] = up * (0.5 + Math.random()) + e;
      pVel[i * 3 + 2] = Math.sin(a) * speed * (0.4 + Math.random() * 0.6);
      pCol[i * 3] = col.r;
      pCol[i * 3 + 1] = col.g;
      pCol[i * 3 + 2] = col.b;
      pLife[i] = 0.35 + Math.random() * 0.35;
    }
  }
  // shock rings
  const rings = [];
  const ringGeo = new THREE.RingGeometry(0.82, 1, 40);
  ringGeo.rotateX(-Math.PI / 2);
  for (let i = 0; i < 8; i++) {
    const m = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: "#ffffff", transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide }));
    m.visible = false;
    rings.push({ m, t: 1, r: 1, dur: 0.4 });
  }
  let ringNext = 0;
  function ring(x, z, r, color, dur = 0.4) {
    const R = rings[ringNext];
    ringNext = (ringNext + 1) % rings.length;
    R.m.position.set(x, 0.06, z);
    R.m.material.color.set(color);
    R.t = 0;
    R.r = r;
    R.dur = dur;
    R.m.visible = true;
  }
  // telegraph rings (pooled per enemy) + Tai Lung's pounce target
  const teleGeo = new THREE.RingGeometry(0.75, 1, 32);
  teleGeo.rotateX(-Math.PI / 2);
  const pounceMark = new THREE.Mesh(new THREE.CircleGeometry(3.3, 36), new THREE.MeshBasicMaterial({ color: "#ff3a2a", transparent: true, opacity: 0.25, depthWrite: false }));
  pounceMark.rotation.x = -Math.PI / 2;
  const pounceEdge = new THREE.Mesh(teleGeo, new THREE.MeshBasicMaterial({ color: "#ff3a2a", transparent: true, opacity: 0.8, depthWrite: false }));
  pounceEdge.scale.setScalar(3.3);

  let levelGroup = null;
  let fxGroup = null;
  const actors = new Map(); // id -> {R, blob, bar, tele}
  const dummies = [];
  const npcs = [];
  const items = new Map();
  let water = null;
  const cam = { x: 0, y: 3, z: -6, tx: 0, ty: 1, tz: 0, dist: 6, shake: 0, init: false };
  let t = 0;

  function disposeTree(o) {
    o.traverse((n) => {
      if (n.isMesh || n.isPoints || n.isInstancedMesh) {
        if (n.geometry && !n.geometry.userData.shared) n.geometry.dispose?.();
      }
    });
  }

  function clear() {
    for (const a of actors.values()) scene.remove(a.R.root, a.blob, a.bar, a.tele);
    actors.clear();
    dummies.length = 0;
    npcs.length = 0;
    items.clear();
    if (levelGroup) {
      scene.remove(levelGroup);
      disposeTree(levelGroup);
    }
    if (fxGroup) scene.remove(fxGroup);
    levelGroup = fxGroup = null;
  }

  function makeBar(w = 1) {
    const g = new THREE.Group();
    const bg = new THREE.Mesh(new THREE.PlaneGeometry(w, 0.14), new THREE.MeshBasicMaterial({ color: "#1a1010", transparent: true, opacity: 0.75, depthTest: false }));
    const fg = new THREE.Mesh(new THREE.PlaneGeometry(w - 0.04, 0.09), new THREE.MeshBasicMaterial({ color: "#e84a3a", depthTest: false }));
    fg.position.z = 0.001;
    bg.renderOrder = 10;
    fg.renderOrder = 11;
    g.add(bg, fg);
    g.userData = { fg, w: w - 0.04 };
    g.visible = false;
    return g;
  }

  function addActor(id, kind, variant) {
    const R = buildCharacter(kind, variant);
    const blob = new THREE.Mesh(blobGeo, blobMat);
    const tele = new THREE.Mesh(teleGeo, new THREE.MeshBasicMaterial({ color: "#ff4a2a", transparent: true, opacity: 0, depthWrite: false }));
    tele.visible = false;
    const bar = makeBar(kind === "wolf" ? 1 : 1.4);
    scene.add(R.root, blob, tele, bar);
    const a = { R, blob, bar, tele, kind };
    actors.set(id, a);
    return a;
  }

  /** Build everything for a new Game (call once per mission start). */
  function setGame(game) {
    clear();
    const { group, env } = buildScenery(game.level);
    levelGroup = group;
    scene.add(levelGroup);
    water = group.getObjectByName("water");
    scene.background = env.background;
    scene.fog = env.fog;
    hemi.color.set(env.hemi[0]);
    hemi.groundColor.set(env.hemi[1]);
    hemi.intensity = env.hemi[2];
    sun.color.set(env.sun[0]);
    sun.intensity = env.sun[1];
    sun.position.set(...env.sun[2]);
    fxGroup = new THREE.Group();
    fxGroup.add(points, pounceMark, pounceEdge, ...rings.map((r) => r.m));
    pounceMark.visible = pounceEdge.visible = false;
    scene.add(fxGroup);
    for (const d of game.dummies) {
      const D = buildDummy();
      D.root.position.set(d.x, 0, d.z);
      const blob = new THREE.Mesh(blobGeo, blobMat);
      blob.position.set(d.x, 0.02, d.z);
      blob.scale.setScalar(1.1);
      levelGroup.add(D.root, blob);
      dummies.push({ D, ref: d });
    }
    for (const n of game.npcs) {
      const R = buildCharacter(n.id);
      R.root.position.set(n.x, 0, n.z);
      R.root.rotation.y = n.facing;
      const blob = new THREE.Mesh(blobGeo, blobMat);
      blob.position.set(n.x, 0.02, n.z);
      blob.scale.setScalar(0.9);
      levelGroup.add(R.root, blob);
      npcs.push({ R, ref: n });
    }
    for (const it of game.items) {
      const m = buildItem(it.kind);
      m.position.set(it.x, 0, it.z);
      levelGroup.add(m);
      items.set(it.id, { m, ref: it });
    }
    addActor(0, game.hero.id);
    cam.init = false;
    t = 0;
  }

  /** Map sim state → animation name + progress for the posing code. */
  function playerAnim(P, game) {
    const S = game.hero.special;
    switch (P.state) {
      case "punch":
        return { anim: "punch", p: P.st / (MOVES.punch.dur * (P.combo === 3 ? 1.45 : 1)), combo: P.combo };
      case "kick":
        return { anim: "kick", p: P.st / MOVES.kick.dur };
      case "special":
        return { anim: "special", p: P.st / SPECIAL_DUR[S.id], special: S.id };
      case "dodge":
        return { anim: "dodge", p: P.st / 0.4 };
      case "hit":
        return { anim: "hit", p: P.st / 0.36 };
      case "ko":
        return { anim: "ko", p: P.st / 1.2 };
      default:
        return { anim: P.grounded || P.y < 0.05 ? "move" : "air", p: 0 };
    }
  }
  function enemyAnim(e) {
    switch (e.state) {
      case "windup":
        return { anim: "windup", p: e.st / (e.kind === "tailung" ? (e.phase === 2 ? 0.45 : 0.55) : ENEMIES.wolf.windup) };
      case "strike":
        if (e.kind === "tailung") return e.st < 0.38 ? { anim: "strike", p: e.st / 0.38, combo: 1 } : { anim: "strike", p: (e.st - 0.38) / 0.34, combo: 2 };
        return { anim: "strike", p: e.st / 0.32, combo: 1 };
      case "hurt":
        return { anim: "hurt", p: e.st / (e.stunT || 0.4) };
      case "stagger":
        return { anim: "stagger", p: e.st / 0.7 };
      case "ko":
        return { anim: "ko", p: e.st / 1.2 };
      case "intro":
        return { anim: e.st < 0.25 ? "move" : "roar", p: (e.st - 0.25) / 1.2 };
      case "roar":
        return { anim: "roar", p: e.st / 1.4 };
      case "crouch":
        return { anim: "crouch", p: e.st / 0.8 };
      case "leap":
        return { anim: "leap", p: e.st / 0.75 };
      case "land":
        return { anim: "land", p: e.st / 1.1 };
      default:
        return { anim: "move", p: 0 };
    }
  }

  function syncActor(a, o, st, dt, maxSpeed, camQ) {
    a.R.root.position.set(o.x, o.y || 0, o.z);
    a.R.root.rotation.y = o.facing;
    poseCharacter(a.R, { ...st, t, speed: o.speed || 0, maxSpeed, grounded: (o.y || 0) < 0.05, flash: o.flash || 0 }, dt);
    const lift = Math.min(1, (o.y || 0) / 3);
    a.blob.position.set(o.x, 0.025, o.z);
    a.blob.scale.setScalar(o.r * 2.6 * (1 - lift * 0.5));
  }

  /** Handle sim events that need visuals. */
  function onEvents(game, events) {
    for (const e of events) {
      switch (e.type) {
        case "hit": {
          const big = e.move === "special" || e.move === "kick";
          burst(e.x, e.y, e.z, e.dummy ? 8 : big ? 18 : 11, e.dummy ? "#ffe0a0" : big ? "#ffd060" : "#fff2b0", big ? 5 : 3.5);
          if (big) cam.shake = Math.max(cam.shake, 0.12);
          break;
        }
        case "hurt":
          burst(e.x, e.y, e.z, 12, "#ff5a4a", 3.5);
          cam.shake = Math.max(cam.shake, 0.22);
          break;
        case "shock":
          ring(e.x, e.z, e.r, e.color, e.heavy ? 0.55 : 0.4);
          burst(e.x, 0.3, e.z, e.heavy ? 26 : 16, e.color, e.r * 1.6, 1.2);
          if (e.heavy) cam.shake = Math.max(cam.shake, 0.45);
          break;
        case "gust": {
          for (let k = 0; k < 14; k++) {
            const d = 1 + Math.random() * (e.range - 1);
            const sp = (Math.random() - 0.5) * 1.2;
            burst(e.x + Math.sin(e.facing + sp) * d, 0.6 + Math.random() * 1.2, e.z + Math.cos(e.facing + sp) * d, 1, "#e8f4ff", 1.5, 0.5);
          }
          ring(e.x + Math.sin(e.facing) * 2.5, e.z + Math.cos(e.facing) * 2.5, 2.4, "#e8f4ff");
          break;
        }
        case "scroll":
          burst(e.x, 1, e.z, 26, "#ffd860", 3, 3);
          ring(e.x, e.z, 2, "#ffd860");
          break;
        case "heal":
          burst(e.x, 0.8, e.z, 18, "#8aff9a", 2, 3);
          break;
        case "ko":
          if (e.id !== 0) burst(e.x, 1, e.z, 20, "#ffffff", 3, 2);
          break;
        case "land":
          burst(game.player.x, 0.1, game.player.z, 5, "#e0d8c0", 1.6, 0.4);
          break;
        case "roar":
          cam.shake = Math.max(cam.shake, 0.35);
          if (game.boss) ring(game.boss.x, game.boss.z, 5, "#c8d8ff", 0.6);
          break;
        case "block":
          burst(e.x, e.y, e.z, 6, "#9ab8ff", 2);
          break;
        default:
          break;
      }
    }
  }

  const tmpV = new THREE.Vector3();
  const tmpC = new THREE.Vector3();
  const segT = new THREE.Vector3();
  function fadeNearCamera(R, isPlayer) {
    tmpC.copy(R.root.position);
    tmpC.y += R.H * 0.5;
    const d = camera.position.distanceTo(tmpC);
    const near = 0.7 + R.H * 0.45;
    let op = Math.max(0.18, Math.min(1, (d - near * 0.55) / (near * 0.45)));
    if (!isPlayer) {
      // an enemy standing between the lens and the hero is see-through
      segT.set(cam.tx, cam.ty, cam.tz).sub(camera.position);
      const L2 = segT.lengthSq();
      const k = L2 > 1e-6 ? tmpV.copy(tmpC).sub(camera.position).dot(segT) / L2 : -1;
      if (k > 0 && k < 0.92) {
        const off = tmpV.copy(camera.position).addScaledVector(segT, k).distanceTo(tmpC);
        if (off < R.H * 0.32 + 0.25) op = Math.min(op, 0.3);
      }
    }
    if (Math.abs(op - (R.state.op ?? 1)) < 0.01) return;
    R.state.op = op;
    const tr = op < 0.99;
    for (const m of R.mats) {
      if (m.transparent !== tr) {
        m.transparent = tr;
        m.needsUpdate = true;
      }
      m.opacity = tr ? op : 1;
    }
  }
  function render(game, dt, opts = {}) {
    t += dt;
    const P = game.player;
    const camQ = camera.quaternion;
    // spawn/despawn enemy models
    for (const e of game.enemies) if (!actors.has(e.id)) addActor(e.id, e.kind, e.id);
    for (const [id, a] of actors) {
      if (id === 0) continue;
      if (!game.enemies.some((e) => e.id === id)) {
        scene.remove(a.R.root, a.blob, a.bar, a.tele);
        actors.delete(id);
      }
    }
    const pa = actors.get(0);
    if (pa) syncActor(pa, P, playerAnim(P, game), dt, game.hero.speed, camQ);
    let pounce = null;
    for (const e of game.enemies) {
      const a = actors.get(e.id);
      if (!a) continue;
      syncActor(a, e, enemyAnim(e), dt, ENEMIES[e.kind].speed, camQ);
      // telegraph ring under a winding-up attacker
      const tele = e.state === "windup" && !e.dead;
      a.tele.visible = tele;
      if (tele) {
        const p = Math.min(1, e.st / (e.kind === "tailung" ? 0.5 : ENEMIES.wolf.windup));
        a.tele.position.set(e.x, 0.05, e.z);
        a.tele.scale.setScalar(e.r + 0.4 + p * 1.1);
        a.tele.material.opacity = 0.35 + p * 0.5;
      }
      // floating health bar (wolves only; Tai Lung's is in the HUD)
      const showBar = e.kind === "wolf" && !e.dead && (e.hp < e.maxHp || e.alert);
      a.bar.visible = showBar;
      if (showBar) {
        a.bar.position.set(e.x, (e.y || 0) + a.R.H + 0.35, e.z);
        a.bar.quaternion.copy(camQ);
        const f = Math.max(0, e.hp / e.maxHp);
        a.bar.userData.fg.scale.x = Math.max(0.001, f);
        a.bar.userData.fg.position.x = -(1 - f) * a.bar.userData.w * 0.5;
      }
      if (e.kind === "tailung" && (e.state === "crouch" || e.state === "leap")) pounce = e;
    }
    pounceMark.visible = pounceEdge.visible = !!pounce;
    if (pounce) {
      const k = pounce.state === "leap" ? 0.5 + 0.5 * Math.min(1, pounce.st / 0.75) : 0.35 + Math.sin(t * 14) * 0.1;
      pounceMark.position.set(pounce.target.x, 0.04, pounce.target.z);
      pounceEdge.position.set(pounce.target.x, 0.05, pounce.target.z);
      pounceMark.material.opacity = 0.18 + k * 0.25;
    }
    for (const { D, ref } of dummies) {
      const w = ref.wob * Math.sin(t * 20) * 0.35;
      D.post.rotation.x = ref.wobZ * w;
      D.post.rotation.z = -ref.wobX * w;
      for (const m of D.mats) m.emissive?.setRGB(ref.wob > 0.85 ? 0.3 : 0, ref.wob > 0.85 ? 0.22 : 0, 0);
    }
    for (const { R, ref } of npcs) {
      const near = Math.hypot(P.x - ref.x, P.z - ref.z) < 4;
      if (near) R.root.rotation.y += (Math.atan2(P.x - ref.x, P.z - ref.z) - R.root.rotation.y) * Math.min(1, dt * 4);
      poseCharacter(R, { anim: game.talk && near ? "wave" : "idle", p: 0, t, speed: 0 }, dt);
    }
    for (const { m, ref } of items.values()) {
      m.visible = !ref.taken;
      if (m.userData.spin) {
        m.userData.spin.rotation.y = t * 1.6;
        m.userData.spin.position.y = 1 + Math.sin(t * 2.4 + ref.id) * 0.15;
        m.userData.beam.material.opacity = 0.16 + Math.sin(t * 3 + ref.id) * 0.06;
      }
      if (m.userData.steam) {
        const s = (t * 0.6 + ref.id * 0.3) % 1;
        m.userData.steam.position.y = 0.9 + s * 0.8;
        m.userData.steam.material.opacity = 0.35 * (1 - s);
      }
    }
    if (water) water.material.emissiveIntensity = 0.22 + Math.sin(t * 1.5) * 0.05;
    // particles
    for (let i = 0; i < NP; i++) {
      if (pLife[i] <= 0) continue;
      pLife[i] -= dt;
      if (pLife[i] <= 0) {
        pPos[i * 3 + 1] = -999;
        continue;
      }
      pVel[i * 3 + 1] -= 9 * dt;
      pPos[i * 3] += pVel[i * 3] * dt;
      pPos[i * 3 + 1] = Math.max(0.05, pPos[i * 3 + 1] + pVel[i * 3 + 1] * dt);
      pPos[i * 3 + 2] += pVel[i * 3 + 2] * dt;
    }
    pGeo.attributes.position.needsUpdate = true;
    pGeo.attributes.color.needsUpdate = true;
    for (const R of rings) {
      if (!R.m.visible) continue;
      R.t += dt / R.dur;
      if (R.t >= 1) {
        R.m.visible = false;
        continue;
      }
      R.m.scale.setScalar(R.r * (0.25 + 0.75 * Math.sqrt(R.t)));
      R.m.material.opacity = 0.9 * (1 - R.t);
    }

    // camera: smooth target, distance shrinks fast and recovers slowly
    const C = game.cam;
    if (C.target) {
      const kt = cam.init ? 1 - Math.exp(-14 * dt) : 1;
      cam.tx += (C.target.x - cam.tx) * kt;
      cam.ty += (C.target.y - cam.ty) * kt;
      cam.tz += (C.target.z - cam.tz) * kt;
      const kd = !cam.init ? 1 : C.dist < cam.dist ? 1 - Math.exp(-22 * dt) : 1 - Math.exp(-3 * dt);
      cam.dist += (C.dist - cam.dist) * kd;
      cam.init = true;
      const d = Math.min(cam.dist, C.dist + 0.25);
      let x = cam.tx - C.fwd.x * d, y = cam.ty - C.fwd.y * d, z = cam.tz - C.fwd.z * d;
      if (cam.shake > 0) {
        cam.shake = Math.max(0, cam.shake - dt * 1.8);
        const s = cam.shake * 0.35;
        x += (Math.random() - 0.5) * s;
        y += (Math.random() - 0.5) * s;
        z += (Math.random() - 0.5) * s;
      }
      camera.position.set(x, Math.max(0.35, y), z);
      tmpV.set(cam.tx + C.fwd.x * 2, cam.ty + C.fwd.y * 2 + 0.15, cam.tz + C.fwd.z * 2);
      camera.lookAt(tmpV);
    }
    if (opts.victoryOrbit && game.boss) {
      // slow orbit around the fallen boss, pulled in before walls/pillars
      const b = game.boss;
      const a = t * 0.3;
      const fx = -Math.sin(a) * 0.9, fy = -0.42, fz = -Math.cos(a) * 0.9;
      const d = cameraClear(game.col, b.x, 0.9, b.z, fx, fy, fz, 6.5);
      camera.position.set(b.x - fx * d, Math.max(0.6, 0.9 - fy * d), b.z - fz * d);
      camera.lookAt(b.x, 0.6, b.z);
    }
    // characters right in front of the lens fade out instead of filling the screen
    for (const [id, a] of actors) fadeNearCamera(a.R, id === 0 || !!opts.victoryOrbit);
    renderer.render(scene, camera);
  }

  function resize(w, h) {
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.fov = w / h < 1 ? 70 : 58;
    camera.updateProjectionMatrix();
  }

  /** World point → CSS pixel position inside the canvas, or null if behind. */
  function project(x, y, z) {
    tmpV.set(x, y, z).project(camera);
    if (tmpV.z > 1) return null;
    const el = renderer.domElement;
    return { x: ((tmpV.x + 1) / 2) * el.clientWidth, y: ((1 - tmpV.y) / 2) * el.clientHeight };
  }

  function dispose() {
    clear();
    renderer.dispose();
    renderer.domElement.remove();
  }

  return { setGame, render, onEvents, resize, project, dispose, renderer, scene, camera };
}
