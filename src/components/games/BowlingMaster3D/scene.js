/**
 * Bowling Master 3D — plain Three.js presentation. Builds the alley once from
 * procedural geometry + canvas textures and mirrors the physics state
 * (physics.js) into meshes every frame. No game logic lives here.
 */
import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { LANE_HALF, GUTTER_W, DECK_END, BALL_R, PIN_SPOTS, HALF_PI } from "./physics.js";

export const BALL_COLORS = [
  { name: "Cobalt", base: "#1f5fff", swirl: "#8fd0ff" },
  { name: "Ruby", base: "#c3123f", swirl: "#ff9a6b" },
  { name: "Amethyst", base: "#6b2bd9", swirl: "#f07bff" },
  { name: "Onyx", base: "#16181f", swirl: "#ffb547" },
  { name: "Jade", base: "#0c8f7a", swirl: "#b5ffe0" },
];
const LANE_LEN = -DECK_END;
const LANES = [-3.8, -1.9, 0, 1.9, 3.8];
const UP = new THREE.Vector3(0, 1, 0);

function rand(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function canvas(w, h) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return [c, c.getContext("2d")];
}
function tex(c, renderer, srgb = true) {
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  return t;
}

/* ---------------------------------------------------------------- textures */
function woodBoards(ctx, w, h, boards, r, light = 0) {
  const bw = w / boards;
  for (let i = 0; i < boards; i++) {
    const v = r();
    ctx.fillStyle = `hsl(${30 + v * 6}, ${52 + v * 10}%, ${58 + light + v * 9}%)`;
    ctx.fillRect(i * bw, 0, bw + 1, h);
    for (let g = 0; g < 26; g++) {
      ctx.strokeStyle = `rgba(110,60,20,${0.05 + r() * 0.08})`;
      ctx.lineWidth = 0.6 + r();
      const x = i * bw + r() * bw;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      for (let y = 0; y <= h; y += h / 24) ctx.lineTo(x + Math.sin(y * 0.01 + g) * 1.4, y);
      ctx.stroke();
    }
    ctx.fillStyle = "rgba(70,35,10,0.35)";
    ctx.fillRect(i * bw, 0, 1, h);
  }
}

function laneTexture(renderer) {
  const W = 256, H = 4096;
  const [c, ctx] = canvas(W, H);
  woodBoards(ctx, W, H, 39, rand(7));
  const pxM = H / LANE_LEN;
  const yAt = (z) => H * (1 + z / LANE_LEN);
  const xAt = (x) => ((x + LANE_HALF) / (2 * LANE_HALF)) * W;
  const board = (b) => xAt(-LANE_HALF + (b - 0.5) * ((2 * LANE_HALF) / 39));
  // pin deck: slightly darker, pin spots
  const deck = ctx.createLinearGradient(0, yAt(-17.3), 0, yAt(-17.6));
  deck.addColorStop(0, "rgba(90,45,10,0.18)");
  deck.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = deck;
  ctx.fillRect(0, 0, W, yAt(-17.3));
  ctx.fillStyle = "rgba(40,20,10,0.75)";
  for (const [x, z] of PIN_SPOTS) {
    ctx.beginPath();
    ctx.ellipse(xAt(x), yAt(z), 4, 4 * (pxM / (W / 1.054)), 0, 0, 6.29);
    ctx.fill();
  }
  // arrows (targets) and range-finder dots
  ctx.fillStyle = "#3a1e0c";
  [[5, -3.96], [10, -4.27], [15, -4.57], [20, -4.88], [25, -4.57], [30, -4.27], [35, -3.96]].forEach(([b, z]) => {
    const x = board(b), y = yAt(z);
    ctx.beginPath();
    ctx.moveTo(x, y - 0.22 * pxM);
    ctx.lineTo(x + 5, y);
    ctx.lineTo(x - 5, y);
    ctx.closePath();
    ctx.fill();
  });
  for (const b of [3, 5, 8, 11, 14, 26, 29, 32, 35, 37]) {
    ctx.beginPath();
    ctx.arc(board(b), yAt(-2.13), 2.6, 0, 6.29);
    ctx.fill();
  }
  for (const b of [10, 15, 20, 25, 30]) {
    ctx.beginPath();
    ctx.arc(board(b), yAt(-10.97), 2.2, 0, 6.29);
    ctx.fill();
  }
  ctx.fillStyle = "#111";
  ctx.fillRect(0, H - 6, W, 6); // foul line
  return tex(c, renderer);
}

function approachTexture(renderer) {
  const [c, ctx] = canvas(512, 256);
  woodBoards(ctx, 512, 256, 78, rand(11), 6);
  ctx.fillStyle = "#3a1e0c";
  for (const z of [0.6, 1.4]) for (let b = 0; b < 5; b++) {
    const xc = 256 + (b - 2) * 22;
    ctx.beginPath();
    ctx.arc(xc, 256 - (z / 4.8) * 256, 2.4, 0, 6.29);
    ctx.fill();
  }
  return tex(c, renderer);
}

function ballTexture(renderer, col) {
  const [c, ctx] = canvas(512, 256);
  ctx.fillStyle = col.base;
  ctx.fillRect(0, 0, 512, 256);
  const r = rand(col.name.length * 97);
  for (let i = 0; i < 70; i++) {
    ctx.strokeStyle = i % 3 ? `${col.swirl}55` : `rgba(0,0,0,0.25)`;
    ctx.lineWidth = 2 + r() * 9;
    ctx.beginPath();
    const y0 = r() * 256, f = 0.01 + r() * 0.03, a = 10 + r() * 40, ph = r() * 6;
    for (let x = -10; x <= 522; x += 8) ctx.lineTo(x, y0 + Math.sin(x * f + ph) * a);
    ctx.stroke();
  }
  return tex(c, renderer);
}

function maskTexture(renderer) {
  const [c, ctx] = canvas(1024, 256);
  const g = ctx.createLinearGradient(0, 0, 0, 256);
  g.addColorStop(0, "#0b1433");
  g.addColorStop(1, "#050916");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 1024, 256);
  ctx.strokeStyle = "#2a3c7a";
  ctx.lineWidth = 4;
  ctx.strokeRect(10, 10, 1004, 236);
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.shadowColor = "#ffae3b";
  ctx.shadowBlur = 24;
  ctx.fillStyle = "#ffcf7a";
  ctx.font = "900 92px 'Segoe UI', system-ui, sans-serif";
  ctx.fillText("BOWLING MASTER", 512, 112);
  ctx.shadowColor = "#38d6ff";
  ctx.fillStyle = "#8fe6ff";
  ctx.font = "700 34px 'Segoe UI', system-ui, sans-serif";
  ctx.fillText("AIM  •  ROLL  •  STRIKE", 512, 196);
  return tex(c, renderer);
}

function blobTexture(renderer) {
  const [c, ctx] = canvas(64, 64);
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, "rgba(0,0,0,0.65)");
  g.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  return tex(c, renderer, false);
}

/* ---------------------------------------------------------------- geometry */
function pinGeometry() {
  // [radius, height] profile of a regulation pin (metres), stripe edges doubled for crisp colour
  const prof = [[0, 0], [0.026, 0], [0.034, 0.02], [0.05, 0.07], [0.06, 0.115], [0.058, 0.15], [0.048, 0.2], [0.032, 0.24], [0.0255, 0.2545], [0.0255, 0.255], [0.0235, 0.268], [0.0235, 0.2685], [0.024, 0.2775], [0.024, 0.278], [0.026, 0.29], [0.026, 0.2905], [0.031, 0.33], [0.03, 0.35], [0.022, 0.37], [0.01, 0.379], [0, 0.381]];
  const geo = new THREE.LatheGeometry(prof.map(([r, y]) => new THREE.Vector2(r, y)), 22);
  const pos = geo.attributes.position;
  const col = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i);
    const red = (y >= 0.2549 && y <= 0.2681) || (y >= 0.2779 && y <= 0.2901);
    col.set(red ? [0.75, 0.05, 0.08] : [0.96, 0.95, 0.92], i * 3);
  }
  geo.setAttribute("color", new THREE.BufferAttribute(col, 3));
  return geo;
}

/* ------------------------------------------------------------------- scene */
export function createScene(canvasEl) {
  const renderer = new THREE.WebGLRenderer({ canvas: canvasEl, antialias: true, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color("#070b1c");
  scene.fog = new THREE.Fog("#070b1c", 18, 34);
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envTex = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environment = envTex;

  const camera = new THREE.PerspectiveCamera(48, 1, 0.05, 80);
  camera.position.set(0, 1.4, 3.2);

  const textures = [envTex];
  const T = (t) => (textures.push(t), t);
  const add = (geo, mat, x = 0, y = 0, z = 0, parent = scene) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    parent.add(m);
    return m;
  };

  /* lights */
  scene.add(new THREE.HemisphereLight("#7b8cff", "#24140c", 0.55));
  const key = new THREE.DirectionalLight("#ffe2bf", 1.5);
  key.position.set(1.2, 8, 2);
  key.target.position.set(0, 0, -10);
  scene.add(key, key.target);
  const deckSpot = new THREE.SpotLight("#fff0d8", 60, 9, 0.42, 0.6, 1.2);
  deckSpot.position.set(0, 3.1, -16.3);
  deckSpot.target.position.set(0, 0, -18.7);
  deckSpot.castShadow = true;
  deckSpot.shadow.mapSize.set(1024, 1024);
  deckSpot.shadow.bias = -0.0004;
  deckSpot.shadow.camera.near = 1;
  deckSpot.shadow.camera.far = 6;
  scene.add(deckSpot, deckSpot.target);
  const approachLight = new THREE.PointLight("#ffd29a", 6, 7, 1.6);
  approachLight.position.set(0, 2.6, 1.2);
  scene.add(approachLight);

  /* materials */
  const laneMat = new THREE.MeshPhysicalMaterial({ map: T(laneTexture(renderer)), roughness: 0.3, clearcoat: 1, clearcoatRoughness: 0.06, envMapIntensity: 0.55 });
  const appTex = T(approachTexture(renderer));
  appTex.wrapS = THREE.RepeatWrapping;
  appTex.repeat.set(5, 1);
  const approachMat = new THREE.MeshPhysicalMaterial({ map: appTex, roughness: 0.4, clearcoat: 0.7, clearcoatRoughness: 0.15, envMapIntensity: 0.4 });
  const steel = new THREE.MeshStandardMaterial({ color: "#8d97ad", metalness: 0.85, roughness: 0.32, side: THREE.DoubleSide });
  const dark = new THREE.MeshStandardMaterial({ color: "#0d1430", roughness: 0.8 });
  const capping = new THREE.MeshStandardMaterial({ color: "#1b2550", roughness: 0.45, metalness: 0.2 });
  const black = new THREE.MeshBasicMaterial({ color: "#020308" });
  const pinMat = new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: 0.28, clearcoat: 1, clearcoatRoughness: 0.08, envMapIntensity: 0.6 });
  const neonA = new THREE.MeshBasicMaterial({ color: "#2ad4ff" });
  const neonB = new THREE.MeshBasicMaterial({ color: "#ff4fa8" });
  const ceilLight = new THREE.MeshBasicMaterial({ color: "#fff3df" });

  /* lanes (centre lane is the playable one; neighbours are set dressing) */
  const laneGeo = new THREE.PlaneGeometry(2 * LANE_HALF, LANE_LEN).rotateX(-HALF_PI).translate(0, 0, -LANE_LEN / 2);
  const gutterGeo = new THREE.CylinderGeometry(GUTTER_W / 2, GUTTER_W / 2, LANE_LEN, 18, 1, true, -HALF_PI, Math.PI).rotateX(HALF_PI).translate(0, 0, -LANE_LEN / 2);
  const capGeo = new THREE.BoxGeometry(0.38, 0.06, LANE_LEN + 0.2).translate(0, 0.03, -LANE_LEN / 2);
  const kickGeo = new THREE.BoxGeometry(0.06, 0.9, 2.9).translate(0, 0.45, -18.7);
  for (const lx of LANES) {
    const lane = add(laneGeo, laneMat, lx);
    lane.receiveShadow = true;
    for (const s of [-1, 1]) {
      add(gutterGeo, steel, lx + s * (LANE_HALF + GUTTER_W / 2));
      add(kickGeo, capping, lx + s * (LANE_HALF + GUTTER_W + 0.03));
    }
    add(capGeo, capping, lx + 0.95);
  }
  add(capGeo, capping, LANES[0] - 0.95);
  // pit + back cushion + masking unit
  add(new THREE.BoxGeometry(10, 0.05, 1.2), black, 0, -0.32, DECK_END - 0.6);
  add(new THREE.PlaneGeometry(10, 1.6), new THREE.MeshStandardMaterial({ color: "#05070f", roughness: 1 }), 0, 0.5, DECK_END - 1.1);
  add(new THREE.BoxGeometry(10.2, 1.4, 1.6), dark, 0, 1.55, -18.55);
  const maskTex = T(maskTexture(renderer));
  const maskMat = new THREE.MeshBasicMaterial({ map: maskTex, toneMapped: false });
  const maskDim = new THREE.MeshBasicMaterial({ map: maskTex, color: "#55607a", toneMapped: false });
  for (const lx of LANES) add(new THREE.PlaneGeometry(1.7, 0.42), lx === 0 ? maskMat : maskDim, lx, 1.12, -17.74);
  add(new THREE.BoxGeometry(10.2, 0.025, 0.025), neonA, 0, 0.86, -17.74);

  // approach, carpet, walls, ceiling, neon
  add(new THREE.PlaneGeometry(10.2, 4.8).rotateX(-HALF_PI), approachMat, 0, 0, 2.4).receiveShadow = true;
  add(new THREE.PlaneGeometry(10.2, 8).rotateX(-HALF_PI), new THREE.MeshStandardMaterial({ color: "#151a3d", roughness: 0.95 }), 0, -0.002, 8.8);
  const wallMat = new THREE.MeshStandardMaterial({ color: "#0b1129", roughness: 0.85 });
  for (const s of [-1, 1]) {
    add(new THREE.PlaneGeometry(34, 4.4).rotateY(-s * HALF_PI), wallMat, s * 5.1, 2.2, -6);
    add(new THREE.BoxGeometry(0.04, 0.05, 34), s < 0 ? neonA : neonB, s * 5.07, 2.7, -6);
    add(new THREE.BoxGeometry(0.04, 0.03, 34), s < 0 ? neonB : neonA, s * 5.07, 0.35, -6);
  }
  add(new THREE.PlaneGeometry(10.2, 34).rotateX(HALF_PI), new THREE.MeshStandardMaterial({ color: "#070a1a", roughness: 1 }), 0, 4.2, -6);
  for (let z = 2; z > -17; z -= 3.2) for (const lx of LANES) add(new THREE.BoxGeometry(0.9, 0.03, 0.22), ceilLight, lx, 4.15, z);
  add(new THREE.PlaneGeometry(10.2, 4.4), wallMat, 0, 2.2, 12.8).rotation.y = Math.PI;

  // ball return with a few house balls
  const ret = new THREE.Group();
  ret.position.set(-0.95, 0, 2.6);
  scene.add(ret);
  add(new THREE.BoxGeometry(0.34, 0.5, 1.3), capping, 0, 0.25, 0, ret);
  add(new THREE.CylinderGeometry(0.17, 0.17, 1.3, 20, 1, false, HALF_PI, Math.PI).rotateX(HALF_PI), capping, 0, 0.5, 0, ret);
  const houseGeo = new THREE.SphereGeometry(BALL_R, 28, 18);
  BALL_COLORS.slice(1, 4).forEach((c, i) => {
    add(houseGeo, new THREE.MeshPhysicalMaterial({ map: T(ballTexture(renderer, c)), clearcoat: 1, roughness: 0.25 }), 0.25, 0.6, -0.4 + i * 0.25, ret);
  });

  /* pins */
  const pinGeo = pinGeometry();
  const pins = PIN_SPOTS.map(() => {
    const m = add(pinGeo, pinMat);
    m.castShadow = true;
    m.receiveShadow = true;
    return m;
  });
  const deco = new THREE.InstancedMesh(pinGeo, pinMat, (LANES.length - 1) * 10);
  const tmp = new THREE.Object3D();
  let n = 0;
  for (const lx of LANES) if (lx !== 0) for (const [x, z] of PIN_SPOTS) {
    tmp.position.set(lx + x, 0, z);
    tmp.rotation.y = n;
    tmp.updateMatrix();
    deco.setMatrixAt(n++, tmp.matrix);
  }
  scene.add(deco);

  /* ball (+ finger holes) and its contact shadow */
  const ballTexs = BALL_COLORS.map((c) => T(ballTexture(renderer, c)));
  const ballMat = new THREE.MeshPhysicalMaterial({ map: ballTexs[0], roughness: 0.18, clearcoat: 1, clearcoatRoughness: 0.03, envMapIntensity: 0.9 });
  const ball = add(new THREE.SphereGeometry(BALL_R, 48, 32), ballMat);
  ball.castShadow = true;
  const holeGeo = new THREE.CircleGeometry(0.0115, 16);
  [[0, 0.5], [0.33, 0.24], [-0.33, 0.24]].forEach(([a, b], i) => {
    const d = new THREE.Vector3(Math.sin(a), Math.cos(b), Math.cos(a) * Math.sin(b)).normalize();
    const h = add(i ? holeGeo : new THREE.CircleGeometry(0.014, 16), black, 0, 0, 0, ball);
    h.position.copy(d).multiplyScalar(BALL_R + 0.0008);
    h.lookAt(d.multiplyScalar(2));
  });
  const blobMat = new THREE.MeshBasicMaterial({ map: T(blobTexture(renderer)), transparent: true, depthWrite: false });
  const blob = add(new THREE.PlaneGeometry(0.34, 0.34).rotateX(-HALF_PI), blobMat, 0, 0.002, 0);

  /* aim guide: chevrons along the predicted path */
  const AIM_N = 16;
  const chev = new THREE.Shape();
  [[0, 0.07], [0.06, -0.01], [0.06, -0.045], [0, 0.035], [-0.06, -0.045], [-0.06, -0.01]].forEach(([x, y], i) => (i ? chev.lineTo(x, y) : chev.moveTo(x, y)));
  const chevGeo = new THREE.ShapeGeometry(chev).rotateX(-HALF_PI).scale(2.2, 1, 2.6);
  const aimMat = new THREE.MeshBasicMaterial({ color: "#3fdcff", transparent: true, opacity: 0.9, depthWrite: false, toneMapped: false, side: THREE.DoubleSide });
  const aim = new THREE.InstancedMesh(chevGeo, aimMat, AIM_N);
  aim.frustumCulled = false;
  scene.add(aim);

  /* sweep bar of the pinsetter */
  const sweep = add(new THREE.BoxGeometry(1.5, 0.22, 0.05), new THREE.MeshStandardMaterial({ color: "#c9d2e6", metalness: 0.7, roughness: 0.3 }), 0, 0.16, -17.3);
  sweep.visible = false;

  /* -------------------------------------------------------------- state */
  const cam = { mode: "menu", pos: new THREE.Vector3(0, 1.6, 4), look: new THREE.Vector3(0, 0.3, -14), tPos: new THREE.Vector3(), tLook: new THREE.Vector3() };
  const ballQ = new THREE.Quaternion();
  const qa = new THREE.Quaternion();
  const qb = new THREE.Quaternion();
  const axis = new THREE.Vector3();
  let ballY = BALL_R;
  let rackDrop = 0;
  let time = 0;
  let flash = 0;

  function syncPins(sim) {
    sim.pins.forEach((p, i) => {
      const m = pins[i];
      m.visible = p.state !== "gone" && p.y > -0.42;
      if (!m.visible) return;
      let th = 0, dx = 1, dz = 0;
      if (p.state === "down") {
        th = HALF_PI;
        dx = Math.cos(p.yaw);
        dz = Math.sin(p.yaw);
      } else {
        th = Math.min(HALF_PI, Math.hypot(p.tx, p.tz));
        if (th > 1e-5) {
          dx = p.tx / th;
          dz = p.tz / th;
        }
      }
      qb.setFromAxisAngle(UP, p.state === "down" ? 0 : p.yaw);
      qa.setFromAxisAngle(axis.set(dz, 0, -dx), th);
      m.quaternion.multiplyQuaternions(qa, qb);
      const drop = p.state === "up" ? rackDrop : 0;
      m.position.set(p.x, p.y + 0.056 * Math.sin(th) + drop, p.z);
    });
  }

  function update(dt, sim, aimPath) {
    time += dt;
    // ball
    const b = sim.ball;
    const sp = Math.hypot(b.vx, b.vz);
    if (b.state === "roll" || b.state === "gutter") {
      if (sp > 1e-3) {
        // roll about up × direction by distance / radius, plus a side-spin twist
        qa.setFromAxisAngle(axis.set(b.vz / sp, 0, -b.vx / sp), (sp * dt) / BALL_R);
        ballQ.premultiply(qa);
        qb.setFromAxisAngle(axis.set(b.vx / sp, 0, b.vz / sp), b.spin * 6 * dt);
        ballQ.premultiply(qb);
      }
      ballY = b.y;
    } else if (b.state === "pit") ballY = Math.max(-0.6, ballY - 2.5 * dt);
    else ballY = BALL_R;
    ball.position.set(b.x, ballY, b.z);
    ball.quaternion.copy(ballQ);
    ball.visible = ballY > -0.55;
    blob.visible = ball.visible && ballY > 0.05;
    blob.position.set(b.x, 0.002, b.z);
    syncPins(sim);

    // aim guide
    aim.visible = !!aimPath;
    if (aimPath) {
      const step = Math.max(1, Math.floor(aimPath.length / AIM_N));
      for (let i = 0; i < AIM_N; i++) {
        const k = Math.min(aimPath.length - 2, (i + 1) * step);
        const [x0, z0] = aimPath[k];
        const [x1, z1] = aimPath[k + 1];
        tmp.position.set(x0, 0.004, z0);
        tmp.rotation.set(0, Math.atan2(-(x1 - x0), -(z1 - z0)), 0);
        const pulse = 0.75 + 0.35 * Math.sin(time * 6 - i * 0.6);
        tmp.scale.setScalar(pulse * (1 - i / (AIM_N * 1.6)));
        tmp.updateMatrix();
        aim.setMatrixAt(i, tmp.matrix);
      }
      aim.instanceMatrix.needsUpdate = true;
      aimMat.opacity = 0.7 + 0.2 * Math.sin(time * 3);
    }

    // camera
    const mode = cam.mode;
    if (mode === "menu") {
      cam.tPos.set(Math.sin(time * 0.15) * 1.3, 1.5 + Math.sin(time * 0.21) * 0.15, 3.8);
      cam.tLook.set(0, 0.25, -16);
    } else if (mode === "aim") {
      cam.tPos.set(b.x * 0.55, 1.0, 3.0);
      cam.tLook.set(b.x * 0.25, 0, -8);
    } else if (mode === "follow") {
      const z = Math.max(b.z, -14.2);
      cam.tPos.set(b.x * 0.6, 0.62 + Math.max(0, -z) * 0.012, z + 2.3);
      cam.tLook.set(b.x * 0.35, 0.12, Math.min(z - 5, -18.3));
    } else {
      cam.tPos.set(0, 0.95, -14.9);
      cam.tLook.set(0, 0.12, -18.6);
    }
    const k = 1 - Math.exp(-dt * (mode === "follow" ? 7 : 2.6));
    cam.pos.lerp(cam.tPos, k);
    cam.look.lerp(cam.tLook, k);
    camera.position.copy(cam.pos);
    camera.lookAt(cam.look);

    // ambience
    flash = Math.max(0, flash - dt * 0.8);
    maskMat.color.setScalar(1 + flash * 1.5 + 0.06 * Math.sin(time * 2));
    neonA.color.setHSL(0.53 + 0.03 * Math.sin(time * 0.5), 1, 0.55 + flash * 0.3);
    neonB.color.setHSL(0.92 + 0.02 * Math.sin(time * 0.7), 1, 0.6 + flash * 0.2);
    deckSpot.intensity = 60 + flash * 80;
  }

  return {
    camera,
    update,
    render: () => renderer.render(scene, camera),
    setCamMode(mode, snap = false) {
      cam.mode = mode;
      if (snap) {
        update(10, { ball: { x: 0, z: 0.35, vx: 0, vz: 0, state: "idle" }, pins: [] }, null);
      }
    },
    setBallColor(i) {
      ballMat.map = ballTexs[i % ballTexs.length];
      ballMat.needsUpdate = true;
    },
    setRackDrop(h) {
      rackDrop = h;
    },
    setSweep(z) {
      sweep.visible = z !== null;
      if (z !== null) sweep.position.z = z;
    },
    flash(v = 1) {
      flash = Math.max(flash, v);
    },
    resize(w, h) {
      renderer.setSize(w, h, false);
      camera.aspect = w / Math.max(1, h);
      camera.fov = camera.aspect < 0.8 ? 62 : 48;
      camera.updateProjectionMatrix();
    },
    dispose() {
      const mats = new Set();
      scene.traverse((o) => {
        if (o.geometry) o.geometry.dispose();
        if (o.material) mats.add(o.material);
      });
      mats.forEach((m) => m.dispose());
      textures.forEach((t) => t.dispose());
      pmrem.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
    },
  };
}
