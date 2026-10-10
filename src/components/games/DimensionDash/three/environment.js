/**
 * Dimension Dash — sky, light, fog and far scenery per world.
 *
 *   sky dome      gradient shader (top / mid / horizon) + sun glow
 *   lights        hemisphere + a warm sun with a soft shadow box that
 *                 follows the player (one cascade, sized for 2.5D + 3D)
 *   backdrop      green: rolling hills + lake; desert: mesas + dunes;
 *                 ocean: open sea + islands; neon: skyline with lit windows;
 *                 final: floating rocks + portal rings under a nebula
 *   clouds        instanced puffs drifting slowly
 */
import * as THREE from "three";

const SKY_VS = `varying vec3 vW; void main(){ vec4 w = modelMatrix * vec4(position,1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`;
const SKY_FS = `uniform vec3 top; uniform vec3 mid; uniform vec3 hor; uniform vec3 sunDir; uniform vec3 sunCol; uniform vec3 camPos;
varying vec3 vW;
void main(){
  vec3 d = normalize(vW - camPos);
  float h = d.y;
  vec3 c = h > 0.0 ? mix(mid, top, smoothstep(0.0, 0.55, h)) : mix(mid, hor, smoothstep(0.0, -0.25, h));
  c = mix(hor, c, smoothstep(-0.02, 0.18, h) * 0.85 + 0.15);
  float s = max(0.0, dot(d, sunDir));
  c += sunCol * (pow(s, 600.0) * 1.5 + pow(s, 12.0) * 0.25);
  gl_FragColor = vec4(c, 1.0);
}`;

function windowsTexture() {
  const c = document.createElement("canvas");
  c.width = 64;
  c.height = 128;
  const g = c.getContext("2d");
  g.fillStyle = "#14183a";
  g.fillRect(0, 0, 64, 128);
  for (let y = 4; y < 128; y += 8) {
    for (let x = 4; x < 64; x += 8) {
      if (Math.random() < 0.45) {
        g.fillStyle = Math.random() < 0.5 ? "#ffd27a" : Math.random() < 0.5 ? "#7af0ff" : "#ff7ae0";
        g.fillRect(x, y, 4, 4);
      }
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

export function createEnvironment(scene, world, L, { shadows, quality }) {
  const disposables = [];
  const own = (x) => (disposables.push(x), x);
  const group = new THREE.Group();
  group.name = "environment";
  scene.add(group);
  const sky = world.sky;
  const key = world.key;

  scene.background = new THREE.Color(sky.horizon);
  const fogFar = key === "neon" ? 420 : key === "final" ? 460 : 560;
  scene.fog = new THREE.Fog(sky.fog, 120, fogFar);

  /* sky dome */
  const sunDir = new THREE.Vector3(key === "neon" ? -0.3 : 0.45, key === "final" ? 0.18 : key === "neon" ? 0.3 : 0.62, 0.35).normalize();
  const skyMat = own(
    new THREE.ShaderMaterial({
      vertexShader: SKY_VS,
      fragmentShader: SKY_FS,
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      uniforms: {
        top: { value: new THREE.Color(sky.top) },
        mid: { value: new THREE.Color(sky.mid) },
        hor: { value: new THREE.Color(sky.horizon) },
        sunDir: { value: sunDir },
        sunCol: { value: new THREE.Color(sky.sun) },
        camPos: { value: new THREE.Vector3() },
      },
    }),
  );
  const dome = new THREE.Mesh(own(new THREE.SphereGeometry(900, 32, 16)), skyMat);
  dome.renderOrder = -10;
  dome.frustumCulled = false;
  group.add(dome);

  /* lights */
  const hemi = new THREE.HemisphereLight(key === "neon" ? "#8a7aff" : "#dff3ff", key === "desert" ? "#c7955a" : key === "neon" ? "#2a1650" : "#5a7a4a", key === "neon" ? 0.95 : 1.05);
  group.add(hemi);
  const sun = new THREE.DirectionalLight(sky.sun, key === "neon" ? 1.2 : key === "final" ? 1.6 : 2.4);
  sun.position.copy(sunDir).multiplyScalar(80);
  sun.castShadow = shadows;
  if (shadows) {
    const s = quality === "high" ? 2048 : 1024;
    sun.shadow.mapSize.set(s, s);
    const d = 34;
    sun.shadow.camera.left = -d;
    sun.shadow.camera.right = d;
    sun.shadow.camera.top = d;
    sun.shadow.camera.bottom = -d;
    sun.shadow.camera.near = 1;
    sun.shadow.camera.far = 220;
    sun.shadow.bias = -0.0006;
    sun.shadow.normalBias = 0.04;
    sun.shadow.radius = 3;
  }
  group.add(sun);
  group.add(sun.target);
  // a soft fill from the opposite side keeps faces readable (never too dark)
  const fill = new THREE.DirectionalLight(key === "neon" ? "#ff6fd8" : "#bfe4ff", key === "neon" ? 0.7 : 0.45);
  fill.position.set(-sunDir.x * 60, 30, -sunDir.z * 60);
  group.add(fill);
  const amb = new THREE.AmbientLight("#ffffff", key === "neon" || key === "final" ? 0.32 : 0.18);
  group.add(amb);

  /* far scenery around the level bounds */
  const b = L.bounds;
  const cx = b.cx;
  const cz = b.cz;
  const R = Math.max(220, b.r + 140);
  const floorY = (Number.isFinite(L.lowY) ? L.lowY : 0) - 46;
  const rnd = (() => {
    let s = 1337 + L.meta.id * 31;
    return () => {
      s = (s * 16807) % 2147483647;
      return (s - 1) / 2147483646;
    };
  })();

  const lit = (color, o = {}) => own(new THREE.MeshStandardMaterial({ color, roughness: 0.95, flatShading: true, ...o }));
  let water = null;
  if (key === "green" || key === "ocean" || key === "desert") {
    const wm = own(
      new THREE.MeshStandardMaterial({
        color: key === "desert" ? "#e2b46a" : key === "ocean" ? "#1aa6e8" : "#2f9be8",
        roughness: key === "desert" ? 1 : 0.18,
        metalness: key === "desert" ? 0 : 0.2,
      }),
    );
    water = new THREE.Mesh(own(new THREE.PlaneGeometry(R * 3.4, R * 3.4, 1, 1)), wm);
    water.rotation.x = -Math.PI / 2;
    water.position.set(cx, floorY, cz);
    water.receiveShadow = false;
    group.add(water);
  }
  if (key === "green" || key === "desert" || key === "ocean") {
    // ring of hills / mesas / islands
    const n = 26;
    const geo = own(key === "desert" ? new THREE.CylinderGeometry(1, 1.25, 1, 7) : new THREE.ConeGeometry(1, 1, 9));
    const mat = lit(key === "desert" ? "#c98a4b" : key === "ocean" ? "#3fa85a" : "#3fbf5a");
    const mat2 = lit(key === "desert" ? "#b06d38" : "#2e9a49");
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + rnd() * 0.2;
      const rr = R * (1.3 + rnd() * 0.6);
      const h = key === "desert" ? 30 + rnd() * 40 : 40 + rnd() * 60;
      const w = 50 + rnd() * 60;
      const m = new THREE.Mesh(geo, i % 2 ? mat : mat2);
      m.scale.set(w, h, w * (0.8 + rnd() * 0.4));
      m.position.set(cx + Math.cos(a) * rr, floorY + h / 2 - 4, cz + Math.sin(a) * rr);
      m.rotation.y = rnd() * 6;
      group.add(m);
    }
    // closer valley islands below the course (gives depth when looking down)
    const isl = own(new THREE.CylinderGeometry(1, 0.6, 1, 10));
    const top = lit(key === "desert" ? "#e8c27a" : "#4fd14a");
    for (let i = 0; i < 18; i++) {
      const a = rnd() * Math.PI * 2;
      const rr = rnd() * b.r * 0.9 + 30;
      const w = 10 + rnd() * 22;
      const m = new THREE.Mesh(isl, top);
      m.scale.set(w, 6 + rnd() * 10, w);
      m.position.set(cx + Math.cos(a) * rr, floorY + 2, cz + Math.sin(a) * rr);
      group.add(m);
    }
  }
  if (key === "neon") {
    const tex = own(windowsTexture());
    const mat = own(new THREE.MeshStandardMaterial({ color: "#ffffff", map: tex, emissive: "#ffffff", emissiveMap: tex, emissiveIntensity: 0.9, roughness: 0.6 }));
    const geo = own(new THREE.BoxGeometry(1, 1, 1));
    const n = 90;
    const im = new THREE.InstancedMesh(geo, mat, n);
    const m = new THREE.Matrix4();
    for (let i = 0; i < n; i++) {
      const a = rnd() * Math.PI * 2;
      const rr = R * (1.05 + rnd() * 0.6);
      const h = 50 + rnd() * 120;
      const w = 14 + rnd() * 20;
      m.compose(new THREE.Vector3(cx + Math.cos(a) * rr, floorY + h / 2, cz + Math.sin(a) * rr), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, rnd() * 3, 0)), new THREE.Vector3(w, h, w));
      im.setMatrixAt(i, m);
    }
    im.instanceMatrix.needsUpdate = true;
    group.add(im);
    const ground = new THREE.Mesh(own(new THREE.PlaneGeometry(R * 3.4, R * 3.4)), lit("#0c0a24", { emissive: "#140a30" }));
    ground.rotation.x = -Math.PI / 2;
    ground.position.set(cx, floorY, cz);
    group.add(ground);
  }
  const floaters = [];
  if (key === "final") {
    const geo = own(new THREE.DodecahedronGeometry(1, 0));
    const mat = lit("#5d4f94");
    const top = lit("#7d6fd0");
    for (let i = 0; i < 40; i++) {
      const a = rnd() * Math.PI * 2;
      const rr = R * (0.3 + rnd() * 0.9);
      const s = 6 + rnd() * 18;
      const m = new THREE.Mesh(geo, i % 3 ? mat : top);
      m.scale.set(s, s * 0.7, s);
      m.position.set(cx + Math.cos(a) * rr, floorY + 20 + rnd() * 90, cz + Math.sin(a) * rr);
      m.rotation.set(rnd(), rnd() * 6, rnd());
      group.add(m);
      floaters.push({ m, y: m.position.y, ph: rnd() * 6 });
    }
    const ringGeo = own(new THREE.TorusGeometry(30, 1.4, 8, 48));
    const ringMat = own(new THREE.MeshBasicMaterial({ color: "#7dfff0", transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
    for (let i = 0; i < 3; i++) {
      const r = new THREE.Mesh(ringGeo, ringMat);
      r.position.set(cx + (i - 1) * 160, floorY + 120 + i * 20, cz - R * 0.8);
      r.scale.setScalar(1 + i * 0.4);
      group.add(r);
      floaters.push({ m: r, spin: 0.2 + i * 0.1 });
    }
  }

  /* clouds */
  const clouds = [];
  if (key !== "neon") {
    const cgeo = own(new THREE.SphereGeometry(1, 10, 8));
    const cmat = own(new THREE.MeshStandardMaterial({ color: key === "final" ? "#c9a6ff" : "#ffffff", roughness: 1, transparent: true, opacity: key === "final" ? 0.5 : 0.92, flatShading: true }));
    const n = quality === "low" ? 10 : 22;
    for (let i = 0; i < n; i++) {
      const c = new THREE.Group();
      const k = 3 + Math.floor(rnd() * 3);
      for (let j = 0; j < k; j++) {
        const p = new THREE.Mesh(cgeo, cmat);
        const s = 6 + rnd() * 8;
        p.scale.set(s * 1.4, s * 0.7, s);
        p.position.set(j * 8 - k * 4, rnd() * 3, rnd() * 5);
        c.add(p);
      }
      const a = rnd() * Math.PI * 2;
      const rr = R * (0.2 + rnd() * 0.8);
      c.position.set(cx + Math.cos(a) * rr, (Number.isFinite(L.lowY) ? L.lowY : 0) + 40 + rnd() * 50, cz + Math.sin(a) * rr);
      group.add(c);
      clouds.push(c);
    }
  }

  let t = 0;
  function update(dt, camera, focus) {
    t += dt;
    skyMat.uniforms.camPos.value.copy(camera.position);
    dome.position.copy(camera.position);
    // shadow box follows the player
    if (focus) {
      sun.target.position.set(focus.x, focus.y, focus.z);
      sun.position.set(focus.x + sunDir.x * 80, focus.y + sunDir.y * 80, focus.z + sunDir.z * 80);
    }
    for (const c of clouds) c.position.x += dt * 1.2;
    for (const f of floaters) {
      if (f.spin) f.m.rotation.z += dt * f.spin;
      else f.m.position.y = f.y + Math.sin(t * 0.4 + f.ph) * 3;
    }
  }
  function dispose() {
    scene.remove(group);
    scene.fog = null;
    for (const d of disposables) d.dispose && d.dispose();
  }
  return { group, update, dispose, sun };
}
