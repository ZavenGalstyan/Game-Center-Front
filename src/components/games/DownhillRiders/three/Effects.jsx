/**
 * Downhill Riders — particles and weather (one Points draw call each).
 *
 *   Particles  trail dust / snow spray / mud behind every rider on the
 *              ground (more with speed), plus bursts from the event bus:
 *              landings, crashes, orb pickups, trick landings, boost
 *   Weather    per region, around the camera: snowfall (Snow Ridge), drifting
 *              dust (Rocky Canyon), mist banks (Alpine Heights), golden
 *              embers at sunset (Extreme Summit), sun shafts + pollen
 *              (Green Forest)
 * Counts scale with Graphics Quality; Reduced Motion thins them out.
 */
import { useEffect, useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { softDot } from "./textures.js";

const SURF_COL = { dirt: "#a4835e", dust: "#e2b98a", rock: "#b8ab98", snow: "#ffffff", ice: "#e8f6ff", wood: "#b08a5a", grass: "#8aa060", mud: "#5a4028", roots: "#8a6a48" };

function pointsMaterial(size, additive = false) {
  return new THREE.PointsMaterial({
    size,
    map: softDot(),
    vertexColors: true,
    transparent: true,
    depthWrite: false,
    sizeAttenuation: true,
    blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
  });
}

export function Particles({ race, bus, quality, reduced }) {
  const MAX = quality === "low" ? 500 : quality === "high" ? 1800 : 1100;
  const sys = useMemo(() => {
    const pos = new Float32Array(MAX * 3);
    const col = new Float32Array(MAX * 4);
    for (let i = 0; i < MAX; i++) pos[i * 3 + 1] = -1e5;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    geo.setAttribute("color", new THREE.BufferAttribute(col, 4));
    const mat = pointsMaterial(0.6);
    const pts = new THREE.Points(geo, mat);
    pts.frustumCulled = false;
    return { geo, mat, pts, pos, col, vel: new Float32Array(MAX * 3), life: new Float32Array(MAX), max: new Float32Array(MAX), base: new Float32Array(MAX * 3), next: 0 };
  }, [MAX]);
  useEffect(() => () => {
    sys.geo.dispose();
    sys.mat.dispose();
  }, [sys]);
  const tmp = useMemo(() => new THREE.Color(), []);
  const emit = (x, y, z, vx, vy, vz, color, life) => {
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
  };
  const acc = useRef(0);
  useFrame((_, dtRaw) => {
    const dt = Math.min(dtRaw, 0.05);
    const thin = reduced ? 0.4 : 1;
    // bursts
    if (bus.current.length) {
      for (const b of bus.current) {
        const n = Math.round(b.n * thin);
        for (let k = 0; k < n; k++) {
          const a = Math.random() * Math.PI * 2;
          const sp = b.speed * (0.4 + Math.random() * 0.8);
          emit(b.x + (Math.random() - 0.5) * 0.6, b.y + 0.2 + Math.random() * 0.3, b.z + (Math.random() - 0.5) * 0.6, Math.cos(a) * sp, (b.up ?? 1.5) * (0.5 + Math.random()), Math.sin(a) * sp, b.color, b.life ?? 0.9);
        }
      }
      bus.current.length = 0;
    }
    // trail dust behind riders on the ground
    acc.current += dt;
    if (acc.current > 1 / 40) {
      acc.current = 0;
      for (const r of race.racers) {
        const B = r.bike;
        if (B.air || B.crash || B.vF < 5 || !B.gnd) continue;
        const surf = B.gnd.surf;
        const col = SURF_COL[surf] || SURF_COL.dirt;
        const n = (B.vF > 14 ? 2 : 1) * (surf === "snow" || surf === "mud" || B.braking ? 2 : 1);
        for (let k = 0; k < Math.round(n * thin); k++) {
          const bx = B.x - Math.sin(B.h) * 0.65;
          const bz = B.z - Math.cos(B.h) * 0.65;
          emit(bx + (Math.random() - 0.5) * 0.3, B.y + 0.1, bz + (Math.random() - 0.5) * 0.3, -Math.sin(B.h) * B.vF * 0.12 + (Math.random() - 0.5) * 1.5, 0.6 + Math.random() * 1.2, -Math.cos(B.h) * B.vF * 0.12 + (Math.random() - 0.5) * 1.5, col, 0.7 + Math.random() * 0.5);
        }
        if (B.boostT > 0 && Math.random() < 0.5) emit(B.x - Math.sin(B.h) * 1.6, B.y + 0.25, B.z - Math.cos(B.h) * 1.6, -Math.sin(B.h) * 2, 0.4, -Math.cos(B.h) * 2, "#9fe8ff", 0.25);
      }
    }
    // integrate + fade
    const { pos, vel, life, col, base, max } = sys;
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
      vel[i * 3 + 1] -= 2.2 * dt;
      vel[i * 3] *= 1 - dt * 1.5;
      vel[i * 3 + 2] *= 1 - dt * 1.5;
      pos[i * 3] += vel[i * 3] * dt;
      pos[i * 3 + 1] += vel[i * 3 + 1] * dt;
      pos[i * 3 + 2] += vel[i * 3 + 2] * dt;
      col[i * 4] = base[i * 3];
      col[i * 4 + 1] = base[i * 3 + 1];
      col[i * 4 + 2] = base[i * 3 + 2];
      col[i * 4 + 3] = Math.min(1, f * 1.6) * 0.55;
    }
    sys.geo.attributes.position.needsUpdate = true;
    sys.geo.attributes.color.needsUpdate = true;
  });
  return <primitive object={sys.pts} />;
}

/** Weather around the camera, per region. */
export function Weather({ region, quality, reduced }) {
  const { camera } = useThree();
  const kind = region.weather || (region.theme === "forest" ? "pollen" : null);
  const N = kind ? Math.round((quality === "low" ? 300 : quality === "high" ? 1400 : 800) * (reduced ? 0.4 : 1) * (kind === "mist" ? 0.08 : 1)) : 0;
  const sys = useMemo(() => {
    if (!N) return null;
    const pos = new Float32Array(N * 3);
    const col = new Float32Array(N * 4);
    const c = new THREE.Color(kind === "snow" ? "#ffffff" : kind === "dust" ? "#f2d2a8" : kind === "mist" ? "#ffffff" : kind === "embers" ? "#ffb35a" : "#fff6c8");
    for (let i = 0; i < N; i++) {
      pos[i * 3] = (Math.random() - 0.5) * 80;
      pos[i * 3 + 1] = Math.random() * 30 - 5;
      pos[i * 3 + 2] = (Math.random() - 0.5) * 80;
      col[i * 4] = c.r;
      col[i * 4 + 1] = c.g;
      col[i * 4 + 2] = c.b;
      col[i * 4 + 3] = kind === "mist" ? 0.3 : kind === "pollen" ? 0.55 : kind === "dust" ? 0.5 : 0.9;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    geo.setAttribute("color", new THREE.BufferAttribute(col, 4));
    const mat = pointsMaterial(kind === "snow" ? 0.35 : kind === "mist" ? 16 : kind === "dust" ? 0.25 : 0.18, kind === "embers" || kind === "pollen");
    const pts = new THREE.Points(geo, mat);
    pts.frustumCulled = false;
    return { geo, mat, pts, pos };
  }, [N, kind]);
  useEffect(() => () => {
    if (sys) {
      sys.geo.dispose();
      sys.mat.dispose();
    }
  }, [sys]);
  const t = useRef(0);
  useFrame((_, dtRaw) => {
    if (!sys) return;
    const dt = Math.min(dtRaw, 0.05);
    t.current += dt;
    const p = sys.pos;
    const cx = camera.position.x;
    const cy = camera.position.y;
    const cz = camera.position.z;
    for (let i = 0; i < N; i++) {
      let x = p[i * 3];
      let y = p[i * 3 + 1];
      let z = p[i * 3 + 2];
      if (kind === "snow") {
        y -= dt * (2.2 + (i % 5) * 0.3);
        x += Math.sin(t.current * 0.8 + i) * dt * 0.8;
      } else if (kind === "embers") {
        y += dt * (0.6 + (i % 4) * 0.2);
        x += Math.sin(t.current + i) * dt * 0.6;
      } else if (kind === "mist") {
        x += dt * 0.8;
      } else {
        x += Math.sin(t.current * 0.5 + i) * dt * 0.7 + dt * 0.6;
        y += Math.cos(t.current * 0.7 + i * 1.3) * dt * 0.25;
      }
      // wrap around the camera (a 80 m box)
      const lo = kind === "mist" ? -8 : -6;
      if (y < cy + lo) y += 32;
      if (y > cy + 26) y -= 32;
      if (x < cx - 40) x += 80;
      if (x > cx + 40) x -= 80;
      if (z < cz - 40) z += 80;
      if (z > cz + 40) z -= 80;
      p[i * 3] = x;
      p[i * 3 + 1] = kind === "mist" ? Math.min(y, cy + 2) : y;
      p[i * 3 + 2] = z;
    }
    sys.geo.attributes.position.needsUpdate = true;
  });
  return sys ? <primitive object={sys.pts} /> : null;
}

/** Soft slanted light shafts near the camera (forest / alpine mornings). */
export function SunShafts({ region, reduced }) {
  const { camera } = useThree();
  const show = (region.theme === "forest" || region.theme === "alpine") && !reduced;
  const grp = useMemo(() => {
    if (!show) return null;
    const g = new THREE.Group();
    const tex = makeShaftTex();
    const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: 0.16, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false, color: region.sky.sun });
    const geo = new THREE.PlaneGeometry(6, 34);
    for (let k = 0; k < 7; k++) {
      const m = new THREE.Mesh(geo, mat);
      m.userData.off = [(Math.random() - 0.5) * 70, 6 + Math.random() * 6, (Math.random() - 0.5) * 70];
      m.rotation.set(0, Math.random() * 3, 0.55);
      g.add(m);
    }
    g.userData = { geo, mat, tex };
    return g;
  }, [show, region]);
  useEffect(() => () => {
    if (grp) {
      grp.userData.geo.dispose();
      grp.userData.mat.dispose();
      grp.userData.tex.dispose();
    }
  }, [grp]);
  useFrame(() => {
    if (!grp) return;
    for (const m of grp.children) {
      const [ox, oy, oz] = m.userData.off;
      // re-anchor shafts that fall too far behind the camera
      let x = m.position.x;
      let z = m.position.z;
      if (!m.userData.init || Math.hypot(x - camera.position.x, z - camera.position.z) > 55) {
        x = camera.position.x + ox;
        z = camera.position.z + oz;
        m.userData.init = true;
      }
      m.position.set(x, camera.position.y + oy, z);
    }
  });
  return grp ? <primitive object={grp} /> : null;
}

function makeShaftTex() {
  const c = document.createElement("canvas");
  c.width = 64;
  c.height = 256;
  const g = c.getContext("2d");
  const gr = g.createLinearGradient(0, 0, 64, 0);
  gr.addColorStop(0, "rgba(255,255,255,0)");
  gr.addColorStop(0.5, "rgba(255,255,255,1)");
  gr.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = gr;
  g.fillRect(0, 0, 64, 256);
  const fade = g.createLinearGradient(0, 0, 0, 256);
  fade.addColorStop(0, "rgba(0,0,0,0)");
  fade.addColorStop(0.3, "rgba(0,0,0,0)");
  fade.addColorStop(1, "rgba(0,0,0,1)");
  g.globalCompositeOperation = "destination-out";
  g.fillStyle = fade;
  g.fillRect(0, 0, 64, 256);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
