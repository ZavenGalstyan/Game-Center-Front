/**
 * Helix Drop — lightweight world backdrop: gradient sky, linear fog (depth
 * haze down the tower), a far silhouette band, a few cloud sprites that
 * recycle as the camera descends, and drifting motes / snow. Nothing here is
 * gameplay; `calm` (reduced motion) slows drift and parallax.
 */
import { useEffect, useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { skyTexture, cloudTexture, silhouetteTexture, radialTexture } from "./textures.js";

const CLOUD_TINT = {
  sky: "rgba(255,255,255,0.95)",
  sunset: "rgba(255,210,190,0.9)",
  frozen: "rgba(245,250,255,0.9)",
  abyss: "rgba(120,110,140,0.55)",
  neon: "rgba(90,60,170,0.45)",
};

export default function Environment({ engine, world, quality, reducedMotion }) {
  const { scene } = useThree();
  const clouds = useRef([]);
  const sil = useRef();
  const motes = useRef();
  const nClouds = quality === "low" ? 5 : quality === "high" ? 12 : 8;
  const nMotes = quality === "low" ? 60 : quality === "high" ? 260 : 150;

  useEffect(() => {
    scene.background = skyTexture(world.sky[0], world.sky[1]);
    scene.fog = new THREE.Fog(world.fog[0], 16, world.key === "abyss" || world.key === "neon" ? 46 : 60);
    return () => {
      scene.fog = null;
    };
  }, [scene, world]);

  const cloudTex = useMemo(() => cloudTexture(CLOUD_TINT[world.key]), [world.key]);
  const silTex = useMemo(() => silhouetteTexture(world.key, world.far), [world.key, world.far]);
  const moteTex = useMemo(() => radialTexture("mote", "rgba(255,255,255,1)", "rgba(255,255,255,0)"), []);
  const seeds = useMemo(
    () =>
      Array.from({ length: 12 }, (_, i) => ({
        a: (i / 12) * Math.PI * 2 + i * 0.7,
        r: 16 + ((i * 37) % 13),
        dy: ((i * 53) % 40) - 20,
        s: 7 + ((i * 29) % 7),
        sp: 0.02 + ((i * 17) % 10) * 0.004,
      })),
    []
  );
  const moteGeo = useMemo(() => {
    const g = new THREE.BufferGeometry();
    const p = new Float32Array(nMotes * 3);
    for (let i = 0; i < nMotes; i++) {
      p[i * 3] = (Math.random() - 0.5) * 26;
      p[i * 3 + 1] = (Math.random() - 0.5) * 30;
      p[i * 3 + 2] = (Math.random() - 0.5) * 20 - 2;
    }
    g.setAttribute("position", new THREE.BufferAttribute(p, 3));
    return g;
  }, [nMotes]);

  useFrame((_, dt) => {
    const y = engine.camY;
    const t = engine.time * (reducedMotion ? 0.3 : 1);
    seeds.slice(0, nClouds).forEach((c, i) => {
      const m = clouds.current[i];
      if (!m) return;
      const a = c.a + t * c.sp;
      // clouds wrap vertically around the camera so the descent never runs out of sky
      let cy = ((c.dy - y * 0.35) % 40 + 40) % 40 - 20;
      m.position.set(Math.cos(a) * c.r, y + cy, -Math.abs(Math.sin(a)) * c.r - 6);
      m.scale.set(c.s * 2, c.s, 1);
    });
    if (sil.current) sil.current.position.y = y * (reducedMotion ? 0.95 : 0.88) - 4;
    if (motes.current) {
      const p = moteGeo.attributes.position.array;
      const fall = world.key === "frozen" ? 1.6 : 0.25;
      for (let i = 0; i < nMotes; i++) {
        p[i * 3 + 1] -= fall * dt * (reducedMotion ? 0.3 : 1);
        p[i * 3] += Math.sin(t * 0.7 + i) * dt * 0.2;
        if (p[i * 3 + 1] < -15) p[i * 3 + 1] += 30;
      }
      moteGeo.attributes.position.needsUpdate = true;
      motes.current.position.y = y;
    }
  });

  const moteColor = world.key === "neon" ? "#4df0ff" : world.key === "abyss" ? "#ffd27a" : world.key === "sunset" ? "#ffe0b0" : "#ffffff";
  return (
    <>
      <mesh ref={sil} position={[0, 0, -58]} scale={[150, 38, 1]}>
        <planeGeometry args={[1, 1]} />
        <meshBasicMaterial map={silTex} transparent fog={false} depthWrite={false} opacity={0.85} />
      </mesh>
      {Array.from({ length: nClouds }, (_, i) => (
        <sprite key={`${world.key}${i}`} ref={(el) => (clouds.current[i] = el)}>
          <spriteMaterial map={cloudTex} transparent depthWrite={false} fog={false} opacity={0.9} />
        </sprite>
      ))}
      <points ref={motes} geometry={moteGeo} frustumCulled={false}>
        <pointsMaterial map={moteTex} color={moteColor} size={world.key === "frozen" ? 0.18 : 0.1} transparent depthWrite={false} opacity={0.7} blending={THREE.AdditiveBlending} />
      </points>
    </>
  );
}
