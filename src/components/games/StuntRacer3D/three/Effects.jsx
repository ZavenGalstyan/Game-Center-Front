/**
 * Stunt Racer 3D — particles (one Points draw call): landing dust, wall /
 * obstacle sparks, star and nitro bursts, boost-pad sparkle, tyre smoke on
 * handbrake slides, and the nitro trail. Counts scale with Graphics Quality;
 * Reduced Motion thins them out.
 */
import { useEffect, useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { softDot } from "./textures.js";

export function Particles({ run, bus, quality, reduced }) {
  const MAX = quality === "low" ? 500 : quality === "high" ? 1800 : 1100;
  const sys = useMemo(() => {
    const pos = new Float32Array(MAX * 3);
    const col = new Float32Array(MAX * 4);
    for (let i = 0; i < MAX; i++) pos[i * 3 + 1] = -1e5;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    geo.setAttribute("color", new THREE.BufferAttribute(col, 4));
    // world-size points with a pixel cap and a fade right in front of the
    // camera, so a burst never balloons into screen-filling blobs
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
  const size = useThree((st) => st.size);
  useFrame((_, dtRaw) => {
    const dt = Math.min(dtRaw, 0.05);
    const thin = reduced ? 0.4 : 1;
    sys.mat.uniforms.scale.value = size.height * 0.9;
    if (bus.current.length) {
      for (const b of bus.current) {
        const n = Math.round(b.n * thin);
        for (let k = 0; k < n; k++) {
          const a = Math.random() * Math.PI * 2;
          const sp = b.speed * (0.4 + Math.random() * 0.8);
          emit(
            b.x + (Math.random() - 0.5) * (b.spread ?? 0.8),
            b.y + Math.random() * 0.4,
            b.z + (Math.random() - 0.5) * (b.spread ?? 0.8),
            Math.cos(a) * sp + (b.vx || 0),
            (b.up ?? 1.5) * (0.5 + Math.random()),
            Math.sin(a) * sp + (b.vz || 0),
            b.color,
            (b.life ?? 0.8) * (0.7 + Math.random() * 0.5),
            b.grav ?? 6,
          );
        }
      }
      bus.current.length = 0;
    }
    // continuous emitters
    acc.current += dt;
    if (acc.current > 1 / 45 && !run.paused) {
      acc.current = 0;
      const c = run.car;
      const back = { x: c.x - c.F.x * 2.3, y: c.y - c.F.y * 2.3 + 0.35, z: c.z - c.F.z * 2.3 };
      if (c.nitroOn) {
        for (let k = 0; k < Math.round(3 * thin); k++) emit(back.x + (Math.random() - 0.5) * 0.6, back.y, back.z + (Math.random() - 0.5) * 0.6, -c.F.x * 6 + (Math.random() - 0.5), Math.random() * 0.6, -c.F.z * 6 + (Math.random() - 0.5), Math.random() < 0.5 ? "#7fe0ff" : "#ffb04a", 0.35, 0);
      }
      if (c.mode === "ground" && Math.abs(c.fwd) > 7 && (c.handbrake || Math.abs(c.slip) > 3)) {
        for (const sx of [-1, 1]) {
          const lx = c.U.y * c.F.z - c.U.z * c.F.y;
          const lz = c.U.x * c.F.y - c.U.y * c.F.x;
          emit(back.x + lx * sx * 0.9, c.y + 0.2, back.z + lz * sx * 0.9, (Math.random() - 0.5) * 1.5, 0.8 + Math.random(), (Math.random() - 0.5) * 1.5, "#d9dce2", 0.9, -0.5);
        }
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
      pos[i * 3 + 1] += vel[i * 3 + 1] * dt;
      pos[i * 3 + 2] += vel[i * 3 + 2] * dt;
      col[i * 4] = base[i * 3];
      col[i * 4 + 1] = base[i * 3 + 1];
      col[i * 4 + 2] = base[i * 3 + 2];
      col[i * 4 + 3] = Math.min(1, f * 1.6) * 0.7;
    }
    sys.geo.attributes.position.needsUpdate = true;
    sys.geo.attributes.color.needsUpdate = true;
  });
  return <primitive object={sys.pts} />;
}
