/**
 * Downhill Riders — sky dome (vertical gradient + sun glow), sun disc,
 * clouds and two rings of distant mountain silhouettes. All of it follows
 * the camera horizontally and ignores fog, with aerial perspective baked
 * into the colours, so the far peaks stay visible over the haze.
 */
import { useEffect, useMemo } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { ridged, mulberry32 } from "../engine/rng.js";
import { cloudTex, softDot } from "./textures.js";

export function sunDir(sky) {
  return new THREE.Vector3(Math.cos(sky.sunElev) * Math.sin(sky.sunAz), Math.sin(sky.sunElev), Math.cos(sky.sunElev) * Math.cos(sky.sunAz)).normalize();
}

export default function Sky({ region, seed = 1 }) {
  const { camera } = useThree();
  const sky = region.sky;
  const built = useMemo(() => {
    const g = new THREE.Group();
    const dir = sunDir(sky);
    const domeGeo = new THREE.SphereGeometry(2200, 32, 16);
    const domeMat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      uniforms: {
        top: { value: new THREE.Color(sky.top) },
        horizon: { value: new THREE.Color(sky.horizon) },
        sun: { value: new THREE.Color(sky.sun) },
        sunDir: { value: dir },
      },
      vertexShader: "varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }",
      fragmentShader: `
        uniform vec3 top; uniform vec3 horizon; uniform vec3 sun; uniform vec3 sunDir; varying vec3 vDir;
        void main() {
          float h = max(vDir.y, 0.0);
          vec3 c = mix(horizon, top, pow(h, 0.55));
          float s = max(dot(normalize(vDir), sunDir), 0.0);
          c += sun * (pow(s, 12.0) * 0.35 + pow(s, 400.0) * 1.2);
          if (vDir.y < 0.0) c = horizon;
          gl_FragColor = vec4(c, 1.0);
          #include <colorspace_fragment>
        }`,
    });
    const dome = new THREE.Mesh(domeGeo, domeMat);
    dome.renderOrder = -10;
    g.add(dome);
    // sun disc
    const sunMat = new THREE.SpriteMaterial({ map: softDot(), color: sky.sun, transparent: true, depthWrite: false, fog: false, blending: THREE.AdditiveBlending });
    const sunSp = new THREE.Sprite(sunMat);
    sunSp.position.copy(dir).multiplyScalar(1900);
    sunSp.scale.setScalar(260);
    g.add(sunSp);
    // clouds
    const cloudMat = new THREE.SpriteMaterial({ map: cloudTex(), color: region.theme === "summit" ? "#ffd0b0" : "#ffffff", transparent: true, opacity: 0.85, depthWrite: false, fog: false });
    const rand = mulberry32(seed * 13 + 1);
    for (let k = 0; k < 16; k++) {
      const a = rand() * Math.PI * 2;
      const r = 1100 + rand() * 600;
      const sp = new THREE.Sprite(cloudMat);
      sp.position.set(Math.sin(a) * r, 260 + rand() * 260, Math.cos(a) * r);
      sp.scale.set(420 + rand() * 300, 160 + rand() * 90, 1);
      g.add(sp);
    }
    // distant mountains (two rings, nearer = darker, aerial perspective baked in)
    const rings = [];
    const hz = new THREE.Color(sky.horizon);
    const tmp = new THREE.Color();
    [
      [1650, 520, 0.55, region.mountains[1]],
      [1250, 380, 0.35, region.mountains[0]],
    ].forEach(([R, Hm, haze, col], ri) => {
      const seg = 160;
      const pos = [];
      const colr = [];
      const idx = [];
      const c = new THREE.Color(col).lerp(hz, haze);
      const snow = new THREE.Color("#f4f7fb").lerp(hz, haze * 0.7);
      for (let i = 0; i <= seg; i++) {
        const a = (i / seg) * Math.PI * 2;
        const n = ridged(Math.cos(a) * 3 + ri * 10, Math.sin(a) * 3, seed + ri * 7, 5);
        const h = 40 + n * Hm;
        const x = Math.sin(a) * R;
        const z = Math.cos(a) * R;
        // base sits at the haze line; only true peaks get a soft cap (a white
        // tip on a tall strip reads as a light column, not a snowcap)
        pos.push(x, -60, z, x, h, z);
        colr.push(c.r, c.g, c.b);
        const cap = region.theme === "canyon" ? 0 : Math.max(0, (n - 0.7) / 0.3) * 0.6;
        tmp.copy(c).lerp(snow, cap);
        colr.push(tmp.r, tmp.g, tmp.b);
        if (i > 0) {
          const b = (i - 1) * 2;
          idx.push(b, b + 2, b + 1, b + 1, b + 2, b + 3);
        }
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
      geo.setAttribute("color", new THREE.Float32BufferAttribute(colr, 3));
      geo.setIndex(idx);
      const mat = new THREE.MeshBasicMaterial({ vertexColors: true, fog: false, side: THREE.DoubleSide, depthWrite: false });
      const m = new THREE.Mesh(geo, mat);
      m.renderOrder = -9 + ri;
      rings.push(m);
      g.add(m);
    });
    return { g, dispose: () => g.traverse((o) => { o.geometry?.dispose?.(); o.material?.dispose?.(); }) };
  }, [sky, region, seed]);
  useEffect(() => () => built.dispose(), [built]);
  useFrame(() => {
    built.g.position.set(camera.position.x, camera.position.y * 0.6, camera.position.z);
  });
  return <primitive object={built.g} />;
}
