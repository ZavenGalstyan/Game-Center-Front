/**
 * Island Conquest — transport boats and their wakes.
 *
 * A boat is three geometries so the whole navy is three instanced draw calls:
 *   body   hull, gunwale, deck, mast, yard, rudder, oars and a crew of tiny
 *          soldiers (vertex coloured, identical for every faction)
 *   sail   bellied square sail — white vertex colour × a light faction tint
 *   trim   masthead pennant + round shields along both sides — white × the
 *          full faction colour
 * Local frame: +Z is forward, the waterline is y = 0, length ≈ 0.7.
 *
 * The wake is an instanced quad with a small shader (two foam arms in a V
 * plus churned water at the stern) whose strength fades in on launch and
 * out on landing through a per-instance attribute.
 */
import * as THREE from "three";
import { T, paint, merge, box, cyl, sph } from "./geo.js";

let cache = null;

function hull() {
  const g = new THREE.BoxGeometry(0.26, 0.13, 0.7, 2, 2, 6);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    let x = p.getX(i);
    const y = p.getY(i);
    const z = p.getZ(i);
    const bow = Math.max(0, (z - 0.12) / 0.23); // 0 mid-ship → 1 at the bow
    const stern = Math.max(0, (-z - 0.22) / 0.13);
    x *= 1 - bow * bow * 0.92 - stern * 0.25;
    if (y < 0) x *= 0.55; // V-shaped bottom
    p.setXYZ(i, x, y + bow * bow * 0.05 + (y > 0 ? stern * 0.03 : 0), z);
  }
  g.computeVertexNormals();
  return g;
}

export function boatGeometries() {
  if (cache) return cache;
  const body = [];
  body.push(paint(T(hull(), 0, 0.04, 0), "#8a5a34", 0.12, 3));
  body.push(paint(T(box(0.24, 0.025, 0.46), 0, 0.105, -0.02), "#c99a62", 0.08, 4)); // deck
  body.push(paint(T(box(0.27, 0.03, 0.03), 0, 0.12, 0.18), "#6e4426")); // thwarts
  body.push(paint(T(box(0.27, 0.03, 0.03), 0, 0.12, -0.16), "#6e4426"));
  body.push(paint(T(cyl(0.014, 0.018, 0.62, 6), 0, 0.42, 0.02), "#5b3b22")); // mast
  body.push(paint(T(cyl(0.01, 0.01, 0.4, 5), 0, 0.62, 0.04, 0, 0, Math.PI / 2), "#5b3b22")); // yard
  body.push(paint(T(box(0.02, 0.12, 0.08), 0, 0.03, -0.37), "#5b3b22")); // rudder
  for (const s of [-1, 1])
    for (const z of [0.12, -0.08]) body.push(paint(T(box(0.24, 0.012, 0.025), s * 0.2, 0.08, z, 0, s * 0.35, s * 0.35), "#7a5030"));
  // crew: three tiny soldiers with helmets and spears
  for (const [x, z] of [[-0.05, 0.16], [0.05, -0.1], [-0.04, -0.24]]) {
    body.push(paint(T(cyl(0.03, 0.036, 0.09, 6), x, 0.16, z), "#3d4a5c", 0.1, 5));
    body.push(paint(T(sph(0.026, 6, 5), x, 0.225, z), "#e8b48a"));
    body.push(paint(T(new THREE.SphereGeometry(0.03, 6, 4, 0, Math.PI * 2, 0, Math.PI / 2), x, 0.232, z), "#9aa3ad"));
    body.push(paint(T(cyl(0.005, 0.005, 0.2, 4), x + 0.035, 0.22, z), "#6b5440"));
  }
  const sail = new THREE.PlaneGeometry(0.38, 0.34, 6, 4);
  const sp = sail.attributes.position;
  for (let i = 0; i < sp.count; i++) {
    const x = sp.getX(i);
    const y = sp.getY(i);
    sp.setZ(i, Math.cos((x / 0.38) * Math.PI) * 0.05 * (1 - Math.abs(y / 0.34)) + 0.05);
  }
  sail.computeVertexNormals();
  const sailG = merge([paint(T(sail, 0, 0.44, 0.045), "#ffffff", 0.05, 2)]);
  const trim = [];
  const pen = new THREE.BufferGeometry();
  pen.setAttribute("position", new THREE.Float32BufferAttribute([0, 0.76, 0.02, 0, 0.7, 0.02, 0, 0.73, -0.16], 3));
  pen.computeVertexNormals();
  trim.push(paint(pen, "#ffffff"));
  const pen2 = pen.clone();
  T(pen2, 0, 0, 0, 0, Math.PI, 0);
  T(pen2, 0, 0, 0.04);
  trim.push(paint(pen2, "#ffffff"));
  for (const s of [-1, 1])
    for (const z of [0.1, -0.05, -0.2]) trim.push(paint(T(cyl(0.04, 0.04, 0.012, 8), s * 0.13, 0.1, z, 0, 0, Math.PI / 2), "#ffffff"));
  cache = { body: merge(body), sail: sailG, trim: merge(trim) };
  return cache;
}

/* ---------------------------------------------------------------- wake */
export function createWakeMaterial() {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    uniforms: { uTime: { value: 0 }, uFoam: { value: new THREE.Color("#ffffff") } },
    vertexShader: /* glsl */ `
      attribute float aStr;
      varying vec2 vUv;
      varying float vStr;
      void main() {
        vUv = uv;
        vStr = aStr;
        gl_Position = projectionMatrix * viewMatrix * modelMatrix * instanceMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      uniform vec3 uFoam;
      varying vec2 vUv;
      varying float vStr;
      float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
      void main() {
        // vUv.y: 1 at the bow, 0 far behind; vUv.x: across
        float back = 1.0 - vUv.y;
        float x = (vUv.x - 0.5) * 2.0;
        float spread = 0.12 + back * 0.85;
        float arm = smoothstep(0.16, 0.0, abs(abs(x) - spread)) * (1.0 - back);
        float churn = smoothstep(0.35, 0.0, abs(x)) * smoothstep(0.55, 0.0, back) * (0.5 + 0.5 * hash(floor(vUv * vec2(10.0, 22.0)) + floor(uTime * 8.0)));
        float a = (arm * 0.75 + churn * 0.55) * smoothstep(0.0, 0.08, vUv.y) * vStr;
        if (a < 0.01) discard;
        gl_FragColor = vec4(uFoam, a * 0.8);
        #include <colorspace_fragment>
      }
    `,
  });
}
