/**
 * Police Escape 3D — particles (one Points draw call) and rain.
 *
 *   Particles  impact sparks, smoke from disabled police cars, tyre smoke on
 *              handbrake slides, the nitro trail, pickup / checkpoint bursts.
 *              World-size points with a pixel cap and a near-camera fade, so
 *              nothing balloons over the screen.
 *   Rain       streaks falling around the camera (Rain City), additive lines
 * Counts scale with Graphics Quality; Reduced Motion thins them out.
 */
import { useEffect, useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { softDot } from "./textures.js";
import { PSTATE } from "../engine/police.js";

export function Particles({ run, bus, quality, reduced }) {
  const MAX = quality === "low" ? 500 : quality === "high" ? 1800 : 1100;
  const sys = useMemo(() => {
    const pos = new Float32Array(MAX * 3);
    const col = new Float32Array(MAX * 4);
    for (let i = 0; i < MAX; i++) pos[i * 3 + 1] = -1e5;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    geo.setAttribute("color", new THREE.BufferAttribute(col, 4));
    const mat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      uniforms: { map: { value: softDot() }, size: { value: 0.5 }, scale: { value: 600 }, maxPx: { value: 26 } },
      vertexShader: `
        attribute vec4 color; varying vec4 vColor; uniform float size; uniform float scale; uniform float maxPx;
        void main() {
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          float d = -mv.z;
          vColor = vec4(color.rgb, color.a * smoothstep(1.2, 4.0, d));
          gl_PointSize = min(maxPx, size * scale / max(d, 0.1));
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: `
        uniform sampler2D map; varying vec4 vColor;
        void main() {
          vec4 t = texture2D(map, gl_PointCoord);
          gl_FragColor = vec4(vColor.rgb, vColor.a * t.a);
          if (gl_FragColor.a < 0.01) discard;
          #include <colorspace_fragment>
        }`,
    });
    const pts = new THREE.Points(geo, mat);
    pts.frustumCulled = false;
    return { geo, mat, pts, pos, col, vel: new Float32Array(MAX * 3), life: new Float32Array(MAX), max: new Float32Array(MAX), base: new Float32Array(MAX * 3), grav: new Float32Array(MAX), next: 0 };
  }, [MAX]);
  useEffect(
    () => () => {
      sys.geo.dispose();
      sys.mat.dispose();
    },
    [sys],
  );
  const tmp = useMemo(() => new THREE.Color(), []);
  const size = useThree((s) => s.size);
  const emit = (x, y, z, vx, vy, vz, color, life, grav = 6) => {
    const i = sys.next;
    sys.next = (sys.next + 1) % MAX;
    sys.pos[i * 3] = x;
    sys.pos[i * 3 + 1] = y;
    sys.pos[i * 3 + 2] = z;
    sys.vel[i * 3] = vx;
    sys.vel[i * 3 + 1] = vy;
    sys.vel[i * 3 + 2] = vz;
    tmp.set(color);
    sys.base[i * 3] = tmp.r;
    sys.base[i * 3 + 1] = tmp.g;
    sys.base[i * 3 + 2] = tmp.b;
    sys.life[i] = life;
    sys.max[i] = life;
    sys.grav[i] = grav;
  };
  const acc = useRef(0);
  useFrame((_, dtRaw) => {
    const dt = Math.min(dtRaw, 0.05);
    sys.mat.uniforms.scale.value = size.height * 0.9;
    const thin = reduced ? 0.4 : 1;
    if (bus.current.length) {
      for (const b of bus.current) {
        const n = Math.round(b.n * thin);
        for (let k = 0; k < n; k++) {
          const a = Math.random() * Math.PI * 2;
          const sp = b.speed * (0.4 + Math.random() * 0.8);
          emit(b.x + (Math.random() - 0.5) * (b.spread ?? 0.6), (b.y ?? 0.8) + Math.random() * 0.4, b.z + (Math.random() - 0.5) * (b.spread ?? 0.6), Math.cos(a) * sp, (b.up ?? 2) * (0.5 + Math.random()), Math.sin(a) * sp, b.color, (b.life ?? 0.6) * (0.7 + Math.random() * 0.5), b.grav ?? 9);
        }
      }
      bus.current.length = 0;
    }
    acc.current += dt;
    if (acc.current > 1 / 40 && !run.paused) {
      acc.current = 0;
      const c = run.player;
      const fx = Math.sin(c.h);
      const fz = Math.cos(c.h);
      const bx = c.x - fx * 2.4;
      const bz = c.z - fz * 2.4;
      if (c.nitroOn) for (let k = 0; k < Math.round(3 * thin); k++) emit(bx + (Math.random() - 0.5) * 0.5, 0.45, bz + (Math.random() - 0.5) * 0.5, -fx * 6 + (Math.random() - 0.5), Math.random() * 0.5, -fz * 6 + (Math.random() - 0.5), Math.random() < 0.6 ? "#5ab8ff" : "#d8f0ff", 0.3, 0);
      if (Math.abs(c.fwd) > 7 && (c.handbrake || Math.abs(c.slip) > 3.5)) {
        const lx = fz;
        const lz = -fx;
        for (const s of [-1, 1]) emit(bx + lx * s * 0.9, 0.3, bz + lz * s * 0.9, (Math.random() - 0.5) * 1.2, 0.8 + Math.random(), (Math.random() - 0.5) * 1.2, "#c8ccd4", 1.1, -0.6);
      }
      for (const cop of run.police) {
        if (cop.state !== PSTATE.DISABLED) continue;
        emit(cop.car.x + Math.sin(cop.car.h) * 1.8, 1.1, cop.car.z + Math.cos(cop.car.h) * 1.8, (Math.random() - 0.5) * 0.6, 1.6 + Math.random(), (Math.random() - 0.5) * 0.6, "#55585e", 1.6, -0.8);
      }
    }
    const { pos, vel, life, col, base, max, grav } = sys;
    for (let i = 0; i < MAX; i++) {
      if (life[i] <= 0) {
        if (col[i * 4 + 3] !== 0) {
          col[i * 4 + 3] = 0;
          pos[i * 3 + 1] = -1e5;
        }
        continue;
      }
      life[i] -= dt;
      const f = Math.max(0, life[i] / max[i]);
      vel[i * 3 + 1] -= grav[i] * dt;
      vel[i * 3] *= 1 - dt * 1.2;
      vel[i * 3 + 2] *= 1 - dt * 1.2;
      pos[i * 3] += vel[i * 3] * dt;
      pos[i * 3 + 1] = Math.max(0.05, pos[i * 3 + 1] + vel[i * 3 + 1] * dt);
      pos[i * 3 + 2] += vel[i * 3 + 2] * dt;
      col[i * 4] = base[i * 3];
      col[i * 4 + 1] = base[i * 3 + 1];
      col[i * 4 + 2] = base[i * 3 + 2];
      col[i * 4 + 3] = Math.min(1, f * 1.6) * 0.75;
    }
    sys.geo.attributes.position.needsUpdate = true;
    sys.geo.attributes.color.needsUpdate = true;
  });
  return <primitive object={sys.pts} />;
}

/** Rain streaks around the camera. */
export function Rain({ quality, reduced }) {
  const { camera } = useThree();
  const N = Math.round((quality === "low" ? 900 : quality === "high" ? 3200 : 2000) * (reduced ? 0.4 : 1));
  const sys = useMemo(() => {
    const pos = new Float32Array(N * 6);
    const seed = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) {
      seed[i * 3] = (Math.random() - 0.5) * 70;
      seed[i * 3 + 1] = Math.random() * 30;
      seed[i * 3 + 2] = (Math.random() - 0.5) * 70;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    const mat = new THREE.LineBasicMaterial({ color: "#a8c8e8", transparent: true, opacity: 0.35, depthWrite: false });
    const lines = new THREE.LineSegments(geo, mat);
    lines.frustumCulled = false;
    return { geo, mat, lines, pos, seed, t: 0 };
  }, [N]);
  useEffect(
    () => () => {
      sys.geo.dispose();
      sys.mat.dispose();
    },
    [sys],
  );
  useFrame((_, dt) => {
    sys.t += Math.min(dt, 0.05);
    const { pos, seed } = sys;
    const cx = camera.position.x;
    const cy = camera.position.y;
    const cz = camera.position.z;
    for (let i = 0; i < N; i++) {
      const y = ((seed[i * 3 + 1] - sys.t * 28) % 30 + 30) % 30;
      const x = cx + seed[i * 3];
      const z = cz + seed[i * 3 + 2];
      const yy = cy - 12 + y;
      pos[i * 6] = x;
      pos[i * 6 + 1] = yy;
      pos[i * 6 + 2] = z;
      pos[i * 6 + 3] = x + 0.08;
      pos[i * 6 + 4] = yy - 1.1;
      pos[i * 6 + 5] = z + 0.08;
    }
    sys.geo.attributes.position.needsUpdate = true;
  });
  return <primitive object={sys.lines} />;
}
