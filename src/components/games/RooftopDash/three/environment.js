/**
 * Rooftop Dash — the city around the course: sky, sun, fog, background
 * blocks, street + traffic, distant skyline, clouds, birds and per-district
 * dressing (cranes, neon, cloud sea).
 *
 * Gameplay safety: background buildings are placed from the route's
 * collision boxes. Anything near the route is either LOW (top below the
 * level's kill height — you can never land on it) or TALL and SOLID (added
 * to the collision world so it behaves like the wall it looks like). Graphics
 * quality only changes how much of the FAR city is drawn — never collision.
 */
import * as THREE from "three";
import { buildingMaterial, skyMaterial, cloudTexture, glowTexture, neonTexture } from "./materials.js";
import { addBox } from "../engine/collision.js";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

/* ------------------------------------------------------------------ rng */
export function rng(seed) {
  let s = (seed * 2654435761) >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s >>>= 0;
    s ^= s >>> 17;
    s ^= s << 5;
    s >>>= 0;
    return s / 4294967296;
  };
}

const QUALITY = {
  low: { cityR: 75, skyline: 40, cars: 30, clouds: 0.5, birds: 1, shadows: 0, detail: 0.35 },
  medium: { cityR: 115, skyline: 90, cars: 70, clouds: 0.8, birds: 2, shadows: 1024, detail: 0.7 },
  high: { cityR: 150, skyline: 160, cars: 130, clouds: 1, birds: 3, shadows: 2048, detail: 1 },
};
export const qualityOf = (q) => QUALITY[q] || QUALITY.medium;

function rectDist(b, x0, z0, x1, z1) {
  const dx = Math.max(b.min[0] - x1, x0 - b.max[0], 0);
  const dz = Math.max(b.min[2] - z1, z0 - b.max[2], 0);
  return Math.hypot(dx, dz);
}

/**
 * Background blocks — deterministic per level (seed), quality only trims the
 * far ring. Returns { near, far } lists of {x0,z0,x1,z1,top,style,color}.
 * `near` tall buildings are ALSO added to the collision world by the caller.
 */
export function planCity(level, theme, quality) {
  const Q = qualityOf(quality);
  const r = rng(level.id * 977 + 13);
  const routeBoxes = level.boxes.filter((b) => b.kind === "building" || b.kind === "wall");
  const [bx0, bz0, bx1, bz1] = level.bounds;
  const street = level.streetY ?? -30;
  const kill = level.killY;
  const top = level.topY ?? 0;
  const BLOCK = 26;
  const ROAD = 10;
  const PITCH = BLOCK + ROAD;
  const pad = 150; // planning extent is fixed (deterministic); quality filters afterwards
  const gx0 = Math.floor((bx0 - pad) / PITCH);
  const gx1 = Math.ceil((bx1 + pad) / PITCH);
  const gz0 = Math.floor((bz0 - pad) / PITCH);
  const gz1 = Math.ceil((bz1 + pad) / PITCH);
  const out = [];
  for (let gx = gx0; gx <= gx1; gx++) {
    for (let gz = gz0; gz <= gz1; gz++) {
      const ox = gx * PITCH + ROAD / 2;
      const oz = gz * PITCH + ROAD / 2;
      // split the block into 1–4 lots
      const split = r();
      const lots = [];
      if (split < 0.25) lots.push([0, 0, BLOCK, BLOCK]);
      else if (split < 0.6) {
        const m = BLOCK * (0.4 + r() * 0.2);
        if (r() < 0.5) lots.push([0, 0, m, BLOCK], [m, 0, BLOCK, BLOCK]);
        else lots.push([0, 0, BLOCK, m], [0, m, BLOCK, BLOCK]);
      } else {
        const mx = BLOCK * (0.4 + r() * 0.2);
        const mz = BLOCK * (0.4 + r() * 0.2);
        lots.push([0, 0, mx, mz], [mx, 0, BLOCK, mz], [0, mz, mx, BLOCK], [mx, mz, BLOCK, BLOCK]);
      }
      for (const [a, b, c, d] of lots) {
        const inset = 0.8 + r() * 1.2;
        const x0 = ox + a + inset;
        const z0 = oz + b + inset;
        const x1 = ox + c - inset;
        const z1 = oz + d - inset;
        if (x1 - x0 < 5 || z1 - z0 < 5) continue;
        let dmin = Infinity;
        for (const rb of routeBoxes) dmin = Math.min(dmin, rectDist(rb, x0, z0, x1, z1));
        const roll = r();
        const styleRoll = r();
        const hRoll = r();
        if (dmin < 4) continue;
        let h;
        let solid = false;
        if (dmin < 24) {
          // near the course: clearly below the kill height, or clearly a tall solid tower
          if (roll < 0.62 || dmin < 6) h = Math.max(6, kill - 3 - hRoll * 14 - street);
          else {
            h = top + 9 + hRoll * 30 - street;
            solid = true;
          }
        } else {
          h = 10 + Math.pow(hRoll, 1.6) * (top - street + 45);
        }
        const tallish = h > 45;
        const style = theme.key === "construction" && styleRoll < 0.18 ? 6 : tallish ? (styleRoll < 0.55 ? 4 : 2) : styleRoll < 0.4 ? 1 : styleRoll < 0.65 ? 3 : styleRoll < 0.85 ? 2 : 5;
        const color = theme.facades[Math.floor(r() * theme.facades.length)];
        const cx = (x0 + x1) / 2;
        const cz = (z0 + z1) / 2;
        const dcen = Math.max(0, dmin);
        out.push({ x0, z0, x1, z1, y0: street, top: street + h, style, color, solid, d: dcen, cx, cz, seed: r() });
      }
    }
  }
  const near = out.filter((b) => b.d < Q.cityR);
  return near;
}

/** add the near TALL background towers to the collision world (same set at every quality) */
export function addCityCollision(C, level, theme) {
  // plan at "high" so collision never depends on quality
  const all = planCity(level, theme, "high");
  for (const b of all) {
    if (!b.solid) continue;
    addBox(C, { min: [b.x0, b.y0, b.z0], max: [b.x1, b.top, b.z1], kind: "bg", mat: "concrete", noLedge: true, noVault: true });
  }
}

/* ------------------------------------------------------------------ environment build */
export function buildEnvironment(scene, level, theme, quality, opts = {}) {
  const Q = qualityOf(quality);
  const disposables = [];
  const track = (o) => {
    disposables.push(o);
    return o;
  };
  const group = new THREE.Group();
  group.name = "environment";
  scene.add(group);
  const street = level.streetY ?? -30;
  const cx = (level.bounds[0] + level.bounds[2]) / 2;
  const cz = (level.bounds[1] + level.bounds[3]) / 2;

  /* --- sky + fog + lights */
  const sky = new THREE.Mesh(track(new THREE.SphereGeometry(900, 32, 16)), track(skyMaterial(theme)));
  sky.renderOrder = -10;
  sky.frustumCulled = false;
  group.add(sky);
  scene.fog = new THREE.Fog(theme.fog.color, theme.fog.near, theme.fog.far * (quality === "low" ? 0.8 : 1));
  scene.background = new THREE.Color(theme.fog.color);
  const hemi = new THREE.HemisphereLight(theme.hemi.sky, theme.hemi.ground, theme.hemi.intensity);
  group.add(hemi);
  const sun = new THREE.DirectionalLight(theme.sun.color, theme.sun.intensity);
  const sunDir = new THREE.Vector3(...theme.sun.dir).normalize();
  sun.position.copy(sunDir).multiplyScalar(60);
  group.add(sun);
  group.add(sun.target);
  if (Q.shadows && !opts.noShadows) {
    sun.castShadow = true;
    sun.shadow.mapSize.set(Q.shadows, Q.shadows);
    const s = quality === "high" ? 30 : 24;
    sun.shadow.camera.left = -s;
    sun.shadow.camera.right = s;
    sun.shadow.camera.top = s;
    sun.shadow.camera.bottom = -s;
    sun.shadow.camera.near = 1;
    sun.shadow.camera.far = 160;
    sun.shadow.bias = -0.0006;
    sun.shadow.normalBias = 0.04;
    sun.shadow.radius = 3;
  }
  // fill light from the opposite side so shadows are never pitch black
  const fill = new THREE.DirectionalLight(theme.hemi.sky, theme.night ? 0.35 : 0.45);
  fill.position.set(-sunDir.x * 50, 40, -sunDir.z * 50);
  group.add(fill);

  /* --- background buildings (instanced, one material) */
  const bmat = track(buildingMaterial(theme));
  bmat.userData.uniforms.uStreet.value = street;
  const city = planCity(level, theme, quality);
  const ring = [];
  const rr = rng(level.id * 31 + 7);
  const ringR0 = 190;
  for (let i = 0; i < Q.skyline; i++) {
    const a = rr() * Math.PI * 2;
    const d = ringR0 + rr() * 150;
    const w = 14 + rr() * 26;
    const h = 30 + Math.pow(rr(), 1.4) * (theme.key === "skyline" ? 260 : 170);
    const x = cx + Math.cos(a) * d;
    const z = cz + Math.sin(a) * d;
    ring.push({ x0: x - w / 2, z0: z - w / 2, x1: x + w / 2, z1: z + w / 2, y0: street, top: street + h, style: rr() < 0.6 ? 4 : 2, color: theme.facades[Math.floor(rr() * theme.facades.length)], seed: rr() });
  }
  const all = city.concat(ring);
  const unit = track(new THREE.BoxGeometry(1, 1, 1));
  const inst = new THREE.InstancedMesh(unit, bmat, Math.max(1, all.length));
  const styleAttr = new Float32Array(all.length * 4);
  const m4 = new THREE.Matrix4();
  const col = new THREE.Color();
  all.forEach((b, i) => {
    const sx = b.x1 - b.x0;
    const sy = b.top - b.y0;
    const sz = b.z1 - b.z0;
    m4.makeScale(sx, sy, sz).setPosition((b.x0 + b.x1) / 2, (b.y0 + b.top) / 2, (b.z0 + b.z1) / 2);
    inst.setMatrixAt(i, m4);
    col.set(b.color);
    inst.setColorAt(i, col);
    styleAttr[i * 4] = b.style;
    styleAttr[i * 4 + 1] = b.seed;
    styleAttr[i * 4 + 2] = theme.windowsLit * (0.6 + b.seed * 0.8);
    styleAttr[i * 4 + 3] = 0;
  });
  inst.geometry = unit.clone();
  track(inst.geometry);
  inst.geometry.setAttribute("aStyle", new THREE.InstancedBufferAttribute(styleAttr, 4));
  inst.instanceMatrix.needsUpdate = true;
  if (inst.instanceColor) inst.instanceColor.needsUpdate = true;
  inst.receiveShadow = !!Q.shadows;
  inst.castShadow = false;
  inst.frustumCulled = false;
  group.add(inst);

  /* --- rooftop silhouettes on background buildings (tanks, boxes), high detail only */
  if (Q.detail > 0.5) {
    const clutter = [];
    const rc = rng(level.id * 5 + 1);
    for (const b of city) {
      if (b.d > 90 || rc() > Q.detail) continue;
      const n = 1 + Math.floor(rc() * 3);
      for (let k = 0; k < n; k++) {
        const w = 1.2 + rc() * 2.5;
        const h = 0.8 + rc() * 2.4;
        const x = b.x0 + 1.5 + rc() * Math.max(0.1, b.x1 - b.x0 - 3);
        const z = b.z0 + 1.5 + rc() * Math.max(0.1, b.z1 - b.z0 - 3);
        clutter.push([x, b.top + h / 2, z, w, h, w * (0.6 + rc() * 0.8)]);
      }
    }
    if (clutter.length) {
      const cm = track(new THREE.MeshStandardMaterial({ color: theme.roof[0], roughness: 0.9 }));
      const ci = new THREE.InstancedMesh(unit, cm, clutter.length);
      clutter.forEach(([x, y, z, w, h, d], i) => {
        m4.makeScale(w, h, d).setPosition(x, y, z);
        ci.setMatrixAt(i, m4);
      });
      ci.frustumCulled = false;
      group.add(ci);
    }
  }

  /* --- street: asphalt with the block grid's roads + sidewalks (shader, no texture) */
  const streetMat = track(
    new THREE.MeshStandardMaterial({ color: theme.night ? "#1b1d26" : "#4a4b50", roughness: theme.wet ? 0.35 : 0.95 }),
  );
  streetMat.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader.replace("#include <common>", "#include <common>\nvarying vec3 vSP;").replace("#include <begin_vertex>", "#include <begin_vertex>\nvSP = (modelMatrix * vec4(position,1.0)).xyz;");
    sh.fragmentShader = sh.fragmentShader
      .replace("#include <common>", "#include <common>\nvarying vec3 vSP;")
      .replace(
        "#include <color_fragment>",
        `#include <color_fragment>
  vec2 g = mod(vSP.xz, 36.0);
  float road = step(g.x, 10.0) + step(g.y, 10.0);
  float side = (step(g.x, 11.6) - step(g.x, 10.0)) + (step(g.y, 11.6) - step(g.y, 10.0));
  vec3 asphalt = diffuseColor.rgb;
  vec3 walk = asphalt * 1.7 + 0.04;
  vec3 c = mix(walk * 0.9, asphalt, clamp(road, 0.0, 1.0));
  c = mix(c, walk, clamp(side, 0.0, 1.0) * (1.0 - clamp(road, 0.0, 1.0)));
  float dash = step(0.5, fract(vSP.z / 4.0)) * (1.0 - step(0.12, abs(g.x - 5.0))) * step(10.0, g.y);
  float dash2 = step(0.5, fract(vSP.x / 4.0)) * (1.0 - step(0.12, abs(g.y - 5.0))) * step(10.0, g.x);
  c = mix(c, vec3(0.9, 0.82, 0.45), clamp(dash + dash2, 0.0, 1.0) * 0.8);
  diffuseColor.rgb = c;`,
      );
  };
  const streetPlane = new THREE.Mesh(track(new THREE.PlaneGeometry(1800, 1800)), streetMat);
  streetPlane.rotation.x = -Math.PI / 2;
  streetPlane.position.set(cx, street, cz);
  streetPlane.receiveShadow = false;
  group.add(streetPlane);

  /* --- traffic (instanced cars on the road grid) */
  const cars = [];
  const carGeo = track(new THREE.BoxGeometry(1.9, 1.3, 4.3));
  const carMat = track(new THREE.MeshStandardMaterial({ roughness: 0.4, metalness: 0.3 }));
  const nCars = theme.cloudSea ? 0 : Q.cars;
  const carInst = new THREE.InstancedMesh(carGeo, carMat, Math.max(1, nCars));
  const lightMat = track(new THREE.MeshBasicMaterial({ color: theme.night ? "#ffe6b0" : "#fff1d0", fog: true }));
  const lightInst = new THREE.InstancedMesh(track(new THREE.BoxGeometry(1.6, 0.25, 0.1)), lightMat, Math.max(1, nCars * 2));
  const rcar = rng(level.id * 77 + 3);
  const carCols = ["#d9433b", "#f2f2f2", "#2a2d33", "#3e7cc9", "#f2c14e", "#7a8899", "#1fa67a"];
  for (let i = 0; i < nCars; i++) {
    // roads run where (coord mod 36) is in [0, 10]; two lanes, one each way
    const alongX = rcar() < 0.5;
    const k = Math.floor((rcar() - 0.5) * 16);
    const sub = rcar() < 0.5 ? 2.6 : 7.4;
    const across = alongX ? cz : cx;
    const lane = Math.round(across / 36) * 36 + k * 36 + sub;
    const dir = sub > 5 ? 1 : -1;
    cars.push({ alongX, lane, t: (rcar() - 0.5) * 500, v: (7 + rcar() * 6) * dir, base: alongX ? cx : cz });
    col.set(carCols[Math.floor(rcar() * carCols.length)]);
    carInst.setColorAt(i, col);
  }
  if (carInst.instanceColor) carInst.instanceColor.needsUpdate = true;
  carInst.frustumCulled = false;
  lightInst.frustumCulled = false;
  carInst.count = nCars;
  lightInst.count = nCars * 2;
  if (nCars) {
    group.add(carInst);
    group.add(lightInst);
  }

  /* --- clouds */
  const cloudTex = cloudTexture();
  const clouds = [];
  const nClouds = Math.round(theme.clouds.count * Q.clouds);
  const rcl = rng(level.id * 13 + 9);
  for (let i = 0; i < nClouds; i++) {
    const m = track(new THREE.SpriteMaterial({ map: cloudTex, color: rcl() < 0.5 ? theme.clouds.color : theme.clouds.shade, transparent: true, opacity: 0.55 + rcl() * 0.35, depthWrite: false, fog: false }));
    const sp = new THREE.Sprite(m);
    const a = rcl() * Math.PI * 2;
    const d = 120 + rcl() * 380;
    const s = 40 + rcl() * 90;
    sp.scale.set(s, s * 0.45, 1);
    sp.position.set(cx + Math.cos(a) * d, (level.topY ?? 0) + theme.clouds.height + rcl() * 40, cz + Math.sin(a) * d);
    sp.userData.v = 1 + rcl() * 2.5;
    group.add(sp);
    clouds.push(sp);
  }
  /* --- cloud sea (Skyline Core) */
  let sea = null;
  if (theme.cloudSea) {
    const t = cloudTexture();
    const seaTex = t.clone();
    track(seaTex);
    seaTex.wrapS = seaTex.wrapT = THREE.RepeatWrapping;
    seaTex.repeat.set(26, 52);
    seaTex.needsUpdate = true;
    sea = new THREE.Mesh(track(new THREE.PlaneGeometry(2400, 2400)), track(new THREE.MeshBasicMaterial({ map: seaTex, color: theme.clouds.color, transparent: true, opacity: 0.92, depthWrite: false, fog: true })));
    sea.rotation.x = -Math.PI / 2;
    sea.position.set(cx, level.killY - 6, cz);
    group.add(sea);
    const under = new THREE.Mesh(track(new THREE.PlaneGeometry(2400, 2400)), track(new THREE.MeshBasicMaterial({ color: theme.clouds.shade, fog: true })));
    under.rotation.x = -Math.PI / 2;
    under.position.set(cx, level.killY - 9, cz);
    group.add(under);
  }

  /* --- birds (instanced flapping V's) */
  const birdGeo = new THREE.BufferGeometry();
  birdGeo.setAttribute("position", new THREE.BufferAttribute(new Float32Array([0, 0, 0.2, -0.55, 0.12, -0.1, 0, 0, -0.15, 0, 0, 0.2, 0, 0, -0.15, 0.55, 0.12, -0.1]), 3));
  birdGeo.computeVertexNormals();
  track(birdGeo);
  const birdMat = track(new THREE.MeshBasicMaterial({ color: theme.night ? "#cfd6ff" : "#2b2a30", side: THREE.DoubleSide, fog: true }));
  const flocks = [];
  const rb = rng(level.id * 3 + 5);
  const nFlock = theme.night ? 1 : Q.birds;
  let nb = 0;
  for (let f = 0; f < nFlock; f++) {
    const n = 5 + Math.floor(rb() * 6);
    flocks.push({ n, start: nb, r: 60 + rb() * 120, h: (level.topY ?? 0) + 18 + rb() * 30, ph: rb() * 6, sp: (0.05 + rb() * 0.05) * (rb() < 0.5 ? 1 : -1), off: Array.from({ length: n }, () => [rb() * 6 - 3, rb() * 2, rb() * 6 - 3, rb() * 6]) });
    nb += n;
  }
  const birds = new THREE.InstancedMesh(birdGeo, birdMat, Math.max(1, nb));
  birds.count = nb;
  birds.frustumCulled = false;
  if (nb) group.add(birds);

  /* --- district dressing */
  const extras = [];
  const rx = rng(level.id * 41 + 2);
  if (theme.key === "downtown" || theme.key === "construction" || theme.key === "skyline") {
    const nCr = theme.key === "construction" ? 5 : 2;
    for (let i = 0; i < nCr; i++) {
      const a = rx() * Math.PI * 2;
      const d = 70 + rx() * 90;
      const crane = buildCrane(theme, street, (level.topY ?? 0) + 30 + rx() * 30, track);
      crane.position.set(cx + Math.cos(a) * d, 0, cz + Math.sin(a) * d);
      crane.userData.spin = (rx() - 0.5) * 0.08;
      crane.rotation.y = rx() * 6;
      group.add(crane);
      extras.push(crane);
    }
  }
  if (theme.neon) {
    // neon signs on near background faces (emissive planes)
    const signs = city.filter((b) => b.d < 60 && b.top > (level.topY ?? 0) - 25).slice(0, Math.round(16 * Q.detail + 4));
    signs.forEach((b, i) => {
      const color = theme.neon[i % theme.neon.length];
      const tex = neonTexture(i, color);
      const m = track(new THREE.MeshBasicMaterial({ map: tex, transparent: true, fog: true }));
      const sg = new THREE.Mesh(track(new THREE.PlaneGeometry(6, 2.25)), m);
      const face = i % 4;
      const y = Math.min(b.top - 3, (level.topY ?? 0) - 4 - (i % 3) * 5);
      if (face === 0) sg.position.set(b.x1 + 0.05, y, (b.z0 + b.z1) / 2), (sg.rotation.y = Math.PI / 2);
      else if (face === 1) sg.position.set(b.x0 - 0.05, y, (b.z0 + b.z1) / 2), (sg.rotation.y = -Math.PI / 2);
      else if (face === 2) sg.position.set((b.x0 + b.x1) / 2, y, b.z1 + 0.05);
      else sg.position.set((b.x0 + b.x1) / 2, y, b.z0 - 0.05), (sg.rotation.y = Math.PI);
      sg.userData.flicker = rx();
      group.add(sg);
      extras.push(sg);
    });
  }

  /* --- runtime */
  const tmpM = new THREE.Matrix4();
  const tmpQ = new THREE.Quaternion();
  const tmpS = new THREE.Vector3(1, 1, 1);
  const tmpP = new THREE.Vector3();
  const eul = new THREE.Euler();
  let time = 0;
  function update(dt, focus) {
    time += dt;
    sky.material.uniforms.uTime.value = time;
    // keep the sky + sun centred on the player
    sky.position.set(focus.x, focus.y, focus.z);
    sun.position.set(focus.x + sunDir.x * 60, focus.y + sunDir.y * 60, focus.z + sunDir.z * 60);
    sun.target.position.set(focus.x, focus.y, focus.z);
    fill.position.set(focus.x - sunDir.x * 50, focus.y + 40, focus.z - sunDir.z * 50);
    fill.target.position.set(focus.x, focus.y, focus.z);
    // traffic
    for (let i = 0; i < cars.length; i++) {
      const c = cars[i];
      c.t += c.v * dt;
      if (c.t > 420) c.t -= 840;
      if (c.t < -420) c.t += 840;
      const x = c.alongX ? c.base + c.t : c.lane;
      const z = c.alongX ? c.lane : c.base + c.t;
      eul.set(0, c.alongX ? (c.v > 0 ? Math.PI / 2 : -Math.PI / 2) : c.v > 0 ? 0 : Math.PI, 0);
      tmpQ.setFromEuler(eul);
      tmpP.set(x, street + 0.65, z);
      tmpM.compose(tmpP, tmpQ, tmpS);
      carInst.setMatrixAt(i, tmpM);
      // head + tail lights
      const fx = c.alongX ? Math.sign(c.v) : 0;
      const fz = c.alongX ? 0 : Math.sign(c.v);
      tmpP.set(x + fx * 2.16, street + 0.75, z + fz * 2.16);
      tmpM.compose(tmpP, tmpQ, tmpS);
      lightInst.setMatrixAt(i * 2, tmpM);
      tmpP.set(x - fx * 2.16, street + 0.8, z - fz * 2.16);
      tmpM.compose(tmpP, tmpQ, tmpS);
      lightInst.setMatrixAt(i * 2 + 1, tmpM);
    }
    if (cars.length) {
      carInst.instanceMatrix.needsUpdate = true;
      lightInst.instanceMatrix.needsUpdate = true;
    }
    // clouds drift
    for (const c of clouds) {
      c.position.x += c.userData.v * dt;
      if (c.position.x > cx + 520) c.position.x -= 1040;
    }
    if (sea) sea.material.map.offset.x += dt * 0.004;
    // birds
    let k = 0;
    for (const f of flocks) {
      const a = time * f.sp + f.ph;
      const bx = cx + Math.cos(a) * f.r;
      const bz = cz + Math.sin(a) * f.r;
      const heading = Math.atan2(-Math.sin(a) * Math.sign(f.sp), Math.cos(a) * Math.sign(f.sp));
      for (let i = 0; i < f.n; i++) {
        const o = f.off[i];
        const flap = 0.4 + Math.abs(Math.sin(time * 7 + o[3])) * 1.1;
        eul.set(0, heading, 0);
        tmpQ.setFromEuler(eul);
        tmpP.set(bx + o[0], f.h + o[1] + Math.sin(time * 1.3 + o[3]) * 0.6, bz + o[2]);
        tmpS.set(1.6, flap * 1.6, 1.6);
        tmpM.compose(tmpP, tmpQ, tmpS);
        birds.setMatrixAt(k++, tmpM);
      }
    }
    tmpS.set(1, 1, 1);
    if (k) birds.instanceMatrix.needsUpdate = true;
    for (const e of extras) {
      if (e.userData.spin) e.children[1] && (e.children[1].rotation.y += e.userData.spin * dt);
      if (e.userData.flicker != null) e.material.opacity = 0.85 + 0.15 * Math.sin(time * (3 + e.userData.flicker * 4) + e.userData.flicker * 10) * (e.userData.flicker > 0.85 ? 1 : 0.3);
    }
  }

  function dispose() {
    scene.remove(group);
    scene.fog = null;
    for (const d of disposables) if (d && d.dispose) d.dispose();
    carInst.dispose();
    lightInst.dispose();
    birds.dispose();
    inst.dispose();
  }

  return { group, sun, hemi, update, dispose, buildingMaterial: bmat };
}

/* ------------------------------------------------------------------ tower crane */
/** One crane = TWO draw calls: a merged static mast and a merged slewing top (vertex colours). */
function buildCrane(theme, street, height, track) {
  const g = new THREE.Group();
  const steelC = new THREE.Color(theme.key === "construction" ? "#f2b632" : "#e2a72e");
  const col = (geo, c) => {
    const n = geo.attributes.position.count;
    const arr = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      arr[i * 3] = c.r;
      arr[i * 3 + 1] = c.g;
      arr[i * 3 + 2] = c.b;
    }
    geo.setAttribute("color", new THREE.BufferAttribute(arr, 3));
    return geo;
  };
  const piece = (geo, c, x, y, z, rx = 0, ry = 0, rz = 0) => {
    const q = geo.index ? geo.toNonIndexed() : geo;
    if (q !== geo) geo.dispose();
    q.applyMatrix4(new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), new THREE.Vector3(1, 1, 1)));
    if (q.attributes.uv) q.deleteAttribute("uv");
    return col(q, c);
  };
  const mastH = height - street;
  const mastParts = [];
  for (const [x, z] of [[-0.9, -0.9], [0.9, -0.9], [-0.9, 0.9], [0.9, 0.9]]) mastParts.push(piece(new THREE.BoxGeometry(0.22, mastH, 0.22), steelC, x, street + mastH / 2, z));
  for (let y = street + 3; y < height; y += 3.5) {
    for (const r of [0, Math.PI / 2]) for (const s of [-0.9, 0.9]) mastParts.push(piece(new THREE.BoxGeometry(2.0, 0.12, 0.12), steelC, r ? s : 0, y, r ? 0 : s, 0, r, 0.6));
  }
  const mat = track(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7, metalness: 0.2 }));
  const mastGeo = track(mergeGeometries(mastParts, false));
  for (const p of mastParts) p.dispose();
  g.add(new THREE.Mesh(mastGeo, mat));
  const grey = new THREE.Color("#6b6f75");
  const white = new THREE.Color("#d8d8d2");
  const dark = new THREE.Color("#222222");
  const red = new THREE.Color("#c0392b");
  const topParts = [
    piece(new THREE.BoxGeometry(1.2, 1.2, 46), steelC, 0, 0.6, 16),
    piece(new THREE.BoxGeometry(1.2, 1.0, 12), steelC, 0, 0.6, -8),
    piece(new THREE.BoxGeometry(2.4, 2.2, 3), grey, 0, -0.6, -12),
    piece(new THREE.BoxGeometry(2, 2, 2), white, 1.4, -0.4, 1),
    piece(new THREE.CylinderGeometry(0.1, 0.6, 6, 4), steelC, 0, 4, 0),
    piece(new THREE.CylinderGeometry(0.03, 0.03, 18, 4), dark, 0, -9, 30),
    piece(new THREE.BoxGeometry(0.8, 0.8, 0.8), red, 0, -18, 30),
    piece(new THREE.SphereGeometry(0.25, 8, 6), red, 0, 1.4, 38),
  ];
  const topGeo = track(mergeGeometries(topParts, false));
  for (const p of topParts) p.dispose();
  const top = new THREE.Mesh(topGeo, mat);
  top.position.y = height;
  g.add(top);
  return g;
}

export { glowTexture };
