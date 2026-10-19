/**
 * The Three.js world: renderer, workshop, lighting, cameras, picking and
 * effects. Plain Three.js (no R3F). The React shell owns the loop and calls
 * update(dt) + render() once per animation frame.
 *
 * Camera modes
 *   menu     slow drift through the workshop behind the menus
 *   counter  facing the customer at the counter
 *   bench    the repair view: the doll turns on its turntable (drag), the
 *            camera tilts, zooms and pans within limits so it never clips
 *   gallery  a restored doll on the turntable
 *   compare  before/after — split-screen wipe or side by side
 */
import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { buildWorkshop, FLOOR_Y } from "./workshop.js";
import { buildTool } from "./tools3d.js";
import { buildPartPreview, buildDoll } from "./dollModel.js";
import { accessoryMount } from "./parts.js";
import { grimeUniforms } from "./materials.js";
import { dotTex, bubbleTex, sparkleTex, disposeTextures } from "./textures.js";
import { HAIR_COLORS, FABRIC_COLORS } from "../data/dolls.js";
import { clamp } from "../engine/rng.js";

const V3 = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const damp = (a, b, k, dt) => a + (b - a) * (1 - Math.exp(-k * dt));

export function createWorld(canvas, { quality = "high", preserve = false } = {}) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: preserve, powerPreference: "high-performance" });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  let q = quality;
  const setPR = () => renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, q === "high" ? 1.75 : 1.1));
  setPR();

  const scene = new THREE.Scene();
  scene.background = new THREE.Color("#2a2026");
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envTex = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environment = envTex;
  scene.environmentIntensity = 0.42;
  const camera = new THREE.PerspectiveCamera(34, 16 / 9, 0.02, 80);

  /* -------------------------------------------------------------- lights */
  const hemi = new THREE.HemisphereLight("#fff1e2", "#8a6650", 0.75);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight("#fff0dc", 1.5);
  sun.position.set(-3, 9, -9);
  sun.target.position.set(0, 0, 1);
  sun.castShadow = true;
  sun.shadow.mapSize.set(q === "high" ? 2048 : 1024, q === "high" ? 2048 : 1024);
  Object.assign(sun.shadow.camera, { left: -10, right: 10, top: 10, bottom: -6, near: 1, far: 30 });
  sun.shadow.bias = -0.0006;
  sun.shadow.normalBias = 0.02;
  scene.add(sun, sun.target);
  const spot = new THREE.SpotLight("#fff4e4", 18, 9, 0.52, 0.65, 1.6);
  spot.position.set(1.4, 4.2, 2.6);
  spot.target.position.set(0, 0.4, 0);
  spot.castShadow = true;
  spot.shadow.mapSize.set(1024, 1024);
  spot.shadow.bias = -0.0004;
  spot.shadow.normalBias = 0.01;
  spot.shadow.camera.near = 1;
  spot.shadow.camera.far = 8;
  scene.add(spot, spot.target);
  const fill = new THREE.DirectionalLight("#ffd9ea", 0.55);
  fill.position.set(-3, 2.5, 3);
  scene.add(fill);
  const lampLights = [];

  /* ------------------------------------------------------------ workshop */
  let shop = null;
  const turnPivot = new THREE.Group();
  scene.add(turnPivot);
  function setUpgrades(up, gallery = []) {
    if (shop) {
      scene.remove(shop.group);
      shop.dispose();
    }
    for (const l of lampLights) scene.remove(l);
    lampLights.length = 0;
    shop = buildWorkshop(up, gallery, { quality: q });
    scene.add(shop.group);
    // keep the doll on the (new) turntable
    shop.turntable.add(turnPivot);
    const stage = up.stage || 0;
    const light = up.lighting || 0;
    for (const p of shop.fixtures.slice(0, 3)) {
      const l = new THREE.PointLight("#ffd9a8", stage === 2 ? 9 : 5, 12, 1.8);
      l.position.copy(p);
      scene.add(l);
      lampLights.push(l);
    }
    hemi.intensity = 0.62 + stage * 0.08 + light * 0.05;
    spot.intensity = 14 + light * 6;
    scene.environmentIntensity = 0.38 + stage * 0.05;
    if (light >= 2) {
      for (const s of [-1, 1]) {
        const l = new THREE.PointLight("#fff3e0", 4, 7, 1.6);
        l.position.set(s * 3.2, 2.0, 1.8);
        scene.add(l);
        lampLights.push(l);
      }
    }
  }

  /* ---------------------------------------------------------------- doll */
  let doll = null;
  function setDoll(model) {
    if (doll && doll !== model) {
      turnPivot.remove(doll.root);
      doll.dispose();
    }
    doll = model;
    if (model) {
      model.root.position.set(0, 0.06, 0);
      turnPivot.add(model.root);
    }
    clearPins();
    hideCarry();
  }

  /* -------------------------------------------------------------- camera */
  const cam = {
    mode: "menu",
    yaw: 0, // doll (turntable) rotation
    pitch: 0.12,
    dist: 2.0,
    panX: 0,
    ty: 0.55,
    cur: { pos: V3(0, 3, 10), look: V3(0, 0.5, 0) },
    t: 0,
    shake: 0,
  };
  const goal = { yaw: 0, pitch: 0.12, dist: 2.0, panX: 0, ty: 0.55 };
  const dollTop = () => (doll ? doll.plan.height : 1);
  function setMode(mode, opts = {}) {
    cam.mode = mode;
    if (mode === "bench" || mode === "gallery") {
      goal.pitch = 0.1;
      goal.dist = opts.dist ?? 1.75;
      goal.ty = opts.ty ?? dollTop() * 0.55;
      goal.panX = 0;
      if (opts.resetYaw) goal.yaw = cam.yaw = 0;
    }
    if (mode === "compare") {
      goal.pitch = 0.08;
      goal.dist = opts.side ? 2.6 : 1.9;
      goal.ty = dollTop() * 0.55;
      goal.panX = 0;
      goal.yaw = 0;
    }
  }
  const lim = () => ({ dMin: 0.5, dMax: 3.4, pMin: -0.12, pMax: 1.15 });
  function rotate(dx, dy) {
    goal.yaw += dx;
    const L = lim();
    goal.pitch = clamp(goal.pitch + dy, L.pMin, L.pMax);
  }
  function zoom(f) {
    const L = lim();
    goal.dist = clamp(goal.dist * f, L.dMin, L.dMax);
  }
  function pan(dx, dy) {
    const k = goal.dist * 0.5;
    goal.panX = clamp(goal.panX + dx * k, -0.45, 0.45);
    goal.ty = clamp(goal.ty + dy * k, 0.05, dollTop() + 0.05);
  }
  function focus(preset) {
    if (!doll) return;
    const p = doll.plan;
    const hc = p.headC[1];
    if (preset === "head") Object.assign(goal, { ty: hc, dist: 0.62, panX: 0, pitch: 0.05 });
    else if (preset === "body") Object.assign(goal, { ty: (p.hipY ?? 0.2) + 0.12, dist: 1.0, panX: 0, pitch: 0.08 });
    else if (preset === "legs") Object.assign(goal, { ty: Math.max(0.12, (p.hipY ?? 0.2) * 0.5), dist: 0.95, panX: 0, pitch: 0.18 });
    else Object.assign(goal, { ty: p.height * 0.52, dist: 1.75, panX: 0, pitch: 0.1 });
  }
  /** Point the camera at a doll-space point (inspection pins, part sockets). */
  function lookAtPoint(pRoot, dist = 0.8, turn = 0.55) {
    if (!doll) return;
    // turn the doll so the point faces the camera
    // turn most of the way (a 3/4 view keeps arms visible past long hair)
    const a = Math.atan2(pRoot.x, pRoot.z);
    goal.yaw = -a * turn;
    goal.ty = clamp(pRoot.y + 0.06, 0.05, dollTop());
    goal.dist = dist;
    goal.panX = 0;
  }

  function updateCamera(dt) {
    cam.t += dt;
    const k = 9;
    cam.yaw = damp(cam.yaw, goal.yaw, k, dt);
    cam.pitch = damp(cam.pitch, goal.pitch, k, dt);
    cam.dist = damp(cam.dist, goal.dist, k, dt);
    cam.panX = damp(cam.panX, goal.panX, k, dt);
    cam.ty = damp(cam.ty, goal.ty, k, dt);
    if (shop) shop.turntable.rotation.y = cam.mode === "bench" || cam.mode === "gallery" || cam.mode === "compare" ? cam.yaw : shop.turntable.rotation.y + dt * 0.25;
    let pos, look;
    if (cam.mode === "menu") {
      const a = Math.sin(cam.t * 0.06) * 0.55;
      pos = V3(Math.sin(a) * 7.5, 2.6 + Math.sin(cam.t * 0.1) * 0.3, 6.8 + Math.cos(a) * 1.2);
      look = V3(Math.sin(a) * 1.2, 0.6, -1.2);
    } else if (cam.mode === "counter") {
      const hy = cust.headY ?? 1.5;
      pos = V3(0.5, hy - 0.25, 2.0);
      look = V3(-0.1, hy - 0.55, 7.35);
    } else {
      const d = cam.dist;
      let pitch = cam.pitch;
      look = V3(cam.panX, cam.ty, 0.06);
      pos = V3(look.x + 0, look.y + Math.sin(pitch) * d, look.z + Math.cos(pitch) * d);
      // never dip into the bench top
      if (pos.y < 0.08) pos.y = 0.08;
    }
    const kk = cam.mode === "bench" || cam.mode === "gallery" || cam.mode === "compare" ? 14 : 2.2;
    cam.cur.pos.lerp(pos, 1 - Math.exp(-kk * dt));
    cam.cur.look.lerp(look, 1 - Math.exp(-kk * dt));
    camera.position.copy(cam.cur.pos);
    if (cam.shake > 0) {
      cam.shake = Math.max(0, cam.shake - dt);
      camera.position.x += Math.sin(cam.t * 70) * 0.004 * cam.shake;
    }
    camera.lookAt(cam.cur.look);
  }
  /** Jump straight to the goal (no swoop) — after loads/restarts. */
  function snapCamera() {
    Object.assign(cam, { yaw: goal.yaw, pitch: goal.pitch, dist: goal.dist, panX: goal.panX, ty: goal.ty });
    const saved = cam.cur;
    updateCamera(0.0001);
    const look = cam.mode === "menu" ? null : V3(cam.panX, cam.ty, 0.06);
    if (look) {
      saved.look.copy(look);
      saved.pos.set(look.x, look.y + Math.sin(cam.pitch) * cam.dist, look.z + Math.cos(cam.pitch) * cam.dist);
      if (saved.pos.y < 0.08) saved.pos.y = 0.08;
      camera.position.copy(saved.pos);
      camera.lookAt(saved.look);
    }
  }

  /* -------------------------------------------------------------- picking */
  const ray = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  function pick(nx, ny) {
    if (!doll) return null;
    ndc.set(nx, ny);
    ray.setFromCamera(ndc, camera);
    const hits = ray.intersectObjects(doll.pickables, false);
    for (const h of hits) {
      const o = h.object;
      if (!o.visible || o.userData.preview) continue;
      const part = o.userData.part;
      if (!part || part === "stand") continue;
      const point = doll.root.worldToLocal(h.point.clone());
      let normal = null;
      if (h.face) {
        normal = h.face.normal.clone().transformDirection(o.matrixWorld);
        const inv = new THREE.Matrix4().copy(doll.root.matrixWorld).invert();
        normal.transformDirection(inv);
      }
      const hit = { point, normal, part, uv: h.uv ? h.uv.clone() : null, lock: null, world: h.point.clone() };
      if (part === "hair" && doll.hair && h.face && o === doll.hair.mesh) hit.lock = doll.hair.lockAt(h.face.a);
      if (part.startsWith("acc:") || part === "scalp") hit.part = part;
      return hit;
    }
    return null;
  }
  function rayRoot(nx, ny) {
    if (!doll) return null;
    ndc.set(nx, ny);
    ray.setFromCamera(ndc, camera);
    const o = doll.root.worldToLocal(ray.ray.origin.clone());
    const p2 = doll.root.worldToLocal(ray.ray.origin.clone().add(ray.ray.direction));
    return { origin: o, dir: p2.sub(o).normalize() };
  }
  /** Screen position (NDC) of a doll-space point — used by the browser bot. */
  function toNdc(pRoot) {
    if (!doll) return null;
    const w = doll.root.localToWorld(pRoot.clone());
    w.project(camera);
    return { x: w.x, y: w.y, z: w.z };
  }

  /* --------------------------------------------------------------- cursor */
  const tools = {};
  let toolObj = null;
  let toolId = null;
  function setTool(id) {
    if (toolId === id) return;
    toolId = id;
    if (toolObj) toolObj.parent?.remove(toolObj);
    toolObj = null;
    if (!id || id === "hand") return;
    if (!tools[id]) tools[id] = buildTool(id);
    toolObj = tools[id];
    toolObj.visible = false;
    scene.add(toolObj);
  }
  const cursorState = { hit: null, active: false, rub: 0, wob: 0 };
  function updateCursor(hit, active) {
    cursorState.hit = hit;
    cursorState.active = active;
  }
  function setPaintColor(hex) {
    const t = tools.paint;
    if (t && t.userData.tipMat) t.userData.tipMat.color.set(hex);
  }
  function placeCursor(dt) {
    if (!toolObj) return;
    const h = cursorState.hit;
    if (!h || !doll) {
      toolObj.visible = false;
      return;
    }
    toolObj.visible = true;
    const wp = doll.root.localToWorld(h.point.clone());
    const n = h.normal ? h.normal.clone().transformDirection(doll.root.matrixWorld).normalize() : camera.position.clone().sub(wp).normalize();
    // lean toward the camera so the tool stays readable
    const toCam = camera.position.clone().sub(wp).normalize();
    const up = n.clone().lerp(toCam, 0.45).normalize();
    const off = (toolObj.userData.offset || 0) + (cursorState.active ? 0.0 : 0.012);
    cursorState.wob += dt * (cursorState.active ? 30 : 4);
    toolObj.position.copy(wp).addScaledVector(up, off + (cursorState.active ? Math.sin(cursorState.wob) * 0.003 : 0.004));
    toolObj.quaternion.setFromUnitVectors(V3(0, 1, 0), up);
    toolObj.scale.setScalar(0.62 * clamp(cam.dist / 1.2, 0.55, 1.2));
    toolObj.rotateY(cursorState.active ? Math.sin(cursorState.wob * 0.5) * 0.2 : 0);
  }

  /* ------------------------------------------------------------- particles */
  const P_KINDS = {
    dust: { tex: dotTex, color: "#d8cfc2", size: 0.035, life: 1.4, g: -0.05, n: 300, blend: THREE.NormalBlending, alpha: 0.55 },
    dirt: { tex: dotTex, color: "#8a6a4a", size: 0.028, life: 1.0, g: -0.4, n: 200, blend: THREE.NormalBlending, alpha: 0.6 },
    foam: { tex: bubbleTex, color: "#ffffff", size: 0.03, life: 1.6, g: 0.03, n: 300, blend: THREE.NormalBlending, alpha: 0.95 },
    spray: { tex: dotTex, color: "#cfeeff", size: 0.03, life: 0.6, g: -0.2, n: 300, blend: THREE.AdditiveBlending, alpha: 0.6 },
    sparkle: { tex: sparkleTex, color: "#fff2b0", size: 0.045, life: 0.9, g: 0.05, n: 200, blend: THREE.AdditiveBlending, alpha: 1 },
    steam: { tex: dotTex, color: "#ffffff", size: 0.06, life: 1.4, g: 0.15, n: 200, blend: THREE.NormalBlending, alpha: 0.35 },
    smear: { tex: dotTex, color: "#fff4d6", size: 0.02, life: 2.4, g: 0, n: 80, blend: THREE.NormalBlending, alpha: 0.9 },
    confetti: { tex: sparkleTex, color: "#ffffff", size: 0.06, life: 2.4, g: -0.5, n: 300, blend: THREE.NormalBlending, alpha: 1, rainbow: true },
  };
  const particles = {};
  for (const [k, def] of Object.entries(P_KINDS)) particles[k] = makeParticles(def);
  function makeParticles(def) {
    const n = def.n;
    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array(n * 3);
    const col = new Float32Array(n * 4);
    const size = new Float32Array(n);
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    geo.setAttribute("aColor", new THREE.BufferAttribute(col, 4));
    geo.setAttribute("aSize", new THREE.BufferAttribute(size, 1));
    const m = new THREE.ShaderMaterial({
      uniforms: { uTex: { value: def.tex() }, uScale: { value: 600 } },
      vertexShader: `attribute vec4 aColor; attribute float aSize; varying vec4 vC; uniform float uScale;
        void main(){ vC = aColor; vec4 mv = modelViewMatrix * vec4(position,1.0); gl_PointSize = aSize * uScale / -mv.z; gl_Position = projectionMatrix * mv; }`,
      fragmentShader: `uniform sampler2D uTex; varying vec4 vC; void main(){ vec4 t = texture2D(uTex, gl_PointCoord); gl_FragColor = vec4(vC.rgb, vC.a * t.a); if (gl_FragColor.a < 0.01) discard; }`,
      transparent: true,
      depthWrite: false,
      blending: def.blend,
    });
    const pts = new THREE.Points(geo, m);
    pts.frustumCulled = false;
    pts.renderOrder = 5;
    scene.add(pts);
    const st = { def, pts, geo, pos, col, size, vel: new Float32Array(n * 3), life: new Float32Array(n), max: new Float32Array(n), base: new Float32Array(n * 3), head: 0 };
    return st;
  }
  const baseCol = new THREE.Color();
  function emit(kind, wp, normal, count = 6, spread = 0.03) {
    const P = particles[kind];
    if (!P) return;
    const d = P.def;
    for (let c = 0; c < count; c++) {
      const i = P.head;
      P.head = (P.head + 1) % d.n;
      P.pos[i * 3] = wp.x + (Math.random() - 0.5) * spread;
      P.pos[i * 3 + 1] = wp.y + (Math.random() - 0.5) * spread;
      P.pos[i * 3 + 2] = wp.z + (Math.random() - 0.5) * spread;
      const n = normal || V3(0, 1, 0);
      const sp = kind === "confetti" ? 0.9 : kind === "spray" ? 0.25 : 0.12;
      P.vel[i * 3] = n.x * sp * Math.random() + (Math.random() - 0.5) * sp;
      P.vel[i * 3 + 1] = n.y * sp * Math.random() + (Math.random() - 0.3) * sp + (kind === "confetti" ? 0.9 : 0);
      P.vel[i * 3 + 2] = n.z * sp * Math.random() + (Math.random() - 0.5) * sp;
      P.life[i] = P.max[i] = d.life * (0.6 + Math.random() * 0.6);
      P.size[i] = d.size * (0.6 + Math.random() * 0.8);
      if (d.rainbow) baseCol.setHSL(Math.random(), 0.75, 0.65);
      else baseCol.set(d.color);
      P.base[i * 3] = baseCol.r;
      P.base[i * 3 + 1] = baseCol.g;
      P.base[i * 3 + 2] = baseCol.b;
    }
  }
  function updateParticles(dt) {
    for (const P of Object.values(particles)) {
      const d = P.def;
      let any = false;
      for (let i = 0; i < d.n; i++) {
        if (P.life[i] <= 0) {
          P.col[i * 4 + 3] = 0;
          continue;
        }
        any = true;
        P.life[i] -= dt;
        P.vel[i * 3 + 1] += d.g * dt;
        const drag = Math.exp(-dt * 1.5);
        for (let c = 0; c < 3; c++) {
          P.vel[i * 3 + c] *= drag;
          P.pos[i * 3 + c] += P.vel[i * 3 + c] * dt;
        }
        const t = P.life[i] / P.max[i];
        P.col[i * 4] = P.base[i * 3];
        P.col[i * 4 + 1] = P.base[i * 3 + 1];
        P.col[i * 4 + 2] = P.base[i * 3 + 2];
        P.col[i * 4 + 3] = d.alpha * Math.min(1, t * 2.5) * (kind(d) === "sparkle" ? 1 : 1);
      }
      P.pts.visible = any;
      if (any) {
        P.geo.attributes.position.needsUpdate = true;
        P.geo.attributes.aColor.needsUpdate = true;
        P.geo.attributes.aSize.needsUpdate = true;
      }
    }
  }
  const kind = () => "";
  /** Effects from session events (points are doll-space). */
  function fx(kindName, pRoot, nRoot = null, opts = {}) {
    if (!doll) return;
    const wp = doll.root.localToWorld(pRoot.clone());
    const wn = nRoot ? nRoot.clone().transformDirection(doll.root.matrixWorld) : null;
    const map = { dust: ["dust", 3], dirt: ["dirt", 2], foam: ["foam", 3], spray: ["spray", 14], sparkle: ["sparkle", opts.small ? 1 : 3], steam: ["steam", 2], smear: ["smear", 1], confetti: ["confetti", 80], stitch: ["sparkle", 4], done: ["sparkle", 24] };
    const [k, n] = map[kindName] || ["sparkle", 3];
    emit(k, wp, wn, n, kindName === "confetti" || kindName === "done" ? 0.25 : 0.03);
  }
  function celebrate() {
    if (!doll) return;
    emit("confetti", doll.root.localToWorld(V3(0, doll.plan.height * 0.9, 0)), V3(0, 1, 0), 140, 0.3);
  }

  /* ----------------------------------------------------------------- pins */
  const pins = [];
  const pinGeo = new THREE.SphereGeometry(0.012, 12, 10);
  const pinStem = new THREE.CylinderGeometry(0.0025, 0.0025, 0.05, 6);
  const pinOk = new THREE.MeshStandardMaterial({ color: "#ffb347", emissive: "#ff8a1f", emissiveIntensity: 0.6, roughness: 0.4 });
  const pinBad = new THREE.MeshStandardMaterial({ color: "#ff5a5a", emissive: "#ff2020", emissiveIntensity: 0.5, transparent: true });
  function addPin(pRoot, normal, ok = true) {
    if (!doll) return;
    const g = new THREE.Group();
    const n = normal ? normal.clone().normalize() : pRoot.clone().setY(0).normalize();
    const head = new THREE.Mesh(pinGeo, ok ? pinOk : pinBad.clone());
    head.position.y = 0.05;
    const stem = new THREE.Mesh(pinStem, ok ? pinOk : head.material);
    stem.position.y = 0.025;
    g.add(head, stem);
    g.position.copy(pRoot);
    g.quaternion.setFromUnitVectors(V3(0, 1, 0), n.lengthSq() > 0.1 ? n : V3(0, 0, 1));
    g.traverse((o) => (o.raycast = () => {}));
    doll.root.add(g);
    pins.push({ g, ok, t: ok ? Infinity : 1.2, born: 0 });
  }
  function clearPins() {
    for (const p of pins) p.g.parent?.remove(p.g);
    pins.length = 0;
  }
  function updatePins(dt) {
    for (let i = pins.length - 1; i >= 0; i--) {
      const p = pins[i];
      p.born += dt;
      const s = Math.min(1, p.born * 6);
      p.g.scale.setScalar(s * (p.ok ? 1 + Math.sin(p.born * 4) * 0.08 : 1));
      if (!p.ok) {
        p.t -= dt;
        p.g.children[0].material.opacity = clamp(p.t, 0, 1);
        if (p.t <= 0) {
          p.g.parent?.remove(p.g);
          pins.splice(i, 1);
        }
      }
    }
  }

  /* ---------------------------------------------------------- part carry */
  let carryObj = null;
  let carryId = null;
  const ringMat = new THREE.MeshBasicMaterial({ color: "#ffffff", transparent: true, opacity: 0.9, depthTest: false });
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.035, 0.004, 8, 40), ringMat);
  ring.renderOrder = 10;
  ring.visible = false;
  ring.raycast = () => {};
  const sockets = [];
  function showSockets(list) {
    for (const s of sockets) s.parent?.remove(s);
    sockets.length = 0;
    if (!doll) return;
    for (const so of list) {
      const r = new THREE.Mesh(ring.geometry, new THREE.MeshBasicMaterial({ color: "#7fe0ff", transparent: true, opacity: 0.6, depthTest: false }));
      r.position.copy(so.pos);
      r.renderOrder = 9;
      r.raycast = () => {};
      r.userData.so = so;
      doll.root.add(r);
      sockets.push(r);
    }
  }
  function hideCarry() {
    if (carryObj) carryObj.parent?.remove(carryObj);
    carryObj = null;
    carryId = null;
    ring.visible = false;
    ring.parent?.remove(ring);
  }
  function showCarry(c, model) {
    if (!c || !c.pos) {
      if (!c) hideCarry();
      return;
    }
    if (carryId !== c.partId) {
      hideCarry();
      carryId = c.partId;
      carryObj = buildPartPreview(model, c.partId, c.target);
      carryObj.traverse((o) => (o.raycast = () => {}));
      model.root.add(carryObj);
      model.root.add(ring);
    }
    const so = c.target;
    carryObj.position.copy(c.pos);
    const a = THREE.MathUtils.degToRad(c.angle);
    const base = new THREE.Quaternion();
    if (so.kind === "eye" || so.kind === "button") {
      const m4 = new THREE.Matrix4().lookAt(V3(0, 0, 0), (so.forward || so.axis).clone().negate(), V3(0, 1, 0));
      base.setFromRotationMatrix(m4);
    } else if (so.kind === "acc") {
      const mnt = accessoryMount(so.want, model.plan);
      base.setFromEuler(mnt.rot);
    }
    const spin = new THREE.Quaternion().setFromAxisAngle(so.kind === "eye" || so.kind === "button" || so.kind === "acc" || so.kind === "shoe" ? V3(0, 1, 0) : so.axis.clone().normalize(), a);
    carryObj.quaternion.copy(so.kind === "eye" || so.kind === "button" ? base.clone().multiply(spin) : spin.clone().multiply(base));
    ring.position.copy(so.pos);
    ring.visible = true;
    const col = !c.snapped ? "#ffffff" : !c.fits ? "#ff5a5a" : Math.abs(c.angle) > 14 ? "#ffd23f" : "#4dff88";
    ringMat.color.set(col);
    c._ringColor = col;
  }

  /* -------------------------------------------------- detached parts → tray */
  const flying = [];
  function detachAnim(obj) {
    if (!obj || !shop) return;
    scene.attach(obj);
    const from = obj.position.clone();
    const to = shop.tray.localToWorld(V3((Math.random() - 0.5) * 0.4, 0.1, (Math.random() - 0.5) * 0.25));
    flying.push({ obj, from, to, t: 0, rot: new THREE.Euler(Math.random() * 2, Math.random() * 2, Math.random() * 2) });
    while (flying.length > 4) {
      const f = flying.shift();
      f.obj.parent?.remove(f.obj);
    }
  }
  function updateFlying(dt) {
    for (const f of flying) {
      if (f.t >= 1) continue;
      f.t = Math.min(1, f.t + dt * 1.4);
      const e = 1 - (1 - f.t) ** 3;
      f.obj.position.lerpVectors(f.from, f.to, e);
      f.obj.position.y += Math.sin(f.t * Math.PI) * 0.35;
      f.obj.rotation.x += f.rot.x * dt;
      f.obj.rotation.z += f.rot.z * dt;
      if (f.t >= 1) f.obj.rotation.set(Math.PI / 2, f.rot.y, 0);
    }
  }

  /* ------------------------------------------------------------- customer */
  let customer = null;
  const cust = { anim: "idle", t: 0 };
  const nearest = (hex, table) => {
    const c = new THREE.Color(hex);
    let best = null, bd = 9;
    for (const [k, v] of Object.entries(table)) {
      const d = c.clone().sub(new THREE.Color(v.hex));
      const dd = d.r * d.r + d.g * d.g + d.b * d.b;
      if (dd < bd) {
        bd = dd;
        best = k;
      }
    }
    return best;
  };
  function setCustomer(c) {
    if (customer) {
      scene.remove(customer.root);
      customer.dispose();
      customer = null;
    }
    if (!c) return;
    const styleMap = { pigtails: "twintails", bob: "bob", long: "long", wavy: "wavy", bun: "bun", ponytail: "ponytail", short: "bob", twintails: "twintails" };
    customer = buildDoll({ type: "fashion", look: { hairStyle: styleMap[c.style] || "bob", hairColor: nearest(c.hair, HAIR_COLORS), dressColor: nearest(c.top, FABRIC_COLORS), outfit: "sailor", hat: "none", ribbon: "none", extra: "none", shoes: "boots" }, damage: [], seed: 77, skin: c.skin });
    if (customer.stand) customer.stand.visible = false;
    const s = c.age === "child" ? 3.3 : 4.3;
    customer.root.scale.setScalar(s);
    customer.root.position.set(0, FLOOR_Y + (c.age === "child" ? 0.4 : 0), 7.35);
    customer.root.rotation.y = Math.PI;
    customer.root.traverse((o) => (o.raycast = () => {}));
    scene.add(customer.root);
    cust.anim = "idle";
    cust.t = 0;
    cust.base = customer.root.position.y;
    cust.scale = s;
    cust.headY = customer.root.position.y + customer.plan.headC[1] * s;
  }
  function customerAnim(a) {
    cust.anim = a;
    cust.t = 0;
  }
  function updateCustomer(dt) {
    if (!customer) return;
    cust.t += dt;
    const r = customer.root;
    r.rotation.z = Math.sin(cam.t * 1.3) * 0.015;
    let y = cust.base;
    let sy = 1;
    if (cust.anim === "talk") y += Math.abs(Math.sin(cust.t * 9)) * 0.03;
    if (cust.anim === "happy") y += Math.max(0, Math.sin(cust.t * 7)) * 0.35 * Math.max(0, 1 - cust.t / 2.4);
    if (cust.anim === "sad") {
      r.rotation.x = -Math.min(0.12, cust.t * 0.2);
      sy = 1 - Math.min(0.04, cust.t * 0.05);
    } else r.rotation.x = 0;
    r.position.y = y;
    r.scale.set(cust.scale, cust.scale * sy, cust.scale);
  }

  /* ------------------------------------------------------- before / after */
  const compare = { before: null, after: null, split: 0.5, side: false, active: false };
  function setCompare(before, after, { side = false } = {}) {
    clearCompare();
    compare.before = before;
    compare.after = after;
    compare.side = side;
    compare.active = !!(before && after);
    if (!compare.active) return;
    if (doll) doll.root.visible = false;
    for (const m of [before, after]) {
      m.root.position.set(0, 0.06, 0);
      turnPivot.add(m.root);
    }
    layoutCompare();
  }
  function layoutCompare() {
    if (!compare.active) return;
    compare.before.root.position.x = compare.side ? -0.34 : 0;
    compare.after.root.position.x = compare.side ? 0.34 : 0;
    compare.before.root.visible = true;
    compare.after.root.visible = true;
  }
  function setSplit(v, side) {
    compare.split = clamp(v, 0, 1);
    if (side != null && side !== compare.side) {
      compare.side = side;
      layoutCompare();
      setMode("compare", { side });
    }
  }
  function clearCompare() {
    for (const k of ["before", "after"]) {
      const m = compare[k];
      if (m) {
        turnPivot.remove(m.root);
        m.dispose();
      }
      compare[k] = null;
    }
    compare.active = false;
    if (doll) doll.root.visible = true;
  }

  /* ------------------------------------------------------------- frame */
  let W = 1, H = 1;
  function setSize(w, h) {
    W = Math.max(1, w);
    H = Math.max(1, h);
    renderer.setSize(W, H, false);
    camera.aspect = W / H;
    camera.updateProjectionMatrix();
    for (const P of Object.values(particles)) P.pts.material.uniforms.uScale.value = H * 0.9;
  }
  function setQuality(qq) {
    q = qq;
    setPR();
    renderer.shadowMap.enabled = true;
    spot.castShadow = q === "high";
    setSize(W, H);
  }
  function update(dt) {
    updateCamera(dt);
    placeCursor(dt);
    updateParticles(dt);
    updatePins(dt);
    updateFlying(dt);
    updateCustomer(dt);
    for (const s of sockets) {
      s.quaternion.copy(camera.quaternion);
      s.material.opacity = 0.45 + Math.sin(cam.t * 5) * 0.25;
    }
    if (ring.visible) ring.quaternion.copy(camera.quaternion);
    if (shop && shop.clockHands) {
      const d = new Date();
      shop.clockHands[0].rotation.z = -((d.getMinutes() / 60) * Math.PI * 2);
      shop.clockHands[1].rotation.z = -(((d.getHours() % 12) / 12) * Math.PI * 2);
    }
  }
  function render() {
    if (compare.active && !compare.side) {
      const split = Math.round(W * compare.split);
      renderer.setScissorTest(true);
      // left: before
      compare.before.root.visible = true;
      compare.after.root.visible = false;
      renderer.setScissor(0, 0, split, H);
      renderer.setViewport(0, 0, W, H);
      renderer.render(scene, camera);
      compare.before.root.visible = false;
      compare.after.root.visible = true;
      renderer.setScissor(split, 0, W - split, H);
      renderer.render(scene, camera);
      renderer.setScissorTest(false);
      compare.before.root.visible = true;
      return;
    }
    renderer.render(scene, camera);
  }

  function dispose() {
    clearCompare();
    setCustomer(null);
    hideCarry();
    if (doll) {
      turnPivot.remove(doll.root);
      doll.dispose();
      doll = null;
    }
    if (shop) shop.dispose();
    for (const t of Object.values(tools)) t.traverse((o) => o.isMesh && (o.geometry.dispose(), o.material.dispose?.()));
    for (const P of Object.values(particles)) {
      P.geo.dispose();
      P.pts.material.dispose();
    }
    for (const f of flying) f.obj.parent?.remove(f.obj);
    pinGeo.dispose();
    pinStem.dispose();
    envTex.dispose();
    pmrem.dispose();
    disposeTextures();
    renderer.dispose();
  }

  return {
    renderer,
    scene,
    camera,
    cam,
    goal,
    get doll() {
      return doll;
    },
    get shop() {
      return shop;
    },
    setSize,
    setQuality,
    setUpgrades,
    setDoll,
    setMode,
    snapCamera,
    rotate,
    zoom,
    pan,
    focus,
    lookAtPoint,
    pick,
    rayRoot,
    toNdc,
    setTool,
    updateCursor,
    setPaintColor,
    fx,
    celebrate,
    addPin,
    clearPins,
    showCarry,
    hideCarry,
    showSockets,
    detachAnim,
    setCustomer,
    customerAnim,
    setCompare,
    setSplit,
    clearCompare,
    setReveal: (v) => (grimeUniforms.uReveal.value = v ? 1 : 0),
    update,
    render,
    dispose,
  };
}
