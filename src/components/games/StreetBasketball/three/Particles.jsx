/**
 * Street Basketball — one pooled particle cloud (a single THREE.Points draw
 * call) for net sparkles, dunk dust/sparks, landing puffs, block bursts and
 * win confetti. `api.current.burst(kind, pos)` is called from game events;
 * the Particles setting disables it and Low graphics halves every burst.
 * Purely visual — never touches gameplay.
 */
import { useImperativeHandle, useMemo, useRef, forwardRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";

const MAX = 420;

const VERT = `
attribute float aSize;
attribute float aAlpha;
attribute vec3 aColor;
varying float vAlpha;
varying vec3 vColor;
void main() {
  vAlpha = aAlpha;
  vColor = aColor;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = aSize * (320.0 / -mv.z);
  gl_Position = projectionMatrix * mv;
}`;
const FRAG = `
varying float vAlpha;
varying vec3 vColor;
void main() {
  vec2 d = gl_PointCoord - 0.5;
  float r = length(d);
  if (r > 0.5) discard;
  float a = smoothstep(0.5, 0.15, r) * vAlpha;
  gl_FragColor = vec4(vColor, a);
}`;

const Particles = forwardRef(function Particles({ enabled = true, quality = "medium" }, ref) {
  const pool = useMemo(() => ({
    pos: new Float32Array(MAX * 3),
    vel: new Float32Array(MAX * 3),
    life: new Float32Array(MAX),
    maxLife: new Float32Array(MAX),
    size: new Float32Array(MAX),
    alpha: new Float32Array(MAX),
    color: new Float32Array(MAX * 3),
    grav: new Float32Array(MAX),
    drag: new Float32Array(MAX),
    next: 0,
  }), []);
  const geo = useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(pool.pos, 3));
    g.setAttribute("aSize", new THREE.BufferAttribute(pool.size, 1));
    g.setAttribute("aAlpha", new THREE.BufferAttribute(pool.alpha, 1));
    g.setAttribute("aColor", new THREE.BufferAttribute(pool.color, 3));
    g.setDrawRange(0, MAX);
    return g;
  }, [pool]);
  const mat = useMemo(() => new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: FRAG, transparent: true, depthWrite: false }), []);
  const col = useMemo(() => new THREE.Color(), []);
  const live = useRef(0);

  function spawn(x, y, z, vx, vy, vz, life, size, color, grav = 9.8, drag = 0.5) {
    const i = pool.next;
    pool.next = (pool.next + 1) % MAX;
    pool.pos[i * 3] = x;
    pool.pos[i * 3 + 1] = y;
    pool.pos[i * 3 + 2] = z;
    pool.vel[i * 3] = vx;
    pool.vel[i * 3 + 1] = vy;
    pool.vel[i * 3 + 2] = vz;
    pool.life[i] = life;
    pool.maxLife[i] = life;
    pool.size[i] = size;
    col.set(color);
    pool.color[i * 3] = col.r;
    pool.color[i * 3 + 1] = col.g;
    pool.color[i * 3 + 2] = col.b;
    pool.grav[i] = grav;
    pool.drag[i] = drag;
    live.current = 1.5;
  }

  useImperativeHandle(ref, () => ({
    burst(kind, p = { x: 0, y: 0, z: 0 }) {
      if (!enabled) return;
      const k = quality === "low" ? 0.5 : quality === "high" ? 1.3 : 1;
      const n = (c) => Math.max(1, Math.round(c * k));
      const R = Math.random;
      if (kind === "net") {
        for (let i = 0; i < n(18); i++) {
          const a = R() * Math.PI * 2;
          spawn(Math.cos(a) * 0.2, p.y, Math.sin(a) * 0.2, Math.cos(a) * (0.6 + R()), -0.4 - R() * 1.2, Math.sin(a) * (0.6 + R()), 0.5 + R() * 0.3, 0.06, "#ffffff", 4, 1.5);
        }
      } else if (kind === "slam") {
        for (let i = 0; i < n(26); i++) {
          const a = R() * Math.PI * 2;
          const s = 1.5 + R() * 2.5;
          spawn(p.x, p.y, p.z, Math.cos(a) * s, R() * 2.2, Math.sin(a) * s, 0.45 + R() * 0.3, 0.07, R() < 0.5 ? "#ffd166" : "#ffffff", 9, 1.2);
        }
      } else if (kind === "dust") {
        for (let i = 0; i < n(14); i++) {
          const a = R() * Math.PI * 2;
          const s = 0.5 + R() * 1.2;
          spawn(p.x + Math.cos(a) * 0.15, 0.05, p.z + Math.sin(a) * 0.15, Math.cos(a) * s, 0.3 + R() * 0.6, Math.sin(a) * s, 0.6 + R() * 0.4, 0.22 + R() * 0.15, "#b9ab96", 0.6, 2.5);
        }
      } else if (kind === "block") {
        for (let i = 0; i < n(20); i++) {
          const a = R() * Math.PI * 2;
          const b = (R() - 0.5) * Math.PI;
          const s = 2 + R() * 2;
          spawn(p.x, p.y, p.z, Math.cos(a) * Math.cos(b) * s, Math.sin(b) * s, Math.sin(a) * Math.cos(b) * s, 0.3 + R() * 0.2, 0.08, "#ffffff", 3, 2);
        }
      } else if (kind === "perfect") {
        for (let i = 0; i < n(12); i++) {
          const a = R() * Math.PI * 2;
          spawn(p.x, p.y, p.z, Math.cos(a) * 0.8, 0.4 + R() * 0.8, Math.sin(a) * 0.8, 0.45, 0.07, "#39e37a", 1.5, 2);
        }
      } else if (kind === "confetti") {
        const cols = ["#ff7a1a", "#f5c542", "#39e37a", "#4f8dff", "#ff3cf0", "#ffffff"];
        for (let i = 0; i < n(160); i++) {
          spawn(p.x + (R() - 0.5) * 8, 5 + R() * 3, p.z + (R() - 0.5) * 6, (R() - 0.5) * 1.5, -R() * 0.5, (R() - 0.5) * 1.5, 2.5 + R() * 1.5, 0.1, cols[Math.floor(R() * cols.length)], 1.2, 1.4);
        }
      }
    },
  }), [enabled, quality]); // eslint-disable-line react-hooks/exhaustive-deps

  useFrame((_, dtRaw) => {
    if (live.current <= 0) return;
    const dt = Math.min(dtRaw, 0.05);
    let any = false;
    for (let i = 0; i < MAX; i++) {
      if (pool.life[i] <= 0) {
        pool.alpha[i] = 0;
        continue;
      }
      any = true;
      pool.life[i] -= dt;
      const kd = Math.exp(-pool.drag[i] * dt);
      pool.vel[i * 3] *= kd;
      pool.vel[i * 3 + 1] = pool.vel[i * 3 + 1] * kd - pool.grav[i] * dt;
      pool.vel[i * 3 + 2] *= kd;
      pool.pos[i * 3] += pool.vel[i * 3] * dt;
      pool.pos[i * 3 + 1] = Math.max(0.02, pool.pos[i * 3 + 1] + pool.vel[i * 3 + 1] * dt);
      pool.pos[i * 3 + 2] += pool.vel[i * 3 + 2] * dt;
      pool.alpha[i] = Math.max(0, Math.min(1, pool.life[i] / (pool.maxLife[i] * 0.5)));
    }
    geo.attributes.position.needsUpdate = true;
    geo.attributes.aAlpha.needsUpdate = true;
    geo.attributes.aSize.needsUpdate = true;
    geo.attributes.aColor.needsUpdate = true;
    if (!any) live.current -= dt;
  });

  return <points geometry={geo} material={mat} frustumCulled={false} renderOrder={5} />;
});

export default Particles;
